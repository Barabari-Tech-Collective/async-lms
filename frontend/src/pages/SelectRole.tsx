import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { motion } from 'framer-motion';
import { GraduationCap, Users } from 'lucide-react';
import toast from 'react-hot-toast';
import { useAppDispatch } from '@/app/hooks';
import { completeGoogleSignup } from '@/features/auth/authThunks';
import Logo from '@/components/common/Logo';
import SEO from '@/components/common/SEO';

export default function SelectRole() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const dispatch = useAppDispatch();
  const [loadingRole, setLoadingRole] = useState<'student' | 'facilitator' | null>(null);

  const token = searchParams.get('token');

  const handleSelect = async (role: 'student' | 'facilitator') => {
    if (!token) return;
    setLoadingRole(role);
    try {
      const result = await dispatch(completeGoogleSignup({ token, role })).unwrap();
      // Single-use code, exchanged for the session token over POST on the
      // callback screen — the token never appears in a URL.
      navigate(`/auth/callback?code=${result.code}`);
    } catch (err) {
      toast.error(typeof err === 'string' ? err : 'Could not complete sign-up');
      setLoadingRole(null);
    }
  };

  if (!token) {
    navigate('/login');
    return null;
  }

  return (
    <>
      <SEO title='Choose Your Role' noIndex={true} />
      <div
        className='min-h-screen w-full relative bg-cover bg-center overflow-hidden flex items-center justify-center p-4'
        style={{
          backgroundImage: 'url("/bg-students.jpg")',
          fontFamily: "'Inter', sans-serif",
        }}
      >
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
            <div className='text-center mb-6'>
              <h1 className='text-xl font-bold text-slate-900'>
                One last step
              </h1>
              <p className='text-sm text-slate-500 mt-1'>
                How do you want to join CodeGuru?
              </p>
            </div>

            <div className='space-y-3'>
              <button
                type='button'
                disabled={loadingRole !== null}
                onClick={() => handleSelect('student')}
                className='w-full flex items-center gap-4 rounded-xl border-2 border-slate-200 px-5 py-4 text-left hover:border-[#344499] hover:bg-[#344499]/5 transition-colors disabled:opacity-60'
              >
                <div className='shrink-0 h-11 w-11 rounded-full bg-[#344499]/10 flex items-center justify-center'>
                  <GraduationCap className='h-5 w-5 text-[#344499]' />
                </div>
                <div>
                  <p className='font-semibold text-slate-900'>
                    {loadingRole === 'student' ? 'Setting up your account…' : 'Continue as Student'}
                  </p>
                  <p className='text-xs text-slate-500'>
                    Take courses, submit exercises, track progress
                  </p>
                </div>
              </button>

              <button
                type='button'
                disabled={loadingRole !== null}
                onClick={() => handleSelect('facilitator')}
                className='w-full flex items-center gap-4 rounded-xl border-2 border-slate-200 px-5 py-4 text-left hover:border-[#344499] hover:bg-[#344499]/5 transition-colors disabled:opacity-60'
              >
                <div className='shrink-0 h-11 w-11 rounded-full bg-[#344499]/10 flex items-center justify-center'>
                  <Users className='h-5 w-5 text-[#344499]' />
                </div>
                <div>
                  <p className='font-semibold text-slate-900'>
                    {loadingRole === 'facilitator' ? 'Setting up your account…' : 'Continue as Facilitator'}
                  </p>
                  <p className='text-xs text-slate-500'>
                    Manage subject content for your college
                  </p>
                </div>
              </button>
            </div>
          </div>
        </motion.div>
      </div>
    </>
  );
}
