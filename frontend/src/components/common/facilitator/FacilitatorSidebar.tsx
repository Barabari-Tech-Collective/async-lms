import { useState } from 'react';
import {
  LayoutDashboard,
  Users,
  Settings,
  ClipboardList,
  CheckSquare,
  BarChart2,
  Sparkles,
  X,
  CalendarCheck,
  ChevronDown,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { NavLink, useLocation } from 'react-router';
import { useAppSelector } from '@/app/hooks';
import { selectUser } from '@/features/auth/authSelectors';
import Logo from '../Logo';

const menuItems = [
  { name: 'Dashboard', icon: LayoutDashboard, path: '/dashboard/facilitator' },
  { name: 'Students', icon: Users, path: '/dashboard/facilitator/students' },
  {
    name: 'Assignments',
    icon: ClipboardList,
    path: '/dashboard/facilitator/assignments',
  },
  {
    name: 'Evaluations',
    icon: CheckSquare,
    path: '/dashboard/facilitator/evaluations',
  },
  {
    name: 'AI Curriculum',
    icon: Sparkles,
    path: '/dashboard/facilitator/ai-curriculum',
  },
  {
    name: 'Analytics',
    icon: BarChart2,
    path: '/dashboard/facilitator/analytics',
  },
  { name: 'Settings', icon: Settings, path: '/dashboard/facilitator/settings' },
];

export default function FacilitatorSidebar({
  isOpen,
  toggle,
  isMobile = false,
  onCloseMobile,
}: {
  isOpen: boolean;
  toggle: () => void;
  isMobile?: boolean;
  onCloseMobile?: () => void;
}) {
  const user = useAppSelector(selectUser);
  const location = useLocation();
  const isAttendanceActive = location.pathname.startsWith('/dashboard/facilitator/attendance');
  const [attendanceMenu, setAttendanceMenu] = useState({
    locationKey: location.key,
    open: isAttendanceActive,
  });
  if (attendanceMenu.locationKey !== location.key) {
    setAttendanceMenu({ locationKey: location.key, open: isAttendanceActive });
  }
  const isAttendanceOpen = attendanceMenu.locationKey === location.key
    ? attendanceMenu.open
    : isAttendanceActive;

  const handleLinkClick = () => {
    if (isMobile && onCloseMobile) {
      onCloseMobile();
    }
  };

  const handleAttendanceClick = () => {
    if (!isOpen && !isMobile) {
      toggle();
      setAttendanceMenu({ locationKey: location.key, open: true });
    } else {
      setAttendanceMenu({ locationKey: location.key, open: !isAttendanceOpen });
    }
  };

  const handleDashboardSubClick = () => {
    handleLinkClick();
    if (isOpen && !isMobile) {
      toggle();
    }
  };

  return (
    <aside
      className={cn(
        'h-full flex flex-col transition-all duration-300 bg-slate-900 text-slate-300 overflow-hidden',
        isMobile ? 'w-full' : isOpen ? 'w-64' : 'w-20',
      )}
    >
      {/* Brand Header */}
      <div className='h-16 flex items-center justify-between px-6 shrink-0 mt-2 sm:mt-4'>
        <div className='flex items-center gap-3'>
          <Logo className='h-10 w-10 sm:h-12 sm:w-12' iconOnly={!isMobile && !isOpen} />
          {(isOpen || isMobile) && (
            <span className='font-bold text-xl text-white tracking-tight'>
              CodeGuru
            </span>
          )}
        </div>

        {/* Mobile Close Button */}
        {isMobile && (
          <button
            onClick={onCloseMobile}
            className='p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors focus:outline-none min-h-[44px] min-w-[44px] flex items-center justify-center'
            aria-label='Close Sidebar'
          >
            <X className='w-5 h-5' />
          </button>
        )}
      </div>

      {/* Nav Items */}
      <nav
        className={cn(
          'min-h-0 flex-1 py-4 px-3 space-y-1.5 overflow-x-hidden overflow-y-auto [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden',
        )}
      >
        {menuItems.slice(0, 2).map((item) => (
          <NavLink
            key={item.name}
            to={item.path}
            end={item.path === '/dashboard/facilitator'}
            onClick={handleLinkClick}
            className={({ isActive }) =>
              cn(
                'flex items-center py-3 rounded-xl transition-all group min-h-[44px]',
                isOpen || isMobile ? 'gap-3 px-3.5' : 'justify-center px-0',
                isActive
                  ? 'bg-slate-800 text-white font-semibold shadow-xs'
                  : 'hover:bg-slate-800/60 hover:text-white',
              )
            }
          >
            {({ isActive }) => (
              <>
                <item.icon
                  size={20}
                  className={cn(
                    'shrink-0',
                    isActive
                      ? 'text-yellow-400'
                      : 'text-slate-400 group-hover:text-slate-300',
                  )}
                />
                {(isOpen || isMobile) && (
                  <span className='font-medium text-sm tracking-wide'>
                    {item.name}
                  </span>
                )}
                {isActive && (isOpen || isMobile) && (
                  <div className='ml-auto w-1.5 h-1.5 rounded-full bg-yellow-400 shrink-0' />
                )}
              </>
            )}
          </NavLink>
        ))}

        {/* Attendance Dropdown */}
        <div className='space-y-1'>
          <button
            type='button'
            onClick={handleAttendanceClick}
            aria-label='Attendance'
            aria-expanded={isAttendanceOpen && (isOpen || isMobile)}
            className={cn(
              'w-full flex items-center py-3 rounded-xl transition-all group min-h-[44px]',
              isOpen || isMobile ? 'gap-3 px-3.5' : 'justify-center px-0',
              isAttendanceActive
                ? 'bg-slate-800 text-white font-semibold shadow-xs'
                : 'hover:bg-slate-800/60 text-slate-300 hover:text-white',
            )}
          >
            <CalendarCheck
              size={20}
              className={cn(
                'shrink-0',
                isAttendanceActive
                  ? 'text-yellow-400'
                  : 'text-slate-400 group-hover:text-slate-300',
              )}
            />
            {(isOpen || isMobile) && (
              <>
                <span className='font-medium text-sm tracking-wide flex-1 text-left'>
                  Attendance
                </span>
                <ChevronDown
                  size={16}
                  className={cn(
                    'transition-transform duration-200 text-slate-400',
                    isAttendanceOpen && 'rotate-180 text-white',
                  )}
                />
              </>
            )}
          </button>

          {/* Attendance Submenu */}
          {isAttendanceOpen && (isOpen || isMobile) && (
            <div className='pl-9 pr-1 space-y-1 animate-in fade-in duration-150'>
              <NavLink
                to='/dashboard/facilitator/attendance'
                onClick={handleDashboardSubClick}
                className={({ isActive }) =>
                  cn(
                    'flex items-center px-3 py-2 rounded-lg text-xs font-medium transition-colors',
                    isActive
                      ? 'bg-slate-800/90 text-yellow-400 font-semibold'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40',
                  )
                }
              >
                Dashboard
              </NavLink>
            </div>
          )}
        </div>

        {menuItems.slice(2).map((item) => (
          <NavLink
            key={item.name}
            to={item.path}
            end={item.path === '/dashboard/facilitator'}
            onClick={handleLinkClick}
            className={({ isActive }) =>
              cn(
                'flex items-center py-3 rounded-xl transition-all group min-h-[44px]',
                isOpen || isMobile ? 'gap-3 px-3.5' : 'justify-center px-0',
                isActive
                  ? 'bg-slate-800 text-white font-semibold shadow-xs'
                  : 'hover:bg-slate-800/60 hover:text-white',
              )
            }
          >
            {({ isActive }) => (
              <>
                <item.icon
                  size={20}
                  className={cn(
                    'shrink-0',
                    isActive
                      ? 'text-yellow-400'
                      : 'text-slate-400 group-hover:text-slate-300',
                  )}
                />
                {(isOpen || isMobile) && (
                  <span className='font-medium text-sm tracking-wide'>
                    {item.name}
                  </span>
                )}
                {isActive && (isOpen || isMobile) && (
                  <div className='ml-auto w-1.5 h-1.5 rounded-full bg-yellow-400 shrink-0' />
                )}
              </>
            )}
          </NavLink>
        ))}
      </nav>

      {/* User Profile Section - Bottom */}
      <div className='p-4 border-t border-slate-800/80 bg-slate-950/40'>
        <div
          className={cn('flex items-center gap-3', !isOpen && !isMobile && 'justify-center')}
        >
          <div className='w-10 h-10 rounded-full bg-emerald-500 flex items-center justify-center text-white font-bold shrink-0 shadow-xs'>
            {user?.full_name?.charAt(0) || 'F'}
          </div>
          {(isOpen || isMobile) && (
            <div className='min-w-0 flex-1'>
              <p className='text-sm font-bold text-white truncate'>
                {user?.full_name || 'Facilitator'}
              </p>
              <p className='text-[11px] text-yellow-400 font-medium truncate leading-tight'>
                Facilitator
              </p>
            </div>
          )}
        </div>
      </div>
    </aside>
  );
}
