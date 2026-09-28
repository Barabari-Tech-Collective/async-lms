import { Button } from '@/components/ui/button';
import type { ContentModalProps } from '@/utils/types';
import { Save, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';

const ContentModal: React.FC<ContentModalProps> = ({
  isOpen,
  onClose,
  onSave,
  subtopicTitle,
  editData,
  loading = false,
}) => {
  const [markdownPath, setMarkdownPath] = useState('');
  const [videoUrl, setVideoUrl] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [readTime, setReadTime] = useState<number | undefined>(undefined);

  useEffect(() => {
    if (!isOpen) return;
    setMarkdownPath(editData?.markdown_path ?? '');
    setVideoUrl(editData?.video_url ?? '');
    setFile(null);
    setReadTime(editData?.estimated_read_time);
  }, [editData, isOpen]);

  const handleSave = () => {
    const hasMarkdown = !!(file || markdownPath.trim() || editData?.markdown_path);
    const hasVideo = !!(videoUrl.trim() || editData?.video_url);
    if (!hasMarkdown && !hasVideo) {
      toast.error('Provide at least a markdown file or a video URL');
      return;
    }
    const contentType = hasMarkdown ? 'markdown' : 'video';
    onSave({
      content_type: contentType,
      markdown_path: markdownPath.trim(),
      estimated_read_time: readTime,
      video_url: videoUrl.trim(),
      file,
    });
    setMarkdownPath('');
    setVideoUrl('');
    setFile(null);
    setReadTime(undefined);
  };

  if (!isOpen) return null;

  return (
    <div className='fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-3 sm:p-4 backdrop-blur-xs'>
      <div className='w-[94vw] sm:max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl bg-white p-4 sm:p-6 shadow-xl'>
        <div className='mb-4 flex items-center justify-between'>
          <div>
            <h3 className='text-lg font-bold text-slate-900'>
              {editData ? 'Edit Lesson Content' : 'Add Lesson Content'}
            </h3>
            <p className='text-sm text-slate-500'>Subtopic: {subtopicTitle}</p>
          </div>
          <button
            onClick={onClose}
            className='text-slate-400 hover:text-slate-600'
          >
            <X className='h-5 w-5' />
          </button>
        </div>

        <div className='space-y-4'>
          <div>
            <label className='mb-2 block text-sm font-medium text-slate-700'>
              Upload Markdown File
            </label>
            <input
              type='file'
              autoFocus
              accept='.md,text/markdown'
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className='w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200'
            />
            <p className='mt-1 text-xs text-slate-500'>
              Upload a markdown file for this lesson
            </p>
          </div>

          <div>
            <label className='mb-2 block text-sm font-medium text-slate-700'>
              Video URL (YouTube)
            </label>
            <input
              type='text'
              value={videoUrl}
              onChange={(e) => setVideoUrl(e.target.value)}
              placeholder='https://youtube.com/...'
              className='w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200'
            />
          </div>

          <div>
            <label className='mb-2 block text-sm font-medium text-slate-700'>
              Estimated Read Time (minutes)
            </label>
            <input
              type='number'
              value={readTime || ''}
              onChange={(e) =>
                setReadTime(
                  e.target.value ? parseInt(e.target.value) : undefined,
                )
              }
              placeholder='10'
              min='1'
              className='w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200'
            />
          </div>
        </div>

        <div className='mt-6 flex gap-3'>
          <Button
            onClick={onClose}
            className='flex-1 border border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
          >
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            loading={loading}
            className='flex-1 bg-indigo-600 text-white hover:bg-indigo-700'
          >
            {!loading && <Save className='mr-2 h-4 w-4' />}
            {editData ? 'Update Content' : 'Add Content'}
          </Button>
        </div>
      </div>
    </div>
  );
};

export default ContentModal;
