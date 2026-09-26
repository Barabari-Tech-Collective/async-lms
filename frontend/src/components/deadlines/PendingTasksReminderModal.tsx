import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router';
import {
  Check,
  Clock,
  ArrowRight,
  X,
  Brain,
  Code2,
  GraduationCap,
  AlertCircle,
  Zap,
  Trophy,
  Star,
} from 'lucide-react';
import Logo from '@/components/common/Logo';
import { LearningPathwayDiagram } from './LearningPathwayDiagram';

export interface StudentJourney {
  subject_name: string;
  subject_slug: string;
  completed_unit_id?: string;
  completed_unit_title: string;
  completed_unit_topic?: string;
  completed_unit_order?: number;
  completed_unit_xp?: number;
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
      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-rose-50 text-rose-700 border border-rose-200">
        <AlertCircle className="w-3.5 h-3.5 text-rose-600 shrink-0" />
        <span>{state.text}</span>
      </span>
    );
  }

  if (state.urgency === 'urgent') {
    return (
      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-rose-50 text-rose-700 border border-rose-300 animate-pulse">
        <Zap className="w-3.5 h-3.5 text-rose-600 shrink-0" />
        <span>{state.text}</span>
      </span>
    );
  }

  if (state.urgency === 'approaching') {
    return (
      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-amber-50 text-amber-800 border border-amber-300">
        <Clock className="w-3.5 h-3.5 text-amber-600 shrink-0" />
        <span>{state.text}</span>
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200">
      <Clock className="w-3.5 h-3.5 text-blue-600 shrink-0" />
      <span>{state.text}</span>
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div
        className="relative w-full max-w-lg md:max-w-xl bg-white rounded-3xl shadow-2xl border border-slate-100 overflow-hidden flex flex-col max-h-[92vh] animate-in zoom-in-95 duration-200"
        role="dialog"
        aria-modal="true"
        aria-labelledby="milestone-modal-title"
      >
        {/* Top Decorative Gradient Line */}
        <div className="h-1.5 w-full bg-gradient-to-r from-blue-500 via-indigo-500 to-cyan-400 shrink-0" />

        {/* Scrollable Modal Content (hidden scrollbar, fully scrollable) */}
        <div className="p-4 sm:p-6 overflow-y-auto no-scrollbar [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden flex-1 space-y-4">
          {/* Header Row: Badges & Close Button */}
          <div className="flex items-start justify-between gap-2">
            <div className="space-y-1.5">
              <div>
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full border border-blue-200 bg-blue-50/70 text-blue-600 text-[10px] sm:text-[11px] font-bold tracking-wider uppercase shadow-2xs">
                  <Star className="w-3.5 h-3.5 fill-blue-500/20 text-blue-600" />
                  PROGRESS MILESTONE TRACKER
                </span>
              </div>
              <div>
                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full border border-slate-200 bg-slate-50 text-slate-700 text-xs font-semibold shadow-2xs">
                  <Logo iconOnly className="h-3.5 w-3.5 rounded-xs" />
                  <span className="font-bold text-slate-800 tracking-tight text-xs">CodeGuru</span>
                </span>
              </div>
            </div>

            <button
              onClick={onClose}
              className="p-1 rounded-full text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
              aria-label="Close modal"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Greeting & XP */}
          <div className="space-y-1.5">
            <h2
              id="milestone-modal-title"
              className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight leading-tight flex flex-wrap items-center gap-1.5"
            >
              <span>👋 Great progress,</span>
              {student_first_name && (
                <span className="text-slate-900">{student_first_name}!</span>
              )}
            </h2>

            {journey?.completed_unit_xp != null && journey.completed_unit_xp > 0 && (
              <div>
                <div className="inline-flex items-center gap-1.5 px-3 py-0.5 rounded-full border border-amber-300 bg-linear-to-r from-amber-50 to-orange-50 text-amber-800 text-xs font-bold shadow-2xs">
                  <span className="text-amber-500">⭐</span>
                  <span className="font-extrabold text-amber-700">+{journey.completed_unit_xp} XP</span>
                  <span className="text-amber-600 font-medium">Unlocked</span>
                </div>
              </div>
            )}

            <p className="text-xs sm:text-sm text-slate-600 leading-relaxed pt-1">
              {journey?.completed_unit_title ? (
                <>
                  You completed the reading lessons in{' '}
                  <strong className="text-slate-900 font-bold">
                    {journey.completed_unit_title}
                  </strong>
                  .{' '}
                  {milestones.length > 0
                    ? 'Complete your milestone tasks to lock in your learnings and unlock your full completion XP! 🚀'
                    : 'All your milestone tasks are completed! Ready to continue your journey into the next unit? 🚀'}
                </>
              ) : (
                <>
                  You completed your recent reading lessons. Complete your milestone tasks to lock in your learnings and unlock your full completion XP! 🚀
                </>
              )}
            </p>
          </div>


          {/* Gamified Cosmic Learning Pathway Diagram */}
          {journey && (
            <LearningPathwayDiagram
              journey={journey}
              onContinue={(url) => handleActionClick(url)}
            />
          )}

          {/* Pending Milestone Tasks Header */}
          <div className="flex items-center justify-between pt-1">
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                PENDING MILESTONE TASKS
              </span>
              <span className="w-5 h-5 rounded-full bg-blue-100 text-blue-700 text-xs font-bold flex items-center justify-center">
                {milestones.length}
              </span>
            </div>

            {milestones.length > 0 && (
              <div className="flex items-center gap-1.5 text-xs font-semibold text-amber-700">
                <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
                <span>Live timer running</span>
              </div>
            )}
          </div>

          {/* Milestone Tasks Cards */}
          {milestones.length > 0 ? (
            <div className="space-y-3">
              {milestones.map((item) => {
                const milestoneLabel =
                  item.item_type === 'quiz'
                    ? '5-DAY QUIZ MILESTONE'
                    : item.item_type === 'assignment'
                    ? '10-DAY ASSIGNMENT MILESTONE'
                    : item.item_type === 'capstone'
                    ? '15-DAY CAPSTONE MILESTONE'
                    : 'COLLEGE ASSIGNMENT';

                const actionButtonText =
                  item.item_type === 'quiz'
                    ? 'Take Quiz Now'
                    : item.item_type === 'assignment'
                    ? 'Work on Assignment'
                    : item.item_type === 'capstone'
                    ? 'Start Capstone'
                    : 'Submit Now';

                return (
                  <div
                    key={`${item.item_type}-${item.item_id}`}
                    className="p-4 rounded-2xl bg-white border border-blue-200/90 shadow-xs relative"
                  >
                    {/* Header info */}
                    <div className="flex items-start gap-3">
                      <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-xl bg-blue-600 text-white flex items-center justify-center shrink-0 shadow-xs">
                        {item.item_type === 'quiz' ? (
                          <Brain className="w-5 h-5" />
                        ) : item.item_type === 'assignment' ? (
                          <Code2 className="w-5 h-5" />
                        ) : item.item_type === 'capstone' ? (
                          <Trophy className="w-5 h-5" />
                        ) : (
                          <GraduationCap className="w-5 h-5" />
                        )}
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md bg-blue-50 text-blue-700 border border-blue-200">
                            {milestoneLabel}
                          </span>
                          {item.subject_name && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(item.subject_name) && (
                            <span className="text-xs font-medium text-slate-500 truncate max-w-[150px] sm:max-w-[200px]">
                              {item.subject_name}
                            </span>
                          )}
                        </div>

                        <h3 className="text-sm sm:text-base font-bold text-slate-900 leading-snug">
                          {item.title}
                        </h3>

                        <div className="flex items-center gap-2 text-xs text-slate-500 mt-1 flex-wrap">
                          <span className="flex items-center gap-1 text-slate-500">
                            <Clock className="w-3.5 h-3.5 text-slate-400" />
                            <span>Hands-on Submission</span>
                          </span>
                          <span>•</span>
                          <span className="flex items-center gap-1 text-blue-600 font-medium">
                            <Zap className="w-3.5 h-3.5 fill-blue-600 text-blue-600" />
                            <span>AI Graded</span>
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Due Countdown & XP Row */}
                    <div className="flex items-center justify-between mt-3 pt-3 border-t border-slate-100 flex-wrap gap-2">
                      <LiveCountdownBadge dueDateStr={item.due_date} />
                      <span className="text-xs font-semibold text-slate-600">
                        +100 XP upon review
                      </span>
                    </div>

                    {/* Action Button - full width just like Image 1 */}
                    <button
                      onClick={() => handleActionClick(item.action_url)}
                      className="w-full mt-3 py-2.5 sm:py-3 px-4 rounded-xl bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white font-bold text-xs sm:text-sm shadow-md shadow-blue-500/20 flex items-center justify-center gap-2 transition-all cursor-pointer"
                    >
                      <span>{actionButtonText}</span>
                      <ArrowRight className="w-4 h-4" />
                    </button>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="bg-emerald-50/70 border border-emerald-200/80 rounded-2xl p-5 text-center flex flex-col items-center justify-center gap-2.5 shadow-xs">
              <div className="w-12 h-12 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center shadow-xs">
                <Check className="w-6 h-6 stroke-[2.5]" />
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
                  className="mt-1 inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 shadow-sm transition-all cursor-pointer"
                >
                  <span>Continue to {journey.current_unit_title || 'Next Unit'}</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          )}
        </div>

        {/* Modal Footer with Snooze & Later Options */}
        <div className="px-5 py-3.5 bg-slate-50 border-t border-slate-100 flex items-center justify-between text-xs shrink-0">
          <button
            onClick={onSnooze}
            className="text-slate-500 hover:text-slate-800 font-medium flex items-center gap-1.5 py-1 px-2 rounded-lg hover:bg-slate-200/50 transition-colors cursor-pointer"
          >
            <Clock className="w-3.5 h-3.5 text-slate-400" />
            <span>Remind me tomorrow</span>
          </button>

          <button
            onClick={onClose}
            className="px-4 py-2 bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 font-bold rounded-xl shadow-2xs transition-all cursor-pointer"
          >
            I'll do this later
          </button>
        </div>
      </div>
    </div>
  );
};

export default PendingTasksReminderModal;

