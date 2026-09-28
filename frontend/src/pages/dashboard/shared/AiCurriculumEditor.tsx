import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router';
import {
  ArrowLeft,
  ArrowRight,
  Eye,
  Loader2,
  Plus,
  Save,
  Sparkles,
} from 'lucide-react';
import toast from 'react-hot-toast';
import type {
  AiCourse,
  AiLesson,
  AiModule,
  AiTopic,
} from '@/features/aiCurriculum/types';
import { aiCurriculumApi } from '@/features/aiCurriculum/aiCurriculumApi';
import { useAppSelector } from '@/app/hooks';
import { selectUser } from '@/features/auth/authSelectors';
import { STATUS_COLORS, STATUS_LABELS } from './_editor/types';
import { InlineInput } from './_editor/InlineWidgets';
import { ModuleItem } from './_editor/CourseTree';
import { RightSidebar } from './_editor/RightSidebar';

export default function AiCurriculumEditor() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const user = useAppSelector(selectUser);
  const isAdmin = user?.role === 'admin';

  const [course, setCourse] = useState<AiCourse | null>(null);
  const [modules, setModules] = useState<AiModule[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [selectedLesson, setSelectedLesson] = useState<AiLesson | null>(null);
  const contentPreviewRef = useRef<HTMLDivElement>(null);
  const [addingModule, setAddingModule] = useState(false);
  const [savingModule, setSavingModule] = useState(false);
  const [meta, setMeta] = useState({ title: '', domain: '', duration: '' });
  const [dragModuleIdx, setDragModuleIdx] = useState<number | null>(null);
  const [dragModuleOver, setDragModuleOver] = useState<number | null>(null);

  const handleSelectLesson = (lesson: AiLesson | null) => {
    setSelectedLesson(lesson);
    if (lesson) {
      setTimeout(() => {
        if (contentPreviewRef.current) {
          contentPreviewRef.current.scrollIntoView({
            behavior: 'smooth',
            block: 'start',
          });
        }
      }, 60);
    }
  };

  const base = isAdmin
    ? '/dashboard/admin'
    : user?.role === 'curriculum_developer'
    ? '/dashboard/curriculum-developer'
    : '/dashboard/facilitator';

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const res = await aiCurriculumApi.get(id);
      const c = res.data.data;
      setCourse(c);
      setModules(c.modules || []);
      setMeta({
        title: c.title || '',
        domain: c.domain || '',
        duration: c.duration_weeks ? `${c.duration_weeks}` : '',
      });
    } catch {
      toast.error('Failed to load course');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  const canEdit = Boolean(course);
  const totalTopics = useMemo(
    () => (modules || []).reduce((s, m) => s + (m.topics || []).length, 0),
    [modules],
  );
  const totalLessons = useMemo(
    () =>
      (modules || []).reduce(
        (s, m) => s + (m.topics || []).reduce((ts, t) => ts + (t.lessons || []).length, 0),
        0,
      ),
    [modules],
  );

  // ── Module DnD ────────────────────────────────────────────────────────────────

  const handleDropModule = useCallback(
    async (from: number, to: number) => {
      if (from === to) return;
      const reordered = [...modules];
      const [moved] = reordered.splice(from, 1);
      reordered.splice(to, 0, moved);
      setModules(reordered);
      setDragModuleIdx(null);
      setDragModuleOver(null);
      try {
        await aiCurriculumApi.reorderModules(
          id!,
          reordered.map((m, i) => ({ id: m.id, order_index: i })),
        );
      } catch {
        toast.error('Failed to reorder modules');
        load();
      }
    },
    [modules, id, load],
  );

  // ── State updaters ─────────────────────────────────────────────────────────────

  const handleAddModule = useCallback(
    async (title: string) => {
      if (!id) return;
      setSavingModule(true);
      try {
        const res = await aiCurriculumApi.addModule(id, title);
        setModules((ms) => [...ms, res.data.data]);
        setAddingModule(false);
        toast.success('Topic added');
      } catch {
        toast.error('Failed to add module');
      } finally {
        setSavingModule(false);
      }
    },
    [id],
  );

  const handleAddTopic = useCallback(
    (moduleId: string, topic: AiTopic) =>
      setModules((ms) =>
        ms.map((m) =>
          m.id === moduleId
            ? { ...m, topics: [...(m.topics || []), topic] }
            : m,
        ),
      ),
    [],
  );

  const handleAddLesson = useCallback(
    (topicId: string, lesson: AiLesson) =>
      setModules((ms) =>
        ms.map((m) => ({
          ...m,
          topics: (m.topics || []).map((t) =>
            t.id === topicId
              ? { ...t, lessons: [...(t.lessons || []), lesson] }
              : t,
          ),
        })),
      ),
    [],
  );


  const handleDeleteModule = useCallback(
    (moduleId: string) => {
      setModules((ms) => {
        const mod = ms.find((m) => m.id === moduleId);
        if (
          mod?.topics?.some((t) =>
            t.lessons?.some((l) => l.id === selectedLesson?.id),
          )
        )
          setSelectedLesson(null);
        return ms.filter((m) => m.id !== moduleId);
      });
    },
    [selectedLesson?.id],
  );

  const handleDeleteTopic = useCallback(
    (moduleId: string, topicId: string) => {
      setModules((ms) => {
        const topic = ms
          .find((m) => m.id === moduleId)
          ?.topics?.find((t) => t.id === topicId);
        if (topic?.lessons?.some((l) => l.id === selectedLesson?.id))
          setSelectedLesson(null);
        return ms.map((m) =>
          m.id === moduleId
            ? { ...m, topics: (m.topics || []).filter((t) => t.id !== topicId) }
            : m,
        );
      });
    },
    [selectedLesson?.id],
  );

  const handleDeleteLesson = useCallback(
    (_topicId: string, lessonId: string) => {
      if (selectedLesson?.id === lessonId) setSelectedLesson(null);
      setModules((ms) =>
        ms.map((m) => ({
          ...m,
          topics: (m.topics || []).map((t) => ({
            ...t,
            lessons: (t.lessons || []).filter((l) => l.id !== lessonId),
          })),
        })),
      );
    },
    [selectedLesson?.id],
  );

  const handleReorderTopics = useCallback(
    (moduleId: string, topics: AiTopic[]) =>
      setModules((ms) =>
        ms.map((m) => (m.id === moduleId ? { ...m, topics } : m)),
      ),
    [],
  );

  const handleRenameModule = useCallback(
    (moduleId: string, title: string) =>
      setModules((ms) =>
        ms.map((m) => (m.id === moduleId ? { ...m, title } : m)),
      ),
    [],
  );

  const handleRenameTopic = useCallback(
    (moduleId: string, topicId: string, title: string) =>
      setModules((ms) =>
        ms.map((m) =>
          m.id === moduleId
            ? {
                ...m,
                topics: m.topics.map((t) =>
                  t.id === topicId ? { ...t, title } : t,
                ),
              }
            : m,
        ),
      ),
    [],
  );

  const handleUpdateTopic = useCallback(
    (topicId: string, data: Partial<AiTopic>) =>
      setModules((ms) =>
        ms.map((m) => ({
          ...m,
          topics: m.topics.map((t) =>
            t.id === topicId ? { ...t, ...data } : t,
          ),
        })),
      ),
    [],
  );

  const handleGenerateUnits = useCallback(async (moduleId: string) => {
    try {
      const res = await aiCurriculumApi.generateAndSaveUnits(moduleId);
      const newData = res.data.data;
      if (newData.length === 0) {
        toast('Units already exist — no duplicates added', { icon: 'ℹ️' });
        return;
      }
      setModules((ms) =>
        ms.map((m) =>
          m.id === moduleId
            ? { ...m, topics: [...m.topics, ...newData] }
            : m,
        ),
      );
      toast.success(
        `${newData.length} unit${newData.length !== 1 ? 's' : ''} generated`,
      );
    } catch {
      toast.error('Failed to generate units');
    }
  }, []);

  const handleGenerateSubtopics = useCallback(async (topicId: string) => {
    try {
      const res = await aiCurriculumApi.generateAndSaveSubtopics(topicId);
      const newData = res.data.data;
      if (newData.length === 0) {
        toast('Subtopics already exist — no duplicates added', { icon: 'ℹ️' });
        return;
      }
      setModules((ms) =>
        ms.map((m) => ({
          ...m,
          topics: m.topics.map((t) =>
            t.id === topicId
              ? { ...t, lessons: [...t.lessons, ...newData] }
              : t,
          ),
        })),
      );
      toast.success(
        `${newData.length} subtopic${newData.length !== 1 ? 's' : ''} generated`,
      );
    } catch {
      toast.error('Failed to generate subtopics');
    }
  }, []);

  const handleGenerateTopicQuiz = useCallback(
    async (topicId: string) => {
      try {
        const res = await aiCurriculumApi.generateUnitQuiz(topicId);
        handleUpdateTopic(topicId, { quiz_questions: res.data.data });
        toast.success(`Quiz generated (${res.data.data.length} questions)`);
      } catch {
        toast.error('Failed to generate quiz');
      }
    },
    [handleUpdateTopic],
  );

  const handleGenerateTopicAssignment = useCallback(
    async (topicId: string) => {
      try {
        const res = await aiCurriculumApi.generateUnitAssignment(topicId);
        handleUpdateTopic(topicId, { assignment: res.data.data });
        toast.success('Assignment generated');
      } catch {
        toast.error('Failed to generate assignment');
      }
    },
    [handleUpdateTopic],
  );

  const handleUpdateModule = useCallback(
    (moduleId: string, data: Partial<AiModule>) =>
      setModules((ms) => ms.map((m) => m.id === moduleId ? { ...m, ...data } : m)),
    [],
  );

  const handleGenerateModuleCapstone = useCallback(
    async (moduleId: string) => {
      try {
        const res = await aiCurriculumApi.generateCapstone(moduleId);
        handleUpdateModule(moduleId, { capstone_project: res.data.data });
        toast.success('Capstone project generated');
      } catch {
        toast.error('Failed to generate capstone');
      }
    },
    [handleUpdateModule],
  );

  const handleGenerateLessonContent = useCallback(
    async (lessonId: string, type: 'video' | 'markdown' | 'exercise') => {
      try {
        const res = await aiCurriculumApi.generateLessonContent(lessonId, type);
        const data = res.data.data as Record<string, unknown>;
        let patch: Partial<AiLesson>;
        if (type === 'video') {
          patch = { video_url: data.video_url as string };
        } else if (type === 'markdown') {
          patch = {
            explanation: data.explanation as string,
            example: data.example as string,
            activity: data.activity as string,
            interview_questions: data.interview_questions as string[],
            duration_mins: (data.duration_mins as number) ?? undefined,
          };
        } else {
          patch = { exercise_data: data.exercise as AiLesson['exercise_data'] };
        }
        setModules((ms) =>
          ms.map((m) => ({
            ...m,
            topics: m.topics.map((t) => ({
              ...t,
              lessons: t.lessons.map((l) =>
                l.id === lessonId ? { ...l, ...patch } : l,
              ),
            })),
          })),
        );
        setSelectedLesson((l) => (l?.id === lessonId ? { ...l, ...patch } : l));
        toast.success(
          `${type === 'video' ? 'Video link' : type === 'markdown' ? 'Content' : 'Exercise'} generated`,
        );

        // Return video results for the sidebar to display
        if (type === 'video' && Array.isArray(data.video_results)) {
          return data.video_results as { videoId: string; title: string; thumbnail: string; channel: string; url: string }[];
        }
      } catch {
        toast.error(`Failed to generate ${type}`);
      }
    },
    [],
  );

  const handleRenameLesson = useCallback((lessonId: string, title: string) => {
    setModules((ms) =>
      ms.map((m) => ({
        ...m,
        topics: m.topics.map((t) => ({
          ...t,
          lessons: t.lessons.map((l) =>
            l.id === lessonId ? { ...l, title } : l,
          ),
        })),
      })),
    );
    setSelectedLesson((l) => (l?.id === lessonId ? { ...l, title } : l));
  }, []);

  const handleUpdateLesson = useCallback(
    async (lessonId: string, data: Partial<AiLesson>) => {
      await aiCurriculumApi.updateLesson(lessonId, data);
      setModules((ms) =>
        ms.map((m) => ({
          ...m,
          topics: m.topics.map((t) => ({
            ...t,
            lessons: t.lessons.map((l) =>
              l.id === lessonId ? { ...l, ...data } : l,
            ),
          })),
        })),
      );
      setSelectedLesson((l) => (l?.id === lessonId ? { ...l, ...data } : l));
    },
    [],
  );

  const handleSaveDraft = useCallback(async () => {
    if (!course) return;
    setSaving(true);
    try {
      await aiCurriculumApi.update(id!, {
        title: meta.title || course.title,
        domain: meta.domain || course.domain,
        learning_goal: course.learning_goal,
        duration_weeks: meta.duration
          ? Number(meta.duration)
          : (course.duration_weeks ?? undefined),
        daily_hours: course.daily_hours ?? undefined,
        content_preference: course.content_preference ?? undefined,
      });
      setCourse((c) =>
        c
          ? {
              ...c,
              title: meta.title || c.title,
              domain: meta.domain || c.domain,
            }
          : c,
      );
      toast.success('Draft saved');
    } catch {
      toast.error('Save failed');
    } finally {
      setSaving(false);
    }
  }, [course, id, meta]);

  const handleSubmit = useCallback(async () => {
    setSubmitting(true);
    try {
      await aiCurriculumApi.submit(id!);
      toast.success('Submitted for review');
      setCourse((c) => (c ? { ...c, status: 'in_review' } : c));
    } catch (err) {
      const msg = (err as { response?: { data?: { message?: string } } })
        ?.response?.data?.message;
      toast.error(msg || 'Failed to submit');
    } finally {
      setSubmitting(false);
    }
  }, [id]);

  const handlePublish = useCallback(async () => {
    setPublishing(true);
    try {
      await aiCurriculumApi.publish(id!);
      toast.success('Course published!');
      navigate(`${base}/ai-curriculum`);
    } catch (err) {
      const msg = (err as { response?: { data?: { message?: string } } })
        ?.response?.data?.message;
      toast.error(msg || 'Failed to publish');
    } finally {
      setPublishing(false);
    }
  }, [id, navigate, base]);

  if (loading) {
    return (
      <div className='flex items-center justify-center h-screen bg-slate-50'>
        <div className='text-center'>
          <Loader2 className='w-8 h-8 animate-spin text-indigo-500 mx-auto mb-3' />
          <p className='text-sm text-slate-400'>Loading editor...</p>
        </div>
      </div>
    );
  }

  if (!course)
    return <div className='p-8 text-slate-500'>Course not found.</div>;

  return (
    <div className='flex flex-col min-h-screen bg-slate-50'>
      {/* Top bar */}
      <div className='border-b border-slate-200 bg-white px-3.5 sm:px-8 py-3 sm:py-4 shrink-0'>
        <div className='flex flex-col sm:flex-row sm:items-center justify-between gap-3'>
          <div className='flex items-center gap-3 min-w-0'>
            <button
              onClick={() => navigate(`${base}/ai-curriculum`)}
              className='p-1.5 hover:bg-slate-100 rounded-lg text-slate-500 transition-colors shrink-0 min-h-[36px] min-w-[36px] flex items-center justify-center'
            >
              <ArrowLeft className='w-4 h-4' />
            </button>
            <div className='min-w-0 flex-1'>
              <div className='flex items-center gap-2 flex-wrap'>
                <h1 className='text-base sm:text-lg font-bold text-slate-900 truncate tracking-tight'>
                  {course.title}
                </h1>
                <span
                  className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wide shrink-0 ${
                    STATUS_COLORS[course.status] ??
                    'bg-slate-100 text-slate-600'
                  }`}
                >
                  {STATUS_LABELS[course.status]}
                </span>
              </div>
              <p className='text-xs text-slate-500 mt-0.5 truncate'>
                {modules.length} topics · {totalTopics} units · {totalLessons}{' '}
                subtopics · Double-click to rename
              </p>
            </div>
          </div>
          <div className='flex items-center gap-1.5 sm:gap-2 flex-wrap shrink-0'>
            <button
              onClick={handleSaveDraft}
              disabled={saving}
              className='flex items-center gap-1.5 px-3 sm:px-4 py-2 text-xs sm:text-sm text-slate-600 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 disabled:opacity-50 transition-colors min-h-[36px]'
            >
              {saving ? (
                <Loader2 className='w-3.5 h-3.5 animate-spin' />
              ) : (
                <Save className='w-3.5 h-3.5' />
              )}{' '}
              {course.status === 'published' ? 'Save Changes' : 'Save Draft'}
            </button>
            <button
              onClick={() => navigate(`${base}/ai-curriculum/${id}/preview`)}
              className='flex items-center gap-1.5 px-3 sm:px-4 py-2 text-xs sm:text-sm text-slate-600 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors min-h-[36px]'
            >
              <Eye className='w-3.5 h-3.5' /> Preview
            </button>
            {isAdmin && course.status === 'in_review' && (
              <button
                onClick={() => navigate(`${base}/ai-curriculum/${id}/review`)}
                className='flex items-center gap-1.5 px-4 sm:px-5 py-2 text-xs sm:text-sm font-semibold bg-yellow-500 text-white rounded-xl hover:bg-yellow-600 transition-colors min-h-[36px]'
              >
                Review Course
              </button>
            )}
            {isAdmin && course.status === 'published' && Boolean(course.has_unpublished_changes) && (
              <button
                onClick={() => navigate(`${base}/ai-curriculum/${id}/review`)}
                className='flex items-center gap-1.5 px-4 sm:px-5 py-2 text-xs sm:text-sm font-semibold bg-amber-500 text-white rounded-xl hover:bg-amber-600 transition-colors min-h-[36px]'
              >
                <Sparkles className='w-3.5 h-3.5' />
                Review Changes
              </button>
            )}
            {!isAdmin && course.status !== 'in_review' && (
              <button
                onClick={handleSubmit}
                disabled={submitting}
                className='flex items-center gap-1.5 px-4 sm:px-5 py-2 text-xs sm:text-sm font-semibold bg-[#1e2653] text-white rounded-xl hover:bg-[#16203f] disabled:opacity-50 transition-colors min-h-[36px]'
              >
                {submitting ? (
                  <Loader2 className='w-4 h-4 animate-spin' />
                ) : (
                  <>
                    {course.status === 'published'
                      ? 'Submit Updates'
                      : course.status === 'changes_requested'
                      ? 'Resubmit'
                      : 'Submit'}{' '}
                    <ArrowRight className='w-4 h-4' />
                  </>
                )}
              </button>
            )}
            {isAdmin && (course.status === 'approved' || (course.status === 'published' && course.subject_id)) && (
              <button
                onClick={handlePublish}
                disabled={publishing}
                className='flex items-center gap-1.5 px-4 sm:px-5 py-2 text-xs sm:text-sm font-semibold bg-green-600 text-white rounded-xl hover:bg-green-700 disabled:opacity-50 transition-colors min-h-[36px]'
              >
                {publishing ? (
                  <Loader2 className='w-4 h-4 animate-spin' />
                ) : (
                  <Sparkles className='w-4 h-4' />
                )}{' '}
                {course.status === 'published' || course.subject_id ? 'Republish Course' : 'Publish Course'}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Metadata strip */}
      <div className='px-3.5 sm:px-8 pt-3 sm:pt-4 pb-2 sm:pb-3 shrink-0'>
        <div className='bg-white border border-slate-200 rounded-2xl overflow-hidden grid grid-cols-1 sm:grid-cols-3 divide-y sm:divide-y-0 sm:divide-x divide-slate-100 shadow-xs'>
          {[
            {
              label: 'Course Title',
              key: 'title' as const,
              placeholder: 'Course Title',
            },
            { label: 'Domain', key: 'domain' as const, placeholder: 'Domain' },
            {
              label: 'Duration (weeks)',
              key: 'duration' as const,
              placeholder: 'e.g. 8',
            },
          ].map(({ label, key, placeholder }) => (
            <div key={key} className='px-4 py-2.5 sm:py-3'>
              <label className='block text-[10px] font-semibold text-slate-400 uppercase tracking-widest mb-1'>
                {label}
              </label>
              <input
                className='w-full text-xs sm:text-sm text-slate-700 placeholder:text-slate-300 focus:outline-none bg-transparent disabled:text-slate-400'
                placeholder={placeholder}
                disabled={!canEdit}
                value={meta[key]}
                onChange={(e) =>
                  setMeta((m) => ({ ...m, [key]: e.target.value }))
                }
              />
            </div>
          ))}
        </div>
        {course.status === 'changes_requested' && course.reviews?.[0] && (
          <div className='mt-3 bg-orange-50 border border-orange-200 rounded-xl px-4 py-3'>
            <p className='text-xs sm:text-sm font-semibold text-orange-800 mb-0.5'>
              Changes Requested
            </p>
            {course.reviews[0].feedback?.suggestions && (
              <p className='text-xs sm:text-sm text-orange-700'>
                {course.reviews[0].feedback.suggestions}
              </p>
            )}
            {course.reviews[0].feedback?.missing_skills && (
              <p className='text-xs sm:text-sm text-orange-600 mt-1'>
                Missing skills: {course.reviews[0].feedback.missing_skills}
              </p>
            )}
          </div>
        )}
        {course.status === 'published' && (
          <div className='mt-3 text-xs sm:text-sm text-blue-800 bg-blue-50 border border-blue-200 rounded-xl px-4 py-2.5 sm:py-3 flex items-center gap-2.5'>
            <span className='w-2 h-2 rounded-full bg-blue-500 shrink-0 animate-pulse' />
            <div className='flex-1'>
              <span className='font-semibold'>Live Course in Production:</span> Students are actively learning from the published version.
              {course.has_unpublished_changes ? (
                <span className='ml-1 text-amber-900 font-medium'>
                  — <strong>New draft changes are pending.</strong> {isAdmin ? 'Review the changes and click "Republish Course" to make them live for students.' : 'When your revisions are ready, click "Submit Updates" for admin review.'}
                </span>
              ) : (
                <span className='ml-1'>
                  You can freely edit and save your working draft here without affecting active students. When your changes are complete, submit them for review so an Admin can republish.
                </span>
              )}
            </div>
          </div>
        )}
        {course.status === 'in_review' && (
          <div className='mt-3 text-xs sm:text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-xl px-4 py-2.5 sm:py-3 flex items-center gap-2.5'>
            <span className='w-2 h-2 rounded-full bg-amber-500 shrink-0' />
            <div className='flex-1'>
              <span className='font-semibold'>In Review:</span> This course is currently under review by an administrator. You can still refine and save your working draft.
            </div>
          </div>
        )}
        {course.status === 'approved' && (
          <div className='mt-3 text-xs sm:text-sm text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-2.5 sm:py-3 flex items-center gap-2.5'>
            <span className='w-2 h-2 rounded-full bg-emerald-500 shrink-0' />
            <div className='flex-1'>
              <span className='font-semibold'>Approved:</span> This course has been approved and is ready to be published to students.
            </div>
          </div>
        )}

        {/* Change diffing summary bar */}
        {course.pending_changes_summary && course.pending_changes_summary.total > 0 && (
          <div className='mt-3 bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-300 rounded-xl px-4 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-2xs'>
            <div className='flex items-center gap-2.5 flex-wrap'>
              <span className='flex h-2.5 w-2.5 relative shrink-0'>
                <span className='animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75'></span>
                <span className='relative inline-flex rounded-full h-2.5 w-2.5 bg-amber-500'></span>
              </span>
              <span className='text-xs sm:text-sm font-bold text-amber-950'>
                {isAdmin ? 'New Changes Awaiting Review:' : 'Your Working Revisions:'}
              </span>
              <div className='flex items-center gap-1.5 flex-wrap'>
                {course.pending_changes_summary.new_modules > 0 && (
                  <span className='inline-flex items-center text-[11px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-900 border border-amber-200'>
                    +{course.pending_changes_summary.new_modules} new topic{course.pending_changes_summary.new_modules > 1 ? 's' : ''}
                  </span>
                )}
                {course.pending_changes_summary.new_topics > 0 && (
                  <span className='inline-flex items-center text-[11px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-900 border border-emerald-200'>
                    +{course.pending_changes_summary.new_topics} new unit{course.pending_changes_summary.new_topics > 1 ? 's' : ''}
                  </span>
                )}
                {course.pending_changes_summary.new_lessons > 0 && (
                  <span className='inline-flex items-center text-[11px] font-bold px-2 py-0.5 rounded-full bg-blue-100 text-blue-900 border border-blue-200'>
                    +{course.pending_changes_summary.new_lessons} new subtopic{course.pending_changes_summary.new_lessons > 1 ? 's' : ''}
                  </span>
                )}
              </div>
            </div>
            <span className='text-[11px] text-amber-800 font-medium'>
              All additions are highlighted with green <span className='font-bold bg-emerald-100 text-emerald-800 px-1.5 py-0.5 rounded'>New</span> badges in the tree below.
            </span>
          </div>
        )}
      </div>

      {/* Course tree + sidebar */}
      <div className='px-3.5 sm:px-8 pb-10 flex-1 min-w-0'>
        <div className='flex flex-col lg:flex-row gap-4 sm:gap-6 items-start min-w-0'>
          <div className='w-full lg:basis-7/12 min-w-0 space-y-3'>
            {modules.map((mod, i) => (
              <ModuleItem
                key={mod.id}
                module={mod}
                index={i}
                selectedLessonId={selectedLesson?.id ?? null}
                canEdit={canEdit}
                onSelectLesson={handleSelectLesson}
                onDeleteLesson={handleDeleteLesson}
                onDeleteTopic={handleDeleteTopic}
                onDeleteModule={handleDeleteModule}
                onAddTopic={handleAddTopic}
                onAddLesson={handleAddLesson}
                onRenameLesson={handleRenameLesson}
                onRenameTopic={handleRenameTopic}
                onRenameModule={handleRenameModule}
                onReorderTopics={handleReorderTopics}
                onUpdateTopic={handleUpdateTopic}
                onGenerateUnits={handleGenerateUnits}
                onGenerateSubtopics={handleGenerateSubtopics}
                onGenerateTopicQuiz={handleGenerateTopicQuiz}
                onGenerateTopicAssignment={handleGenerateTopicAssignment}
                onGenerateCapstone={handleGenerateModuleCapstone}
                onUpdateModule={handleUpdateModule}
                isDragOver={dragModuleOver === i && dragModuleIdx !== i}
                dragHandlers={
                  canEdit
                    ? {
                        draggable: true,
                        onDragStart: () => setDragModuleIdx(i),
                        onDragOver: (e) => {
                          e.preventDefault();
                          setDragModuleOver(i);
                        },
                        onDrop: () => {
                          if (dragModuleIdx !== null)
                            handleDropModule(dragModuleIdx, i);
                        },
                        onDragEnd: () => {
                          setDragModuleIdx(null);
                          setDragModuleOver(null);
                        },
                      }
                    : {}
                }
              />
            ))}

            {canEdit &&
              (addingModule ? (
                <div className='bg-white border border-slate-200 rounded-xl px-4 py-3'>
                  <InlineInput
                    placeholder='Topic title...'
                    onConfirm={handleAddModule}
                    onCancel={() => setAddingModule(false)}
                    loading={savingModule}
                  />
                </div>
              ) : (
                <button
                  onClick={() => setAddingModule(true)}
                  className='w-full flex items-center justify-center gap-2 py-3.5 border-2 border-dashed border-slate-200 rounded-2xl text-xs sm:text-sm font-semibold text-slate-500 hover:border-indigo-300 hover:text-indigo-600 hover:bg-indigo-50/30 transition-all min-h-[44px]'
                >
                  <Plus className='w-4 h-4' /> Add Topic
                </button>
              ))}

          </div>
          {/* end tree column */}

          {/* Right sidebar */}
          <div
            ref={contentPreviewRef}
            id='content-preview-panel'
            className='w-full lg:basis-5/12 shrink-0 lg:sticky lg:top-6 lg:max-h-[calc(100vh-6rem)] overflow-y-auto min-w-0 scroll-mt-6'
          >
            <h3 className='text-sm sm:text-base font-bold text-slate-800 mb-2'>Content Preview</h3>
            <RightSidebar
              selectedLesson={selectedLesson}
              canEdit={canEdit}
              onUpdateLesson={handleUpdateLesson}
              onGenerateLessonContent={handleGenerateLessonContent}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
