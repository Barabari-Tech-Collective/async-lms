import { useEffect, useState, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router';
import {
  Loader2,
  Trash2,
  Search,
  Plus,
  Pencil,
  Sparkles,
} from 'lucide-react';
import { aiCurriculumApi } from '@/features/aiCurriculum/aiCurriculumApi';
import type { AiCourse, CourseStatus } from '@/features/aiCurriculum/types';
import toast from 'react-hot-toast';
import { useAppSelector } from '@/app/hooks';
import { selectUser } from '@/features/auth/authSelectors';

const DOT_COLORS = [
  'bg-blue-600',
  'bg-purple-600',
  'bg-emerald-500',
  'bg-orange-400',
  'bg-red-500',
  'bg-sky-500',
];

const STATUS_STYLES: Record<
  CourseStatus,
  { label: string; className: string }
> = {
  draft: { label: 'Draft', className: 'bg-slate-100 text-slate-600' },
  in_review: { label: 'In Review', className: 'bg-yellow-100 text-yellow-700' },
  changes_requested: {
    label: 'Changes Requested',
    className: 'bg-orange-100 text-orange-700',
  },
  approved: { label: 'Approved', className: 'bg-green-100 text-green-700' },
  published: { label: 'Published', className: 'bg-blue-100 text-blue-700' },
};

const STATUS_TABS: { label: string; value: CourseStatus | 'all' | 'pending_changes' }[] = [
  { label: 'All', value: 'all' },
  { label: 'Pending Changes', value: 'pending_changes' },
  { label: 'Draft', value: 'draft' },
  { label: 'In Review', value: 'in_review' },
  { label: 'Changes Requested', value: 'changes_requested' },
  { label: 'Approved', value: 'approved' },
  { label: 'Published', value: 'published' },
];

function courseCode(title: string, idx: number) {
  const words = title.trim().split(/\s+/);
  const abbr = words
    .slice(0, 3)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('');
  return `${abbr}-${String(idx + 1).padStart(3, '0')}`;
}

function CourseCard({
  course,
  index,
  isAdmin,
  onDelete,
  base,
}: {
  course: AiCourse;
  index: number;
  isAdmin: boolean;
  onDelete: (id: string) => void;
  base: string;
}) {
  const navigate = useNavigate();
  const [deleting, setDeleting] = useState(false);

  const dotColor = DOT_COLORS[index % DOT_COLORS.length];
  const status = STATUS_STYLES[course.status] ?? STATUS_STYLES.draft;

  const editPath = `${base}/ai-curriculum/${course.id}/edit`;

  const canDelete =
    course.status !== 'published' &&
    (isAdmin ||
      course.status === 'draft' ||
      course.status === 'changes_requested');

  const handleDelete = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm('Delete this course?')) return;
    setDeleting(true);
    try {
      await aiCurriculumApi.delete(course.id);
      onDelete(course.id);
      toast.success('Deleted');
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Delete failed');
    } finally {
      setDeleting(false);
    }
  };

  const moduleCount = (course as any).module_count ?? course.modules?.length ?? 0;
  const topicCount = (course as any).topic_count ?? course.modules?.reduce((acc, m) => acc + (m.topics?.length ?? 0), 0) ?? 0;

  const tags: string[] = [];
  if (course.domain) tags.push(course.domain);
  if (course.level) tags.push(course.level);
  if (course.role_focus) tags.push(course.role_focus);

  return (
    <div className='bg-white border border-slate-200 rounded-2xl p-4 sm:p-5 flex flex-col hover:shadow-sm transition-shadow h-full'>
      {/* Top row */}
      <div className='flex items-center justify-between mb-4'>
        <div className={`w-3 h-3 rounded-full ${dotColor}`} />
        <span className='text-[11px] font-bold text-slate-700 border border-slate-200 rounded-full px-2.5 py-0.5 tracking-wide'>
          {courseCode(course.title, index)}
        </span>
      </div>

      {/* Main content */}
      <div className='flex-1 flex flex-col'>
        <h3 className='font-bold text-[17px] text-slate-900 leading-tight mb-1.5'>
          {course.title}
        </h3>
        <p className='text-[13px] text-slate-500 leading-snug line-clamp-2'>
          {course.learning_goal || course.role_focus || '—'}
        </p>

        {/* Stats */}
        <div className='flex items-center gap-5 mt-4'>
          <div className='text-[13px]'>
            <span className='font-bold text-slate-800'>{moduleCount}</span>{' '}
            <span className='text-slate-400'>Topics</span>
          </div>
          <div className='text-[13px]'>
            <span className='font-bold text-slate-800'>{topicCount}</span>{' '}
            <span className='text-slate-400'>Units</span>
          </div>
        </div>

        {/* Tags */}
        {tags.length > 0 && (
          <div className='flex flex-wrap gap-2 mt-4'>
            {tags.map((tag, i) => (
              <span
                key={i}
                className='px-3 py-1 text-[11px] font-semibold text-slate-600 border border-slate-200 rounded-full capitalize'
              >
                {tag}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Status badge */}
      <div className='mt-3 mb-1 flex items-center gap-1.5 flex-wrap'>
        <span
          className={`inline-flex text-[10px] font-bold px-2 py-0.5 rounded-full ${status.className}`}
        >
          {status.label}
        </span>

        {course.status === 'published' && Boolean(course.has_unpublished_changes) && (
          <span className='inline-flex items-center gap-1 text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-amber-50 text-amber-800 border border-amber-300 shadow-2xs animate-pulse'>
            <span className='w-1.5 h-1.5 rounded-full bg-amber-500' />
            New Changes Added
          </span>
        )}

        {course.subject_id && course.status === 'in_review' && (
          <span className='inline-flex items-center gap-1 text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-orange-50 text-orange-800 border border-orange-300 shadow-2xs'>
            <span className='w-1.5 h-1.5 rounded-full bg-orange-500' />
            Revisions In Review
          </span>
        )}
      </div>

      {/* Actions */}
      <div className='mt-3.5 pt-3 border-t border-slate-100 flex flex-col sm:flex-row items-stretch gap-2'>
        {isAdmin && course.status === 'in_review' && (
          <button
            onClick={() => navigate(`${base}/ai-curriculum/${course.id}/review`)}
            className='w-full sm:flex-1 flex items-center justify-center gap-1.5 px-3 py-2 bg-yellow-500 text-white rounded-full text-xs sm:text-[13px] font-semibold hover:bg-yellow-600 transition-colors shadow-xs whitespace-nowrap min-h-[38px]'
          >
            Review Course
          </button>
        )}
        {isAdmin && course.status === 'published' && Boolean(course.has_unpublished_changes) && (
          <button
            onClick={() => navigate(`${base}/ai-curriculum/${course.id}/review`)}
            className='w-full sm:flex-1 flex items-center justify-center gap-1.5 px-3.5 py-2 bg-amber-500 text-white rounded-full text-xs sm:text-[13px] font-semibold hover:bg-amber-600 transition-colors shadow-xs whitespace-nowrap min-h-[38px]'
          >
            <Sparkles className='w-3.5 h-3.5 shrink-0' />
            <span>Review Changes</span>
          </button>
        )}
        <div className='flex items-center gap-2 w-full sm:flex-1'>
          <button
            onClick={() => navigate(editPath)}
            className='flex-1 flex items-center justify-center gap-1.5 px-3 py-2 border border-slate-200 rounded-full text-xs sm:text-[13px] font-semibold text-slate-700 hover:bg-slate-50 transition-colors whitespace-nowrap min-h-[38px]'
          >
            <Pencil className='w-3.5 h-3.5 text-slate-400 shrink-0' />
            <span>Edit</span>
          </button>
          {canDelete && (
            <button
              onClick={handleDelete}
              disabled={deleting}
              className='p-2 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-full transition-colors shrink-0 min-h-[38px] min-w-[38px] flex items-center justify-center border border-slate-100 sm:border-transparent'
              title='Delete Course'
            >
              {deleting ? (
                <Loader2 className='w-4 h-4 animate-spin' />
              ) : (
                <Trash2 className='w-4 h-4' />
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default function AiCurriculumList() {
  const navigate = useNavigate();
  const user = useAppSelector(selectUser);
  const isAdmin = user?.role === 'admin';
  const base = isAdmin
    ? '/dashboard/admin'
    : user?.role === 'curriculum_developer'
    ? '/dashboard/curriculum-developer'
    : '/dashboard/facilitator';

  const location = useLocation();
  const [courses, setCourses] = useState<AiCourse[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<CourseStatus | 'all' | 'pending_changes'>('all');

  const loadCourses = useCallback(async (showSpinner = false) => {
    if (showSpinner) setLoading(true);
    try {
      const res = await aiCurriculumApi.list();
      setCourses(res.data.data);
    } catch {
      toast.error('Failed to load courses');
    } finally {
      if (showSpinner) setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadCourses(true);
  }, [loadCourses, location.key]);

  // Refetch when browser window regains focus
  useEffect(() => {
    const handleFocus = () => loadCourses(false);
    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, [loadCourses]);

  const filtered = courses.filter((c) => {
    const matchesSearch =
      !search.trim() ||
      c.title.toLowerCase().includes(search.toLowerCase()) ||
      c.role_focus.toLowerCase().includes(search.toLowerCase()) ||
      c.domain.toLowerCase().includes(search.toLowerCase());
    const matchesStatus =
      statusFilter === 'all'
        ? true
        : statusFilter === 'pending_changes'
        ? Boolean(c.has_unpublished_changes)
        : c.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const handleDelete = (id: string) =>
    setCourses((cs) => cs.filter((c) => c.id !== id));

  // Count per status for tab badges
  const countByStatus = courses.reduce<Record<string, number>>((acc, c) => {
    acc[c.status] = (acc[c.status] ?? 0) + 1;
    if (c.has_unpublished_changes) {
      acc['pending_changes'] = (acc['pending_changes'] ?? 0) + 1;
    }
    return acc;
  }, {});

  return (
    <div className='p-2 sm:p-4 max-w-350 mx-auto min-w-0'>
      {/* Header Row */}
      <div className='flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4 sm:mb-6'>
        <div>
          <div className='flex items-center gap-2.5 flex-wrap'>
            <h1 className='text-xl sm:text-[26px] font-extrabold text-slate-800 tracking-tight'>
              Courses
            </h1>
            {user?.role === 'curriculum_developer' && (user.domain || user.role_focus) && (
              <div className='flex items-center gap-1.5'>
                {user.domain && (
                  <span className='inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200'>
                    Domain: {user.domain}
                  </span>
                )}
                {user.role_focus && (
                  <span className='inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200'>
                    Role: {user.role_focus}
                  </span>
                )}
              </div>
            )}
          </div>
          <p className='text-xs sm:text-[14px] text-slate-500 mt-0.5 sm:mt-1'>
            {user?.role === 'curriculum_developer' && (user.domain || user.role_focus)
              ? `Curriculum Developer workspace for ${[user.domain, user.role_focus].filter(Boolean).join(' • ')}`
              : 'Manage course curriculum and access'}
          </p>
        </div>
        <button
          onClick={() => navigate(`${base}/ai-curriculum/new`)}
          className='w-full sm:w-auto flex items-center justify-center gap-2 px-4 sm:px-5 py-2.5 bg-[#1e2653] text-white text-xs sm:text-sm font-semibold rounded-xl hover:bg-[#16203f] transition-colors shadow-xs min-h-[40px]'
        >
          <Plus className='w-4 h-4' /> <span>Create Course with AI</span>
        </button>
      </div>

      {/* Search + Status tabs row */}
      <div className='flex flex-col sm:flex-row sm:items-center gap-2.5 sm:gap-3 mb-4 sm:mb-6'>
        <div className='relative w-full sm:max-w-75'>
          <Search className='absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400' />
          <input
            type='text'
            placeholder='Search courses...'
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className='w-full bg-white pl-9 pr-4 py-2 border border-slate-200 rounded-xl text-xs sm:text-[13px] text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 min-h-[38px]'
          />
        </div>

        {isAdmin && (
          <div className='flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-1 w-full sm:w-auto'>
            {STATUS_TABS.map(({ label, value }) => {
              const count =
                value === 'all' ? courses.length : (countByStatus[value] ?? 0);
              return (
                <button
                  key={value}
                  onClick={() => setStatusFilter(value)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors min-h-[32px] ${
                    statusFilter === value
                      ? 'bg-[#1e2653] text-white'
                      : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  {label}
                  {count > 0 && (
                    <span
                      className={`ml-1.5 text-[10px] font-bold px-1.5 py-px rounded-full ${
                        statusFilter === value
                          ? 'bg-white/20 text-white'
                          : 'bg-slate-100 text-slate-500'
                      }`}
                    >
                      {count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Grid */}
      {loading ? (
        <div className='flex items-center justify-center h-48'>
          <Loader2 className='w-6 h-6 animate-spin text-blue-500' />
        </div>
      ) : filtered.length === 0 ? (
        <div className='text-center py-16 sm:py-20 bg-white rounded-2xl border border-slate-100 p-4'>
          <p className='text-sm font-semibold text-slate-500 mb-1'>
            No courses found
          </p>
          <p className='text-xs text-slate-400'>
            {search || statusFilter !== 'all'
              ? 'Try adjusting your search or filter.'
              : 'Create your first AI-powered course.'}
          </p>
        </div>
      ) : (
        <div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6'>
          {filtered.map((course, i) => (
            <CourseCard
              key={course.id}
              course={course}
              index={i}
              isAdmin={isAdmin}
              onDelete={handleDelete}
              base={base}
            />
          ))}
        </div>
      )}
    </div>
  );
}
