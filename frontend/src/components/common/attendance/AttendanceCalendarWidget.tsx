import React, { useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { formatToDDMMYYYY, getTodayFormatted } from '@/utils/dateFormat';

interface AttendanceCalendarWidgetProps {
  selectedDate?: string | null;
  onSelectDate?: (date: string | null) => void;
}

const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

const WEEKDAY_NAMES = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];

export const AttendanceCalendarWidget: React.FC<AttendanceCalendarWidgetProps> = ({
  selectedDate = null,
  onSelectDate,
}) => {
  const today = getTodayFormatted();
  const selectedDay = formatToDDMMYYYY(selectedDate ?? '');
  const [, month, year] = (selectedDay || today).split('-').map(Number);
  const [currentYear, setCurrentYear] = useState(year);
  const [currentMonth, setCurrentMonth] = useState(month - 1);

  const handlePrevMonth = () => {
    if (currentMonth === 0) {
      setCurrentMonth(11);
      setCurrentYear((prev) => prev - 1);
    } else {
      setCurrentMonth((prev) => prev - 1);
    }
  };

  const handleNextMonth = () => {
    if (currentMonth === 11) {
      setCurrentMonth(0);
      setCurrentYear((prev) => prev + 1);
    } else {
      setCurrentMonth((prev) => prev + 1);
    }
  };

  // Day calculations for the active month & year
  const firstDayOfWeek = new Date(currentYear, currentMonth, 1).getDay(); // 0 = Sun, 1 = Mon ...
  const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate(); // 28, 29, 30, 31

  const handleDateClick = (day: number) => {
    if (!onSelectDate) return;
    const dateStr = `${String(day).padStart(2, '0')}-${String(currentMonth + 1).padStart(2, '0')}-${currentYear}`;
    // Toggle: if already selected, clear to return to full trend view, otherwise select
    if (selectedDay === dateStr) {
      onSelectDate(null);
    } else {
      onSelectDate(dateStr);
    }
  };

  return (
    <div className='w-full flex items-start justify-center xl:justify-start select-none'>
      <div className='w-full max-w-[316px] min-h-[326px] bg-[#373C45] rounded-2xl shadow-[8px_3px_22px_10px_rgba(0,0,0,0.13)] p-4 flex flex-col justify-between'>
        {/* Top Header: Month & Year with Navigation Controls */}
        <div className='flex items-center justify-between px-2 pt-1 pb-2'>
          <span className='text-white font-bold text-sm tracking-wide'>
            {MONTH_NAMES[currentMonth]} {currentYear}
          </span>
          <div className='flex items-center gap-1'>
            <button
              type='button'
              onClick={handlePrevMonth}
              className='p-1 rounded-md text-slate-400 hover:text-white hover:bg-slate-700/60 transition-colors cursor-pointer'
              aria-label='Previous Month'
            >
              <ChevronLeft className='w-4 h-4' />
            </button>
            <button
              type='button'
              onClick={handleNextMonth}
              className='p-1 rounded-md text-slate-400 hover:text-white hover:bg-slate-700/60 transition-colors cursor-pointer'
              aria-label='Next Month'
            >
              <ChevronRight className='w-4 h-4' />
            </button>
          </div>
        </div>

        {/* Divider Line */}
        <div className='w-full h-[0.8px] bg-[#4E4E4E] my-1' />

        {/* Weekday Column Headers (SUN, MON, TUE, WED, THU, FRI, SAT) */}
        <div className='grid grid-cols-7 gap-1 text-center my-1'>
          {WEEKDAY_NAMES.map((name) => (
            <span
              key={name}
              className='text-[10px] font-semibold text-[#EBEBEB] tracking-wider'
            >
              {name}
            </span>
          ))}
        </div>

        {/* Days Grid */}
        <div className='grid grid-cols-7 gap-y-1.5 gap-x-1 text-center flex-1 content-center items-center py-1'>
          {/* Empty cells for leading days before 1st of month */}
          {Array.from({ length: firstDayOfWeek }).map((_, index) => (
            <div key={`empty-${index}`} className='w-7 h-7 mx-auto' />
          ))}

          {/* Day number buttons */}
          {Array.from({ length: daysInMonth }, (_, i) => i + 1).map((day) => {
            const dateStr = `${String(day).padStart(2, '0')}-${String(currentMonth + 1).padStart(2, '0')}-${currentYear}`;
            const isSelected = selectedDay === dateStr;
            const isToday = today === dateStr;

            return (
              <button
                key={day}
                type='button'
                aria-label={dateStr}
                aria-pressed={isSelected}
                aria-current={isToday ? 'date' : undefined}
                onClick={() => handleDateClick(day)}
                className={`w-7 h-7 sm:w-7.5 sm:h-7.5 mx-auto flex items-center justify-center rounded-full text-xs transition-all cursor-pointer ${
                  isSelected
                    ? 'bg-[#1C5D99] text-[#FDFDFD] font-bold shadow-xs'
                    : isToday
                    ? 'ring-2 ring-[#1C5D99] ring-offset-1 ring-offset-[#373C45] text-white font-bold'
                    : 'text-[#EBEBEB] hover:bg-slate-700/60 hover:text-white font-medium'
                }`}
              >
                {day}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default AttendanceCalendarWidget;
