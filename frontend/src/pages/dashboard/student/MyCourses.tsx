import { useState, useMemo } from 'react';
import {
  BookOpen,
  Briefcase,
  Layers,
  Loader2,
  CheckCircle2,
  Sparkles,
} from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
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
  useStudentEnrollmentRequests,
} from '@/hooks/queries/useCourses';

/* ==========================================================================
   Types & Domain Theme Mapping (Figma Exact Palette)
   ========================================================================== */

export type CatalogTab = 'all' | 'enrolled' | 'pending' | 'live';

export type CourseDomain = 'creative' | 'tech' | 'data' | 'business' | 'non-it';

export interface DomainTheme {
  domain: CourseDomain;
  domainLabel: string;
  cardInnerBg: string;
  levelBadgeBg: string;
  levelBadgeText: string;
  domainBadgeBg: string;
  domainBadgeText: string;
  contentBadgeBg: string;
  contentBadgeText: string;
  defaultContentType: string;
  progressTrack: string;
  progressFill: string;
}

const DOMAIN_THEMES: Record<CourseDomain, DomainTheme> = {
  creative: {
    domain: 'creative',
    domainLabel: 'Creative',
    cardInnerBg: 'bg-[rgba(255,225,242,0.5)]',
    levelBadgeBg: 'bg-[#EFD1E2]',
    levelBadgeText: 'text-black',
    domainBadgeBg: 'bg-[#A63D82]',
    domainBadgeText: 'text-white',
    contentBadgeBg: 'bg-[#FFE4BF]',
    contentBadgeText: 'text-black',
    defaultContentType: 'Practice Heavy',
    progressTrack: 'bg-[#EACEE1]',
    progressFill: 'bg-[#020002]',
  },
  tech: {
    domain: 'tech',
    domainLabel: 'Tech',
    cardInnerBg: 'bg-[rgba(225,229,255,0.5)]',
    levelBadgeBg: 'bg-[#D1D2EF]',
    levelBadgeText: 'text-black',
    domainBadgeBg: 'bg-[#3C5EA4]',
    domainBadgeText: 'text-white',
    contentBadgeBg: 'bg-[#FFE4BF]',
    contentBadgeText: 'text-black',
    defaultContentType: 'Theory Heavy',
    progressTrack: 'bg-[#D1D2EF]',
    progressFill: 'bg-[#020002]',
  },
  data: {
    domain: 'data',
    domainLabel: 'Data',
    cardInnerBg: 'bg-[rgba(255,249,225,0.5)]',
    levelBadgeBg: 'bg-[#EEEEEE]',
    levelBadgeText: 'text-black',
    domainBadgeBg: 'bg-[#FFCC33]',
    domainBadgeText: 'text-black',
    contentBadgeBg: 'bg-[#FFE4BF]',
    contentBadgeText: 'text-black',
    defaultContentType: 'Practice Heavy',
    progressTrack: 'bg-[#EACEE1]',
    progressFill: 'bg-[#020002]',
  },
  business: {
    domain: 'business',
    domainLabel: 'Business',
    cardInnerBg: 'bg-[rgba(255,255,233,0.5)]',
    levelBadgeBg: 'bg-[#D1EFE2]',
    levelBadgeText: 'text-black',
    domainBadgeBg: 'bg-[#1DB966]',
    domainBadgeText: 'text-white',
    contentBadgeBg: 'bg-[#FFE4BF]',
    contentBadgeText: 'text-black',
    defaultContentType: 'Practice Heavy',
    progressTrack: 'bg-[#D1EFE2]',
    progressFill: 'bg-[#020002]',
  },
  'non-it': {
    domain: 'non-it',
    domainLabel: 'Non - IT',
    cardInnerBg: 'bg-[rgba(255,225,225,0.5)]',
    levelBadgeBg: 'bg-[#EFD1D2]',
    levelBadgeText: 'text-black',
    domainBadgeBg: 'bg-[#FF8800]',
    domainBadgeText: 'text-white',
    contentBadgeBg: 'bg-[#FFE4BF]',
    contentBadgeText: 'text-black',
    defaultContentType: 'Practice Heavy',
    progressTrack: 'bg-[#EACEE1]',
    progressFill: 'bg-[#020002]',
  },
};

