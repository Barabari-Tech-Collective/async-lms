import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router';
import {
  Sparkles,
  CheckCircle2,
  Clock,
  ArrowRight,
  X,
  Brain,
  Code2,
  GraduationCap,
  AlertCircle,
  Zap,
  Trophy,
  Compass,
} from 'lucide-react';

export interface StudentJourney {
  subject_name: string;
  subject_slug: string;
  completed_unit_id?: string;
  completed_unit_title: string;
  completed_unit_topic?: string;
  completed_unit_order?: number;
  current_unit_id?: string;
  current_unit_title: string;
  current_unit_topic?: string;
  current_unit_order?: number;
  current_unit_url: string;
}

export interface ActiveMilestoneItem {
  item_id: string;
  item_type: 'quiz' | 'assignment' | 'college_assignment' | 'capstone';
  title: string;
  description?: string;
  unit_id: string;
  unit_title: string;
  topic_title?: string;
  subject_name: string;
  subject_slug: string;
  completed_lessons_at: string | null;
  due_date: string;
  duration_days?: number;
  hours_left: number;
  days_left: number;
  is_overdue: boolean;
  urgency_level: 'urgent' | 'approaching' | 'relaxed' | 'overdue';
  action_url: string;
  estimated_time?: string;
}

export interface ActiveMilestonesData {
  has_pending_milestones: boolean;
  total_pending: number;
  student_first_name: string;
  journey?: StudentJourney | null;
  milestones: ActiveMilestoneItem[];
}

interface PendingTasksReminderModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSnooze: () => void;
  data: ActiveMilestonesData | null;
}

// Live Countdown Badge that ticks backwards every second
const LiveCountdownBadge: React.FC<{ dueDateStr: string }> = ({ dueDateStr }) => {
  const calculate = () => {
    const target = new Date(dueDateStr).getTime();
    const now = Date.now();
    const diff = target - now;

    if (isNaN(target)) {
      return { isOverdue: false, text: 'Active Deadline', urgency: 'relaxed' };
    }

    if (diff <= 0) {
      const overdueMs = Math.abs(diff);
      const overdueDays = Math.floor(overdueMs / (1000 * 60 * 60 * 24));
      const overdueHours = Math.floor((overdueMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
      const overdueMins = Math.floor((overdueMs % (1000 * 60 * 60)) / (1000 * 60));

      let text = '';
      if (overdueDays > 0) {
        text = `Overdue by ${overdueDays}d ${overdueHours}h`;
      } else if (overdueHours > 0) {
        text = `Overdue by ${overdueHours}h ${overdueMins}m`;
      } else {
        text = `Overdue by ${Math.max(1, overdueMins)}m`;
      }
      return { isOverdue: true, text, urgency: 'overdue' };
    }

    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((diff % (1000 * 60)) / 1000);

    const pad = (n: number) => String(n).padStart(2, '0');
    const countdown =
      days > 0
        ? `${days}d : ${pad(hours)}h : ${pad(minutes)}m : ${pad(seconds)}s`
        : `${pad(hours)}h : ${pad(minutes)}m : ${pad(seconds)}s`;

    const totalHours = diff / (1000 * 60 * 60);
    const urgency = totalHours <= 24 ? 'urgent' : totalHours <= 72 ? 'approaching' : 'relaxed';

    return { isOverdue: false, text: `${countdown} left`, urgency };
  };

  const [state, setState] = useState(calculate);

  useEffect(() => {
    const timer = setInterval(() => {
      setState(calculate());
    }, 1000);
    return () => clearInterval(timer);
  }, [dueDateStr]);

  if (state.isOverdue) {
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-rose-50 text-rose-700 border border-rose-200 animate-pulse">
        <AlertCircle className="w-3.5 h-3.5 text-rose-600 shrink-0" />
        <span className="font-mono">{state.text}</span>
      </span>
    );
  }

  if (state.urgency === 'urgent') {
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-rose-50 text-rose-700 border border-rose-300 shadow-xs animate-pulse">
        <Zap className="w-3.5 h-3.5 text-rose-600 shrink-0" />
        <span className="font-mono tracking-tight">{state.text}</span>
      </span>
    );
  }

  if (state.urgency === 'approaching') {
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-50 text-amber-800 border border-amber-300">
        <Clock className="w-3.5 h-3.5 text-amber-600 shrink-0" />
        <span className="font-mono tracking-tight">{state.text}</span>
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-800 border border-emerald-300">
      <Clock className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
      <span className="font-mono tracking-tight">{state.text}</span>
    </span>
  );
};

