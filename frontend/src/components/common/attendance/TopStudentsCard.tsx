import React from 'react';
import type { TopStudent } from '@/services/attendance';

interface TopStudentsCardProps {
  students: TopStudent[];
  isLoading?: boolean;
}

// Pastel colours cycle for initials avatars — matches the KPI card palette
const AVATAR_COLORS = ['#CDD0FF', '#FFEFD4', '#C8FEC3', '#F5CFCC', '#DDDFF6'];

export const TopStudentsCard: React.FC<TopStudentsCardProps> = ({
  students,
  isLoading,
}) => {
  return (
    <div className='bg-white rounded-2xl p-3.5 sm:p-4 shadow-xs border border-slate-100 flex flex-col h-full min-h-[355px] select-none'>
      {/* Header - without three dots as per Figma node #669:2775 */}
      <div className='flex items-center mb-3 px-1'>
        <h3 className='text-xs font-semibold text-black tracking-tight'>
          Top Students
        </h3>
      </div>

      {/* List of 5 Students */}
      <div className='flex flex-col gap-3'>
        {isLoading ? (
          Array.from({ length: 5 }).map((_, i) => (
            <div
              key={i}
              className='h-11 rounded-2xl bg-slate-100 animate-pulse'
            />
          ))
        ) : students.length === 0 ? (
          <div className='py-8 text-center text-xs text-slate-400'>
            No student attendance to rank yet
          </div>
        ) : (
          students.slice(0, 5).map((student, idx) => {
            const initials = student.fullName
              ? student.fullName
                  .split(' ')
                  .map((n) => n[0])
                  .join('')
                  .toUpperCase()
                  .slice(0, 2)
              : 'ST';

            return (
              <div
                key={student.id || idx}
                className='flex items-center py-1.5 px-2.5 rounded-2xl bg-[#ECE9E9] transition-colors border border-black/5 gap-3'
              >
                {/* CSS initials avatar — no PII sent to external avatar services */}
                <div
                  className='w-9 h-9 rounded-full shrink-0 flex items-center justify-center text-xs font-bold text-[#1D275E]'
                  style={{ backgroundColor: AVATAR_COLORS[idx % AVATAR_COLORS.length] }}
                  aria-hidden='true'
                >
                  {initials}
                </div>

                {/* Name & Email */}
                <div className='min-w-0 flex-1'>
                  <p className='text-xs font-semibold text-black truncate leading-tight'>
                    {student.fullName || 'Student'}
                  </p>
                  <p className='text-[9px] font-semibold text-black/60 truncate leading-tight mt-0.5'>
                    {student.email || 'student@gmail.com'}
                  </p>
                </div>

                {/* Attendance badge — shows WHY this student is "top" */}
                {student.attendancePercent > 0 && (
                  <div className='shrink-0'>
                    <span className='inline-flex items-center px-2 py-0.5 rounded-full bg-[#1D275E] text-white text-[9px] font-bold leading-tight'>
                      {student.attendancePercent}%
                    </span>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};

export default TopStudentsCard;