function resolveCourseTheme(course: Subject): DomainTheme {
  const text = `${course.name || ''} ${course.slug || ''} ${course.description || ''}`.toLowerCase();

  // 1. Non-IT / ERP / Support / Networking
  if (
    /\b(non-it|non it|erp|sap|support|consultant|datacenter|data center|networking)\b/i.test(
      text
    )
  ) {
    return DOMAIN_THEMES['non-it'];
  }

  // 2. Data / Analytics / SQL / BI
  if (
    /\b(data|analyst|analytics|sql|excel|tableau|powerbi|power bi|bi|database)\b/i.test(
      text
    )
  ) {
    return DOMAIN_THEMES.data;
  }

  // 3. Business / Sales / Management
  if (
    /\b(business|sales|marketing|finance|management|product management|operations|hr)\b/i.test(
      text
    )
  ) {
    return DOMAIN_THEMES.business;
  }

  // 4. Creative / UI/UX / Design
  if (
    /\b(ui|ux|ui\/ux|design|figma|graphic|creative|animation|visual)\b/i.test(
      text
    )
  ) {
    return DOMAIN_THEMES.creative;
  }

  // Default: Tech / Developer
  return DOMAIN_THEMES.tech;
}

function resolveContentType(course: Subject): string {
  const text = `${course.name || ''} ${course.slug || ''}`.toLowerCase();
  if (text.includes('interview') || text.includes('agentic')) return 'Interview Focused';
  if (text.includes('agent') || text.includes('ai')) return 'Balanced';
  if (text.includes('theory') || text.includes('full stack') || text.includes('frontend')) return 'Theory Heavy';
  return 'Practice Heavy';
}

/* ==========================================================================
   Course Card Component (Matches Figma Frames 16 - 22)
   ========================================================================== */

interface CourseCardProps {
  course: Subject;
  variant: 'enrolled' | 'pending' | 'live';
  onContinue?: () => void;
  onRequestEnroll?: () => void;
}

