import { useState, useEffect } from 'react';
import { Outlet, Link, useParams, useLocation } from 'react-router';
import { ChevronLeft, GraduationCap, BookOpen } from 'lucide-react';
import { SubjectSidebar } from '@/components/common/subject/SubjectSidebar';
import { useAppSelector } from '@/app/hooks';
import { selectLessonData } from '@/features/lesson/lessonSlice';

const CourseViewLayout = () => {
  const { slug } = useParams();
  const location = useLocation();
  const lessonData = useAppSelector(selectLessonData);
  const subtopic = lessonData?.subtopic;
  const [isCurriculumOpen, setIsCurriculumOpen] = useState(false);

  // Close mobile curriculum drawer on navigation
  useEffect(() => {
    setIsCurriculumOpen(false);
  }, [location.pathname]);

  return (
    <div className='flex h-screen bg-white overflow-hidden relative'>
      {/* Desktop Persistent Subject Sidebar */}
      <div className='hidden lg:flex h-full shrink-0'>
        <SubjectSidebar />
      </div>

      {/* Mobile Slide-Over Curriculum Drawer */}
      {isCurriculumOpen && (
        <div
          className='fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 transition-opacity lg:hidden animate-in fade-in duration-200'
          onClick={() => setIsCurriculumOpen(false)}
          aria-hidden='true'
        />
      )}
      <div
        className={`fixed inset-y-0 left-0 z-50 w-80 max-w-[85vw] bg-white shadow-2xl flex flex-col transition-transform duration-300 ease-in-out lg:hidden ${
          isCurriculumOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <SubjectSidebar
          isMobile={true}
          onCloseMobile={() => setIsCurriculumOpen(false)}
        />
      </div>

      {/* Main Content Viewport */}
      <div className='flex-1 flex flex-col min-w-0'>
        {/* Course-specific Header */}
        <header className='h-16 border-b flex items-center justify-between px-3 sm:px-6 bg-white shrink-0 gap-2 select-none'>
          <div className='flex items-center gap-2 sm:gap-4 min-w-0 flex-1'>
            <Link
              to='/dashboard/student/courses'
              className='p-2 hover:bg-slate-100 rounded-full transition-colors shrink-0 min-h-[44px] min-w-[44px] flex items-center justify-center'
              title='Back to Courses'
            >
              <ChevronLeft className='w-5 h-5 text-slate-600' />
            </Link>
            <div className='flex items-center gap-2 min-w-0'>
              <div className='bg-blue-600 p-1.5 rounded-lg shrink-0'>
                <GraduationCap className='w-4 h-4 text-white' />
              </div>
              <span className='font-bold text-xs sm:text-sm text-slate-800 uppercase tracking-tight truncate'>
                {subtopic?.title || 'Course Overview'}
              </span>
            </div>
          </div>

          <div className='flex items-center gap-2 sm:gap-4 shrink-0'>
            {/* Mobile Curriculum Drawer Toggle */}
            <button
              onClick={() => setIsCurriculumOpen((prev) => !prev)}
              className='lg:hidden flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-lg text-xs font-bold transition-colors min-h-[38px]'
              aria-label='Toggle Curriculum'
            >
              <BookOpen className='w-4 h-4' />
              <span>Curriculum</span>
            </button>

            <div className='hidden md:block text-xs font-medium text-slate-500'>
              Course ID: {slug}
            </div>
          </div>
        </header>

        {/* Content Area */}
        <main className='flex-1 overflow-y-auto bg-[#fcfcfd]'>
          <Outlet />
        </main>
      </div>
    </div>
  );
};

export default CourseViewLayout;

