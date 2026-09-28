import { Menu, LogOut, User, Settings, ChevronDown } from 'lucide-react';
import NotificationBell from '@/components/common/NotificationBell';
import { useAppSelector, useAppDispatch } from '@/app/hooks';
import { selectUser } from '@/features/auth/authSelectors';
import { logout } from '@/features/auth/authSlice';
import { useNavigate, useLocation } from 'react-router';
import toast from 'react-hot-toast';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

const TITLES: Record<string, string> = {
  '/dashboard/facilitator': 'Dashboard',
  '/dashboard/facilitator/students': 'Students',
  '/dashboard/facilitator/assignments': 'Assignments',
  '/dashboard/facilitator/create-assignment': 'Create Assignment',
  '/dashboard/facilitator/assignment-success': 'Assignment Success',
  '/dashboard/facilitator/evaluations': 'Evaluations',
  '/dashboard/facilitator/analytics': 'Analytics',
  '/dashboard/facilitator/student-growth': 'Student Growth',
  '/dashboard/facilitator/reports': 'Reports',
  '/dashboard/facilitator/settings': 'Settings',
  '/dashboard/facilitator/ai-curriculum': 'AI Curriculum Builder',
};

export default function FacilitatorHeader({
  toggleSidebar,
  toggleMobileSidebar,
}: {
  toggleSidebar: () => void;
  toggleMobileSidebar?: () => void;
}) {
  const user = useAppSelector(selectUser);
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const { pathname } = useLocation();

  let title = TITLES[pathname] ?? pathname.split('/').at(-1)?.replace(/-/g, ' ') ?? 'Facilitator';
  if (pathname.includes('/results/')) {
    title = 'Evaluation Results';
  }

  const handleLogout = () => {
    dispatch(logout());
    toast.success('Signed out successfully');
    navigate('/login');
  };

  const handleMenuClick = () => {
    if (window.innerWidth < 1024 && toggleMobileSidebar) {
      toggleMobileSidebar();
    } else {
      toggleSidebar();
    }
  };

  return (
    <header className='h-16 bg-white border-b flex items-center justify-between px-3 sm:px-6 shrink-0 select-none'>
      <div className='flex items-center gap-2 sm:gap-4 min-w-0 flex-1 mr-2'>
        <button
          onClick={handleMenuClick}
          className='p-2 hover:bg-slate-100 rounded-lg text-slate-600 transition-all focus:outline-none focus:ring-2 focus:ring-blue-100 min-h-[44px] min-w-[44px] flex items-center justify-center shrink-0'
          aria-label='Toggle Sidebar'
        >
          <Menu className='w-5 h-5' />
        </button>
        <h2 className='text-base sm:text-xl font-bold text-[#1e2653] capitalize truncate min-w-0'>
          {title}
        </h2>
      </div>

      <div className='flex items-center gap-2 sm:gap-3 shrink-0'>
        <NotificationBell />

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className='flex items-center gap-1.5 sm:gap-2 cursor-pointer group p-1 rounded-lg hover:bg-slate-50 transition-all focus:outline-none min-h-[44px] min-w-[44px]'>
              <div className='w-8 h-8 rounded-full bg-slate-100 border border-slate-200 overflow-hidden shrink-0 shadow-xs'>
                <img
                  src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${user?.full_name || 'Facilitator'}`}
                  alt='avatar'
                  className='w-full h-full object-cover'
                />
              </div>
              <ChevronDown className='w-3.5 h-3.5 text-slate-400 group-hover:text-slate-600 transition-transform group-data-[state=open]:rotate-180 hidden sm:block' />
            </button>
          </DropdownMenuTrigger>

          <DropdownMenuContent align='end' className='w-60 p-2 mt-2 shadow-xl border-slate-200'>
            <DropdownMenuLabel className='font-normal p-2'>
              <p className='text-sm font-bold text-[#1e2653]'>{user?.full_name || 'Facilitator'}</p>
              <p className='text-[11px] text-slate-500 truncate'>{user?.email}</p>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />

            <DropdownMenuItem
              className='cursor-pointer py-2.5 rounded-md gap-2 text-red-600 focus:text-red-700 focus:bg-red-50'
              onClick={() => navigate('/dashboard/facilitator/settings')}
            >
              <User className='h-4 w-4' />
              <span className='text-sm font-medium'>My Profile</span>
            </DropdownMenuItem>

            <DropdownMenuItem
              className='cursor-pointer py-2.5 rounded-md gap-2 text-red-600 focus:text-red-700 focus:bg-red-50'
              onClick={() => navigate('/dashboard/facilitator/settings')}
            >
              <Settings className='h-4 w-4' />
              <span className='text-sm font-medium'>Account Settings</span>
            </DropdownMenuItem>

            <DropdownMenuSeparator />

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
    </header>
  );
}