const CourseCard = ({
  course,
  variant,
  onContinue,
  onRequestEnroll,
}: CourseCardProps) => {
  const theme = resolveCourseTheme(course);
  const contentType = resolveContentType(course);

  const progress = Math.min(100, Math.max(0, Math.round(course.progress_percent || 0)));
  const unitsCount = course.units_count ?? 0;
  const lessonsCount = course.total_lessons ?? 0;
  const assignmentsCount = course.assignments_count ?? 0;
  const capstonesCount = course.capstones_count ?? 0;

  // Real modules completed calculation: 0 if progress is 0
  const completedUnits =
    progress === 0
      ? 0
      : Math.min(unitsCount, Math.max(1, Math.round((progress / 100) * unitsCount)));

  return (
    <div
      onClick={variant === 'enrolled' ? onContinue : undefined}
      className={`bg-white border-[2.5px] border-white rounded-[14px] shadow-[0px_4px_16px_rgba(0,0,0,0.04)] hover:shadow-[0px_8px_24px_rgba(0,0,0,0.08)] transition-all duration-300 flex flex-col justify-between p-1 pb-3 w-full select-none ${
        variant === 'enrolled' ? 'cursor-pointer hover:-translate-y-0.5' : 'cursor-default'
      }`}
    >
      {/* Top Inner Colored Container (Figma Frame 16) */}
      <div
        className={`${theme.cardInnerBg} rounded-[12px] p-4 flex flex-col justify-between ${
          variant === 'enrolled' ? 'min-h-[182px]' : 'min-h-[148px]'
        } transition-colors`}
      >
        <div className='space-y-2.5'>
          {/* Badge Row (Figma Frame 15) */}
          <div className='flex items-center gap-2 flex-wrap'>
            {/* Level Badge */}
            <span
              className={`${theme.levelBadgeBg} ${theme.levelBadgeText} px-2.5 py-0.5 rounded-[10px] text-[8px] font-medium leading-[10px] tracking-tight`}
            >
              {course.level || 'Beginner'}
            </span>

            {/* Domain Badge */}
            <span
              className={`${theme.domainBadgeBg} ${theme.domainBadgeText} px-2.5 py-0.5 rounded-[10px] text-[8px] font-medium leading-[10px] tracking-tight`}
            >
              {theme.domainLabel}
            </span>

            {/* Content Type Badge */}
            <span
              className={`${theme.contentBadgeBg} ${theme.contentBadgeText} px-2.5 py-0.5 rounded-[10px] text-[8px] font-medium leading-[10px] tracking-tight`}
            >
              {contentType}
            </span>
          </div>

          {/* Title & Description (Figma Frame 11) */}
          <div className='space-y-1 pt-0.5'>
            <h3 className='font-semibold text-xs text-black leading-[15px] capitalize line-clamp-1'>
              {course.name}
            </h3>
            <p className='text-[10px] text-black/80 font-normal leading-[13px] line-clamp-2'>
              {course.description ||
                'Master key concepts, practical frameworks, and hands-on projects designed for industry excellence.'}
            </p>
          </div>
        </div>

        {/* Stats & Progress Section */}
        <div className='space-y-2 pt-2'>
          {/* Metadata Row 1: Units & Lessons (Figma Frame 8) */}
          <div className='flex items-center gap-1.5 text-[8px] font-medium text-black'>
            <Layers className='w-3 h-3 text-black/80 shrink-0' />
            <span>
              {unitsCount} Units • {lessonsCount} Lessons
            </span>
          </div>

          {/* Metadata Row 2: Assignments & Capstone (Figma Frame 9) */}
          <div className='flex items-center gap-1.5 text-[8px] font-medium text-[#344499]'>
            <Briefcase className='w-3 h-3 text-[#344499] shrink-0' />
            <span>
              {assignmentsCount} Assignments • {capstonesCount} Capstone Project{capstonesCount !== 1 ? 's' : ''}
            </span>
          </div>

          {/* Progress Bar (Only for Enrolled courses) */}
          {variant === 'enrolled' && (
            <div className='space-y-1.5 pt-1'>
              <div className='flex justify-between items-center text-[8px]'>
                <span className='font-medium text-black/50'>Progress</span>
                <span className='font-semibold text-black/90'>{progress}%</span>
              </div>
              {/* Dual-Track Progress Bar */}
              <div
                className={`w-full h-1.5 rounded-full overflow-hidden ${theme.progressTrack}`}
              >
                <div
                  className={`h-full rounded-full transition-all duration-700 ${theme.progressFill}`}
                  style={{ width: `${Math.max(4, progress)}%` }}
                />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Bottom Footer Bar (Figma Frame 17) */}
      <div className='flex items-center justify-between px-3 pt-3 w-full'>
        {/* Modules Counter */}
        <div className='text-[10px] font-medium text-black/50'>
          Modules:{' '}
          <span className='font-medium text-black'>
            {variant === 'enrolled' ? `${completedUnits}/${unitsCount}` : unitsCount}
          </span>
        </div>

        {/* Action Button */}
        {variant === 'enrolled' && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onContinue?.();
            }}
            className='bg-[#040000] hover:bg-slate-800 text-white text-[10px] font-medium px-3.5 py-1.5 rounded-[12px] transition-colors shadow-sm'
          >
            Continue
          </button>
        )}

        {variant === 'pending' && (
          <button
            disabled
            className='bg-[#E0E0E0] text-black text-[10px] font-medium px-3 py-1.5 rounded-[12px] cursor-not-allowed opacity-90'
          >
            Pending Approval
          </button>
        )}

        {variant === 'live' && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onRequestEnroll?.();
            }}
            className='bg-[#232D66] hover:bg-[#1a2350] text-white text-[10px] font-medium px-4 py-1.5 rounded-[12px] transition-colors shadow-sm'
          >
            Enroll
          </button>
        )}
      </div>
    </div>
  );
};

