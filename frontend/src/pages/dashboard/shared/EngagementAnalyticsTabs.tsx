// Shared engagement analytics tab components used by both FacilitatorAnalytics and admin Analytics.
import { useEffect, useState, useCallback } from 'react';
import {
  Loader2, ListChecks, Search, ArrowUpRight, Users, CheckCircle2, XCircle, Clock, X, ChevronRight,
} from 'lucide-react';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import apiClient from '@/services/api';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer, Cell,
} from 'recharts';
import { StudentDetailsModal } from './StudentDetailsModal';

// ─── Types ────────────────────────────────────────────────────────────────────

export type College = { id: string; name: string };
export type Batch = { id: string; name: string };
export type Subject = { id: string; name: string };
export type Assignment = { id: string; title: string };

export type QuizStudent = {
  id: string;
  name: string;
  email: string;
  college?: string;
  batch?: string;
  status: 'Passed' | 'Failed' | 'Not Attempted';
  score_pct: number | null;
  quizzes_attempted: number;
  attempts_count?: number;
};

type QuizData = {
  enrolled: number; attempted: number; not_attempted: number;
  passed: number; failed: number; avg_score_pct: number;
  score_distribution: { range: string; count: number }[];
  question_analytics?: { question_id: string; question_text: string; correct_pct: number }[];
  question_analytics_total: number;
  total_quizzes?: number;
  students?: QuizStudent[];
};

type AssignmentData = {
  total: number; submitted: number; not_submitted: number; rate: number;
  students: { id: string; name: string; email: string; status: string | null }[];
};

type ProjectData = {
  total: number;
  not_started: number; submitted: number; approved: number;
  students: { id: string; name: string; email: string; status: string }[];
};

type BatchSubject = { id: string; name: string; quiz_completion: number; pass_rate: number; assignment_completion: number; project_completion: number; lesson_completion: number; module_progress: number; };
type BatchDashData = {
  enrolled: number; active_students: number; avg_batch_streak: number; avg_module_progress: number;
  quiz_completion_rate: number; quiz_pass_rate: number;
  assignment_completion_rate: number; project_completion_rate: number;
  subjects: BatchSubject[];
};

type StudentRow = {
  id: string; name: string; email: string;
  last_active_at?: string | null;
  quiz_submitted_count: number; quiz_total_count: number;
  assignment_submitted_count: number; assignment_total_count: number; 
  project_submitted_count: number; project_total_count: number;
};

// ─── Shared primitives ────────────────────────────────────────────────────────

export function StatCard({
  label,
  value,
  sub,
  onClick,
  actionLabel,
  colorScheme = 'default',
}: {
  label: string;
  value: string | number;
  sub?: string;
  onClick?: () => void;
  actionLabel?: string;
  colorScheme?: 'default' | 'rose' | 'emerald' | 'indigo' | 'amber' | 'blue';
}) {
  const isClickable = Boolean(onClick);

  const schemeStyles = {
    default: {
      text: 'text-slate-800',
      btn: 'text-slate-600 bg-slate-100/90 hover:bg-slate-200/80 border-slate-200/70',
      cardHover: 'hover:border-slate-300 hover:shadow-xs',
    },
    rose: {
      text: 'text-rose-600',
      btn: 'text-rose-600 bg-rose-50 hover:bg-rose-100/90 border-rose-200/60',
      cardHover: 'hover:border-rose-300 hover:shadow-rose-50/50 hover:shadow-xs',
    },
    emerald: {
      text: 'text-emerald-600',
      btn: 'text-emerald-600 bg-emerald-50 hover:bg-emerald-100/90 border-emerald-200/60',
      cardHover: 'hover:border-emerald-300 hover:shadow-emerald-50/50 hover:shadow-xs',
    },
    indigo: {
      text: 'text-indigo-600',
      btn: 'text-indigo-600 bg-indigo-50 hover:bg-indigo-100/90 border-indigo-200/60',
      cardHover: 'hover:border-indigo-300 hover:shadow-indigo-50/50 hover:shadow-xs',
    },
    amber: {
      text: 'text-amber-600',
      btn: 'text-amber-600 bg-amber-50 hover:bg-amber-100/90 border-amber-200/60',
      cardHover: 'hover:border-amber-300 hover:shadow-amber-50/50 hover:shadow-xs',
    },
    blue: {
      text: 'text-blue-600',
      btn: 'text-blue-600 bg-blue-50 hover:bg-blue-100/90 border-blue-200/60',
      cardHover: 'hover:border-blue-300 hover:shadow-blue-50/50 hover:shadow-xs',
    },
  }[colorScheme];

  return (
    <div
      onClick={onClick}
      className={`bg-white rounded-xl border border-slate-200 p-1.5 sm:p-3 flex flex-col justify-between h-full w-full transition-all duration-200 min-w-0 ${
        isClickable ? `cursor-pointer group ${schemeStyles.cardHover}` : ''
      }`}
    >
      <div className="flex-1 flex items-end justify-center pb-0.5 sm:pb-1 min-h-[26px] sm:min-h-[32px]">
        <p className="text-[7.5px] sm:text-[9px] text-slate-500 font-bold uppercase tracking-tight text-center leading-tight">
          {label}
        </p>
      </div>
      <div className="text-center">
        <p className={`text-base sm:text-lg xl:text-xl font-bold ${schemeStyles.text}`}>{value}</p>
      </div>
      <div className="min-h-[18px] sm:min-h-[22px] mt-0.5 sm:mt-1 text-center flex items-center justify-center">
        {actionLabel && isClickable ? (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onClick?.();
            }}
            className={`inline-flex items-center gap-1 text-[9px] sm:text-[10px] font-semibold px-1.5 sm:px-2 py-0.5 rounded-md border transition-all ${schemeStyles.btn}`}
          >
            <span>{actionLabel}</span>
            <ArrowUpRight className="w-2.5 h-2.5 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
          </button>
        ) : sub ? (
          <p className="text-[7.5px] sm:text-[8px] text-slate-400 leading-none truncate">{sub}</p>
        ) : null}
      </div>
    </div>
  );
}

export function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    Submitted: 'bg-emerald-50 text-emerald-700 border-emerald-200/60',
    Pending: 'bg-amber-50 text-amber-700 border-amber-200/60',
    Approved: 'bg-blue-50 text-blue-700 border-blue-200/60',
    'Not Started': 'bg-slate-100 text-slate-600 border-slate-200/70',
    'In Progress': 'bg-purple-50 text-purple-700 border-purple-200/60',
    Completed: 'bg-emerald-50 text-emerald-700 border-emerald-200/60',
  };
  return (
    <span className={`px-2.5 py-0.5 rounded-full text-[11px] sm:text-xs font-semibold whitespace-nowrap inline-flex items-center shrink-0 border ${map[status] ?? 'bg-slate-100 text-slate-600 border-slate-200/60'}`}>
      {status}
    </span>
  );
}

export function LoadingState() {
  return (
    <div className="flex items-center justify-center py-20">
      <Loader2 className="w-6 h-6 animate-spin text-indigo-500" />
    </div>
  );
}

export function EmptyState({ message = 'No data available' }: { message?: string }) {
  return (
    <div className="flex items-center justify-center py-16 text-sm text-slate-400">{message}</div>
  );
}

export function RateBar({ value, color = 'bg-indigo-500' }: { value: number; color?: string }) {
  return (
    <div className="flex items-center gap-2 w-full max-w-xs">
      <div className="flex-1 bg-slate-100 rounded-full h-2 min-w-0">
        <div className={`h-2 rounded-full ${color}`} style={{ width: `${Math.min(value, 100)}%` }} />
      </div>
      <span className="text-xs font-semibold text-slate-600 w-9 text-right shrink-0">{value}%</span>
    </div>
  );
}

function getPageNumbers(currentPage: number, totalPages: number) {
  if (totalPages <= 5) {
    return Array.from({ length: totalPages }, (_, i) => i + 1);
  }
  if (currentPage <= 2) {
    return [1, 2, 3, '...', totalPages];
  }
  if (currentPage >= totalPages - 1) {
    return [1, '...', totalPages - 2, totalPages - 1, totalPages];
  }
  return [1, '...', currentPage, '...', totalPages];
}

