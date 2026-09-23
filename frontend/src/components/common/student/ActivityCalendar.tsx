import React, { useEffect, useState, useCallback, useMemo } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Zap,
  Calendar as CalendarIcon,
  ShieldCheck,
  AlertCircle,
  TrendingUp,
  Check,
} from 'lucide-react';
import apiClient from '@/services/api';
import { useAppSelector } from '@/app/hooks';
import { selectUser } from '@/features/auth/authSelectors';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

export interface CalendarDayDetails {
  lessons: number;
  quizzes: number;
  exercises: number;
  assignments: number;
  projects: number;
  college_assignments: number;
  xp_earned: number;
}

export interface ActivityDay {
  date: string;
  day_number: number;
  day_name: string;
  iso_dow: number; // 1 (Mon) to 7 (Sun)
  is_today: boolean;
  is_future: boolean;
  is_active: boolean;
  activity_count: number;
  activity_level: 0 | 1 | 2 | 3;
  status: 'completed' | 'today_completed' | 'today_pending' | 'missed' | 'future';
  details: CalendarDayDetails;
}

export interface ActivityCalendarData {
  year: number;
  month: number;
  month_name: string;
  current_streak: number;
  longest_streak: number;
  practiced_today: boolean;
  total_active_days: number;
  total_actions_count: number;
  total_xp_earned: number;
  monthly_consistency_pct: number;
  first_day_iso_dow: number;
  days_in_month: number;
  days: ActivityDay[];
}

interface ActivityCalendarProps {
  compact?: boolean;
  className?: string;
  onSelectDay?: (day: ActivityDay) => void;
}

const WEEKDAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

