import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Stepper } from './Stepper';
import { useNavigate } from 'react-router';
import apiClient from '@/services/api';
import Logo from '@/components/common/Logo';
import OnboardingExit from '@/components/common/OnboardingExit';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

export default function BatchStep() {
  const [currentAcademicYear, setCurrentAcademicYear] =
    useState<string>('1st year');
  const [expectedGraduationYear, setExpectedGraduationYear] =
    useState<string>('2027-28');
  const [degree, setDegree] = useState<string>('B.Tech');
  const [loading, setLoading] = useState(false);

  const navigate = useNavigate();

  useEffect(() => {
    apiClient
      .get('/users/profile')
      .then((res) => {
        const p = res.data.data;
        if (p?.degree) setDegree(p.degree);
        if (p?.current_academic_year) {
          setCurrentAcademicYear(p.current_academic_year);
          setExpectedGraduationYear(
            calculateGradYear(p.current_academic_year, p.degree || degree),
          );
        }
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const getDuration = (deg: string) => {
    if (['BCA', 'BSC', 'BCOM', 'BA'].includes(deg)) return 3;
    if (deg === 'M.Tech') return 2;
    return 4; // B.Tech and default
  };

  const calculateGradYear = (yearStr: string, deg: string) => {
    const baseYear = 2024; // Fixed base year or new Date().getFullYear()
    const currentYearNum = parseInt(yearStr.charAt(0)) || 1;

    const duration = getDuration(deg);
    const yearsLeft = Math.max(0, duration - currentYearNum);
    const gradYearNum = baseYear + yearsLeft;
    const nextYearNum = (gradYearNum + 1).toString().slice(2);

    return `${gradYearNum}-${nextYearNum}`;
  };

  const handleYearChange = (val: string) => {
    setCurrentAcademicYear(val);
    setExpectedGraduationYear(calculateGradYear(val, degree));
  };

  const handleDegreeChange = (val: string) => {
    setDegree(val);
    setExpectedGraduationYear(calculateGradYear(currentAcademicYear, val));
  };

  const handleContinue = async () => {
    try {
      setLoading(true);
      await apiClient.post('/onboarding/batch', {
        degree: degree,
        current_academic_year: currentAcademicYear,
        expected_graduation_year: expectedGraduationYear,
      });

      navigate('/onboarding/program');
    } catch {
      // navigation does not occur — user stays on step
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
          <Stepper current='batch' />

          <div className='mb-6 sm:mb-8 mt-4 sm:mt-6'>
            <h2 className='text-xl sm:text-2xl font-bold text-[#344499]'>
              Select your batch
            </h2>
            <p className='text-xs sm:text-[13px] text-slate-400 font-medium mt-1 leading-relaxed tracking-wide'>
              Used for cohort tracking and leaderboard ranking
            </p>
          </div>

          <div className='space-y-4 sm:space-y-5 w-full'>
            <div className='w-full'>
              <label className='text-xs sm:text-[13px] font-semibold text-[#344499] tracking-wide mb-1.5 block'>
                Degree Program
              </label>
              <Select value={degree} onValueChange={handleDegreeChange}>
                <SelectTrigger className='w-full h-11 text-xs sm:text-[13px] font-medium text-slate-600 bg-white border border-slate-200 focus:ring-[#344499] focus:border-[#344499] shadow-sm'>
                  <SelectValue placeholder='Select Degree' />
                </SelectTrigger>
                <SelectContent className='w-full'>
                  <SelectItem value='B.Tech'>B.Tech</SelectItem>
                  <SelectItem value='BCA'>BCA</SelectItem>
                  <SelectItem value='M.Tech'>M.Tech</SelectItem>
                  <SelectItem value='BSC'>BSC</SelectItem>
                  <SelectItem value='BCOM'>BCOM</SelectItem>
                  <SelectItem value='BA'>BA</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className='w-full'>
              <label className='text-xs sm:text-[13px] font-semibold text-[#344499] tracking-wide mb-1.5 block'>
                Batch (Academic Year)
              </label>
              <Select
                value={currentAcademicYear}
                onValueChange={handleYearChange}
              >
                <SelectTrigger className='w-full h-11 text-xs sm:text-[13px] font-medium text-slate-600 bg-white border border-slate-200 focus:ring-[#344499] focus:border-[#344499] shadow-sm'>
                  <SelectValue placeholder='Select Batch' />
                </SelectTrigger>
                <SelectContent className='w-full'>
                  <SelectItem value='1st year'>1st year</SelectItem>
                  <SelectItem value='2nd year'>2nd year</SelectItem>
                  <SelectItem value='3rd year'>3rd year</SelectItem>
                  <SelectItem value='4th year'>4th year</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className='w-full'>
              <label className='text-xs sm:text-[13px] font-semibold text-[#344499] tracking-wide mb-1.5 block'>
                Expected Graduation Year
              </label>
              <Select
                value={expectedGraduationYear}
                onValueChange={setExpectedGraduationYear}
              >
                <SelectTrigger className='w-full h-11 text-xs sm:text-[13px] font-medium text-slate-600 bg-white border border-slate-200 focus:ring-[#344499] focus:border-[#344499] shadow-sm'>
                  <SelectValue placeholder='Select Graduation Year' />
                </SelectTrigger>
                <SelectContent className='w-full'>
                  <SelectItem value='2024-25'>2024-25</SelectItem>
                  <SelectItem value='2025-26'>2025-26</SelectItem>
                  <SelectItem value='2026-27'>2026-27</SelectItem>
                  <SelectItem value='2027-28'>2027-28</SelectItem>
                  <SelectItem value='2028-29'>2028-29</SelectItem>
                  <SelectItem value='2029-30'>2029-30</SelectItem>
                  <SelectItem value='2030-31'>2030-31</SelectItem>
                  <SelectItem value='2031-32'>2031-32</SelectItem>
                  <SelectItem value='2032-33'>2032-33</SelectItem>
                  <SelectItem value='2033-34'>2033-34</SelectItem>
                </SelectContent>
              </Select>
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
            disabled={loading}
            onClick={handleContinue}
          >
            Continue
          </Button>
        </div>
      </div>
    </div>
  );
}
