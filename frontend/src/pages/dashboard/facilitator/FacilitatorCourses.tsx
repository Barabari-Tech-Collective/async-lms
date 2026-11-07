import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router';
import {
  Layers,
  Briefcase,
  BookOpen,
} from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { useFacilitatorCourses, type FacilitatorCourse } from '@/hooks/queries/useCourses';

/* ==========================================================================
   Types & Domain Theme Mapping (Figma Exact Palette)
   ========================================================================== */

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
    defaultContentType: 'Practice Heavy',
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
  },
};

function resolveCourseTheme(course: FacilitatorCourse): DomainTheme {
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

function resolveContentType(course: FacilitatorCourse): string {
  const text = `${course.name || ''} ${course.slug || ''}`.toLowerCase();
  if (text.includes('interview')) return 'Interview Focused';
  if (text.includes('agent') || text.includes('ai')) return 'Balanced';
  if (text.includes('theory') || text.includes('python')) return 'Theory Heavy';
  return 'Practice Heavy';
}

/* ==========================================================================
   Facilitator Course Card (Matches Figma Frames 16 - 22)
   ========================================================================== */

interface FacilitatorCourseCardProps {
  course: FacilitatorCourse;
  onPreview: () => void;
}

const FacilitatorCourseCard: React.FC<FacilitatorCourseCardProps> = ({
  course,
  onPreview,
}) => {
  const theme = resolveCourseTheme(course);
  const contentType = resolveContentType(course);

  const unitsCount = course.units_count ?? course.topic_count ?? 6;
  const lessonsCount = course.total_lessons ?? course.lesson_count ?? 120;
  const assignmentsCount = course.assignments_count ?? unitsCount;
  const capstonesCount = course.capstones_count ?? 1;

  return (
    <div
      onClick={onPreview}
      className='bg-white border-[2.5px] border-white rounded-[14px] shadow-[0px_4px_16px_rgba(0,0,0,0.04)] hover:shadow-[0px_8px_24px_rgba(0,0,0,0.08)] transition-all duration-300 flex flex-col justify-between p-1 pb-3 w-full select-none cursor-pointer hover:-translate-y-0.5'
    >
      {/* Top Inner Colored Container (Figma Frame 16) */}
      <div
        className={`${theme.cardInnerBg} rounded-[12px] p-4 flex flex-col justify-between min-h-[148px] transition-colors`}
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
                'Master modern frontend frameworks, scalable backend architectures, and database management.'}
            </p>
          </div>
        </div>

        {/* Stats Section (Figma Frames 8 & 9) */}
        <div className='space-y-1.5 pt-2'>
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
        </div>
      </div>

      {/* Bottom Footer Bar (Figma Frame 17) */}
      <div className='flex items-center justify-between px-3 pt-3 w-full'>
        {/* Modules Counter */}
        <div className='text-[10px] font-medium text-black/50'>
          Modules:{' '}
          <span className='font-medium text-black'>
            {unitsCount}
          </span>
        </div>

        {/* Action Button */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            onPreview();
          }}
          className='bg-[#000000] hover:bg-slate-800 text-white text-[10px] font-medium px-4 py-1.5 rounded-[12px] transition-colors shadow-sm'
        >
          Preview Course
        </button>
      </div>
    </div>
  );
};

/* ==========================================================================
   Main Facilitator Courses Component
   ========================================================================== */

type LevelFilter = 'all' | 'beginner' | 'intermediate' | 'advanced';

