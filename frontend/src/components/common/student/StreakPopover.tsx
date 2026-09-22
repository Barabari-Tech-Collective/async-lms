import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router';
import { Flame, Trophy, ArrowRight, ShieldCheck, AlertCircle, Sparkles } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import apiClient from '@/services/api';
import { useAppSelector } from '@/app/hooks';

interface CalendarDay {
  day: string;
  date: string;
  day_number: number;
  is_today: boolean;
  is_future: boolean;
  is_active: boolean;
  status: 'completed' | 'today_completed' | 'today_pending' | 'missed' | 'future';
}

interface StreakDetails {
  current_streak: number;
  longest_streak: number;
  practiced_today: boolean;
  streak_in_jeopardy: boolean;
  last_activity: string | null;
  weekly_calendar: CalendarDay[];
  motivational_message: string;
}

export const StreakPopover: React.FC = () => {
  const navigate = useNavigate();
  const user = useAppSelector((state) => state.auth.user);

  const [isOpen, setIsOpen] = useState(false);
  const [details, setDetails] = useState<StreakDetails | null>(null);

  // Initial optimistic values from Redux user state
  const currentStreak = details?.current_streak ?? user?.current_streak ?? 0;
  const longestStreak = details?.longest_streak ?? user?.longest_streak ?? currentStreak;
  const practicedToday = details?.practiced_today ?? user?.practiced_today ?? false;
  const streakInJeopardy = details?.streak_in_jeopardy ?? user?.streak_in_jeopardy ?? (currentStreak > 0 && !practicedToday);

  const fetchStreakDetails = useCallback(async () => {
    try {
      const res = await apiClient.get<{ success: boolean; data: StreakDetails }>('/students/streak-details');
      if (res.data?.success && res.data.data) {
        setDetails(res.data.data);
      }
    } catch (err) {
      console.warn('[StreakPopover] Error fetching streak details:', err);
    }
  }, []);

  // Fetch on mount and listen to real-time progress updates
  useEffect(() => {
    fetchStreakDetails();

    const handleProgressUpdate = () => {
      fetchStreakDetails();
    };

    window.addEventListener('course-progress-updated', handleProgressUpdate);
    return () => {
      window.removeEventListener('course-progress-updated', handleProgressUpdate);
    };
  }, [fetchStreakDetails]);

  // When opening dropdown, refresh to ensure latest sync
  const handleOpenChange = (open: boolean) => {
    setIsOpen(open);
    if (open) {
      fetchStreakDetails();
    }
  };

  return (
    <DropdownMenu open={isOpen} onOpenChange={handleOpenChange}>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className={`flex items-center gap-1 sm:gap-1.5 px-2 sm:px-3 py-1 sm:py-1.5 rounded-full text-[10px] sm:text-xs font-bold shrink-0 transition-all duration-200 cursor-pointer select-none focus:outline-none focus:ring-2 focus:ring-orange-400 focus:ring-offset-1 ${
            practicedToday
              ? 'bg-gradient-to-r from-orange-500 via-amber-500 to-orange-500 text-white shadow-sm shadow-orange-500/30 hover:brightness-105 border border-orange-400'
              : streakInJeopardy
              ? 'bg-amber-50 text-amber-800 border border-amber-300 hover:bg-amber-100 shadow-sm animate-pulse'
              : 'bg-slate-100 text-slate-600 border border-slate-200 hover:bg-slate-200'
          }`}
          title={
            practicedToday
              ? `${currentStreak} Day Streak - Practiced Today!`
              : streakInJeopardy
              ? `${currentStreak} Day Streak - Practice today to keep it!`
              : `${currentStreak} Day Streak - Start practicing today!`
          }
        >
          <Flame
            className={`w-3.5 h-3.5 shrink-0 transition-transform duration-300 ${
              practicedToday
                ? 'fill-white text-white drop-shadow scale-110'
                : streakInJeopardy
                ? 'fill-amber-500 text-amber-600 animate-bounce'
                : 'text-slate-400'
            }`}
          />
          <span className="font-extrabold">{currentStreak}</span>
          <span className="hidden sm:inline"> DAY STREAK</span>

          {streakInJeopardy && (
            <span className="relative flex h-2 w-2 ml-0.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500"></span>
            </span>
          )}
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent
        align="end"
        sideOffset={8}
        className="w-[320px] sm:w-[370px] p-0 rounded-2xl shadow-2xl border border-slate-100 bg-white overflow-hidden z-50 animate-in fade-in-50 zoom-in-95"
      >
        {/* Popover Header Card */}
        <div className={`p-5 text-white relative overflow-hidden ${
          practicedToday
            ? 'bg-gradient-to-br from-orange-500 via-amber-500 to-yellow-500'
            : streakInJeopardy
            ? 'bg-gradient-to-br from-amber-600 via-orange-600 to-amber-700'
            : 'bg-gradient-to-br from-slate-800 via-slate-700 to-slate-900'
        }`}>
          {/* Subtle background glow bubbles */}
          <div className="absolute -top-10 -right-10 w-32 h-32 bg-white/10 rounded-full blur-2xl pointer-events-none" />
          <div className="absolute -bottom-10 -left-10 w-32 h-32 bg-black/10 rounded-full blur-2xl pointer-events-none" />

          <div className="relative z-10 flex items-start gap-3.5">
            <div className="w-13 h-13 sm:w-14 sm:h-14 rounded-2xl bg-white/20 backdrop-blur-md border border-white/30 flex items-center justify-center shrink-0 shadow-inner">
              <Flame
                className={`w-7 h-7 sm:w-8 sm:h-8 ${
                  practicedToday || streakInJeopardy
                    ? 'fill-white text-white drop-shadow-md'
                    : 'text-white/70'
                }`}
              />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <h3 className="text-xl sm:text-2xl font-black tracking-tight text-white leading-tight">
                  {currentStreak} {currentStreak === 1 ? 'Day' : 'Days'} Streak!
                </h3>
                {practicedToday && (
                  <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-white/25 text-white backdrop-blur-sm border border-white/20">
                    <ShieldCheck className="w-3 h-3" /> Safe
                  </span>
                )}
                {streakInJeopardy && (
                  <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-900/40 text-amber-100 border border-amber-300/40">
                    <AlertCircle className="w-3 h-3" /> Pending
                  </span>
                )}
              </div>
              <p className="text-xs sm:text-sm text-white/90 mt-1 leading-snug font-medium">
                {details?.motivational_message ||
                  (practicedToday
                    ? "Great work! You've practiced today. Keep it up tomorrow!"
                    : streakInJeopardy
                    ? 'Complete a lesson or exercise today to extend your streak!'
                    : 'Practice today to start your learning streak!')}
              </p>
            </div>
          </div>
        </div>

        {/* 7-Day Weekly Calendar Bar (Mon - Sun) */}
        <div className="p-4 bg-slate-50/70 border-b border-slate-100">
          <div className="flex items-center justify-between mb-3 px-1">
            <span className="text-[11px] font-bold tracking-wider text-slate-500 uppercase">
              Weekly Activity
            </span>
            <span className="text-[11px] font-semibold text-slate-400">
              Mon – Sun
            </span>
          </div>

          <div className="grid grid-cols-7 gap-1.5 sm:gap-2">
            {(details?.weekly_calendar || [
              { day: 'Mon', day_number: 1, status: 'future', is_today: false },
              { day: 'Tue', day_number: 2, status: 'future', is_today: false },
              { day: 'Wed', day_number: 3, status: 'future', is_today: false },
              { day: 'Thu', day_number: 4, status: 'future', is_today: false },
              { day: 'Fri', day_number: 5, status: 'future', is_today: false },
              { day: 'Sat', day_number: 6, status: 'future', is_today: false },
              { day: 'Sun', day_number: 7, status: 'future', is_today: false },
            ]).map((day, idx) => {
              const isToday = day.is_today;
              const isCompleted = day.status === 'completed' || day.status === 'today_completed';
              const isPendingToday = day.status === 'today_pending';
              const isMissed = day.status === 'missed';

              return (
                <div key={idx} className="flex flex-col items-center gap-1">
                  <span className="text-[10px] font-bold text-slate-400 uppercase">
                    {day.day.charAt(0)}
                  </span>
                  <div
                    className={`w-8 h-8 sm:w-9 sm:h-9 rounded-full flex items-center justify-center transition-all duration-200 ${
                      isCompleted
                        ? 'bg-gradient-to-tr from-orange-500 to-amber-500 text-white shadow-sm shadow-orange-500/30'
                        : isPendingToday
                        ? 'border-2 border-dashed border-amber-500 bg-amber-50 text-amber-600 animate-pulse'
                        : isMissed
                        ? 'bg-slate-200 text-slate-400'
                        : 'bg-white border border-slate-200 text-slate-300'
                    }`}
                  >
                    {isCompleted ? (
                      <Flame className="w-4 h-4 fill-white text-white" />
                    ) : isPendingToday ? (
                      <Flame className="w-4 h-4 text-amber-500" />
                    ) : isMissed ? (
                      <span className="text-[11px] font-bold text-slate-400">•</span>
                    ) : (
                      <span className="text-[10px] font-medium text-slate-300">{day.day_number}</span>
                    )}
                  </div>
                  <span
                    className={`text-[9px] font-semibold ${
                      isToday ? 'text-orange-600 font-bold' : 'text-slate-400'
                    }`}
                  >
                    {isToday ? 'Today' : day.day_number}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Personal Best / Highest Streak Showcase */}
        <div className="p-4 space-y-3">
          <div className="bg-gradient-to-r from-purple-50/80 via-indigo-50/80 to-blue-50/80 border border-indigo-100 rounded-xl p-3.5 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-indigo-500 text-white flex items-center justify-center shadow-sm">
                <Trophy className="w-4 h-4" />
              </div>
              <div>
                <span className="text-[11px] font-bold uppercase tracking-wider text-indigo-900 block">
                  Personal Best
                </span>
                <span className="text-xs text-indigo-700/80 font-medium">
                  Highest streak achieved
                </span>
              </div>
            </div>
            <div className="text-right">
              <span className="text-lg font-black text-indigo-950 block">
                {longestStreak} {longestStreak === 1 ? 'Day' : 'Days'}
              </span>
            </div>
          </div>

          {/* Quick Practice CTA */}
          <button
            type="button"
            onClick={() => {
              setIsOpen(false);
              navigate('/dashboard/student/courses');
            }}
            className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white text-xs sm:text-sm font-bold shadow-md shadow-indigo-500/20 transition-all duration-150 cursor-pointer min-h-[42px]"
          >
            <Sparkles className="w-4 h-4" />
            <span>{practicedToday ? 'Continue Learning' : 'Practice Today'}</span>
            <ArrowRight className="w-4 h-4 ml-1" />
          </button>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
