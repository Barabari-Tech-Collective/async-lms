import { useState, useEffect } from 'react';
import { useSidebarState } from '@/hooks/useSidebarState';
import StudentSidebar from '@/components/common/student/StudentSidebar';
import StudentHeader from '@/components/common/student/StudentHeader';
import { Outlet, useLocation } from 'react-router';

const StudentDashboardLayout = () => {
  const [isSidebarOpen, toggleSidebar] = useSidebarState('sidebar:student');
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const location = useLocation();

  // Automatically close mobile sidebar on route change
  useEffect(() => {
    setMobileSidebarOpen(false);
  }, [location.pathname]);

  return (
    <div className='flex h-screen bg-slate-50/50 overflow-hidden relative'>
      {/* Desktop Persistent Sidebar */}
      <div className='hidden lg:flex h-full shrink-0'>
        <StudentSidebar
          isOpen={isSidebarOpen}
          onToggle={() => toggleSidebar()}
        />
      </div>

      {/* Mobile Slide-Over Drawer with Backdrop */}
      {mobileSidebarOpen && (
        <div
          className='fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 transition-opacity lg:hidden animate-in fade-in duration-200'
          onClick={() => setMobileSidebarOpen(false)}
          aria-hidden='true'
        />
      )}
      <div
        className={`fixed inset-y-0 left-0 z-50 w-72 max-w-[85vw] bg-white shadow-2xl flex flex-col transition-transform duration-300 ease-in-out lg:hidden ${
          mobileSidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <StudentSidebar
          isOpen={true}
          isMobile={true}
          onToggle={() => toggleSidebar()}
          onCloseMobile={() => setMobileSidebarOpen(false)}
        />
      </div>

      {/* Main Content Viewport */}
      <div className='flex-1 flex flex-col min-w-0 overflow-hidden'>
        <StudentHeader
          toggleSidebar={() => toggleSidebar()}
          toggleMobileSidebar={() => setMobileSidebarOpen((prev) => !prev)}
          isSidebarOpen={isSidebarOpen}
        />

        <main className='flex-1 overflow-y-auto custom-scrollbar'>
          <div>
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
};

export default StudentDashboardLayout;

