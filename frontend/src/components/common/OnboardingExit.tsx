import { useNavigate } from 'react-router';
import { LogOut } from 'lucide-react';
import { useAppDispatch } from '@/app/hooks';
import { logout } from '@/features/auth/authSlice';

// Exit onboarding
export default function OnboardingExit() {
  const navigate = useNavigate();
  const dispatch = useAppDispatch();

  const handleSignOut = () => {
    dispatch(logout());
    navigate('/login');
  };

  return (
    <button
      type='button'
      onClick={handleSignOut}
      className='absolute top-3 sm:top-5 right-3 sm:right-5 z-20 flex items-center gap-1.5 rounded-xl px-2.5 sm:px-3 py-1.5 sm:py-2 text-xs sm:text-[13px] font-semibold text-white/80 transition-colors hover:bg-white/10 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white min-h-[36px]'
    >
      <LogOut className='h-4 w-4' />
      <span>Sign out</span>
    </button>
  );
}
