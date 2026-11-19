import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router';
import {
  Play,
  PlayCircle,
  BookOpen,
  Clock,
  Trophy,
  ChevronRight,
  Loader2,
  PartyPopper,
  RotateCcw,
  Eye,
  ShieldCheck,
  Layers,
  ListChecks,
  FileCode2,
  ArrowRight,
  FolderTree,
} from 'lucide-react';
import apiClient from '@/services/api';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { useAppSelector } from '@/app/hooks';
import { selectUser } from '@/features/auth/authSelectors';

interface SubjectInfo {
  name: string;
  description: string;
  total_topics: number;
  total_subtopics: number;
  first_lesson_slug?: string;
  subject_id?: string;
}

interface Subtopic {
  id: string;
  title: string;
  slug: string;
  is_new?: boolean;
  is_updated?: boolean;
}

interface QuizItem {
  id: string;
  is_new?: boolean;
  is_updated?: boolean;
}

interface AssignmentItem {
  id: string;
  title: string;
  is_new?: boolean;
  is_updated?: boolean;
}

interface Unit {
  id: string;
  title: string;
  slug?: string;
  subtopics: Subtopic[];
  quizzes?: QuizItem[];
  assignments?: AssignmentItem[];
}

interface Module {
  id: string;
  title: string;
  description?: string;
  units: Unit[];
  capstone?: {
    id: string;
    title: string;
  } | null;
}

interface CourseData {
  id: string;
  name: string;
  description: string;
  data: Module[];
}

