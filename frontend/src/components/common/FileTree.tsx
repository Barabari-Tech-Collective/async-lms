import { useState } from 'react';
import {
  File,
  Folder,
  FolderOpen,
  Plus,
  FolderPlus,
  RefreshCw,
  ChevronRight,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';

export type FileNode = {
  name: string;
  path: string;
  type: 'file' | 'folder';
  children?: FileNode[];
};

type Props = {
  nodes: FileNode[];
  activePath: string | null;
  onSelect: (path: string) => void;
  onCreate: (path: string, type: 'file' | 'folder') => void;
  onDelete: (path: string) => void;
  onRename: (oldPath: string, newPath: string) => void;
  onRefresh: () => void;
  isDark?: boolean;
};

/* =============================
   VS Code–style sorting
============================= */
const sortNodes = (nodes: FileNode[]) => {
  return [...nodes].sort((a, b) => {
    if (a.type !== b.type) {
      return a.type === 'folder' ? -1 : 1;
    }
    return a.name.localeCompare(b.name, undefined, {
      sensitivity: 'base',
    });
  });
};

export default function FileTreeExplorer({
  nodes,
  activePath,
  onSelect,
  onCreate,
  onDelete,
  onRename,
  onRefresh,
  isDark = true,
}: Props) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [renaming, setRenaming] = useState<string | null>(null);
  const [creating, setCreating] = useState<{
    parent: string;
    type: 'file' | 'folder';
  } | null>(null);

  const toggleFolder = (path: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(path) ? next.delete(path) : next.add(path);
      return next;
    });
  };

  const startCreate = (parent: string, type: 'file' | 'folder') => {
    setCreating({ parent, type });
    if (parent) {
      setExpanded((prev) => new Set(prev).add(parent));
    }
  };

  const confirmCreate = (name: string) => {
    if (!creating || !name.trim()) return;
    const fullPath = creating.parent ? `${creating.parent}/${name}` : name;
    onCreate(fullPath, creating.type);
    setCreating(null);
  };

  const confirmRename = (oldPath: string, newName: string) => {
    if (!newName.trim()) return;
    const base = oldPath.split('/').slice(0, -1).join('/');
    const newPath = base ? `${base}/${newName}` : newName;
    onRename(oldPath, newPath);
    setRenaming(null);
  };

  return (
    <div className={`text-sm h-full flex flex-col ${isDark ? 'text-slate-350' : 'text-slate-700'}`}>
      {/* Header */}
      <div className={`flex items-center justify-between px-2 py-1 border-b ${isDark ? 'border-slate-800' : 'border-slate-200'}`}>
        <span className={`text-xs tracking-widest ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>EXPLORER</span>
        <div className='flex gap-1'>
          <Button
            size='icon'
            variant='ghost'
            onClick={() => startCreate('', 'file')}
            className={`h-7 w-7 ${isDark ? 'text-slate-400 hover:text-white hover:bg-slate-800' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200'}`}
          >
            <Plus size={15} />
          </Button>
          <Button
            size='icon'
            variant='ghost'
            onClick={() => startCreate('', 'folder')}
            className={`h-7 w-7 ${isDark ? 'text-slate-400 hover:text-white hover:bg-slate-800' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200'}`}
          >
            <FolderPlus size={15} />
          </Button>
          <Button 
            size='icon' 
            variant='ghost' 
            onClick={onRefresh}
            className={`h-7 w-7 ${isDark ? 'text-slate-400 hover:text-white hover:bg-slate-800' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200'}`}
          >
            <RefreshCw size={14} />
          </Button>
        </div>
      </div>

      {/* Tree */}
      <div className='p-2 overflow-auto'>
        {sortNodes(nodes).map((node) => (
          <TreeNode
            key={node.path}
            node={node}
            level={0}
            expanded={expanded}
            activePath={activePath}
            renaming={renaming}
            creating={creating}
            toggleFolder={toggleFolder}
            onSelect={onSelect}
            onDelete={onDelete}
            onRenameStart={setRenaming}
            onRenameConfirm={confirmRename}
            onCreateStart={startCreate}
            onCreateConfirm={confirmCreate}
            onCreateCancel={() => setCreating(null)}
            isDark={isDark}
          />
        ))}

        {creating?.parent === '' && (
          <InlineInput
            level={0}
            placeholder={creating.type === 'file' ? 'newFile.js' : 'newFolder'}
            onConfirm={confirmCreate}
            onCancel={() => setCreating(null)}
            isDark={isDark}
          />
        )}
      </div>
    </div>
  );
}

/* ============================= */

function TreeNode({
  node,
  level,
  expanded,
  activePath,
  renaming,
  creating,
  toggleFolder,
  onSelect,
  onDelete,
  onRenameStart,
  onRenameConfirm,
  onCreateStart,
  onCreateConfirm,
  onCreateCancel,
  isDark,
}: any) {
  const isOpen = expanded.has(node.path);
  const isRenaming = renaming === node.path;

  const handleRowClick = () => {
    if (node.type === 'folder') {
      toggleFolder(node.path);
    } else {
      onSelect(node.path);
    }
  };

  return (
    <div>
      <ContextMenu>
        <ContextMenuTrigger>
          <div
            className={`flex items-center gap-1 px-1 py-0.5 rounded select-none cursor-pointer transition-colors duration-100 ${
              activePath === node.path
                ? (isDark ? 'bg-slate-800 text-blue-400 font-medium' : 'bg-slate-200 text-indigo-650 font-semibold')
                : (isDark ? 'hover:bg-slate-800 text-slate-300 hover:text-slate-100' : 'hover:bg-slate-200/80 text-slate-700 hover:text-slate-900')
            }`}
            style={{ paddingLeft: level * 14 + 6 }}
            onClick={handleRowClick}
          >
            {/* Chevron */}
            {node.type === 'folder' ? (
              <ChevronRight
                size={14}
                className={`mr-0.5 transition-transform ${
                  isOpen ? 'rotate-90' : ''
                }`}
                onClick={(e) => {
                  e.stopPropagation();
                  toggleFolder(node.path);
                }}
              />
            ) : (
              <span className='w-3.5' />
            )}

            {/* Icon */}
            {node.type === 'folder' ? (
              isOpen ? (
                <FolderOpen size={14} />
              ) : (
                <Folder size={14} />
              )
            ) : (
              <File size={14} />
            )}

            {/* Name */}
            {isRenaming ? (
              <InlineInput
                defaultValue={node.name}
                onConfirm={(v) => onRenameConfirm(node.path, v)}
                onCancel={() => onRenameStart(null)}
                level={level}
                isDark={isDark}
              />
            ) : (
              <span className='truncate'>{node.name}</span>
            )}
          </div>
        </ContextMenuTrigger>

        <ContextMenuContent className='bg-slate-900 text-white border-slate-700'>
          {node.type === 'folder' && (
            <>
              <ContextMenuItem onClick={() => onCreateStart(node.path, 'file')}>
                New File
              </ContextMenuItem>
              <ContextMenuItem
                onClick={() => onCreateStart(node.path, 'folder')}
              >
                New Folder
              </ContextMenuItem>
            </>
          )}
          <ContextMenuItem onClick={() => onRenameStart(node.path)}>
            Rename
          </ContextMenuItem>
          <ContextMenuItem
            className='text-red-400'
            onClick={() =>
              confirm(`Delete ${node.name}?`) && onDelete(node.path)
            }
          >
            Delete
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>

      {/* Children */}
      {node.type === 'folder' && isOpen && (
        <div>
          {sortNodes(node.children ?? []).map((child: FileNode) => (
            <TreeNode
              key={child.path}
              node={child}
              level={level + 1}
              expanded={expanded}
              activePath={activePath}
              renaming={renaming}
              creating={creating}
              toggleFolder={toggleFolder}
              onSelect={onSelect}
              onDelete={onDelete}
              onRenameStart={onRenameStart}
              onRenameConfirm={onRenameConfirm}
              onCreateStart={onCreateStart}
              onCreateConfirm={onCreateConfirm}
              onCreateCancel={onCreateCancel}
              isDark={isDark}
            />
          ))}

          {creating?.parent === node.path && (
            <InlineInput
              level={level + 1}
              placeholder={
                creating.type === 'file' ? 'newFile.js' : 'newFolder'
              }
              onConfirm={onCreateConfirm}
              onCancel={onCreateCancel}
              isDark={isDark}
            />
          )}
        </div>
      )}
    </div>
  );
}

/* ============================= */

function InlineInput({
  defaultValue = '',
  placeholder,
  onConfirm,
  onCancel,
  level,
  isDark = true,
}: {
  defaultValue?: string;
  placeholder?: string;
  onConfirm: (value: string) => void;
  onCancel: () => void;
  level: number;
  isDark?: boolean;
}) {
  return (
    <input
      autoFocus
      defaultValue={defaultValue}
      placeholder={placeholder}
      className={`block w-full border text-sm px-1 py-0.5 rounded outline-none ${
        isDark ? 'bg-slate-800 border-slate-700 text-slate-300' : 'bg-white border-slate-350 text-slate-800'
      }`}
      style={{ marginLeft: level * 14 + 28 }}
      onClick={(e) => e.stopPropagation()}
      onBlur={onCancel}
      onKeyDown={(e) => {
        if (e.key === 'Enter') onConfirm(e.currentTarget.value.trim());
        if (e.key === 'Escape') onCancel();
      }}
    />
  );
}
