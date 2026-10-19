import { useEffect, useState, useMemo, useCallback } from 'react';
import {
  X,
  Loader2,
  CheckCircle2,
  XCircle,
  Clock,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  Search,
  FileText,
  FolderGit2,
  Sparkles,
  AlertTriangle,
  Award,
  BookOpen,
  Layers,
  Code2,
  Calendar,
} from 'lucide-react';
import apiClient from '@/services/api';

export type SubmissionItem = {
  id: string;
  title: string;
  item_type: 'curriculum' | 'college' | 'project';
  subject_name?: string;
  topic_title?: string;
  unit_title?: string;
  max_score: number;
  score: number | null;
  status: 'passed' | 'failed' | 'submitted' | 'not_started';
  is_approved?: boolean;
  submitted_at?: string | null;
  submission_link?: string | null;
  evaluation_status?: string | null;
  feedback?: {
    summary?: string;
    strengths?: string[] | string;
    issues?: string[] | string;
    weaknesses?: string[] | string;
    areas_for_improvement?: string[] | string;
    breakdown?: Array<{
      criterion?: string;
      title?: string;
      name?: string;
      score?: number;
      marks?: number;
      awarded?: number;
      max_score?: number;
      max_points?: number;
      max?: number;
      feedback?: string;
      comments?: string;
    }>;
    rubric_breakdown?: Array<{
      criterion?: string;
      title?: string;
      name?: string;
      score?: number;
      marks?: number;
      awarded?: number;
      max_score?: number;
      max_points?: number;
      max?: number;
      feedback?: string;
      comments?: string;
    }>;
    test_results?: Array<{
      name?: string;
      test_name?: string;
      passed?: boolean;
      status?: string;
      expected?: string;
      actual?: string;
      message?: string;
    }>;
    [key: string]: any;
  } | null;
};

type StudentProfile = {
  id: string;
  name: string;
  email: string;
  college_name?: string;
  batch?: string;
  degree?: string;
};

type Metrics = {
  total: number;
  attempted: number;
  passed: number;
  failed: number;
  avg_score_pct: number;
};

interface StudentSubmissionsDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  studentId: string | null;
  studentName?: string;
  studentEmail?: string;
  type: 'assignments' | 'projects';
  subjectId?: string;
  topicId?: string;
}