const CourseIntro = () => {
  const { slug } = useParams();
  const navigate = useNavigate();
  const currentUser = useAppSelector(selectUser);
  const [course, setCourse] = useState<SubjectInfo | null>(null);
  const [modules, setModules] = useState<Module[]>([]);
  const [loading, setLoading] = useState(true);
  const [progressPercent, setProgressPercent] = useState<number>(0);
  const [lastAccessedSlug, setLastAccessedSlug] = useState<string | null>(null);

  const isFacilitator =
    currentUser?.role === 'facilitator' ||
    (typeof window !== 'undefined' &&
      window.location.pathname.startsWith('/dashboard/facilitator'));
  const baseCourseUrl = isFacilitator
    ? `/dashboard/facilitator/courses/${slug}`
    : `/dashboard/student/courses/${slug}`;

  useEffect(() => {
    const fetchCourseDetails = async () => {
      try {
        const { data } = await apiClient.get<CourseData>(`/subjects/${slug}`);
        const rawModules = data.data || [];
        setModules(rawModules);

        const totalSubtopics = rawModules.reduce((total, module) => {
          return (
            total +
            module.units.reduce(
              (unitTotal, unit) => unitTotal + (unit.subtopics?.length || 0),
              0,
            )
          );
        }, 0);

        const firstLesson = rawModules[0]?.units[0]?.subtopics[0]?.slug;

        // Guard: empty course — no topics/units/subtopics
        if (totalSubtopics === 0) {
          setCourse({
            name: data.name || 'Course Overview',
            description: data.description || '',
            total_topics: rawModules.length,
            total_subtopics: 0,
            first_lesson_slug: undefined,
            subject_id: data.id,
          });
          return;
        }

        setCourse({
          name: data.name || 'Course Overview',
          description:
            data.description || "Welcome to this course. Let's get started!",
          total_topics: rawModules.length,
          total_subtopics: totalSubtopics,
          first_lesson_slug: firstLesson,
          subject_id: data.id,
        });

        // Fetch real progress only for students
        if (!isFacilitator && currentUser?.role === 'student' && data.id) {
          apiClient
            .get(`/students/progress?subjectId=${data.id}`)
            .then((res) => {
              const d = res.data?.data;
              if (d) {
                const pct =
                  d.overall_progress !== undefined
                    ? d.overall_progress
                    : d.total_subtopics > 0
                      ? Math.round(
                          (d.completed_subtopics / d.total_subtopics) * 100,
                        )
                      : 0;
                setProgressPercent(pct);
                setLastAccessedSlug(d.last_accessed_subtopic_slug ?? null);
              }
            })
            .catch(() => {}); // not enrolled — 403 is fine, progress stays 0
        }
      } catch {
        // course remains null — fallback UI below
      } finally {
        setLoading(false);
      }
    };
    fetchCourseDetails();
  }, [slug, currentUser, isFacilitator]);

  const continueLearning = () => {
    const target =
      (!isFacilitator ? lastAccessedSlug : null) ?? course?.first_lesson_slug;
    if (target) {
      navigate(`${baseCourseUrl}/lesson/${target}`);
    }
  };

  if (loading) {
    return (
      <div className='flex h-full items-center justify-center min-h-[300px]'>
        <Loader2 className='animate-spin text-blue-600 w-8 h-8' />
      </div>
    );
  }

  // Empty course guard
  if (!course || course.total_subtopics === 0) {
    return (
      <div className='max-w-2xl mx-auto p-8 text-center space-y-4'>
        <BookOpen className='w-12 h-12 text-slate-300 mx-auto' />
        <h2 className='text-2xl font-bold text-slate-700'>
          {course?.name ?? 'Course'}
        </h2>
        <p className='text-slate-500'>
          This course has no content yet. Check back soon!
        </p>
      </div>
    );
  }

  const isInProgress = progressPercent > 0;
  const isCompleted = progressPercent >= 100;

  // Compute curriculum metrics for facilitator
  const totalAssignments = modules.reduce((total, mod) => {
    const unitAssignments = mod.units.reduce(
      (uTotal, u) => uTotal + (u.assignments?.length || 0),
      0,
    );
    return total + unitAssignments + (mod.capstone ? 1 : 0);
  }, 0);

  const totalQuizzes = modules.reduce((total, mod) => {
    return (
      total +
      mod.units.reduce((uTotal, u) => uTotal + (u.quizzes?.length || 0), 0)
    );
  }, 0);

  return (
    <div className='max-w-5xl mx-auto p-3.5 sm:p-6 md:p-8 space-y-5 sm:space-y-8 animate-in fade-in duration-300 overflow-x-hidden'>
      {/* Student Only: Course Completed banner */}
      {!isFacilitator && isCompleted && (
        <div className='flex items-center gap-3 sm:gap-4 rounded-2xl sm:rounded-3xl bg-emerald-50 border border-emerald-200 p-3.5 sm:p-6 shadow-xs'>
          <div className='p-2 sm:p-3 bg-emerald-100 rounded-xl sm:rounded-2xl shrink-0'>
            <PartyPopper className='w-5 h-5 sm:w-7 sm:h-7 text-emerald-600' />
          </div>
          <div>
            <p className='font-bold text-emerald-800 text-sm sm:text-lg'>
              Course Completed!
            </p>
            <p className='text-xs sm:text-sm text-emerald-700 mt-0.5'>
              You've finished every lesson, quiz, and assignment in this course.
              Great work!
            </p>
          </div>
        </div>
      )}

      {/* Hero Section */}
      <div className='relative overflow-hidden rounded-2xl sm:rounded-3xl bg-[#1e2653] p-4 sm:p-8 md:p-10 text-white shadow-xl'>
        <div className='relative z-10 space-y-3.5 sm:space-y-5 max-w-2xl'>
          {isFacilitator ? (
            <span className='inline-flex items-center gap-1.5 rounded-full bg-amber-400/20 border border-amber-400/30 px-2.5 sm:px-3 py-1 text-[11px] sm:text-xs font-bold uppercase tracking-wider text-amber-300'>
              <Eye className='w-3.5 h-3.5' />
              Instructor Curriculum Preview
            </span>
          ) : (
            isCompleted && (
              <span className='inline-flex items-center gap-1.5 rounded-full bg-emerald-500/20 border border-emerald-400/30 px-2.5 sm:px-3 py-1 text-[11px] sm:text-xs font-bold uppercase tracking-wider text-emerald-300'>
                <Trophy className='w-3.5 h-3.5' />
                Completed
              </span>
            )
          )}

          <h1 className='text-xl sm:text-3xl md:text-5xl capitalize font-black tracking-tight leading-tight break-words'>
            {course?.name}
          </h1>
          <p className='text-blue-100 text-xs sm:text-base md:text-lg leading-relaxed opacity-90 line-clamp-3 sm:line-clamp-none'>
            {course?.description}
          </p>

          <div className='flex flex-wrap gap-3 pt-1 sm:pt-2'>
            <Button
              size='lg'
              onClick={continueLearning}
              disabled={!course?.first_lesson_slug}
              className='w-full sm:w-auto bg-blue-600 hover:bg-blue-700 text-white font-bold h-11 sm:h-13 min-h-[44px] px-6 sm:px-8 rounded-xl shadow-lg shadow-blue-900/20 gap-2 text-xs sm:text-base cursor-pointer'
            >
              {isFacilitator ? (
                <>
                  <Play className='w-4 h-4 fill-current' />
                  <span>Jump to First Lesson</span>
                  <ArrowRight className='w-4 h-4' />
                </>
              ) : isCompleted ? (
                <>
                  <RotateCcw className='w-5 h-5' />
                  <span>Review Course</span>
                </>
              ) : (
                <>
                  <Play className='w-5 h-5 fill-current' />
                  <span>
                    {isInProgress ? 'Continue Learning' : 'Start Learning'}
                  </span>
                </>
              )}
            </Button>
          </div>
        </div>
        <div className='absolute top-0 right-0 w-1/3 h-full bg-linear-to-l from-blue-500/10 to-transparent pointer-events-none' />
      </div>

      {/* Stats Grid */}
      {isFacilitator ? (
        /* Facilitator Metrics: Focused on curriculum structure & instructor tools */
        <div className='grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-4'>
          <StatCard
            icon={<BookOpen className='w-4 h-4 sm:w-5 sm:h-5 text-blue-600' />}
            label='Curriculum'
            value={`${course?.total_topics} Topics`}
          />
          <StatCard
            icon={<Layers className='w-4 h-4 sm:w-5 sm:h-5 text-indigo-600' />}
            label='Total Lessons'
            value={`${course?.total_subtopics} Lessons`}
          />
          <StatCard
            icon={<FileCode2 className='w-4 h-4 sm:w-5 sm:h-5 text-purple-600' />}
            label='Practical Work'
            value={`${totalAssignments} Assg • ${totalQuizzes} Quiz`}
          />
          <StatCard
            icon={<ShieldCheck className='w-4 h-4 sm:w-5 sm:h-5 text-emerald-600' />}
            label='Access Level'
            value='Instructor Mode'
          />
        </div>
      ) : (
        /* Student Metrics */
        <div className='grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-6'>
          <StatCard
            icon={<BookOpen className='w-5 h-5 text-blue-600' />}
            label='Curriculum'
            value={`${course?.total_topics} Topic(s)`}
          />
          <StatCard
            icon={<Clock className='w-5 h-5 text-orange-600' />}
            label='Content'
            value={`${course?.total_subtopics} Lessons`}
          />
          <StatCard
            icon={<Trophy className='w-5 h-5 text-emerald-600' />}
            label='Certificate'
            value={isCompleted ? 'Earned' : 'On Completion'}
          />
        </div>
      )}

      {/* Student Progress Card (Students Only) */}
      {!isFacilitator && (
        <div className='bg-white border border-slate-100 rounded-2xl sm:rounded-3xl p-4 sm:p-8 shadow-xs flex flex-col sm:flex-row items-center justify-between gap-4 sm:gap-6'>
          <div className='space-y-2 w-full sm:w-1/2'>
            <div className='flex justify-between text-xs sm:text-sm font-bold mb-1'>
              <span className='text-slate-500 uppercase tracking-wider'>
                Your Progress
              </span>
              <span
                className={isCompleted ? 'text-emerald-600' : 'text-blue-600'}
              >
                {progressPercent}%
              </span>
            </div>
            <Progress
              value={progressPercent}
              className={`h-2.5 sm:h-3 bg-slate-100 ${isCompleted ? '[&>div]:bg-emerald-500' : ''}`}
            />
          </div>
          <div className='flex items-center justify-between sm:justify-end gap-4 w-full sm:w-auto'>
            <div className='text-left sm:text-right'>
              <p className='text-[10px] sm:text-xs font-bold text-slate-400 uppercase tracking-widest'>
                {isCompleted
                  ? 'Status'
                  : isInProgress
                    ? 'Last Activity'
                    : 'Status'}
              </p>
              <p
                className={`text-xs sm:text-sm font-semibold ${isCompleted ? 'text-emerald-600' : 'text-slate-700'}`}
              >
                {isCompleted
                  ? 'Completed'
                  : isInProgress
                    ? 'In progress'
                    : 'Not started yet'}
              </p>
            </div>
            <Button
              variant='outline'
              className='rounded-xl border-slate-200 font-bold min-h-[44px] px-4'
              onClick={continueLearning}
              disabled={!course?.first_lesson_slug}
            >
              {isCompleted
                ? 'Review'
                : isInProgress
                  ? 'Continue'
                  : 'View Syllabus'}{' '}
              <ChevronRight className='w-4 h-4 ml-1' />
            </Button>
          </div>
        </div>
      )}

      {/* Facilitator Curriculum Directory & Topics Breakdown */}
      {isFacilitator && (
        <div className='space-y-3.5 sm:space-y-4 pt-1 sm:pt-2'>
          <div className='flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1.5 sm:gap-1 pb-2.5 sm:pb-3 border-b border-slate-200'>
            <div>
              <h2 className='text-sm sm:text-lg font-bold text-slate-900 tracking-tight flex items-center gap-2'>
                <FolderTree className='w-4 h-4 sm:w-5 sm:h-5 text-blue-600 shrink-0' />
                <span>Curriculum Topics & Structure</span>
              </h2>
              <p className='text-[11px] sm:text-sm text-slate-500'>
                All topics, units, lessons, assignments, and quizzes in this
                course. Click any item to preview directly.
              </p>
            </div>
            <span className='text-[11px] sm:text-xs font-semibold text-slate-600 self-start sm:self-auto bg-slate-100 border border-slate-200 px-2.5 sm:px-3 py-0.5 sm:py-1 rounded-full'>
              {modules.length} {modules.length === 1 ? 'Topic' : 'Topics'} •{' '}
              {course.total_subtopics} Lessons
            </span>
          </div>

          <div className='space-y-3 sm:space-y-4'>
            {modules.map((module, mIdx) => {
              const topicSubtopicsCount = module.units.reduce(
                (tot, u) => tot + (u.subtopics?.length || 0),
                0,
              );
              const topicAssignmentsCount =
                module.units.reduce(
                  (tot, u) => tot + (u.assignments?.length || 0),
                  0,
                ) + (module.capstone ? 1 : 0);
              const topicQuizzesCount = module.units.reduce(
                (tot, u) => tot + (u.quizzes?.length || 0),
                0,
              );

              return (
                <div
                  key={module.id || mIdx}
                  className='bg-white rounded-xl sm:rounded-2xl border border-slate-200 shadow-2xs overflow-hidden'
                >
                  {/* Topic Header Bar */}
                  <div className='bg-slate-50/90 px-3.5 sm:px-6 py-2.5 sm:py-3.5 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1.5 sm:gap-2'>
                    <div className='flex items-center gap-2 sm:gap-2.5 min-w-0'>
                      <span className='w-5 h-5 sm:w-6 sm:h-6 rounded-lg bg-blue-600/10 text-blue-700 font-bold text-[11px] sm:text-xs flex items-center justify-center shrink-0'>
                        {mIdx + 1}
                      </span>
                      <h3 className='font-bold text-xs sm:text-base text-slate-900 truncate'>
                        {module.title}
                      </h3>
                    </div>
                    <div className='flex items-center flex-wrap gap-1 sm:gap-2 text-[10px] sm:text-[11px] font-semibold text-slate-500'>
                      <span>
                        {module.units.length}{' '}
                        {module.units.length === 1 ? 'Unit' : 'Units'}
                      </span>
                      <span>•</span>
                      <span>{topicSubtopicsCount} Lessons</span>
                      {topicAssignmentsCount > 0 && (
                        <>
                          <span>•</span>
                          <span className='text-indigo-600'>
                            {topicAssignmentsCount}{' '}
                            {topicAssignmentsCount === 1
                              ? 'Assignment'
                              : 'Assignments'}
                          </span>
                        </>
                      )}
                      {topicQuizzesCount > 0 && (
                        <>
                          <span>•</span>
                          <span className='text-purple-600'>
                            {topicQuizzesCount}{' '}
                            {topicQuizzesCount === 1 ? 'Quiz' : 'Quizzes'}
                          </span>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Units & Lessons Content */}
                  <div className='p-3 sm:p-5 space-y-3.5 sm:space-y-4'>
                    {module.units.map((unit, uIdx) => (
                      <div key={unit.id || uIdx} className='space-y-1.5 sm:space-y-2'>
                        <div className='text-[10px] sm:text-[11px] font-bold text-slate-400 uppercase tracking-wider px-1'>
                          Unit {uIdx + 1}: {unit.title}
                        </div>
                        <div className='grid grid-cols-1 sm:grid-cols-2 gap-1.5 sm:gap-2'>
                          {unit.subtopics?.map((sub) => (
                            <button
                              key={sub.id}
                              onClick={() =>
                                navigate(`${baseCourseUrl}/lesson/${sub.slug}`)
                              }
                              className='w-full text-left p-2.5 sm:p-3 rounded-xl border border-slate-100 hover:border-blue-300 hover:bg-blue-50/50 transition-all flex items-center justify-between gap-2 group cursor-pointer min-h-[44px]'
                            >
                              <div className='flex items-center gap-2 sm:gap-2.5 min-w-0 flex-1'>
                                <PlayCircle className='w-4 h-4 text-slate-400 group-hover:text-blue-600 shrink-0 transition-colors' />
                                <span className='text-xs sm:text-sm font-medium text-slate-800 group-hover:text-blue-900 truncate'>
                                  {sub.title}
                                </span>
                              </div>
                              <ChevronRight className='w-4 h-4 text-slate-400 group-hover:text-blue-600 group-hover:translate-x-0.5 transition-all shrink-0' />
                            </button>
                          ))}

                          {unit.quizzes?.map((quiz) => (
                            <button
                              key={quiz.id}
                              onClick={() =>
                                navigate(`${baseCourseUrl}/quiz/${quiz.id}`)
                              }
                              className='w-full text-left p-2.5 sm:p-3 rounded-xl border border-purple-100 bg-purple-50/30 hover:border-purple-300 hover:bg-purple-50 transition-all flex items-center justify-between gap-2 group cursor-pointer min-h-[44px]'
                            >
                              <div className='flex items-center gap-2 sm:gap-2.5 min-w-0 flex-1'>
                                <ListChecks className='w-4 h-4 text-purple-600 shrink-0' />
                                <span className='text-xs sm:text-sm font-medium text-purple-900 truncate'>
                                  Quiz (Instructor Preview & Answers)
                                </span>
                              </div>
                              <ChevronRight className='w-4 h-4 text-purple-600 group-hover:translate-x-0.5 transition-all shrink-0' />
                            </button>
                          ))}

                          {unit.assignments?.map((assignment) => (
                            <button
                              key={assignment.id}
                              onClick={() =>
                                navigate(
                                  `${baseCourseUrl}/assignment/${assignment.id}`,
                                )
                              }
                              className='w-full text-left p-2.5 sm:p-3 rounded-xl border border-indigo-100 bg-indigo-50/30 hover:border-indigo-300 hover:bg-indigo-50 transition-all flex items-center justify-between gap-2 group cursor-pointer min-h-[44px]'
                            >
                              <div className='flex items-center gap-2 sm:gap-2.5 min-w-0 flex-1'>
                                <FileCode2 className='w-4 h-4 text-indigo-600 shrink-0' />
                                <span className='text-xs sm:text-sm font-medium text-indigo-900 truncate'>
                                  {assignment.title || 'Assignment'}
                                </span>
                              </div>
                              <ChevronRight className='w-4 h-4 text-indigo-600 group-hover:translate-x-0.5 transition-all shrink-0' />
                            </button>
                          ))}
                        </div>
                      </div>
                    ))}

                    {/* Capstone project if present */}
                    {module.capstone && (
                      <div className='pt-2 border-t border-slate-100'>
                        <button
                          onClick={() =>
                            navigate(
                              `${baseCourseUrl}/capstone/${module.capstone!.id}`,
                            )
                          }
                          className='w-full text-left p-2.5 sm:p-3 rounded-xl border border-amber-200 bg-amber-50/40 hover:bg-amber-50 transition-all flex items-center justify-between gap-2 group cursor-pointer min-h-[44px]'
                        >
                          <div className='flex items-center gap-2 sm:gap-2.5 min-w-0 flex-1'>
                            <Trophy className='w-4 h-4 text-amber-600 shrink-0' />
                            <div className='min-w-0 flex-1'>
                              <p className='text-xs sm:text-sm font-bold text-amber-900 truncate'>
                                Capstone Project: {module.capstone.title}
                              </p>
                              <p className='text-[10px] sm:text-[11px] text-amber-700/80 truncate'>
                                Comprehensive topic evaluation project
                              </p>
                            </div>
                          </div>
                          <ChevronRight className='w-4 h-4 text-amber-600 group-hover:translate-x-0.5 transition-all shrink-0' />
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

// Stat Card Helper
const StatCard = ({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) => (
  <div className='bg-white border border-slate-100 p-3 sm:p-5 rounded-xl sm:rounded-2xl flex items-center gap-2.5 sm:gap-4 shadow-2xs min-w-0'>
    <div className='p-2 sm:p-3 bg-slate-50 rounded-lg sm:rounded-xl shrink-0'>
      {icon}
    </div>
    <div className='min-w-0 flex-1'>
      <p className='text-[9px] sm:text-xs font-bold text-slate-400 uppercase tracking-widest truncate'>
        {label}
      </p>
      <p className='text-xs sm:text-base font-bold text-slate-800 truncate'>
        {value}
      </p>
    </div>
  </div>
);

export default CourseIntro;
