import { useEffect, useState, useMemo, Fragment } from 'react';
import { Loader2, ChevronDown, ChevronUp, FileCode, CheckSquare, BookOpen, X, Sparkles, CheckCircle2, XCircle, Clock, Award, Search } from 'lucide-react';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Card, CardHeader, CardTitle } from '@/components/ui/card';
import apiClient from '@/services/api';

type TopicRow = {
  topic_id: string;
  topic_title: string;
  quiz_score: number;
  quiz_max: number;
  assignment_status: 'Submitted' | 'Pending';
  project_status: 'Approved' | 'Submitted' | 'Not Started' | null;
  progress: number;
  assignments_list: { id: string; title: string; status: string }[];
  projects_list: { id: string; title: string; status: string }[];
  quizzes_list: { id: string; title: string; status: string; score: number; max_score: number }[];
};

type SubjectGroup = {
  subject_id: string;
  subject_name: string;
  topics: TopicRow[];
};

const STATUS_COLORS: Record<string, string> = {
  Submitted: 'bg-emerald-50 text-emerald-700 border-emerald-200/60',
  Approved: 'bg-blue-50 text-blue-700 border-blue-200/60',
  Passed: 'bg-emerald-50 text-emerald-700 border-emerald-200/60',
  Failed: 'bg-red-50 text-red-700 border-red-200/60',
  Pending: 'bg-amber-50 text-amber-700 border-amber-200/60',
  'Not Started': 'bg-slate-100 text-slate-600 border-slate-200/70',
  Completed: 'bg-emerald-50 text-emerald-700 border-emerald-200/60',
  'In Progress': 'bg-purple-50 text-purple-700 border-purple-200/60',
};

function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`px-2.5 py-0.5 rounded-full text-[11px] sm:text-xs font-semibold whitespace-nowrap inline-flex items-center shrink-0 border ${STATUS_COLORS[status] ?? 'bg-slate-100 text-slate-500 border-slate-200/60'}`}>
      {status}
    </span>
  );
}

