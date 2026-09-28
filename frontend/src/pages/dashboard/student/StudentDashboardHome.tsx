import { useMemo, type FC } from 'react';
import {
  Play,
  FileText,
  ChevronRight,
  Activity,
  BookOpen,
  CheckCircle2,
  type LucideIcon,
} from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { useNavigate } from 'react-router';
import { useAppSelector } from '@/app/hooks';
import { selectUser } from '@/features/auth/authSelectors';
import {
  useMySubjects,
  useStudentAssignmentsOverview,
} from '@/hooks/queries/useStudentDashboard';
import { StudentAssignmentsTable } from '@/components/common/student/StudentAssignmentsTable';
import type { Subject } from '@/utils/types';

interface StatCardProps {
  label: string;
  value: string | number;
  icon: LucideIcon;
  iconColor: string;
  bgColor: string;
}

const StatCard: FC<StatCardProps> = ({
  label,
  value,
  icon: Icon,
  iconColor,
  bgColor,
}) => (
  <Card className='border-none shadow-sm hover:shadow-md transition-all duration-300'>
    <CardContent className='p-4 sm:pt-6 flex flex-col items-center text-center'>
      <div className={cn('p-2.5 sm:p-3 rounded-full mb-2 sm:mb-3', bgColor)}>
        <Icon className={cn('w-5 h-5 sm:w-6 sm:h-6', iconColor)} />
      </div>
      <div className='text-xl sm:text-2xl font-bold tracking-tight text-slate-900'>
        {value}
      </div>
      <p className='text-[9px] sm:text-[10px] uppercase font-bold text-muted-foreground tracking-widest mt-1'>
        {label}
      </p>
    </CardContent>
  </Card>
);

