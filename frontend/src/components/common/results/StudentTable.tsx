import { useState, useEffect, useMemo, useRef, Fragment } from 'react';
import { Search, ChevronLeft, ChevronRight, Square } from 'lucide-react';
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

// Evaluator feedback comes back in different shapes depending on evaluator
// type: a plain string (Python), or a JSON string/object with `summary`/`feedback`
// field plus optional `strengths`/`issues`/`breakdown` arrays (JS/Visual/React).
// Parse it defensively and render something readable either way.
const FeedbackCell = ({ feedback }: { feedback: string | object | null }) => {
  if (!feedback) return <span className="text-slate-400">—</span>;

  let parsed: any = null;

  if (typeof feedback === 'object') {
    // pg already deserialized JSONB
    parsed = feedback;
  } else {
    const str = String(feedback).trim();
    if (!str || str === '""' || str === "''" || str === '"{}"' || str === '{}') {
      return <span className="text-slate-400">—</span>;
    }
    try {
      parsed = JSON.parse(str);
    } catch {
      // not JSON — plain string feedback, render as-is
      return <span className="text-sm text-slate-700 leading-snug">{str}</span>;
    }
  }

  if (typeof parsed === 'string') {
    const clean = parsed.trim();
    if (!clean || clean === '""' || clean === "''") {
      return <span className="text-slate-400">—</span>;
    }
    return <span className="text-sm text-slate-700 leading-snug">{clean}</span>;
  }

  if (!parsed || typeof parsed !== 'object') {
    return <span className="text-slate-400">—</span>;
  }

  // If summary is itself a stringified JSON (from legacy DB records), safely unwrap it
  if (typeof parsed.summary === 'string' && parsed.summary.trim().startsWith('{')) {
    try {
      const inner = JSON.parse(parsed.summary);
      if (inner && typeof inner === 'object' && !Array.isArray(inner)) {
        parsed = {
          ...parsed,
          ...inner,
          summary: inner.summary || inner.feedback || parsed.summary,
          strengths: (Array.isArray(inner.strengths) && inner.strengths.length > 0) ? inner.strengths : parsed.strengths,
          issues: (Array.isArray(inner.issues) && inner.issues.length > 0) ? inner.issues : parsed.issues,
          breakdown: (Array.isArray(inner.breakdown) && inner.breakdown.length > 0)
            ? inner.breakdown
            : (Array.isArray(inner.rubric_breakdown) && inner.rubric_breakdown.length > 0 ? inner.rubric_breakdown : parsed.breakdown),
        };
      }
    } catch {
      // not valid JSON, keep as is
    }
  }

  // Handle arrays (e.g. syntax or validation errors from the evaluator)
  if (Array.isArray(parsed)) {
    return (
      <ul className="list-disc list-inside text-red-600 text-xs mt-1">
        {parsed.map((err, i) => (
          <li key={i}>{err.feedback || err.error || JSON.stringify(err)}</li>
        ))}
      </ul>
    );
  }

  const breakdownData = Array.isArray(parsed.breakdown) && parsed.breakdown.length > 0
    ? parsed.breakdown
    : (Array.isArray(parsed.rubric_breakdown) && parsed.rubric_breakdown.length > 0 ? parsed.rubric_breakdown : []);

  const summary: string | undefined = parsed.summary || parsed.feedback;
  const lists: { label: string; items: string[]; color?: string }[] = [
    {
      label: '✅ Strengths',
      items: Array.isArray(parsed.strengths) ? parsed.strengths : [],
      color: 'text-emerald-600',
    },
    {
      label: '⚠️ Issues',
      items: Array.isArray(parsed.issues) ? parsed.issues : [],
      color: 'text-red-500',
    },
    {
      label: '📊 Score Breakdown',
      items: breakdownData.map(
        (b: any) => `${b.item || b.criterion || b.name || 'Criterion'}: ${b.awarded ?? b.points_awarded ?? b.score ?? 0}/${b.max ?? b.max_points ?? b.weight ?? ''} pts — ${b.reason || b.feedback || ''}`
      ),
      color: 'text-slate-600',
    },
  ].filter((l) => l.items.length > 0);

  return (
    <div className="max-w-xs">
      {summary && <p className="text-sm text-slate-700 leading-snug">{summary}</p>}
      {lists.length > 0 && (
        <details className="mt-2 text-xs">
          <summary className="cursor-pointer select-none font-medium text-slate-500 hover:text-slate-700">
            View Details
          </summary>
          {lists.map((l) => (
            <div key={l.label} className="mt-2">
              <span className={`font-semibold ${l.color || 'text-slate-600'}`}>
                {l.label}:
              </span>
              <ul className="list-disc list-inside mt-0.5 space-y-0.5">
                {l.items.map((item, i) => (
                  <li key={i} className={l.color || 'text-slate-500'}>
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </details>
      )}
      {!summary && lists.length === 0 && (
        <span className="text-slate-400">No feedback details available.</span>
      )}
    </div>
  );
};


const StudentTable = ({ results, evaluation, assignmentId, onRefresh }: Props) => {
  const [selectedSubmissions, setSelectedSubmissions] = useState<string[]>([]);
  const [bulkEvaluatorType, setBulkEvaluatorType] = useState<string>('');
  const [bulkReEvaluating, setBulkReEvaluating] = useState(false);
  const [stopping, setStopping] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 5;

  // Keep refs to latest values so setInterval callbacks are never stale
  const onRefreshRef = useRef(onRefresh);
  const resultsRef = useRef(results);
  useEffect(() => { onRefreshRef.current = onRefresh; }, [onRefresh]);
  useEffect(() => { resultsRef.current = results; }, [results]);

  const hasPending = results.some((r) => r.status === 'pending' && r.id);
  const hasActiveEvaluation = hasPending || bulkReEvaluating || evaluation?.status === 'running';

  // Poll for updates if any row is pending — interval is only created once per evaluation
  useEffect(() => {
    if (!evaluation?.id) return;

    let retries = 0;
    const MAX_RETRIES = 200; // ~10 minutes at 3s interval (defense against large class queue delays)
    let lastCompletedCount = -1; // Track progress — only refresh when count increases

    const interval = setInterval(async () => {
      // Only poll for REAL pending rows (those with an `id` in evaluation_results).
      // Virtual rows (new submissions not yet queued) have no `id` — they need
      // manual 'Evaluate Selected', not automatic polling.
      const isStillPending = resultsRef.current.some((r) => r.status === 'pending' && r.id);
      if (!isStillPending || retries >= MAX_RETRIES) {
        clearInterval(interval);
        return;
      }
      retries++;
      try {
        const { data } = await apiClient.get(`/evaluations/sync/${evaluation.id}`);
        const newCount = data?.progress?.completed ?? 0;
        const isFinished = data?.progress?.isFinished ?? false;
        if (isFinished) {
          // Evaluation done — refresh once and stop polling entirely
          onRefreshRef.current?.();
          clearInterval(interval);
          return;
        }
        // Only refresh when a new job just completed (count went up)
        if (newCount > lastCompletedCount) {
          lastCompletedCount = newCount;
          onRefreshRef.current?.();
        }
      } catch (err) {
        console.error('Failed to sync', err);
      }
    }, 3000);

    return () => clearInterval(interval);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [evaluation?.id]);

  const filteredResults = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return results;
    return results.filter((r) => {
      const name = (r.student_name || '').toLowerCase();
      const feedback = (r.feedback || '').toLowerCase();
      return name.includes(q) || feedback.includes(q);
    });
  }, [results, searchQuery]);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, results]);

  const totalPages = Math.max(1, Math.ceil(filteredResults.length / pageSize));
  const paginatedResults = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredResults.slice(start, start + pageSize);
  }, [filteredResults, currentPage, pageSize]);

  const handleBulkReevaluate = async () => {
    if (!onRefresh || selectedSubmissions.length === 0) return;
    const type = bulkEvaluatorType || evaluation?.evaluator_type || 'REACT';

    try {
      setBulkReEvaluating(true);
      await apiClient.post('/evaluations/re-evaluate', {
        evaluationId: evaluation?.id,
        assignmentId: assignmentId,
        submissionIds: selectedSubmissions,
        evaluatorType: type
      });
      setSelectedSubmissions([]); // Clear selection on success
      onRefresh();
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

  return (
    <div className="mt-4 sm:mt-6 border border-slate-200 bg-white rounded-2xl overflow-hidden shadow-xs min-w-0">
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5 sm:gap-3 p-3.5 sm:p-4 border-b border-slate-100 bg-slate-50/50">
        <div className="flex flex-col sm:flex-row sm:items-center gap-2.5 sm:gap-3 flex-1 min-w-0">
          <h2 className="font-bold text-xs sm:text-sm text-slate-900 shrink-0">Student Results</h2>
          <div className="relative w-full sm:max-w-xs">
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
          <div className='flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full sm:w-auto shrink-0'>
            <select
              value={bulkEvaluatorType}
              onChange={(e) => setBulkEvaluatorType(e.target.value)}
              className='text-xs sm:text-sm border border-slate-200 bg-white rounded-lg px-3 py-1.5 text-slate-700 min-h-[36px]'
            >
              <option value=''>Auto (based on assignment)</option>
              <option value='REACT'>React</option>
              <option value='JS'>JavaScript</option>
              <option value='VISUAL'>Visual</option>
              <option value='backend'>Backend (Node)</option>
              <option value='python'>Python</option>
              <option value='fullstack'>Fullstack</option>
            </select>
            <button 
              className="text-xs sm:text-sm font-semibold px-4 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 min-h-[36px] transition shadow-xs"
              onClick={handleBulkReevaluate}
              disabled={bulkReEvaluating || stopping || selectedSubmissions.length === 0}
            >
              {bulkReEvaluating ? 'Evaluating...' : (evaluation?.id ? 'Re-evaluate Selected' : 'Evaluate Selected')}
            </button>
            {hasActiveEvaluation && (
              <button 
                className="text-xs sm:text-sm px-3.5 py-1.5 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 flex items-center justify-center gap-1.5 transition-colors font-medium shadow-sm min-h-[36px]"
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
                    {item.status === 'pending' && item.id ? (
                      <span className="text-yellow-600 text-[10px] font-bold bg-yellow-50 px-2 py-0.5 rounded-full border border-yellow-200">Pending...</span>
                    ) : item.status === 'pending' && !item.id ? (
                      <span className="text-orange-600 text-[10px] font-bold bg-orange-50 px-2 py-0.5 rounded-full border border-orange-200" title="Submitted after evaluation started — select and click Evaluate Selected">Not evaluated</span>
                    ) : item.status === 'cancelled' ? (
                      <span className="text-slate-500 text-[10px] font-bold bg-slate-100 px-2 py-0.5 rounded-full border border-slate-200">Stopped</span>
                    ) : item.status === 'failed' ? (
                      <span className="text-red-600 text-[10px] font-bold bg-red-50 px-2 py-0.5 rounded-full border border-red-200">Failed</span>
                    ) : (
                      <span className="text-green-700 text-[10px] font-bold bg-green-50 px-2 py-0.5 rounded-full border border-green-200">Evaluated</span>
                    )}
                    <span className="font-extrabold text-xs text-slate-900 bg-slate-100 px-2 py-0.5 rounded-md">
                      {item.marks} pts
                    </span>
                  </div>
                </div>

                {/* Feedback */}
                {item.feedback && (
                  <div className="text-[11px] bg-slate-50/80 p-2.5 rounded-lg border border-slate-100 text-slate-700">
                    <FeedbackCell feedback={item.feedback} />
                  </div>
                )}

                {/* Action */}
                <div className="flex items-center justify-end pt-1">
                  {item.submission_link ? (
                    <a href={item.submission_link} target="_blank" rel="noreferrer" className="text-blue-600 text-xs font-semibold hover:underline flex items-center gap-1 bg-blue-50 px-2.5 py-1 rounded-lg">
                      View Link
                    </a>
                  ) : item.submission_file_url ? (
                    <a href={item.submission_file_url} target="_blank" rel="noreferrer" className="text-blue-600 text-xs font-semibold hover:underline flex items-center gap-1 bg-blue-50 px-2.5 py-1 rounded-lg">
                      View File
                    </a>
                  ) : (
                    <span className="text-slate-400 text-xs">—</span>
                  )}
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
              <th className="p-3 font-semibold">Feedback</th>
              <th className="p-3 font-semibold text-right">Action</th>
            </tr>
          </thead>

          <tbody>
            {filteredResults.length === 0 ? (
              <tr>
                <td colSpan={6} className="p-4 text-center text-slate-400 text-xs sm:text-sm">
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
                    {item.status === 'pending' && item.id ? (
                      <span className="text-yellow-600 text-xs font-semibold bg-yellow-50 px-2.5 py-0.5 rounded-full border border-yellow-200">Pending...</span>
                    ) : item.status === 'pending' && !item.id ? (
                      <span className="text-orange-600 text-xs font-semibold bg-orange-50 px-2.5 py-0.5 rounded-full border border-orange-200" title="Submitted after evaluation started — select and click Evaluate Selected">Not evaluated</span>
                    ) : item.status === 'cancelled' ? (
                      <span className="text-slate-600 text-xs font-semibold bg-slate-100 px-2.5 py-0.5 rounded-full border border-slate-200">Stopped</span>
                    ) : item.status === 'failed' ? (
                      <span className="text-red-600 text-xs font-semibold bg-red-50 px-2.5 py-0.5 rounded-full border border-red-200">Failed</span>
                    ) : (
                      <span className="text-green-700 text-xs font-semibold bg-green-50 px-2.5 py-0.5 rounded-full border border-green-200">Evaluated</span>
                    )}
                  </td>
                  <td className="p-3 text-center font-bold text-slate-900">{item.marks}</td>
                  <td className="p-3"><FeedbackCell feedback={item.feedback} /></td>
                  <td className="p-3 text-right">
                    <div className="flex items-center justify-end gap-2">
                      {item.submission_link ? (
                        <a href={item.submission_link} target="_blank" rel="noreferrer" className="text-blue-600 text-xs sm:text-sm font-semibold hover:underline flex items-center gap-1">
                          View Link
                        </a>
                      ) : item.submission_file_url ? (
                        <a href={item.submission_file_url} target="_blank" rel="noreferrer" className="text-blue-600 text-xs sm:text-sm font-semibold hover:underline flex items-center gap-1">
                          View File
                        </a>
                      ) : (
                        <span className="text-slate-400 text-xs sm:text-sm">—</span>
                      )}
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