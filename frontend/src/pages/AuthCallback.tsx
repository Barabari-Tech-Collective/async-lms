import { useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { Loader2 } from 'lucide-react';
import { useAppDispatch, useAppSelector } from '@/app/hooks';
import { setCredentials } from '@/features/auth/authSlice';
import { exchangeGoogleAuthCode } from '@/features/auth/authThunks';
import { selectAuth } from '@/features/auth/authSelectors';
import toast from 'react-hot-toast';

export default function AuthCallback() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const dispatch = useAppDispatch();
  const { user, isAuthenticated, status } = useAppSelector(selectAuth);

  const exchangeStarted = useRef(false);

  useEffect(() => {
    const code = searchParams.get('code');
    const error = searchParams.get('error');

    if (error || !code) {
      toast.error('Google sign-in failed. Please try again.');
      navigate('/login');
      return;
    }

    if (exchangeStarted.current) return;
    exchangeStarted.current = true;

    dispatch(exchangeGoogleAuthCode(code))
      .unwrap()
      .then((result) => {
        dispatch(setCredentials({ token: result.token, user: result.user }));
      })
      .catch((message) => {
        toast.error(
          typeof message === 'string' ? message : 'Google sign-in failed.',
        );
        navigate('/login');
      });
  }, []);

  useEffect(() => {
    if (status !== 'succeeded' || !isAuthenticated || !user) return;

    if (user.role === 'admin') {
      navigate('/dashboard/admin');
      return;
    }

    if (user.role === 'curriculum_developer') {
      navigate('/dashboard/curriculum-developer');
      return;
    }

    if (user.role === 'facilitator') {
      if (user.onboarding_step !== 'done') {
        navigate('/onboarding/facilitator');
      } else if (!user.is_verified) {
        navigate('/pending-verification');
      } else {
        navigate('/dashboard/facilitator');
      }
      return;
    }

    if (user.role === 'student') {
      if (user.onboarding_step !== 'done') {
        navigate(`/onboarding/${user.onboarding_step}`);
      } else {
        navigate('/dashboard/student');
      }
      return;
    }
  }, [isAuthenticated, user, status, navigate]);

  return (
    <div className='flex min-h-screen items-center justify-center gap-3 text-slate-600'>
      <Loader2 className='h-6 w-6 animate-spin' />
      <span className='text-sm font-medium'>Signing you in…</span>
    </div>
  );
}
