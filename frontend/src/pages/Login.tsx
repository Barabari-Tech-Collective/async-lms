import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Eye, EyeOff } from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useNavigate, useSearchParams } from 'react-router';
import toast from 'react-hot-toast';
import { useFormik } from 'formik';

import { useAppDispatch, useAppSelector } from '@/app/hooks';
import { loginUser, signupUser } from '@/features/auth/authThunks';
import { clearAuthError } from '@/features/auth/authSlice';
import { selectAuth } from '@/features/auth/authSelectors';
import Logo from '@/components/common/Logo';
import SEO from '@/components/common/SEO';
import { loginSchema, signupSchema } from '@/lib/validations';

const GOOGLE_AUTH_URL = `${import.meta.env.VITE_API_URL || ''}/api/v1/auth/google`;

export default function Login() {
  const [activeTab, setActiveTab] = useState<'login' | 'signup'>('login');
  const [showLoginPassword, setShowLoginPassword] = useState(false);
  const [showSignupPassword, setShowSignupPassword] = useState(false);
  const [showSignupConfirmPassword, setShowSignupConfirmPassword] = useState(false);
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const dispatch = useAppDispatch();
  const { status, isAuthenticated, user, token } = useAppSelector(selectAuth);
  const isLoading = status === 'loading';
  const isResolvingSession = !!token && status === 'loading' && !user;

  // Show error from Google redirect failure
  useEffect(() => {
    const error = searchParams.get('error');
    if (error) toast.error('Google sign-in failed. Please try again.');
  }, [searchParams]);

  // Redirect after auth
  useEffect(() => {
    if (isResolvingSession || !isAuthenticated || !user) return;
    if (user.role === 'admin') {
      navigate('/dashboard/admin');
      return;
    }
    if (user.role === 'curriculum_developer') {
      navigate('/dashboard/curriculum-developer');
      return;
    }
    if (user.role === 'facilitator') {
      if (user.onboarding_step !== 'done') navigate('/onboarding/facilitator');
      else if (!user.is_verified) navigate('/pending-verification');
      else navigate('/dashboard/facilitator');
      return;
    }
    if (user.role === 'student') {
      navigate(
        user.onboarding_step !== 'done'
          ? `/onboarding/${user.onboarding_step}`
          : '/dashboard/student',
      );
    }
  }, [isResolvingSession, isAuthenticated, user, navigate]);

  const loginForm = useFormik({
    initialValues: { email: '', password: '' },
    validationSchema: loginSchema,
    onSubmit: async (values) => {
      const toastId = toast.loading('Signing in...');
      const sanitizedValues = { ...values, email: values.email.trim().toLowerCase() };
      try {
        await dispatch(loginUser(sanitizedValues)).unwrap();
        toast.success('Login successful!', { id: toastId });
      } catch (err: any) {
        if (err && err.needsVerification) {
          toast.dismiss(toastId);
          sessionStorage.setItem('verify_email', sanitizedValues.email);
          navigate('/verify-email');
          return;
        }
        const errMsg = typeof err === 'string' ? err : (err?.message || 'Login failed');
        toast.error(errMsg, { id: toastId });
      }
    },
  });

  const signupForm = useFormik({
    initialValues: {
      full_name: '',
      email: '',
      password: '',
      confirmPassword: '',
      role: '',
    },
    validationSchema: signupSchema,
    onSubmit: async (values) => {
      const toastId = toast.loading('Creating account...');
      const sanitizedValues = { ...values, email: values.email.trim().toLowerCase() };
      try {
        const res = await dispatch(signupUser(sanitizedValues)).unwrap();
        toast.success(res?.message || 'Account created successfully!', { id: toastId });
        sessionStorage.setItem('verify_email', sanitizedValues.email);
        navigate('/verify-email');
      } catch (err: any) {
        const errMsg = typeof err === 'string' ? err : (err?.message || 'Signup failed');
        toast.error(errMsg, { id: toastId });
      }
    },
  });

  const handleTabChange = (v: string) => {
    setActiveTab(v as 'login' | 'signup');
    dispatch(clearAuthError());
    loginForm.resetForm();
    signupForm.resetForm();
  };

  return (
    <>
      <SEO title='Sign In' noIndex={true} />
      <div
        className='min-h-screen w-full relative bg-cover bg-center overflow-hidden flex items-center justify-center p-4'
        style={{
          backgroundImage: 'url("/bg-students.jpg")',
          fontFamily: "'Inter', sans-serif",
        }}
      >
        {/* Blue tinted overlay */}
        <div className='absolute inset-0 bg-[#344499]/70 backdrop-blur-[2px]' />

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: 'easeOut' }}
          className='relative z-10 w-full max-w-md text-slate-800'
        >
          <div className='flex flex-col items-center mb-6'>
            <Logo className='h-14 w-14 mb-2' />
            <span className='text-white font-bold text-lg tracking-wider'>
              CodeGuru
            </span>
          </div>

          <div className='w-full bg-white px-8 py-7 rounded-3xl shadow-[0_8px_50px_rgba(0,0,0,0.25)]'>
            <div className='text-center mb-5'>
              <h1 className='text-xl font-bold text-slate-900'>
                {activeTab === 'login' ? 'Welcome back' : 'Create your account'}
              </h1>
              <p className='text-sm text-slate-500 mt-1'>
                {activeTab === 'login'
                  ? 'Sign in to continue to CodeGuru LMS'
                  : 'Join CodeGuru as a student or facilitator'}
              </p>
            </div>

            <Tabs
              value={activeTab}
              onValueChange={handleTabChange}
              className='mb-5 w-full'
            >
              <TabsList className='grid w-full grid-cols-2 bg-slate-100 p-1 rounded-xl h-auto'>
                <TabsTrigger
                  value='login'
                  className='data-[state=active]:bg-[#344499] data-[state=active]:text-white data-[state=active]:shadow-md rounded-lg py-2.5 text-[15px] font-medium transition-all text-slate-500'
                >
                  Sign In
                </TabsTrigger>
                <TabsTrigger
                  value='signup'
                  className='data-[state=active]:bg-[#344499] data-[state=active]:text-white data-[state=active]:shadow-md rounded-lg py-2.5 text-[15px] font-medium transition-all text-slate-500'
                >
                  Sign Up
                </TabsTrigger>
              </TabsList>
            </Tabs>

            {/* LOGIN FORM */}
            <form
              onSubmit={loginForm.handleSubmit}
              className={`space-y-3.5 ${activeTab !== 'login' ? 'hidden' : ''}`}
            >
              <div className='space-y-1'>
                <label className='text-[13px] font-semibold text-slate-800 tracking-wide'>
                  Email
                </label>
                <Input
                  name='email'
                  type='email'
                  className='h-10 text-sm'
                  placeholder='Enter your email'
                  value={loginForm.values.email}
                  onChange={loginForm.handleChange}
                  onBlur={loginForm.handleBlur}
                />
                {loginForm.touched.email && loginForm.errors.email && (
                  <p className='text-xs text-destructive mt-1'>
                    {loginForm.errors.email}
                  </p>
                )}
              </div>

              <div className='space-y-1'>
                <div className='flex justify-between items-center'>
                  <label className='text-[13px] font-semibold text-slate-800 tracking-wide'>
                    Password
                  </label>
                  <button
                    type='button'
                    onClick={() => navigate('/forgot-password')}
                    className='text-[12px] font-semibold text-indigo-600 hover:text-indigo-800'
                  >
                    Forgot Password?
                  </button>
                </div>
                <div className="relative">
                  <Input
                    name='password'
                    type={showLoginPassword ? 'text' : 'password'}
                    className='h-10 text-sm pr-10'
                    placeholder='Enter Password'
                    value={loginForm.values.password}
                    onChange={loginForm.handleChange}
                    onBlur={loginForm.handleBlur}
                  />
                  <button
                    type="button"
                    onClick={() => setShowLoginPassword(!showLoginPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 focus:outline-none"
                  >
                    {showLoginPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                {loginForm.touched.password && loginForm.errors.password && (
                  <p className='text-xs text-destructive mt-1'>
                    {loginForm.errors.password}
                  </p>
                )}
              </div>

              <Button
                type='submit'
                className='w-full bg-[#344499] hover:bg-[#2c3983] text-white h-11 text-[15px] font-semibold tracking-wide shadow-md rounded-lg mt-1'
                loading={isLoading}
              >
                Sign In
              </Button>
            </form>

            {/* SIGNUP FORM */}
            <form
              onSubmit={signupForm.handleSubmit}
              className={`space-y-3.5 ${activeTab === 'login' ? 'hidden' : ''}`}
            >
              <div className='space-y-1'>
                <label className='text-[13px] font-semibold text-slate-800 tracking-wide'>
                  Full Name
                </label>
                <Input
                  name='full_name'
                  className='h-10 text-sm'
                  placeholder='Enter your full name'
                  value={signupForm.values.full_name}
                  onChange={signupForm.handleChange}
                  onBlur={signupForm.handleBlur}
                />
                {signupForm.touched.full_name &&
                  signupForm.errors.full_name && (
                    <p className='text-xs text-destructive mt-1'>
                      {signupForm.errors.full_name}
                    </p>
                  )}
              </div>

              <div className='space-y-1'>
                <label className='text-[13px] font-semibold text-slate-800 tracking-wide'>
                  Email Id
                </label>
                <Input
                  name='email'
                  type='email'
                  className='h-10 text-sm'
                  placeholder='Enter your email'
                  value={signupForm.values.email}
                  onChange={signupForm.handleChange}
                  onBlur={signupForm.handleBlur}
                />
                {signupForm.touched.email && signupForm.errors.email && (
                  <p className='text-xs text-destructive mt-1'>
                    {signupForm.errors.email}
                  </p>
                )}
              </div>

              <div className='space-y-1'>
                <label className='text-[13px] font-semibold text-slate-800 tracking-wide'>
                  Password
                </label>
                <div className="relative">
                  <Input
                    name='password'
                    type={showSignupPassword ? 'text' : 'password'}
                    className='h-10 text-sm pr-10'
                    placeholder='Create a Password'
                    value={signupForm.values.password}
                    onChange={signupForm.handleChange}
                    onBlur={signupForm.handleBlur}
                  />
                  <button
                    type="button"
                    onClick={() => setShowSignupPassword(!showSignupPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 focus:outline-none"
                  >
                    {showSignupPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                {signupForm.touched.password && signupForm.errors.password && (
                  <p className='text-xs text-destructive mt-1'>
                    {signupForm.errors.password}
                  </p>
                )}
              </div>

              <div className='space-y-1'>
                <label className='text-[13px] font-semibold text-slate-800 tracking-wide'>
                  Confirm Password
                </label>
                <div className="relative">
                  <Input
                    name='confirmPassword'
                    type={showSignupConfirmPassword ? 'text' : 'password'}
                    className='h-10 text-sm pr-10'
                    placeholder='Confirm your Password'
                    value={signupForm.values.confirmPassword}
                    onChange={signupForm.handleChange}
                    onBlur={signupForm.handleBlur}
                  />
                  <button
                    type="button"
                    onClick={() => setShowSignupConfirmPassword(!showSignupConfirmPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 focus:outline-none"
                  >
                    {showSignupConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                {signupForm.touched.confirmPassword &&
                  signupForm.errors.confirmPassword && (
                    <p className='text-xs text-destructive mt-1'>
                      {signupForm.errors.confirmPassword}
                    </p>
                  )}
              </div>

              <div className='space-y-1'>
                <label className='text-[13px] font-semibold text-slate-800 tracking-wide'>
                  Role
                </label>
                <Select
                  value={signupForm.values.role}
                  onValueChange={(v) => signupForm.setFieldValue('role', v)}
                >
                  <SelectTrigger className='h-10 w-full text-sm'>
                    <SelectValue placeholder='Select your role' />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value='student'>Student</SelectItem>
                    <SelectItem value='facilitator'>Facilitator</SelectItem>
                  </SelectContent>
                </Select>
                {signupForm.touched.role && signupForm.errors.role && (
                  <p className='text-xs text-destructive mt-1'>
                    {signupForm.errors.role}
                  </p>
                )}
              </div>

              <Button
                type='submit'
                className='w-full bg-[#344499] hover:bg-[#2c3983] text-white h-11 text-[15px] font-semibold tracking-wide shadow-md rounded-lg mt-1'
                loading={isLoading}
              >
                Create your account
              </Button>
            </form>

            <div className='relative my-5'>
              <div className='absolute inset-0 flex items-center'>
                <div className='w-full border-t border-slate-200' />
              </div>
              <div className='relative flex justify-center'>
                <span className='bg-white px-4 text-xs tracking-wider font-medium text-slate-400 uppercase'>
                  OR
                </span>
              </div>
            </div>

            <a
              href={GOOGLE_AUTH_URL}
              className='flex w-full items-center justify-center gap-3 rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50 transition-colors'
            >
              <svg className='h-5 w-5' viewBox='0 0 24 24'>
                <path
                  d='M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z'
                  fill='#4285F4'
                />
                <path
                  d='M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z'
                  fill='#34A853'
                />
                <path
                  d='M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z'
                  fill='#FBBC05'
                />
                <path
                  d='M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z'
                  fill='#EA4335'
                />
              </svg>
              Continue with Google
            </a>
          </div>
        </motion.div>
      </div>
    </>
  );
}
