import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Stepper } from './Stepper';
import { useNavigate } from 'react-router';
import apiClient from '@/services/api';
import Logo from '@/components/common/Logo';
import OnboardingExit from '@/components/common/OnboardingExit';
import { usePublishedSubjects } from '@/hooks/queries/useOnboarding';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

export default function ProgramStep() {
  const [selected, setSelected] = useState<string>('');
  const [submitting, setSubmitting] = useState(false);

  const navigate = useNavigate();

  // React Query — cached, shared with MyCourses if already fetched
  const { data: subjects = [], isLoading } = usePublishedSubjects();

  useEffect(() => {
    apiClient
      .get('/users/subjects')
      .then((res) => {
        const saved = res.data.data;
        if (saved?.length > 0) setSelected(saved[0].id.toString());
      })
      .catch(() => {});
  }, []);

  const handleContinue = async () => {
    if (!selected) return;

    try {
      setSubmitting(true);
      await apiClient.post('/onboarding/subjects', {
        subjectIds: [selected],
      });
      navigate('/onboarding/confirm');
    } catch (err: any) {
      // navigation does not occur — user stays on step
      alert(
        err.response?.data?.message ||
          err.message ||
          'An error occurred while saving your program.',
      );
      console.error('Failed to select program:', err);
    } finally {
      setSubmitting(false);
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
          <Stepper current='program' />

          <div className='mb-6 sm:mb-8 mt-4 sm:mt-6'>
            <h2 className='text-xl sm:text-2xl font-bold text-[#344499]'>
              Select your program
            </h2>
            <p className='text-xs sm:text-[13px] text-slate-400 font-medium mt-1 leading-relaxed tracking-wide'>
              Choose your learning track
            </p>
          </div>

          <div className='space-y-4 sm:space-y-5 w-full'>
            <div className='w-full'>
              <label className='text-xs sm:text-[13px] font-semibold text-[#344499] tracking-wide mb-1.5 block'>
                Program / Course
              </label>
              <Select
                value={selected}
                onValueChange={setSelected}
                disabled={isLoading}
              >
                <SelectTrigger className='w-full h-11 text-xs sm:text-[13px] font-medium text-slate-600 bg-white border border-slate-200 focus:ring-[#344499] focus:border-[#344499] shadow-sm'>
                  <SelectValue
                    placeholder={
                      isLoading ? 'Loading programs...' : 'Select your program'
                    }
                  />
                </SelectTrigger>
                <SelectContent className='w-full'>
                  {subjects.length > 0 ? (
                    subjects.map((sub: { id: number; name: string }) => (
                      <SelectItem key={sub.id} value={sub.id.toString()}>
                        {sub.name}
                      </SelectItem>
                    ))
                  ) : (
                    <>
                      <SelectItem value='a5f1dc34-297c-47b2-841f-fd1ecf3303d8'>
                        Full Stack Web Development
                      </SelectItem>
                      <SelectItem value='b5f1dc34-297c-47b2-841f-fd1ecf3303d9'>
                        Data Science &amp; Machine Learning
                      </SelectItem>
                      <SelectItem value='c5f1dc34-297c-47b2-841f-fd1ecf3303d0'>
                        Cloud Computing &amp; DevOps
                      </SelectItem>
                    </>
                  )}
                </SelectContent>
              </Select>
            </div>

            <div className='bg-[#fffbeb] border-l-[3px] border-[#f59e0b] p-3.5 rounded-r-md mt-6 sm:mt-8 shadow-sm'>
              <p className='text-[11px] font-medium text-slate-800 tracking-wide'>
                You can change this after onboarding
              </p>
            </div>
          </div>
        </div>

        <div className='flex justify-between items-center mt-6 sm:mt-10 pt-4 gap-3'>
          <Button
            variant='ghost'
            onClick={() => navigate(-1)}
            type='button'
            className='bg-[#f8faff] text-[#344499] hover:bg-[#eff4ff] hover:text-[#2c3983] px-6 sm:px-9 h-11 text-xs sm:text-[14px] font-semibold tracking-wide rounded-lg transition-colors flex-1 sm:flex-initial min-h-[44px]'
          >
            Back
          </Button>
          <Button
            type='button'
            className='bg-[#344499] hover:bg-[#2c3983] text-white px-6 sm:px-9 h-11 text-xs sm:text-[14px] font-semibold tracking-wide rounded-lg shadow-md transition-colors flex-1 sm:flex-initial min-h-[44px]'
            disabled={submitting || !selected}
            onClick={handleContinue}
          >
            {submitting ? 'Saving...' : 'Continue'}
          </Button>
        </div>
      </div>
    </div>
  );
}
