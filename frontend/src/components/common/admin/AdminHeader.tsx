import { Search, Menu, LogOut, UserCircle, User } from 'lucide-react';
import NotificationBell from '@/components/common/NotificationBell';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useAppDispatch, useAppSelector } from '@/app/hooks';
import { logout } from '@/features/auth/authSlice';
import { selectUser } from '@/features/auth/authSelectors';
import { useLocation, useNavigate } from 'react-router';
import toast from 'react-hot-toast';

export default function AdminHeader({
  toggleSidebar,
  toggleMobileSidebar,
}: {
  toggleSidebar: () => void;
  toggleMobileSidebar?: () => void;
}) {
  const dispatch = useAppDispatch();
  const currentUser = useAppSelector(selectUser);
  const navigate = useNavigate();
  const { pathname } = useLocation();
  let title = pathname === '/dashboard/admin' ? 'Home' : pathname.split('/').at(-1)?.replace(/-/g, ' ');
  if (pathname.includes('/results/')) {
    title = 'Evaluation Results';
  }

  const handleLogout = () => {
    dispatch(logout());
    toast.success('Signed out successfully');
    navigate('/login');
  };

  const handleHamburgerClick = () => {
    if (window.innerWidth < 1024 && toggleMobileSidebar) {
      toggleMobileSidebar();
    } else {
      toggleSidebar();
    }
  };

  return (
    <header className='h-16 bg-white border-b border-slate-200/80 flex items-center justify-between px-3.5 sm:px-6 shrink-0 z-10'>
      <div className='flex items-center gap-2.5 sm:gap-4 min-w-0 pr-2'>
        <button
          onClick={handleHamburgerClick}
          className='p-1.5 sm:p-2 rounded-xl text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition-colors min-h-[40px] min-w-[40px] flex items-center justify-center shrink-0'
          aria-label='Toggle navigation menu'
        >
          <Menu size={20} />
        </button>
        <h2 className='text-base sm:text-xl font-bold text-[#1e2653] capitalize truncate tracking-tight'>{title}</h2>
      </div>

      <div className='flex items-center gap-2 sm:gap-4 shrink-0'>
        {/* Search Bar - Desktop */}
        <div className='relative hidden xl:block w-64 lg:w-72'>
          <Search className='absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4' />
          <input
            type='text'
            placeholder='Search...'
            className='w-full pl-9 pr-4 py-2 bg-[#f8fafc] border border-slate-200 rounded-xl text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400 transition-all'
          />
        </div>

        {/* Notifications and Profile Dropdown */}
        <div className='flex items-center gap-1.5 sm:gap-2'>
          <NotificationBell />

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className='p-1.5 sm:p-2 text-slate-500 hover:text-indigo-600 hover:bg-slate-100 rounded-xl outline-none transition-colors min-h-[40px] min-w-[40px] flex items-center justify-center'>
                <UserCircle size={24} />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align='end' className='w-56 mt-2 rounded-2xl shadow-xl border border-slate-200'>
              <DropdownMenuLabel className='font-normal'>
                <div className='flex flex-col space-y-1'>
                  <p className='text-sm font-bold leading-none text-[#1e2653] truncate'>
                    {currentUser?.full_name || 'Admin'}
                  </p>
                  <p className='text-xs leading-none text-slate-400 truncate'>
                    {currentUser?.email}
                  </p>
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className='cursor-pointer gap-2 text-slate-700 focus:text-indigo-600 focus:bg-indigo-50 font-medium'
                onClick={() => navigate(
                  currentUser?.role === 'curriculum_developer' 
                    ? '/dashboard/curriculum-developer/profile' 
                    : '/dashboard/admin/profile'
                )}
              >
                <User size={16} /> Profile
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={handleLogout}
                className='cursor-pointer gap-2 text-red-600 focus:text-red-700 focus:bg-red-50 font-medium'
              >
                <LogOut size={16} /> Sign Out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  );
}