const StudentDashboardHome: FC = () => {
  const navigate = useNavigate();
  const user = useAppSelector(selectUser);

  const { data: courses = [], isLoading: loadingCourses } = useMySubjects();
  const { data: overview, isLoading: loadingOverview } =
    useStudentAssignmentsOverview();

  const assignmentsList = overview?.data ?? [];
  const counts = overview?.counts ?? {
    total: 0,
    pending: 0,
    pending_evaluation: 0,
    evaluated: 0,
  };

  const avgProgress = useMemo(() => {
    if (!courses.length) return null;
    const sum = courses.reduce(
      (s, c: Subject) => s + (c.progress_percent || 0),
      0,
    );
    return Math.round(sum / courses.length);
  }, [courses]);

  const currentCourse = courses[0];
  const pendingCount = counts.pending;

  return (
    <div className='flex-1 space-y-6 sm:space-y-8 p-3.5 sm:p-6 md:p-8 pt-4 sm:pt-6 max-w-7xl mx-auto min-w-0'>
      {/* 1. Hero Section */}
      <section className='relative overflow-hidden rounded-2xl sm:rounded-[2rem] bg-[#1e293b] text-white p-5 sm:p-8 md:p-12 shadow-xl'>
        <div className='relative z-10 max-w-2xl'>
          <Badge className='bg-slate-700/50 hover:bg-slate-700 text-slate-100 border-none px-2.5 py-0.5 sm:px-3 sm:py-1 mb-4 sm:mb-6 text-[10px] sm:text-xs backdrop-blur-md'>
            WELCOME BACK
          </Badge>
          <h1 className='text-2xl sm:text-4xl md:text-5xl font-extrabold tracking-tight mb-3 sm:mb-4 leading-[1.15]'>
            Ready to continue,{' '}
            <span className='text-yellow-400'>
              {user?.full_name?.split(' ')[0] || 'there'}?
            </span>
          </h1>
          <p className='text-slate-400 text-sm sm:text-lg mb-6 sm:mb-8 max-w-md leading-relaxed'>
            {loadingOverview
              ? 'Loading your progress...'
              : pendingCount > 0
                ? `You have ${pendingCount} pending assignment${pendingCount !== 1 ? 's' : ''}. Keep up the momentum!`
                : 'All caught up on assignments! Keep learning and growing.'}
          </p>
          <div className='flex flex-col sm:flex-row gap-3 sm:gap-4'>
            <Button
              size='lg'
              onClick={() => navigate('/dashboard/student/courses')}
              className='bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl px-6 sm:px-8 h-11 sm:h-12 font-semibold transition-all w-full sm:w-auto min-h-[44px]'
            >
              <Play className='mr-2 h-4 w-4 fill-current' /> Continue Learning
            </Button>
            <Button
              size='lg'
              variant='secondary'
              onClick={() => {
                const el = document.getElementById('student-assignments-section');
                if (el) {
                  el.scrollIntoView({ behavior: 'smooth' });
                } else {
                  navigate('/dashboard/student/assignments');
                }
              }}
              className='bg-slate-700 hover:bg-slate-600 text-white border-none rounded-xl px-6 sm:px-8 h-11 sm:h-12 font-semibold w-full sm:w-auto min-h-[44px]'
            >
              View Assignments
            </Button>
          </div>
        </div>
        <div className='absolute -top-24 -right-24 w-96 h-96 bg-indigo-500/20 rounded-full blur-[100px] pointer-events-none' />
        <div className='absolute -bottom-24 -left-24 w-64 h-64 bg-blue-500/10 rounded-full blur-[80px] pointer-events-none' />
      </section>

      {/* 2. Stats Grid */}
      <section className='grid gap-3 sm:gap-4 grid-cols-2 lg:grid-cols-4'>
        <StatCard
          label='Enrolled Courses'
          value={loadingCourses ? '—' : courses.length}
          icon={BookOpen}
          iconColor='text-indigo-500'
          bgColor='bg-indigo-50'
        />
        <StatCard
          label='Pending Tasks'
          value={loadingOverview ? '—' : counts.pending}
          icon={FileText}
          iconColor='text-orange-500'
          bgColor='bg-orange-50'
        />
        <StatCard
          label='Evaluated'
          value={loadingOverview ? '—' : counts.evaluated}
          icon={CheckCircle2}
          iconColor='text-emerald-500'
          bgColor='bg-emerald-50'
        />
        <StatCard
          label='Avg. Progress'
          value={
            loadingCourses || avgProgress === null ? '—' : `${avgProgress}%`
          }
          icon={Activity}
          iconColor='text-purple-500'
          bgColor='bg-purple-50'
        />
      </section>

      {/* 3. Continue Learning Card */}
      <section className='space-y-4'>
        <div className='flex items-center justify-between px-1'>
          <h2 className='text-lg sm:text-xl font-bold tracking-tight text-slate-900'>
            Continue Learning
          </h2>
          <Button
            variant='link'
            className='text-indigo-600 font-bold p-0 hover:no-underline text-xs sm:text-sm'
            onClick={() => navigate('/dashboard/student/courses')}
          >
            View All Courses
          </Button>
        </div>

        {loadingCourses ? (
          <Card className='border-none shadow-sm'>
            <CardContent className='p-6'>
              <div className='flex flex-col lg:flex-row gap-8 items-center'>
                <Skeleton className='w-full lg:w-80 aspect-video rounded-2xl shrink-0' />
                <div className='flex-1 w-full space-y-5'>
                  <Skeleton className='h-5 w-20 rounded-full' />
                  <div className='space-y-2'>
                    <Skeleton className='h-7 w-2/3' />
                    <Skeleton className='h-4 w-24' />
                  </div>
                  <div className='space-y-3'>
                    <Skeleton className='h-2 w-full rounded-full' />
                    <Skeleton className='h-3 w-16 ml-auto' />
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        ) : currentCourse ? (
          <Card
            className='overflow-hidden border-none shadow-sm hover:shadow-md transition-shadow cursor-pointer'
            onClick={() =>
              navigate(`/dashboard/student/courses/${currentCourse.slug}`)
            }
          >
            <CardContent className='p-4 sm:p-6'>
              <div className='flex flex-col lg:flex-row gap-6 sm:gap-8 items-center'>
                <div className='w-full lg:w-80 aspect-video bg-indigo-950 rounded-2xl flex items-center justify-center group relative overflow-hidden shrink-0'>
                  <div className='absolute inset-0 bg-indigo-600/10 group-hover:bg-indigo-600/20 transition-colors' />
                  <div className='z-10 bg-white/10 backdrop-blur-md p-4 rounded-full group-hover:scale-110 transition-transform'>
                    <Play className='w-8 h-8 text-white fill-white' />
                  </div>
                </div>

                <div className='flex-1 w-full space-y-4 sm:space-y-5'>
                  <div className='flex items-center gap-2'>
                    <Badge
                      variant='outline'
                      className='text-indigo-600 border-indigo-100 bg-indigo-50/50'
                    >
                      {currentCourse.level || 'General'}
                    </Badge>
                  </div>
                  <div>
                    <h3 className='text-xl sm:text-2xl font-bold mb-1.5 text-slate-900'>
                      {currentCourse.name}
                    </h3>
                    <p className='text-muted-foreground text-xs sm:text-sm leading-relaxed'>
                      {currentCourse.total_lessons} lessons
                    </p>
                  </div>
                  <div className='space-y-2.5'>
                    <Progress
                      value={Math.round(currentCourse.progress_percent || 0)}
                      className='h-2 bg-slate-100'
                    />
                    <div className='flex justify-end'>
                      <span className='text-xs font-bold text-slate-500 uppercase'>
                        {Math.round(currentCourse.progress_percent || 0)}%
                        Complete
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        ) : (
          <Card className='border-none shadow-sm'>
            <CardContent className='p-6 flex flex-col items-center justify-center h-40 gap-3 text-center'>
              <BookOpen className='w-8 h-8 text-slate-300' />
              <p className='text-slate-500 font-medium text-sm'>
                No courses yet. Enroll in a course to get started!
              </p>
            </CardContent>
          </Card>
        )}
      </section>

      {/* 4. Full-Featured Unified Assignments & Evaluations Table */}
      <section id='student-assignments-section' className='space-y-4'>
        <StudentAssignmentsTable
          assignments={assignmentsList}
          isLoading={loadingOverview}
        />
      </section>

      {/* 5. My Courses Grid */}
      {courses.length > 1 && (
        <section className='space-y-3.5'>
          <div className='flex items-center justify-between px-1'>
            <h3 className='text-base sm:text-lg font-bold text-slate-900 tracking-tight'>
              Other Enrolled Courses
            </h3>
            <Button
              variant='link'
              className='text-indigo-600 font-semibold p-0 hover:no-underline text-xs'
              onClick={() => navigate('/dashboard/student/courses')}
            >
              All Courses ({courses.length})
            </Button>
          </div>

          <div className='grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5'>
            {courses.slice(1, 4).map((course: Subject) => (
              <div
                key={course.id}
                onClick={() =>
                  navigate(`/dashboard/student/courses/${course.slug}`)
                }
                className='p-4 rounded-2xl border border-slate-200/80 bg-white hover:border-indigo-200 hover:shadow-xs transition-all cursor-pointer group space-y-3'
              >
                <div className='flex items-center gap-3 min-w-0'>
                  <div className='p-2.5 bg-indigo-50 rounded-xl text-indigo-600 shrink-0 group-hover:bg-indigo-600 group-hover:text-white transition-colors'>
                    <BookOpen size={18} />
                  </div>
                  <div className='min-w-0 flex-1'>
                    <h4
                      className='text-xs sm:text-sm font-bold text-slate-900 truncate group-hover:text-indigo-600 transition-colors'
                      title={course.name}
                    >
                      {course.name}
                    </h4>
                    <p className='text-[10px] sm:text-[11px] text-slate-400 mt-0.5 truncate'>
                      {Math.round(course.progress_percent || 0)}% completed
                    </p>
                  </div>
                  <ChevronRight className='w-4 h-4 text-slate-300 shrink-0 group-hover:translate-x-0.5 transition-transform' />
                </div>
                <Progress
                  value={Math.round(course.progress_percent || 0)}
                  className='h-1.5 bg-slate-100'
                />
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
};

export default StudentDashboardHome;

