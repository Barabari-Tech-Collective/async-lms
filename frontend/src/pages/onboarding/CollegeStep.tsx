import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Stepper } from './Stepper';
import { useNavigate } from 'react-router';
import apiClient from '@/services/api';
import Logo from '@/components/common/Logo';
import OnboardingExit from '@/components/common/OnboardingExit';
import { Info } from 'lucide-react';
import { useAppDispatch } from '@/app/hooks';
import { loadUser } from '@/features/auth/authThunks';
import { useColleges } from '@/hooks/queries/useOnboarding';
import toast from 'react-hot-toast';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

export default function CollegeStep() {
  const [submitting, setSubmitting] = useState(false);
  const [collegeId, setCollegeId] = useState<string | null>(null);
  const [customCollegeName, setCustomCollegeName] = useState('');
  const [customCollegeAddress, setCustomCollegeAddress] = useState('');

  const navigate = useNavigate();
  const dispatch = useAppDispatch();
  const isOtherSelected = collegeId === 'OTHER';

  // React Query — cached, no manual loading state needed
  const { data: collegeList = [], isLoading } = useColleges();

  // Pre-fill previously selected college once list is loaded
  useEffect(() => {
    if (!collegeList.length) return;
    dispatch(loadUser())
      .unwrap()
      .then((freshUser) => {
        if (freshUser?.college_id) {
          const existing = collegeList.find(
            (c) => c.id.toString() === freshUser.college_id!.toString(),
          );
          if (existing) setCollegeId(existing.id.toString());
        }
      })
      .catch(() => {});
  }, [collegeList, dispatch]);

  const handleContinue = async () => {
    if (!collegeId) return;
    try {
      setSubmitting(true);
      let finalCollegeId = collegeId;

      if (collegeId === 'OTHER') {
        const name = customCollegeName.trim();
        const city = customCollegeAddress.trim();
        const words = name.split(/\s+/);
        const shortCode =
          words.length > 1
            ? words
                .map((w) => w[0])
                .join('')
                .toUpperCase()
                .substring(0, 5)
            : name.substring(0, 5).toUpperCase();

        const createRes = await apiClient.post('/colleges', {
          name,
          city,
          short_code: shortCode,
          state: '',
        });
        // FIX: access nested data object from backend response
        finalCollegeId = createRes.data.data.id;
      }

      const res = await apiClient.post('/onboarding/college', {
        college_id: finalCollegeId,
      });

      if (res.status === 200 || res.status === 201) {
        navigate(`/onboarding/${res.data.next_step}`);
      }
    } catch (err) {
      console.error('Onboarding error:', err);
      toast.error('Failed to save college choice. Please try again.');
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
          <Stepper current='college' />

          <div className='mb-6 sm:mb-8 mt-4 sm:mt-6'>
            <h2 className='text-xl sm:text-2xl font-bold text-[#344499]'>
              Select your college
            </h2>
            <p className='text-xs sm:text-[13px] text-slate-400 font-medium mt-1 leading-relaxed tracking-wide'>
              Required for mapping batches and cohorts
            </p>
          </div>

          <div className='space-y-2 mb-6'>
            <label className='text-xs sm:text-[13px] font-semibold text-[#344499] tracking-wide'>
              College name
            </label>
            <Select
              value={collegeId || ''}
              onValueChange={setCollegeId}
              disabled={isLoading || submitting}
            >
              <SelectTrigger className='w-full h-11 text-xs sm:text-[13px] text-slate-500 bg-white border border-slate-200 focus:ring-[#344499] focus:border-[#344499] shadow-sm'>
                <SelectValue
                  placeholder={
                    isLoading
                      ? 'Loading colleges...'
                      : 'Search or select your college'
                  }
                />
              </SelectTrigger>
              <SelectContent>
                {collegeList?.map((college) => (
                  <SelectItem key={college.id} value={college.id.toString()}>
                    {college.name}
                  </SelectItem>
                ))}
                <SelectItem value='OTHER'>Other</SelectItem>
              </SelectContent>
            </Select>
            <div className='flex items-center gap-1.5 mt-2'>
              <Info className='h-3.5 w-3.5 text-[#344499]' />
              <button
                type='button'
                onClick={() => setCollegeId('OTHER')}
                className='text-xs sm:text-[14px] font-bold tracking-wide text-[#344499] hover:underline'
              >
                My college is not listed
              </button>
            </div>
          </div>

          {/* Show when "Other" is selected */}
          {isOtherSelected && (
            <div className='space-y-4 mb-6 border-t border-slate-100 pt-6 mt-6'>
              <div className='space-y-1.5'>
                <label className='text-xs sm:text-[13px] font-semibold text-[#344499] tracking-wide'>
                  Enter college name
                </label>
                <Input
                  className='h-11 border-slate-200 text-sm shadow-sm'
                  placeholder='e.g. Stanford University'
                  value={customCollegeName}
                  onChange={(e) => setCustomCollegeName(e.target.value)}
                />
              </div>

              <div className='space-y-1.5'>
                <label className='text-xs sm:text-[13px] font-semibold text-[#344499] tracking-wide'>
                  Enter college address (City)
                </label>
                <Input
                  className='h-11 border-slate-200 text-sm shadow-sm'
                  placeholder='e.g. Stanford, California'
                  value={customCollegeAddress}
                  onChange={(e) => setCustomCollegeAddress(e.target.value)}
                />
              </div>
            </div>
          )}
        </div>

        {/* Footer buttons */}
        <div className='flex justify-between items-center mt-6 sm:mt-8 pt-4 gap-3'>
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
            disabled={
              isLoading ||
              submitting ||
              !collegeId ||
              (isOtherSelected && (!customCollegeName || !customCollegeAddress))
            }
            onClick={handleContinue}
          >
            {submitting ? 'Saving...' : 'Continue'}
          </Button>
        </div>
      </div>
    </div>
  );
}
