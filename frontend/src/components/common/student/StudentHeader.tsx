import {
  Star,
  ChevronDown,
  Menu,
  LogOut,
  User,
  Settings,
  Sparkles,
} from 'lucide-react';
import NotificationBell from '@/components/common/NotificationBell';
import { useAppSelector, useAppDispatch } from '@/app/hooks';
import { selectUser } from '@/features/auth/authSelectors';
import { logout } from '@/features/auth/authSlice';
import { useNavigate } from 'react-router';
import toast from 'react-hot-toast';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { StreakPopover } from '@/components/common/student/StreakPopover';

interface HeaderProps {
  toggleSidebar: () => void;
  toggleMobileSidebar?: () => void;
  isSidebarOpen: boolean;
  pendingMilestonesCount?: number;
  onOpenMilestonesModal?: () => void;
  mostUrgentMilestone?: {
    urgency_level: string;
    hours_left: number;
    days_left: number;
    is_overdue: boolean;
  } | null;
}

export default function StudentHeader({
  toggleSidebar,
  toggleMobileSidebar,
  pendingMilestonesCount = 0,
  onOpenMilestonesModal,
  mostUrgentMilestone,
}: HeaderProps) {
  const user = useAppSelector(selectUser);
  const dispatch = useAppDispatch();
  const navigate = useNavigate();

  const handleLogout = () => {
    dispatch(logout());
    toast.success('Signed out successfully');
    navigate('/');
  };

  const handleMenuClick = () => {
    if (window.innerWidth < 1024 && toggleMobileSidebar) {
      toggleMobileSidebar();
    } else {
      toggleSidebar();
    }
  };

  return (
    <header className='h-16 border-b bg-white flex items-center justify-between px-2.5 sm:px-4 md:px-8 shrink-0 select-none'>
      <div className='flex items-center gap-1.5 sm:gap-4 min-w-0 flex-1 mr-1.5'>
        {/* Toggle Button for Mobile and Desktop */}
        <button
          onClick={handleMenuClick}
          className='p-2 hover:bg-slate-100 rounded-lg text-slate-600 transition-all focus:outline-none focus:ring-2 focus:ring-blue-100 min-h-[44px] min-w-[44px] flex items-center justify-center shrink-0'
          aria-label='Toggle Sidebar'
        >
          <Menu className='w-5 h-5' />
        </button>

        {/* Welcome Message */}
        <h1 className='font-bold text-xs sm:text-base md:text-lg text-[#1e2653] tracking-tight truncate min-w-0'>
          <span className='hidden sm:inline'>
            {(() => {
              const h = new Date().getHours();
              return h < 12
                ? 'Good Morning, '
                : h < 17
                  ? 'Good Afternoon, '
                  : 'Good Evening, ';
            })()}
          </span>
          <span className='text-blue-600 capitalize'>
            {user?.full_name?.split(' ')[0] || 'Student'}!
          </span>
        </h1>
      </div>

      <div className='flex items-center gap-1.5 sm:gap-3 md:gap-6 shrink-0'>
        {/* Milestone Alert Pill */}
        {onOpenMilestonesModal && (
          <button
            onClick={onOpenMilestonesModal}
            className={`flex items-center gap-1 sm:gap-1.5 px-2 sm:px-3 py-1 sm:py-1.5 rounded-full border text-[10px] sm:text-xs font-bold shrink-0 transition-all cursor-pointer shadow-xs ${
              pendingMilestonesCount > 0
                ? mostUrgentMilestone?.is_overdue
                  ? 'bg-rose-50 hover:bg-rose-100 text-rose-700 border-rose-200 animate-pulse'
                  : mostUrgentMilestone?.urgency_level === 'urgent'
                  ? 'bg-rose-50 hover:bg-rose-100 text-rose-700 border-rose-200'
                  : 'bg-amber-50 hover:bg-amber-100 text-amber-700 border-amber-200'
                : 'bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border-indigo-200'
            }`}
            title="Click to view your learning pathway and progress milestones"
          >
            <Sparkles className="w-3.5 h-3.5 fill-current shrink-0" />
            {pendingMilestonesCount > 0 ? (
              <>
                <span>{pendingMilestonesCount}</span>
                <span className="hidden sm:inline">
                  {mostUrgentMilestone?.is_overdue
                    ? ' OVERDUE'
                    : mostUrgentMilestone?.urgency_level === 'urgent'
                    ? ' DUE TODAY'
                    : ' DUE SOON'}
                </span>
              </>
            ) : (
              <span className="text-[11px] font-bold text-indigo-700">Learning Pathway</span>
            )}
          </button>
        )}

        {/* Streak Popover - Interactive habit streak tracker */}
        <StreakPopover />

        {/* XP Badge - Compact on mobile, full on desktop */}
        <div
          className='flex items-center gap-1 sm:gap-1.5 bg-indigo-50 text-indigo-600 px-1.5 sm:px-3 py-1 sm:py-1.5 rounded-full border border-indigo-100 text-[10px] sm:text-xs font-bold shrink-0'
          title={`${(user?.total_points ?? 0).toLocaleString()} XP`}
        >
          <Star className='w-3.5 h-3.5 fill-indigo-500 shrink-0' />
          <span>{(user?.total_points ?? 0).toLocaleString()}</span>
          <span className='hidden sm:inline'> XP</span>
        </div>

        {/* Action Controls */}
        <div className='flex items-center gap-1 sm:gap-2 md:gap-4 pl-1.5 sm:pl-4 border-l border-slate-100'>
          {/* Notifications Bell */}
          <NotificationBell />

          {/* Profile Dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className='flex items-center gap-1.5 sm:gap-2 cursor-pointer group p-1 rounded-lg hover:bg-slate-50 transition-all focus:outline-none min-h-[44px] min-w-[44px]'>
                <div className='w-8 h-8 rounded-full bg-slate-100 border border-slate-200 overflow-hidden shrink-0 shadow-sm'>
                  <img
                    src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${
                      user?.full_name || 'Felix'
                    }`}
                    alt='avatar'
                    className='w-full h-full object-cover'
                  />
                </div>
                <ChevronDown className='w-3.5 h-3.5 text-slate-400 group-hover:text-slate-600 transition-transform group-data-[state=open]:rotate-180 hidden sm:block' />
              </button>
            </DropdownMenuTrigger>

            <DropdownMenuContent
              align='end'
              className='w-60 p-2 mt-2 shadow-xl border-slate-200 z-50'
            >
              <DropdownMenuLabel className='font-normal p-2'>
                <div className='flex flex-col space-y-1'>
                  <p className='text-sm font-bold text-[#1e2653] truncate'>
                    {user?.full_name || 'Student User'}
                  </p>
                  <p className='text-[11px] text-slate-500 truncate'>
                    {user?.email || 'student@codeguru.com'}
                  </p>
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator className='bg-slate-100' />

              <DropdownMenuItem
                className='cursor-pointer py-2.5 rounded-md focus:text-blue-700 focus:bg-slate-50 gap-2'
                onClick={() => navigate('/dashboard/student/profile')}
              >
                <User className='h-4 w-4 text-slate-400' />
                <span className='text-sm font-medium'>My Profile</span>
              </DropdownMenuItem>

              <DropdownMenuItem
                className='cursor-pointer py-2.5 rounded-md focus:text-blue-700 focus:bg-slate-50 gap-2'
                onClick={() => navigate('/dashboard/student/settings')}
              >
                <Settings className='h-4 w-4 text-slate-400' />
                <span className='text-sm font-medium'>Account Settings</span>
              </DropdownMenuItem>

              <DropdownMenuSeparator className='bg-slate-100' />

              <DropdownMenuItem
                className='cursor-pointer py-2.5 rounded-md text-red-600 focus:text-red-700 focus:bg-red-50 gap-2'
                onClick={handleLogout}
              >
                <LogOut className='h-4 w-4' />
                <span className='text-sm font-bold'>Sign Out</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  );
}

