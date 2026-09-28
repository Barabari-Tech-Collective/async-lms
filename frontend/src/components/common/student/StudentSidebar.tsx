import {
  LayoutDashboard,
  BookOpen,
  ClipboardList,
  Trophy,
  User,
  Settings,
  MessageSquare,
  Code,
  FileText,
  BarChart2,
  X,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useLocation, Link } from 'react-router';
import { useAppSelector } from '@/app/hooks';
import { selectUser } from '@/features/auth/authSelectors';
import Logo from '../Logo';

interface StudentSidebarProps {
  isOpen: boolean;
  isMobile?: boolean;
  onToggle: () => void;
  onCloseMobile?: () => void;
}

type MenuItem = {
  name: string;
  icon: LucideIcon;
  path: string;
  badge?: number;
};

const menuItems: MenuItem[] = [
  { name: 'Dashboard', icon: LayoutDashboard, path: '/dashboard/student' },
  { name: 'My Courses', icon: BookOpen, path: '/dashboard/student/courses' },
  {
    name: 'Assignments',
    icon: ClipboardList,
    path: '/dashboard/student/assignments',
  },
  {
    name: 'Code Playground',
    icon: Code,
    path: '/dashboard/student/editor-profile',
  },
  { name: 'Leaderboard', icon: Trophy, path: '/dashboard/student/leaderboard' },
  {
    name: 'AI Assistant',
    icon: MessageSquare,
    path: '/dashboard/student/ai-assistant',
  },
  {
    name: 'Resume Builder',
    icon: FileText,
    path: '/dashboard/student/resume-builder',
  },
  { name: 'Analytics', icon: BarChart2, path: '/dashboard/student/analytics' },
  { name: 'Profile', icon: User, path: '/dashboard/student/profile' },
  { name: 'Settings', icon: Settings, path: '/dashboard/student/settings' },
];

export default function StudentSidebar({
  isOpen,
  isMobile,
  onCloseMobile,
}: StudentSidebarProps) {
  const { pathname } = useLocation();
  const user = useAppSelector(selectUser);

  const handleLinkClick = () => {
    if (isMobile && onCloseMobile) {
      onCloseMobile();
    }
  };

  return (
    <aside
      className={cn(
        'h-full flex flex-col transition-all duration-300 bg-white text-[#1e2653] border-r border-[#ebe5e5] shrink-0 overflow-hidden w-full',
        isMobile ? 'w-full' : isOpen ? 'w-64' : 'w-20',
      )}
    >
      {/* Brand Header */}
      <div className='h-16 flex items-center justify-between px-4 sm:px-6 shrink-0 mt-2 border-b border-slate-100/80'>
        <div className='flex items-center gap-3'>
          <Logo className='h-10 w-10 sm:h-12 sm:w-12' iconOnly={!isOpen && !isMobile} />
          {(isOpen || isMobile) && (
            <span className='font-bold text-xl text-blue-800 tracking-tight'>
              CodeGuru
            </span>
          )}
        </div>

        {/* Mobile Close Button */}
        {isMobile && onCloseMobile && (
          <button
            onClick={onCloseMobile}
            className='p-2 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition-colors'
            aria-label='Close Sidebar'
          >
            <X className='w-5 h-5' />
          </button>
        )}
      </div>

      {/* Navigation Links */}
      <nav className='flex-1 py-4 px-3 space-y-1.5 overflow-y-auto custom-scrollbar'>
        {menuItems.map((item) => {
          const isActive = pathname === item.path;
          return (
            <Link
              key={item.name}
              to={item.path}
              onClick={handleLinkClick}
              className={cn(
                'flex items-center gap-3 px-3 py-3 rounded-lg transition-all group relative min-h-[44px]',
                !isOpen && !isMobile ? 'justify-center' : 'justify-start',
                isActive
                  ? 'bg-[#333d7c] text-white shadow-sm font-semibold'
                  : 'hover:bg-[#f4f5f8] hover:text-[#1e2653] text-slate-600',
              )}
            >
              <item.icon
                size={20}
                className={cn(
                  'shrink-0',
                  isActive
                    ? 'text-white'
                    : 'text-slate-400 group-hover:text-[#1e2653]',
                )}
              />

              {(isOpen || isMobile) && (
                <>
                  <span className='font-medium text-[14px] flex-1 truncate'>
                    {item.name}
                  </span>
                  {item?.badge && !isActive && (
                    <span className='bg-red-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full'>
                      {item?.badge}
                    </span>
                  )}
                  {isActive && (
                    <div className='w-1.5 h-1.5 rounded-full bg-yellow-400 shrink-0' />
                  )}
                </>
              )}
            </Link>
          );
        })}
      </nav>

      {/* User Profile Section - Bottom */}
      <div className='p-4 border-t border-[#ebe5e5] bg-slate-50/50'>
        <div
          className={cn(
            'flex items-center gap-3',
            !isOpen && !isMobile && 'justify-center',
          )}
        >
          <div className='w-10 h-10 rounded-full bg-emerald-500 flex items-center justify-center text-white font-bold shrink-0 shadow-inner'>
            {user?.full_name?.charAt(0)?.toUpperCase() || 'S'}
          </div>
          {(isOpen || isMobile) && (
            <div className='min-w-0 flex-1'>
              <p className='text-sm font-bold text-[#1e2653] truncate leading-tight'>
                {user?.full_name || 'Student User'}
              </p>
              <p className='text-[11px] text-slate-400 font-medium truncate capitalize'>
                {user?.role || 'student'}
              </p>
            </div>
          )}
        </div>
      </div>
    </aside>
  );
}

