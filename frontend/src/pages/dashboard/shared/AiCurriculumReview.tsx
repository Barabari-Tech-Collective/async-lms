import { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router';
import {
  ArrowLeft, CheckCircle, XCircle, MessageSquare, Loader2,
  Sparkles, MonitorPlay, BookOpen, ListChecks, FileText, Send,
  ClipboardList, Trophy,
} from 'lucide-react';
import { aiCurriculumApi } from '@/features/aiCurriculum/aiCurriculumApi';
import type { AiCourse, AiModule, AiLesson, ReviewFeedback, CourseAction } from '@/features/aiCurriculum/types';
import toast from 'react-hot-toast';
import { useAppSelector } from '@/app/hooks';
import { selectUser } from '@/features/auth/authSelectors';

// ─── Constants ────────────────────────────────────────────────────────────────

const TYPE_ICON: Record<string, React.ElementType> = {
  video: MonitorPlay, exercise: BookOpen, quiz: ListChecks, reading: FileText,
};
const TYPE_COLOR: Record<string, string> = {
  video: 'text-blue-500', exercise: 'text-green-500',
  quiz: 'text-orange-400', reading: 'text-purple-500',
};

// ─── Lesson row ────────────────────────────────────────────────────────────────

function LessonRow({ lesson }: { lesson: AiLesson }) {
  const Icon = TYPE_ICON[lesson.lesson_type] ?? MonitorPlay;
  const iconColor = TYPE_COLOR[lesson.lesson_type] ?? 'text-blue-500';
  return (
    <div className='flex items-center gap-3 py-1.5'>
      <Icon className={`w-4 h-4 shrink-0 ${iconColor}`} />
      <span className='flex-1 text-[13px] text-slate-700'>{lesson.title}</span>
      {lesson.is_new && (
        <span className='inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 shrink-0 shadow-2xs animate-pulse'>
          <span className='w-1.5 h-1.5 rounded-full bg-emerald-500' />
          New
        </span>
      )}
      {lesson.is_modified && (
        <span className='inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200 shrink-0 shadow-2xs'>
          <span className='w-1.5 h-1.5 rounded-full bg-amber-500' />
          Edited
        </span>
      )}
      <span className='text-[12px] text-slate-400 shrink-0'>{lesson.duration_mins ?? 15} min</span>
      <span className='text-[11px] text-slate-400 border border-slate-200 rounded px-1.5 py-px shrink-0 font-medium'>
        Required
      </span>
    </div>
  );
}

// ─── Module card ──────────────────────────────────────────────────────────────

function ModuleCard({ mod, index }: { mod: AiModule; index: number }) {
  return (
    <div className='bg-white border border-slate-200 rounded-xl px-6 py-5'>
      <div className='flex items-center gap-2 mb-4 flex-wrap'>
        <h3 className='text-[15px] font-bold text-slate-800'>
          Topic {index + 1}: {mod.title}
        </h3>
        {mod.is_new && (
          <span className='inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 shrink-0'>
            <span className='w-1.5 h-1.5 rounded-full bg-emerald-500' />
            New Topic
          </span>
        )}
      </div>
      <div className='space-y-4'>
        {mod.topics.map((topic) => (
          <div key={topic.id}>
            <div className='flex items-center gap-2 mb-1.5 flex-wrap'>
              <p className='text-[12px] font-bold text-slate-500'>Unit: {topic.title}</p>
              {topic.is_new && (
                <span className='inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 shrink-0'>
                  <span className='w-1.5 h-1.5 rounded-full bg-emerald-500' />
                  New Unit
                </span>
              )}
            </div>
            <div className='space-y-0.5 pl-1'>
              {topic.lessons.map((lesson) => (
                <LessonRow key={lesson.id} lesson={lesson} />
              ))}
            </div>
            {topic.assignment && (
              <div className='mt-2 flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-amber-50 border border-amber-200'>
                <ClipboardList className='w-3.5 h-3.5 text-amber-500 shrink-0' />
                <span className='text-[12px] font-semibold text-amber-700 truncate flex-1'>
                  Assignment: {topic.assignment.title}
                </span>
                <span className='text-[11px] text-amber-500 shrink-0'>{topic.assignment.max_score} pts</span>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Admin review panel ───────────────────────────────────────────────────────

function AdminReviewPanel({
  course,
  action,
  setAction,
  feedback,
  setFeedback,
  onReview,
  submitting,
}: {
  course: AiCourse;
  action: CourseAction | '';
  setAction: (a: CourseAction | '') => void;
  feedback: ReviewFeedback;
  setFeedback: React.Dispatch<React.SetStateAction<ReviewFeedback>>;
  onReview: (action: CourseAction, feedback: ReviewFeedback) => void;
  submitting: boolean;
}) {

  const ACTIONS = [
    { value: 'approved' as CourseAction, label: 'Approve', icon: CheckCircle, active: 'bg-green-600 text-white border-green-600', hover: 'hover:border-green-400 hover:text-green-600' },
    { value: 'changes_requested' as CourseAction, label: 'Request Changes', icon: MessageSquare, active: 'bg-orange-500 text-white border-orange-500', hover: 'hover:border-orange-400 hover:text-orange-600' },
    { value: 'rejected' as CourseAction, label: 'Reject', icon: XCircle, active: 'bg-red-600 text-white border-red-600', hover: 'hover:border-red-400 hover:text-red-600' },
  ] as const;

  return (
    <div className='bg-white border border-slate-200 rounded-xl p-5 space-y-5 sticky top-6'>
      <div>
        <h3 className='text-sm font-bold text-slate-800 mb-1'>Reviewer Decision</h3>
        <p className='text-xs text-slate-400'>"{course.title}" by {course.creator_name}</p>
      </div>

      {/* Course meta */}
      <div className='space-y-1.5 text-[12px]'>
        {[
          ['Domain', course.domain],
          ['Level', course.level],
          ['Goal', course.learning_goal],
          ['Duration', course.duration_weeks ? `${course.duration_weeks} weeks` : '—'],
          ['Style', course.content_preference || '—'],
        ].map(([k, v]) => (
          <div key={k} className='flex justify-between'>
            <span className='text-slate-400'>{k}</span>
            <span className='font-semibold text-slate-700 capitalize'>{v}</span>
          </div>
        ))}
      </div>

      <div className='border-t border-slate-100' />

      {/* Action buttons */}
      <div className='space-y-2'>
        {ACTIONS.map(({ value, label, icon: Icon, active, hover }) => (
          <button
            key={value}
            onClick={() => setAction(value)}
            className={`w-full flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm font-semibold border-2 transition-all ${
              action === value ? active : `border-slate-200 text-slate-500 ${hover}`
            }`}
          >
            <Icon className='w-4 h-4 shrink-0' /> {label}
          </button>
        ))}
      </div>

      {/* Feedback fields */}
      {action && (
        <div className='space-y-3'>
          {[
            { key: 'missing_skills', label: 'Missing Skills' },
            { key: 'suggestions', label: 'Suggestions' },
            { key: 'inline_comments', label: 'Additional Comments' },
          ].map(({ key, label }) => (
            <div key={key}>
              <label className='block text-[11px] font-bold text-slate-500 mb-1'>{label}</label>
              <textarea
                rows={2}
                className='w-full border border-slate-200 rounded-lg px-3 py-2 text-[12px] focus:outline-none focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400 resize-none'
                value={feedback[key as keyof ReviewFeedback] || ''}
                onChange={(e) => setFeedback((f) => ({ ...f, [key]: e.target.value }))}
              />
            </div>
          ))}
        </div>
      )}

      {/* Review history */}
      {course.reviews?.length > 0 && (
        <>
          <div className='border-t border-slate-100' />
          <div>
            <p className='text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2'>Review History</p>
            <div className='space-y-2'>
              {course.reviews.map((r) => (
                <div key={r.id} className='text-[11px] border border-slate-100 rounded-lg px-3 py-2'>
                  <div className='flex items-center justify-between mb-0.5'>
                    <span className='font-bold text-slate-700'>{r.reviewer_name}</span>
                    <span className={`px-1.5 py-px rounded-full font-bold ${
                      r.action === 'approved' ? 'bg-green-100 text-green-700' :
                      r.action === 'rejected' ? 'bg-red-100 text-red-700' :
                      'bg-orange-100 text-orange-700'
                    }`}>
                      {r.action.replace('_', ' ')}
                    </span>
                  </div>
                  {r.feedback?.suggestions && (
                    <p className='text-slate-500 mt-0.5'>{r.feedback.suggestions}</p>
                  )}
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      <div className='flex gap-2'>
        <button
          onClick={() => { if (!action) { toast.error('Select an action'); return; } onReview(action as CourseAction, feedback); }}
          disabled={!action || submitting}
          className='flex-1 flex items-center justify-center gap-2 py-2.5 bg-[#1e2653] text-white text-sm font-bold rounded-lg hover:bg-[#16203f] disabled:opacity-50 transition-colors'
        >
          {submitting ? <Loader2 className='w-4 h-4 animate-spin' /> : <CheckCircle className='w-4 h-4' />}
          Submit
        </button>
        <button
          disabled={submitting}
          className='px-3 py-2.5 text-sm font-semibold text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-50 transition-colors'
        >
          Draft
        </button>
      </div>
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function AiCurriculumReview() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const user = useAppSelector(selectUser);
  const isAdmin = user?.role === 'admin';
  const base = isAdmin
    ? '/dashboard/admin'
    : user?.role === 'curriculum_developer'
    ? '/dashboard/curriculum-developer'
    : '/dashboard/facilitator';

  const [course, setCourse] = useState<AiCourse | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [reviewAction, setReviewAction] = useState<CourseAction | ''>('');
  const [reviewFeedback, setReviewFeedback] = useState<ReviewFeedback>({
    missing_skills: '', incorrect_content: '',
    difficulty_issues: '', suggestions: '', inline_comments: '',
  });

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const res = await aiCurriculumApi.get(id);
      setCourse(res.data.data);
    } catch {
      toast.error('Failed to load course');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  const handleSubmitForReview = async () => {
    setSubmitting(true);
    try {
      await aiCurriculumApi.submit(id!);
      toast.success('Submitted for review!');
      setCourse((c) => c ? { ...c, status: 'in_review' } : c);
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Failed to submit');
    } finally {
      setSubmitting(false);
    }
  };

  const handleAdminReview = async (action: CourseAction, feedback: ReviewFeedback) => {
    setSubmitting(true);
    try {
      await aiCurriculumApi.review(id!, action, feedback);
      toast.success(`Course ${action.replace('_', ' ')}`);
      navigate(`${base}/ai-curriculum`);
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Review failed');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className='flex items-center justify-center h-screen bg-slate-50'>
        <Loader2 className='w-6 h-6 animate-spin text-indigo-500' />
      </div>
    );
  }

  if (!course) return <div className='p-8 text-slate-500'>Course not found.</div>;

  // Aggregate stats
  const totalTopics = course.modules.reduce((s, m) => s + m.topics.length, 0);
  const totalLessons = course.modules.reduce((s, m) =>
    s + m.topics.reduce((ts, t) => ts + t.lessons.length, 0), 0);

  const canSubmit =
    ['draft', 'changes_requested', 'published', 'approved'].includes(course.status) &&
    !isAdmin;
  const isAdminReview =
    isAdmin &&
    (course.status === 'in_review' ||
      (course.status === 'published' && Boolean(course.has_unpublished_changes)));

  return (
    <div className='min-h-screen bg-slate-50 flex flex-col'>
      {/* ── Page content ── */}
      <div className={`flex-1 pb-24 ${isAdminReview ? 'max-w-6xl' : 'max-w-3xl'} mx-auto w-full px-6 pt-6`}>

        {/* Breadcrumb */}
        <div className='flex items-center gap-1.5 text-[11px] text-slate-400 mb-4'>
          <span className='hover:text-slate-600 cursor-pointer' onClick={() => navigate(base)}>Dashboard</span>
          <span>/</span>
          <span className='hover:text-slate-600 cursor-pointer' onClick={() => navigate(`${base}/ai-curriculum`)}>Courses</span>
          <span>/</span>
          <span className='text-slate-600 font-semibold'>Submit for Review</span>
        </div>

        {/* Header */}
        <div className='flex items-center gap-3 mb-4 sm:mb-6'>
          <button
            onClick={() => navigate(`${base}/ai-curriculum/${id}/edit`)}
            className='p-1.5 hover:bg-white rounded-xl text-slate-500 border border-transparent hover:border-slate-200 transition-colors min-h-[36px] min-w-[36px] flex items-center justify-center'
          >
            <ArrowLeft className='w-4 h-4' />
          </button>
          <div className='min-w-0 flex-1'>
            <h1 className='text-xl sm:text-2xl font-extrabold text-slate-800 tracking-tight'>
              {isAdminReview ? 'Review Course' : 'Review & Submit'}
            </h1>
            <p className='text-xs sm:text-[13px] text-slate-400 mt-0.5 truncate'>
              {isAdminReview
                ? `Reviewing "${course.title}" by ${course.creator_name}`
                : 'Review your course before submitting for approval'}
            </p>
          </div>
        </div>

        <div className={isAdminReview ? 'flex flex-col lg:flex-row gap-6 items-start min-w-0' : 'min-w-0'}>
          {/* Main content */}
          <div className='flex-1 min-w-0 space-y-4 w-full'>
            {/* Stats strip */}
            <div className='bg-white border border-slate-200 rounded-2xl px-4 sm:px-6 py-4 grid grid-cols-2 sm:grid-cols-4 gap-4 sm:gap-0 sm:divide-x divide-slate-100 shadow-xs'>
              <div className='sm:pr-6 min-w-0'>
                <p className='text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1'>Course Title</p>
                <p className='text-xs sm:text-[14px] font-bold text-slate-800 truncate'>{course.title}</p>
              </div>
              <div className='sm:px-6'>
                <p className='text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1'>Topics</p>
                <p className='text-lg sm:text-[22px] font-extrabold text-slate-800'>{course.modules.length}</p>
              </div>
              <div className='sm:px-6'>
                <p className='text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1'>Units</p>
                <p className='text-lg sm:text-[22px] font-extrabold text-slate-800'>{totalTopics}</p>
              </div>
              <div className='sm:pl-6'>
                <p className='text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1'>Subtopics</p>
                <p className='text-lg sm:text-[22px] font-extrabold text-slate-800'>{totalLessons}</p>
              </div>
            </div>

            {/* Module cards */}
            {course.modules.map((mod, i) => (
              <ModuleCard key={mod.id} mod={mod} index={i} />
            ))}

            {/* Course-level capstone */}
            {course.capstone_project && (
              <div className='flex items-center gap-2.5 px-4 py-3 rounded-2xl bg-indigo-50 border border-indigo-200 shadow-xs'>
                <Trophy className='w-4 h-4 text-indigo-500 shrink-0' />
                <div className='flex-1 min-w-0'>
                  <p className='text-xs sm:text-[12px] font-bold text-indigo-700 truncate'>Final Capstone: {course.capstone_project.title}</p>
                  <p className='text-[10px] sm:text-[11px] text-indigo-500 truncate'>{course.capstone_project.description}</p>
                </div>
              </div>
            )}
          </div>

          {/* Admin review sidebar */}
          {isAdminReview && (
            <div className='w-full lg:w-80 shrink-0'>
              <AdminReviewPanel
                course={course}
                action={reviewAction}
                setAction={setReviewAction}
                feedback={reviewFeedback}
                setFeedback={setReviewFeedback}
                onReview={handleAdminReview}
                submitting={submitting}
              />
            </div>
          )}
        </div>
      </div>

      {/* ── Sticky bottom bar ── */}
      <div className='fixed bottom-0 left-0 right-0 bg-white/95 backdrop-blur-sm border-t border-slate-200 px-4 sm:px-6 py-3 flex items-center justify-between z-10 gap-2 shadow-md'>
        <button
          onClick={() => navigate(`${base}/ai-curriculum/${id}/edit`)}
          className='flex items-center gap-2 px-3 sm:px-4 py-2 text-xs sm:text-sm font-semibold text-slate-600 hover:text-slate-800 transition-colors min-h-[36px]'
        >
          <ArrowLeft className='w-4 h-4' /> <span className='hidden xs:inline'>Back to</span> Editor
        </button>

        <div className='flex items-center gap-2 sm:gap-3'>
          {/* Facilitator: submit for review */}
          {canSubmit && (
            <button
              onClick={handleSubmitForReview}
              disabled={submitting}
              className='flex items-center gap-2 px-4 sm:px-5 py-2 text-xs sm:text-sm font-bold bg-[#1e2653] text-white rounded-xl hover:bg-[#16203f] disabled:opacity-50 transition-colors min-h-[36px]'
            >
              {submitting ? <Loader2 className='w-4 h-4 animate-spin' /> : <Send className='w-4 h-4' />}
              <span>{course.status === 'published' ? 'Submit Updates for Review' : 'Submit for Review'}</span>
            </button>
          )}

          {/* Facilitator: pending state */}
          {course.status === 'in_review' && !isAdmin && (
            <span className='text-xs sm:text-sm font-semibold text-yellow-600 bg-yellow-50 border border-yellow-200 px-3 sm:px-4 py-1.5 sm:py-2 rounded-xl'>
              Pending Review
            </span>
          )}

          {/* Admin: publish approved or republish published course */}
          {isAdmin && (course.status === 'approved' || (course.status === 'published' && course.subject_id)) && (
            <button
              onClick={async () => {
                setSubmitting(true);
                try {
                  await aiCurriculumApi.publish(id!);
                  toast.success(course.subject_id ? 'Course republished!' : 'Course published!');
                  navigate(`${base}/ai-curriculum`);
                } catch (err: any) {
                  toast.error(err?.response?.data?.message || 'Failed to publish');
                } finally {
                  setSubmitting(false);
                }
              }}
              disabled={submitting}
              className='flex items-center gap-2 px-4 sm:px-5 py-2 text-xs sm:text-sm font-bold bg-green-600 text-white rounded-xl hover:bg-green-700 disabled:opacity-50 transition-colors min-h-[36px]'
            >
              {submitting ? <Loader2 className='w-4 h-4 animate-spin' /> : <Sparkles className='w-4 h-4' />}
              <span>{course.status === 'published' || course.subject_id ? 'Republish Course' : 'Publish Course'}</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
