import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight } from 'lucide-react';

export interface CalendarPickerProps {
  label?: string;
  value: string;
  onChange: (val: string, isPresent?: boolean) => void;
  allowPresent?: boolean;
  isCurrentRole?: boolean;
  onToggleCurrentRole?: (isCurrent: boolean) => void;
  mode?: 'month-year' | 'full-date';
  placeholder?: string;
  className?: string;
  disabled?: boolean;
}

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

const MONTH_SHORT = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
];

const WEEKDAY_HEADERS = ['M', 'T', 'W', 'T', 'F', 'S', 'S']; // Monday - Sunday matching Google Sheets

export const CalendarPicker: React.FC<CalendarPickerProps> = ({
  label,
  value,
  onChange,
  allowPresent = false,
  isCurrentRole = false,
  onToggleCurrentRole,
  mode = 'month-year',
  placeholder,
  className = '',
  disabled = false,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Parse incoming date string
  const parsedDate = useMemo(() => {
    const trimmed = (value || '').trim();
    if (!trimmed || trimmed.toLowerCase() === 'present') {
      const now = new Date();
      return {
        year: now.getFullYear(),
        month: now.getMonth(),
        day: now.getDate(),
        isPresent: isCurrentRole || trimmed.toLowerCase() === 'present',
        isEmpty: !trimmed,
      };
    }

    // Try full date ISO or US or UK format (e.g. 07/31/2026 or 2026-07-31)
    const d = new Date(trimmed);
    if (!isNaN(d.getTime())) {
      return {
        year: d.getFullYear(),
        month: d.getMonth(),
        day: d.getDate(),
        isPresent: false,
        isEmpty: false,
      };
    }

    // Match year e.g. 1995 or 2024
    const yearMatch = trimmed.match(/\b((?:19|20)\d{2})\b/);
    const yr = yearMatch ? parseInt(yearMatch[1], 10) : new Date().getFullYear();

    // Match month
    let mo = 0;
    for (let i = 0; i < MONTH_SHORT.length; i++) {
      const rgx = new RegExp(`\\b(${MONTH_SHORT[i]}|${MONTH_NAMES[i]})\\b`, 'i');
      if (rgx.test(trimmed)) {
        mo = i;
        break;
      }
    }

    return {
      year: yr,
      month: mo,
      day: 1,
      isPresent: false,
      isEmpty: false,
    };
  }, [value, isCurrentRole]);

  // Current view year & month in the calendar card
  const [viewYear, setViewYear] = useState<number>(parsedDate.year);
  const [viewMonth, setViewMonth] = useState<number>(parsedDate.month);
  const [selectedDay, setSelectedDay] = useState<number>(parsedDate.day);

  // Keep view in sync when value changes externally
  useEffect(() => {
    if (!parsedDate.isEmpty && !parsedDate.isPresent) {
      setViewYear(parsedDate.year);
      setViewMonth(parsedDate.month);
      setSelectedDay(parsedDate.day);
    }
  }, [parsedDate]);

  // Close popup on outside click
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleOutsideClick);
    }
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
    };
  }, [isOpen]);

  // Build Year Options (From currentYear + 5 down to 1970)
  const currentYear = new Date().getFullYear();
  const yearOptions = useMemo(() => {
    const list: number[] = [];
    for (let y = currentYear + 5; y >= 1970; y--) {
      list.push(y);
    }
    return list;
  }, [currentYear]);

  // Month navigation
  const handlePrevMonth = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (viewMonth === 0) {
      setViewMonth(11);
      setViewYear((prev) => prev - 1);
    } else {
      setViewMonth((prev) => prev - 1);
    }
  };

  const handleNextMonth = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (viewMonth === 11) {
      setViewMonth(0);
      setViewYear((prev) => prev + 1);
    } else {
      setViewMonth((prev) => prev + 1);
    }
  };

  // Generate days grid matching Google Sheets (Monday to Sunday)
  const calendarDays = useMemo(() => {
    const firstDayOfMonth = new Date(viewYear, viewMonth, 1);
    const lastDayOfMonth = new Date(viewYear, viewMonth + 1, 0);
    const daysInMonth = lastDayOfMonth.getDate();

    // Monday is 0, Sunday is 6
    let startingDayOfWeek = firstDayOfMonth.getDay() - 1;
    if (startingDayOfWeek === -1) startingDayOfWeek = 6;

    const days: { day: number; isCurrentMonth: boolean; date: Date }[] = [];

    // Fill days from previous month
    const prevMonthLastDay = new Date(viewYear, viewMonth, 0).getDate();
    for (let i = startingDayOfWeek - 1; i >= 0; i--) {
      const d = prevMonthLastDay - i;
      days.push({
        day: d,
        isCurrentMonth: false,
        date: new Date(viewYear, viewMonth - 1, d),
      });
    }

    // Days of current month
    for (let i = 1; i <= daysInMonth; i++) {
      days.push({
        day: i,
        isCurrentMonth: true,
        date: new Date(viewYear, viewMonth, i),
      });
    }

    // Fill trailing days from next month to complete 6-row (42 cells) or 5-row grid
    const remainingCells = 35 - days.length > 0 ? 35 - days.length : (42 - days.length > 0 ? 42 - days.length : 0);
    for (let i = 1; i <= remainingCells; i++) {
      days.push({
        day: i,
        isCurrentMonth: false,
        date: new Date(viewYear, viewMonth + 1, i),
      });
    }

    return days;
  }, [viewYear, viewMonth]);

  // Handle selecting a specific day
  const handleSelectDay = (day: number, isCurrentMonth: boolean, targetDate: Date) => {
    let finalYear = viewYear;
    let finalMonth = viewMonth;

    if (!isCurrentMonth) {
      finalYear = targetDate.getFullYear();
      finalMonth = targetDate.getMonth();
      setViewYear(finalYear);
      setViewMonth(finalMonth);
    }

    setSelectedDay(day);

    if (mode === 'month-year') {
      // ATS resume standard: "Dec 2023"
      const formatted = `${MONTH_SHORT[finalMonth]} ${finalYear}`;
      onChange(formatted, false);
    } else {
      // Full date: "07/31/2026"
      const mm = String(finalMonth + 1).padStart(2, '0');
      const dd = String(day).padStart(2, '0');
      onChange(`${mm}/${dd}/${finalYear}`, false);
    }

    onToggleCurrentRole?.(false);
    setIsOpen(false);
  };

  // Select Today shortcut
  const handleSelectToday = (e: React.MouseEvent) => {
    e.stopPropagation();
    const now = new Date();
    setViewYear(now.getFullYear());
    setViewMonth(now.getMonth());
    setSelectedDay(now.getDate());

    if (mode === 'month-year') {
      onChange(`${MONTH_SHORT[now.getMonth()]} ${now.getFullYear()}`, false);
    } else {
      const mm = String(now.getMonth() + 1).padStart(2, '0');
      const dd = String(now.getDate()).padStart(2, '0');
      onChange(`${mm}/${dd}/${now.getFullYear()}`, false);
    }

    onToggleCurrentRole?.(false);
    setIsOpen(false);
  };

  const isPresent = isCurrentRole || parsedDate.isPresent || value.toLowerCase().trim() === 'present';
  const today = new Date();

  return (
    <div className={`relative w-full ${className}`} ref={containerRef}>
      {/* Label and Present Checkbox Header */}
      {label && (
        <div className='flex items-center justify-between mb-1.5'>
          <label className='text-xs font-semibold text-[#374151]'>{label}</label>
          {allowPresent && (
            <label className='inline-flex items-center gap-1.5 text-[11px] font-medium text-slate-600 hover:text-slate-900 cursor-pointer select-none'>
              <input
                type='checkbox'
                checked={isPresent}
                disabled={disabled}
                onChange={(e) => {
                  const checked = e.target.checked;
                  onToggleCurrentRole?.(checked);
                  if (checked) {
                    onChange('Present', true);
                  } else {
                    onChange(`${MONTH_SHORT[new Date().getMonth()]} ${new Date().getFullYear()}`, false);
                  }
                }}
                className='w-3.5 h-3.5 rounded border-slate-300 text-[#1e2653] accent-[#1e2653] cursor-pointer'
              />
              <span>I currently work here</span>
            </label>
          )}
        </div>
      )}

      {/* Main Input Trigger */}
      {allowPresent && isPresent ? (
        <div className='w-full h-[38px] px-3 bg-emerald-50/90 border border-emerald-300/80 rounded-xl flex items-center justify-between text-xs text-emerald-900 font-semibold shadow-2xs'>
          <div className='flex items-center gap-2'>
            <span className='w-2 h-2 rounded-full bg-emerald-500 animate-pulse' />
            <span>Present · Current Role</span>
          </div>
          <button
            type='button'
            disabled={disabled}
            onClick={() => {
              onToggleCurrentRole?.(false);
              onChange(`${MONTH_SHORT[new Date().getMonth()]} ${new Date().getFullYear()}`, false);
              setIsOpen(true);
            }}
            className='text-[11px] text-emerald-700 hover:text-emerald-900 underline font-medium cursor-pointer'
          >
            Set end date
          </button>
        </div>
      ) : (
        <div
          onClick={() => !disabled && setIsOpen((prev) => !prev)}
          className={`flex items-center justify-between px-3 py-2 text-xs bg-white border rounded-xl cursor-pointer transition-all ${
            isOpen
              ? 'border-[#1a73e8] ring-2 ring-[#1a73e8]/20 shadow-xs'
              : 'border-[#D1D5DB] hover:border-slate-400'
          } ${disabled ? 'opacity-50 cursor-not-allowed bg-slate-50' : ''}`}
        >
          <span className={`font-medium ${value ? 'text-slate-900' : 'text-slate-400'}`}>
            {value || placeholder || (mode === 'month-year' ? 'Select Date (e.g. Dec 2023)' : 'Select Date (MM/DD/YYYY)')}
          </span>
          <CalendarIcon size={15} className='text-slate-500 shrink-0 ml-2' />
        </div>
      )}

      {/* Google Sheets Calendar Popover */}
      {isOpen && !disabled && (
        <div className='absolute z-50 mt-1 left-0 w-[260px] bg-white border border-slate-200 rounded-xl shadow-xl p-3 animate-in fade-in-50 zoom-in-95 text-slate-800 select-none font-sans'>
          {/* Header: Month Year + Prev/Next Controls */}
          <div className='flex items-center justify-between pb-2 mb-2 border-b border-slate-100'>
            {/* Clickable Month & Year with Fast Dropdown Jump */}
            <div className='relative flex items-center gap-1'>
              <select
                value={viewMonth}
                onChange={(e) => setViewMonth(parseInt(e.target.value, 10))}
                className='text-xs font-bold text-slate-800 bg-transparent hover:bg-slate-100 rounded px-1.5 py-0.5 cursor-pointer focus:outline-none appearance-none'
              >
                {MONTH_NAMES.map((m, idx) => (
                  <option key={m} value={idx}>{m}</option>
                ))}
              </select>
              <select
                value={viewYear}
                onChange={(e) => setViewYear(parseInt(e.target.value, 10))}
                className='text-xs font-bold text-slate-800 bg-transparent hover:bg-slate-100 rounded px-1.5 py-0.5 cursor-pointer focus:outline-none appearance-none'
              >
                {yearOptions.map((y) => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
            </div>

            {/* Stepper Arrows matching Google Sheets (< >) */}
            <div className='flex items-center gap-0.5'>
              <button
                type='button'
                onClick={handlePrevMonth}
                className='p-1 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-full cursor-pointer transition-colors'
                title='Previous month'
              >
                <ChevronLeft size={16} />
              </button>
              <button
                type='button'
                onClick={handleNextMonth}
                className='p-1 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-full cursor-pointer transition-colors'
                title='Next month'
              >
                <ChevronRight size={16} />
              </button>
            </div>
          </div>

          {/* Weekday Headers: M T W T F S S */}
          <div className='grid grid-cols-7 gap-1 text-center mb-1'>
            {WEEKDAY_HEADERS.map((w, idx) => (
              <span key={idx} className='text-[10px] font-bold text-slate-400'>
                {w}
              </span>
            ))}
          </div>

          {/* Days Grid */}
          <div className='grid grid-cols-7 gap-1 text-center'>
            {calendarDays.map((item, idx) => {
              const isSelected =
                !parsedDate.isEmpty &&
                !parsedDate.isPresent &&
                item.isCurrentMonth &&
                item.day === selectedDay &&
                viewYear === parsedDate.year &&
                viewMonth === parsedDate.month;

              const isTodayCell =
                item.isCurrentMonth &&
                item.day === today.getDate() &&
                viewYear === today.getFullYear() &&
                viewMonth === today.getMonth();

              return (
                <button
                  key={idx}
                  type='button'
                  onClick={() => handleSelectDay(item.day, item.isCurrentMonth, item.date)}
                  className={`h-7 w-7 text-[11px] rounded-full flex items-center justify-center cursor-pointer transition-all ${
                    isSelected
                      ? 'bg-[#1a73e8] text-white font-bold shadow-xs'
                      : isTodayCell
                      ? 'border border-[#1a73e8] text-[#1a73e8] font-bold hover:bg-blue-50'
                      : item.isCurrentMonth
                      ? 'text-slate-800 hover:bg-slate-100 font-medium'
                      : 'text-slate-300 hover:bg-slate-50'
                  }`}
                >
                  {item.day}
                </button>
              );
            })}
          </div>

          {/* Footer Shortcuts: Today + Dismiss */}
          <div className='mt-2.5 pt-2 border-t border-slate-100 flex items-center justify-between text-xs'>
            <button
              type='button'
              onClick={handleSelectToday}
              className='text-[11px] font-semibold text-[#1a73e8] hover:underline cursor-pointer'
            >
              Today
            </button>
            <button
              type='button'
              onClick={() => setIsOpen(false)}
              className='text-[11px] font-medium text-slate-500 hover:text-slate-800 cursor-pointer'
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default CalendarPicker;

