import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router';
import {
  Play,
  BookOpen,
  Clock,
  Trophy,
  ChevronRight,
  Loader2,
  PartyPopper,
  RotateCcw,
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
}

interface Unit {
  id: string;
  title: string;
  subtopics: Subtopic[];
}

interface Module {
  id: string;
  title: string;
  units: Unit[];
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
  const [loading, setLoading] = useState(true);
  const [progressPercent, setProgressPercent] = useState<number>(0);
  const [lastAccessedSlug, setLastAccessedSlug] = useState<string | null>(null);

  useEffect(() => {
    const fetchCourseDetails = async () => {
      try {
        const { data } = await apiClient.get<CourseData>(`/subjects/${slug}`);

        const totalSubtopics = data.data.reduce((total, module) => {
          return (
            total +
            module.units.reduce(
              (unitTotal, unit) => unitTotal + unit.subtopics.length,
              0,
            )
          );
        }, 0);

        const firstLesson = data.data[0]?.units[0]?.subtopics[0]?.slug;

        // Guard: empty course — no topics/units/subtopics
        if (totalSubtopics === 0) {
          setCourse({
            name: data.name || 'Course Overview',
            description: data.description || '',
            total_topics: data.data.length,
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
          total_topics: data.data.length,
          total_subtopics: totalSubtopics,
          first_lesson_slug: firstLesson,
          subject_id: data.id,
        });

        // Fetch real progress if enrolled
        if (data.id) {
          apiClient
            .get(`/students/progress?subjectId=${data.id}`)
            .then((res) => {
              const d = res.data?.data;
              if (d) {
                const pct =
                  d.total_subtopics > 0
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
  }, [slug, currentUser]);

  const continueLearning = () => {
    const target = lastAccessedSlug ?? course?.first_lesson_slug;
    if (target) {
      navigate(`/dashboard/student/courses/${slug}/lesson/${target}`);
    }
  };

  if (loading)
    return (
      <div className='flex h-full items-center justify-center'>
        <Loader2 className='animate-spin text-blue-600' />
      </div>
    );

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

  return (
    <div className='max-w-5xl mx-auto p-4 sm:p-6 md:p-8 space-y-6 sm:space-y-10 animate-in fade-in duration-500'>
      {/* Course Completed banner */}
      {isCompleted && (
        <div className='flex items-center gap-3 sm:gap-4 rounded-2xl sm:rounded-3xl bg-emerald-50 border border-emerald-200 p-4 sm:p-6 shadow-sm'>
          <div className='p-2.5 sm:p-3 bg-emerald-100 rounded-xl sm:rounded-2xl shrink-0'>
            <PartyPopper className='w-6 h-6 sm:w-7 sm:h-7 text-emerald-600' />
          </div>
          <div>
            <p className='font-bold text-emerald-800 text-base sm:text-lg'>
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
      <div className='relative overflow-hidden rounded-2xl sm:rounded-3xl bg-[#1e2653] p-5 sm:p-8 md:p-10 text-white shadow-xl'>
        <div className='relative z-10 space-y-4 sm:space-y-6 max-w-2xl'>
          {isCompleted && (
            <span className='inline-flex items-center gap-1.5 rounded-full bg-emerald-500/20 border border-emerald-400/30 px-3 py-1 text-xs font-bold uppercase tracking-wider text-emerald-300'>
              <Trophy className='w-3.5 h-3.5' />
              Completed
            </span>
          )}
          <h1 className='text-2xl sm:text-4xl md:text-5xl capitalize font-black tracking-tight leading-tight'>
            {course?.name}
          </h1>
          <p className='text-blue-100 text-sm sm:text-base md:text-lg leading-relaxed opacity-90'>
            {course?.description}
          </p>
          <div className='flex flex-wrap gap-4 pt-2 sm:pt-4'>
            <Button
              size='lg'
              onClick={continueLearning}
              disabled={!course?.first_lesson_slug}
              className='w-full sm:w-auto bg-blue-600 hover:bg-blue-700 text-white font-bold h-12 sm:h-14 px-6 sm:px-8 rounded-xl shadow-lg shadow-blue-900/20 gap-2 text-sm sm:text-base'
            >
              {isCompleted ? (
                <RotateCcw className='w-5 h-5' />
              ) : (
                <Play className='w-5 h-5 fill-current' />
              )}
              {isCompleted
                ? 'Review Course'
                : isInProgress
                  ? 'Continue Learning'
                  : 'Start Learning'}
            </Button>
          </div>
        </div>
        <div className='absolute top-0 right-0 w-1/3 h-full bg-linear-to-l from-blue-500/10 to-transparent pointer-events-none' />
      </div>

      {/* Stats Grid */}
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

      {/* Progress & Quick Continue */}
      <div className='bg-white border border-slate-100 rounded-2xl sm:rounded-3xl p-5 sm:p-8 shadow-sm flex flex-col sm:flex-row items-center justify-between gap-6'>
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
    </div>
  );
};

// Simple Stat Card Helper
const StatCard = ({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) => (
  <div className='bg-white border border-slate-100 p-4 sm:p-6 rounded-xl sm:rounded-2xl flex items-center gap-3 sm:gap-4 shadow-sm'>
    <div className='p-2.5 sm:p-3 bg-slate-50 rounded-lg sm:rounded-xl shrink-0'>{icon}</div>
    <div className='min-w-0'>
      <p className='text-[10px] sm:text-xs font-bold text-slate-400 uppercase tracking-widest truncate'>
        {label}
      </p>
      <p className='text-sm sm:text-lg font-bold text-slate-800 truncate'>{value}</p>
    </div>
  </div>
);

export default CourseIntro;