/* ==========================================================================
   Main Catalog Page Component
   ========================================================================== */

const MyCourses = () => {
  const [activeTab, setActiveTab] = useState<CatalogTab>('all');
  const [enrollTarget, setEnrollTarget] = useState<Subject | null>(null);
  const navigate = useNavigate();

  const { data: enrolled = [], isLoading: loadingEnrolled } = useEnrolledCourses();
  const { data: allSubjects = [], isLoading: loadingAll } = useAllCourses();
  const { data: enrollmentRequests = [] } = useStudentEnrollmentRequests();
  const enrollMutation = useEnrollMutation();

  const loading = loadingEnrolled || loadingAll;

  const handleEnroll = async () => {
    if (!enrollTarget) return;
    try {
      await enrollMutation.mutateAsync(enrollTarget.id);
      toast.success(
        `Enrollment request submitted for ${enrollTarget.name}! Waiting for instructor approval.`
      );
      setEnrollTarget(null);
    } catch (error) {
      toast.error(
        getErrorMessage(error, 'Enrollment request failed. Please try again.')
      );
    }
  };

  // Maps & Categorization
  const enrolledIds = useMemo(() => new Set(enrolled.map((s) => s.id)), [enrolled]);

  const pendingRequestMap = useMemo(
    () =>
      new Map(
        enrollmentRequests
          .filter((r) => r.status === 'pending')
          .map((r) => [r.subject_id, r])
      ),
    [enrollmentRequests]
  );

  // 1. Enrolled Courses
  const enrolledCourses = enrolled;

  // 2. Pending Approval Courses
  const pendingCourses = useMemo(
    () =>
      allSubjects.filter(
        (s) => !enrolledIds.has(s.id) && pendingRequestMap.has(s.id)
      ),
    [allSubjects, enrolledIds, pendingRequestMap]
  );

  // 3. Other Live Courses (Available for enrollment)
  const liveCourses = useMemo(
    () =>
      allSubjects.filter(
        (s) => !enrolledIds.has(s.id) && !pendingRequestMap.has(s.id)
      ),
    [allSubjects, enrolledIds, pendingRequestMap]
  );

  if (loading) {
    return (
      <div className='p-4 sm:p-6 md:p-8 max-w-7xl mx-auto space-y-8'>
        <div className='flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4'>
          <div className='space-y-2'>
            <Skeleton className='h-8 w-48' />
            <Skeleton className='h-4 w-72' />
          </div>
          <Skeleton className='h-10 w-80 rounded-lg' />
        </div>
        <div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6'>
          {[...Array(6)].map((_, i) => (
            <div
              key={i}
              className='bg-white rounded-[14px] p-2 space-y-4 shadow-sm border border-slate-100'
            >
              <Skeleton className='h-44 w-full rounded-[12px]' />
              <div className='flex justify-between px-2 pb-2'>
                <Skeleton className='h-4 w-16' />
                <Skeleton className='h-6 w-20 rounded-[12px]' />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className='p-4 sm:p-6 md:p-8 max-w-7xl mx-auto space-y-10'>
      {/* ====================================================================
          Page Header (Course Catalog + Top-Right Floating Pill Tabs)
         ==================================================================== */}
      <div className='flex flex-col lg:flex-row lg:items-center justify-between gap-6'>
        {/* Header Left (Title & Subtitle) */}
        <div>
          <h1 className='text-2xl font-bold text-[#374151] tracking-tight'>
            Course Catalog
          </h1>
          <p className='text-[#374151] mt-1 text-sm sm:text-base font-medium'>
            Everything you need to accelerate your learning and career growth.
          </p>
        </div>

        {/* Top-Right Pill Tabs (Figma Frame 31) */}
        <div className='bg-white shadow-[0px_4px_12px_rgba(192,207,242,0.45)] border border-slate-100/80 rounded-lg p-1.5 flex items-center gap-1.5 overflow-x-auto shrink-0 select-none'>
          {/* Enrolled Tab */}
          <button
            onClick={() => setActiveTab(activeTab === 'enrolled' ? 'all' : 'enrolled')}
            className={`px-3 py-1.5 rounded-[4px] text-[10px] font-medium transition-all duration-200 shrink-0 ${
              activeTab === 'enrolled'
                ? 'bg-[#F5F9FF] text-black shadow-[1px_3px_4px_rgba(182,199,239,0.65)] font-semibold'
                : 'bg-[rgba(234,234,234,0.54)] text-black hover:bg-slate-200/60'
            }`}
          >
            Enrolled {enrolledCourses.length > 0 && `(${enrolledCourses.length})`}
          </button>

          {/* Pending Approval Tab */}
          <button
            onClick={() => setActiveTab(activeTab === 'pending' ? 'all' : 'pending')}
            className={`px-3 py-1.5 rounded-[4px] text-[10px] font-medium transition-all duration-200 shrink-0 ${
              activeTab === 'pending'
                ? 'bg-[#F5F9FF] text-black shadow-[1px_3px_4px_rgba(182,199,239,0.65)] font-semibold'
                : 'bg-[rgba(234,234,234,0.54)] text-black hover:bg-slate-200/60'
            }`}
          >
            Pending Approval {pendingCourses.length > 0 && `(${pendingCourses.length})`}
          </button>

          {/* Other Live Courses Tab */}
          <button
            onClick={() => setActiveTab(activeTab === 'live' ? 'all' : 'live')}
            className={`px-3 py-1.5 rounded-[4px] text-[10px] font-medium transition-all duration-200 shrink-0 ${
              activeTab === 'live'
                ? 'bg-[#F5F9FF] text-black shadow-[1px_3px_4px_rgba(182,199,239,0.65)] font-semibold'
                : 'bg-[rgba(234,234,234,0.54)] text-black hover:bg-slate-200/60'
            }`}
          >
            Other Live Courses {liveCourses.length > 0 && `(${liveCourses.length})`}
          </button>

          {/* All Courses Button (Allows toggling full stacked view) */}
          {activeTab !== 'all' && (
            <button
              onClick={() => setActiveTab('all')}
              className='px-2.5 py-1.5 text-[10px] font-medium text-slate-500 hover:text-slate-800 transition-colors shrink-0 underline underline-offset-2'
            >
              View All
            </button>
          )}
        </div>
      </div>

      {/* ====================================================================
          Section 1: Enrolled Courses (Figma "Enrolled Courses")
         ==================================================================== */}
      {(activeTab === 'all' || activeTab === 'enrolled') && (
        <section className='bg-[rgba(255,255,255,0.6)] backdrop-blur-sm border-b border-black/10 pb-8 rounded-2xl p-4 sm:p-6 space-y-6'>
          <div>
            <h2 className='text-base font-bold text-[#374151] tracking-tight'>
              Enrolled Courses
            </h2>
            <p className='text-xs text-black/80 font-normal mt-0.5'>
              Continue your learning journey and track active progress.
            </p>
          </div>

          {enrolledCourses.length === 0 ? (
            <div className='flex flex-col items-center justify-center py-12 text-slate-400 gap-2'>
              <BookOpen className='w-8 h-8 text-slate-300' />
              <p className='text-xs'>You have not enrolled in any courses yet.</p>
            </div>
          ) : (
            <div className='grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6'>
              {enrolledCourses.map((course) => (
                <CourseCard
                  key={course.id}
                  course={course}
                  variant='enrolled'
                  onContinue={() => navigate(`/dashboard/student/courses/${course.slug}`)}
                />
              ))}
            </div>
          )}
        </section>
      )}

      {/* ====================================================================
          Section 2: Pending Approval Courses (Figma "Pending Approval")
         ==================================================================== */}
      {(activeTab === 'all' || activeTab === 'pending') && (
        <section className='bg-[rgba(255,255,255,0.6)] backdrop-blur-sm border-b border-black/10 pb-8 rounded-2xl p-4 sm:p-6 space-y-6'>
          <div>
            <h2 className='text-base font-bold text-[#374151] tracking-tight'>
              Pending Approval
            </h2>
            <p className='text-xs text-black/80 font-normal mt-0.5'>
              Requests awaiting facilitator approval.
            </p>
          </div>

          {pendingCourses.length === 0 ? (
            <div className='flex flex-col items-center justify-center py-10 text-slate-400 gap-2'>
              <CheckCircle2 className='w-7 h-7 text-slate-300' />
              <p className='text-xs'>No pending course enrollment requests.</p>
            </div>
          ) : (
            <div className='grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6'>
              {pendingCourses.map((course) => (
                <CourseCard
                  key={course.id}
                  course={course}
                  variant='pending'
                />
              ))}
            </div>
          )}
        </section>
      )}

      {/* ====================================================================
          Section 3: Other Live Courses (Figma "Live Courses")
         ==================================================================== */}
      {(activeTab === 'all' || activeTab === 'live') && (
        <section className='bg-[rgba(255,255,255,0.6)] backdrop-blur-sm rounded-2xl p-4 sm:p-6 space-y-6'>
          <div>
            <h2 className='text-base font-bold text-[#374151] tracking-tight'>
              Live Courses
            </h2>
            <p className='text-xs text-black/80 font-normal mt-0.5'>
              Explore live cohorts open for enrollment and secure your spot.
            </p>
          </div>

          {liveCourses.length === 0 ? (
            <div className='flex flex-col items-center justify-center py-10 text-slate-400 gap-2'>
              <Sparkles className='w-7 h-7 text-slate-300' />
              <p className='text-xs'>You have requested or enrolled in all available courses!</p>
            </div>
          ) : (
            <div className='grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6'>
              {liveCourses.map((course) => (
                <CourseCard
                  key={course.id}
                  course={course}
                  variant='live'
                  onRequestEnroll={() => setEnrollTarget(course)}
                />
              ))}
            </div>
          )}
        </section>
      )}

      {/* ====================================================================
          Enrollment Confirmation Dialog
         ==================================================================== */}
      <Dialog
        open={!!enrollTarget}
        onOpenChange={(open) => !open && setEnrollTarget(null)}
      >
        <DialogContent className='rounded-2xl'>
          <DialogHeader>
            <DialogTitle className='text-lg font-bold text-slate-900'>
              Request Enrollment in {enrollTarget?.name}?
            </DialogTitle>
            <DialogDescription className='text-sm text-slate-600 mt-2'>
              You are requesting access to{' '}
              <span className='font-semibold text-slate-800'>
                {enrollTarget?.name}
              </span>
              . Once an instructor or administrator approves your request, the course will be added to your active courses.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className='gap-2 sm:gap-0 mt-4'>
            <Button
              variant='outline'
              onClick={() => setEnrollTarget(null)}
              disabled={enrollMutation.isPending}
              className='rounded-xl'
            >
              Cancel
            </Button>
            <Button
              onClick={handleEnroll}
              disabled={enrollMutation.isPending}
              className='bg-[#232D66] hover:bg-[#1a2350] text-white rounded-xl'
            >
              {enrollMutation.isPending && (
                <Loader2 className='w-4 h-4 animate-spin mr-2' />
              )}
              {enrollMutation.isPending ? 'Submitting...' : 'Submit Request'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default MyCourses;