export function PaginationControls({
  page,
  totalPages,
  onPageChange,
}: {
  page: number;
  totalPages: number;
  onPageChange: (p: number) => void;
}) {
  const pages = getPageNumbers(page, totalPages);

  return (
    <div className="flex flex-wrap items-center justify-center gap-1 sm:gap-1.5 shrink-0">
      <button
        onClick={() => onPageChange(page - 1)}
        disabled={page === 1}
        className="px-2.5 py-1 text-xs font-semibold rounded-lg border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors text-slate-600 min-h-[30px]"
      >
        Prev
      </button>

      {pages.map((p, i) => (
        <button
          key={i}
          onClick={() => typeof p === 'number' && onPageChange(p)}
          disabled={p === '...'}
          className={`min-w-[28px] h-[30px] sm:min-w-[30px] sm:h-[30px] px-1.5 flex items-center justify-center rounded-lg border text-xs transition-colors font-medium ${
            p === page
              ? 'bg-indigo-600 text-white border-indigo-600 font-bold shadow-xs'
              : p === '...'
              ? 'border-transparent text-slate-400 cursor-default'
              : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
          }`}
        >
          {p}
        </button>
      ))}

      <button
        onClick={() => onPageChange(page + 1)}
        disabled={page === totalPages}
        className="px-2.5 py-1 text-xs font-semibold rounded-lg border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors text-slate-600 min-h-[30px]"
      >
        Next
      </button>
    </div>
  );
}

export function Select({
  label, value, onChange, options, placeholder, disabled, className = '',
}: {
  label: string; value: string; onChange: (v: string) => void;
  options: { id: string; name: string }[]; placeholder: string;
  disabled?: boolean; className?: string;
}) {
  return (
    <div className={`flex flex-col gap-1 min-w-0 transition-opacity ${disabled ? 'opacity-40 cursor-not-allowed' : ''} ${className || 'w-full sm:w-auto flex-1 min-w-[120px] sm:min-w-[130px]'}`}>
      <label className="text-[11px] sm:text-xs font-medium text-slate-500 truncate">{label}</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className={`border border-slate-200 bg-white rounded-lg px-2.5 sm:px-3 py-2 text-xs sm:text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-300 w-full sm:min-w-36 min-h-[38px] transition-all truncate ${
          disabled ? 'bg-slate-100/70 text-slate-400 cursor-not-allowed border-slate-200/50' : ''
        }`}
      >
        <option value="">{placeholder}</option>
        {options.map((o) => (
          <option key={o.id} value={o.id}>{o.name}</option>
        ))}
      </select>
    </div>
  );
}

export function formatLastActive(dateStr?: string | null, hasActivity?: boolean): { text: string; isRecent: boolean } {
  if (!dateStr) {
    if (hasActivity) return { text: 'Active in course', isRecent: false };
    return { text: 'Never active', isRecent: false };
  }
  const date = new Date(dateStr);
  const diffMs = Date.now() - date.getTime();
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffHours / 24);
  if (diffHours < 1) return { text: 'Active just now', isRecent: true };
  if (diffHours < 24) return { text: `Active ${diffHours}h ago`, isRecent: true };
  if (diffDays === 1) return { text: 'Active yesterday', isRecent: true };
  if (diffDays <= 7) return { text: `Active ${diffDays}d ago`, isRecent: false };
  if (diffDays <= 30) return { text: `Active ${Math.floor(diffDays / 7)}w ago`, isRecent: false };
  return { text: `Active ${date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`, isRecent: false };
}

export const ACTIVE_OPTIONS = [
  { id: 'overall', name: 'Overall Active' },
  { id: '1', name: 'Active Today (24h)' },
  { id: '2', name: 'Active in Last 2 Days' },
  { id: '3', name: 'Active in Last 3 Days' },
  { id: '7', name: 'Active in Last 7 Days' },
  { id: '30', name: 'Active in Last 30 Days' },
  { id: '365', name: 'Active in Last 1 Year' },
];

export const INACTIVE_OPTIONS = [
  { id: 'never', name: 'Never Active' },
  { id: '1', name: 'Inactive > 1 Day' },
  { id: '2', name: 'Inactive > 2 Days' },
  { id: '3', name: 'Inactive > 3 Days' },
  { id: '7', name: 'Inactive > 7 Days' },
  { id: '30', name: 'Inactive > 30 Days' },
];

const CHART_COLOR = '#4F46E5';
const DIST_COLORS = ['#EF4444', '#F97316', '#EAB308', '#22C55E', '#3B82F6'];

