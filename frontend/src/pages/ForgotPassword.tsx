import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router';
import { motion, AnimatePresence } from 'framer-motion';
import toast from 'react-hot-toast';
import { KeyRound, ArrowRight, ArrowLeft, CheckCircle2, RotateCw, Eye, EyeOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import api from '@/services/api';
import Logo from '@/components/common/Logo';
import SEO from '@/components/common/SEO';

export default function ForgotPassword() {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [email, setEmail] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [resetToken, setResetToken] = useState('');
  
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [newPasswordError, setNewPasswordError] = useState('');
  const [confirmPasswordError, setConfirmPasswordError] = useState('');

  const validateNewPassword = (val: string) => {
    if (!val) {
      setNewPasswordError('Password is required');
      return false;
    } else if (val.length < 8) {
      setNewPasswordError('Must be at least 8 characters');
      return false;
    } else {
      setNewPasswordError('');
      return true;
    }
  };

  const validateConfirmPassword = (val: string, newPass: string) => {
    if (!val) {
      setConfirmPasswordError('Please confirm your password');
      return false;
    } else if (val !== newPass) {
      setConfirmPasswordError('Passwords do not match');
      return false;
    } else {
      setConfirmPasswordError('');
      return true;
    }
  };

  const [isLoading, setIsLoading] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);

  const navigate = useNavigate();

  // Cooldown timer for resending forgot password OTP
  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = setInterval(() => {
      setResendCooldown((prev) => prev - 1);
    }, 1000);
    return () => clearInterval(timer);
  }, [resendCooldown]);

  // Step 1: Send OTP to email
  const handleSendOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    const sanitizedEmail = email.trim().toLowerCase();
    if (!sanitizedEmail) {
      toast.error('Please enter your email address.');
      return;
    }

    setIsLoading(true);
    const toastId = toast.loading('Sending verification code...');
    try {
      const { data } = await api.post('/auth/forgot-password', { email: sanitizedEmail });
      toast.success(data.message || 'If an account exists, verification code has been sent.', { id: toastId });
      setStep(2);
      setResendCooldown(60);
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to request reset. Please try again.', {
        id: toastId,
      });
    } finally {
      setIsLoading(false);
    }
  };

  // Step 2: Verify the OTP and obtain resetToken
  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    const sanitizedEmail = email.trim().toLowerCase();
    if (!otpCode || otpCode.length !== 6) {
      toast.error('Please enter a valid 6-digit verification code.');
      return;
    }

    setIsLoading(true);
    const toastId = toast.loading('Verifying code...');
    try {
      const { data } = await api.post('/auth/verify-reset-otp', {
        email: sanitizedEmail,
        otp_code: otpCode,
      });

      toast.success('Code verified successfully!', { id: toastId });
      setResetToken(data.resetToken);
      setStep(3);
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Verification failed. Please try again.', {
        id: toastId,
      });
    } finally {
      setIsLoading(false);
    }
  };

  // Step 3: Set new password using resetToken
  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    const isNewPassValid = validateNewPassword(newPassword);
    const isConfirmPassValid = validateConfirmPassword(confirmPassword, newPassword);
    if (!isNewPassValid || !isConfirmPassValid) {
      return;
    }

    const sanitizedEmail = email.trim().toLowerCase();
    setIsLoading(true);
    const toastId = toast.loading('Resetting password...');
    try {
      const { data } = await api.post('/auth/reset-password', {
        email: sanitizedEmail,
        resetToken,
        newPassword,
      });

      toast.success(data.message || 'Password reset successfully!', { id: toastId });
      navigate('/login');
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to reset password. Please try again.', {
        id: toastId,
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className='min-h-screen flex flex-col justify-center py-12 sm:px-6 lg:px-8 bg-slate-50'>
      <SEO title='Forgot Password' description='Reset your CodeGuru account password securely.' />

      <div className='sm:mx-auto sm:w-full sm:max-w-md flex flex-col items-center'>
        <Logo />
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
              <KeyRound className='h-8 w-8' />
            </div>
            <div className='space-y-1.5'>
              <h2 className='text-2xl font-bold text-slate-900 tracking-tight'>Reset Password</h2>
              <p className='text-sm text-slate-500'>
                {step === 1 && 'Enter your email address to receive a password reset code.'}
                {step === 2 && `Enter the 6-digit code sent to ${email}`}
                {step === 3 && 'Enter and confirm your new secure password.'}
              </p>
            </div>
          </div>

          <AnimatePresence mode='wait'>
            {step === 1 && (
              <motion.form
                key='step1'
                initial={{ opacity: 0, x: -15 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 15 }}
                transition={{ duration: 0.2 }}
                onSubmit={handleSendOtp}
                className='space-y-6'
              >
                <div className='space-y-1'>
                  <label htmlFor='email' className='text-[13px] font-semibold text-slate-800 tracking-wide'>
                    Email Address
                  </label>
                  <Input
                    id='email'
                    type='email'
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder='name@example.com'
                    className='h-11 rounded-xl border-slate-200 focus:border-indigo-500 focus:ring-indigo-500 text-slate-800'
                  />
                </div>

                <div className='flex items-center justify-between gap-4 mt-2'>
                  <Button
                    type='button'
                    variant='outline'
                    className='w-1/2 rounded-xl h-11 border-slate-200 text-slate-700 flex items-center justify-center gap-1.5'
                    onClick={() => navigate('/login')}
                  >
                    <ArrowLeft className='h-4 w-4' /> Back
                  </Button>
                  <Button
                    type='submit'
                    className='w-1/2 bg-[#344499] hover:bg-[#2c3983] text-white h-11 text-[15px] font-semibold tracking-wide shadow-md rounded-xl flex items-center justify-center gap-1.5'
                    loading={isLoading}
                  >
                    Send OTP <ArrowRight className='h-4 w-4' />
                  </Button>
                </div>
              </motion.form>
            )}

            {step === 2 && (
              <motion.form
                key='step2'
                initial={{ opacity: 0, x: -15 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 15 }}
                transition={{ duration: 0.2 }}
                onSubmit={handleVerifyOtp}
                className='space-y-6'
              >
                <div className='space-y-1'>
                  <label htmlFor='otp' className='text-[13px] font-semibold text-slate-800 tracking-wide'>
                    Verification Code
                  </label>
                  <Input
                    id='otp'
                    type='text'
                    required
                    maxLength={6}
                    value={otpCode}
                    onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, ''))}
                    placeholder='Enter 6-digit code'
                    className='h-12 text-center text-xl font-bold tracking-[8px] rounded-xl border-slate-200 focus:border-indigo-500 focus:ring-indigo-500 text-slate-800'
                  />
                </div>

                <div className='flex items-center justify-between gap-4 mt-2'>
                  <Button
                    type='button'
                    variant='outline'
                    className='w-1/2 rounded-xl h-11 border-slate-200 text-slate-700 flex items-center justify-center gap-1.5'
                    onClick={() => setStep(1)}
                  >
                    <ArrowLeft className='h-4 w-4' /> Edit Email
                  </Button>
                  <Button
                    type='submit'
                    className='w-1/2 bg-[#344499] hover:bg-[#2c3983] text-white h-11 text-[15px] font-semibold tracking-wide shadow-md rounded-xl flex items-center justify-center gap-1.5'
                    loading={isLoading}
                  >
                    Verify Code <CheckCircle2 className='h-4 w-4' />
                  </Button>
                </div>

                <div className='flex justify-center mt-4'>
                  <button
                    type='button'
                    onClick={handleSendOtp}
                    disabled={resendCooldown > 0 || isLoading}
                    className={`text-xs font-semibold flex items-center gap-1.5 transition-colors ${
                      resendCooldown > 0 || isLoading
                        ? 'text-slate-400 cursor-not-allowed'
                        : 'text-indigo-600 hover:text-indigo-800'
                    }`}
                  >
                    <RotateCw className='h-3.5 w-3.5' />
                    {resendCooldown > 0 ? `Resend Code in ${resendCooldown}s` : 'Resend Code'}
                  </button>
                </div>
              </motion.form>
            )}

            {step === 3 && (
              <motion.form
                key='step3'
                initial={{ opacity: 0, x: -15 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 15 }}
                transition={{ duration: 0.2 }}
                onSubmit={handleResetPassword}
                className='space-y-4'
              >
                <div className='space-y-1'>
                  <label htmlFor='new_password' className='text-[13px] font-semibold text-slate-800 tracking-wide'>
                    New Password
                  </label>
                  <div className="relative">
                    <Input
                      id='new_password'
                      type={showNewPassword ? 'text' : 'password'}
                      required
                      value={newPassword}
                      onChange={(e) => {
                        const val = e.target.value;
                        setNewPassword(val);
                        if (newPasswordError) {
                          validateNewPassword(val);
                        }
                        if (confirmPasswordError) {
                          validateConfirmPassword(confirmPassword, val);
                        }
                      }}
                      onBlur={() => validateNewPassword(newPassword)}
                      placeholder='Enter new password'
                      className={`h-11 pr-10 rounded-xl focus:border-indigo-500 focus:ring-indigo-500 text-slate-800 ${
                        newPasswordError ? 'border-destructive focus:border-destructive focus:ring-destructive' : 'border-slate-200'
                      }`}
                    />
                    <button
                      type="button"
                      onClick={() => setShowNewPassword(!showNewPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 focus:outline-none"
                    >
                      {showNewPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                  {newPasswordError && (
                    <p className='text-xs text-destructive mt-1'>
                      {newPasswordError}
                    </p>
                  )}
                </div>

                <div className='space-y-1'>
                  <label htmlFor='confirm_password' className='text-[13px] font-semibold text-slate-800 tracking-wide'>
                    Confirm Password
                  </label>
                  <div className="relative">
                    <Input
                      id='confirm_password'
                      type={showConfirmPassword ? 'text' : 'password'}
                      required
                      value={confirmPassword}
                      onChange={(e) => {
                        const val = e.target.value;
                        setConfirmPassword(val);
                        if (confirmPasswordError) {
                          validateConfirmPassword(val, newPassword);
                        }
                      }}
                      onBlur={() => validateConfirmPassword(confirmPassword, newPassword)}
                      placeholder='Confirm new password'
                      className={`h-11 pr-10 rounded-xl focus:border-indigo-500 focus:ring-indigo-500 text-slate-800 ${
                        confirmPasswordError ? 'border-destructive focus:border-destructive focus:ring-destructive' : 'border-slate-200'
                      }`}
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 focus:outline-none"
                    >
                      {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                  {confirmPasswordError && (
                    <p className='text-xs text-destructive mt-1'>
                      {confirmPasswordError}
                    </p>
                  )}
                </div>

                <Button
                  type='submit'
                  className='w-full bg-[#344499] hover:bg-[#2c3983] text-white h-11 text-[15px] font-semibold tracking-wide shadow-md rounded-xl flex items-center justify-center gap-1.5 mt-2'
                  loading={isLoading}
                >
                  Reset Password <CheckCircle2 className='h-4 w-4' />
                </Button>
              </motion.form>
            )}
          </AnimatePresence>
        </motion.div>
      </div>
    </div>
  );
}
