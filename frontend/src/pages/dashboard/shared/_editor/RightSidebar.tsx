import { useEffect, useMemo, useState, useRef } from 'react';
import {
  BookOpen, Code2, Download, Eye, FileText,
  Loader2, MonitorPlay, Pencil, Save, Sparkles, Upload,
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import toast from 'react-hot-toast';
import type { AiExercise, AiLesson } from '@/features/aiCurriculum/types';
import { aiCurriculumApi } from '@/features/aiCurriculum/aiCurriculumApi';
import { extractYouTubeVideoId } from '@/utils/youtube';

export function getDisplayFilename(url: string) {
  try {
    if (url.includes('.amazonaws.com/')) {
      const filename = new URL(url).pathname.split('/').pop() || '';
      return decodeURIComponent(filename).replace(/^\d+-/, '') || url;
    }
    return url;
  } catch {
    return url;
  }
}

type Tab = 'video' | 'content' | 'exercise';

// ─── Tab strip ────────────────────────────────────────────────────────────────

function TabStrip({ active, onTab }: { active: Tab; onTab: (t: Tab) => void }) {
  const tabs: { id: Tab; label: string; icon: React.ElementType }[] = [
    { id: 'video',    label: 'Video',    icon: MonitorPlay },
    { id: 'content',  label: 'Content',  icon: FileText },
    { id: 'exercise', label: 'Exercise', icon: Code2 },
  ];
  return (
    <div className='flex border-b border-slate-100'>
      {tabs.map(({ id, label, icon: Icon }) => (
        <button
          key={id}
          onClick={() => onTab(id)}
          className={`flex items-center gap-1.5 px-4 py-2.5 text-[12px] font-bold border-b-2 transition-colors ${
            active === id
              ? 'border-indigo-500 text-indigo-600'
              : 'border-transparent text-slate-400 hover:text-slate-600'
          }`}
        >
          <Icon className='w-3.5 h-3.5' />
          {label}
        </button>
      ))}
    </div>
  );
}

// ─── Video tab ────────────────────────────────────────────────────────────────

type VideoResult = {
  videoId: string;
  title: string;
  thumbnail?: string;
  channel?: string;
  channelTitle?: string;
  url: string;
};

function VideoTab({
  lesson,
  canEdit,
  searching,
  videoResults,
  onSearchYouTube,
  onSelectVideo,
  onUpdateLesson,
}: {
  lesson: AiLesson;
  canEdit: boolean;
  searching: boolean;
  videoResults: VideoResult[];
  onSearchYouTube: () => void;
  onSelectVideo: (url: string) => void;
  onUpdateLesson: (data: Partial<AiLesson>) => Promise<void>;
}) {
  const [url, setUrl] = useState(lesson.video_url ?? '');
  const [saving, setSaving] = useState(false);

  useEffect(() => { setUrl(lesson.video_url ?? ''); }, [lesson.video_url]);

  const handleSave = async () => {
    const trimmed = url.trim();
    if (trimmed === (lesson.video_url ?? '')) return;
    setSaving(true);
    try {
      await onUpdateLesson({ video_url: trimmed || null });
      toast.success('Video URL saved');
    } catch {
      toast.error('Save failed');
    } finally {
      setSaving(false);
    }
  };

  const videoId = useMemo(() => extractYouTubeVideoId(url), [url]);

  return (
    <div className='p-4 sm:p-5 space-y-4 flex-1 overflow-y-auto'>
      {/* Embed preview when valid video ID exists */}
      {videoId && !url.includes('results?') && (
        <div className='rounded-xl overflow-hidden aspect-video bg-black shadow-sm'>
          <iframe
            src={`https://www.youtube.com/embed/${videoId}?rel=0`}
            className='w-full h-full border-0'
            allow='accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share'
            allowFullScreen
            title='Video preview'
          />
        </div>
      )}

      {/* When no video is set yet */}
      {!url && (
        <div className='border-2 border-dashed border-slate-200 rounded-xl p-5 text-center bg-slate-50/50'>
          <MonitorPlay className='w-7 h-7 text-slate-300 mx-auto mb-1.5' />
          <p className='text-[12px] font-semibold text-slate-600'>No Video Assigned</p>
          <p className='text-[11px] text-slate-400 mt-0.5'>
            Paste a YouTube URL below or click &quot;Search YouTube&quot; to discover top videos.
          </p>
        </div>
      )}

      {/* Incomplete or invalid URL state */}
      {url && !videoId && !url.includes('results?') && (
        <div className='bg-amber-50/90 border border-amber-200 rounded-xl p-3.5 text-center'>
          <MonitorPlay className='w-5 h-5 text-amber-500 mx-auto mb-1.5' />
          <p className='text-[12px] font-bold text-amber-800 mb-0.5'>Incomplete or Invalid Video URL</p>
          <p className='text-[11px] text-amber-600 mb-2.5'>
            Please enter a complete YouTube video link (e.g. <span className='font-mono text-[10px] bg-amber-100/60 px-1 py-0.5 rounded'>https://youtube.com/watch?v=...</span>) or pick from search results.
          </p>
          {url.startsWith('http') && (
            <a
              href={url}
              target='_blank'
              rel='noopener noreferrer'
              className='inline-flex items-center gap-1.5 px-2.5 py-1 bg-amber-100 hover:bg-amber-200 text-amber-800 rounded-lg text-[11px] font-semibold transition-colors'
            >
              <MonitorPlay className='w-3.5 h-3.5' /> Open URL in new tab
            </a>
          )}
        </div>
      )}

      {/* YouTube search query fallback */}
      {url && url.includes('results?') && (
        <div className='bg-slate-50 border border-slate-200 rounded-xl p-4 text-center'>
          <MonitorPlay className='w-6 h-6 text-slate-400 mx-auto mb-2' />
          <p className='text-[12px] font-semibold text-slate-700 mb-1'>Search Query URL</p>
          <p className='text-[11px] text-slate-500 mb-3'>A search query was saved instead of a specific video.</p>
          <a
            href={url}
            target='_blank'
            rel='noopener noreferrer'
            className='inline-flex items-center gap-1.5 px-3 py-1.5 bg-red-50 text-red-600 rounded-lg font-bold text-[11px] hover:bg-red-100 transition-colors'
          >
            Open Search Results
          </a>
        </div>
      )}

      {/* YouTube URL input */}
      <div>
        <label className='block text-[11px] font-semibold text-slate-500 mb-1.5'>YouTube URL</label>
        <div className='flex gap-2'>
          <input
            className='flex-1 min-w-0 border border-slate-200 rounded-lg px-3 py-2 text-[13px] text-slate-800 placeholder:text-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-200 disabled:bg-slate-50 disabled:text-slate-400'
            placeholder='https://youtube.com/watch?v=...'
            disabled={!canEdit}
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSave()}
          />
          {canEdit && (
            <button
              onClick={handleSave}
              disabled={saving || url === (lesson.video_url ?? '')}
              className='px-3 py-2 text-[12px] font-bold bg-slate-800 text-white rounded-lg hover:bg-slate-700 disabled:opacity-40 transition-colors shrink-0'
              title='Save URL'
            >
              {saving ? <Loader2 className='w-3.5 h-3.5 animate-spin' /> : <Save className='w-3.5 h-3.5' />}
            </button>
          )}
        </div>
      </div>

      {/* Search YouTube button */}
      {canEdit && (
        <button
          onClick={onSearchYouTube}
          disabled={searching}
          className='flex items-center gap-2 w-full justify-center px-4 py-2.5 text-[12px] font-bold text-red-600 border border-red-200 rounded-lg hover:bg-red-50 disabled:opacity-50 transition-colors min-h-[40px]'
        >
          {searching ? <Loader2 className='w-4 h-4 animate-spin' /> : <MonitorPlay className='w-4 h-4' />}
          {searching ? 'Searching YouTube...' : lesson.video_url ? '🔍 Find a Better Video' : '🔍 Search YouTube for Best Video'}
        </button>
      )}

      {/* YouTube Search Results */}
      {videoResults.length > 0 && (
        <div className='space-y-2.5 pt-2 border-t border-slate-100'>
          <p className='text-[11px] font-bold text-slate-500 uppercase tracking-wider'>
            Search Results — Click to select
          </p>
          <div className='space-y-2'>
            {videoResults.map((v) => {
              const itemVideoId = extractYouTubeVideoId(v.url || v.videoId);
              const isSelected = videoId && itemVideoId ? videoId === itemVideoId : (url === v.url || url === v.videoId);
              const channelName = v.channel || v.channelTitle || '';
              const targetUrl = v.url || (itemVideoId ? `https://www.youtube.com/watch?v=${itemVideoId}` : '');
              const thumbUrl = v.thumbnail || (itemVideoId ? `https://img.youtube.com/vi/${itemVideoId}/mqdefault.jpg` : '');

              return (
                <button
                  key={v.videoId || v.url}
                  type='button'
                  onClick={() => onSelectVideo(targetUrl)}
                  className={`w-full flex items-start gap-3 p-2.5 rounded-xl border text-left transition-all ${
                    isSelected
                      ? 'border-indigo-500 bg-indigo-50/70 ring-2 ring-indigo-300 shadow-xs'
                      : 'border-slate-200 hover:border-indigo-300 hover:bg-slate-50'
                  }`}
                >
                  <div className='relative w-24 sm:w-28 aspect-video rounded-lg overflow-hidden shrink-0 bg-slate-200'>
                    {thumbUrl ? (
                      <img
                        src={thumbUrl}
                        alt={v.title}
                        className='w-full h-full object-cover'
                        loading='lazy'
                      />
                    ) : (
                      <div className='w-full h-full flex items-center justify-center bg-slate-800 text-slate-400'>
                        <MonitorPlay className='w-5 h-5' />
                      </div>
                    )}
                  </div>
                  <div className='min-w-0 flex-1 flex flex-col justify-between py-0.5'>
                    <p
                      className='text-[12px] font-semibold text-slate-800 line-clamp-2 leading-snug'
                      dangerouslySetInnerHTML={{ __html: v.title }}
                    />
                    {channelName && (
                      <p className='text-[11px] text-slate-500 mt-1 truncate'>{channelName}</p>
                    )}
                    {isSelected && (
                      <span className='inline-flex items-center gap-1 mt-1.5 px-2 py-0.5 rounded-md text-[10px] font-bold bg-indigo-100 text-indigo-700 w-fit'>
                        ✓ Selected
                      </span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Content tab ──────────────────────────────────────────────────────────────

function ContentTab({
  lesson,
  canEdit,
  generating,
  onGenerate,
  onUpdateLesson,
}: {
  lesson: AiLesson;
  canEdit: boolean;
  generating: boolean;
  onGenerate: () => void;
  onUpdateLesson: (data: Partial<AiLesson>) => Promise<void>;
}) {
  const [draft, setDraft] = useState({
    explanation: lesson.explanation ?? '',
    example: lesson.example ?? '',
    activity: lesson.activity ?? '',
    resource_links: lesson.resource_links?.length ? lesson.resource_links : [''],
  });
  const [preview, setPreview] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [section, setSection] = useState<'explanation' | 'example' | 'activity'>('explanation');

  useEffect(() => {
    setDraft({
      explanation: lesson.explanation ?? '',
      example: lesson.example ?? '',
      activity: lesson.activity ?? '',
      resource_links: lesson.resource_links?.length ? lesson.resource_links : [''],
    });

    // if generated content exists mark unsaved
    if (
      lesson.explanation ||
      lesson.example ||
      lesson.activity ||
      lesson.resource_links?.length
    ) {
      setDirty(true);
    } else {
      setDirty(false);
    }
  }, [lesson.id, lesson.explanation, lesson.example, lesson.activity, lesson.resource_links]);

  const set = (field: keyof typeof draft, val: string | string[]) => {
    setDraft((d) => ({ ...d, [field]: val }));
    setDirty(true);
  };

  const [isUploading, setIsUploading] = useState(false);
  const [isGeneratingFromFile, setIsGeneratingFromFile] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleAutoGenerate = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 10 * 1024 * 1024) {
      toast.error('File size must be under 10MB');
      e.target.value = '';
      return;
    }

    let toastId: string | undefined;
    try {
      setIsGeneratingFromFile(true);
      toastId = toast.loading('Uploading & Generating...');
      
      const formData = new FormData();
      formData.append('file', file);
      const token = localStorage.getItem('token');
      const uploadRes = await fetch(`${import.meta.env.VITE_API_URL}/api/v1/ai-curriculum/upload-resource`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData
      });
      const uploadData = await uploadRes.json();
      
      if (uploadData.success && uploadData.url) {        
        // Instantly generate (without saving the link to the UI)
        const genRes = await aiCurriculumApi.generateFromResource(uploadData.url, lesson.title);
        if (genRes.data?.success && genRes.data?.content) {
          setDraft(d => ({
            ...d,
            explanation: genRes.data.content.explanation || d.explanation,
            example: genRes.data.content.example || d.example,
            activity: genRes.data.content.activity || d.activity,
          }));
          setDirty(true);
          toast.success('Generated successfully!', { id: toastId });
        } else {
          toast.error('Failed to generate from file', { id: toastId });
        }
      } else {
        toast.error('Upload failed', { id: toastId });
      }
    } catch (err) {
      console.error(err);
      toast.error('Error generating from file', { id: toastId });
    } finally {
      setIsGeneratingFromFile(false);
      e.target.value = '';
    }
  };

  const handleGenerateFromFile = async (link: string) => {
    setIsGeneratingFromFile(true);
    const toastId = toast.loading('Generating content from file...');
    try {
      const res = await aiCurriculumApi.generateFromResource(link, lesson.title);
      if (res.data?.success && res.data?.content) {
        setDraft(d => ({
          ...d,
          explanation: res.data.content.explanation || d.explanation,
          example: res.data.content.example || d.example,
          activity: res.data.content.activity || d.activity,
        }));
        setDirty(true);
        toast.success('Generated successfully!', { id: toastId });
      } else {
        toast.error('Failed to generate from file', { id: toastId });
      }
    } catch (err) {
      console.error(err);
      toast.error('Error generating from file', { id: toastId });
    } finally {
      setIsGeneratingFromFile(false);
    }
  };


  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 10 * 1024 * 1024) {
      toast.error('File size must be under 10MB');
      e.target.value = '';
      return;
    }

    try {
      setIsUploading(true);
      const formData = new FormData();
      formData.append('file', file);
      const token = localStorage.getItem('token');
      const res = await fetch(`${import.meta.env.VITE_API_URL}/api/v1/ai-curriculum/upload-resource`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData
      });
      const data = await res.json();
      if (data.success && data.url) {
        const newLinks = [...draft.resource_links, data.url];
        set('resource_links', newLinks);
        // Auto-save the lesson so the link persists in the database immediately
        await onUpdateLesson({ ...draft, resource_links: newLinks });
        setDirty(false);
        toast.success('File uploaded and saved');
      } else {
        toast.error('Upload failed');
      }
    } catch (err) {
      console.error(err);
      toast.error('Upload failed');
    } finally {
      setIsUploading(false);
      e.target.value = '';
    }
  };

  const handleDeleteLink = async (idx: number) => {
    const linkToRemove = draft.resource_links[idx];
    
    // Remove from UI immediately
    const newLinks = draft.resource_links.filter((_, i) => i !== idx);
    set('resource_links', newLinks);
    // Auto-save the lesson so the link removal persists
    await onUpdateLesson({ ...draft, resource_links: newLinks });
    setDirty(false);

    if (linkToRemove && linkToRemove.includes('.amazonaws.com/')) {
      try {
        const token = localStorage.getItem('token');
        await fetch(`${import.meta.env.VITE_API_URL}/api/v1/ai-curriculum/delete-resource`, {
          method: 'DELETE',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ url: linkToRemove })
        });
      } catch (err) {
        console.error('Failed to delete resource from S3:', err);
      }
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await onUpdateLesson(draft);
      setDirty(false);
      toast.success('Content saved');
    } catch {
      toast.error('Save failed');
    } finally {
      setSaving(false);
    }
  };

  const handleDownload = () => {
    const md = [
      draft.explanation,
      draft.example ? `\n## Example\n\n${draft.example}` : '',
      draft.activity ? `\n## Activity\n\n${draft.activity}` : '',
    ].filter(Boolean).join('\n');
    const blob = new Blob([md], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${(lesson.title ?? 'lesson').replace(/\s+/g, '-').toLowerCase()}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => set('explanation', ev.target?.result as string);
    reader.readAsText(file);
    e.target.value = '';
  };

  const sections = [
    { key: 'explanation' as const, label: 'Explanation', placeholder: '## Introduction\n\nExplain the concept here...' },
    { key: 'example' as const, label: 'Example', placeholder: '// Code example or concept illustration' },
    { key: 'activity' as const, label: 'Activity', placeholder: 'Short in-lesson activity...' },
  ];

  return (
    <div className='flex flex-col flex-1 min-h-0'>
      {/* Toolbar */}
      <div className='flex flex-wrap items-center justify-between gap-2 px-3 sm:px-4 py-2 border-b border-slate-100 bg-slate-50/50 shrink-0'>
        {/* Section selector */}
        <div className='flex items-center bg-slate-200/60 p-0.5 rounded-lg shrink-0'>
          {sections.map((s) => (
            <button
              key={s.key}
              onClick={() => setSection(s.key)}
              className={`px-2 sm:px-2.5 py-1 text-[11px] font-semibold rounded-md transition-all ${
                section === s.key ? 'bg-white text-slate-800 shadow-2xs font-bold' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>

        {/* Action button group */}
        <div className='flex items-center gap-1.5 shrink-0 ml-auto'>
          {/* View toggle */}
          <button
            type='button'
            onClick={() => setPreview((v) => !v)}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all border shadow-2xs ${
              preview
                ? 'bg-indigo-50 text-indigo-700 border-indigo-200 hover:bg-indigo-100'
                : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
            }`}
            title={preview ? 'Switch to edit mode' : 'Preview content'}
          >
            {preview ? <Pencil className='w-3.5 h-3.5 text-indigo-600' /> : <Eye className='w-3.5 h-3.5 text-slate-500' />}
            <span>{preview ? 'Edit' : 'Preview'}</span>
          </button>

          {/* Download file */}
          <button
            type='button'
            onClick={handleDownload}
            title='Download .md'
            className='flex items-center justify-center w-7 h-7 text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 hover:text-slate-900 transition-all shadow-2xs'
          >
            <Download className='w-3.5 h-3.5' />
          </button>

          {/* Upload file */}
          <label
            className='flex items-center justify-center w-7 h-7 text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 hover:text-slate-900 transition-all shadow-2xs cursor-pointer'
            title='Upload .md'
          >
            <Upload className='w-3.5 h-3.5' />
            <input type='file' accept='.md,.txt' className='hidden' onChange={handleUpload} />
          </label>
        </div>
      </div>

      {/* Editor / Preview area */}
      <div className='flex-1 overflow-y-auto px-4 py-4 flex flex-col gap-6'>
        <div className='flex-1 min-h-[280px]'>
          {sections.map((s) => s.key === section && (
            preview ? (
              <div key={s.key} className='prose prose-sm max-w-none text-slate-700 text-[13px] prose-pre:whitespace-pre-wrap prose-pre:break-words'>
                {draft[s.key]
                  ? <ReactMarkdown remarkPlugins={[remarkGfm]}>{draft[s.key]}</ReactMarkdown>
                  : <span className='text-slate-300 italic'>Nothing to preview yet</span>}
                
                {/* Resource Links Preview */}
                {s.key === 'explanation' && draft.resource_links.filter(l => l.trim()).length > 0 && (
                  <div className='mt-8 pt-4 border-t border-slate-100'>
                    <h4 className='font-bold text-slate-800 mb-3'>Attached Resources:</h4>
                    <ul className='list-disc pl-5 space-y-1.5'>
                      {draft.resource_links.filter(l => l.trim()).map((link, idx) => (
                          <li key={idx}>
                            <a href={link} target='_blank' rel='noopener noreferrer' className='text-indigo-600 hover:underline font-semibold break-all flex items-center gap-1.5'>
                              <FileText className="w-3.5 h-3.5 shrink-0" />
                              <span className="line-clamp-1" title={link}>{getDisplayFilename(link)}</span>
                            </a>
                          </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            ) : (
              <textarea
                key={s.key}
                rows={12}
                disabled={!canEdit}
                value={draft[s.key]}
                onChange={(e) => set(s.key, e.target.value)}
                placeholder={s.placeholder}
                className='w-full h-full border border-slate-200 rounded-lg px-3 py-2.5 text-[12px] text-slate-700 placeholder:text-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-200 bg-white disabled:bg-slate-50 disabled:text-slate-400 resize-y font-mono leading-relaxed'
              />
            )
          ))}
        </div>

        {/* Resource Links */}
        {!preview && (
          <div className='space-y-3 shrink-0 pt-3 border-t border-slate-100'>
            <label className='block text-[12px] font-bold text-slate-700 mb-1'>Additional Resources (Links / Files / Folders)</label>
            {draft.resource_links.map((link, idx) => {
              const isS3 = link.includes('.amazonaws.com/');
              return (
              <div key={idx} className='flex gap-2 items-center'>
                {isS3 ? (
                  <div className='flex-1 flex items-center gap-2 border border-slate-200 bg-slate-50 rounded-lg px-3 py-2 text-[13px] text-slate-700 font-medium overflow-hidden'>
                    <FileText className='w-4 h-4 text-indigo-500 shrink-0' />
                    <a href={link} target='_blank' rel='noopener noreferrer' className='flex-1 truncate hover:underline hover:text-indigo-600 cursor-pointer' title={link}>
                      {getDisplayFilename(link)}
                    </a>
                    {canEdit && (
                      <button
                        onClick={() => handleGenerateFromFile(link)}
                        disabled={isGeneratingFromFile || generating}
                        className='flex items-center gap-1.5 px-2 py-1 text-[11px] font-bold text-white bg-indigo-500 hover:bg-indigo-600 rounded disabled:opacity-50 transition-colors shrink-0'
                        title='Generate lesson content from this file'
                      >
                        <Sparkles className='w-3 h-3' />
                        Generate
                      </button>
                    )}
                  </div>
                ) : (
                  <input
                    disabled={!canEdit}
                    value={link}
                    onChange={(e) => {
                      const newLinks = [...draft.resource_links];
                      newLinks[idx] = e.target.value;
                      set('resource_links', newLinks);
                    }}
                    placeholder='https://...'
                    className='flex-1 border border-slate-200 rounded-lg px-3 py-2 text-[13px] text-slate-800 placeholder:text-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-200 disabled:bg-slate-50 disabled:text-slate-400'
                  />
                )}
                {canEdit && draft.resource_links.length > 1 && (
                  <button
                    onClick={() => handleDeleteLink(idx)}
                    className='p-2 text-slate-400 hover:text-red-500 transition-colors shrink-0'
                    title='Remove link'
                  >
                    ✕
                  </button>
                )}
              </div>
              );
            })}
            {canEdit && (
              <div className='flex items-center gap-4 mt-1'>
                <button
                  onClick={() => set('resource_links', [...draft.resource_links, ''])}
                  className='text-[12px] font-bold text-indigo-600 hover:text-indigo-700 hover:underline transition-colors inline-flex items-center gap-1'
                >
                  + Add another link
                </button>
                <label className='text-[12px] font-bold text-indigo-600 hover:text-indigo-700 hover:underline transition-colors inline-flex items-center gap-1 cursor-pointer'>
                  {isUploading ? <Loader2 className='w-3.5 h-3.5 animate-spin' /> : <Upload className='w-3.5 h-3.5' />}
                  {isUploading ? 'Uploading...' : 'Upload File'}
                  <input
                    type='file'
                    className='hidden'
                    onChange={handleFileUpload}
                    disabled={isUploading || !canEdit}
                  />
                </label>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Footer */}
      {canEdit && (
        <div className='border-t border-slate-100 px-3 sm:px-4 py-2.5 sm:py-3 flex flex-wrap items-center justify-between gap-2 shrink-0 bg-slate-50/50'>
          <div className='flex items-center gap-1.5 sm:gap-2 flex-wrap'>
            <button
              onClick={onGenerate}
              disabled={generating || isGeneratingFromFile}
              className='flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 sm:py-2 text-[11px] sm:text-xs font-semibold text-indigo-600 border border-indigo-200 rounded-lg hover:bg-indigo-50 disabled:opacity-50 transition-colors min-h-[34px]'
            >
              {generating ? <Loader2 className='w-3.5 h-3.5 animate-spin' /> : <Sparkles className='w-3.5 h-3.5' />}
              <span>{generating ? 'Generating...' : lesson.explanation ? 'Regenerate' : 'Generate'}</span>
            </button>

            <input
              type="file"
              className="hidden"
              ref={fileInputRef}
              onChange={handleAutoGenerate}
              disabled={isGeneratingFromFile || generating}
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={isGeneratingFromFile || generating}
              className='flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 sm:py-2 text-[11px] sm:text-xs font-semibold text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-50 transition-colors min-h-[34px]'
            >
              {isGeneratingFromFile ? <Loader2 className='w-3 h-3 animate-spin' /> : <FileText className='w-3 h-3' />}
              <span>{isGeneratingFromFile ? 'Working...' : 'Generate from File'}</span>
            </button>
          </div>

          <div className='flex items-center gap-2 ml-auto'>
            {dirty && <span className='text-[10px] sm:text-[11px] text-amber-500 font-semibold'>Unsaved</span>}
            <button
              onClick={handleSave}
              disabled={saving || !dirty}
              className='flex items-center justify-center gap-1.5 px-3.5 sm:px-4 py-1.5 sm:py-2 text-xs sm:text-[13px] font-bold bg-[#1e2653] text-white rounded-lg hover:bg-[#16203f] disabled:opacity-40 transition-colors min-h-[34px]'
            >
              {saving ? <Loader2 className='w-3.5 h-3.5 animate-spin' /> : <Save className='w-3.5 h-3.5' />}
              <span>{saving ? 'Saving...' : 'Save'}</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Exercise tab ─────────────────────────────────────────────────────────────

function ExerciseTab({
  lesson,
  canEdit,
  generating,
  onGenerate,
  onUpdateLesson,
}: {
  lesson: AiLesson;
  canEdit: boolean;
  generating: boolean;
  onGenerate: () => void;
  onUpdateLesson: (data: Partial<AiLesson>) => Promise<void>;
}) {
  const exercise = useMemo<AiExercise | null>(() => {
    if (!lesson.exercise_data) return null;
    try {
      return typeof lesson.exercise_data === 'string'
        ? JSON.parse(lesson.exercise_data as string)
        : (lesson.exercise_data as AiExercise);
    } catch (err) {
      return null;
    }
  }, [lesson.exercise_data]);

  const [draft, setDraft] = useState({
    title: exercise?.title ?? '',
    description: exercise?.description ?? '',
    tasks: (exercise?.tasks ?? []).join('\n'),
    starter_code: exercise?.starter_code ?? '',
    resource_links: exercise?.resource_links?.length ? exercise?.resource_links : [''],
    reference_files: exercise?.reference_files?.length ? exercise?.reference_files : [''],
  });
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [preview, setPreview] = useState(false);
  const [isDraggingFiles, setIsDraggingFiles] = useState(false);
  const [uploadingFiles, setUploadingFiles] = useState<Record<number, boolean>>({});
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isGeneratingFromFile, setIsGeneratingFromFile] = useState(false);

  useEffect(() => {
    const ex = !lesson.exercise_data ? null
      : typeof lesson.exercise_data === 'string'
        ? (JSON.parse(lesson.exercise_data as string) as AiExercise)
        : (lesson.exercise_data as AiExercise);
    setDraft({
      title: ex?.title ?? '',
      description: ex?.description ?? '',
      tasks: (ex?.tasks ?? []).join('\n'),
      starter_code: ex?.starter_code ?? '',
      resource_links: ex?.resource_links?.length ? ex?.resource_links : [''],
      reference_files: ex?.reference_files?.length ? ex?.reference_files : [''],
    });
    // setDirty(false);
    if (ex) {
  setDirty(true);
} else {
  setDirty(false);
}
  }, [lesson.id, lesson.exercise_data]);

  const set = (field: keyof typeof draft, val: string | string[]) => {
    setDraft((d) => ({ ...d, [field]: val }));
    setDirty(true);
  };

  const handleAutoGenerateExercise = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      setIsGeneratingFromFile(true);
      
      const formData = new FormData();
      formData.append('file', file);
      
      // Upload silently to S3
      const uploadRes = await fetch(`${import.meta.env.VITE_API_URL}/api/v1/ai-curriculum/upload-resource`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
        body: formData,
      });
      const uploadData = await uploadRes.json();
      
      if (uploadData.success && uploadData.url) {
        // Instantly generate exercise from the uploaded file
        const genRes = await aiCurriculumApi.generateExerciseFromResource(uploadData.url, lesson.title);
        if (genRes.data?.success && genRes.data?.content) {
          setDraft(d => ({
            ...d,
            description: genRes.data.content.description || d.description,
            tasks: (genRes.data.content.tasks || []).join('\n'),
            starter_code: genRes.data.content.starter_code || d.starter_code,
          }));
          setDirty(true);
          toast.success('Exercise generated from file');
        } else {
          toast.error('Failed to generate exercise');
        }
      } else {
        toast.error('File upload failed');
      }
    } catch (err) {
      console.error(err);
      toast.error('Error processing file');
    } finally {
      setIsGeneratingFromFile(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const updated: AiExercise = {
        title: draft.title,
        description: draft.description,
        tasks: draft.tasks.split('\n').map((t) => t.trim()).filter(Boolean),
        starter_code: draft.starter_code,
        resource_links: draft.resource_links.filter(l => l.trim() !== ''),
        reference_files: draft.reference_files.filter(f => f.trim() !== ''),
      };
      await onUpdateLesson({ exercise_data: updated });
      setDirty(false);
      toast.success('Exercise saved');
    } catch {
      toast.error('Save failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className='flex flex-col flex-1 min-h-0'>
      {/* PREVIEW TOOLBAR */}
      <div className='flex items-center justify-between gap-2 px-3 sm:px-4 py-2 border-b border-slate-100 bg-slate-50/50 shrink-0'>
        <span className='text-[11px] font-bold text-slate-600 uppercase tracking-wider'>
          {preview ? 'Exercise Preview' : 'Exercise Editor'}
        </span>

        <button
          type='button'
          onClick={() => setPreview((v) => !v)}
          className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all border shadow-2xs ${
            preview
              ? 'bg-indigo-50 text-indigo-700 border-indigo-200 hover:bg-indigo-100'
              : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
          }`}
          title={preview ? 'Switch to edit mode' : 'Preview exercise'}
        >
          {preview ? <Pencil className='w-3.5 h-3.5 text-indigo-600' /> : <Eye className='w-3.5 h-3.5 text-slate-500' />}
          <span>{preview ? 'Edit' : 'Preview'}</span>
        </button>
      </div>
      <div className='flex-1 overflow-y-auto p-4 space-y-3'>
        {!exercise && !canEdit && (
          <div className='py-12 text-center'>
            <Code2 className='w-10 h-10 text-slate-200 mx-auto mb-3' />
            <p className='text-[13px] text-slate-400'>No exercise yet</p>
          </div>
        )}

        {(exercise || canEdit) && (
  <>
    {preview ? (
      <div className='space-y-4 text-[13px]'>

        <div>
          <h4 className='font-bold text-slate-700 mb-1'>Title</h4>
          <p>{draft.title || '—'}</p>
        </div>

        <div>
          <h4 className='font-bold text-slate-700 mb-1'>Description</h4>

          <ReactMarkdown remarkPlugins={[remarkGfm]}>
            {draft.description || 'No description'}
          </ReactMarkdown>
        </div>

        <div>
          <h4 className='font-bold text-slate-700 mb-1'>Tasks</h4>

          <ul className='list-disc pl-5 space-y-1'>
            {draft.tasks
              .split('\n')
              .filter(Boolean)
              .map((task, i) => (
                <li key={i}>{task}</li>
              ))}
          </ul>
        </div>

        {draft.starter_code?.trim() && (
          <div>
            <h4 className='font-bold text-slate-700 mb-1'>
              Starter Code
            </h4>

            <pre className='bg-slate-100 p-3 rounded-lg overflow-auto'>
              <code>{draft.starter_code}</code>
            </pre>
          </div>
        )}

        {draft.resource_links.filter(l => l.trim()).length > 0 && (
          <div>
            <h4 className='font-bold text-slate-700 mb-1'>Resource Links</h4>
            <ul className='list-disc pl-5 space-y-1'>
              {draft.resource_links.filter(l => l.trim()).map((link, idx) => (
                <li key={idx}>
                  <a href={link} target='_blank' rel='noopener noreferrer' className='text-indigo-600 hover:underline font-semibold break-all'>
                    {link}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        )}

        {draft.reference_files.filter(f => f.trim()).length > 0 && (
          <div>
            <h4 className='font-bold text-slate-700 mb-1'>Zip Files</h4>
            <ul className='list-disc pl-5 space-y-1.5'>
              {draft.reference_files.filter(f => f.trim()).map((file, idx) => {
                const isUrl = file.startsWith('http://') || file.startsWith('https://');
                const displayName = isUrl ? (() => {
                  try {
                    const decoded = decodeURIComponent(file);
                    const parts = decoded.split('/');
                    const lastPart = parts[parts.length - 1];
                    return lastPart.replace(/^\d+-/, '');
                  } catch {
                    return file;
                  }
                })() : file;
                return (
                  <li key={idx}>
                    {isUrl ? (
                      <a href={file} target='_blank' rel='noopener noreferrer' className='text-indigo-600 hover:underline font-semibold break-all inline-flex items-center gap-1'>
                        <Download className='w-3.5 h-3.5' /> {displayName}
                      </a>
                    ) : (
                      <span className='text-slate-700'>{file}</span>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </div>
    ) : (
      <>
        <div>
          <label className='block text-[11px] font-semibold text-slate-500 mb-1'>
            Title
          </label>

          <input
            disabled={!canEdit}
            value={draft.title}
            onChange={(e) => set('title', e.target.value)}
            placeholder='Exercise title...'
            className='w-full border border-slate-200 rounded-lg px-3 py-2 text-[13px] text-slate-800 placeholder:text-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-200 disabled:bg-slate-50 disabled:text-slate-400'
          />
        </div>

        <div>
          <label className='block text-[11px] font-semibold text-slate-500 mb-1'>
            Description
          </label>

          <textarea
            rows={2}
            disabled={!canEdit}
            value={draft.description}
            onChange={(e) => set('description', e.target.value)}
            placeholder='Brief description of the exercise...'
            className='w-full border border-slate-200 rounded-lg px-3 py-2 text-[13px] text-slate-700 placeholder:text-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-200 disabled:bg-slate-50 disabled:text-slate-400 resize-none'
          />
        </div>

        <div>
          <label className='block text-[11px] font-semibold text-slate-500 mb-1'>
            Tasks
          </label>

          <textarea
            rows={5}
            disabled={!canEdit}
            value={draft.tasks}
            onChange={(e) => set('tasks', e.target.value)}
            placeholder={'Task 1\nTask 2\nTask 3'}
            className='w-full border border-slate-200 rounded-lg px-3 py-2 text-[13px] text-slate-700 placeholder:text-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-200 disabled:bg-slate-50 disabled:text-slate-400 resize-none font-mono'
          />
        </div>

        <div>
          <label className='block text-[11px] font-semibold text-slate-500 mb-1'>
            Starter Code
          </label>

          <textarea
            rows={6}
            disabled={!canEdit}
            value={draft.starter_code}
            onChange={(e) => set('starter_code', e.target.value)}
            placeholder='// starter code here...'
            className='w-full border border-slate-200 rounded-lg px-3 py-2 text-[13px] text-slate-700 placeholder:text-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-200 disabled:bg-slate-50 disabled:text-slate-400 resize-none font-mono'
          />
        </div>

        <div className='space-y-2'>
          <label className='block text-[11px] font-semibold text-slate-500 mb-1'>Resource Links</label>
          {draft.resource_links.map((link, idx) => (
            <div key={`link-${idx}`} className='flex gap-2 items-center'>
              <input
                disabled={!canEdit}
                value={link}
                onChange={(e) => {
                  const newLinks = [...draft.resource_links];
                  newLinks[idx] = e.target.value;
                  set('resource_links', newLinks);
                }}
                placeholder='https://...'
                className='flex-1 border border-slate-200 rounded-lg px-3 py-2 text-[13px] text-slate-800 placeholder:text-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-200 disabled:bg-slate-50 disabled:text-slate-400'
              />
              {canEdit && draft.resource_links.length > 1 && (
                <button onClick={() => set('resource_links', draft.resource_links.filter((_, i) => i !== idx))} className='p-2 text-slate-400 hover:text-red-500 transition-colors' title='Remove link'>✕</button>
              )}
            </div>
          ))}
          {canEdit && (
            <button onClick={() => set('resource_links', [...draft.resource_links, ''])} className='text-[11px] font-bold text-indigo-600 hover:text-indigo-700 hover:underline transition-colors'>+ Add link</button>
          )}
        </div>

        <div
          className={`space-y-2 p-3 -mx-3 border-2 border-dashed rounded-xl transition-colors ${
            isDraggingFiles ? 'border-indigo-400 bg-indigo-50/50' : 'border-transparent'
          }`}
          onDragOver={(e) => {
            e.preventDefault();
            setIsDraggingFiles(true);
          }}
          onDragLeave={(e) => {
            e.preventDefault();
            setIsDraggingFiles(false);
          }}
          onDrop={async (e) => {
            e.preventDefault();
            setIsDraggingFiles(false);
            if (!canEdit) return;
            
            const droppedFiles = Array.from(e.dataTransfer.files);
            if (droppedFiles.length > 0) {
              const currentFiles = draft.reference_files.filter(f => f.trim() !== '');
              
              // We'll upload the first dropped file to a new slot for simplicity
              const newIdx = currentFiles.length;
              setUploadingFiles(prev => ({ ...prev, [newIdx]: true }));
              // Ensure there's a slot for it
              set('reference_files', [...currentFiles, 'Uploading...']);
              
              try {
                const formData = new FormData();
                formData.append('file', droppedFiles[0]);
                const res = await aiCurriculumApi.uploadFile(formData);
                if (res.data.success) {
                  set('reference_files', [...currentFiles, res.data.url]);
                  toast.success('File uploaded');
                } else {
                  set('reference_files', currentFiles.length > 0 ? currentFiles : ['']);
                  toast.error('Upload failed');
                }
              } catch (err) {
                console.error(err);
                set('reference_files', currentFiles.length > 0 ? currentFiles : ['']);
                toast.error('Failed to upload file');
              } finally {
                setUploadingFiles(prev => ({ ...prev, [newIdx]: false }));
              }
            }
          }}
        >
          <label className='block text-[11px] font-semibold text-slate-500 mb-1'>
            Zip Files <span className='font-normal text-slate-400'>(Drag & Drop files here)</span>
          </label>
          {draft.reference_files.map((file, idx) => (
            <div key={`file-${idx}`} className='flex gap-2 items-center'>
              <div className='flex-1 relative'>
                <input
                  disabled={!canEdit}
                  value={file}
                  onChange={(e) => {
                    const newFiles = [...draft.reference_files];
                    newFiles[idx] = e.target.value;
                    set('reference_files', newFiles);
                  }}
                  placeholder='Path or URL to zip file...'
                  className='w-full border border-slate-200 rounded-lg pl-3 pr-8 py-2 text-[13px] text-slate-800 placeholder:text-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-200 disabled:bg-slate-50 disabled:text-slate-400'
                />
                {canEdit && (
                  <label className='absolute right-2 top-1/2 -translate-y-1/2 cursor-pointer text-slate-400 hover:text-indigo-500 transition-colors' title='Select file'>
                    {uploadingFiles[idx] ? <Loader2 className='w-4 h-4 animate-spin text-indigo-500' /> : <Upload className='w-4 h-4' />}
                    <input
                      type='file'
                      className='hidden'
                      disabled={uploadingFiles[idx]}
                      onChange={async (e) => {
                        const files = Array.from(e.target.files || []);
                        if (files.length > 0) {
                          setUploadingFiles(prev => ({ ...prev, [idx]: true }));
                          try {
                            const formData = new FormData();
                            formData.append('file', files[0]);
                            const res = await aiCurriculumApi.uploadFile(formData);
                            if (res.data.success) {
                              const newFiles = [...draft.reference_files];
                              newFiles[idx] = res.data.url;
                              set('reference_files', newFiles);
                              toast.success('File uploaded');
                            }
                          } catch (err) {
                            console.error(err);
                            toast.error('Failed to upload file');
                          } finally {
                            setUploadingFiles(prev => ({ ...prev, [idx]: false }));
                          }
                        }
                        e.target.value = '';
                      }}
                    />
                  </label>
                )}
              </div>
              {canEdit && draft.reference_files.length > 1 && (
                <button onClick={() => set('reference_files', draft.reference_files.filter((_, i) => i !== idx))} className='p-2 text-slate-400 hover:text-red-500 transition-colors' title='Remove file'>✕</button>
              )}
            </div>
          ))}
          {canEdit && (
            <button onClick={() => set('reference_files', [...draft.reference_files, ''])} className='text-[11px] font-bold text-indigo-600 hover:text-indigo-700 hover:underline transition-colors'>+ Add file</button>
          )}
        </div>
      </>
    )}
  </>
)}
{/* 
        {(exercise || canEdit) && (
          <>
          
            <div>
              <label className='block text-[11px] font-semibold text-slate-500 mb-1'>Title</label>
              <input
                disabled={!canEdit}
                value={draft.title}
                onChange={(e) => set('title', e.target.value)}
                placeholder='Exercise title...'
                className='w-full border border-slate-200 rounded-lg px-3 py-2 text-[13px] text-slate-800 placeholder:text-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-200 disabled:bg-slate-50 disabled:text-slate-400'
              />
            </div>

            <div>
              <label className='block text-[11px] font-semibold text-slate-500 mb-1'>Description</label>
              <textarea
                rows={2}
                disabled={!canEdit}
                value={draft.description}
                onChange={(e) => set('description', e.target.value)}
                placeholder='Brief description of the exercise...'
                className='w-full border border-slate-200 rounded-lg px-3 py-2 text-[13px] text-slate-700 placeholder:text-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-200 disabled:bg-slate-50 disabled:text-slate-400 resize-none'
              />
            </div>

            <div>
              <label className='block text-[11px] font-semibold text-slate-500 mb-1'>
                Tasks <span className='font-normal text-slate-400'>(one per line)</span>
              </label>
              <textarea
                rows={5}
                disabled={!canEdit}
                value={draft.tasks}
                onChange={(e) => set('tasks', e.target.value)}
                placeholder={'Task 1\nTask 2\nTask 3'}
                className='w-full border border-slate-200 rounded-lg px-3 py-2 text-[13px] text-slate-700 placeholder:text-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-200 disabled:bg-slate-50 disabled:text-slate-400 resize-none font-mono'
              />
            </div>

            <div>
              <label className='block text-[11px] font-semibold text-slate-500 mb-1'>Starter Code</label>
              <textarea
                rows={6}
                disabled={!canEdit}
                value={draft.starter_code}
                onChange={(e) => set('starter_code', e.target.value)}
                placeholder='// starter code here...'
                className='w-full border border-slate-200 rounded-lg px-3 py-2 text-[13px] text-slate-700 placeholder:text-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-200 disabled:bg-slate-50 disabled:text-slate-400 resize-none font-mono'
              />
            </div>
          </>
        )} */}
      </div>

      {canEdit && (
        <div className='border-t border-slate-100 px-3 sm:px-4 py-2.5 sm:py-3 flex flex-wrap items-center justify-between gap-2 shrink-0 bg-slate-50/50'>
          <div className='flex items-center gap-1.5 sm:gap-2 flex-wrap'>
            <button
              onClick={onGenerate}
              disabled={generating || isGeneratingFromFile}
              className='flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 sm:py-2 text-[11px] sm:text-xs font-semibold text-indigo-600 border border-indigo-200 rounded-lg hover:bg-indigo-50 disabled:opacity-50 transition-colors min-h-[34px]'
            >
              {generating ? <Loader2 className='w-3.5 h-3.5 animate-spin' /> : <Sparkles className='w-3.5 h-3.5' />}
              <span>{generating ? 'Generating...' : exercise ? 'Regenerate' : 'Generate'}</span>
            </button>

            <input
              type="file"
              className="hidden"
              ref={fileInputRef}
              onChange={handleAutoGenerateExercise}
              disabled={isGeneratingFromFile || generating}
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={isGeneratingFromFile || generating}
              className='flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 sm:py-2 text-[11px] sm:text-xs font-semibold text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-50 transition-colors min-h-[34px]'
            >
              {isGeneratingFromFile ? <Loader2 className='w-3 h-3 animate-spin' /> : <FileText className='w-3 h-3' />}
              <span>{isGeneratingFromFile ? 'Working...' : 'Generate from File'}</span>
            </button>

            {exercise && (
              <button
                onClick={async () => {
                  try {
                    setSaving(true);
                    await onUpdateLesson({
                      exercise_data: null,
                    });
                    setDraft({
                      title: '',
                      description: '',
                      tasks: '',
                      starter_code: '',
                      resource_links: [''],
                      reference_files: [''],
                    });
                    setDirty(false);
                    toast.success('Exercise removed');
                  } catch {
                    toast.error('Failed to remove exercise');
                  } finally {
                    setSaving(false);
                  }
                }}
                disabled={saving}
                className='flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 sm:py-2 text-[11px] sm:text-xs font-semibold text-red-600 border border-red-200 rounded-lg hover:bg-red-50 disabled:opacity-50 transition-colors min-h-[34px]'
              >
                Remove
              </button>
            )}
          </div>

          <div className='flex items-center gap-2 ml-auto'>
            {dirty && <span className='text-[10px] sm:text-[11px] text-amber-500 font-semibold'>Unsaved</span>}
            <button
              onClick={handleSave}
              disabled={saving || !dirty}
              className='flex items-center justify-center gap-1.5 px-3.5 sm:px-4 py-1.5 sm:py-2 text-xs sm:text-[13px] font-bold bg-[#1e2653] text-white rounded-lg hover:bg-[#16203f] disabled:opacity-40 transition-colors min-h-[34px]'
            >
              {saving ? <Loader2 className='w-3.5 h-3.5 animate-spin' /> : <Save className='w-3.5 h-3.5' />}
              <span>{saving ? 'Saving...' : 'Save'}</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Right Sidebar ────────────────────────────────────────────────────────────

export function RightSidebar({
  selectedLesson,
  canEdit,
  onUpdateLesson,
  onGenerateLessonContent,
}: {
  selectedLesson: AiLesson | null;
  canEdit: boolean;
  onUpdateLesson: (id: string, data: Partial<AiLesson>) => Promise<void>;
  onGenerateLessonContent: (lessonId: string, type: 'video' | 'markdown' | 'exercise') => Promise<VideoResult[] | void>;
}) {
  const [tab, setTab] = useState<Tab>('video');
  const [generatingType, setGeneratingType] = useState<'video' | 'markdown' | 'exercise' | null>(null);
  const [videoResults, setVideoResults] = useState<VideoResult[]>([]);

  // Reset tab and video results when lesson changes
  useEffect(() => {
    if (selectedLesson) {
      if (selectedLesson.video_url) setTab('video');
      else if (selectedLesson.explanation) setTab('content');
      else setTab('video');
    }
    setVideoResults([]);
  }, [selectedLesson?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!selectedLesson) {
    return (
      <div className='bg-white border border-slate-200 rounded-xl h-full flex flex-col items-center justify-center py-16 text-center px-6'>
        <BookOpen className='w-10 h-10 text-slate-200 mb-3' />
        <p className='text-[13px] font-semibold text-slate-400'>Select a subtopic</p>
        <p className='text-[11px] text-slate-300 mt-1'>Click any subtopic in the tree to edit its content</p>
      </div>
    );
  }

  const handleGenerate = async (type: 'video' | 'markdown' | 'exercise') => {
    setGeneratingType(type);
    try {
      const results = await onGenerateLessonContent(selectedLesson.id, type);
      if (type === 'video' && Array.isArray(results)) {
        setVideoResults(results);
      }
    }
    finally { setGeneratingType(null); }
  };

  const handleUpdate = (data: Partial<AiLesson>) => onUpdateLesson(selectedLesson.id, data);

  const handleSelectVideo = async (videoUrl: string) => {
    try {
      await handleUpdate({ video_url: videoUrl });
      toast.success('Video selected & saved');
    } catch {
      toast.error('Failed to save video');
    }
  };

  return (
    <div className='bg-white border border-slate-200 rounded-xl flex flex-col overflow-hidden sticky top-4 max-h-[calc(100vh-120px)]'>
      {/* Subtopic header */}
      <div className='px-4 py-3 border-b border-slate-100 shrink-0'>
        <div className='flex items-center justify-between gap-2'>
          <p className='text-[13px] font-bold text-slate-800 truncate'>{selectedLesson.title}</p>
          {selectedLesson.is_new && (
            <span className='inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 shrink-0 shadow-2xs animate-pulse'>
              <span className='w-1.5 h-1.5 rounded-full bg-emerald-500' />
              New Subtopic
            </span>
          )}
          {selectedLesson.is_modified && (
            <span className='inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200 shrink-0 shadow-2xs'>
              <span className='w-1.5 h-1.5 rounded-full bg-amber-500' />
              Edited Subtopic
            </span>
          )}
        </div>
        <div className='flex items-center gap-3 mt-0.5'>
          <span className='text-[11px] text-slate-400'>{selectedLesson.duration_mins ?? 20} min</span>
          <span className={`text-[11px] font-semibold ${selectedLesson.video_url ? 'text-green-500' : 'text-slate-300'}`}>
            {selectedLesson.video_url ? '● Video' : '○ Video'}
          </span>
          <span className={`text-[11px] font-semibold ${selectedLesson.explanation ? 'text-green-500' : 'text-slate-300'}`}>
            {selectedLesson.explanation ? '● Content' : '○ Content'}
          </span>
          <span className={`text-[11px] font-semibold ${selectedLesson.exercise_data ? 'text-green-500' : 'text-slate-300'}`}>
            {selectedLesson.exercise_data ? '● Exercise' : '○ Exercise'}
          </span>
        </div>
      </div>

      {selectedLesson.is_new && (
        <div className='bg-emerald-50/80 border-b border-emerald-200/80 px-4 py-2 flex items-center gap-2 text-[11px] text-emerald-900'>
          <Sparkles className='w-3.5 h-3.5 text-emerald-600 shrink-0 animate-pulse' />
          <span>This is a <strong>newly added subtopic</strong> not yet published to live students.</span>
        </div>
      )}

      <TabStrip active={tab} onTab={setTab} />

      {tab === 'video' && (
        <VideoTab
          lesson={selectedLesson}
          canEdit={canEdit}
          searching={generatingType === 'video'}
          videoResults={videoResults}
          onSearchYouTube={() => handleGenerate('video')}
          onSelectVideo={handleSelectVideo}
          onUpdateLesson={handleUpdate}
        />
      )}

      {tab === 'content' && (
        <ContentTab
          lesson={selectedLesson}
          canEdit={canEdit}
          generating={generatingType === 'markdown'}
          onGenerate={() => handleGenerate('markdown')}
          onUpdateLesson={handleUpdate}
        />
      )}

      {tab === 'exercise' && (
        <ExerciseTab
          lesson={selectedLesson}
          canEdit={canEdit}
          generating={generatingType === 'exercise'}
          onGenerate={() => handleGenerate('exercise')}
          onUpdateLesson={handleUpdate}
        />
      )}
    </div>
  );
}
