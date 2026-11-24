import { useRef, useState, useCallback, useId } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  Bold, Italic, Heading2, Heading3, List, ListOrdered,
  Code, Link as LinkIcon, Eye, Edit3, Image as ImageIcon,
  Loader2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import apiClient from '@/services/api';
import toast from 'react-hot-toast';
import { cleanCorruptedMarkdown, isCorruptedMarkdown } from '@/utils/contentFormat';

interface Props {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  uploadEndpoint?: string;
  className?: string;
  minHeight?: string;
}

// Insert/wrap text at cursor in a textarea
function insertAt(
  el: HTMLTextAreaElement,
  before: string,
  after = '',
  defaultText = '',
) {
  const start = el.selectionStart;
  const end = el.selectionEnd;
  const selected = el.value.slice(start, end) || defaultText;
  const replacement = before + selected + after;
  const next = el.value.slice(0, start) + replacement + el.value.slice(end);
  // Move cursor after inserted text
  const cursor = start + before.length + selected.length + after.length;
  return { next, cursor };
}

export default function MarkdownEditor({
  value,
  onChange,
  placeholder = 'Write in Markdown…',
  uploadEndpoint = '/admin/upload-file',
  className,
  minHeight = '160px',
}: Props) {
  const [mode, setMode] = useState<'write' | 'preview'>('write');
  const [uploading, setUploading] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const imageInputId = useId();

  const applyFormat = useCallback(
    (before: string, after = '', defaultText = '') => {
      const el = textareaRef.current;
      if (!el) return;
      const { next, cursor } = insertAt(el, before, after, defaultText);
      onChange(next);
      // Restore focus and selection after React re-render
      requestAnimationFrame(() => {
        el.focus();
        el.setSelectionRange(cursor, cursor);
      });
    },
    [onChange],
  );

  const insertLink = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    const start = el.selectionStart;
    const end = el.selectionEnd;
    const selected = el.value.slice(start, end);
    const url = window.prompt('URL', 'https://');
    if (!url) return;
    const text = selected || 'link text';
    const replacement = `[${text}](${url})`;
    const next = el.value.slice(0, start) + replacement + el.value.slice(end);
    onChange(next);
    requestAnimationFrame(() => { el.focus(); });
  }, [onChange]);

  const handleImageUpload = useCallback(
    async (file: File) => {
      if (!file.type.startsWith('image/')) return;
      setUploading(true);
      const toastId = toast.loading('Uploading image…');
      try {
        const form = new FormData();
        form.append('file', file);
        const res = await apiClient.post<{ url: string }>(uploadEndpoint, form);
        const url = res.data.url;
        applyFormat(`![image](${url})`, '', '');
        toast.dismiss(toastId);
      } catch {
        toast.dismiss(toastId);
        toast.error('Image upload failed');
      } finally {
        setUploading(false);
      }
    },
    [applyFormat, uploadEndpoint],
  );

  const btn = (active = false) =>
    cn(
      'p-1.5 rounded hover:bg-slate-100 transition-colors',
      active ? 'bg-slate-200 text-slate-900' : 'text-slate-500',
    );

  return (
    <div className={cn('rounded-lg border border-input overflow-hidden', className)}>
      {/* Toolbar */}
      <div className='flex flex-wrap items-center gap-0.5 border-b border-slate-100 bg-slate-50 px-2 py-1.5'>
        {/* Formatting buttons — only meaningful in write mode */}
        <button type='button' className={btn()} onClick={() => applyFormat('**', '**', 'bold')} title='Bold' disabled={mode === 'preview'}><Bold className='w-3.5 h-3.5' /></button>
        <button type='button' className={btn()} onClick={() => applyFormat('*', '*', 'italic')} title='Italic' disabled={mode === 'preview'}><Italic className='w-3.5 h-3.5' /></button>

        <div className='w-px h-4 bg-slate-200 mx-1' />

        <button type='button' className={btn()} onClick={() => applyFormat('## ', '', 'Heading')} title='Heading 2' disabled={mode === 'preview'}><Heading2 className='w-3.5 h-3.5' /></button>
        <button type='button' className={btn()} onClick={() => applyFormat('### ', '', 'Heading')} title='Heading 3' disabled={mode === 'preview'}><Heading3 className='w-3.5 h-3.5' /></button>

        <div className='w-px h-4 bg-slate-200 mx-1' />

        <button type='button' className={btn()} onClick={() => applyFormat('- ', '', 'list item')} title='Bullet list' disabled={mode === 'preview'}><List className='w-3.5 h-3.5' /></button>
        <button type='button' className={btn()} onClick={() => applyFormat('1. ', '', 'list item')} title='Numbered list' disabled={mode === 'preview'}><ListOrdered className='w-3.5 h-3.5' /></button>

        <div className='w-px h-4 bg-slate-200 mx-1' />

        <button type='button' className={btn()} onClick={() => applyFormat('`', '`', 'code')} title='Inline code' disabled={mode === 'preview'}><Code className='w-3.5 h-3.5' /></button>
        <button type='button' className={btn()} onClick={insertLink} title='Insert link' disabled={mode === 'preview'}><LinkIcon className='w-3.5 h-3.5' /></button>
        <button
          type='button'
          className={btn()}
          onClick={() => imageInputRef.current?.click()}
          title='Upload image'
          disabled={mode === 'preview' || uploading}
        >
          {uploading ? <Loader2 className='w-3.5 h-3.5 animate-spin' /> : <ImageIcon className='w-3.5 h-3.5' />}
        </button>
        <input
          ref={imageInputRef}
          id={imageInputId}
          type='file'
          accept='image/*'
          className='hidden'
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleImageUpload(f);
            e.target.value = '';
          }}
        />

        {/* Write / Preview toggle on the right */}
        <div className='ml-auto flex items-center gap-1 border border-slate-200 rounded-md p-0.5 bg-white'>
          <button
            type='button'
            onClick={() => setMode('write')}
            className={cn('flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium transition-colors', mode === 'write' ? 'bg-slate-100 text-slate-800' : 'text-slate-400 hover:text-slate-600')}
          >
            <Edit3 className='w-3 h-3' /> Write
          </button>
          <button
            type='button'
            onClick={() => setMode('preview')}
            className={cn('flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium transition-colors', mode === 'preview' ? 'bg-slate-100 text-slate-800' : 'text-slate-400 hover:text-slate-600')}
          >
            <Eye className='w-3 h-3' /> Preview
          </button>
        </div>
      </div>

      {/* Write */}
      {mode === 'write' && (
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onPaste={(e) => {
            const pastedText = e.clipboardData.getData('text/plain');
            if (isCorruptedMarkdown(pastedText)) {
              e.preventDefault();
              const cleaned = cleanCorruptedMarkdown(pastedText);
              const el = textareaRef.current;
              if (!el) return;
              const { next, cursor } = insertAt(el, '', '', cleaned);
              onChange(next);
              requestAnimationFrame(() => {
                el.focus();
                el.setSelectionRange(cursor, cursor);
              });
            }
          }}
          placeholder={placeholder}
          style={{ minHeight }}
          className='w-full resize-y px-3 py-2 text-sm text-slate-800 font-mono focus:outline-none bg-white placeholder:text-slate-400'
        />
      )}

      {/* Preview */}
      {mode === 'preview' && (
        <div
          className='px-3 py-2 prose prose-sm max-w-none text-slate-800'
          style={{ minHeight }}
        >
          {value.trim() ? (
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {isCorruptedMarkdown(value) ? cleanCorruptedMarkdown(value) : value}
            </ReactMarkdown>
          ) : (
            <p className='text-slate-400 text-sm italic'>Nothing to preview yet.</p>
          )}
        </div>
      )}

      <p className='px-3 pb-1.5 text-[10px] text-slate-400'>Markdown supported — use **bold**, *italic*, ## headings, \`code\`</p>
    </div>
  );
}