const FacilitatorCourses: React.FC = () => {
  const navigate = useNavigate();
  const [selectedLevel, setSelectedLevel] = useState<LevelFilter>('all');
  const { data: courses = [], isLoading, isError } = useFacilitatorCourses();

  // Filter courses by difficulty level
  const filteredCourses = useMemo(() => {
    if (selectedLevel === 'all') return courses;
    return courses.filter((c) => {
      const level = (c.level || 'beginner').toLowerCase();
      return level === selectedLevel;
    });
  }, [courses, selectedLevel]);

  // Count courses per level for badge counts
  const levelCounts = useMemo(() => {
    const counts = { all: courses.length, beginner: 0, intermediate: 0, advanced: 0 };
    courses.forEach((c) => {
      const level = (c.level || 'beginner').toLowerCase() as keyof typeof counts;
      if (counts[level] !== undefined) {
        counts[level]++;
      } else {
        counts.beginner++;
      }
    });
    return counts;
  }, [courses]);

  if (isLoading) {
    return (
      <div className='p-4 sm:p-6 md:p-8 max-w-7xl mx-auto space-y-8'>
        <div className='flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4'>
          <div className='space-y-2'>
            <Skeleton className='h-8 w-56' />
            <Skeleton className='h-4 w-72' />
          </div>
          <Skeleton className='h-10 w-72 rounded-lg' />
        </div>
        <div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6'>
          {[...Array(6)].map((_, i) => (
            <div
              key={i}
              className='bg-white rounded-[14px] p-2 space-y-4 shadow-sm border border-slate-100'
            >
              <Skeleton className='h-40 w-full rounded-[12px]' />
              <div className='flex justify-between px-2 pb-2'>
                <Skeleton className='h-4 w-16' />
                <Skeleton className='h-6 w-24 rounded-[12px]' />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <div className='rounded-xl border border-red-200 bg-red-50/50 p-6 text-center space-y-2 max-w-md mx-auto my-12'>
        <p className='text-red-700 font-semibold text-sm'>Unable to load assigned courses</p>
        <p className='text-xs text-slate-500'>Please refresh the page or check your connection.</p>
      </div>
    );
  }

  return (
    <div className='p-4 sm:p-6 md:p-8 max-w-7xl mx-auto space-y-8 animate-in fade-in duration-300'>
      {/* ====================================================================
          Page Header (Facilitator Course Catalog + Level Filter Pills)
         ==================================================================== */}
      <div className='flex flex-col lg:flex-row lg:items-center justify-between gap-6'>
        {/* Header Left (Title & Subtitle) */}
        <div>
          <h1 className='text-2xl font-bold text-[#374151] tracking-tight'>
            Facilitator Course Catalog
          </h1>
          <p className='text-[#374151] mt-1 text-sm sm:text-base font-medium'>
            Everything you need to accelerate your learning and career growth.
          </p>
        </div>

        {/* Top-Right Pill Filters (Figma Frame 31) */}
        <div className='bg-white shadow-[0px_4px_4px_rgba(192,207,242,0.74)] border border-slate-100/80 rounded-lg p-1.5 flex items-center gap-2 overflow-x-auto shrink-0 select-none'>
          {/* All Filter */}
          <button
            onClick={() => setSelectedLevel('all')}
            className={`px-3 py-1.5 rounded-[4px] text-[10px] transition-all duration-200 shrink-0 ${
              selectedLevel === 'all'
                ? 'bg-[#F5F9FF] text-black shadow-[1px_3px_4px_rgba(182,199,239,0.65)] font-semibold'
                : 'bg-[rgba(234,234,234,0.54)] text-black hover:bg-slate-200/60 font-medium'
            }`}
          >
            All {levelCounts.all > 0 && `(${levelCounts.all})`}
          </button>

          {/* Beginner Filter */}
          <button
            onClick={() => setSelectedLevel('beginner')}
            className={`px-3 py-1.5 rounded-[4px] text-[10px] transition-all duration-200 shrink-0 ${
              selectedLevel === 'beginner'
                ? 'bg-[#F5F9FF] text-black shadow-[1px_3px_4px_rgba(182,199,239,0.65)] font-semibold'
                : 'bg-[rgba(234,234,234,0.54)] text-black hover:bg-slate-200/60 font-medium'
            }`}
          >
            Beginner {levelCounts.beginner > 0 && `(${levelCounts.beginner})`}
          </button>

          {/* Intermediate Filter */}
          <button
            onClick={() => setSelectedLevel('intermediate')}
            className={`px-3 py-1.5 rounded-[4px] text-[10px] transition-all duration-200 shrink-0 ${
              selectedLevel === 'intermediate'
                ? 'bg-[#F5F9FF] text-black shadow-[1px_3px_4px_rgba(182,199,239,0.65)] font-semibold'
                : 'bg-[rgba(234,234,234,0.54)] text-black hover:bg-slate-200/60 font-medium'
            }`}
          >
            Intermediate {levelCounts.intermediate > 0 && `(${levelCounts.intermediate})`}
          </button>

          {/* Advanced Filter */}
          <button
            onClick={() => setSelectedLevel('advanced')}
            className={`px-3 py-1.5 rounded-[4px] text-[10px] transition-all duration-200 shrink-0 ${
              selectedLevel === 'advanced'
                ? 'bg-[#F5F9FF] text-black shadow-[1px_3px_4px_rgba(182,199,239,0.65)] font-semibold'
                : 'bg-[rgba(234,234,234,0.54)] text-black hover:bg-slate-200/60 font-medium'
            }`}
          >
            Advanced {levelCounts.advanced > 0 && `(${levelCounts.advanced})`}
          </button>
        </div>
      </div>

      {/* ====================================================================
          Section Frame ("Courses I Teach")
         ==================================================================== */}
      <section className='bg-[rgba(255,255,255,0.56)] backdrop-blur-sm border-b border-black/10 pb-8 rounded-2xl p-4 sm:p-6 space-y-6'>
        <div>
          <h2 className='text-base font-bold text-[#374151] tracking-tight'>
            Courses I Teach
          </h2>
          <p className='text-xs text-black/80 font-normal mt-0.5'>
            Explore your course library and preview student-facing learning paths.
          </p>
        </div>

        {filteredCourses.length === 0 ? (
          <div className='flex flex-col items-center justify-center py-12 text-slate-400 gap-2 bg-white/60 rounded-xl border border-dashed border-slate-200'>
            <BookOpen className='w-8 h-8 text-slate-300' />
            <p className='text-xs'>
              {courses.length === 0
                ? "You haven't been assigned to any course subjects yet. Contact your administrator."
                : `No courses found matching "${selectedLevel}" level.`}
            </p>
            {selectedLevel !== 'all' && (
              <button
                onClick={() => setSelectedLevel('all')}
                className='text-xs text-indigo-600 hover:underline mt-1 font-medium'
              >
                Clear filter
              </button>
            )}
          </div>
        ) : (
          <div className='grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6'>
            {filteredCourses.map((course) => (
              <FacilitatorCourseCard
                key={course.id}
                course={course}
                onPreview={() => navigate(`/dashboard/facilitator/courses/${course.slug}`)}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
};

export default FacilitatorCourses;

