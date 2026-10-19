import React, { useEffect } from 'react';
import {
  X,
  BookOpen,
  Code2,
  HelpCircle,
  FileCheck,
  Rocket,
  Zap,
  Clock,
  AlertTriangle,
  ExternalLink,
} from 'lucide-react';
import type { BatchReportStudent } from './EngagementAnalyticsTabs';

interface StudentCohortProgressDrawerProps {
  student: BatchReportStudent | null;
  isOpen: boolean;
  onClose: () => void;
  onOpenDetailsModal: (studentId: string, studentName: string) => void;
  timeRangeLabel: string;
}

export const StudentCohortProgressDrawer: React.FC<StudentCohortProgressDrawerProps> = ({
  student,
  isOpen,
  onClose,
  onOpenDetailsModal,
  timeRangeLabel,
}) => {
  // Handle ESC key to dismiss and manage body scroll locking
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    if (isOpen) {
      document.body.style.overflow = 'hidden';
      window.addEventListener('keydown', handleKeyDown);
    }
    return () => {
      document.body.style.overflow = 'unset';
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose]);

  if (!isOpen || !student) return null;

  // Level Tier Calculation based on XP earned in period
  const xp = student.weekly_xp_earned || 0;
  const levelTier =
    xp >= 500
      ? { label: 'Level 5 Master', color: 'text-amber-700 bg-amber-50 border-amber-300' }
      : xp >= 300
      ? { label: 'Level 4 Expert', color: 'text-indigo-700 bg-indigo-50 border-indigo-300' }
      : xp >= 150
      ? { label: 'Level 3 Practitioner', color: 'text-emerald-700 bg-emerald-50 border-emerald-300' }
      : xp >= 50
      ? { label: 'Level 2 Explorer', color: 'text-blue-700 bg-blue-50 border-blue-300' }
      : { label: 'Level 1 Apprentice', color: 'text-slate-600 bg-slate-100 border-slate-200' };

  // Discrepancy Detection: High overall progress with zero submissions in this timeframe
  const asgnTotal = student.weekly_assignments_attempted ?? student.weekly_assignments_submitted ?? 0;
  const quizTotal = student.weekly_quizzes_attempted || 0;
  const hasDiscrepancy = student.overall_subject_progress >= 80 && asgnTotal === 0 && quizTotal === 0;

  const initials = student.full_name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((n) => n[0].toUpperCase())
    .join('');

  return (
    <div className="fixed inset-0 z-50 overflow-hidden">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs transition-opacity duration-300"
        onClick={onClose}
        aria-hidden="true"
      />

      <div className="fixed inset-y-0 right-0 max-w-full flex pl-4 sm:pl-10">
        <div className="w-screen max-w-full sm:max-w-md md:max-w-lg lg:max-w-xl bg-white shadow-2xl flex flex-col transform transition-transform duration-300 ease-in-out">
          
          {/* Header */}
          <div className="px-4 sm:px-6 py-4 sm:py-5 border-b border-slate-100 flex items-start justify-between bg-slate-50/70 gap-3">
            <div className="flex items-center gap-3 sm:gap-3.5 min-w-0">
              <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-2xl bg-indigo-600 text-white font-bold flex items-center justify-center text-sm sm:text-base shadow-sm ring-4 ring-indigo-50 shrink-0">
                {initials || 'ST'}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <h2 className="text-sm sm:text-base font-bold text-slate-900 truncate">
                    {student.full_name}
                  </h2>
                  <span
                    className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold border shrink-0 ${
                      student.engagement_status === 'Active'
                        ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                        : 'bg-slate-100 text-slate-500 border-slate-200'
                    }`}
                  >
                    {student.engagement_status}
                  </span>
                </div>
                <p className="text-xs text-slate-500 truncate">{student.email}</p>
                <div className="flex items-center gap-1.5 text-[11px] text-slate-400 mt-0.5 truncate">
                  <span className="font-semibold text-slate-600">
                    {student.college_code || student.college_name}
                  </span>
                  <span>·</span>
                  <span>Batch {student.batch}</span>
                  {student.degree && (
                    <>
                      <span>·</span>
                      <span className="truncate">{student.degree}</span>
                    </>
                  )}
                </div>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 sm:p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer shrink-0"
              title="Close drawer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Drawer Scrollable Body */}
          <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-4 sm:py-5 space-y-4 sm:space-y-6">
            
            {/* Progress & XP Hero Card */}
            <div className="bg-gradient-to-br from-indigo-50/80 via-purple-50/40 to-slate-50 border border-indigo-100/90 rounded-2xl p-4 sm:p-5 shadow-xs">
              <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
                <span className="text-[11px] sm:text-xs font-bold text-slate-600 uppercase tracking-wider">
                  Overall Subject Progress
                </span>
                <span
                  className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] sm:text-xs font-bold border ${levelTier.color}`}
                >
                  <Zap className="w-3 h-3 fill-current shrink-0" />
                  <span>{levelTier.label}</span>
                </span>
              </div>
              
              <div className="flex items-baseline justify-between mb-2 flex-wrap gap-2">
                <div className="flex items-baseline gap-2">
                  <span className="text-2xl sm:text-3xl font-black text-indigo-950">
                    {student.overall_subject_progress}%
                  </span>
                  <span className="text-xs font-medium text-slate-500">
                    {student.overall_subject_progress >= 100
                      ? 'All Modules Completed'
                      : student.overall_subject_progress > 0
                      ? 'In Progress'
                      : 'Not Started'}
                  </span>
                </div>
                <span className="text-xs font-bold text-emerald-700 bg-emerald-50 border border-emerald-200/90 px-2 py-0.5 rounded-lg shrink-0">
                  +{student.weekly_xp_earned} XP in {timeRangeLabel}
                </span>
              </div>

              {/* Progress Bar */}
              <div className="w-full bg-slate-200/80 rounded-full h-2.5 overflow-hidden">
                <div
                  className="bg-indigo-600 h-full rounded-full transition-all duration-500"
                  style={{ width: `${Math.min(100, Math.max(0, student.overall_subject_progress))}%` }}
                />
              </div>

              <div className="mt-3 flex items-center justify-between text-[11px] text-slate-500 pt-1 border-t border-indigo-100/50 flex-wrap gap-1">
                <span className="flex items-center gap-1 text-slate-500">
                  <Clock className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                  <span>Last Active:</span>
                </span>
                <span className="font-semibold text-slate-700">
                  {student.last_active_at
                    ? new Date(student.last_active_at).toLocaleString('en-IN', {
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })
                    : 'No activity recorded'}
                </span>
              </div>
            </div>

            {/* Discrepancy Alert Callout */}
            {hasDiscrepancy && (
              <div className="bg-amber-50 border border-amber-200/90 rounded-2xl p-3.5 sm:p-4 flex items-start gap-3 text-amber-900 shadow-2xs">
                <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                <div className="text-xs">
                  <p className="font-bold text-amber-800">Reading-Only Completion Detected</p>
                  <p className="text-amber-700/90 mt-0.5 leading-relaxed">
                    Student has reached {student.overall_subject_progress}% progress, but has 0 quiz or assignment submissions in this window. Progress is primarily driven by reading lessons.
                  </p>
                </div>
              </div>
            )}

            {/* Breakdown Cards */}
            <div>
              <div className="flex items-center justify-between mb-2.5 sm:mb-3">
                <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                  Itemized Delta Activity
                </h3>
                <span className="text-[11px] text-slate-400 font-medium">{timeRangeLabel}</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 sm:gap-3">
                {/* Lessons */}
                <div className="p-3 sm:p-3.5 bg-slate-50 rounded-xl border border-slate-200/70 hover:bg-slate-100/50 transition-colors">
                  <div className="flex items-center gap-2 text-indigo-600 mb-1.5">
                    <BookOpen className="w-4 h-4 shrink-0" />
                    <span className="text-xs font-bold text-slate-700">Lessons</span>
                  </div>
                  <div className="text-base sm:text-lg font-bold text-slate-900">
                    {student.weekly_lessons_completed}
                    <span className="text-xs font-normal text-slate-500 ml-1">completed</span>
                  </div>
                  <div className="text-[11px] font-semibold text-indigo-600 mt-0.5">
                    +{student.weekly_lessons_xp} XP earned
                  </div>
                </div>

                {/* Exercises */}
                <div className="p-3 sm:p-3.5 bg-slate-50 rounded-xl border border-slate-200/70 hover:bg-slate-100/50 transition-colors">
                  <div className="flex items-center gap-2 text-emerald-600 mb-1.5">
                    <Code2 className="w-4 h-4 shrink-0" />
                    <span className="text-xs font-bold text-slate-700">Coding Exercises</span>
                  </div>
                  <div className="text-base sm:text-lg font-bold text-slate-900">
                    {student.weekly_exercises_passed}
                    <span className="text-xs font-normal text-slate-500 ml-1">passed</span>
                  </div>
                  <div className="text-[11px] font-semibold text-emerald-600 mt-0.5">
                    +{student.weekly_exercises_xp} XP earned
                  </div>
                </div>

                {/* Quizzes */}
                <div className="p-3 sm:p-3.5 bg-slate-50 rounded-xl border border-slate-200/70 hover:bg-slate-100/50 transition-colors">
                  <div className="flex items-center gap-2 text-amber-600 mb-1.5">
                    <HelpCircle className="w-4 h-4 shrink-0" />
                    <span className="text-xs font-bold text-slate-700">Quizzes</span>
                  </div>
                  <div className="text-base sm:text-lg font-bold text-slate-900">
                    {student.weekly_quizzes_passed ?? 0}
                    <span className="text-xs font-normal text-slate-500 ml-1">
                      / {student.weekly_quizzes_attempted} att
                    </span>
                  </div>
                  <div className="text-[11px] font-semibold text-amber-600 mt-0.5">
                    {student.weekly_avg_quiz_score !== null
                      ? `${Math.min(100, Math.max(0, student.weekly_avg_quiz_score))}% avg score`
                      : 'No graded attempts'}
                  </div>
                </div>

                {/* Assignments */}
                <div className="p-3 sm:p-3.5 bg-slate-50 rounded-xl border border-slate-200/70 hover:bg-slate-100/50 transition-colors">
                  <div className="flex items-center gap-2 text-purple-600 mb-1.5">
                    <FileCheck className="w-4 h-4 shrink-0" />
                    <span className="text-xs font-bold text-slate-700">Assignments</span>
                  </div>
                  <div className="text-base sm:text-lg font-bold text-slate-900">
                    {student.weekly_assignments_passed ?? 0}
                    <span className="text-xs font-normal text-slate-500 ml-1">
                      / {asgnTotal} att
                    </span>
                  </div>
                  <div className="text-[11px] font-semibold text-purple-600 mt-0.5">
                    +{student.weekly_assignments_xp} XP earned
                  </div>
                </div>

                {/* Capstone Projects (Full-width on both mobile & desktop) */}
                <div className="col-span-1 sm:col-span-2 p-3.5 bg-slate-50 rounded-xl border border-slate-200/70 hover:bg-slate-100/50 transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                  <div className="flex items-center gap-2.5">
                    <div className="p-2 rounded-lg bg-blue-100 text-blue-600 shrink-0">
                      <Rocket className="w-4 h-4" />
                    </div>
                    <div>
                      <span className="text-xs font-bold text-slate-700 block">Projects & Capstones</span>
                      <span className="text-[11px] text-slate-500">
                        {student.weekly_projects_passed ?? student.weekly_projects_approved ?? 0} approved ·{' '}
                        {student.weekly_projects_attempted ?? student.weekly_projects_submitted ?? 0} submitted
                      </span>
                    </div>
                  </div>
                  <div className="text-left sm:text-right">
                    <span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-bold text-blue-700 bg-blue-50 border border-blue-200">
                      +{student.weekly_projects_xp} XP
                    </span>
                  </div>
                </div>
              </div>
            </div>

          </div>

          {/* Drawer Footer Actions */}
          <div className="p-3.5 sm:p-5 border-t border-slate-100 bg-white flex flex-col sm:flex-row items-center gap-2 sm:gap-3">
            <button
              type="button"
              onClick={onClose}
              className="w-full sm:w-auto px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-xl transition-colors cursor-pointer text-center order-2 sm:order-1"
            >
              Close
            </button>
            <button
              type="button"
              onClick={() => {
                onOpenDetailsModal(student.student_id, student.full_name);
              }}
              className="w-full sm:flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl shadow-xs transition-colors cursor-pointer order-1 sm:order-2"
            >
              <span>View Detailed Progress</span>
              <ExternalLink className="w-3.5 h-3.5 shrink-0" />
            </button>
          </div>

        </div>
      </div>
    </div>
  );
};
