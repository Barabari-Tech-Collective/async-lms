import { useEffect } from 'react';
import { useNavigate } from 'react-router';
import { motion } from 'framer-motion';
import { useAppSelector } from '@/app/hooks';
import { selectAuth } from '@/features/auth/authSelectors';
import Logo from '@/components/common/Logo';
import SEO from '@/components/common/SEO';
import { Button } from '@/components/ui/button';

export default function Home() {
  const { isAuthenticated, user, status, token } = useAppSelector(selectAuth);
  const navigate = useNavigate();
  const isResolvingSession = !!token && status === 'loading' && !user;

  useEffect(() => {
    if (isResolvingSession || !isAuthenticated || !user) return;

    if (user.role === 'admin') {
      navigate('/dashboard/admin');
    } else if (user.role === 'facilitator') {
      navigate('/dashboard/facilitator');
    } else if (user.role === 'curriculum_developer') {
      navigate('/dashboard/curriculum-developer');
    } else if (user.role === 'student') {
      navigate(
        user.onboarding_step !== 'done'
          ? `/onboarding/${user.onboarding_step}`
          : '/dashboard/student',
      );
    }
  }, [isResolvingSession, isAuthenticated, user, navigate]);

  if (isResolvingSession) {
    return (
      <div className='min-h-screen w-full flex items-center justify-center bg-[#344499]'>
        <Logo className='h-16 w-16 animate-pulse' />
      </div>
    );
  }

  return (
    <>
      <SEO title='Welcome' description='Welcome to CodeGuru LMS' />
      <div
        className='min-h-screen w-full relative bg-cover bg-center overflow-hidden'
        style={{ backgroundImage: 'url("/bg-students.jpg")' }}
      >
        {/* Blue tinted overlay */}
        <div className='absolute inset-0 bg-[#344499]/70 backdrop-blur-[2px]' />

        <div className='relative z-10 w-full h-screen flex items-center justify-center px-4'>
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: 'easeOut' }}
            className='flex flex-col items-center text-center'
          >
            <Logo className='h-24 w-24 sm:h-32 sm:w-32 mb-10' />
            <h1 className='text-white text-3xl sm:text-4xl font-bold mb-10 tracking-tight'>
              Welcome to CodeGuru!
            </h1>
            <Button
              onClick={() => navigate('/login')}
              className='bg-white cursor-pointer text-[#344499] hover:bg-slate-100 px-12 h-12 text-lg font-bold rounded-xl transition-all shadow-xl hover:shadow-white/20 active:scale-95'
            >
              Continue
            </Button>
          </motion.div>
        </div>
      </div>
    </>
  );
}
