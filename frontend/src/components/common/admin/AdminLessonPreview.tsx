import { X, Loader2, AlertTriangle } from 'lucide-react';
import { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { getYouTubeEmbedUrl } from '@/utils/youtube';

const AdminLessonPreviewModal = ({
  isOpen,
  onClose,
  content,
  videoUrl,
  loading = false,
  error = null,
}: {
  isOpen: boolean;
  onClose: () => void;
  content: string;
  videoUrl?: string;
  loading?: boolean;
  error?: string | null;
}) => {
  const [iframeLoading, setIframeLoading] = useState(true);

  if (!isOpen) return null;

  const embedUrl = videoUrl ? getYouTubeEmbedUrl(videoUrl) : null;

  return (
    <div className='fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-3 sm:p-4 backdrop-blur-xs'>
      <div className='w-[96vw] sm:max-w-3xl rounded-2xl bg-white shadow-2xl flex flex-col max-h-[90vh] overflow-hidden'>
        <div className='flex items-center justify-between px-4 sm:px-6 py-3 sm:py-4 border-b border-slate-100 shrink-0'>
          <h3 className='text-base font-semibold text-slate-900'>
            {videoUrl ? 'Video Preview' : 'Lesson Preview'}
          </h3>
          <button
            onClick={() => {
              setIframeLoading(true);
              onClose();
            }}
            className='rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors'
          >
            <X className='h-4 w-4' />
          </button>
        </div>

        <div className='overflow-y-auto flex-1 p-6'>
          {videoUrl ? (
            embedUrl ? (
              /* YouTube embed */
              <div className='relative aspect-video w-full rounded-lg overflow-hidden bg-slate-900'>
                {iframeLoading && (
                  <div className='absolute inset-0 flex items-center justify-center bg-slate-900'>
                    <Loader2 className='h-8 w-8 animate-spin text-white/50' />
                  </div>
                )}
                <iframe
                  src={embedUrl}
                  className='h-full w-full'
                  allowFullScreen
                  allow='accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture'
                  onLoad={() => setIframeLoading(false)}
                  title='Video preview'
                />
              </div>
            ) : (
              /* Direct video URL (mp4, etc.) */
              <video
                src={videoUrl}
                controls
                className='w-full rounded-lg bg-slate-900'
              />
            )
          ) : loading ? (
            <div className='flex flex-col items-center justify-center gap-3 py-16 text-slate-400'>
              <Loader2 className='h-8 w-8 animate-spin' />
              <p className='text-sm'>Loading lesson content...</p>
            </div>
          ) : error ? (
            <div className='flex flex-col items-center justify-center gap-3 py-16 text-center'>
              <AlertTriangle className='h-8 w-8 text-amber-500' />
              <p className='text-sm font-medium text-slate-700'>
                Couldn&apos;t load lesson content
              </p>
              <p className='text-xs text-slate-400 max-w-sm'>{error}</p>
            </div>
          ) : content ? (
            <div className='prose prose-slate max-w-none lg:prose-base'>
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {content}
              </ReactMarkdown>
            </div>
          ) : (
            <p className='py-16 text-center text-sm italic text-slate-400'>
              No content to preview.
            </p>
          )}
        </div>
      </div>
    </div>
  );
};

export default AdminLessonPreviewModal;
