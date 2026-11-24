import { useEditor, EditorContent, ReactNodeViewRenderer } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Image from '@tiptap/extension-image';
import Underline from '@tiptap/extension-underline';
import Link from '@tiptap/extension-link';
import Placeholder from '@tiptap/extension-placeholder';
import { useEffect, useRef, useCallback, useId } from 'react';
import RichTextImageNode from './RichTextImageNode';
import {
  Bold, Italic, UnderlineIcon, Strikethrough,
  Heading2, Heading3, List, ListOrdered,
  Link as LinkIcon, Image as ImageIcon, Undo, Redo,
} from 'lucide-react';
import apiClient from '@/services/api';
import toast from 'react-hot-toast';
import { cn } from '@/lib/utils';
import { DOMParser as PMDOMParser } from '@tiptap/pm/model';
import {
  markdownToHtml,
  isHtmlContent,
  cleanCorruptedMarkdown,
  isCorruptedMarkdown,
} from '@/utils/contentFormat';

interface Props {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  uploadEndpoint?: string;
  className?: string;
  minHeight?: string;
}

export default function RichTextEditor({
  value,
  onChange,
  placeholder = 'Start writing...',
  uploadEndpoint = '/admin/upload-file',
  className,
  minHeight = '160px',
}: Props) {
  const isInternalUpdate = useRef(false);

  const uploadImage = useCallback(
    async (file: File): Promise<string | null> => {
      if (!file.type.startsWith('image/')) return null;
      try {
        const form = new FormData();
        form.append('file', file);
        const res = await apiClient.post<{ url: string }>(uploadEndpoint, form);
        return res.data.url;
      } catch {
        toast.error('Image upload failed');
        return null;
      }
    },
    [uploadEndpoint],
  );

  const getFormattedHtml = useCallback((val: string) => {
    if (!val || !val.trim()) return '';
    const clean = isCorruptedMarkdown(val) ? cleanCorruptedMarkdown(val) : val;
    return isHtmlContent(clean) ? clean : markdownToHtml(clean);
  }, []);

  const editor = useEditor({
    extensions: [
      StarterKit,
      Underline,
      Link.configure({ openOnClick: false }),
      Placeholder.configure({ placeholder }),
      Image.extend({
        addNodeView() {
          return ReactNodeViewRenderer(RichTextImageNode);
        },
      }).configure({ inline: false, allowBase64: false }),
    ],
    content: getFormattedHtml(value),
    onUpdate({ editor }) {
      isInternalUpdate.current = true;
      onChange(editor.getHTML());
    },
    editorProps: {
      handlePaste(view, event) {
        const items = Array.from(event.clipboardData?.items ?? []);
        const imageItem = items.find((i) => i.type.startsWith('image/'));
        if (imageItem) {
          event.preventDefault();
          const file = imageItem.getAsFile();
          if (!file) return true;
          const toastId = toast.loading('Uploading image…');
          uploadImage(file).then((url) => {
            toast.dismiss(toastId);
            if (url) {
              view.dispatch(
                view.state.tr.replaceSelectionWith(
                  view.state.schema.nodes.image.create({ src: url }),
                ),
              );
            }
          });
          return true;
        }

        // Handle pasting markdown text into RichTextEditor
        const text = event.clipboardData?.getData('text/plain');
        if (text && /(?:^|\n)\s*(?:#{1,6}\s+|-\s+|\*\s+|\d+\.\s+|```|---\s+)/.test(text)) {
          event.preventDefault();
          const html = markdownToHtml(text);
          const element = document.createElement('div');
          element.innerHTML = html;
          const slice = PMDOMParser.fromSchema(view.state.schema).parseSlice(element);
          view.dispatch(view.state.tr.replaceSelection(slice));
          return true;
        }

        return false;
      },
      handleDrop(view, event) {
        const file = event.dataTransfer?.files?.[0];
        if (!file?.type.startsWith('image/')) return false;
        event.preventDefault();
        const toastId = toast.loading('Uploading image…');
        const { pos } = view.posAtCoords({ left: event.clientX, top: event.clientY }) ?? { pos: 0 };
        uploadImage(file).then((url) => {
          toast.dismiss(toastId);
          if (url) {
            view.dispatch(
              view.state.tr.insert(
                pos,
                view.state.schema.nodes.image.create({ src: url }),
              ),
            );
          }
        });
        return true;
      },
      attributes: { style: `min-height: ${minHeight}` },
    },
  });

  // Sync value prop → editor when changed externally (e.g. modal reset)
  useEffect(() => {
    if (!editor || editor.isDestroyed) return;
    if (isInternalUpdate.current) {
      isInternalUpdate.current = false;
      return;
    }
    try {
      const targetHtml = getFormattedHtml(value);
      if (editor.getHTML() !== targetHtml) {
        editor.commands.setContent(targetHtml, false as any);
      }
    } catch (err) {
      console.warn("Editor sync ignored due to state error", err);
    }
  }, [value, editor, getFormattedHtml]);

  const addLink = () => {
    if (!editor) return;
    const prev = editor.getAttributes('link').href ?? '';
    const url = window.prompt('URL', prev);
    if (url === null) return;
    if (url === '') {
      editor.chain().focus().unsetLink().run();
    } else {
      editor.chain().focus().setLink({ href: url }).run();
    }
  };

  const imageInputId = useId();
  const imageInputRef = useRef<HTMLInputElement>(null);

  const handleImageFileChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file || !editor) return;
      e.target.value = '';
      const toastId = toast.loading('Uploading image…');
      const url = await uploadImage(file);
      toast.dismiss(toastId);
      if (url) editor.chain().focus().setImage({ src: url }).run();
    },
    [editor, uploadImage],
  );

  if (!editor) return null;

  const btn = (active: boolean) =>
    cn(
      'p-1.5 rounded hover:bg-slate-100 transition-colors',
      active ? 'bg-slate-200 text-slate-900' : 'text-slate-500',
    );

  return (
    <div className={cn('rounded-lg border border-input overflow-hidden', className)}>
      {/* Toolbar */}
      <div className='flex flex-wrap items-center gap-0.5 border-b border-slate-100 bg-slate-50 px-2 py-1.5'>
        <button type='button' className={btn(editor.isActive('bold'))} onClick={() => editor.chain().focus().toggleBold().run()} title='Bold'><Bold className='w-3.5 h-3.5' /></button>
        <button type='button' className={btn(editor.isActive('italic'))} onClick={() => editor.chain().focus().toggleItalic().run()} title='Italic'><Italic className='w-3.5 h-3.5' /></button>
        <button type='button' className={btn(editor.isActive('underline'))} onClick={() => editor.chain().focus().toggleUnderline().run()} title='Underline'><UnderlineIcon className='w-3.5 h-3.5' /></button>
        <button type='button' className={btn(editor.isActive('strike'))} onClick={() => editor.chain().focus().toggleStrike().run()} title='Strikethrough'><Strikethrough className='w-3.5 h-3.5' /></button>

        <div className='w-px h-4 bg-slate-200 mx-1' />

        <button type='button' className={btn(editor.isActive('heading', { level: 2 }))} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} title='Heading 2'><Heading2 className='w-3.5 h-3.5' /></button>
        <button type='button' className={btn(editor.isActive('heading', { level: 3 }))} onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()} title='Heading 3'><Heading3 className='w-3.5 h-3.5' /></button>

        <div className='w-px h-4 bg-slate-200 mx-1' />

        <button type='button' className={btn(editor.isActive('bulletList'))} onClick={() => editor.chain().focus().toggleBulletList().run()} title='Bullet list'><List className='w-3.5 h-3.5' /></button>
        <button type='button' className={btn(editor.isActive('orderedList'))} onClick={() => editor.chain().focus().toggleOrderedList().run()} title='Numbered list'><ListOrdered className='w-3.5 h-3.5' /></button>

        <div className='w-px h-4 bg-slate-200 mx-1' />

        <button type='button' className={btn(editor.isActive('link'))} onClick={addLink} title='Insert link'><LinkIcon className='w-3.5 h-3.5' /></button>
        <button type='button' className={btn(false)} onClick={() => imageInputRef.current?.click()} title='Upload image'><ImageIcon className='w-3.5 h-3.5' /></button>
        <input ref={imageInputRef} id={imageInputId} type='file' accept='image/*' className='hidden' onChange={handleImageFileChange} />

        <div className='ml-auto flex gap-0.5'>
          <button type='button' className={btn(false)} onClick={() => editor.chain().focus().undo().run()} disabled={!editor.can().undo()} title='Undo'><Undo className='w-3.5 h-3.5' /></button>
          <button type='button' className={btn(false)} onClick={() => editor.chain().focus().redo().run()} disabled={!editor.can().redo()} title='Redo'><Redo className='w-3.5 h-3.5' /></button>
        </div>
      </div>

      {/* Editor area */}
      <EditorContent
        editor={editor}
        className='prose prose-sm max-w-none px-3 py-2 text-sm text-slate-800 focus-within:outline-none [&_.tiptap]:outline-none [&_.tiptap_p.is-editor-empty:first-child::before]:text-slate-400 [&_.tiptap_p.is-editor-empty:first-child::before]:content-[attr(data-placeholder)] [&_.tiptap_p.is-editor-empty:first-child::before]:float-left [&_.tiptap_p.is-editor-empty:first-child::before]:pointer-events-none [&_.tiptap_p.is-editor-empty:first-child::before]:h-0 [&_.tiptap_img]:max-w-full [&_.tiptap_img]:rounded-md [&_.tiptap_img]:my-2'
      />

      <p className='px-3 pb-1.5 text-[10px] text-slate-400'>Paste or drop screenshots directly into the editor</p>
    </div>
  );
}
