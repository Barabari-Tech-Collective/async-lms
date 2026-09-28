import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router';
import { motion } from 'framer-motion';
import toast from 'react-hot-toast';
import { MailOpen, ArrowRight, RotateCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAppDispatch } from '@/app/hooks';
import { setCredentials } from '@/features/auth/authSlice';
import api from '@/services/api';
import Logo from '@/components/common/Logo';
import SEO from '@/components/common/SEO';

export default function VerifyEmail() {
  const [otpCode, setOtpCode] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const [isResending, setIsResending] = useState(false);

  const navigate = useNavigate();
  const dispatch = useAppDispatch();
  const email = (sessionStorage.getItem('verify_email') || '')
    .trim()
    .toLowerCase();

  useEffect(() => {
    const sessionEmail = sessionStorage.getItem('verify_email');
    if (!sessionEmail) {
      toast.error('Session expired. Please sign up or login again.');
      navigate('/login');
    }
  }, [navigate]);

  // Handle client-side resend cooldown timer
  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = setInterval(() => {
      setResendCooldown((prev) => prev - 1);
    }, 1000);
    return () => clearInterval(timer);
  }, [resendCooldown]);

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!otpCode || otpCode.length !== 6) {
      toast.error('Please enter a valid 6-digit verification code.');
      return;
    }

    setIsLoading(true);
    const toastId = toast.loading('Verifying code...');
    try {
      const { data } = await api.post('/auth/verify-email', {
        email,
        otp_code: otpCode,
      });

      toast.success('Email verified successfully!', { id: toastId });
      dispatch(setCredentials({ token: data.token, user: data.user }));
      sessionStorage.removeItem('verify_email');

      // Redirect dynamically based on role and onboarding step
      const verifiedUser = data.user;
      if (verifiedUser.role === 'admin') {
        navigate('/dashboard/admin');
      } else if (verifiedUser.role === 'curriculum_developer') {
        navigate('/dashboard/curriculum-developer');
      } else if (verifiedUser.role === 'facilitator') {
        if (verifiedUser.onboarding_step !== 'done')
          navigate('/onboarding/facilitator');
        else if (!verifiedUser.is_verified) navigate('/pending-verification');
        else navigate('/dashboard/facilitator');
      } else if (verifiedUser.role === 'student') {
        navigate(
          verifiedUser.onboarding_step !== 'done'
            ? `/onboarding/${verifiedUser.onboarding_step}`
            : '/dashboard/student',
        );
      } else {
        navigate('/');
      }
    } catch (err: any) {
      toast.error(
        err.response?.data?.message || 'Verification failed. Please try again.',
        {
          id: toastId,
        },
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleResend = async () => {
    if (resendCooldown > 0) return;
    setIsResending(true);
    const toastId = toast.loading('Resending verification code...');
    try {
      // Re-trigger signup call with user details or simple trigger
      // Since signup endpoint allows resending for unverified users, we hit signup with basic fields
      await api.post('/auth/signup', {
        email,
        full_name: 'User', // Placeholder; DB checks existing unverified email and triggers OTP resend
        password: 'dummyPasswordTemp123',
      });

      toast.success('A new verification code has been sent!', { id: toastId });
      setResendCooldown(60); // 60 seconds cooldown
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to resend code.', {
        id: toastId,
      });
    } finally {
      setIsResending(false);
    }
  };

  return (
    <div className='min-h-screen flex flex-col justify-center py-12 sm:px-6 lg:px-8 bg-slate-50'>
      <SEO
        title='Verify Email'
        description='Verify your CodeGuru account email address.'
      />

      <div className='sm:mx-auto sm:w-full sm:max-w-md flex flex-col items-center gap-2.5'>
        <Logo className='h-16 w-16' />
        <span className='text-2xl font-bold tracking-tight text-slate-900'>
          CodeGuru
        </span>
      </div>

      <div className='mt-8 sm:mx-auto sm:w-full sm:max-w-md'>
        <motion.div
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className='bg-white py-8 px-4 shadow-xl border border-slate-100 sm:rounded-2xl sm:px-10'
        >
          <div className='flex flex-col items-center text-center space-y-4 mb-6'>
            <div className='h-16 w-16 rounded-full bg-indigo-50 flex items-center justify-center text-indigo-600 animate-bounce'>
              <MailOpen className='h-8 w-8' />
            </div>
            <div className='space-y-1.5'>
              <h2 className='text-2xl font-bold text-slate-900 tracking-tight'>
                Verify your email
              </h2>
              <p className='text-sm text-slate-500'>
                We've sent a 6-digit verification code to
              </p>
              <p className='text-sm font-semibold text-slate-700 break-all'>
                {email}
              </p>
            </div>
          </div>

          <form onSubmit={handleVerify} className='space-y-6'>
            <div className='space-y-1'>
              <label
                htmlFor='otp'
                className='text-[13px] font-semibold text-slate-800 tracking-wide'
              >
                Verification Code
              </label>
              <Input
                id='otp'
                type='text'
                required
                maxLength={6}
                value={otpCode}
                onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, ''))}
                inputMode='numeric'
                autoComplete='one-time-code'
                placeholder='Enter 6-digit code'
                // The wide tracking is for the digits; without the placeholder:
                // overrides it stretches the hint text into an unreadable smear.
                className='h-12 text-xl font-bold tracking-[8px] rounded-xl border-slate-200 focus:border-indigo-500 focus:ring-indigo-500 text-slate-800 placeholder:text-sm placeholder:font-medium placeholder:tracking-normal placeholder:text-slate-400'
              />
            </div>

            <Button
              type='submit'
              className='w-full bg-[#344499] hover:bg-[#2c3983] text-white h-12 text-[15px] font-semibold tracking-wide shadow-md rounded-xl flex items-center justify-center gap-2'
              loading={isLoading}
            >
              Verify Account <ArrowRight className='h-4 w-4' />
            </Button>
          </form>

          <div className='mt-6 flex flex-col items-center justify-center space-y-4'>
            <button
              onClick={handleResend}
              disabled={resendCooldown > 0 || isResending}
              className={`text-sm font-semibold flex items-center gap-1.5 transition-colors ${
                resendCooldown > 0 || isResending
                  ? 'text-slate-400 cursor-not-allowed'
                  : 'text-indigo-600 hover:text-indigo-800'
              }`}
            >
              <RotateCw
                className={`h-4 w-4 ${isResending ? 'animate-spin' : ''}`}
              />
              {resendCooldown > 0
                ? `Resend Code in ${resendCooldown}s`
                : 'Resend Code'}
            </button>

            <button
              onClick={() => {
                sessionStorage.removeItem('verify_email');
                navigate('/login');
              }}
              className='text-xs font-medium text-slate-500 hover:text-slate-800'
            >
              Back to Login
            </button>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
