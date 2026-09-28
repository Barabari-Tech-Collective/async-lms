import { useState } from 'react';
import {
  Code2,
  Layout,
  Boxes,
  Zap,
  BookOpen,
  PlusCircle,
  Loader2,
} from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useNavigate } from 'react-router';
import toast from 'react-hot-toast';
import { getErrorMessage } from '@/lib/utils';
import type { Subject } from '@/utils/types';
import {
  useEnrolledCourses,
  useAllCourses,
  useEnrollMutation,
} from '@/hooks/queries/useCourses';

const getCourseTheme = (slug: string) => {
  if (slug.includes('frontend') || slug.includes('react'))
    return { icon: Code2, color: 'bg-[#333D7C]' };
  if (slug.includes('backend') || slug.includes('node'))
    return { icon: Boxes, color: 'bg-[#0a3a3a]' };
  if (slug.includes('devops') || slug.includes('kubernetes'))
    return { icon: Zap, color: 'bg-[#4c1d95]' };
  return { icon: Layout, color: 'bg-[#333D7C]' };
};

type Tab = 'enrolled' | 'all';

const MyCourses = () => {
  const [activeTab, setActiveTab] = useState<Tab>('enrolled');
  const [enrollTarget, setEnrollTarget] = useState<Subject | null>(null);
  const navigate = useNavigate();

  const { data: enrolled = [], isLoading: loadingEnrolled } =
    useEnrolledCourses();
  const { data: allSubjects = [], isLoading: loadingAll } = useAllCourses();
  const enrollMutation = useEnrollMutation();

  const loading = loadingEnrolled || loadingAll;

  const handleEnroll = async () => {
    if (!enrollTarget) return;
    try {
      await enrollMutation.mutateAsync(enrollTarget.id);
      toast.success(`Enrolled in ${enrollTarget.name}!`);
      setEnrollTarget(null);
    } catch (error) {
      toast.error(
        getErrorMessage(error, 'Enrollment failed. Please try again.'),
      );
    }
  };

  const enrolledIds = new Set(enrolled.map((s) => s.id));

  const tabs: { id: Tab; label: string; count: number }[] = [
    { id: 'enrolled', label: 'Enrolled', count: enrolled.length },
    { id: 'all', label: 'All', count: allSubjects.length },
  ];

  if (loading)
    return (
      <div className='p-8 max-w-7xl mx-auto space-y-8'>
        <div className='space-y-1'>
          <Skeleton className='h-8 w-32' />
          <Skeleton className='h-4 w-56' />
        </div>
        <div className='flex gap-1 border-b border-slate-200 pb-0'>
          <Skeleton className='h-9 w-24' />
          <Skeleton className='h-9 w-16' />
        </div>
        <div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8'>
          {[...Array(6)].map((_, i) => (
            <div
              key={i}
              className='bg-white rounded-[2rem] border border-slate-100 shadow-sm overflow-hidden'
            >
              <Skeleton className='h-44 w-full rounded-none' />
              <div className='p-8 space-y-5'>
                <Skeleton className='h-5 w-16 rounded-full' />
                <div className='space-y-2'>
                  <Skeleton className='h-7 w-3/4' />
                  <Skeleton className='h-4 w-1/2' />
                </div>
                <div className='space-y-2 pt-1'>
                  <div className='flex justify-between'>
                    <Skeleton className='h-3.5 w-16' />
                    <Skeleton className='h-3.5 w-8' />
                  </div>
                  <Skeleton className='h-2 w-full rounded-full' />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    );

  const displayCourses = activeTab === 'enrolled' ? enrolled : allSubjects;

  return (
    <div className='p-4 sm:p-6 md:p-8 max-w-7xl mx-auto space-y-6 sm:space-y-8'>
      <div>
        <h1 className='text-2xl sm:text-3xl font-bold text-[#1e293b]'>Courses</h1>
        <p className='text-slate-500 mt-1 text-sm sm:text-base'>Browse and continue your learning</p>
      </div>

      <div className='flex items-center gap-1 border-b border-slate-200 overflow-x-auto [&::-webkit-scrollbar]:hidden'>
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 px-3.5 sm:px-4 py-2.5 text-xs sm:text-sm font-semibold border-b-2 -mb-px transition-colors shrink-0 min-h-[40px] ${
              activeTab === tab.id
                ? 'border-[#333D7C] text-[#333D7C]'
                : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
            }`}
          >
            {tab.label}
            <span
              className={`text-[10px] sm:text-[11px] font-bold px-1.5 py-0.5 rounded-full ${
                activeTab === tab.id
                  ? 'bg-[#333D7C]/10 text-[#333D7C]'
                  : 'bg-slate-100 text-slate-500'
              }`}
            >
              {tab.count}
            </span>
          </button>
        ))}
      </div>

      {displayCourses.length === 0 ? (
        <div className='flex flex-col items-center justify-center h-60 text-slate-400 gap-3'>
          <BookOpen className='w-10 h-10 text-slate-300' />
          <p className='text-sm'>
            {activeTab === 'enrolled'
              ? "You haven't enrolled in any courses yet."
              : 'No courses available.'}
          </p>
        </div>
      ) : (
        <div className='grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6 lg:gap-8'>
          {displayCourses.map((course) => {
            const { icon: Icon, color } = getCourseTheme(course.slug || '');
            const progress = Math.round(course.progress_percent || 0);
            const isEnrolled = enrolledIds.has(course.id);

            return (
              <div
                key={course.id}
                onClick={() =>
                  isEnrolled
                    ? navigate(`/dashboard/student/courses/${course.slug}`)
                    : undefined
                }
                className={`bg-white rounded-2xl sm:rounded-[2rem] border border-slate-100 shadow-sm transition-all duration-300 overflow-hidden group ${
                  isEnrolled
                    ? 'hover:shadow-xl cursor-pointer'
                    : 'cursor-default'
                }`}
              >
                <div
                  className={`${isEnrolled ? color : 'bg-slate-200'} h-36 sm:h-44 flex items-center justify-center relative`}
                >
                  <Icon
                    className={`w-12 h-12 sm:w-16 sm:h-16 transition-transform ${
                      isEnrolled
                        ? 'text-white/90 group-hover:scale-110'
                        : 'text-slate-400'
                    }`}
                  />
                  {activeTab === 'all' && isEnrolled && (
                    <span className='absolute top-3 right-3 bg-white/20 backdrop-blur-sm text-white text-[10px] font-bold uppercase px-2.5 py-1 rounded-full'>
                      Enrolled
                    </span>
                  )}
                </div>

                <div className='p-5 sm:p-8 space-y-4 sm:space-y-5'>
                  <div className='flex gap-1.5 sm:gap-2 flex-wrap'>
                    <Badge
                      variant='secondary'
                      className='bg-slate-50 text-slate-500 border-none px-2.5 sm:px-3 py-0.5 text-[9px] sm:text-[10px] font-bold uppercase'
                    >
                      {course.level || 'General'}
                    </Badge>
                    {isEnrolled && progress >= 100 && (
                      <Badge className='bg-emerald-50 text-emerald-700 border-none px-2.5 sm:px-3 py-0.5 text-[9px] sm:text-[10px] font-bold uppercase'>
                        Completed
                      </Badge>
                    )}
                    {isEnrolled && progress > 0 && progress < 100 && (
                      <Badge className='bg-[#333D7C]/10 text-[#333D7C] border-none px-2.5 sm:px-3 py-0.5 text-[9px] sm:text-[10px] font-bold uppercase'>
                        In Progress
                      </Badge>
                    )}
                  </div>

                  <div>
                    <h3 className='text-lg sm:text-2xl capitalize font-bold text-[#1e293b] leading-tight'>
                      {course.name}
                    </h3>
                    <p className='text-slate-400 text-xs sm:text-sm mt-1.5'>
                      {course.level || 'Beginner'} •{' '}
                      {course.total_lessons ?? '—'} Lessons
                    </p>
                  </div>

                  {isEnrolled ? (
                    <div className='space-y-2 sm:space-y-3 pt-1'>
                      <div className='flex justify-between text-xs sm:text-sm font-bold text-[#1e293b]'>
                        <span>Progress</span>
                        <span className={progress >= 100 ? 'text-emerald-600' : ''}>
                          {progress}%
                        </span>
                      </div>
                      <Progress
                        value={progress}
                        className={`h-2 bg-slate-100 rounded-full ${progress >= 100 ? '[&>div]:bg-emerald-500' : ''}`}
                      />
                    </div>
                  ) : (
                    <Button
                      size='sm'
                      className='w-full gap-2 bg-[#333D7C] hover:bg-[#2a3268] text-white h-10 min-h-[40px] font-semibold text-xs sm:text-sm'
                      onClick={(e) => {
                        e.stopPropagation();
                        setEnrollTarget(course);
                      }}
                    >
                      <PlusCircle className='w-4 h-4' />
                      Enroll Now
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Dialog
        open={!!enrollTarget}
        onOpenChange={(open) => !open && setEnrollTarget(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Enroll in {enrollTarget?.name}?</DialogTitle>
            <DialogDescription>
              You're about to enroll in{' '}
              <span className='font-semibold text-slate-700'>
                {enrollTarget?.name}
              </span>
              . This will add the course to your learning path and unlock the
              first module.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant='outline'
              onClick={() => setEnrollTarget(null)}
              disabled={enrollMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              onClick={handleEnroll}
              disabled={enrollMutation.isPending}
              className='bg-[#333D7C] hover:bg-[#2a3268] text-white'
            >
              {enrollMutation.isPending && (
                <Loader2 className='w-4 h-4 animate-spin mr-2' />
              )}
              {enrollMutation.isPending ? 'Enrolling...' : 'Confirm Enroll'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default MyCourses;
