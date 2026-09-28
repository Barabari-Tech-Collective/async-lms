import { useState, useEffect } from 'react';
import AdminHeader from '@/components/common/admin/AdminHeader';
import CurriculumDeveloperSidebar from '@/components/common/curriculum-developer/CurriculumDeveloperSidebar';
import { useSidebarState } from '@/hooks/useSidebarState';
import { Outlet, useLocation } from 'react-router';

const CurriculumDeveloperDashboardLayout = () => {
  const [isSidebarOpen, toggleSidebar] = useSidebarState('sidebar:curriculum-developer');
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const location = useLocation();

  // Automatically close mobile sidebar on route change
  useEffect(() => {
    setMobileSidebarOpen(false);
  }, [location.pathname]);

  return (
    <div className='flex h-screen bg-slate-100 overflow-hidden relative'>
      {/* Desktop Persistent Sidebar */}
      <div className='hidden lg:flex h-full shrink-0'>
        <CurriculumDeveloperSidebar
          isOpen={isSidebarOpen}
          toggle={() => toggleSidebar()}
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
        className={`fixed inset-y-0 left-0 z-50 w-72 max-w-[85vw] bg-slate-900 shadow-2xl flex flex-col transition-transform duration-300 ease-in-out lg:hidden ${
          mobileSidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <CurriculumDeveloperSidebar
          isOpen={true}
          isMobile={true}
          toggle={() => toggleSidebar()}
          onCloseMobile={() => setMobileSidebarOpen(false)}
        />
      </div>

      {/* Main Content Viewport */}
      <div className='flex-1 flex flex-col min-w-0 overflow-hidden'>
        <AdminHeader
          toggleSidebar={() => toggleSidebar()}
          toggleMobileSidebar={() => setMobileSidebarOpen((prev) => !prev)}
        />

        <main className='flex-1 overflow-y-auto p-3.5 sm:p-6 md:p-8 custom-scrollbar min-w-0'>
          <div className='max-w-400 mx-auto min-w-0'>
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
};

export default CurriculumDeveloperDashboardLayout;
