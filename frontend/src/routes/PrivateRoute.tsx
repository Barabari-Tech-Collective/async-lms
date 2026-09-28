import { useAppSelector } from '@/app/hooks';
import { selectAuth } from '@/features/auth/authSelectors';
import { Navigate, Outlet, useLocation } from 'react-router';
import { Loader2 } from 'lucide-react';

interface PrivateRouteProps {
  allowedRoles?: string[];
}

const PrivateRoute = ({ allowedRoles }: PrivateRouteProps) => {
  const { token, user, status } = useAppSelector(selectAuth);
  const location = useLocation();

  if (!token) {
    return <Navigate to='/' state={{ from: location }} replace />;
  }

  if (!user && (status === 'idle' || status === 'loading')) {
    return (
      <div className='flex h-screen items-center justify-center'>
        <Loader2 className='h-8 w-8 animate-spin text-indigo-600' />
      </div>
    );
  }

  const isOnOnboarding = location.pathname.startsWith('/onboarding');
  const isForceChangePassword = location.pathname === '/force-change-password';

  if (user && user.must_change_password && !isForceChangePassword) {
    return <Navigate to='/force-change-password' replace />;
  }

  if (user && !user.must_change_password && isForceChangePassword) {
    return <Navigate to='/' replace />;
  }

  if (user && !isOnOnboarding && !isForceChangePassword) {
    if (user.role === 'student' && user.onboarding_step !== 'done') {
      return <Navigate to={`/onboarding/${user.onboarding_step}`} replace />;
    }
    if (user.role === 'facilitator' && user.onboarding_step !== 'done') {
      return <Navigate to='/onboarding/facilitator' replace />;
    }
    if (user.role === 'student' && user.onboarding_step === 'done') {
      if (!user.is_verified) {
        return <Navigate to='/pending-verification' replace />;
      }
      if (user.college_is_verified === false) {
        return <Navigate to='/college-under-verification' replace />;
      }
    }
    if (user.role === 'facilitator' && user.onboarding_step === 'done' && !user.is_verified) {
      return <Navigate to='/pending-verification' replace />;
    }
  }

  if (
    user &&
    !isOnOnboarding &&
    allowedRoles &&
    !allowedRoles.includes(user.role)
  ) {
    return <Navigate to='/' replace />;
  }

  return <Outlet />;
};

export default PrivateRoute;