export const PendingTasksReminderModal: React.FC<PendingTasksReminderModalProps> = ({
  isOpen,
  onClose,
  onSnooze,
  data,
}) => {
  const navigate = useNavigate();

  if (!isOpen || !data) {
    return null;
  }

  const { student_first_name, milestones = [], journey } = data;

  const handleActionClick = (url: string) => {
    onClose();
    navigate(url);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/65 backdrop-blur-xs animate-in fade-in duration-200">
      <div
        className="relative w-full max-w-2xl bg-white rounded-3xl shadow-2xl border border-slate-100 overflow-hidden flex flex-col max-h-[92vh] animate-in zoom-in-95 duration-200"
        role="dialog"
        aria-modal="true"
        aria-labelledby="milestone-modal-title"
      >
        {/* Decorative Top Gradient Banner */}
        <div className="relative bg-linear-to-r from-indigo-700 via-purple-700 to-indigo-800 px-6 pt-6 pb-6 text-white overflow-hidden shrink-0">
          <div className="absolute -right-8 -top-8 w-40 h-40 bg-white/10 rounded-full blur-xl pointer-events-none" />
          <div className="absolute -left-8 -bottom-8 w-40 h-40 bg-purple-400/20 rounded-full blur-xl pointer-events-none" />

          {/* Close Button */}
          <button
            onClick={onClose}
            className="absolute top-4 right-4 p-1.5 rounded-full bg-white/15 hover:bg-white/25 text-white transition-all focus:outline-none focus:ring-2 focus:ring-white/40 cursor-pointer"
            aria-label="Close modal"
          >
            <X className="w-4 h-4" />
          </button>

          <div className="flex items-center gap-2 mb-1.5">
            <span className="inline-flex items-center justify-center p-1.5 rounded-xl bg-white/15 backdrop-blur-md shadow-xs">
              <Sparkles className="w-4 h-4 text-amber-300 animate-spin-slow" />
            </span>
            <span className="text-xs uppercase tracking-wider font-extrabold text-indigo-100">
              Progress Milestone Tracker
            </span>
          </div>

          <h2
            id="milestone-modal-title"
            className="text-lg sm:text-2xl font-black text-white tracking-tight leading-tight"
          >
            👋 {milestones && milestones.length > 0 ? `Great progress, ${student_first_name}!` : `Welcome back, ${student_first_name}!`}
          </h2>
          <p className="text-xs sm:text-sm text-indigo-100 mt-1 max-w-lg leading-relaxed">
            {journey?.completed_unit_title ? (
              <>
                You completed the reading lessons in{' '}
                <span className="font-bold text-white underline decoration-indigo-300 decoration-2 underline-offset-2">
                  {journey.completed_unit_title}
                </span>
                .{' '}
                {milestones && milestones.length > 0
                  ? 'Complete your milestone tasks to lock in your learnings and unlock your full completion XP! 🚀'
                  : 'All your milestone tasks are completed! Ready to continue your journey into the next unit? 🚀'}
              </>
            ) : (
              <>Keep up your momentum and follow your learning pathway below! 🚀</>
            )}
          </p>

          {/* Pacing Milestone Flow */}
          <div className="mt-4 pt-3 border-t border-white/15 flex items-center justify-between text-[11px] font-medium text-white/90">
            <div className="flex items-center gap-1.5 text-emerald-200 font-semibold">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-300 shrink-0" />
              <span>Lessons Read</span>
            </div>
            <div className="h-0.5 w-4 sm:w-8 bg-white/20 rounded-full" />
            <div className="flex items-center gap-1.5 text-amber-200 font-semibold">
              <Brain className="w-3.5 h-3.5 text-amber-300 shrink-0" />
              <span>Quiz (5d)</span>
            </div>
            <div className="h-0.5 w-4 sm:w-8 bg-white/20 rounded-full" />
            <div className="flex items-center gap-1.5 text-purple-200 font-semibold">
              <Code2 className="w-3.5 h-3.5 text-purple-300 shrink-0" />
              <span>Assignment (10d)</span>
            </div>
            <div className="h-0.5 w-4 sm:w-8 bg-white/20 rounded-full" />
            <div className="flex items-center gap-1.5 text-yellow-200 font-semibold">
              <Trophy className="w-3.5 h-3.5 text-yellow-300 shrink-0" />
              <span>Capstone (15d)</span>
            </div>
          </div>
        </div>

        {/* Scrollable Modal Content */}
        <div className="p-4 sm:p-6 overflow-y-auto custom-scrollbar space-y-4 flex-1">
          {/* Learning Pathway Card (Where You Were vs Where You Are) */}
          {journey && (
            <div className="bg-linear-to-r from-slate-900 via-indigo-950 to-slate-900 text-white rounded-2xl p-4 shadow-md border border-indigo-500/20 relative overflow-hidden">
              <div className="flex items-center justify-between text-[11px] font-bold uppercase tracking-wider text-indigo-300 mb-2.5">
                <span className="flex items-center gap-1.5">
                  <Compass className="w-3.5 h-3.5 text-cyan-400" />
                  Your Learning Pathway · {journey.subject_name}
                </span>
                <span className="text-[10px] text-cyan-300 font-medium">
                  Live Course Progression
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-stretch">
                {/* Previously Completed Unit */}
                <div className="bg-white/5 border border-emerald-500/30 rounded-xl p-3 backdrop-blur-xs flex flex-col justify-between">
                  <div>
                    <div className="flex items-center gap-1.5 text-[11px] font-semibold text-emerald-400 mb-1">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                      <span>Previously Completed Unit</span>
                    </div>
                    <h4 className="text-xs sm:text-sm font-bold text-white leading-snug line-clamp-2">
                      {journey.completed_unit_title}
                    </h4>
                  </div>
                  <p className="text-[10px] text-emerald-200/80 mt-1 font-medium">
                    ✓ All lessons completed
                  </p>
                </div>

                {/* Currently At / Next Up */}
                <div className="bg-indigo-500/15 border border-indigo-400/40 rounded-xl p-3 backdrop-blur-xs flex flex-col justify-between relative group hover:border-cyan-400/60 transition-colors">
                  <div>
                    <div className="flex items-center justify-between gap-1 text-[11px] font-bold text-cyan-300 mb-1">
                      <span className="flex items-center gap-1.5">
                        <Sparkles className="w-3.5 h-3.5 text-cyan-400 animate-pulse" />
                        Currently At / Next Up
                      </span>
                      <span className="px-1.5 py-0.5 rounded bg-cyan-400/20 text-cyan-200 text-[9px] font-bold uppercase tracking-wider">
                        Active
                      </span>
                    </div>
                    <h4 className="text-xs sm:text-sm font-bold text-white leading-snug line-clamp-2">
                      {journey.current_unit_title}
                    </h4>
                  </div>
                  <div className="mt-2 flex items-center justify-between">
                    <span className="text-[10px] text-slate-300 truncate max-w-[130px]">
                      {journey.current_unit_topic || 'Next in syllabus'}
                    </span>
                    <button
                      onClick={() => handleActionClick(journey.current_unit_url)}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-bold bg-cyan-500 hover:bg-cyan-400 text-slate-950 transition-all cursor-pointer shadow-xs"
                    >
                      <span>Continue</span>
                      <ArrowRight className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Milestone Tasks Header */}
          <div className="flex items-center justify-between pt-1">
            <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">
              {milestones.length > 0
                ? `Pending Milestone Tasks (${milestones.length})`
                : 'Milestone Tasks Status'}
            </span>
            {milestones.length > 0 && (
              <span className="text-[11px] text-slate-400 font-medium">
                Live timers running backwards
              </span>
            )}
          </div>

          {/* Milestone Tasks List or All Caught Up State */}
          {milestones.length > 0 ? (
            <div className="space-y-3">
              {milestones.map((item) => (
                <div
                  key={`${item.item_type}-${item.item_id}`}
                  className="group relative bg-slate-50/80 hover:bg-white border border-slate-200/80 hover:border-indigo-300 rounded-2xl p-4 transition-all duration-200 hover:shadow-md"
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex items-start gap-3 min-w-0">
                      <div
                        className={`p-2.5 rounded-xl shrink-0 ${
                          item.item_type === 'quiz'
                            ? 'bg-amber-100/70 text-amber-700'
                            : item.item_type === 'assignment'
                            ? 'bg-purple-100/70 text-purple-700'
                            : item.item_type === 'capstone'
                            ? 'bg-yellow-100/80 text-yellow-700'
                            : 'bg-blue-100/70 text-blue-700'
                        }`}
                      >
                        {item.item_type === 'quiz' ? (
                          <Brain className="w-5 h-5" />
                        ) : item.item_type === 'assignment' ? (
                          <Code2 className="w-5 h-5" />
                        ) : item.item_type === 'capstone' ? (
                          <Trophy className="w-5 h-5 text-amber-600" />
                        ) : (
                          <GraduationCap className="w-5 h-5" />
                        )}
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-md bg-white border border-slate-200 text-slate-600">
                            {item.item_type === 'quiz'
                              ? '5-Day Quiz Milestone'
                              : item.item_type === 'assignment'
                              ? '10-Day Assignment Milestone'
                              : item.item_type === 'capstone'
                              ? '15-Day Capstone Milestone'
                              : 'College Assignment'}
                          </span>
                          {item.subject_name && (
                            <span className="text-[10px] font-medium text-slate-400 truncate max-w-[150px]">
                              {item.subject_name}
                            </span>
                          )}
                        </div>

                        <h3 className="text-sm sm:text-base font-bold text-slate-900 leading-snug group-hover:text-indigo-600 transition-colors">
                          {item.title}
                        </h3>

                        <div className="flex items-center gap-2 text-xs text-slate-500 mt-1.5 flex-wrap">
                          {item.estimated_time && (
                            <span className="text-[11px] font-medium text-slate-400">
                              ⏱️ {item.estimated_time}
                            </span>
                          )}
                          <span>·</span>
                          {/* Dynamic Live Countdown Badge */}
                          <LiveCountdownBadge dueDateStr={item.due_date} />
                        </div>
                      </div>
                    </div>

                    <button
                      onClick={() => handleActionClick(item.action_url)}
                      className={`shrink-0 inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold text-white shadow-xs transition-all cursor-pointer ${
                        item.item_type === 'quiz'
                          ? 'bg-amber-600 hover:bg-amber-700 hover:shadow-amber-200'
                          : item.item_type === 'assignment'
                          ? 'bg-indigo-600 hover:bg-indigo-700 hover:shadow-indigo-200'
                          : item.item_type === 'capstone'
                          ? 'bg-linear-to-r from-amber-600 to-yellow-600 hover:from-amber-700 hover:to-yellow-700 hover:shadow-yellow-200'
                          : 'bg-blue-600 hover:bg-blue-700'
                      }`}
                    >
                      <span>
                        {item.item_type === 'quiz'
                          ? 'Take Quiz Now'
                          : item.item_type === 'assignment'
                          ? 'Work on Assignment'
                          : item.item_type === 'capstone'
                          ? 'Start Capstone'
                          : 'Submit Now'}
                      </span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="bg-emerald-50/70 border border-emerald-200/80 rounded-2xl p-5 text-center flex flex-col items-center justify-center gap-2.5 shadow-xs">
              <div className="w-12 h-12 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center shadow-xs">
                <CheckCircle2 className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-sm sm:text-base font-bold text-slate-900">
                  All Milestone Tasks Up To Date!
                </h3>
                <p className="text-xs text-slate-600 mt-1 max-w-md leading-relaxed">
                  You have no pending assignments or quizzes for this unit right now. Keep up the great pace and dive into your next unit!
                </p>
              </div>
              {journey?.current_unit_url && (
                <button
                  onClick={() => handleActionClick(journey.current_unit_url)}
                  className="mt-1 inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 shadow-sm transition-all cursor-pointer"
                >
                  <span>Continue to {journey.current_unit_title || 'Next Unit'}</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          )}

          {/* Motivational Pacing Tip */}
          <div className="p-3 bg-amber-50/80 border border-amber-200/70 rounded-xl text-[11px] text-amber-900 flex items-start gap-2">
            <span className="text-base leading-none">💡</span>
            <p>
              <span className="font-semibold">Milestone Pacing:</span> Completing quizzes within 5 days, assignments within 10 days, and capstones within 15 days ensures maximum concept mastery and unlocks your course completion credentials!
            </p>
          </div>
        </div>

        {/* Modal Footer with Snooze & Later Options */}
        <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-2.5 text-xs shrink-0">
          <button
            onClick={onSnooze}
            className="text-slate-500 hover:text-slate-800 font-medium flex items-center gap-1.5 py-1 px-2 rounded-lg hover:bg-slate-200/50 transition-colors cursor-pointer"
          >
            <Clock className="w-3.5 h-3.5 text-slate-400" />
            Remind me tomorrow
          </button>

          <button
            onClick={onClose}
            className="w-full sm:w-auto px-5 py-2 bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 font-bold rounded-xl shadow-xs transition-all cursor-pointer"
          >
            I'll do this later
          </button>
        </div>
      </div>
    </div>
  );
};

export default PendingTasksReminderModal;
