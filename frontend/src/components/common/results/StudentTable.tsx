import { useState, useEffect, useMemo, useRef, Fragment } from 'react';
import { Search, ChevronLeft, ChevronRight, Square, Eye, ExternalLink, Filter } from 'lucide-react';
import { Link, useLocation } from 'react-router';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import apiClient from '@/services/api';

type Result = {
  submission_id?: string;
  id?: string;
  student_name: string;
  marks: number;
  feedback: string | Record<string, any> | null;
  submission_link?: string;
  submission_file_url?: string;
  status?: string;
};

type Props = {
  results: Result[];
  evaluation?: any;
  assignmentId?: string;
  onRefresh?: () => void;
};




const StudentTable = ({ results, evaluation, assignmentId, onRefresh }: Props) => {
  const location = useLocation();
  const basePath = location.pathname.includes('/facilitator/') ? '/dashboard/facilitator' : '/dashboard/admin';
  const [selectedSubmissions, setSelectedSubmissions] = useState<string[]>([]);
  const [bulkEvaluatorType, setBulkEvaluatorType] = useState<string>('');
  const [bulkReEvaluating, setBulkReEvaluating] = useState(false);
  const [stopping, setStopping] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'evaluated' | 'not_evaluated' | 'failed'>('all');
  const [failureReasonFilter, setFailureReasonFilter] = useState<string>('all');
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 10;

  const getFailureReason = (item: any): string => {
    if (typeof item.feedback === 'string' && item.feedback.trim()) {
      return item.feedback;
    }
    if (item.feedback && typeof item.feedback === 'object') {
      return item.feedback.summary || item.feedback.error || item.feedback.message || item.feedback.issues?.[0] || JSON.stringify(item.feedback);
    }
    return item.error_message || item.error || '';
  };

  const isRowFailed = (item: any): boolean => {
    if (item.status === 'pending' || item.status === 'evaluating' || item.status === 'running') return false;
    if (item.status === 'failed') return true;
    const reason = (getFailureReason(item) || '').toLowerCase();
    return Boolean(
      (item.marks === 0 || item.marks === null || item.marks === undefined) &&
      (
        reason.includes('private or restricted') ||
        reason.includes('permission denied') ||
        reason.includes('access denied') ||
        reason.includes('evaluation failed') ||
        reason.includes('anyone with the link') ||
        reason.includes('returned an html web page instead of')
      )
    );
  };

  const isRowEvaluating = (item: any) => {
    if (isRowFailed(item)) return false;
    const rowId = item.submission_id || item.id;
    if (bulkReEvaluating && selectedSubmissions.includes(rowId)) return true;
    return Boolean(
      (item.status === 'pending' || item.status === 'evaluating' || item.status === 'running') && item.id
    );
  };

  const isRowUnevaluated = (item: any) => {
    if (isRowFailed(item)) return false;
    return Boolean(
      item.status === 'not_evaluated' ||
      item.status === 'not_started' ||
      item.status === 'unevaluated' ||
      item.status === 'cancelled' ||
      item.status === 'stopped' ||
      (!item.id && (item.status === 'pending' || !item.status))
    );
  };

  // Authoritative grade calculator: guarantees score in table matches rubric criteria sum
  const getEffectiveScore = (item: any) => {
    if (isRowEvaluating(item) || isRowUnevaluated(item) || item.status === 'cancelled' || item.status === 'stopped' || isRowFailed(item)) return null;
    let breakdown = null;
    if (item.feedback) {
      let fb = item.feedback;
      if (typeof fb === 'string') {
        try { fb = JSON.parse(fb); } catch {}
      }
      if (fb && typeof fb === 'object') {
        breakdown = fb.breakdown || fb.rubric_breakdown;
      }
    }
    if (Array.isArray(breakdown) && breakdown.length > 0) {
      const sum = breakdown.reduce((acc: number, it: any) => acc + Number(it.score ?? it.awarded ?? it.points ?? it.marks ?? 0), 0);
      if (!isNaN(sum) && sum > 0) return sum;
    }
    return Number(item.marks ?? 0);
  };

  const getConciseFailureBadge = (item: any): string => {
    const reason = (getFailureReason(item) || '').toLowerCase();
    if (reason.includes('permission') || reason.includes('access') || reason.includes('private') || reason.includes('restricted') || reason.includes('anyone with the link')) {
      return 'Permission Denied';
    }
    if (reason.includes('google drive') || reason.includes('drive.google') || reason.includes('download')) {
      return 'Drive Link Restricted';
    }
    if (reason.includes('timeout') || reason.includes('timed out')) {
      return 'Evaluation Timeout';
    }
    if (reason.includes('format') || reason.includes('unsupported') || reason.includes('extension') || reason.includes('xlsx') || reason.includes('host') || reason.includes('source') || reason.includes('invalid url')) {
      return 'Invalid Format';
    }
    if (reason.includes('empty') || reason.includes('not found') || reason.includes('404')) {
      return 'File Not Found';
    }
    if (reason.includes('interrupted') || reason.includes('stalled') || reason.includes('worker') || reason.includes('retry evaluation') || reason.includes('re-evaluate') || reason.includes('not queued')) {
      return 'Worker Interrupted';
    }
    if (reason.includes('syntax') || reason.includes('corrupt') || reason.includes('parse')) {
      return 'Syntax / Parse Error';
    }
    return 'Other Error';
  };

  // Keep refs to latest values so setInterval callbacks are never stale
  const onRefreshRef = useRef(onRefresh);
  const resultsRef = useRef(results);
  useEffect(() => { onRefreshRef.current = onRefresh; }, [onRefresh]);
  useEffect(() => { resultsRef.current = results; }, [results]);

  const hasPending = results.some((r) => isRowEvaluating(r));
  const hasActiveEvaluation = hasPending || bulkReEvaluating;

  // Poll for updates whenever any row is pending or bulk evaluation is active
  useEffect(() => {
    if (!evaluation?.id || (!hasPending && !hasActiveEvaluation)) return;

    let retries = 0;
    const MAX_RETRIES = 120; // ~5 minutes at 2.5s interval
    let lastCompletedCount = resultsRef.current.filter(
      (r) => (r.status === 'completed' || r.status === 'failed') && r.id
    ).length;

    let isSyncing = false;
    const interval = setInterval(async () => {
      const isStillPending = resultsRef.current.some((r) => isRowEvaluating(r)) || bulkReEvaluating;
      if (!isStillPending || retries >= MAX_RETRIES) {
        clearInterval(interval);
        return;
      }
      if (isSyncing) return; // Prevent concurrent in-flight sync requests from piling up
      isSyncing = true;
      retries++;
      try {
        const { data } = await apiClient.get(`/evaluations/sync/${evaluation.id}`, {
          params: { _t: Date.now() },
        });
        const newCount = data?.progress?.completed ?? 0;
        const isFinished = data?.progress?.isFinished ?? false;

        if (isFinished) {
          clearInterval(interval);
          onRefreshRef.current?.();
          return;
        }

        // Refresh when a new job completed, or periodically every 4 polls (~12s) as a safety net
        if (newCount > lastCompletedCount || retries % 4 === 0) {
          lastCompletedCount = newCount;
          onRefreshRef.current?.();
        }
      } catch (err) {
        console.error('Failed to sync evaluation status:', err);
      } finally {
        isSyncing = false;
      }
    }, 3000);

    return () => clearInterval(interval);
  }, [evaluation?.id, hasPending, hasActiveEvaluation, bulkReEvaluating]);

  const statusCounts = useMemo(() => {
    let evaluated = 0;
    let not_evaluated = 0;
    let failed = 0;
    for (const r of results) {
      if (isRowFailed(r)) {
        failed++;
      } else if (isRowUnevaluated(r)) {
        not_evaluated++;
      } else if (r.status === 'completed' || r.status === 'evaluated' || (!isRowEvaluating(r) && r.status !== 'cancelled' && r.status !== 'stopped')) {
        evaluated++;
      }
    }
    return {
      all: results.length,
      evaluated,
      not_evaluated,
      failed,
    };
  }, [results]);

  const failureReasonCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const r of results) {
      if (isRowFailed(r)) {
        const badge = getConciseFailureBadge(r);
        counts[badge] = (counts[badge] || 0) + 1;
      }
    }
    return counts;
  }, [results]);

  const availableFailureTypes = useMemo(() => {
    const totalFailed = statusCounts.failed;
    const entries = Object.entries(failureReasonCounts)
      .filter(([_, count]) => count > 0)
      .map(([label, count]) => ({
        id: label,
        label,
        count,
      }))
      .sort((a, b) => b.count - a.count);

    return [
      { id: 'all', label: 'All Failed', count: totalFailed },
      ...entries,
    ];
  }, [failureReasonCounts, statusCounts.failed]);

  const filteredResults = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    let list = results;

    if (q) {
      list = list.filter((r) => {
        const name = (r.student_name || '').toLowerCase();
        const feedback = (r.feedback || '').toLowerCase();
        return name.includes(q) || feedback.includes(q);
      });
    }

    if (statusFilter === 'evaluated') {
      list = list.filter((r) => !isRowFailed(r) && !isRowUnevaluated(r) && !isRowEvaluating(r) && r.status !== 'cancelled' && r.status !== 'stopped');
    } else if (statusFilter === 'not_evaluated') {
      list = list.filter((r) => isRowUnevaluated(r) && !isRowFailed(r));
    } else if (statusFilter === 'failed') {
      list = list.filter((r) => {
        if (!isRowFailed(r)) return false;
        if (failureReasonFilter !== 'all') {
          return getConciseFailureBadge(r).toLowerCase() === failureReasonFilter.toLowerCase();
        }
        return true;
      });
    }

    return [...list].sort((a, b) => {
      const nameA = (a.student_name || '').trim();
      const nameB = (b.student_name || '').trim();
      const cmp = nameA.localeCompare(nameB, undefined, { sensitivity: 'base' });
      if (cmp !== 0) return cmp;
      return String(a.submission_id || a.id || '').localeCompare(String(b.submission_id || b.id || ''));
    });
  }, [results, searchQuery, statusFilter, failureReasonFilter]);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, statusFilter, failureReasonFilter]);

  const totalPages = Math.max(1, Math.ceil(filteredResults.length / pageSize));
  const paginatedResults = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredResults.slice(start, start + pageSize);
  }, [filteredResults, currentPage, pageSize]);

  const handleBulkReevaluate = async () => {
    if (!onRefresh || selectedSubmissions.length === 0) return;
    const type = bulkEvaluatorType || evaluation?.evaluator_type || undefined;

    try {
      setBulkReEvaluating(true);
      await apiClient.post('/evaluations/re-evaluate', {
        evaluationId: evaluation?.id,
        assignmentId: assignmentId,
        submissionIds: selectedSubmissions,
        evaluatorType: type
      });
      setSelectedSubmissions([]); // Clear selection on success
      await onRefresh();
    } catch (err: any) {
      alert("Failed to bulk re-evaluate: " + (err.response?.data?.message || err.message));
    } finally {
      setBulkReEvaluating(false);
    }
  };

  const handleStopEvaluation = async () => {
    if (!evaluation?.id && !assignmentId) return;
    if (!window.confirm('Are you sure you want to stop the ongoing evaluation?')) return;

    try {
      setStopping(true);
      await apiClient.post('/evaluations/stop', {
        evaluationId: evaluation?.id,
        assignmentId: assignmentId
      });
      onRefresh?.();
    } catch (err: any) {
      alert("Failed to stop evaluation: " + (err.response?.data?.message || err.message));
    } finally {
      setStopping(false);
    }
  };

  const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.checked) {
      setSelectedSubmissions(filteredResults.map(r => r.submission_id || r.id || '').filter(Boolean));
    } else {
      setSelectedSubmissions([]);
    }
  };

  const handleSelect = (id: string) => {
    setSelectedSubmissions(prev => 
      prev.includes(id) ? prev.filter(sId => sId !== id) : [...prev, id]
    );
  };

  const allSelectedAreUnevaluated =
    selectedSubmissions.length > 0 &&
    selectedSubmissions.every((id) => {
      const item = results.find((r) => (r.submission_id || r.id || '') === id);
      return item && isRowUnevaluated(item);
    });

  return (
    <div className="mt-4 sm:mt-6 border border-slate-200 bg-white rounded-2xl overflow-hidden shadow-xs min-w-0">
      <div className="p-3.5 sm:p-4 border-b border-slate-100 bg-slate-50/50 space-y-3">
        {/* Top Tier: Title, Search, and Action Controls */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div className="flex flex-col sm:flex-row sm:items-center gap-2.5 sm:gap-3 flex-1 min-w-0">
            <h2 className="font-bold text-xs sm:text-sm text-slate-900 shrink-0">Student Results</h2>
            <div className="relative w-full sm:w-72">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="text"
                placeholder="Search student or feedback..."
                className="w-full pl-9 pr-3 py-1.5 text-xs sm:text-sm bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-400 min-h-[36px]"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
          </div>

          {evaluation && (
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full sm:w-auto shrink-0">
              <select
                value={bulkEvaluatorType}
                onChange={(e) => setBulkEvaluatorType(e.target.value)}
                className="text-xs sm:text-sm border border-slate-200 bg-white rounded-xl px-3 py-1.5 text-slate-700 min-h-[36px] focus:outline-none focus:ring-2 focus:ring-blue-100 cursor-pointer"
              >
                <option value="">Auto (based on {evaluation?.is_project || evaluation?.project_id ? 'project' : 'assignment'})</option>
                <option value="REACT">React</option>
                <option value="JS">JavaScript</option>
                <option value="VISUAL">Visual</option>
                <option value="backend">Backend (Node)</option>
                <option value="python">Python</option>
                <option value="fullstack">Fullstack</option>
                <option value="EXCEL">Excel</option>
                <option value="SQL">SQL</option>
              </select>
              <button 
                className="text-xs sm:text-sm font-semibold px-4 py-1.5 bg-blue-600 text-white rounded-xl hover:bg-blue-700 disabled:opacity-50 min-h-[36px] transition shadow-xs flex items-center justify-center whitespace-nowrap cursor-pointer"
                onClick={handleBulkReevaluate}
                disabled={bulkReEvaluating || stopping || selectedSubmissions.length === 0}
              >
                {bulkReEvaluating ? 'Evaluating...' : (evaluation?.id && !allSelectedAreUnevaluated ? 'Re-evaluate Selected' : 'Evaluate Selected')}
              </button>
              {hasActiveEvaluation && (
                <button 
                  className="text-xs sm:text-sm px-3.5 py-1.5 bg-red-600 text-white rounded-xl hover:bg-red-700 disabled:opacity-50 flex items-center justify-center gap-1.5 transition-colors font-medium shadow-sm min-h-[36px] whitespace-nowrap cursor-pointer"
                  onClick={handleStopEvaluation}
                  disabled={stopping}
                  title="Stop ongoing evaluations"
                >
                  <Square size={13} className="fill-current" />
                  {stopping ? 'Stopping...' : 'Stop Evaluation'}
                </button>
              )}
            </div>
          )}
        </div>

        {/* Bottom Tier: Status Filter Tabs & Failure Breakdown Sub-Filters */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pt-0.5 flex-wrap">
          {/* Status Filter Tabs */}
          <div className="flex items-center gap-1.5 flex-wrap">
            {[
              { id: 'all', label: 'All', count: statusCounts.all },
              { id: 'evaluated', label: 'Evaluated', count: statusCounts.evaluated, activeColor: 'bg-emerald-600 text-white border-emerald-600' },
              { id: 'not_evaluated', label: 'Not evaluated', count: statusCounts.not_evaluated, activeColor: 'bg-orange-600 text-white border-orange-600' },
              { id: 'failed', label: 'Failed', count: statusCounts.failed, activeColor: 'bg-red-600 text-white border-red-600' },
            ].map((tab) => {
              const isActive = statusFilter === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => {
                    setStatusFilter(tab.id as any);
                    setFailureReasonFilter('all');
                    setCurrentPage(1);
                  }}
                  className={cn(
                    'px-3 py-1.5 text-xs font-semibold rounded-xl border transition whitespace-nowrap flex items-center gap-1.5 min-h-[34px] cursor-pointer shrink-0',
                    isActive
                      ? (tab.activeColor || 'bg-slate-900 text-white border-slate-900 shadow-2xs')
                      : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-100 hover:text-slate-900 shadow-2xs',
                  )}
                >
                  <span>{tab.label}</span>
                  <span
                    className={cn(
                      'text-[10px] px-1.5 py-0.2 rounded-full font-bold',
                      isActive ? 'bg-white/25 text-white' : 'bg-slate-100 text-slate-600',
                    )}
                  >
                    {tab.count}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Dynamic Failure Reason Sub-Filter Bar (visible when Failed tab is active and failure types exist) */}
          {statusFilter === 'failed' && availableFailureTypes.length > 1 && (
            <div className="flex items-center gap-2 flex-wrap bg-red-50/80 border border-red-200/90 rounded-xl px-3 py-1.5 shadow-2xs animate-in fade-in duration-200">
              <span className="text-xs font-bold text-red-900 flex items-center gap-1.5 shrink-0">
                <Filter className="w-3.5 h-3.5 text-red-600" />
                Filter by Failure:
              </span>
              <div className="flex items-center gap-1.5 flex-wrap">
                {availableFailureTypes.map((type) => {
                  const isSelected = failureReasonFilter.toLowerCase() === type.id.toLowerCase();
                  return (
                    <button
                      key={type.id}
                      onClick={() => {
                        setFailureReasonFilter(type.id);
                        setCurrentPage(1);
                      }}
                      className={cn(
                        'px-2.5 py-1 text-xs font-medium rounded-lg border transition whitespace-nowrap flex items-center gap-1.5 cursor-pointer shrink-0',
                        isSelected
                          ? 'bg-red-600 text-white border-red-600 font-semibold shadow-2xs'
                          : 'bg-white text-slate-700 border-red-200/80 hover:bg-red-100/70 hover:text-red-900 shadow-2xs'
                      )}
                    >
                      <span>{type.label}</span>
                      <span
                        className={cn(
                          'text-[10px] px-1.5 py-0.2 rounded-full font-bold',
                          isSelected ? 'bg-white/25 text-white' : 'bg-red-100 text-red-700'
                        )}
                      >
                        {type.count}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Mobile Card View (< md) */}
      <div className="md:hidden divide-y divide-slate-100">
        {results.length === 0 ? (
          <div className="p-4 text-center text-slate-400 text-xs">No students available</div>
        ) : filteredResults.length === 0 ? (
          <div className="p-4 text-center text-slate-400 text-xs">No matching student results found</div>
        ) : (
          paginatedResults.map((item, i) => {
            const rowId = item.submission_id || item.id || '';
            return (
              <div key={i} className="p-3.5 space-y-2.5 bg-white">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    <input 
                      type="checkbox" 
                      checked={selectedSubmissions.includes(rowId)}
                      onChange={() => handleSelect(rowId)}
                      className="w-4 h-4 rounded border-slate-300 shrink-0"
                    />
                    <span className="font-bold text-xs sm:text-sm text-slate-900 truncate">
                      {item.student_name}
                    </span>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    {isRowEvaluating(item) ? (
                      <span className="text-amber-700 text-[10px] font-bold bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200 animate-pulse">
                        Evaluating...
                      </span>
                    ) : item.status === 'cancelled' || item.status === 'stopped' ? (
                      <span className="text-slate-500 text-[10px] font-bold bg-slate-100 px-2 py-0.5 rounded-full border border-slate-200" title="Evaluation stopped — select and click Evaluate Selected">
                        Stopped
                      </span>
                    ) : isRowUnevaluated(item) ? (
                      <span className="text-orange-600 text-[10px] font-bold bg-orange-50 px-2 py-0.5 rounded-full border border-orange-200" title="Not evaluated yet — select and click Evaluate Selected">
                        Not evaluated
                      </span>
                    ) : isRowFailed(item) ? (
                      <div className="flex flex-col items-end">
                        <span className="text-red-600 text-[10px] font-bold bg-red-50 px-2 py-0.5 rounded-full border border-red-200 cursor-help" title={getFailureReason(item)}>
                          Failed
                        </span>
                        {getConciseFailureBadge(item) && (
                          <span className="text-[9px] text-red-500 font-medium max-w-[100px] truncate mt-0.5" title={getFailureReason(item)}>
                            {getConciseFailureBadge(item)}
                          </span>
                        )}
                      </div>
                    ) : (
                      <span className="text-green-700 text-[10px] font-bold bg-green-50 px-2 py-0.5 rounded-full border border-green-200">
                        Evaluated
                      </span>
                    )}

                    {isRowEvaluating(item) ? (
                      <span className="font-semibold text-xs text-amber-700 bg-amber-50 px-2 py-0.5 rounded-md border border-amber-200 animate-pulse">
                        Evaluating...
                      </span>
                    ) : isRowUnevaluated(item) || item.status === 'cancelled' || isRowFailed(item) ? (
                      <span className="font-medium text-xs text-slate-400 bg-slate-50 px-2 py-0.5 rounded-md border border-slate-200">
                        —
                      </span>
                    ) : (
                      <span className="font-extrabold text-xs text-slate-900 bg-slate-100 px-2 py-0.5 rounded-md">
                        {getEffectiveScore(item)} pts
                      </span>
                    )}
                  </div>
                </div>

                {/* Action Bar */}
                <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                  <Link
                    to={`${basePath}/results/${assignmentId || evaluation?.id}/student/${rowId}`}
                    state={{ studentResult: item, evaluation }}
                    className="inline-flex items-center gap-1 text-xs font-semibold text-blue-600 bg-blue-50 hover:bg-blue-100 px-2.5 py-1.5 rounded-lg transition"
                    title="View detailed student evaluation result"
                  >
                    <Eye size={13} />
                    <span>View Details</span>
                  </Link>
                  {item.submission_link ? (
                    <a href={item.submission_link} target="_blank" rel="noreferrer" className="text-slate-600 hover:text-slate-800 text-xs font-medium bg-slate-100 px-2.5 py-1.5 rounded-lg transition flex items-center gap-1">
                      <ExternalLink size={12} /> Link
                    </a>
                  ) : item.submission_file_url ? (
                    <a href={item.submission_file_url} target="_blank" rel="noreferrer" className="text-slate-600 hover:text-slate-800 text-xs font-medium bg-slate-100 px-2.5 py-1.5 rounded-lg transition flex items-center gap-1">
                      <ExternalLink size={12} /> File
                    </a>
                  ) : null}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Desktop Table View (>= md) */}
      <div className="hidden md:block overflow-x-auto custom-scrollbar w-full min-w-0">
        <table className="w-full min-w-[700px] text-xs sm:text-sm border-separate border-spacing-0">
          <thead className="bg-slate-50/60 text-slate-500 text-[11px] sm:text-xs uppercase">
            <tr>
              <th className="p-3 text-left w-12">
                <input 
                  type="checkbox" 
                  onChange={handleSelectAll}
                  checked={filteredResults.length > 0 && selectedSubmissions.length === filteredResults.length}
                  className="w-4 h-4 rounded border-slate-300"
                />
              </th>
              <th className="p-3 text-left font-semibold">Student</th>
              <th className="p-3 font-semibold text-center">Status</th>
              <th className="p-3 font-semibold text-center">Score</th>
              <th className="p-3 font-semibold text-right">Action</th>
            </tr>
          </thead>

          <tbody>
            {filteredResults.length === 0 ? (
              <tr>
                <td colSpan={5} className="p-4 text-center text-slate-400 text-xs sm:text-sm">
                  No matching student results found.
                </td>
              </tr>
            ) : (
              paginatedResults.map((item, i) => {
                const rowId = item.submission_id || item.id || '';
                return (
                <tr key={i} className="border-t border-slate-100 hover:bg-slate-50/60 transition">
                  <td className="p-3 text-left">
                    <input 
                      type="checkbox" 
                      checked={selectedSubmissions.includes(rowId)}
                      onChange={() => handleSelect(rowId)}
                      className="w-4 h-4 rounded border-slate-300"
                    />
                  </td>
                  <td className="p-3 font-medium text-slate-900">{item.student_name}</td>
                  <td className="p-3 text-center">
                    {isRowEvaluating(item) ? (
                      <span className="text-amber-700 text-xs font-semibold bg-amber-50 px-2.5 py-0.5 rounded-full border border-amber-200 animate-pulse">
                        Evaluating...
                      </span>
                    ) : item.status === 'cancelled' || item.status === 'stopped' ? (
                      <span className="text-slate-600 text-xs font-semibold bg-slate-100 px-2.5 py-0.5 rounded-full border border-slate-200" title="Evaluation stopped — select and click Evaluate Selected">
                        Stopped
                      </span>
                    ) : isRowUnevaluated(item) ? (
                      <span className="text-orange-600 text-xs font-semibold bg-orange-50 px-2.5 py-0.5 rounded-full border border-orange-200" title="Not evaluated yet — select and click Evaluate Selected">
                        Not evaluated
                      </span>
                    ) : isRowFailed(item) ? (
                      <div className="flex flex-col items-center">
                        <span className="text-red-600 text-xs font-semibold bg-red-50 px-2.5 py-0.5 rounded-full border border-red-200 cursor-help" title={getFailureReason(item)}>
                          Failed
                        </span>
                        {getConciseFailureBadge(item) && (
                          <span className="text-[10px] text-red-500 font-medium max-w-[130px] truncate mt-0.5" title={getFailureReason(item)}>
                            {getConciseFailureBadge(item)}
                          </span>
                        )}
                      </div>
                    ) : (
                      <span className="text-green-700 text-xs font-semibold bg-green-50 px-2.5 py-0.5 rounded-full border border-green-200">
                        Evaluated
                      </span>
                    )}
                  </td>
                  <td className="p-3 text-center font-bold text-slate-900">
                    {isRowEvaluating(item) ? (
                      <span className="text-amber-700 text-xs font-semibold bg-amber-50 px-2 py-0.5 rounded border border-amber-200 animate-pulse">
                        Evaluating...
                      </span>
                    ) : isRowUnevaluated(item) || item.status === 'cancelled' || isRowFailed(item) ? (
                      <span className="text-slate-400 font-medium text-xs sm:text-sm">
                        —
                      </span>
                    ) : (
                      getEffectiveScore(item)
                    )}
                  </td>
                  <td className="p-3 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <Link
                        to={`${basePath}/results/${assignmentId || evaluation?.id}/student/${rowId}`}
                        state={{ studentResult: item, evaluation }}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold text-blue-600 bg-blue-50 hover:bg-blue-100 border border-blue-200/60 transition shadow-2xs"
                        title="View detailed student feedback and rubric breakdown"
                      >
                        <Eye size={13} />
                        <span>View Details</span>
                      </Link>
                      {item.submission_link ? (
                        <a href={item.submission_link} target="_blank" rel="noreferrer" className="text-slate-500 hover:text-slate-800 text-xs font-medium px-2 py-1 rounded-md hover:bg-slate-100 transition flex items-center gap-1" title="View Submitted Link">
                          <ExternalLink size={12} /> Link
                        </a>
                      ) : item.submission_file_url ? (
                        <a href={item.submission_file_url} target="_blank" rel="noreferrer" className="text-slate-500 hover:text-slate-800 text-xs font-medium px-2 py-1 rounded-md hover:bg-slate-100 transition flex items-center gap-1" title="Download Submitted File">
                          <ExternalLink size={12} /> File
                        </a>
                      ) : null}
                    </div>
                  </td>
                </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination Footer */}
      {filteredResults.length > 0 && totalPages > 1 && (
        <div className="px-4 py-3 border-t border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-2.5 bg-slate-50/80">
          <p className="text-[11px] sm:text-xs text-slate-500 font-medium">
            Showing <span className="font-bold text-slate-800">{(currentPage - 1) * pageSize + 1}</span> to{' '}
            <span className="font-bold text-slate-800">{Math.min(currentPage * pageSize, filteredResults.length)}</span> of{' '}
            <span className="font-bold text-slate-800">{filteredResults.length}</span> results
          </p>

          <div className="flex items-center gap-1.5">
            <Button
              variant="outline"
              size="sm"
              disabled={currentPage <= 1}
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              className="rounded-lg h-7 px-2 text-xs text-slate-700 bg-white shadow-2xs hover:bg-slate-50"
            >
              <ChevronLeft className="h-3.5 w-3.5 mr-0.5" />
              Prev
            </Button>

            <div className="flex items-center gap-1 mx-0.5">
              {Array.from({ length: totalPages }, (_, i) => i + 1)
                .filter((p) => p === 1 || p === totalPages || Math.abs(p - currentPage) <= 1)
                .map((p, idx, arr) => (
                  <Fragment key={p}>
                    {idx > 0 && arr[idx - 1] !== p - 1 && (
                      <span className="text-slate-300 text-xs px-0.5 select-none">...</span>
                    )}
                    <button
                      onClick={() => setCurrentPage(p)}
                      className={cn(
                        'w-6 h-6 rounded-md text-xs font-bold transition-all flex items-center justify-center',
                        currentPage === p
                          ? 'bg-[#1e2653] text-white shadow-xs'
                          : 'text-slate-600 bg-white border border-slate-200 hover:bg-slate-100',
                      )}
                    >
                      {p}
                    </button>
                  </Fragment>
                ))}
            </div>

            <Button
              variant="outline"
              size="sm"
              disabled={currentPage >= totalPages}
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              className="rounded-lg h-7 px-2 text-xs text-slate-700 bg-white shadow-2xs hover:bg-slate-50"
            >
              Next
              <ChevronRight className="h-3.5 w-3.5 ml-0.5" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};

export default StudentTable;