function TopicRowView({ topic }: { topic: TopicRow }) {
  const [expanded, setExpanded] = useState(false);
  
  const hasItems = topic.assignments_list.length > 0 || topic.projects_list.length > 0 || topic.quizzes_list.length > 0;

  const asgTotal = topic.assignments_list.length;
  const asgSubmitted = topic.assignments_list.filter(a => ['Submitted', 'Approved', 'Passed'].includes(a.status)).length;
  const asgStatus = asgTotal === 0 ? 'Not Started' 
                    : asgSubmitted >= asgTotal ? 'Completed' 
                    : asgSubmitted > 0 ? 'In Progress' 
                    : 'Not Started';

  const projTotal = topic.projects_list.length;
  const projSubmitted = topic.projects_list.filter(p => ['Submitted', 'Approved', 'Passed'].includes(p.status)).length;
  const projStatus = projTotal === 0 ? 'Not Started' 
                     : projSubmitted >= projTotal ? 'Completed' 
                     : projSubmitted > 0 ? 'In Progress' 
                     : 'Not Started';

  return (
    <Fragment>
      <tr className={`hover:bg-slate-50/80 transition-colors ${expanded ? 'bg-indigo-50/20' : ''}`}>
        <td className="px-4 sm:px-5 py-3.5 whitespace-nowrap">
          <div className="flex items-center gap-2.5">
            {hasItems ? (
              <button 
                onClick={() => setExpanded(!expanded)}
                className={`p-1 rounded-lg transition-colors min-h-[28px] min-w-[28px] flex items-center justify-center ${
                  expanded ? 'bg-indigo-100 text-indigo-700' : 'hover:bg-slate-100 text-slate-400 hover:text-slate-700'
                }`}
                title={expanded ? 'Collapse details' : 'Expand details'}
              >
                {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
              </button>
            ) : <div className="w-7" />}
            <span className="font-semibold text-slate-800 text-xs sm:text-sm">{topic.topic_title}</span>
          </div>
        </td>
        <td className="px-4 sm:px-5 py-3.5 whitespace-nowrap">
          <div className="flex items-center gap-2.5">
            <div className="w-24 sm:w-28 bg-slate-100 rounded-full h-2 overflow-hidden flex shrink-0">
              <div
                className="bg-indigo-500 h-2 rounded-full transition-all duration-700"
                style={{ width: `${topic.progress}%` }}
              />
            </div>
            <span className="text-xs font-bold text-slate-700 min-w-[32px]">
              {topic.progress}%
            </span>
          </div>
        </td>
        <td className="px-4 sm:px-5 py-3.5 text-slate-600 whitespace-nowrap">
          {topic.quiz_max > 0 ? (
            <span className="text-[11px] font-semibold text-slate-600 px-2 py-0.5 bg-slate-100/90 border border-slate-200/70 rounded-md whitespace-nowrap">
              {topic.quiz_score}/{topic.quiz_max}
            </span>
          ) : (
            <span className="text-slate-400 text-xs italic">No quiz</span>
          )}
        </td>
        <td className="px-4 sm:px-5 py-3.5 whitespace-nowrap">
          {asgTotal === 0 ? (
            <span className="text-slate-400 text-xs italic">No assignment</span>
          ) : (
            <div className="inline-flex items-center gap-2 whitespace-nowrap">
              <StatusBadge status={asgStatus} />
              <span className="text-[11px] text-slate-500 font-semibold px-2 py-0.5 bg-slate-100/90 border border-slate-200/70 rounded-md whitespace-nowrap">
                {asgSubmitted}/{asgTotal}
              </span>
            </div>
          )}
        </td>
        <td className="px-4 sm:px-5 py-3.5 whitespace-nowrap">
          {projTotal === 0 ? (
            <span className="text-slate-400 text-xs italic">No project</span>
          ) : (
            <div className="inline-flex items-center gap-2 whitespace-nowrap">
              <StatusBadge status={projStatus} />
              <span className="text-[11px] text-slate-500 font-semibold px-2 py-0.5 bg-slate-100/90 border border-slate-200/70 rounded-md whitespace-nowrap">
                {projSubmitted}/{projTotal}
              </span>
            </div>
          )}
        </td>
      </tr>
      
      {expanded && hasItems && (
        <tr>
          <td colSpan={5} className="bg-slate-50/90 p-0 border-b border-slate-200">
            <div className="px-4 sm:px-8 py-4 sm:py-6 grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-6 shadow-inner">
              
              {/* Quizzes */}
              <div>
                <h4 className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-2.5 sm:mb-3 flex items-center gap-1.5">
                  <CheckSquare className="w-3.5 h-3.5 text-indigo-500" /> Quizzes
                </h4>
                {topic.quizzes_list.length > 0 ? (
                  <ul className="space-y-2">
                    {topic.quizzes_list.map(q => {
                      const max = Number(q.max_score) || 0;
                      const sc = Number(q.score) || 0;
                      const pct = max > 0 ? Math.round((sc / max) * 100) : null;
                      const status = (q.status === 'Passed' || q.status === 'Failed')
                        ? (pct !== null ? (pct >= 60 ? 'Passed' : 'Failed') : q.status)
                        : q.status;
                      return (
                        <li key={q.id} className="flex flex-col gap-1.5 bg-white p-3 rounded-xl border border-slate-200 shadow-xs hover:shadow-sm transition-shadow">
                          <span className="font-semibold text-xs sm:text-[13px] text-slate-800 leading-tight">{q.title}</span>
                          <div className="flex items-center justify-between mt-1">
                            <span className="text-slate-500 text-[11px] sm:text-xs font-semibold px-1.5 py-0.5 bg-slate-50 rounded border border-slate-100">
                              Score: {q.score}/{q.max_score}{pct !== null ? ` (${pct}%)` : ''}
                            </span>
                            <StatusBadge status={status} />
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                ) : (
                  <div className="text-xs text-slate-400 italic bg-white/70 p-3 rounded-xl border border-slate-200/60 border-dashed">No quizzes for this module.</div>
                )}
              </div>
              
              {/* Assignments */}
              <div>
                <h4 className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-2.5 sm:mb-3 flex items-center gap-1.5">
                  <BookOpen className="w-3.5 h-3.5 text-indigo-500" /> Assignments
                </h4>
                {topic.assignments_list.length > 0 ? (
                  <ul className="space-y-2">
                    {topic.assignments_list.map(a => (
                      <li key={a.id} className="flex flex-col gap-1.5 bg-white p-3 rounded-xl border border-slate-200 shadow-xs hover:shadow-sm transition-shadow">
                        <span className="font-semibold text-xs sm:text-[13px] text-slate-800 leading-tight">{a.title}</span>
                        <div className="flex justify-end mt-1">
                          <StatusBadge status={a.status} />
                        </div>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <div className="text-xs text-slate-400 italic bg-white/70 p-3 rounded-xl border border-slate-200/60 border-dashed">No assignments for this module.</div>
                )}
              </div>
              
              {/* Projects */}
              <div>
                <h4 className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-2.5 sm:mb-3 flex items-center gap-1.5">
                  <FileCode className="w-3.5 h-3.5 text-indigo-500" /> Projects
                </h4>
                {topic.projects_list.length > 0 ? (
                  <ul className="space-y-2">
                    {topic.projects_list.map(p => (
                      <li key={p.id} className="flex flex-col gap-1.5 bg-white p-3 rounded-xl border border-slate-200 shadow-xs hover:shadow-sm transition-shadow">
                        <span className="font-semibold text-xs sm:text-[13px] text-slate-800 leading-tight">{p.title}</span>
                        <div className="flex justify-end mt-1">
                          <StatusBadge status={p.status} />
                        </div>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <div className="text-xs text-slate-400 italic bg-white/70 p-3 rounded-xl border border-slate-200/60 border-dashed">No projects for this module.</div>
                )}
              </div>

            </div>
          </td>
        </tr>
      )}
    </Fragment>
  );
}

function TopicMobileCard({ topic }: { topic: TopicRow }) {
  const [expanded, setExpanded] = useState(false);
  const hasItems = topic.assignments_list.length > 0 || topic.projects_list.length > 0 || topic.quizzes_list.length > 0;

  const asgTotal = topic.assignments_list.length;
  const asgSubmitted = topic.assignments_list.filter(a => ['Submitted', 'Approved', 'Passed'].includes(a.status)).length;
  const asgStatus = asgTotal === 0 ? 'Not Started' 
                    : asgSubmitted >= asgTotal ? 'Completed' 
                    : asgSubmitted > 0 ? 'In Progress' 
                    : 'Not Started';

  const projTotal = topic.projects_list.length;
  const projSubmitted = topic.projects_list.filter(p => ['Submitted', 'Approved', 'Passed'].includes(p.status)).length;
  const projStatus = projTotal === 0 ? 'Not Started' 
                     : projSubmitted >= projTotal ? 'Completed' 
                     : projSubmitted > 0 ? 'In Progress' 
                     : 'Not Started';

  return (
    <div className={`p-3.5 sm:p-4 space-y-3 transition-colors ${expanded ? 'bg-indigo-50/20' : 'hover:bg-slate-50/60'}`}>
      <div 
        onClick={() => hasItems && setExpanded(!expanded)}
        className={`flex items-start justify-between gap-2 ${hasItems ? 'cursor-pointer' : ''}`}
      >
        <div className="flex items-center gap-2 min-w-0 flex-1">
          {hasItems ? (
            <div className={`p-1 rounded-lg transition-colors shrink-0 ${expanded ? 'bg-indigo-100 text-indigo-700' : 'text-slate-400'}`}>
              {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </div>
          ) : (
            <div className="w-4" />
          )}
          <span className="font-bold text-slate-800 text-xs sm:text-sm leading-snug">
            {topic.topic_title}
          </span>
        </div>
        <span className="text-xs font-bold text-indigo-600 bg-indigo-50 border border-indigo-100/80 px-2 py-0.5 rounded-full shrink-0">
          {topic.progress}%
        </span>
      </div>

      {/* Progress Bar */}
      <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
        <div
          className="bg-indigo-500 h-1.5 rounded-full transition-all duration-500"
          style={{ width: `${topic.progress}%` }}
        />
      </div>

      {/* 3 Metric Chips */}
      <div className="grid grid-cols-3 gap-1.5 text-[11px]">
        {/* Quiz */}
        <div className="bg-slate-50 p-2 rounded-xl border border-slate-100 text-center">
          <span className="text-[9px] uppercase font-bold text-slate-400 block mb-0.5">Quiz</span>
          {topic.quiz_max > 0 ? (
            <span className="font-bold text-slate-700">{topic.quiz_score}/{topic.quiz_max}</span>
          ) : (
            <span className="text-slate-400 italic text-[10px]">None</span>
          )}
        </div>

        {/* Assignment */}
        <div className="bg-slate-50 p-2 rounded-xl border border-slate-100 text-center">
          <span className="text-[9px] uppercase font-bold text-slate-400 block mb-0.5">Assignment</span>
          {asgTotal > 0 ? (
            <div className="flex flex-col items-center gap-0.5">
              <StatusBadge status={asgStatus} />
              <span className="text-[10px] text-slate-400 font-semibold">{asgSubmitted}/{asgTotal}</span>
            </div>
          ) : (
            <span className="text-slate-400 italic text-[10px]">None</span>
          )}
        </div>

        {/* Project */}
        <div className="bg-slate-50 p-2 rounded-xl border border-slate-100 text-center">
          <span className="text-[9px] uppercase font-bold text-slate-400 block mb-0.5">Project</span>
          {projTotal > 0 ? (
            <div className="flex flex-col items-center gap-0.5">
              <StatusBadge status={projStatus} />
              <span className="text-[10px] text-slate-400 font-semibold">{projSubmitted}/{projTotal}</span>
            </div>
          ) : (
            <span className="text-slate-400 italic text-[10px]">None</span>
          )}
        </div>
      </div>

      {/* Expanded Sub-items on mobile */}
      {expanded && hasItems && (
        <div className="pt-2 space-y-3 border-t border-slate-100 animate-in fade-in duration-200">
          {/* Quizzes */}
          {topic.quizzes_list.length > 0 && (
            <div>
              <h5 className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5 flex items-center gap-1">
                <CheckSquare className="w-3 h-3 text-indigo-500" /> Quizzes
              </h5>
              <div className="space-y-1.5">
                {topic.quizzes_list.map(q => (
                  <div key={q.id} className="bg-white p-2.5 rounded-xl border border-slate-200 shadow-2xs flex items-center justify-between gap-2">
                    <span className="font-semibold text-xs text-slate-800 truncate">{q.title}</span>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <span className="text-[10px] text-slate-500 font-semibold px-1.5 py-0.5 bg-slate-50 rounded border border-slate-100">
                        {q.score}/{q.max_score}
                      </span>
                      <StatusBadge status={q.status} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Assignments */}
          {topic.assignments_list.length > 0 && (
            <div>
              <h5 className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5 flex items-center gap-1">
                <BookOpen className="w-3 h-3 text-indigo-500" /> Assignments
              </h5>
              <div className="space-y-1.5">
                {topic.assignments_list.map(a => (
                  <div key={a.id} className="bg-white p-2.5 rounded-xl border border-slate-200 shadow-2xs flex items-center justify-between gap-2">
                    <span className="font-semibold text-xs text-slate-800 truncate">{a.title}</span>
                    <StatusBadge status={a.status} />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Projects */}
          {topic.projects_list.length > 0 && (
            <div>
              <h5 className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5 flex items-center gap-1">
                <FileCode className="w-3 h-3 text-indigo-500" /> Projects
              </h5>
              <div className="space-y-1.5">
                {topic.projects_list.map(p => (
                  <div key={p.id} className="bg-white p-2.5 rounded-xl border border-slate-200 shadow-2xs flex items-center justify-between gap-2">
                    <span className="font-semibold text-xs text-slate-800 truncate">{p.title}</span>
                    <StatusBadge status={p.status} />
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function StudentDetailsModal({
  isOpen,
  onClose,
  studentId,
  studentName,
  subjectId,
  mode = 'all',
}: {
  isOpen: boolean;
  onClose: () => void;
  studentId: string | null;
  studentName: string;
  subjectId?: string;
  mode?: 'all' | 'quizzes_only';
}) {
  const [subjects, setSubjects] = useState<SubjectGroup[]>([]);
  const [loading, setLoading] = useState(false);
  const [quizFilter, setQuizFilter] = useState<'attempted' | 'all'>('attempted');
  const [quizSearch, setQuizSearch] = useState('');

  useEffect(() => {
    if (isOpen && studentId) {
      setLoading(true);
      setQuizFilter('attempted');
      setQuizSearch('');
      apiClient
        .get(`/facilitator/students/${studentId}/modules`)
        .then((res) => {
          let list = res.data.data || [];
          if (subjectId && subjectId !== 'all') {
            list = list.filter((s: SubjectGroup) => s.subject_id === subjectId);
          }
          setSubjects(list);
        })
        .catch((err) => console.error(err))
        .finally(() => setLoading(false));
    } else {
      setSubjects([]);
      setQuizFilter('attempted');
      setQuizSearch('');
    }
  }, [isOpen, studentId, subjectId]);

  const isQuizzesOnly = mode === 'quizzes_only';

  const allQuizzes = useMemo(() => {
    const list: {
      id: string;
      title: string;
      topicTitle: string;
      subjectName: string;
      score: number;
      maxScore: number;
      scorePct: number | null;
      status: 'Passed' | 'Failed' | 'Not Attempted';
      attemptsCount: number;
      isAttempted: boolean;
    }[] = [];

    subjects.forEach((subj) => {
      (subj.topics || []).forEach((top) => {
        (top.quizzes_list || []).forEach((q: any) => {
          const max = Number(q.max_score) || 0;
          const sc = Number(q.score) || 0;
          const hasAttempt = q.status === 'Passed' || q.status === 'Failed' || (Number(q.attempts_count) > 0);
          const pct = hasAttempt && max > 0 ? Math.min(100, Math.round((sc / max) * 100)) : null;
          // Strict 60% criteria: Individual quiz must have score percentage >= 60% to be Passed
          const finalStatus: 'Passed' | 'Failed' | 'Not Attempted' = hasAttempt
            ? (pct !== null ? (pct >= 60 ? 'Passed' : 'Failed') : (q.status === 'Passed' ? 'Passed' : 'Failed'))
            : 'Not Attempted';

          list.push({
            id: q.id,
            title: q.title || 'Quiz',
            topicTitle: top.topic_title,
            subjectName: subj.subject_name,
            score: sc,
            maxScore: max,
            scorePct: pct,
            status: finalStatus,
            attemptsCount: Number(q.attempts_count) || (hasAttempt ? 1 : 0),
            isAttempted: hasAttempt,
          });
        });
      });
    });

    return list;
  }, [subjects]);

  const attemptedQuizzes = useMemo(() => allQuizzes.filter((q) => q.isAttempted), [allQuizzes]);
  const passedQuizzesCount = useMemo(() => attemptedQuizzes.filter((q) => q.status === 'Passed').length, [attemptedQuizzes]);
  const failedQuizzesCount = useMemo(() => attemptedQuizzes.filter((q) => q.status === 'Failed').length, [attemptedQuizzes]);
  const avgQuizScorePct = useMemo(() => {
    const validScores = attemptedQuizzes.filter((q) => q.scorePct !== null);
    if (!validScores.length) return null;
    return Math.round(validScores.reduce((acc, q) => acc + (q.scorePct ?? 0), 0) / validScores.length);
  }, [attemptedQuizzes]);

  const displayedQuizzes = useMemo(() => {
    return allQuizzes.filter((q) => {
      if (quizFilter === 'attempted' && !q.isAttempted) return false;
      if (quizSearch.trim()) {
        const query = quizSearch.toLowerCase();
        return q.title.toLowerCase().includes(query) || q.topicTitle.toLowerCase().includes(query);
      }
      return true;
    });
  }, [allQuizzes, quizFilter, quizSearch]);

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent 
        showCloseButton={false}
        className="w-[95vw] sm:max-w-4xl max-h-[90vh] flex flex-col p-0 gap-0 overflow-hidden bg-slate-50 rounded-2xl shadow-2xl border border-slate-200/80"
      >
        {/* Fixed Header with anchored close button */}
        <div className="px-4 sm:px-6 py-3.5 sm:py-4 bg-white border-b border-slate-200/80 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5 min-w-0 pr-3">
            <div className="w-8 h-8 rounded-xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600 shrink-0">
              {isQuizzesOnly ? <Award className="w-4 h-4" /> : <Sparkles className="w-4 h-4" />}
            </div>
            <div className="min-w-0">
              <DialogTitle className="text-sm sm:text-base md:text-lg font-bold text-slate-900 truncate tracking-tight">
                {isQuizzesOnly ? `${studentName}'s Quiz Progress` : `${studentName}'s Progress Details`}
              </DialogTitle>
              <p className="text-[11px] text-slate-400 truncate">
                {isQuizzesOnly
                  ? 'Detailed record of attempted quizzes and test scores'
                  : 'Course, module & assessment performance breakdown'}
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

        {/* Scrollable Body */}
        <div className="flex-1 overflow-y-auto p-3.5 sm:p-6 no-scrollbar space-y-4 sm:space-y-6">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-20">
              <Loader2 className="w-8 h-8 animate-spin text-indigo-500 mb-2" />
              <p className="text-xs text-slate-400">Loading student details...</p>
            </div>
          ) : isQuizzesOnly ? (
            /* ─── Dedicated Quizzes-Only View ─── */
            <div className="space-y-4 sm:space-y-5">
              {/* Top KPI Stat Cards */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3.5">
                <div className="bg-white p-3 sm:p-3.5 rounded-2xl border border-slate-200/80 shadow-xs flex flex-col justify-between">
                  <div className="text-[10px] sm:text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-1 truncate">
                    Quizzes Attempted
                  </div>
                  <div className="flex items-baseline gap-1.5">
                    <span className="text-xl sm:text-2xl font-black text-slate-900">{attemptedQuizzes.length}</span>
                    <span className="text-[11px] sm:text-xs text-slate-400 font-medium">/ {allQuizzes.length}</span>
                  </div>
                </div>

                <div className="bg-white p-3 sm:p-3.5 rounded-2xl border border-emerald-100 shadow-xs flex flex-col justify-between">
                  <div className="text-[10px] sm:text-[11px] font-semibold uppercase tracking-wider text-emerald-600 mb-1 truncate">
                    Quizzes Passed
                  </div>
                  <div className="flex items-baseline gap-1.5">
                    <span className="text-xl sm:text-2xl font-black text-emerald-600">{passedQuizzesCount}</span>
                    <span className="text-[11px] sm:text-xs text-emerald-600/70 font-medium">cleared</span>
                  </div>
                </div>

                <div className="bg-white p-3 sm:p-3.5 rounded-2xl border border-rose-100 shadow-xs flex flex-col justify-between">
                  <div className="text-[10px] sm:text-[11px] font-semibold uppercase tracking-wider text-rose-600 mb-1 truncate">
                    Quizzes Failed
                  </div>
                  <div className="flex items-baseline gap-1.5">
                    <span className="text-xl sm:text-2xl font-black text-rose-600">{failedQuizzesCount}</span>
                    <span className="text-[11px] sm:text-xs text-rose-600/70 font-medium">unsuccessful</span>
                  </div>
                </div>

                <div className={`bg-white p-3 sm:p-3.5 rounded-2xl border shadow-xs flex flex-col justify-between ${
                  avgQuizScorePct === null
                    ? 'border-slate-200/80'
                    : avgQuizScorePct >= 60
                    ? 'border-emerald-100'
                    : 'border-rose-100'
                }`}>
                  <div className={`text-[10px] sm:text-[11px] font-semibold uppercase tracking-wider mb-1 truncate ${
                    avgQuizScorePct === null
                      ? 'text-slate-400'
                      : avgQuizScorePct >= 60
                      ? 'text-emerald-600'
                      : 'text-rose-600'
                  }`}>
                    Average Score
                  </div>
                  <div className="flex items-baseline gap-1.5">
                    <span className={`text-xl sm:text-2xl font-black ${
                      avgQuizScorePct === null
                        ? 'text-slate-700'
                        : avgQuizScorePct >= 60
                        ? 'text-emerald-600'
                        : 'text-rose-600'
                    }`}>
                      {avgQuizScorePct !== null ? `${avgQuizScorePct}%` : 'N/A'}
                    </span>
                    <span className={`text-[11px] sm:text-xs font-medium ${
                      avgQuizScorePct === null
                        ? 'text-slate-400'
                        : avgQuizScorePct >= 60
                        ? 'text-emerald-600/70'
                        : 'text-rose-600/70'
                    }`}>
                      {avgQuizScorePct === null ? 'overall' : avgQuizScorePct >= 60 ? 'passing avg' : 'failing avg (<60%)'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Filter & Search Bar */}
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5 sm:gap-3 bg-white p-2.5 sm:p-3 rounded-2xl border border-slate-200/80 shadow-xs">
                <div className="flex items-center gap-1 sm:gap-1.5 overflow-x-auto no-scrollbar py-0.5 w-full sm:w-auto flex-nowrap shrink-0">
                  <button
                    onClick={() => setQuizFilter('attempted')}
                    className={`px-2.5 sm:px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all shrink-0 ${
                      quizFilter === 'attempted'
                        ? 'bg-indigo-600 text-white shadow-xs'
                        : 'bg-slate-100 hover:bg-slate-200/70 text-slate-600'
                    }`}
                  >
                    Attempted Quizzes ({attemptedQuizzes.length})
                  </button>
                  <button
                    onClick={() => setQuizFilter('all')}
                    className={`px-2.5 sm:px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all shrink-0 ${
                      quizFilter === 'all'
                        ? 'bg-indigo-600 text-white shadow-xs'
                        : 'bg-slate-100 hover:bg-slate-200/70 text-slate-600'
                    }`}
                  >
                    All Quizzes ({allQuizzes.length})
                  </button>
                </div>

                <div className="relative w-full sm:w-64 shrink-0">
                  <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Search quiz or module..."
                    value={quizSearch}
                    onChange={(e) => setQuizSearch(e.target.value)}
                    className="w-full pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs outline-none focus:bg-white focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all"
                  />
                  {quizSearch && (
                    <button
                      onClick={() => setQuizSearch('')}
                      className="absolute right-2.5 top-2 text-slate-400 hover:text-slate-600 text-xs"
                    >
                      ×
                    </button>
                  )}
                </div>
              </div>

              {/* Quizzes List/Table */}
              {displayedQuizzes.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 bg-white rounded-2xl border border-slate-200/80 text-center p-6">
                  <div className="w-12 h-12 rounded-2xl bg-slate-100 flex items-center justify-center text-slate-400 mb-3">
                    <CheckSquare className="w-6 h-6" />
                  </div>
                  <p className="text-sm font-semibold text-slate-700">No quizzes to show</p>
                  <p className="text-xs text-slate-400 mt-1 max-w-xs">
                    {quizSearch
                      ? `No quizzes matching "${quizSearch}".`
                      : quizFilter === 'attempted'
                      ? 'This student has not attempted any quizzes yet.'
                      : 'No quizzes found in this subject.'}
                  </p>
                  {quizFilter === 'attempted' && allQuizzes.length > 0 && (
                    <button
                      onClick={() => setQuizFilter('all')}
                      className="mt-3 px-3 py-1.5 text-xs font-semibold text-indigo-600 bg-indigo-50 hover:bg-indigo-100 rounded-xl border border-indigo-200/60 transition-colors"
                    >
                      View All Quizzes ({allQuizzes.length})
                    </button>
                  )}
                </div>
              ) : (
                <Card className="border border-slate-200/80 shadow-xs rounded-2xl overflow-hidden bg-white">
                  {/* Mobile Card List */}
                  <div className="divide-y divide-slate-100 md:hidden">
                    {displayedQuizzes.map((q) => (
                      <div key={q.id} className="p-3.5 space-y-2.5">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <span className="text-[10px] font-semibold text-indigo-600 bg-indigo-50 border border-indigo-100 px-2 py-0.5 rounded-full inline-block mb-1">
                              {q.topicTitle}
                            </span>
                            <p className="font-bold text-slate-800 text-xs">{q.title}</p>
                          </div>
                          <div>
                            {q.status === 'Passed' ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200/70">
                                <CheckCircle2 className="w-3 h-3 text-emerald-500" />
                                Passed
                              </span>
                            ) : q.status === 'Failed' ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-rose-50 text-rose-700 border border-rose-200/70">
                                <XCircle className="w-3 h-3 text-rose-500" />
                                Failed
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-slate-100 text-slate-600 border border-slate-200/70">
                                <Clock className="w-3 h-3 text-slate-400" />
                                Not Attempted
                              </span>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center justify-between text-xs pt-1 border-t border-slate-50">
                          <span className="text-slate-500 text-[11px]">
                            {q.isAttempted ? (
                              <span>
                                Score: <strong className="text-slate-800">{q.score}/{q.maxScore}</strong>
                                {q.scorePct !== null && ` (${q.scorePct}%)`}
                              </span>
                            ) : (
                              <span className="text-slate-400 italic">Not attempted</span>
                            )}
                          </span>
                          <span className="text-[11px] text-slate-400">
                            {q.attemptsCount} {q.attemptsCount === 1 ? 'attempt' : 'attempts'}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Desktop Table View */}
                  <div className="hidden md:block overflow-x-auto no-scrollbar">
                    <table className="w-full text-xs sm:text-[13px]">
                      <thead className="bg-slate-50/80 border-b border-slate-100 text-[11px] text-slate-500 uppercase font-semibold">
                        <tr>
                          <th className="text-left px-4 sm:px-5 py-3 whitespace-nowrap">Module</th>
                          <th className="text-left px-4 sm:px-5 py-3 whitespace-nowrap">Quiz</th>
                          <th className="text-left px-4 sm:px-5 py-3 whitespace-nowrap">Status</th>
                          <th className="text-left px-4 sm:px-5 py-3 whitespace-nowrap">Score</th>
                          <th className="text-left px-4 sm:px-5 py-3 whitespace-nowrap">Attempts</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {displayedQuizzes.map((q) => (
                          <tr key={q.id} className="hover:bg-slate-50/70 transition-colors">
                            <td className="px-4 sm:px-5 py-3.5 whitespace-nowrap">
                              <span className="font-semibold text-slate-600 text-xs px-2 py-0.5 bg-slate-100 rounded-md border border-slate-200/60">
                                {q.topicTitle}
                              </span>
                            </td>
                            <td className="px-4 sm:px-5 py-3.5 whitespace-nowrap font-medium text-slate-800">
                              {q.title}
                            </td>
                            <td className="px-4 sm:px-5 py-3.5 whitespace-nowrap">
                              {q.status === 'Passed' ? (
                                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200/70">
                                  <CheckCircle2 className="w-3 h-3 text-emerald-500" />
                                  Passed
                                </span>
                              ) : q.status === 'Failed' ? (
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
                            <td className="px-4 sm:px-5 py-3.5 whitespace-nowrap">
                              {q.isAttempted && q.scorePct !== null ? (
                                <div className="flex items-center gap-2">
                                  <div className="w-16 bg-slate-100 rounded-full h-1.5 overflow-hidden">
                                    <div
                                      className={`h-full rounded-full ${
                                        q.scorePct >= 60
                                          ? 'bg-emerald-500'
                                          : q.scorePct >= 40
                                          ? 'bg-amber-500'
                                          : 'bg-rose-500'
                                      }`}
                                      style={{ width: `${Math.min(100, Math.max(0, q.scorePct))}%` }}
                                    />
                                  </div>
                                  <span className="text-xs font-bold text-slate-700">
                                    {q.score}/{q.maxScore} ({q.scorePct}%)
                                  </span>
                                </div>
                              ) : (
                                <span className="text-slate-400 text-xs italic">No score</span>
                              )}
                            </td>
                            <td className="px-4 sm:px-5 py-3.5 whitespace-nowrap text-xs text-slate-500">
                              {q.attemptsCount > 0 ? (
                                <span className="font-semibold text-slate-700 px-2 py-0.5 bg-slate-100 rounded-md border border-slate-200/60">
                                  {q.attemptsCount} {q.attemptsCount === 1 ? 'attempt' : 'attempts'}
                                </span>
                              ) : (
                                <span className="text-slate-400">0</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </Card>
              )}
            </div>
          ) : subjects.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-slate-400 text-xs sm:text-sm">
              <BookOpen className="w-8 h-8 text-slate-300 mb-2" />
              <span>No module data available for this student.</span>
            </div>
          ) : (
            subjects.map((subject) => (
              <Card key={subject.subject_id} className="border border-slate-200/80 shadow-xs rounded-2xl overflow-hidden bg-white">
                <CardHeader className="border-b border-slate-100 bg-slate-50/50 px-4 sm:px-6 py-3 sm:py-3.5">
                  <CardTitle className="text-xs sm:text-sm font-bold text-slate-800 flex items-center gap-2">
                    <BookOpen className="w-4 h-4 text-indigo-500" />
                    <span>{subject.subject_name}</span>
                  </CardTitle>
                </CardHeader>

                {/* Mobile Card List */}
                <div className="divide-y divide-slate-100 md:hidden">
                  {subject.topics.map((topic) => (
                    <TopicMobileCard key={topic.topic_id} topic={topic} />
                  ))}
                </div>

                {/* Desktop Table View */}
                <div className="hidden md:block overflow-x-auto no-scrollbar bg-white w-full min-w-0">
                  <table className="w-full text-xs sm:text-[13px]">
                    <thead className="bg-slate-50 border-b border-slate-100 text-[11px] text-slate-500 uppercase font-semibold">
                      <tr>
                        <th className="text-left px-4 sm:px-5 py-3 whitespace-nowrap w-2/5">Module</th>
                        <th className="text-left px-4 sm:px-5 py-3 whitespace-nowrap">Progress</th>
                        <th className="text-left px-4 sm:px-5 py-3 whitespace-nowrap">Quiz Score</th>
                        <th className="text-left px-4 sm:px-5 py-3 whitespace-nowrap">Assignment</th>
                        <th className="text-left px-4 sm:px-5 py-3 whitespace-nowrap">Project</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {subject.topics.map((topic) => (
                        <TopicRowView key={topic.topic_id} topic={topic} />
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
