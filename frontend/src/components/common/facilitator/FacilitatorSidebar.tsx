import {
  LayoutDashboard,
  Users,
  Settings,
  ClipboardList,
  CheckSquare,
  BarChart2,
  Sparkles,
  X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { NavLink } from 'react-router';
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
  isMobile = false,
  onCloseMobile,
}: {
  isOpen: boolean;
  toggle: () => void;
  isMobile?: boolean;
  onCloseMobile?: () => void;
}) {
  const user = useAppSelector(selectUser);

  const handleLinkClick = () => {
    if (isMobile && onCloseMobile) {
      onCloseMobile();
    }
  };

  return (
    <aside
      className={cn(
        'h-full flex flex-col transition-all duration-300 bg-slate-900 text-slate-300',
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
      <nav className='flex-1 py-4 px-3 space-y-1.5 overflow-y-auto custom-scrollbar'>
        {menuItems.map((item) => (
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