function QuestionAnalyticsTable({ questions }: { questions: { question_id: string; question_text: string; correct_pct: number }[] }) {
  return (
    <div className="w-full divide-y divide-slate-100 min-w-0">
      <div className="hidden sm:grid sm:grid-cols-12 bg-slate-50 text-[11px] sm:text-xs text-slate-500 uppercase font-semibold px-4 sm:px-5 py-3">
        <div className="col-span-8">Question</div>
        <div className="col-span-4">% Students Correct</div>
      </div>
      {questions.map((q) => (
        <div key={q.question_id} className="p-3.5 sm:px-5 sm:py-3 hover:bg-slate-50/60 transition-colors flex flex-col sm:grid sm:grid-cols-12 gap-2 sm:gap-4 sm:items-center">
          <div className="sm:col-span-8 font-medium text-slate-800 text-xs sm:text-sm leading-snug">
            {q.question_text}
          </div>
          <div className="sm:col-span-4 w-full">
            <RateBar
              value={q.correct_pct}
              color={q.correct_pct > 70 ? 'bg-green-500' : q.correct_pct > 40 ? 'bg-amber-500' : 'bg-red-500'}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Quiz Students Drilldown Modal ──────────────────────────────────────────

export type QuizFilterType = 'all' | 'attempted' | 'not_attempted' | 'passed' | 'failed';

export function QuizStudentsModal({
  isOpen,
  onClose,
  initialFilter = 'failed',
  students = [],
  totalQuizzes,
  contextInfo,
  onSelectStudent,
}: {
  isOpen: boolean;
  onClose: () => void;
  initialFilter?: QuizFilterType;
  students?: QuizStudent[];
  totalQuizzes?: number;
  contextInfo?: {
    college?: string;
    batch?: string;
    subject?: string;
    topic?: string;
    quiz?: string;
  };
  onSelectStudent?: (student: { id: string; name: string }) => void;
}) {
  const [activeFilter, setActiveFilter] = useState<QuizFilterType>(initialFilter);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 8;

  useEffect(() => {
    if (isOpen) {
      setActiveFilter(initialFilter);
      setSearch('');
      setPage(1);
    }
  }, [isOpen, initialFilter]);

  const counts = {
    all: students.length,
    passed: students.filter((s) => s.status === 'Passed').length,
    failed: students.filter((s) => s.status === 'Failed').length,
    attempted: students.filter((s) => s.status === 'Passed' || s.status === 'Failed').length,
    not_attempted: students.filter((s) => s.status === 'Not Attempted').length,
  };

  const filteredStudents = students.filter((s) => {
    if (activeFilter === 'passed' && s.status !== 'Passed') return false;
    if (activeFilter === 'failed' && s.status !== 'Failed') return false;
    if (activeFilter === 'attempted' && s.status === 'Not Attempted') return false;
    if (activeFilter === 'not_attempted' && s.status !== 'Not Attempted') return false;

    if (search.trim()) {
      const q = search.toLowerCase();
      const matchName = s.name.toLowerCase().includes(q);
      const matchEmail = s.email.toLowerCase().includes(q);
      const matchCollege = s.college?.toLowerCase().includes(q);
      return matchName || matchEmail || matchCollege;
    }
    return true;
  });

  const totalPages = Math.max(1, Math.ceil(filteredStudents.length / PAGE_SIZE));
  const paginatedStudents = filteredStudents.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const filterTabs: { id: QuizFilterType; label: string; count: number; activeColor: string }[] = [
    { id: 'all', label: 'All Enrolled', count: counts.all, activeColor: 'bg-slate-900 text-white' },
    { id: 'failed', label: 'Failed', count: counts.failed, activeColor: 'bg-rose-600 text-white' },
    { id: 'passed', label: 'Passed', count: counts.passed, activeColor: 'bg-emerald-600 text-white' },
    { id: 'attempted', label: 'Attempted', count: counts.attempted, activeColor: 'bg-indigo-600 text-white' },
    { id: 'not_attempted', label: 'Not Attempted', count: counts.not_attempted, activeColor: 'bg-slate-600 text-white' },
  ];

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        showCloseButton={false}
        className="w-[95vw] sm:max-w-4xl max-h-[90vh] flex flex-col p-0 gap-0 overflow-hidden bg-slate-50 rounded-2xl shadow-2xl border border-slate-200/80"
      >
        {/* Header */}
        <div className="px-4 sm:px-6 py-3.5 sm:py-4 bg-white border-b border-slate-200/80 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3 min-w-0 pr-3">
            <div className="w-9 h-9 rounded-xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600 shrink-0 shadow-xs">
              <Users className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <DialogTitle className="text-sm sm:text-base md:text-lg font-bold text-slate-900 truncate tracking-tight flex items-center gap-2">
                <span>Quiz Students Directory</span>
                <span className="text-xs px-2 py-0.5 bg-slate-100 text-slate-600 rounded-full font-medium">
                  {filteredStudents.length} {filteredStudents.length === 1 ? 'student' : 'students'}
                </span>
              </DialogTitle>
              <p className="text-[11px] text-slate-400 truncate">
                {contextInfo?.quiz ? `Quiz: ${contextInfo.quiz}` : contextInfo?.topic ? `Module: ${contextInfo.topic}` : 'Detailed roster of students and their assessment performance'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 sm:p-2 hover:bg-slate-100 active:bg-slate-200 text-slate-400 hover:text-slate-700 rounded-xl transition-colors shrink-0 min-h-[36px] min-w-[36px] flex items-center justify-center"
            title="Close modal"
          >
            <X className="w-4 h-4 sm:w-5 sm:h-5" />
          </button>
        </div>

        {/* Filter and Search Toolbar */}
        <div className="px-3.5 sm:px-6 py-2.5 sm:py-3 bg-white/80 border-b border-slate-200/60 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5 sm:gap-3 shrink-0">
          {/* Filter Pills */}
          <div className="flex items-center gap-1 sm:gap-1.5 overflow-x-auto no-scrollbar py-0.5 w-full sm:w-auto flex-nowrap shrink-0">
            {filterTabs.map((tab) => {
              const isActive = activeFilter === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => {
                    setActiveFilter(tab.id);
                    setPage(1);
                  }}
                  className={`inline-flex items-center gap-1 sm:gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all shrink-0 ${
                    isActive
                      ? `${tab.activeColor} shadow-xs`
                      : 'bg-slate-100 hover:bg-slate-200/70 text-slate-600'
                  }`}
                >
                  <span>{tab.label}</span>
                  <span
                    className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
                      isActive ? 'bg-white/20 text-white' : 'bg-white text-slate-700 border border-slate-200/60'
                    }`}
                  >
                    {tab.count}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Search Box */}
          <div className="relative w-full sm:w-60 shrink-0">
            <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" />
            <input
              type="text"
              placeholder="Search by name, email..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              className="w-full pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs outline-none focus:bg-white focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all"
            />
            {search && (
              <button
                onClick={() => setSearch('')}
                className="absolute right-2 top-2 text-slate-400 hover:text-slate-600 text-xs"
              >
                ×
              </button>
            )}
          </div>
        </div>

        {/* Modal Body / Table */}
        <div className="flex-1 overflow-y-auto p-3 sm:p-6 no-scrollbar">
          {filteredStudents.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <div className="w-12 h-12 rounded-2xl bg-slate-100 flex items-center justify-center text-slate-400 mb-3">
                <Users className="w-6 h-6" />
              </div>
              <p className="text-sm font-semibold text-slate-700">No students found</p>
              <p className="text-xs text-slate-400 mt-1 max-w-xs">
                {search
                  ? `No students matching "${search}" in the ${activeFilter} category.`
                  : `There are currently 0 students under the ${activeFilter} filter.`}
              </p>
            </div>
          ) : (
            <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
              {/* Mobile Card List (md:hidden) */}
              <div className="divide-y divide-slate-100 md:hidden">
                {paginatedStudents.map((s) => {
                  const initials = s.name
                    ? s.name
                        .split(' ')
                        .map((n) => n[0])
                        .slice(0, 2)
                        .join('')
                        .toUpperCase()
                    : '??';

                  return (
                    <div key={s.id} className="p-3.5 space-y-2.5">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2.5 min-w-0 flex-1">
                          <div className="w-8 h-8 rounded-full bg-slate-100 border border-slate-200 text-slate-700 font-bold text-xs flex items-center justify-center shrink-0">
                            {initials}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="font-bold text-slate-800 text-xs sm:text-sm truncate">
                              {s.name}
                            </p>
                            <p className="text-[11px] text-slate-400 truncate">{s.email}</p>
                          </div>
                        </div>
                        <div className="shrink-0">
                          {s.status === 'Passed' ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200/70">
                              <CheckCircle2 className="w-3 h-3 text-emerald-500" />
                              Passed
                            </span>
                          ) : s.status === 'Failed' ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-rose-50 text-rose-700 border border-rose-200/70">
                              <XCircle className="w-3 h-3 text-rose-500" />
                              Failed
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-slate-100 text-slate-600 border border-slate-200/70">
                              <Clock className="w-3 h-3 text-slate-400" />
                              Not Attempted
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center justify-between gap-2 pt-1 border-t border-slate-50 text-xs">
                        <div className="flex items-center gap-1.5">
                          <span className="text-[11px] text-slate-400 font-medium">Score:</span>
                          {s.score_pct !== null ? (
                            <div className="flex items-center gap-1.5">
                              <div className="w-12 bg-slate-100 rounded-full h-1.5 overflow-hidden">
                                <div
                                  className={`h-full rounded-full ${
                                    s.score_pct >= 60
                                      ? 'bg-emerald-500'
                                      : s.score_pct >= 40
                                      ? 'bg-amber-500'
                                      : 'bg-rose-500'
                                  }`}
                                  style={{ width: `${Math.min(100, Math.max(0, s.score_pct))}%` }}
                                />
                              </div>
                              <span
                                className={`text-xs font-bold ${
                                  s.score_pct >= 60
                                    ? 'text-emerald-700'
                                    : s.score_pct >= 40
                                    ? 'text-amber-700'
                                    : 'text-rose-700'
                                }`}
                              >
                                {s.score_pct}%
                              </span>
                            </div>
                          ) : (
                            <span className="text-slate-400 text-xs italic">No score</span>
                          )}
                        </div>

                        <div className="text-[11px] text-slate-600">
                          {s.quizzes_attempted > 0 ? (
                            <span className="font-semibold px-2 py-0.5 bg-slate-100 rounded-md border border-slate-200/60">
                              {totalQuizzes && totalQuizzes > 1
                                ? `${s.quizzes_attempted}/${totalQuizzes} quizzes`
                                : `${s.quizzes_attempted} quizzes`}
                            </span>
                          ) : (
                            <span className="text-slate-400">0 quizzes</span>
                          )}
                        </div>
                      </div>

                      {onSelectStudent && (
                        <button
                          onClick={() => onSelectStudent({ id: s.id, name: s.name })}
                          className="w-full flex items-center justify-center gap-1 text-xs font-semibold text-indigo-600 hover:text-indigo-700 bg-indigo-50 hover:bg-indigo-100 py-1.5 px-3 rounded-xl border border-indigo-200/50 transition-colors"
                        >
                          <span>View Progress</span>
                          <ChevronRight className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Desktop Table View (hidden md:block) */}
              <div className="hidden md:block overflow-x-auto no-scrollbar">
                <table className="w-full text-xs sm:text-sm text-left">
                  <thead className="bg-slate-50/80 border-b border-slate-100 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                    <tr>
                      <th className="px-4 sm:px-5 py-3 whitespace-nowrap">Student</th>
                      <th className="px-4 sm:px-5 py-3 whitespace-nowrap">Status</th>
                      <th className="px-4 sm:px-5 py-3 whitespace-nowrap">Score</th>
                      <th className="px-4 sm:px-5 py-3 whitespace-nowrap">Quizzes Attempted</th>
                      <th className="px-4 sm:px-5 py-3 whitespace-nowrap text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {paginatedStudents.map((s) => {
                      const initials = s.name
                        ? s.name
                            .split(' ')
                            .map((n) => n[0])
                            .slice(0, 2)
                            .join('')
                            .toUpperCase()
                        : '??';

                      return (
                        <tr key={s.id} className="hover:bg-slate-50/70 transition-colors">
                          <td className="px-4 sm:px-5 py-3 whitespace-nowrap">
                            <div className="flex items-center gap-3">
                              <div className="w-8 h-8 rounded-full bg-slate-100 border border-slate-200 text-slate-700 font-bold text-xs flex items-center justify-center shrink-0">
                                {initials}
                              </div>
                              <div className="min-w-0">
                                <p className="font-semibold text-slate-800 text-xs sm:text-sm truncate">
                                  {s.name}
                                </p>
                                <p className="text-[11px] text-slate-400 truncate">{s.email}</p>
                              </div>
                            </div>
                          </td>
                          <td className="px-4 sm:px-5 py-3 whitespace-nowrap">
                            {s.status === 'Passed' ? (
                              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200/70">
                                <CheckCircle2 className="w-3 h-3 text-emerald-500" />
                                Passed
                              </span>
                            ) : s.status === 'Failed' ? (
                              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-rose-50 text-rose-700 border border-rose-200/70">
                                <XCircle className="w-3 h-3 text-rose-500" />
                                Failed
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-600 border border-slate-200/70">
                                <Clock className="w-3 h-3 text-slate-400" />
                                Not Attempted
                              </span>
                            )}
                          </td>
                          <td className="px-4 sm:px-5 py-3 whitespace-nowrap">
                            {s.score_pct !== null ? (
                              <div className="flex items-center gap-2">
                                <div className="w-16 bg-slate-100 rounded-full h-1.5 overflow-hidden">
                                  <div
                                    className={`h-full rounded-full ${
                                      s.score_pct >= 60
                                        ? 'bg-emerald-500'
                                        : s.score_pct >= 40
                                        ? 'bg-amber-500'
                                        : 'bg-rose-500'
                                    }`}
                                    style={{ width: `${Math.min(100, Math.max(0, s.score_pct))}%` }}
                                  />
                                </div>
                                <span
                                  className={`text-xs font-bold ${
                                    s.score_pct >= 60
                                      ? 'text-emerald-700'
                                      : s.score_pct >= 40
                                      ? 'text-amber-700'
                                      : 'text-rose-700'
                                  }`}
                                >
                                  {s.score_pct}%
                                </span>
                              </div>
                            ) : (
                              <span className="text-xs text-slate-400 italic">No score</span>
                            )}
                          </td>
                          <td className="px-4 sm:px-5 py-3 whitespace-nowrap text-xs text-slate-600">
                            {s.quizzes_attempted > 0 ? (
                              <span className="font-semibold px-2 py-0.5 bg-slate-100 rounded-md border border-slate-200/60">
                                {totalQuizzes && totalQuizzes > 1
                                  ? `${s.quizzes_attempted} / ${totalQuizzes} quizzes`
                                  : `${s.quizzes_attempted} ${s.quizzes_attempted === 1 ? 'quiz' : 'quizzes'}`}
                              </span>
                            ) : (
                              <span className="text-slate-400">0 quizzes</span>
                            )}
                          </td>
                          <td className="px-4 sm:px-5 py-3 whitespace-nowrap text-right">
                            {onSelectStudent && (
                              <button
                                onClick={() => onSelectStudent({ id: s.id, name: s.name })}
                                className="inline-flex items-center gap-1 text-xs font-semibold text-indigo-600 hover:text-indigo-700 bg-indigo-50 hover:bg-indigo-100 px-2.5 py-1 rounded-lg border border-indigo-200/50 transition-colors"
                              >
                                <span>View Progress</span>
                                <ChevronRight className="w-3 h-3" />
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex flex-col sm:flex-row items-center justify-between gap-2.5 px-4 sm:px-5 py-3 border-t border-slate-100 text-xs text-slate-500 bg-slate-50/50">
                  <span>
                    Showing {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, filteredStudents.length)} of {filteredStudents.length} students
                  </span>
                  <PaginationControls page={page} totalPages={totalPages} onPageChange={setPage} />
                </div>
              )}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Tab: Quiz Analytics ──────────────────────────────────────────────────────

const QUIZ_PAGE_SIZE = 10;

export function QuizTab({ colleges, batches, subjects }: { colleges: College[]; batches: Batch[]; subjects: Subject[] }) {
  const [college, setCollege] = useState('');
  const [batch, setBatch] = useState('');
  const [subject, setSubject] = useState('');
  const [topic, setTopic] = useState('');
  const [quiz, setQuiz] = useState('');
  const [topics, setTopics] = useState<{ id: string; name: string }[]>([]);
  const [quizzes, setQuizzes] = useState<{ id: string; name: string }[]>([]);
  const [data, setData] = useState<QuizData | null>(null);
  const [loading, setLoading] = useState(false);
  const [qPage, setQPage] = useState(1);

  const [studentsModalOpen, setStudentsModalOpen] = useState(false);
  const [modalFilter, setModalFilter] = useState<QuizFilterType>('failed');
  const [drilldownStudent, setDrilldownStudent] = useState<{ id: string; name: string } | null>(null);

  const handleOpenStudentsModal = (filter: QuizFilterType) => {
    setModalFilter(filter);
    setStudentsModalOpen(true);
  };

  useEffect(() => {
    if (!subject) { setTopics([]); setTopic(''); return; }
    apiClient.get(`/facilitator/analytics/topics?subject_id=${subject}`)
      .then(r => setTopics(r.data?.data ?? []))
      .catch(() => setTopics([]));
  }, [subject]);

  useEffect(() => {
    if (!topic) { setQuizzes([]); setQuiz(''); return; }
    apiClient.get(`/facilitator/analytics/quizzes?topic_id=${topic}`)
      .then(r => setQuizzes(r.data?.data ?? []))
      .catch(() => setQuizzes([]));
  }, [topic]);

  const load = useCallback(async (p = 1) => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (college) params.set('college_id', college);
      if (batch) params.set('batch', batch);
      if (subject) params.set('subject_id', subject);
      if (topic) params.set('topic_id', topic);
      if (quiz) params.set('quiz_id', quiz);
      params.set('page', String(p));
      params.set('limit', String(QUIZ_PAGE_SIZE));
      const res = await apiClient.get(`/facilitator/analytics/quiz?${params}`);
      setData(res.data.data);
    } catch {
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [college, batch, subject, topic, quiz]);

  const handlePageChange = (p: number) => {
    setQPage(p);
    load(p);
  };

  useEffect(() => { setQPage(1); load(1); }, [load]);

  return (
    <div className="flex flex-col gap-4 sm:gap-6 min-w-0">
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:flex lg:flex-wrap items-end gap-2 sm:gap-2.5 lg:gap-3">
        <Select label="College" value={college} onChange={setCollege} options={colleges} placeholder="All Colleges" />
        <Select label="Batch" value={batch} onChange={setBatch} options={batches} placeholder="All Batches" />
        <Select label="Subject" value={subject} onChange={setSubject} options={subjects} placeholder="All Subjects" />
        <Select label="Module" value={topic} onChange={setTopic} options={topics} placeholder="All Modules" />
        <Select label="Quiz" value={quiz} onChange={setQuiz} options={quizzes} placeholder="All Quizzes" />
      </div>

      {loading ? <LoadingState /> : !data ? <EmptyState /> : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 sm:gap-3">
            <StatCard
              label="Enrolled"
              value={data.enrolled}
              actionLabel="View List"
              colorScheme="blue"
              onClick={() => handleOpenStudentsModal('all')}
            />
            <StatCard
              label="Attempted"
              value={data.attempted}
              actionLabel="View List"
              colorScheme="indigo"
              onClick={() => handleOpenStudentsModal('attempted')}
            />
            <StatCard
              label="Not Attempted"
              value={data.not_attempted}
              actionLabel="View List"
              colorScheme="default"
              onClick={() => handleOpenStudentsModal('not_attempted')}
            />
            <StatCard
              label="Passed"
              value={data.passed}
              actionLabel="View List"
              colorScheme="emerald"
              onClick={() => handleOpenStudentsModal('passed')}
            />
            <StatCard
              label="Failed"
              value={data.failed}
              actionLabel="View List"
              colorScheme="rose"
              onClick={() => handleOpenStudentsModal('failed')}
            />
            <StatCard
              label="Avg Score"
              value={`${data.avg_score_pct}%`}
              colorScheme="amber"
            />
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-5 shadow-xs min-w-0">
            <h3 className="text-xs sm:text-sm font-semibold text-slate-700 mb-4">Score Distribution</h3>
            {data.score_distribution.every((d) => d.count === 0) ? (
              <EmptyState message="No quiz attempts yet" />
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={data.score_distribution} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid stroke="#F1F5F9" vertical={false} />
                  <XAxis dataKey="range" tick={{ fontSize: 11 }} interval={0} />
                  <YAxis tick={{ fontSize: 11 }} allowDecimals={false} width={35} />
                  <Tooltip />
                  <Bar dataKey="count" name="Students" radius={[4, 4, 0, 0]} maxBarSize={45}>
                    {data.score_distribution.map((_, i) => (
                      <Cell key={i} fill={DIST_COLORS[i % DIST_COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-xs min-w-0">
            <div className="px-4 sm:px-5 py-3 border-b border-slate-100 flex items-center gap-2">
              <ListChecks className="w-4 h-4 text-indigo-500" />
              <h3 className="text-xs sm:text-sm font-semibold text-slate-700">Question Analytics</h3>
            </div>
            {data.question_analytics_total === 0 ? (
              <EmptyState message="No quiz attempts yet — question analytics will appear once students submit quizzes" />
            ) : (() => {
              const totalPages = Math.ceil(data.question_analytics_total / QUIZ_PAGE_SIZE);
              return (
                <>
                  <QuestionAnalyticsTable questions={data.question_analytics!} />
                  {totalPages > 1 && (
                    <div className="flex flex-col sm:flex-row items-center justify-between gap-2.5 px-4 sm:px-5 py-3 border-t border-slate-100 text-xs text-slate-500">
                      <span className="text-center sm:text-left">{data.question_analytics_total} questions · page {qPage} of {totalPages}</span>
                      <PaginationControls page={qPage} totalPages={totalPages} onPageChange={handlePageChange} />
                    </div>
                  )}
                </>
              );
            })()}
          </div>

          <QuizStudentsModal
            isOpen={studentsModalOpen}
            onClose={() => setStudentsModalOpen(false)}
            initialFilter={modalFilter}
            students={data?.students || []}
            totalQuizzes={data?.total_quizzes}
            contextInfo={{
              college: colleges.find((c) => c.id === college)?.name,
              batch: batches.find((b) => b.id === batch)?.name,
              subject: subjects.find((s) => s.id === subject)?.name,
              topic: topics.find((t) => t.id === topic)?.name,
              quiz: quizzes.find((q) => q.id === quiz)?.name,
            }}
            onSelectStudent={(student) => {
              setStudentsModalOpen(false);
              setDrilldownStudent(student);
            }}
          />

          {drilldownStudent && (
            <StudentDetailsModal
              isOpen={Boolean(drilldownStudent)}
              onClose={() => {
                setDrilldownStudent(null);
                setStudentsModalOpen(true);
              }}
              studentId={drilldownStudent.id}
              studentName={drilldownStudent.name}
              subjectId={subject}
              mode="quizzes_only"
            />
          )}
        </>
      )}
    </div>
  );
}

// ─── Tab: Assignment Tracker ──────────────────────────────────────────────────

export function AssignmentsTab({ colleges, batches, subjects }: { colleges: College[]; batches: Batch[]; subjects: Subject[] }) {
  const [college, setCollege] = useState('');
  const [batch, setBatch] = useState('');
  const [subject, setSubject] = useState('');
  const [topic, setTopic] = useState('');
  const [assignmentCompound, setAssignmentCompound] = useState(''); // e.g. 'college|123'
  
  const [topics, setTopics] = useState<{ id: string; name: string }[]>([]);
  const [collegeAssignments, setCollegeAssignments] = useState<Assignment[]>([]);
  const [courseAssignments, setCourseAssignments] = useState<{ id: string; name: string }[]>([]);
  
  const [data, setData] = useState<AssignmentData | null>(null);
  const [loading, setLoading] = useState(false);
  const [aPage, setAPage] = useState(1);

  // Fetch topics when subject changes
  useEffect(() => {
    if (!subject) { setTopics([]); setTopic(''); return; }
    apiClient.get(`/facilitator/analytics/topics?subject_id=${subject}`)
      .then(r => setTopics(r.data?.data ?? []))
      .catch(() => setTopics([]));
  }, [subject]);

  // Fetch college assignments when college changes
  useEffect(() => {
    if (!college) { setCollegeAssignments([]); return; }
    apiClient.get(`/college-assignments/facilitator?college_id=${college}`)
      .then((r) => setCollegeAssignments(r.data?.data ?? []))
      .catch(() => setCollegeAssignments([]));
  }, [college]);

  // Fetch course assignments when topic changes
  useEffect(() => {
    if (!topic) { setCourseAssignments([]); return; }
    apiClient.get(`/facilitator/analytics/course-assignments?topic_id=${topic}`)
      .then((r) => setCourseAssignments(r.data?.data ?? []))
      .catch(() => setCourseAssignments([]));
  }, [topic]);

  const load = useCallback(async (p = 1) => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (college) params.set('college_id', college);
      if (batch) params.set('batch', batch);
      if (subject) params.set('subject_id', subject);
      if (topic) params.set('topic_id', topic);
      
      if (assignmentCompound) {
        const [type, id] = assignmentCompound.split('|');
        params.set('assignment_type', type);
        params.set('assignment_id', id);
      }
      
      params.set('page', String(p));
      params.set('limit', '10');
      
      const res = await apiClient.get(`/facilitator/analytics/assignments?${params}`);
      setData(res.data.data);
    } catch {
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [college, batch, subject, topic, assignmentCompound]);

  const handlePageChange = (p: number) => {
    setAPage(p);
    load(p);
  };

  useEffect(() => { setAPage(1); load(1); }, [load]);

  const mergedAssignments = [
    ...collegeAssignments.map(a => ({ id: `college|${a.id}`, name: `[College] ${a.title}` })),
    ...courseAssignments.map(a => ({ id: `course|${a.id}`, name: `[Course] ${a.name}` }))
  ];

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:flex lg:flex-wrap items-end gap-2 sm:gap-2.5 lg:gap-3">
        <Select label="College" value={college} onChange={setCollege} options={colleges} placeholder="All Colleges" />
        <Select label="Batch" value={batch} onChange={setBatch} options={batches} placeholder="All Batches" />
        <Select label="Subject" value={subject} onChange={setSubject} options={subjects} placeholder="All Subjects" />
        <Select label="Module" value={topic} onChange={setTopic} options={topics} placeholder="All Modules" />
        <Select label="Assignment" value={assignmentCompound} onChange={setAssignmentCompound} options={mergedAssignments} placeholder="Select Assignment" />
      </div>

      {loading ? <LoadingState /> : !data ? <EmptyState /> : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 sm:gap-4">
            <StatCard label="Total Students" value={data.total} />
            <StatCard label="Submitted" value={data.submitted} />
            <StatCard label="Not Submitted" value={data.not_submitted} />
            <StatCard label="Submission Rate" value={`${data.rate}%`} />
          </div>
          {!assignmentCompound && (
            <p className="text-xs text-slate-500 -mt-2">
              No specific assignment selected — showing students who submitted at least one assignment (course or college).
            </p>
          )}

          <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-xs min-w-0">
            <div className="px-4 sm:px-5 py-3 border-b border-slate-100">
              <h3 className="text-xs sm:text-sm font-semibold text-slate-700">Student Submissions</h3>
            </div>
            {data.students.length === 0 ? <EmptyState message="No students found" /> : (
              <>
                <div className="overflow-x-auto no-scrollbar w-full min-w-0">
                  <table className="w-full text-xs sm:text-sm">
                    <thead className="bg-slate-50 text-[11px] sm:text-xs text-slate-500 uppercase font-semibold">
                      <tr>
                        <th className="text-left px-3.5 sm:px-5 py-3">Student</th>
                        <th className="text-left px-3.5 sm:px-5 py-3 hidden sm:table-cell">Email</th>
                        <th className="text-right sm:text-left px-3.5 sm:px-5 py-3">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {data.students.map((s) => (
                        <tr key={s.id} className="hover:bg-slate-50/60 transition-colors">
                          <td className="px-3.5 sm:px-5 py-3 font-medium text-slate-800">
                            <p>{s.name}</p>
                            <p className="text-[11px] text-slate-400 sm:hidden font-normal">{s.email}</p>
                          </td>
                          <td className="px-3.5 sm:px-5 py-3 text-slate-500 hidden sm:table-cell">{s.email}</td>
                          <td className="px-3.5 sm:px-5 py-3 text-right sm:text-left"><StatusBadge status={s.status ?? 'Pending'} /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {Math.ceil(data.total / 10) > 1 && (
                  <div className="flex flex-col sm:flex-row items-center justify-between gap-2.5 px-4 sm:px-5 py-3 border-t border-slate-100 text-xs text-slate-500">
                    <span>{data.total} students · page {aPage} of {Math.ceil(data.total / 10)}</span>
                    <PaginationControls page={aPage} totalPages={Math.ceil(data.total / 10)} onPageChange={handlePageChange} />
                  </div>
                )}
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}

// ─── Tab: Project Tracker ─────────────────────────────────────────────────────

export function ProjectsTab({ colleges, batches, subjects }: { colleges: College[]; batches: Batch[]; subjects: Subject[] }) {
  const [college, setCollege] = useState('');
  const [batch, setBatch] = useState('');
  const [subject, setSubject] = useState('');
  const [topic, setTopic] = useState('');
  const [project, setProject] = useState('');

  const [topics, setTopics] = useState<{ id: string; name: string }[]>([]);
  const [projects, setProjects] = useState<{ id: string; name: string }[]>([]);

  const [data, setData] = useState<ProjectData | null>(null);
  const [loading, setLoading] = useState(false);
  const [pPage, setPPage] = useState(1);

  useEffect(() => {
    if (!subject) { setTopics([]); setTopic(''); return; }
    apiClient.get(`/facilitator/analytics/topics?subject_id=${subject}`)
      .then(r => setTopics(r.data?.data ?? []))
      .catch(() => setTopics([]));
  }, [subject]);

  useEffect(() => {
    if (!topic) { setProjects([]); setProject(''); return; }
    apiClient.get(`/facilitator/analytics/module-projects?topic_id=${topic}`)
      .then(r => setProjects(r.data?.data ?? []))
      .catch(() => setProjects([]));
  }, [topic]);

  const load = useCallback(async (p = 1) => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (college) params.set('college_id', college);
      if (batch) params.set('batch', batch);
      if (subject) params.set('subject_id', subject);
      if (topic) params.set('topic_id', topic);
      if (project) params.set('project_id', project);
      params.set('page', String(p));
      params.set('limit', '10');

      const res = await apiClient.get(`/facilitator/analytics/projects?${params}`);
      setData(res.data.data);
    } catch {
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [college, batch, subject, topic, project]);

  const handlePageChange = (p: number) => {
    setPPage(p);
    load(p);
  };

  useEffect(() => { setPPage(1); load(1); }, [load]);

  const chartData = data
    ? [
        { status: 'Not Started', count: data.not_started },
        { status: 'Submitted', count: data.submitted },
        { status: 'Approved', count: data.approved },
      ]
    : [];

  const statusColors: Record<string, string> = {
    'Not Started': '#94A3B8',
    Submitted: '#F59E0B',
    Approved: '#22C55E',
  };

  return (
    <div className="flex flex-col gap-4 sm:gap-6 min-w-0">
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:flex lg:flex-wrap items-end gap-2 sm:gap-2.5 lg:gap-3">
        <Select label="College" value={college} onChange={setCollege} options={colleges} placeholder="All Colleges" />
        <Select label="Batch" value={batch} onChange={setBatch} options={batches} placeholder="All Batches" />
        <Select label="Subject" value={subject} onChange={setSubject} options={subjects} placeholder="All Subjects" />
        <Select label="Module" value={topic} onChange={setTopic} options={topics} placeholder="All Modules" />
        <Select label="Project" value={project} onChange={setProject} options={projects} placeholder="All Projects" />
      </div>

      {loading ? <LoadingState /> : !data ? <EmptyState /> : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 sm:gap-4">
            <StatCard label="Total Students" value={data.total ?? 0} />
            <StatCard label="Not Started" value={data.not_started} />
            <StatCard label="Submitted" value={data.submitted} />
            <StatCard label="Approved" value={data.approved} />
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-5 shadow-xs min-w-0">
            <h3 className="text-xs sm:text-sm font-semibold text-slate-700 mb-4">Project Status Distribution</h3>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid stroke="#F1F5F9" vertical={false} />
                <XAxis dataKey="status" tick={{ fontSize: 11 }} interval={0} />
                <YAxis tick={{ fontSize: 11 }} allowDecimals={false} width={35} />
                <Tooltip />
                <Bar dataKey="count" name="Students" radius={[4, 4, 0, 0]} maxBarSize={55}>
                  {chartData.map((entry) => (
                    <Cell key={entry.status} fill={statusColors[entry.status] ?? CHART_COLOR} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-xs min-w-0">
            <div className="px-4 sm:px-5 py-3 border-b border-slate-100">
              <h3 className="text-xs sm:text-sm font-semibold text-slate-700">Student Project Status</h3>
            </div>
            {data.students.length === 0 ? <EmptyState message="No students found" /> : (
              <>
                <div className="overflow-x-auto no-scrollbar w-full min-w-0">
                  <table className="w-full text-xs sm:text-sm">
                    <thead className="bg-slate-50 text-[11px] sm:text-xs text-slate-500 uppercase font-semibold">
                      <tr>
                        <th className="text-left px-3.5 sm:px-5 py-3">Student</th>
                        <th className="text-left px-3.5 sm:px-5 py-3 hidden sm:table-cell">Email</th>
                        <th className="text-right sm:text-left px-3.5 sm:px-5 py-3">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {data.students.map((s) => (
                        <tr key={s.id} className="hover:bg-slate-50/60 transition-colors">
                          <td className="px-3.5 sm:px-5 py-3 font-medium text-slate-800">
                            <p>{s.name}</p>
                            <p className="text-[11px] text-slate-400 sm:hidden font-normal">{s.email}</p>
                          </td>
                          <td className="px-3.5 sm:px-5 py-3 text-slate-500 hidden sm:table-cell">{s.email}</td>
                          <td className="px-3.5 sm:px-5 py-3 text-right sm:text-left"><StatusBadge status={s.status} /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {Math.ceil((data.total ?? 0) / 10) > 1 && (
                  <div className="flex flex-col sm:flex-row items-center justify-between gap-2.5 px-4 sm:px-5 py-3 border-t border-slate-100 text-xs text-slate-500">
                    <span>{data.total} students · page {pPage} of {Math.ceil((data.total ?? 0) / 10)}</span>
                    <PaginationControls page={pPage} totalPages={Math.ceil((data.total ?? 0) / 10)} onPageChange={handlePageChange} />
                  </div>
                )}
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}

// ─── Tab: Batch Dashboard ─────────────────────────────────────────────────────

export function BatchTab({ colleges, batches, subjects }: { colleges: College[]; batches: Batch[]; subjects: Subject[] }) {
  const [college, setCollege] = useState('');
  const [batch, setBatch] = useState('');
  const [subject, setSubject] = useState('');
  const [topic, setTopic] = useState('');
  const [topics, setTopics] = useState<{ id: string; name: string }[]>([]);
  const [data, setData] = useState<BatchDashData | null>(null);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const pageSize = 5;

  useEffect(() => {
    if (!subject) { setTopics([]); setTopic(''); return; }
    apiClient.get(`/facilitator/analytics/topics?subject_id=${subject}`)
      .then(r => setTopics(r.data?.data ?? []))
      .catch(() => setTopics([]));
  }, [subject]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (college) params.set('college_id', college);
      if (batch) params.set('batch', batch);
      if (subject) params.set('subject_id', subject);
      if (topic) params.set('topic_id', topic);
      const res = await apiClient.get(`/facilitator/analytics/batch?${params}`);
      setData(res.data.data);
    } catch {
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [college, batch, subject, topic]);

  useEffect(() => { setPage(1); load(); }, [load]);

  const totalSubjects = data?.subjects?.length ?? 0;
  const totalPages = Math.ceil(totalSubjects / pageSize);
  const paginatedSubjects = data?.subjects?.slice((page - 1) * pageSize, page * pageSize) ?? [];

  return (
    <div className="flex flex-col gap-4 sm:gap-6 min-w-0">
      <div className="grid grid-cols-2 sm:grid-cols-2 lg:flex lg:flex-wrap items-end gap-2 sm:gap-2.5 lg:gap-3">
        <Select label="College" value={college} onChange={setCollege} options={colleges} placeholder="All Colleges" />
        <Select label="Batch" value={batch} onChange={setBatch} options={batches} placeholder="All Batches" />
        <Select label="Subject" value={subject} onChange={setSubject} options={subjects} placeholder="All Subjects" />
        <Select label="Module" value={topic} onChange={setTopic} options={topics} placeholder="All Modules" />
      </div>

      {loading ? <LoadingState /> : !data ? <EmptyState /> : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2.5 sm:gap-3">
            <StatCard label="Students Enrolled" value={data.enrolled} />
            <StatCard label="Active Students" value={data.active_students} sub="Online & active today" />
            <StatCard label="Avg Batch Streak" value={`${data.avg_batch_streak} days`} />
            <StatCard label="Avg Module Progress" value={`${data.avg_module_progress}%`} />
            <StatCard label="Quiz Completion" value={`${data.quiz_completion_rate}%`} />
            <StatCard label="Quiz Pass Rate" value={`${data.quiz_pass_rate}%`} />
            <StatCard label="Assignment Completion" value={`${data.assignment_completion_rate}%`} />
            <StatCard label="Project Completion" value={`${data.project_completion_rate}%`} />
          </div>

          {totalSubjects > 0 && (
            <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-xs min-w-0">
              <div className="px-4 sm:px-5 py-3 border-b border-slate-100 flex items-center justify-between">
                <h3 className="text-xs sm:text-sm font-semibold text-slate-700">Module-Level Breakdown</h3>
                <span className="text-xs text-slate-400 font-medium">{totalSubjects} modules</span>
              </div>

              {/* Mobile Card View (No horizontal scrollbar) */}
              <div className="divide-y divide-slate-100 md:hidden">
                {paginatedSubjects.map((s) => (
                  <div key={s.id} className="p-4 space-y-3 hover:bg-slate-50/60 transition-colors">
                    <p className="font-bold text-slate-800 text-sm">{s.name}</p>
                    <div className="grid grid-cols-2 gap-2.5 text-xs">
                      <div className="bg-slate-50/80 p-2.5 rounded-xl border border-slate-100">
                        <span className="text-[10px] uppercase font-bold text-slate-400 block mb-1">Quiz Completion</span>
                        <RateBar value={s.quiz_completion} />
                      </div>
                      <div className="bg-slate-50/80 p-2.5 rounded-xl border border-slate-100">
                        <span className="text-[10px] uppercase font-bold text-slate-400 block mb-1">Pass Rate</span>
                        <RateBar value={s.pass_rate} color="bg-green-500" />
                      </div>
                      <div className="bg-slate-50/80 p-2.5 rounded-xl border border-slate-100">
                        <span className="text-[10px] uppercase font-bold text-slate-400 block mb-1">Assignment</span>
                        <RateBar value={s.assignment_completion} color="bg-amber-500" />
                      </div>
                      <div className="bg-slate-50/80 p-2.5 rounded-xl border border-slate-100">
                        <span className="text-[10px] uppercase font-bold text-slate-400 block mb-1">Project</span>
                        <RateBar value={s.project_completion} color="bg-purple-500" />
                      </div>
                      <div className="bg-slate-50/80 p-2.5 rounded-xl border border-slate-100">
                        <span className="text-[10px] uppercase font-bold text-slate-400 block mb-1">Lessons Read</span>
                        <RateBar value={s.lesson_completion} color="bg-blue-500" />
                      </div>
                      <div className="bg-slate-50/80 p-2.5 rounded-xl border border-slate-100">
                        <span className="text-[10px] uppercase font-bold text-slate-400 block mb-1">Avg Progress</span>
                        <RateBar value={s.module_progress} color="bg-indigo-600" />
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Desktop Table View */}
              <div className="hidden md:block overflow-x-auto no-scrollbar w-full min-w-0">
                <table className="w-full text-xs sm:text-sm">
                  <thead className="bg-slate-50 text-[11px] sm:text-xs text-slate-500 uppercase font-semibold">
                    <tr>
                      <th className="text-left px-4 sm:px-5 py-3">Module</th>
                      <th className="text-left px-4 sm:px-5 py-3">Quiz Completion</th>
                      <th className="text-left px-4 sm:px-5 py-3">Pass Rate</th>
                      <th className="text-left px-4 sm:px-5 py-3">Assignment Completion</th>
                      <th className="text-left px-4 sm:px-5 py-3">Project Completion</th>
                      <th className="text-left px-4 sm:px-5 py-3">Lessons Read</th>
                      <th className="text-left px-4 sm:px-5 py-3">Avg Progress</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {paginatedSubjects.map((s) => (
                      <tr key={s.id} className="hover:bg-slate-50/60 transition-colors">
                        <td className="px-4 sm:px-5 py-3 font-medium text-slate-800">{s.name}</td>
                        <td className="px-4 sm:px-5 py-3"><RateBar value={s.quiz_completion} /></td>
                        <td className="px-4 sm:px-5 py-3"><RateBar value={s.pass_rate} color="bg-green-500" /></td>
                        <td className="px-4 sm:px-5 py-3"><RateBar value={s.assignment_completion} color="bg-amber-500" /></td>
                        <td className="px-4 sm:px-5 py-3"><RateBar value={s.project_completion} color="bg-purple-500" /></td>
                        <td className="px-4 sm:px-5 py-3"><RateBar value={s.lesson_completion} color="bg-blue-500" /></td>
                        <td className="px-4 sm:px-5 py-3"><RateBar value={s.module_progress} color="bg-indigo-600" /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {totalPages > 1 && (
                <div className="flex flex-col sm:flex-row items-center justify-between gap-2.5 px-4 sm:px-5 py-3 border-t border-slate-100 text-xs text-slate-500">
                  <span className="text-center sm:text-left">
                    Showing {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, totalSubjects)} of {totalSubjects} modules · page {page} of {totalPages}
                  </span>
                  <PaginationControls page={page} totalPages={totalPages} onPageChange={setPage} />
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ─── Tab: Student Performance ─────────────────────────────────────────────────

const STUDENTS_PAGE_SIZE = 20;

export function StudentsTab({ colleges, batches, subjects }: { colleges: College[]; batches: Batch[]; subjects: Subject[] }) {
  const [college, setCollege] = useState('');
  const [batch, setBatch] = useState('');
  const [subject, setSubject] = useState('');
  const [topic, setTopic] = useState('');
  const [activeFilter, setActiveFilter] = useState('');
  const [inactiveFilter, setInactiveFilter] = useState('');
  const [topics, setTopics] = useState<{ id: string; name: string }[]>([]);
  const [data, setData] = useState<StudentRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [aggregates, setAggregates] = useState({ quizzes_attempted: 0, assignments_submitted: 0, projects_completed: 0 });
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null);
  const [selectedStudentName, setSelectedStudentName] = useState<string>('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchQuery);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  useEffect(() => {
    if (!subject) { setTopics([]); setTopic(''); return; }
    apiClient.get(`/facilitator/analytics/topics?subject_id=${subject}`)
      .then(r => setTopics(r.data?.data ?? []))
      .catch(() => setTopics([]));
  }, [subject]);

  const load = useCallback(async (p = 1) => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (college) params.set('college_id', college);
      if (batch) params.set('batch', batch);
      if (subject) params.set('subject_id', subject);
      if (topic) params.set('topic_id', topic);
      if (activeFilter) params.set('active_filter', activeFilter);
      if (inactiveFilter) params.set('inactive_filter', inactiveFilter);
      if (debouncedSearch) params.set('search', debouncedSearch);
      params.set('page', String(p));
      params.set('limit', String(STUDENTS_PAGE_SIZE));
      const res = await apiClient.get(`/facilitator/analytics/students?${params}`);
      setData(res.data.data ?? []);
      setTotal(res.data.total ?? 0);
      setAggregates(res.data.aggregates ?? { quizzes_attempted: 0, assignments_submitted: 0, projects_completed: 0 });
    } catch {
      setData([]);
      setTotal(0);
      setAggregates({ quizzes_attempted: 0, assignments_submitted: 0, projects_completed: 0 });
    } finally {
      setLoading(false);
    }
  }, [college, batch, subject, topic, activeFilter, inactiveFilter, debouncedSearch]);

  const handlePageChange = (p: number) => { setPage(p); load(p); };

  useEffect(() => { setPage(1); load(1); }, [load]);

  const totalPages = Math.ceil(total / STUDENTS_PAGE_SIZE);

  return (
    <div className="flex flex-col gap-4 sm:gap-6 min-w-0">
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:flex lg:flex-wrap items-end gap-2 sm:gap-2.5 lg:gap-3">
        <Select label="College" value={college} onChange={setCollege} options={colleges} placeholder="All Colleges" />
        <Select label="Batch" value={batch} onChange={setBatch} options={batches} placeholder="All Batches" />
        <Select label="Subject" value={subject} onChange={setSubject} options={subjects} placeholder="All Subjects" />
        <Select label="Module" value={topic} onChange={setTopic} options={topics} placeholder="All Modules" />
        <Select
          label="Active Filter"
          value={activeFilter}
          onChange={(v) => {
            setActiveFilter(v);
            if (v) setInactiveFilter('');
          }}
          options={ACTIVE_OPTIONS}
          placeholder="Select Active"
          disabled={Boolean(inactiveFilter)}
        />
        <Select
          label="Inactive Filter"
          value={inactiveFilter}
          onChange={(v) => {
            setInactiveFilter(v);
            if (v) setActiveFilter('');
          }}
          options={INACTIVE_OPTIONS}
          placeholder="Select Inactive"
          disabled={Boolean(activeFilter)}
        />
        {(activeFilter || inactiveFilter) && (
          <button
            onClick={() => {
              setActiveFilter('');
              setInactiveFilter('');
            }}
            className="col-span-2 sm:col-span-1 lg:col-auto text-xs font-semibold text-rose-600 hover:text-rose-700 bg-rose-50 hover:bg-rose-100 active:bg-rose-200 px-3 py-2 rounded-lg transition-colors min-h-[38px] flex items-center justify-center gap-1.5 shrink-0 border border-rose-200/70"
            title="Reset active/inactive filters"
          >
            <X className="w-3.5 h-3.5" /> Reset Status
          </button>
        )}
      </div>

      <div className="grid grid-cols-3 gap-1.5 sm:gap-3 lg:gap-4">
        <StatCard label="Quizzes Attempted" value={aggregates.quizzes_attempted} sub={`out of ${total} students`} />
        <StatCard label="Assignments Submitted" value={aggregates.assignments_submitted} sub={`out of ${total} students`} />
        <StatCard label="Projects Completed" value={aggregates.projects_completed} sub={`out of ${total} students`} />
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-xs min-w-0">
        <div className="px-4 sm:px-5 py-3 border-b border-slate-100 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5">
          <h3 className="text-xs sm:text-sm font-semibold text-slate-700">Per-Student Performance</h3>
          <div className="relative w-full sm:w-64">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
            <input
              type="text"
              placeholder="Search students..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-8 py-2 bg-white border border-slate-200 rounded-lg text-xs sm:text-sm outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all min-h-[36px]"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-600 text-xs w-4 h-4 flex items-center justify-center rounded-full hover:bg-slate-100"
                title="Clear search"
              >
                ×
              </button>
            )}
          </div>
        </div>
        
        {loading ? (
          <LoadingState />
        ) : total === 0 ? (
          <EmptyState message="No students found" />
        ) : (
          <>
            {/* Mobile Card View */}
            <div className="divide-y divide-slate-100 md:hidden">
              {data.map((s) => (
                <div key={s.id} className="p-3.5 sm:p-4 space-y-2.5 hover:bg-slate-50/60 transition-colors">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="font-bold text-slate-800 text-xs sm:text-sm truncate">{s.name}</p>
                      <p className="text-[11px] text-slate-400 truncate">{s.email}</p>
                      {(() => {
                        const hasActivity = (s.quiz_submitted_count || 0) > 0 || (s.assignment_submitted_count || 0) > 0 || (s.project_submitted_count || 0) > 0;
                        const { text, isRecent } = formatLastActive(s.last_active_at, hasActivity);
                        return (
                          <div className="inline-flex items-center gap-1.5 mt-1 px-2 py-0.5 rounded-md bg-slate-50 border border-slate-200/60 max-w-full">
                            <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${isRecent ? 'bg-emerald-500 animate-pulse' : 'bg-slate-300'}`} />
                            <span className={`text-[10px] font-medium truncate ${isRecent ? 'text-emerald-700 font-semibold' : 'text-slate-500'}`}>{text}</span>
                          </div>
                        );
                      })()}
                    </div>
                    <button
                      onClick={() => {
                        setSelectedStudentId(s.id);
                        setSelectedStudentName(s.name);
                        setIsModalOpen(true);
                      }}
                      className="text-xs font-semibold text-indigo-600 hover:text-indigo-700 bg-indigo-50 hover:bg-indigo-100 px-2.5 py-1 rounded-lg transition-colors min-h-[28px] shrink-0"
                    >
                      Progress
                    </button>
                  </div>

                  <div className="grid grid-cols-3 gap-1.5 text-[11px]">
                    <div className="bg-slate-50/80 p-2 rounded-xl border border-slate-100/80 text-center">
                      <span className="text-[9px] uppercase font-bold text-slate-400 block mb-0.5">Quiz</span>
                      <span className="font-bold text-slate-700">{s.quiz_submitted_count}/{s.quiz_total_count}</span>
                    </div>
                    <div className="bg-slate-50/80 p-2 rounded-xl border border-slate-100/80 text-center">
                      <span className="text-[9px] uppercase font-bold text-slate-400 block mb-0.5">Assignment</span>
                      <span className="font-bold text-slate-700">{s.assignment_submitted_count}/{s.assignment_total_count}</span>
                    </div>
                    <div className="bg-slate-50/80 p-2 rounded-xl border border-slate-100/80 text-center">
                      <span className="text-[9px] uppercase font-bold text-slate-400 block mb-0.5">Project</span>
                      <span className="font-bold text-slate-700">{s.project_submitted_count}/{s.project_total_count}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Desktop Table View */}
            <div className="hidden md:block overflow-x-auto no-scrollbar w-full min-w-0">
              <table className="w-full text-xs sm:text-sm">
                <thead className="bg-slate-50 border-b border-slate-100 text-left text-[11px] sm:text-xs font-semibold text-slate-500 uppercase tracking-wider">
                  <tr>
                    <th className="px-4 sm:px-5 py-3.5 whitespace-nowrap">Student</th>
                    <th className="px-4 sm:px-5 py-3.5 whitespace-nowrap">Quizzes</th>
                    <th className="px-4 sm:px-5 py-3.5 whitespace-nowrap">Assignment</th>
                    <th className="px-4 sm:px-5 py-3.5 whitespace-nowrap">Project</th>
                    <th className="px-4 sm:px-5 py-3.5 text-right whitespace-nowrap"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {data.map((s) => (
                    <tr key={s.id} className="hover:bg-slate-50/60 transition-colors">
                      <td className="px-4 sm:px-5 py-3 whitespace-nowrap">
                        <p className="font-semibold text-slate-800">{s.name}</p>
                        <p className="text-[11px] text-slate-400">{s.email}</p>
                        {(() => {
                          const hasActivity = (s.quiz_submitted_count || 0) > 0 || (s.assignment_submitted_count || 0) > 0 || (s.project_submitted_count || 0) > 0;
                          const { text, isRecent } = formatLastActive(s.last_active_at, hasActivity);
                          return (
                            <div className="flex items-center gap-1.5 mt-0.5">
                              <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${isRecent ? 'bg-emerald-500 animate-pulse' : 'bg-slate-300'}`} />
                              <span className={`text-[10px] font-medium ${isRecent ? 'text-emerald-600 font-semibold' : 'text-slate-400'}`}>{text}</span>
                            </div>
                          );
                        })()}
                      </td>
                      <td className="px-4 sm:px-5 py-3 whitespace-nowrap">
                        <div className="inline-flex items-center gap-2 whitespace-nowrap">
                          <StatusBadge status={
                            s.quiz_submitted_count === 0 ? 'Not Started'
                              : s.quiz_submitted_count >= s.quiz_total_count ? 'Completed'
                              : 'In Progress'
                          } />
                          <span className="text-[11px] text-slate-500 font-semibold px-2 py-0.5 bg-slate-100/90 border border-slate-200/70 rounded-md whitespace-nowrap tracking-tight">
                            {s.quiz_submitted_count}/{s.quiz_total_count}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 sm:px-5 py-3 whitespace-nowrap">
                        <div className="inline-flex items-center gap-2 whitespace-nowrap">
                          <StatusBadge status={
                            s.assignment_submitted_count === 0 ? 'Not Started'
                              : s.assignment_submitted_count >= s.assignment_total_count ? 'Completed'
                              : 'In Progress'
                          } />
                          <span className="text-[11px] text-slate-500 font-semibold px-2 py-0.5 bg-slate-100/90 border border-slate-200/70 rounded-md whitespace-nowrap tracking-tight">
                            {s.assignment_submitted_count}/{s.assignment_total_count}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 sm:px-5 py-3 whitespace-nowrap">
                        <div className="inline-flex items-center gap-2 whitespace-nowrap">
                          <StatusBadge status={
                            s.project_submitted_count === 0 ? 'Not Started'
                              : s.project_submitted_count >= s.project_total_count ? 'Completed'
                              : 'In Progress'
                          } />
                          <span className="text-[11px] text-slate-500 font-semibold px-2 py-0.5 bg-slate-100/90 border border-slate-200/70 rounded-md whitespace-nowrap tracking-tight">
                            {s.project_submitted_count}/{s.project_total_count}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 sm:px-5 py-3 text-right whitespace-nowrap">
                        <button
                          onClick={() => {
                            setSelectedStudentId(s.id);
                            setSelectedStudentName(s.name);
                            setIsModalOpen(true);
                          }}
                          className="text-xs font-semibold text-indigo-600 hover:text-indigo-700 bg-indigo-50 hover:bg-indigo-100 px-3 py-1.5 rounded-lg transition-colors min-h-[30px] whitespace-nowrap"
                        >
                          View Progress
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {totalPages > 1 && (
              <div className="flex flex-col sm:flex-row items-center justify-between gap-2.5 px-4 sm:px-5 py-3 border-t border-slate-100 text-xs text-slate-500">
                <span>{total} students · page {page} of {totalPages}</span>
                <PaginationControls page={page} totalPages={totalPages} onPageChange={handlePageChange} />
              </div>
            )}
          </>
        )}
      </div>

      <StudentDetailsModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        studentId={selectedStudentId}
        studentName={selectedStudentName}
        subjectId={subject || undefined}
      />
    </div>
  );
}