export function StudentSubmissionsDrawer({
  isOpen,
  onClose,
  studentId,
  studentName,
  studentEmail,
  type,
  subjectId,
  topicId,
}: StudentSubmissionsDrawerProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [student, setStudent] = useState<StudentProfile | null>(null);
  const [metrics, setMetrics] = useState<Metrics>({
    total: 0,
    attempted: 0,
    passed: 0,
    failed: 0,
    avg_score_pct: 0,
  });
  const [items, setItems] = useState<SubmissionItem[]>([]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'attempted' | 'passed' | 'failed' | 'not_started'>('all');
  const [expandedCardId, setExpandedCardId] = useState<string | null>(null);

  // Close on ESC
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Lock body scroll when open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [isOpen]);

  const fetchData = useCallback(async () => {
    if (!studentId) return;
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      params.append('type', type);
      if (subjectId && subjectId !== 'all') params.append('subject_id', subjectId);
      if (topicId && topicId !== 'all') params.append('topic_id', topicId);

      const res = await apiClient.get<{
        success: boolean;
        student: StudentProfile;
        metrics: Metrics;
        items: SubmissionItem[];
      }>(`/facilitator/students/${studentId}/submissions?${params.toString()}`);

      if (res.data.success) {
        setStudent(res.data.student);
        setMetrics(res.data.metrics);
        setItems(res.data.items);
        // Auto-expand first attempted item if available
        const firstAttempted = res.data.items.find((i) => i.status !== 'not_started');
        if (firstAttempted) {
          setExpandedCardId(firstAttempted.id);
        } else if (res.data.items.length > 0) {
          setExpandedCardId(res.data.items[0].id);
        }
      } else {
        setError('Failed to load submissions.');
      }
    } catch (err: any) {
      console.error('Error loading student submissions:', err);
      setError(err?.response?.data?.message || 'Could not fetch submission details.');
    } finally {
      setLoading(false);
    }
  }, [studentId, type, subjectId, topicId]);

  useEffect(() => {
    if (isOpen && studentId) {
      fetchData();
      setSearch('');
      setStatusFilter('all');
    }
  }, [isOpen, studentId, fetchData]);

  const toggleExpand = (id: string) => {
    setExpandedCardId((prev) => (prev === id ? null : id));
  };

  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      // Status filter
      if (statusFilter === 'attempted' && item.status === 'not_started') return false;
      if (statusFilter === 'passed' && item.status !== 'passed') return false;
      if (statusFilter === 'failed' && item.status !== 'failed') return false;
      if (statusFilter === 'not_started' && item.status !== 'not_started') return false;

      // Search filter
      if (search.trim()) {
        const q = search.toLowerCase();
        const titleMatch = item.title.toLowerCase().includes(q);
        const subjectMatch = item.subject_name?.toLowerCase().includes(q) ?? false;
        const topicMatch = item.topic_title?.toLowerCase().includes(q) ?? false;
        if (!titleMatch && !subjectMatch && !topicMatch) return false;
      }

      return true;
    });
  }, [items, statusFilter, search]);

  if (!isOpen) return null;

  const displayName = student?.name || studentName || 'Student Details';
  const displayEmail = student?.email || studentEmail || '';
  const initials = displayName
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((n) => n[0].toUpperCase())
    .join('') || 'ST';

  return (
    <div className="fixed inset-0 z-50 overflow-hidden flex justify-end">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm transition-opacity animate-in fade-in duration-200"
        onClick={onClose}
      />

      {/* Slide-over Drawer Panel */}
      <aside
        role="dialog"
        aria-modal="true"
        aria-label="Student Submissions Details"
        className="relative z-10 w-full sm:w-[580px] md:w-[680px] lg:w-[760px] h-full bg-slate-50 flex flex-col shadow-2xl border-l border-slate-200 animate-in slide-in-from-right duration-300"
      >
        {/* Mobile top pull indicator */}
        <div className="sm:hidden flex justify-center pt-2 pb-0.5 bg-white">
          <div className="w-10 h-1 rounded-full bg-slate-200" />
        </div>

        {/* Drawer Header */}
        <div className="bg-white border-b border-slate-200 px-4 sm:px-6 py-3 sm:py-4 flex-shrink-0">
          <div className="flex items-start justify-between gap-2.5 sm:gap-3">
            <div className="flex items-center gap-2.5 sm:gap-3.5 min-w-0">
              <div className="w-9 h-9 sm:w-11 sm:h-11 rounded-xl bg-gradient-to-br from-indigo-600 to-violet-600 text-white font-bold flex items-center justify-center text-xs sm:text-sm shadow-md shadow-indigo-100 flex-shrink-0">
                {initials}
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
                  <h2 className="text-sm sm:text-lg font-bold text-slate-900 truncate">
                    {displayName}
                  </h2>
                  <span className="px-2 py-0.5 rounded-full text-[10px] sm:text-[11px] font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200/80">
                    {type === 'projects' ? 'Projects' : 'Assignments'}
                  </span>
                </div>
                <p className="text-[11px] sm:text-xs text-slate-500 truncate mt-0.5">
                  {displayEmail}
                  {student?.college_name ? ` · ${student.college_name}` : ''}
                  {student?.batch ? ` · Batch ${student.batch}` : ''}
                </p>
              </div>
            </div>

            <button
              onClick={onClose}
              className="p-1.5 sm:p-2 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors shrink-0"
              aria-label="Close drawer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* KPI Summary Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-2.5 mt-3 sm:mt-4">
            <div className="bg-slate-50 rounded-xl p-2 sm:p-2.5 border border-slate-200/80 flex flex-col">
              <span className="text-[10px] sm:text-[11px] font-medium text-slate-500">Attempted</span>
              <div className="flex items-baseline gap-1 mt-0.5">
                <span className="text-sm sm:text-base font-bold text-slate-800">
                  {metrics.attempted}
                </span>
                <span className="text-[11px] sm:text-xs text-slate-400">/ {metrics.total}</span>
              </div>
            </div>

            <div className="bg-slate-50 rounded-xl p-2 sm:p-2.5 border border-slate-200/80 flex flex-col">
              <span className="text-[10px] sm:text-[11px] font-medium text-slate-500">Avg Score</span>
              <span className="text-sm sm:text-base font-bold text-indigo-600 mt-0.5">
                {metrics.avg_score_pct}%
              </span>
            </div>

            <div className="bg-emerald-50/60 rounded-xl p-2 sm:p-2.5 border border-emerald-200/60 flex flex-col">
              <span className="text-[10px] sm:text-[11px] font-medium text-emerald-700 flex items-center gap-1">
                <CheckCircle2 className="w-3 h-3 shrink-0" /> Passed
              </span>
              <span className="text-sm sm:text-base font-bold text-emerald-800 mt-0.5">
                {metrics.passed}
              </span>
            </div>

            <div className="bg-rose-50/60 rounded-xl p-2 sm:p-2.5 border border-rose-200/60 flex flex-col">
              <span className="text-[10px] sm:text-[11px] font-medium text-rose-700 flex items-center gap-1">
                <XCircle className="w-3 h-3 shrink-0" /> Failed
              </span>
              <span className="text-sm sm:text-base font-bold text-rose-800 mt-0.5">
                {metrics.failed}
              </span>
            </div>
          </div>
        </div>

        {/* Filter / Search Bar */}
        <div className="bg-white/80 backdrop-blur-sm border-b border-slate-200 px-4 sm:px-6 py-2.5 sm:py-3 flex-shrink-0 flex flex-col gap-2">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={`Search ${type === 'projects' ? 'projects' : 'assignments'} or subjects...`}
              className="w-full pl-9 pr-3 py-1.5 text-xs sm:text-sm bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all placeholder:text-slate-400"
            />
          </div>

          <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-0.5 text-xs touch-pan-x">
            <button
              onClick={() => setStatusFilter('all')}
              className={`px-2.5 py-1 rounded-full font-medium text-[11px] sm:text-xs transition-colors whitespace-nowrap shrink-0 ${
                statusFilter === 'all'
                  ? 'bg-slate-900 text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              All ({items.length})
            </button>
            <button
              onClick={() => setStatusFilter('attempted')}
              className={`px-2.5 py-1 rounded-full font-medium text-[11px] sm:text-xs transition-colors whitespace-nowrap shrink-0 ${
                statusFilter === 'attempted'
                  ? 'bg-indigo-600 text-white'
                  : 'bg-indigo-50 text-indigo-700 hover:bg-indigo-100'
              }`}
            >
              Attempted ({metrics.attempted})
            </button>
            <button
              onClick={() => setStatusFilter('passed')}
              className={`px-2.5 py-1 rounded-full font-medium text-[11px] sm:text-xs transition-colors whitespace-nowrap shrink-0 ${
                statusFilter === 'passed'
                  ? 'bg-emerald-600 text-white'
                  : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
              }`}
            >
              Passed ({metrics.passed})
            </button>
            <button
              onClick={() => setStatusFilter('failed')}
              className={`px-2.5 py-1 rounded-full font-medium text-[11px] sm:text-xs transition-colors whitespace-nowrap shrink-0 ${
                statusFilter === 'failed'
                  ? 'bg-rose-600 text-white'
                  : 'bg-rose-50 text-rose-700 hover:bg-rose-100'
              }`}
            >
              Failed ({metrics.failed})
            </button>
            <button
              onClick={() => setStatusFilter('not_started')}
              className={`px-2.5 py-1 rounded-full font-medium text-[11px] sm:text-xs transition-colors whitespace-nowrap shrink-0 ${
                statusFilter === 'not_started'
                  ? 'bg-slate-600 text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              Not Started ({metrics.total - metrics.attempted})
            </button>
          </div>
        </div>

        {/* Drawer Body / Cards List */}
        <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-3.5 sm:py-4 space-y-3">
          {loading ? (
            <div className="flex flex-col items-center justify-center h-64 text-slate-400 gap-3">
              <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
              <p className="text-xs font-medium text-slate-500">
                Fetching student submission cards & evaluation feedback...
              </p>
            </div>
          ) : error ? (
            <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 flex items-start gap-2.5">
              <AlertTriangle className="w-4 h-4 text-rose-500 mt-0.5 shrink-0" />
              <div>
                <p className="font-semibold">Unable to load submissions</p>
                <p className="mt-0.5">{error}</p>
                <button
                  onClick={fetchData}
                  className="mt-2 font-semibold text-rose-800 underline hover:no-underline"
                >
                  Try Again
                </button>
              </div>
            </div>
          ) : filteredItems.length === 0 ? (
            <div className="text-center py-12 px-4 bg-white rounded-2xl border border-slate-200/80">
              <FileText className="w-10 h-10 text-slate-300 mx-auto mb-2" />
              <h3 className="text-sm font-semibold text-slate-700">No items found</h3>
              <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
                No submissions match the current search query or filter criteria.
              </p>
            </div>
          ) : (
            filteredItems.map((item) => {
              const isExpanded = expandedCardId === item.id;
              const feedback = item.feedback;
              const hasFeedback = Boolean(feedback);

              // Rubric breakdown extraction
              const rubricList = feedback?.rubric_breakdown || feedback?.breakdown || [];
              const rawStrengths = feedback?.strengths;
              const strengths = Array.isArray(rawStrengths)
                ? rawStrengths
                : typeof rawStrengths === 'string' && rawStrengths.trim()
                ? [rawStrengths]
                : [];

              const rawIssues = feedback?.issues || feedback?.weaknesses || feedback?.areas_for_improvement;
              const issues = Array.isArray(rawIssues)
                ? rawIssues
                : typeof rawIssues === 'string' && rawIssues.trim()
                ? [rawIssues]
                : [];

              const testResults = feedback?.test_results || [];

              return (
                <div
                  key={item.id}
                  className={`bg-white rounded-xl border transition-all duration-200 shadow-sm overflow-hidden ${
                    isExpanded
                      ? 'border-indigo-300 ring-1 ring-indigo-200'
                      : 'border-slate-200/80 hover:border-slate-300'
                  }`}
                >
                  {/* Card Collapsed Bar / Clickable Header (Mobile responsive) */}
                  <div
                    onClick={() => toggleExpand(item.id)}
                    className="p-3.5 sm:p-4 cursor-pointer flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 sm:gap-3 hover:bg-slate-50/60 select-none transition-colors"
                  >
                    <div className="flex items-start justify-between sm:justify-start gap-2.5 sm:gap-3 min-w-0">
                      <div className="flex items-start gap-2.5 sm:gap-3 min-w-0">
                        <div
                          className={`w-8 h-8 sm:w-9 sm:h-9 rounded-lg flex items-center justify-center shrink-0 mt-0.5 ${
                            item.status === 'passed'
                              ? 'bg-emerald-50 text-emerald-600'
                              : item.status === 'failed'
                              ? 'bg-rose-50 text-rose-600'
                              : item.status === 'submitted'
                              ? 'bg-amber-50 text-amber-600'
                              : 'bg-slate-100 text-slate-400'
                          }`}
                        >
                          {item.item_type === 'project' ? (
                            <FolderGit2 className="w-4 h-4" />
                          ) : (
                            <FileText className="w-4 h-4" />
                          )}
                        </div>

                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
                            <h4 className="text-xs sm:text-sm font-bold text-slate-900 truncate max-w-[200px] sm:max-w-none">
                              {item.title}
                            </h4>
                            <span
                              className={`px-1.5 py-0.5 rounded text-[9px] sm:text-[10px] font-semibold uppercase tracking-wider ${
                                item.item_type === 'project'
                                  ? 'bg-purple-50 text-purple-700 border border-purple-200/60'
                                  : item.item_type === 'college'
                                  ? 'bg-amber-50 text-amber-700 border border-amber-200/60'
                                  : 'bg-blue-50 text-blue-700 border border-blue-200/60'
                              }`}
                            >
                              {item.item_type === 'project'
                                ? 'Project'
                                : item.item_type === 'college'
                                ? 'College'
                                : 'Curriculum'}
                            </span>
                          </div>

                          <div className="flex items-center gap-1.5 sm:gap-2 text-[11px] sm:text-xs text-slate-500 mt-0.5 sm:mt-1 flex-wrap">
                            {item.subject_name && (
                              <span className="flex items-center gap-1 font-medium text-slate-600">
                                <BookOpen className="w-3 h-3 text-slate-400 shrink-0" />
                                <span className="truncate max-w-[140px] sm:max-w-none">{item.subject_name}</span>
                              </span>
                            )}
                            {item.topic_title && (
                              <span className="flex items-center gap-1 text-slate-400">
                                <span className="text-slate-300">·</span>
                                <Layers className="w-3 h-3 text-slate-400 shrink-0" />
                                <span className="truncate max-w-[120px] sm:max-w-none">{item.topic_title}</span>
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Chevron on mobile right */}
                      <div className="sm:hidden p-1 rounded text-slate-400 shrink-0">
                        {isExpanded ? (
                          <ChevronUp className="w-4 h-4 text-indigo-600" />
                        ) : (
                          <ChevronDown className="w-4 h-4" />
                        )}
                      </div>
                    </div>

                    {/* Status / Score row */}
                    <div className="flex items-center justify-between sm:justify-end gap-2 shrink-0 pt-1.5 sm:pt-0 border-t sm:border-t-0 border-slate-100">
                      <div className="flex items-center gap-2">
                        {item.score !== null ? (
                          <span
                            className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] sm:text-xs font-bold ${
                              item.status === 'passed'
                                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                : 'bg-rose-50 text-rose-700 border border-rose-200'
                            }`}
                          >
                            {item.score} / {item.max_score} (
                            {Math.round((item.score / item.max_score) * 100)}%)
                          </span>
                        ) : (
                          <span
                            className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] sm:text-xs font-semibold ${
                              item.status === 'submitted'
                                ? 'bg-amber-50 text-amber-700 border border-amber-200'
                                : 'bg-slate-100 text-slate-500 border border-slate-200'
                            }`}
                          >
                            {item.status === 'submitted' ? 'Submitted' : 'Not Started'}
                          </span>
                        )}
                      </div>

                      {/* Chevron on desktop */}
                      <div className="hidden sm:block p-1 rounded text-slate-400">
                        {isExpanded ? (
                          <ChevronUp className="w-4 h-4 text-indigo-600" />
                        ) : (
                          <ChevronDown className="w-4 h-4" />
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Card Expanded View / In-Depth Breakdown */}
                  {isExpanded && (
                    <div className="border-t border-slate-100 bg-slate-50/50 p-3.5 sm:p-5 space-y-3 sm:space-y-4">
                      {/* Submission metadata row */}
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 bg-white p-2.5 sm:p-3 rounded-lg border border-slate-200/80 text-xs">
                        <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
                          {item.submitted_at ? (
                            <span className="flex items-center gap-1.5 text-slate-600 text-[11px] sm:text-xs">
                              <Calendar className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                              <span className="font-medium">Submitted:</span>{' '}
                              {new Date(item.submitted_at).toLocaleDateString('en-US', {
                                month: 'short',
                                day: 'numeric',
                                year: 'numeric',
                                hour: '2-digit',
                                minute: '2-digit',
                              })}
                            </span>
                          ) : (
                            <span className="flex items-center gap-1 text-slate-400 italic text-[11px] sm:text-xs">
                              <Clock className="w-3.5 h-3.5 shrink-0" /> No submission timestamp
                            </span>
                          )}

                          {item.evaluation_status && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 font-medium text-[10px] sm:text-xs">
                              Evaluation: {item.evaluation_status}
                            </span>
                          )}
                        </div>

                        {item.submission_link && (
                          <a
                            href={item.submission_link}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 sm:py-1 rounded-md bg-indigo-50 text-indigo-700 hover:bg-indigo-100 font-semibold transition-colors text-xs w-full sm:w-auto shrink-0"
                          >
                            <span>Open Submission</span>
                            <ExternalLink className="w-3 h-3" />
                          </a>
                        )}
                      </div>

                      {/* Evaluator Summary Box */}
                      {feedback?.summary && (
                        <div className="bg-gradient-to-r from-indigo-50/80 to-violet-50/60 rounded-xl p-3 sm:p-3.5 border border-indigo-100/90 text-xs space-y-1">
                          <div className="flex items-center gap-1.5 font-bold text-indigo-900">
                            <Sparkles className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
                            <span>Evaluator Summary</span>
                          </div>
                          <p className="text-slate-700 leading-relaxed pl-5 whitespace-pre-wrap text-[11px] sm:text-xs">
                            {feedback.summary}
                          </p>
                        </div>
                      )}

                      {/* Rubric Breakdown Accordion/Grid */}
                      {rubricList.length > 0 && (
                        <div className="bg-white rounded-xl p-3 sm:p-3.5 border border-slate-200/80 space-y-2.5 sm:space-y-3">
                          <div className="flex items-center justify-between">
                            <h5 className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                              <Award className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
                              <span>Rubric Criteria Breakdown</span>
                            </h5>
                            <span className="text-[10px] sm:text-[11px] font-semibold text-slate-500">
                              {rubricList.length} criteria
                            </span>
                          </div>

                          <div className="divide-y divide-slate-100">
                            {rubricList.map((crit, idx) => {
                              const title =
                                crit.criterion || crit.title || crit.name || `Criterion ${idx + 1}`;
                              const awarded = Number(
                                crit.score ?? crit.marks ?? crit.awarded ?? 0
                              );
                              const maxP = Number(
                                crit.max_score ?? crit.max_points ?? crit.max ?? 10
                              );
                              const pct = maxP > 0 ? Math.round((awarded / maxP) * 100) : 0;
                              const comments = crit.feedback || crit.comments;

                              return (
                                <div key={idx} className="py-2 sm:py-2.5 first:pt-0 last:pb-0 space-y-1 sm:space-y-1.5">
                                  <div className="flex flex-col sm:flex-row sm:items-center justify-between text-xs gap-0.5 sm:gap-2">
                                    <span className="font-semibold text-slate-800 text-[11px] sm:text-xs">{title}</span>
                                    <span className="font-bold text-slate-700 shrink-0 text-[11px] sm:text-xs">
                                      {awarded} / {maxP} ({pct}%)
                                    </span>
                                  </div>

                                  {/* Progress bar */}
                                  <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
                                    <div
                                      className={`h-full rounded-full transition-all duration-500 ${
                                        pct >= 60 ? 'bg-emerald-500' : 'bg-rose-500'
                                      }`}
                                      style={{ width: `${Math.min(pct, 100)}%` }}
                                    />
                                  </div>

                                  {comments && (
                                    <p className="text-[10px] sm:text-[11px] text-slate-600 italic pl-1">
                                      {comments}
                                    </p>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      {/* Strengths & Issues Grid */}
                      {(strengths.length > 0 || issues.length > 0) && (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 sm:gap-3">
                          {strengths.length > 0 && (
                            <div className="bg-emerald-50/60 rounded-xl p-3 border border-emerald-200/60 space-y-1.5 sm:space-y-2">
                              <h5 className="text-xs font-bold text-emerald-800 flex items-center gap-1.5">
                                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                                <span>Strengths</span>
                              </h5>
                              <ul className="space-y-1 text-[11px] sm:text-xs text-emerald-950">
                                {strengths.map((str, idx) => (
                                  <li key={idx} className="flex items-start gap-1.5">
                                    <span className="text-emerald-500 mt-0.5">•</span>
                                    <span className="leading-snug">{str}</span>
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}

                          {issues.length > 0 && (
                            <div className="bg-rose-50/60 rounded-xl p-3 border border-rose-200/60 space-y-1.5 sm:space-y-2">
                              <h5 className="text-xs font-bold text-rose-800 flex items-center gap-1.5">
                                <AlertTriangle className="w-3.5 h-3.5 text-rose-600 shrink-0" />
                                <span>Areas for Improvement</span>
                              </h5>
                              <ul className="space-y-1 text-[11px] sm:text-xs text-rose-950">
                                {issues.map((iss, idx) => (
                                  <li key={idx} className="flex items-start gap-1.5">
                                    <span className="text-rose-500 mt-0.5">•</span>
                                    <span className="leading-snug">{iss}</span>
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Test cases results if available */}
                      {testResults.length > 0 && (
                        <div className="bg-white rounded-xl p-3 sm:p-3.5 border border-slate-200/80 space-y-2">
                          <h5 className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                            <Code2 className="w-3.5 h-3.5 text-slate-600 shrink-0" />
                            <span>Automated Test Results</span>
                          </h5>
                          <div className="space-y-1.5">
                            {testResults.map((t, idx) => {
                              const passed = t.passed ?? t.status === 'passed';
                              return (
                                <div
                                  key={idx}
                                  className="flex items-start justify-between gap-2 p-2 rounded-lg bg-slate-50 text-[11px] sm:text-xs border border-slate-200/60"
                                >
                                  <div className="min-w-0">
                                    <span className="font-semibold text-slate-800">
                                      {t.name || t.test_name || `Test #${idx + 1}`}
                                    </span>
                                    {t.message && (
                                      <p className="text-[10px] sm:text-[11px] text-slate-500 mt-0.5">
                                        {t.message}
                                      </p>
                                    )}
                                  </div>
                                  <span
                                    className={`px-1.5 py-0.5 rounded text-[9px] sm:text-[10px] font-bold uppercase shrink-0 ${
                                      passed
                                        ? 'bg-emerald-100 text-emerald-800'
                                        : 'bg-rose-100 text-rose-800'
                                    }`}
                                  >
                                    {passed ? 'Passed' : 'Failed'}
                                  </span>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      {/* Fallback if no evaluation feedback exists yet */}
                      {!hasFeedback && item.status !== 'not_started' && (
                        <div className="bg-white rounded-xl p-3.5 border border-slate-200 text-center py-6">
                          <Clock className="w-6 h-6 text-amber-500 mx-auto mb-1.5" />
                          <p className="text-xs font-semibold text-slate-700">
                            Submission Pending Evaluation
                          </p>
                          <p className="text-[11px] text-slate-400 mt-0.5">
                            The student has submitted this work, but evaluator marks or AI
                            feedback have not been generated yet.
                          </p>
                        </div>
                      )}

                      {item.status === 'not_started' && (
                        <div className="bg-white rounded-xl p-3.5 border border-slate-200 text-center py-6">
                          <p className="text-xs text-slate-500">
                            The student has not started or submitted this assignment yet.
                          </p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Drawer Footer */}
        <div className="bg-white border-t border-slate-200 px-4 sm:px-6 py-2.5 sm:py-3 flex-shrink-0 flex items-center justify-between">
          <span className="text-[11px] sm:text-xs text-slate-500">
            {filteredItems.length} of {items.length}{' '}
            {type === 'projects' ? 'projects' : 'assignments'}
          </span>
          <button
            onClick={onClose}
            className="px-3.5 sm:px-4 py-1.5 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
          >
            Close
          </button>
        </div>
      </aside>
    </div>
  );
}
