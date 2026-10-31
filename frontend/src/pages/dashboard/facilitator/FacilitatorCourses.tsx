import React from 'react';
import { useNavigate } from 'react-router';
import {
  Code2,
  Boxes,
  Zap,
  Layout,
  BookOpen,
  ArrowRight,
  Layers,
  FileText,
  Eye,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useFacilitatorCourses, type FacilitatorCourse } from '@/hooks/queries/useCourses';

const getCourseIcon = (slug: string) => {
  if (slug.includes('frontend') || slug.includes('react') || slug.includes('web')) return Code2;
  if (slug.includes('backend') || slug.includes('node') || slug.includes('python')) return Boxes;
  if (slug.includes('devops') || slug.includes('cloud') || slug.includes('docker')) return Zap;
  return Layout;
};

const FacilitatorCourses: React.FC = () => {
  const navigate = useNavigate();
  const { data: courses = [], isLoading, isError } = useFacilitatorCourses();

  if (isLoading) {
    return (
      <div className="p-1 sm:p-2 space-y-4 sm:space-y-5">
        <div className="space-y-1.5">
          <Skeleton className="h-7 w-44 sm:w-52" />
          <Skeleton className="h-3.5 w-60 sm:w-72" />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4 lg:gap-5">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="bg-white rounded-xl sm:rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden space-y-3">
              <Skeleton className="h-20 sm:h-24 w-full bg-slate-900/10" />
              <div className="p-3.5 sm:p-4 space-y-3">
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-8 w-full" />
                <Skeleton className="h-9 w-full rounded-lg" />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50/50 p-6 text-center space-y-2 max-w-md mx-auto my-6">
        <p className="text-red-700 font-semibold text-sm">Unable to load assigned courses</p>
        <p className="text-xs text-slate-500">Please refresh the page or check your connection.</p>
      </div>
    );
  }

  return (
    <div className="p-1 sm:p-2 space-y-4 sm:space-y-5 animate-in fade-in duration-300">
      {/* Header section matching CodeGuru aesthetic */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-2 border-b border-slate-200">
        <div className="space-y-0.5">
          <h1 className="text-lg sm:text-xl md:text-2xl font-bold tracking-tight text-slate-900">
            Assigned Courses
          </h1>
          <p className="text-slate-500 text-xs sm:text-sm">
            Preview curriculum, lessons, assignments, quizzes, and exercises for courses assigned to you.
          </p>
        </div>
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-[11px] sm:text-xs font-semibold bg-[#4E5BA6]/10 text-[#4E5BA6] border border-[#4E5BA6]/25 shadow-2xs self-start sm:self-auto shrink-0">
          <span className="w-1.5 h-1.5 rounded-full bg-[#4E5BA6] animate-pulse" />
          <Eye className="w-3.5 h-3.5 text-[#4E5BA6]" />
          <span>Instructor Preview Mode</span>
        </div>
      </div>

      {/* Courses Grid: Styled with a lighter, modern brand indigo-blue */}
      {courses.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-200 p-8 sm:p-12 text-center max-w-md mx-auto space-y-3 bg-white">
          <div className="w-12 h-12 rounded-xl bg-slate-100 flex items-center justify-center mx-auto text-slate-400">
            <BookOpen className="w-6 h-6" />
          </div>
          <div className="space-y-1">
            <h3 className="font-bold text-sm sm:text-base text-slate-900">No Courses Assigned Yet</h3>
            <p className="text-xs text-slate-500 leading-relaxed">
              You haven't been assigned to any course subjects yet. Contact your administrator to get course access.
            </p>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4 lg:gap-5">
          {courses.map((course: FacilitatorCourse) => {
            const Icon = getCourseIcon(course.slug);

            return (
              <div
                key={course.id}
                onClick={() => navigate(`/dashboard/facilitator/courses/${course.slug}`)}
                className="bg-white rounded-xl sm:rounded-2xl border border-slate-200/80 shadow-xs hover:shadow-lg hover:border-[#4E5BA6]/40 transition-all duration-300 overflow-hidden group cursor-pointer flex flex-col justify-between"
              >
                <div>
                  {/* Top Banner styled with lighter shade of brand blue-indigo */}
                  <div className="bg-gradient-to-br from-[#4E5BA6] via-[#5665B2] to-[#6373C5] h-20 sm:h-24 flex items-center justify-center relative border-b border-[#434F94]">
                    <Icon className="w-8 h-8 sm:w-10 sm:h-10 text-white group-hover:scale-105 transition-all duration-200" />
                    <span className="absolute top-2.5 right-2.5 bg-white/20 backdrop-blur-xs border border-white/30 text-white text-[9px] sm:text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full flex items-center gap-1 shadow-2xs">
                      <span className="w-1 h-1 rounded-full bg-yellow-300" />
                      Assigned
                    </span>
                  </div>

                  {/* Card Content */}
                  <div className="p-3.5 sm:p-4 space-y-2 sm:space-y-2.5">
                    {/* Title + Level badge */}
                    <div className="flex items-center justify-between gap-2">
                      <h3 className="text-sm sm:text-base font-bold text-slate-900 leading-tight line-clamp-1 group-hover:text-[#4E5BA6] transition-colors">
                        {course.name}
                      </h3>
                      {course.level && (
                        <Badge
                          variant="secondary"
                          className="bg-slate-100 text-slate-700 font-semibold border-none px-2 py-0.5 text-[9px] uppercase tracking-wider shrink-0"
                        >
                          {course.level}
                        </Badge>
                      )}
                    </div>

                    {/* Description */}
                    <p className="text-slate-500 text-xs line-clamp-1 sm:line-clamp-2 leading-relaxed">
                      {course.description || 'Comprehensive curriculum covering core concepts, real-world projects, and hands-on exercises.'}
                    </p>

                    {/* Stats */}
                    <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-100 text-[11px] sm:text-xs text-slate-600 font-medium">
                      <div className="flex items-center gap-1.5">
                        <Layers className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        <span className="truncate">
                          <strong className="text-slate-800">{course.topic_count}</strong> {course.topic_count === 1 ? 'Topic' : 'Topics'}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <FileText className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        <span className="truncate">
                          <strong className="text-slate-800">{course.lesson_count}</strong> {course.lesson_count === 1 ? 'Lesson' : 'Lessons'}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Bottom Action Button in matching lighter brand tone */}
                <div className="p-3.5 sm:p-4 pt-0">
                  <Button
                    onClick={(e) => {
                      e.stopPropagation();
                      navigate(`/dashboard/facilitator/courses/${course.slug}`);
                    }}
                    className="w-full bg-[#4E5BA6] hover:bg-[#434F94] text-white font-semibold h-10 sm:h-9.5 min-h-[44px] text-xs sm:text-sm rounded-lg sm:rounded-xl shadow-xs transition-all flex items-center justify-center gap-2 cursor-pointer group-hover:bg-[#434F94]"
                  >
                    <span>Preview Curriculum</span>
                    <ArrowRight className="w-3.5 h-3.5 text-yellow-300 transition-transform group-hover:translate-x-1" />
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default FacilitatorCourses;
