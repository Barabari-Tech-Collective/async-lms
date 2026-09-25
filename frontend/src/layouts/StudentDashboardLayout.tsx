import { useState, useEffect } from 'react';
import { useSidebarState } from '@/hooks/useSidebarState';
import StudentSidebar from '@/components/common/student/StudentSidebar';
import StudentHeader from '@/components/common/student/StudentHeader';
import { Outlet, useLocation } from 'react-router';
import apiClient from '@/services/api';
import toast from 'react-hot-toast';
import {
  PendingTasksReminderModal,
  type ActiveMilestonesData,
} from '@/components/deadlines/PendingTasksReminderModal';

const StudentDashboardLayout = () => {
  const [isSidebarOpen, toggleSidebar] = useSidebarState('sidebar:student');
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const location = useLocation();

  const [milestonesData, setMilestonesData] = useState<ActiveMilestonesData | null>(null);
  const [isMilestonesModalOpen, setIsMilestonesModalOpen] = useState(false);
  const [hasAutoOpened, setHasAutoOpened] = useState(false);

  // Clean up any stale legacy lockout keys from previous sessions
  useEffect(() => {
    sessionStorage.removeItem('lms_milestone_shown_session');
    localStorage.removeItem('lms_milestone_snoozed_until');
  }, []);

  // Automatically close mobile sidebar on route change
  useEffect(() => {
    setMobileSidebarOpen(false);
  }, [location.pathname]);

  // Fetch active progress-driven milestones
  useEffect(() => {
    let isMounted = true;

    const fetchMilestones = async () => {
      try {
        const res = await apiClient.get('/students/deadlines/active-milestones');
        if (isMounted && res.data?.success && res.data.data) {
          const data: ActiveMilestonesData = res.data.data;
          setMilestonesData(data);

          // Only auto-trigger modal on the main student dashboard home
          const isHome =
            location.pathname === '/dashboard/student' ||
            location.pathname === '/dashboard/student/';

          const hasPendingTasks =
            Boolean(data.total_pending && data.total_pending > 0) ||
            Boolean(data.milestones && data.milestones.length > 0);

          // Pop up automatically on login / dashboard load whenever pending tasks exist
          if (isHome && hasPendingTasks && !hasAutoOpened) {
            setHasAutoOpened(true);
            setTimeout(() => {
              if (isMounted) {
                setIsMilestonesModalOpen(true);
              }
            }, 500);
          }
        }
      } catch (err: any) {
        console.error('Failed to fetch active milestone deadlines:', err?.response?.data || err?.message || err);
      }
    };

    fetchMilestones();

    const handleProgress = () => {
      fetchMilestones();
    };

    const handleAssignmentCreated = (e: Event) => {
      const customEvent = e as CustomEvent;
      const notification = customEvent.detail;

      // 1. Instantly refetch active milestones in background
      fetchMilestones();

      // 2. Display friendly notification toast
      toast.success(notification?.title || 'New Assignment Assigned!', {
        icon: '📋',
        duration: 4000,
      });

      // 3. Open pop-up modal if student is on dashboard home
      const isHome =
        location.pathname === '/dashboard/student' ||
        location.pathname === '/dashboard/student/';
      if (isHome) {
        setIsMilestonesModalOpen(true);
      }
    };

    window.addEventListener('course-progress-updated', handleProgress);
    window.addEventListener('assignment:created', handleAssignmentCreated);

    return () => {
      isMounted = false;
      window.removeEventListener('course-progress-updated', handleProgress);
      window.removeEventListener('assignment:created', handleAssignmentCreated);
    };
  }, [location.pathname]);

  const handleSnooze = () => {
    setIsMilestonesModalOpen(false);
  };

  const handleClose = () => {
    setIsMilestonesModalOpen(false);
  };

  const handleOpenMilestonesModal = () => {
    setIsMilestonesModalOpen(true);
  };

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
          pendingMilestonesCount={milestonesData?.total_pending ?? 0}
          onOpenMilestonesModal={handleOpenMilestonesModal}
          mostUrgentMilestone={milestonesData?.milestones?.[0] ?? null}
        />

        <main className='flex-1 overflow-y-auto custom-scrollbar'>
          <div>
            <Outlet />
          </div>
        </main>
      </div>

      {/* In-App Milestone Reminder Pop-up */}
      <PendingTasksReminderModal
        isOpen={isMilestonesModalOpen}
        onClose={handleClose}
        onSnooze={handleSnooze}
        data={milestonesData}
      />
    </div>
  );
};

export default StudentDashboardLayout;


