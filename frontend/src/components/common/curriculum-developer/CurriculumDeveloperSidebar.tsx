import { Sparkles, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { NavLink } from 'react-router';
import Logo from '../Logo';
import { useAppSelector } from '@/app/hooks';
import { selectUser } from '@/features/auth/authSelectors';

const menuItems = [
  {
    name: 'AI Curriculum',
    icon: Sparkles,
    path: '/dashboard/curriculum-developer',
  },
];

export default function CurriculumDeveloperSidebar({
  isOpen,
  isMobile = false,
  onCloseMobile,
}: {
  isOpen: boolean;
  toggle?: () => void;
  isMobile?: boolean;
  onCloseMobile?: () => void;
}) {
  const currentUser = useAppSelector(selectUser);

  const initials = currentUser?.full_name
    ?.split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2) || 'CD';

  return (
    <aside
      className={cn(
        'h-full flex flex-col transition-all duration-300 bg-[#191C34] text-slate-300',
        isMobile ? 'w-full' : isOpen ? 'w-64' : 'w-20',
      )}
    >
      {/* Brand Header */}
      <div className='h-16 flex items-center justify-between px-5 sm:px-6 shrink-0 mt-2 sm:mt-4'>
        <div className='flex items-center gap-3 min-w-0'>
          <Logo className='h-10 w-10 sm:h-12 sm:w-12 shrink-0' iconOnly={!isOpen && !isMobile} />
          {(isOpen || isMobile) && (
            <span className='font-bold text-lg sm:text-xl text-white tracking-tight truncate'>
              CodeGuru
            </span>
          )}
        </div>
        {isMobile && onCloseMobile && (
          <button
            onClick={onCloseMobile}
            className='p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center'
            aria-label='Close sidebar'
          >
            <X size={20} />
          </button>
        )}
      </div>

      {/* Nav Items */}
      <nav className='flex-1 py-4 px-3 space-y-1 overflow-y-auto custom-scrollbar'>
        {menuItems.map((item) => (
          <NavLink
            key={item.name}
            to={item.path}
            end={item.path === '/dashboard/curriculum-developer'}
            onClick={() => {
              if (isMobile && onCloseMobile) {
                onCloseMobile();
              }
            }}
            className={({ isActive }) =>
              cn(
                'flex items-center gap-3 px-3 py-2.5 sm:py-3 rounded-xl transition-all group min-h-[44px]',
                !isOpen && !isMobile && 'justify-center px-0',
                isActive
                  ? 'bg-[#333d7c] text-white shadow-sm'
                  : 'hover:bg-[#2a3469] hover:text-white',
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
                      ? 'text-white'
                      : 'text-slate-400 group-hover:text-slate-300',
                  )}
                />
                {(isOpen || isMobile) && (
                  <span className='font-medium text-[13px] sm:text-[14px] truncate'>{item.name}</span>
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
      <div className='p-3.5 sm:p-4 border-t border-[#222644] bg-[#191C34] shrink-0'>
        <div
          className={cn('flex items-center gap-3', !isOpen && !isMobile && 'justify-center')}
        >
          <div className='w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-[#f59e0b] flex items-center justify-center text-white font-bold shrink-0 text-xs sm:text-sm'>
            {initials}
          </div>
          {(isOpen || isMobile) && (
            <div className='min-w-0 flex-1'>
              <p className='text-xs sm:text-sm font-bold text-white truncate'>
                {currentUser?.full_name || 'Developer'}
              </p>
              <p className='text-[11px] text-yellow-400 font-medium truncate leading-tight'>
                {currentUser?.email}
              </p>
              {(currentUser?.domain || currentUser?.role_focus) && (
                <div className='flex flex-wrap items-center gap-1 mt-1'>
                  {currentUser.domain && (
                    <span className='inline-block px-1.5 py-0.5 text-[9px] font-bold rounded bg-indigo-500/20 text-indigo-300 border border-indigo-500/30'>
                      {currentUser.domain}
                    </span>
                  )}
                  {currentUser.role_focus && (
                    <span className='inline-block px-1.5 py-0.5 text-[9px] font-medium rounded bg-slate-700/50 text-slate-300 border border-slate-600/40 truncate max-w-[120px]'>
                      {currentUser.role_focus}
                    </span>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </aside>
  );
}
