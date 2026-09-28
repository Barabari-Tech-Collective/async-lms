import { useNavigate } from 'react-router';
import { Button } from '@/components/ui/button';
import { Stepper } from './Stepper';
import { Home } from 'lucide-react';
import { useAppSelector, useAppDispatch } from '@/app/hooks';
import { selectUser } from '@/features/auth/authSelectors';
import { loadUser } from '@/features/auth/authThunks';
import { useState, useEffect } from 'react';
import apiClient from '@/services/api';
import Logo from '@/components/common/Logo';
import OnboardingExit from '@/components/common/OnboardingExit';

interface StudentProfile {
  college_name: string;
  year: number;
  current_academic_year: string;
}

interface Subject {
  name: string;
}

export default function ConfirmStep() {
  const navigate = useNavigate();
  const user = useAppSelector(selectUser);
  const dispatch = useAppDispatch();
  const [loading, setLoading] = useState(false);
  const [profile, setProfile] = useState<StudentProfile | null>(null);
  const [subjects, setSubjects] = useState<Subject[]>([]);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [profRes, subRes] = await Promise.all([
          apiClient.get('/users/profile'),
          apiClient.get('/users/subjects'),
        ]);
        setProfile(profRes.data.data);
        setSubjects(subRes.data.data);
      } catch {
        // profile/subjects remain null — page renders with fallback values
      }
    };
    fetchData();
  }, []);

  const handleConfirm = async () => {
    try {
      setLoading(true);
      // Refresh user from backend so onboarding_step = 'done' is in Redux
      await dispatch(loadUser()).unwrap();
      navigate('/onboarding/success');
    } catch {
      // loadUser rejected — PrivateRoute will redirect based on token state
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className='min-h-screen w-full relative bg-cover bg-center overflow-hidden flex flex-col items-center justify-center p-4'
      style={{
        backgroundImage: 'url("/bg-students.jpg")',
        fontFamily: "'Inter', sans-serif",
      }}
    >
      {/* Blue tinted overlay */}
      <div className='absolute inset-0 bg-[#344499]/70 backdrop-blur-[2px]' />

      <OnboardingExit />

      <div className='flex flex-col items-center mb-6 relative z-10'>
        <Logo className='h-14 w-14 mb-2' />
        <span className='text-white font-bold text-lg tracking-wider'>
          CodeGuru
        </span>
      </div>

      <div className='relative z-10 w-full max-w-[480px] bg-white p-5 sm:p-8 md:px-12 md:py-10 rounded-2xl sm:rounded-3xl shadow-[0_8px_50px_rgba(0,0,0,0.25)] flex flex-col min-h-[460px] text-slate-800'>
        <div className='flex-1'>
          <Stepper current='confirm' />

          <div className='mb-6 sm:mb-8 mt-4 sm:mt-6 text-center'>
            <h2 className='text-xl sm:text-2xl font-bold text-[#344499]'>
              Review your details
            </h2>
            <p className='text-xs sm:text-[13px] text-slate-400 font-medium mt-1 tracking-wide'>
              Please verify your information before proceeding
            </p>
          </div>

          <div className='border border-slate-200 rounded-xl overflow-hidden mb-6 sm:mb-8'>
            {/* Personal Information */}
            <div className='p-4 sm:p-5 border-b border-slate-200 bg-white'>
              <div className='flex justify-between items-center mb-3 sm:mb-4'>
                <h3 className='text-xs sm:text-[13px] font-semibold text-[#344499] tracking-wide'>
                  Personal Information
                </h3>
                <Home className='w-4 h-4 text-slate-500' />
              </div>
              <div className='space-y-2.5 sm:space-y-3'>
                <div className='flex justify-between items-center text-xs'>
                  <span className='text-slate-400 font-medium'>
                    Name
                  </span>
                  <span className='text-slate-800 font-semibold truncate max-w-[60%] text-right'>
                    {user?.full_name || 'John Doe'}
                  </span>
                </div>
                <div className='flex justify-between items-center text-xs'>
                  <span className='text-slate-400 font-medium'>
                    Email
                  </span>
                  <span className='text-slate-800 font-semibold truncate max-w-[60%] text-right'>
                    {user?.email || 'john.doe@example.com'}
                  </span>
                </div>
              </div>
            </div>

            {/* Academic Information */}
            <div className='p-4 sm:p-5 bg-white'>
              <div className='flex justify-between items-center mb-3 sm:mb-4'>
                <h3 className='text-xs sm:text-[13px] font-semibold text-[#344499] tracking-wide'>
                  Academic Information
                </h3>
                <Home className='w-4 h-4 text-slate-500' />
              </div>
              <div className='space-y-2.5 sm:space-y-3'>
                <div className='flex justify-between items-center text-xs'>
                  <span className='text-slate-400 font-medium'>
                    College
                  </span>
                  <span className='text-slate-800 font-semibold truncate max-w-[60%] text-right'>
                    {profile ? profile.college_name : 'Loading...'}
                  </span>
                </div>
                <div className='flex justify-between items-center text-xs'>
                  <span className='text-slate-400 font-medium'>
                    Program
                  </span>
                  <span className='text-slate-800 font-semibold truncate max-w-[60%] text-right'>
                    {subjects.length > 0
                      ? subjects.map((s) => s.name).join(', ')
                      : 'Loading...'}
                  </span>
                </div>
                <div className='flex justify-between items-center text-xs'>
                  <span className='text-slate-400 font-medium'>
                    Batch
                  </span>
                  <span className='text-slate-800 font-semibold truncate max-w-[60%] text-right'>
                    {profile
                      ? profile.current_academic_year || 'N/A'
                      : 'Loading...'}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Footer buttons */}
        <div className='flex flex-col gap-2.5 sm:gap-3 mt-4'>
          <Button
            type='button'
            className='w-full bg-[#344499] hover:bg-[#2c3983] text-white h-11 text-xs sm:text-[14px] font-semibold tracking-wide rounded-lg shadow-md transition-colors min-h-[44px]'
            disabled={loading}
            onClick={handleConfirm}
          >
            Confirm & Save
          </Button>
          <Button
            variant='outline'
            onClick={() => navigate('/onboarding/college')}
            type='button'
            className='w-full border-slate-300 text-[#344499] hover:bg-slate-50 hover:text-blue-900 h-11 text-xs sm:text-[13px] font-semibold tracking-wide rounded-lg transition-colors min-h-[44px]'
          >
            Edit details
          </Button>
        </div>
      </div>
    </div>
  );
}