export const ActivityCalendar: React.FC<ActivityCalendarProps> = ({
  compact = false,
  className,
  onSelectDay,
}) => {
  const user = useAppSelector(selectUser);
  const today = useMemo(() => new Date(), []);
  const [currentYear, setCurrentYear] = useState(today.getFullYear());
  const [currentMonth, setCurrentMonth] = useState(today.getMonth() + 1); // 1-12
  const [data, setData] = useState<ActivityCalendarData | null>(null);
  const [loading, setLoading] = useState(false);
  const [hoveredDay, setHoveredDay] = useState<ActivityDay | null>(null);

  const fetchCalendar = useCallback(async (year: number, month: number) => {
    try {
      setLoading(true);
      const res = await apiClient.get<{ success: boolean; data: ActivityCalendarData }>(
        `/students/activity-calendar?year=${year}&month=${month}`
      );
      if (res.data?.success && res.data.data) {
        setData(res.data.data);
      }
    } catch (err) {
      console.warn('[ActivityCalendar] Failed to fetch live activity calendar:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCalendar(currentYear, currentMonth);
  }, [currentYear, currentMonth, fetchCalendar]);

  // Refresh calendar whenever user completes a learning touchpoint
  useEffect(() => {
    const handleUpdate = () => {
      fetchCalendar(currentYear, currentMonth);
    };
    window.addEventListener('course-progress-updated', handleUpdate);
    return () => {
      window.removeEventListener('course-progress-updated', handleUpdate);
    };
  }, [currentYear, currentMonth, fetchCalendar]);

  const handlePrevMonth = () => {
    if (currentMonth === 1) {
      setCurrentMonth(12);
      setCurrentYear((y) => y - 1);
    } else {
      setCurrentMonth((m) => m - 1);
    }
  };

  const handleNextMonth = () => {
    const isLatest =
      currentYear === today.getFullYear() && currentMonth >= today.getMonth() + 1;
    if (isLatest) return;

    if (currentMonth === 12) {
      setCurrentMonth(1);
      setCurrentYear((y) => y + 1);
    } else {
      setCurrentMonth((m) => m + 1);
    }
  };

  const isCurrentOrFuture =
    currentYear > today.getFullYear() ||
    (currentYear === today.getFullYear() && currentMonth >= today.getMonth() + 1);

  // Compute live month metrics client-side so calendar dates ALWAYS render immediately
  const monthInfo = useMemo(() => {
    const daysInMonth = new Date(currentYear, currentMonth, 0).getDate();
    const firstDayDow = new Date(currentYear, currentMonth - 1, 1).getDay();
    const firstDayIsoDow = firstDayDow === 0 ? 7 : firstDayDow; // 1 = Mon to 7 = Sun
    const paddingCount = (firstDayIsoDow - 1) % 7;
    const monthName = `${MONTH_NAMES[currentMonth - 1]} ${currentYear}`;

    return { daysInMonth, firstDayIsoDow, paddingCount, monthName };
  }, [currentYear, currentMonth]);

  // Generate full month dates array (1..daysInMonth) with live activity mapping
  const calendarDays = useMemo(() => {
    const todayObj = new Date();
    const isThisCurrentMonth =
      currentYear === todayObj.getFullYear() && currentMonth === todayObj.getMonth() + 1;
    const todayDateNum = isThisCurrentMonth ? todayObj.getDate() : -1;

    // Index backend activity days by day_number for instant lookup
    const apiDayMap = new Map<number, ActivityDay>();
    if (data?.days) {
      data.days.forEach((d) => apiDayMap.set(d.day_number, d));
    }

    const list: ActivityDay[] = [];

    for (let dayNum = 1; dayNum <= monthInfo.daysInMonth; dayNum++) {
      const apiDay = apiDayMap.get(dayNum);
      const isToday = isThisCurrentMonth && dayNum === todayDateNum;
      const isFuture =
        currentYear > todayObj.getFullYear() ||
        (currentYear === todayObj.getFullYear() && currentMonth > todayObj.getMonth() + 1) ||
        (isThisCurrentMonth && dayNum > todayDateNum);

      const dateStr = `${currentYear}-${String(currentMonth).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`;
      const dayDateObj = new Date(currentYear, currentMonth - 1, dayNum);
      const isoDow = dayDateObj.getDay() === 0 ? 7 : dayDateObj.getDay();
      const dayName = WEEKDAY_NAMES[isoDow - 1];

      // Check if user practiced or streak was updated
      const hasApiActivity = Boolean(apiDay && (apiDay.is_active || apiDay.activity_count > 0));
      const isTodayPracticed = isToday && Boolean(data?.practiced_today || (user as { practiced_today?: boolean })?.practiced_today);
      const isActive = hasApiActivity || isTodayPracticed;

      const activityCount = apiDay?.activity_count || (isActive ? 1 : 0);

      // Status
      let status: ActivityDay['status'] = 'future';
      if (isToday) {
        status = isActive ? 'today_completed' : 'today_pending';
      } else if (isFuture) {
        status = 'future';
      } else {
        status = isActive ? 'completed' : 'missed';
      }

      // Heatmap level: 0 (blank), 1 (light green), 2 (medium green), 3 (intense green)
      let activityLevel: 0 | 1 | 2 | 3 = 0;
      if (isActive) {
        if (activityCount >= 4) activityLevel = 3;
        else if (activityCount >= 2) activityLevel = 2;
        else activityLevel = 1;
      }

      list.push({
        date: dateStr,
        day_number: dayNum,
        day_name: dayName,
        iso_dow: isoDow,
        is_today: isToday,
        is_future: isFuture,
        is_active: isActive,
        activity_count: activityCount,
        activity_level: activityLevel,
        status,
        details: apiDay?.details || {
          lessons: 0,
          quizzes: 0,
          exercises: 0,
          assignments: 0,
          projects: 0,
          college_assignments: 0,
          xp_earned: 0,
        },
      });
    }

    return list;
  }, [currentYear, currentMonth, monthInfo.daysInMonth, data, user]);

  const activeDaysWorkedCount = useMemo(() => {
    return calendarDays.filter((d) => d.is_active).length;
  }, [calendarDays]);

  return (
    <div
      className={cn(
        'w-full rounded-2xl border border-slate-200/80 bg-white transition-all shadow-xs overflow-hidden',
        compact ? 'p-2.5 sm:p-3 space-y-2.5' : 'p-3.5 sm:p-5 md:p-6 space-y-3 sm:space-y-4',
        className
      )}
    >
      {/* ── Top Header with Month Navigator & Quick Metrics ── */}
      <div
        className={cn(
          'pb-2.5 sm:pb-3 border-b border-slate-100 flex flex-col',
          compact ? 'gap-2' : 'gap-2.5 sm:gap-3'
        )}
      >
        {/* Row 1: Month Title & Stepper Navigation */}
        <div className="flex items-center justify-between w-full gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <div
              className={cn(
                'rounded-xl flex items-center justify-center font-bold text-emerald-600 bg-emerald-50 border border-emerald-100 shrink-0',
                compact ? 'w-7 h-7' : 'w-8 h-8 sm:w-9 sm:h-9'
              )}
            >
              <CalendarIcon className={cn(compact ? 'w-3.5 h-3.5' : 'w-4 h-4 sm:w-5 sm:h-5')} />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <h3
                  className={cn(
                    'font-black text-slate-900 tracking-tight leading-tight truncate',
                    compact ? 'text-xs sm:text-sm' : 'text-sm sm:text-base md:text-lg'
                  )}
                >
                  {monthInfo.monthName}
                </h3>
                {loading && (
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping shrink-0" />
                )}
              </div>
              {!compact && (
                <p className="text-[10px] sm:text-[11px] text-slate-400 font-medium hidden xs:block">
                  Live learning consistency & habit calendar
                </p>
              )}
            </div>
          </div>

          {/* Month Stepper Buttons */}
          <div className="flex items-center gap-0.5 bg-slate-100/80 p-0.5 rounded-lg border border-slate-200/60 shrink-0">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={handlePrevMonth}
              className="h-6.5 w-6.5 sm:h-7 sm:w-7 rounded-md hover:bg-white text-slate-600 cursor-pointer"
              title="Previous Month"
            >
              <ChevronLeft className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={handleNextMonth}
              disabled={isCurrentOrFuture}
              className={cn(
                'h-6.5 w-6.5 sm:h-7 sm:w-7 rounded-md text-slate-600 cursor-pointer',
                isCurrentOrFuture
                  ? 'opacity-30 cursor-not-allowed'
                  : 'hover:bg-white'
              )}
              title="Next Month"
            >
              <ChevronRight className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            </Button>
          </div>
        </div>

        {/* Row 2: Metrics Badges - Perfectly Side-by-Side */}
        <div className="flex items-center gap-2 w-full">
          <div className="flex-1 flex items-center justify-center gap-1.5 py-1 px-2.5 rounded-lg bg-emerald-50/90 border border-emerald-200 text-emerald-800 text-[10px] sm:text-[11px] font-bold shadow-2xs select-none">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse shrink-0" />
            <span className="truncate">{activeDaysWorkedCount} Days Worked</span>
          </div>

          <div className="flex-1 flex items-center justify-center gap-1.5 py-1 px-2.5 rounded-lg bg-amber-50/90 border border-amber-200 text-amber-800 text-[10px] sm:text-[11px] font-bold shadow-2xs select-none">
            <Zap className="w-3 h-3 fill-amber-500 text-amber-500 shrink-0" />
            <span className="truncate">+{data?.total_xp_earned ?? 0} XP</span>
          </div>

          {!compact && data?.monthly_consistency_pct !== undefined && (
            <div className="hidden sm:flex flex-1 items-center justify-center gap-1.5 py-1 px-2.5 rounded-lg bg-indigo-50/90 border border-indigo-200 text-indigo-700 text-[10px] sm:text-[11px] font-bold shadow-2xs select-none">
              <TrendingUp className="w-3 h-3 text-indigo-600 shrink-0" />
              <span className="truncate">{data.monthly_consistency_pct}% Consistency</span>
            </div>
          )}
        </div>
      </div>

      {/* ── 7-Day Weekday Labels Header ── */}
      <div className="grid grid-cols-7 gap-1 sm:gap-1.5 text-center">
        {WEEKDAY_NAMES.map((name) => (
          <span
            key={name}
            className="text-[10px] sm:text-xs font-bold uppercase tracking-wider text-slate-400 py-0.5 sm:py-1"
          >
            <span className="sm:hidden">{name.charAt(0)}</span>
            <span className="hidden sm:inline">{compact ? name.charAt(0) : name}</span>
          </span>
        ))}
      </div>

      {/* ── Calendar Tiles Grid (Live dates 1..daysInMonth) ── */}
      <div className="relative">
        <div className="grid grid-cols-7 gap-1 sm:gap-1.5">
          {/* Empty alignment padding slots before the 1st of the month */}
          {Array.from({ length: monthInfo.paddingCount }).map((_, idx) => (
            <div
              key={`empty-${idx}`}
              className={cn(
                'rounded-lg sm:rounded-xl border border-transparent',
                compact ? 'h-7 sm:h-8' : 'h-8 xs:h-9 sm:h-11 md:h-12'
              )}
            />
          ))}

          {/* Actual Live Calendar Days */}
          {calendarDays.map((day) => {
            const isCompleted = day.is_active;
            const isTodayPending = day.status === 'today_pending';
            const isTodayCompleted = day.status === 'today_completed';
            const isFuture = day.status === 'future';
            const level = day.activity_level;

            return (
              <div
                key={day.date}
                onMouseEnter={() => setHoveredDay(day)}
                onMouseLeave={() => setHoveredDay(null)}
                onClick={() => onSelectDay?.(day)}
                className={cn(
                  'group relative rounded-lg sm:rounded-xl flex flex-col items-center justify-center transition-all duration-150 cursor-pointer select-none',
                  compact ? 'h-7 sm:h-8' : 'h-8 xs:h-9 sm:h-11 md:h-12',
                  // 1) Active Days: Marked in Vibrant Green
                  isCompleted
                    ? level === 3
                      ? 'bg-emerald-600 text-white font-extrabold shadow-xs shadow-emerald-600/30 hover:bg-emerald-700'
                      : 'bg-emerald-500 text-white font-bold shadow-xs hover:bg-emerald-600'
                    // 2) Today Pending: Dashed Amber border to prompt practice
                    : isTodayPending
                    ? 'border-2 border-dashed border-amber-500 bg-amber-50/80 text-amber-900 font-extrabold shadow-xs hover:bg-amber-100/70 animate-pulse'
                    // 3) Future Days: Muted dashed border
                    : isFuture
                    ? 'bg-slate-50/40 text-slate-300 border border-dashed border-slate-200/50 cursor-default'
                    // 4) Blank / Untouched Days: Clean, neutral blank tile with clearly legible date
                    : 'bg-slate-50 text-slate-600 border border-slate-200/70 hover:bg-slate-100 hover:border-slate-300',
                  // Today Completed Ring
                  isTodayCompleted &&
                    'ring-2 ring-emerald-500 ring-offset-1 sm:ring-offset-2 ring-offset-white font-black'
                )}
              >
                {/* Day Number (1..31) */}
                <span
                  className={cn(
                    'text-[11px] sm:text-xs md:text-sm leading-none font-bold',
                    day.is_today && !isCompleted && 'text-amber-900 font-black',
                    isCompleted && 'text-white'
                  )}
                >
                  {day.day_number}
                </span>

                {/* Micro indicator on Active / Worked Tiles */}
                {isCompleted && (
                  <span className="absolute bottom-0.5 sm:bottom-1 flex items-center justify-center pointer-events-none">
                    <span className="w-1 h-1 sm:w-1.5 sm:h-1.5 rounded-full bg-white opacity-90 shadow-xs" />
                  </span>
                )}

                {/* Micro ping on Today Pending */}
                {isTodayPending && (
                  <span className="absolute -top-0.5 -right-0.5 sm:-top-1 sm:-right-1 w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full bg-amber-500 animate-ping pointer-events-none" />
                )}

                {/* Native Floating Detail Tooltip on Hover */}
                {hoveredDay?.date === day.date && (
                  <div
                    className={cn(
                      'absolute bottom-full mb-2 z-50 pointer-events-none w-44 sm:w-52 p-2 sm:p-2.5 rounded-xl bg-slate-900 text-white text-left shadow-2xl border border-slate-700 animate-in fade-in-50 zoom-in-95',
                      day.iso_dow > 4 ? 'right-0' : day.iso_dow < 3 ? 'left-0' : '-left-12 sm:-left-16'
                    )}
                  >
                    <div className="flex items-center justify-between border-b border-slate-800 pb-1 mb-1">
                      <span className="text-[10px] sm:text-[11px] font-bold text-slate-200">
                        {new Date(day.date).toLocaleDateString('en-US', {
                          weekday: 'short',
                          month: 'short',
                          day: 'numeric',
                        })}
                      </span>
                      {day.is_today && (
                        <span className="text-[8px] sm:text-[9px] font-extrabold text-amber-400 uppercase bg-amber-400/10 px-1.5 py-0.5 rounded-md border border-amber-400/20">
                          Today
                        </span>
                      )}
                    </div>

                    {day.is_active ? (
                      <div className="space-y-1 text-[9px] sm:text-[10px] text-slate-300">
                        <div className="flex items-center justify-between font-bold text-emerald-400">
                          <span className="flex items-center gap-1">
                            <Check className="w-3 h-3" />
                            <span>Day Worked</span>
                          </span>
                          {day.details.xp_earned > 0 && <span>+{day.details.xp_earned} XP</span>}
                        </div>
                        {day.details.lessons > 0 && (
                          <div className="flex items-center justify-between text-slate-400">
                            <span>Lessons read</span>
                            <span className="font-semibold text-white">{day.details.lessons}</span>
                          </div>
                        )}
                        {day.details.exercises > 0 && (
                          <div className="flex items-center justify-between text-slate-400">
                            <span>Exercises completed</span>
                            <span className="font-semibold text-white">{day.details.exercises}</span>
                          </div>
                        )}
                        {day.details.quizzes > 0 && (
                          <div className="flex items-center justify-between text-slate-400">
                            <span>Quizzes passed</span>
                            <span className="font-semibold text-white">{day.details.quizzes}</span>
                          </div>
                        )}
                        {day.details.assignments > 0 && (
                          <div className="flex items-center justify-between text-slate-400">
                            <span>Assignments</span>
                            <span className="font-semibold text-white">{day.details.assignments}</span>
                          </div>
                        )}
                        {day.details.college_assignments > 0 && (
                          <div className="flex items-center justify-between text-slate-400">
                            <span>College submissions</span>
                            <span className="font-semibold text-white">{day.details.college_assignments}</span>
                          </div>
                        )}
                      </div>
                    ) : day.is_today ? (
                      <p className="text-[9px] sm:text-[10px] text-amber-300 font-medium leading-tight">
                        ⚡ Practice today to mark today green!
                      </p>
                    ) : day.is_future ? (
                      <p className="text-[9px] sm:text-[10px] text-slate-400 font-medium">Upcoming learning day</p>
                    ) : (
                      <p className="text-[9px] sm:text-[10px] text-slate-400 font-medium">No activity recorded (Blank)</p>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Footer Legend & Motivation ── */}
      <div className="pt-2 sm:pt-2.5 border-t border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-1.5 sm:gap-2 text-[10px] sm:text-[11px] text-slate-500">
        <div className="flex items-center gap-1 flex-wrap text-center sm:text-left">
          {calendarDays.find((d) => d.is_today)?.is_active ? (
            <span className="inline-flex items-center gap-1 text-emerald-700 font-bold">
              <ShieldCheck className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-emerald-600 shrink-0" />
              <span>Today is green & streak safe.</span>
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 text-amber-700 font-bold">
              <AlertCircle className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-amber-600 animate-bounce shrink-0" />
              <span>Practice today to mark today green!</span>
            </span>
          )}
        </div>

        {/* Activity Intensity Legend with Safe Responsive Labels */}
        <div className="flex items-center gap-2 sm:gap-2.5 font-medium flex-wrap justify-center sm:justify-end">
          <div className="flex items-center gap-1 text-[9px] sm:text-[10px] text-slate-500">
            <span className="w-3 h-3 rounded-xs bg-slate-50 border border-slate-200 shrink-0" />
            <span>
              <span className="sm:hidden">Blank</span>
              <span className="hidden sm:inline">Blank</span>
            </span>
          </div>
          <div className="flex items-center gap-1 text-[9px] sm:text-[10px] text-emerald-700 font-semibold">
            <span className="w-3 h-3 rounded-xs bg-emerald-500 text-white flex items-center justify-center text-[7px] font-bold shrink-0">✓</span>
            <span>
              <span className="sm:hidden">Worked</span>
              <span className="hidden sm:inline">Worked (Green)</span>
            </span>
          </div>
          <div className="flex items-center gap-1 text-[9px] sm:text-[10px] text-amber-700 font-semibold">
            <span className="w-3 h-3 rounded-xs border-2 border-dashed border-amber-500 bg-amber-50 shrink-0" />
            <span>
              <span className="sm:hidden">Today</span>
              <span className="hidden sm:inline">Today Pending</span>
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
