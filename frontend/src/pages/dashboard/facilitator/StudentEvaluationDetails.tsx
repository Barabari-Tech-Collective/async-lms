import { useState, useEffect } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router';
import { 
  ArrowLeft, 
  ExternalLink, 
  FileText, 
  CheckCircle2, 
  AlertTriangle, 
  RefreshCw, 
  Award, 
  User, 
  Building2, 
  Calendar,
  Layers,
  ChevronRight,
  Sparkles
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import apiClient from '@/services/api';
import toast from 'react-hot-toast';

export default function StudentEvaluationDetails() {
  const { id, submissionId } = useParams<{ id: string; submissionId: string }>();
  const navigate = useNavigate();
  const location = useLocation();

  const [loading, setLoading] = useState(true);
  const [reEvaluating, setReEvaluating] = useState(false);
  const [evaluation, setEvaluation] = useState<any>(location.state?.evaluation || null);
  const [studentResult, setStudentResult] = useState<any>(location.state?.studentResult || null);

  const fetchDetails = async (showSkeleton = true) => {
    if (!id) return;
    try {
      if (showSkeleton) setLoading(true);
      const res = await apiClient.get(`/evaluations/assignment/${id}/results`, {
        params: { _t: Date.now() },
      });
      const evalData = res.data?.evaluation || null;
      const resultsList = res.data?.results || [];
      setEvaluation(evalData);

      const found = resultsList.find(
        (r: any) =>
          String(r.submission_id) === String(submissionId) ||
          String(r.id) === String(submissionId)
      );
      if (found) {
        setStudentResult(found);
      } else if (!studentResult) {
        toast.error('Student evaluation record not found');
      }
    } catch (err: any) {
      console.error('Failed to load student evaluation details:', err);
      toast.error('Failed to load evaluation details');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!studentResult) {
      fetchDetails(true);
    } else {
      setLoading(false);
      // Background re-fetch to ensure up-to-date status
      fetchDetails(false);
    }
  }, [id, submissionId]);

  const handleReEvaluate = async () => {
    const subId = studentResult?.submission_id || submissionId;
    const evalId = evaluation?.id || id;
    if (!subId || !evalId) {
      toast.error('Missing submission or evaluation reference');
      return;
    }

    setReEvaluating(true);
    try {
      const res = await apiClient.post('/evaluations/re-evaluate', {
        submissionId: subId,
        evaluationId: evalId,
      });
      if (res.data?.success) {
        toast.success('Re-evaluation queued! Refreshing in a few moments...');
        setTimeout(() => fetchDetails(false), 3000);
      } else {
        toast.error(res.data?.message || 'Failed to trigger re-evaluation');
      }
    } catch (err: any) {
      console.error('Re-evaluate error:', err);
      toast.error(err?.response?.data?.message || 'Re-evaluation request failed');
    } finally {
      setReEvaluating(false);
    }
  };

  // ─── Parse Feedback Defensively ───
  const parseFeedback = (raw: any) => {
    if (!raw) return { summary: '', strengths: [], issues: [], breakdown: [], cellEvidence: [] };

    let parsed: any = raw;
    if (typeof raw === 'string') {
      const str = raw.trim();
      if (!str || str === '""' || str === "''" || str === '"{}"' || str === '{}') {
        return { summary: '', strengths: [], issues: [], breakdown: [], cellEvidence: [] };
      }
      try {
        parsed = JSON.parse(str);
      } catch {
        return { summary: str, strengths: [], issues: [], breakdown: [], cellEvidence: [] };
      }
    }

    if (typeof parsed === 'string') {
      return { summary: parsed, strengths: [], issues: [], breakdown: [], cellEvidence: [] };
    }

    if (Array.isArray(parsed)) {
      return {
        summary: 'Multiple evaluation issues encountered during grading.',
        strengths: [],
        issues: parsed.map((e: any) => e.feedback || e.error || JSON.stringify(e)),
        breakdown: [],
        cellEvidence: [],
      };
    }

    // Safely unwrap double-stringified summary
    if (typeof parsed.summary === 'string' && parsed.summary.trim().startsWith('{')) {
      try {
        const inner = JSON.parse(parsed.summary);
        if (inner && typeof inner === 'object') {
          parsed = {
            ...parsed,
            ...inner,
            summary: inner.summary || inner.feedback || parsed.summary,
            strengths: Array.isArray(inner.strengths) && inner.strengths.length > 0 ? inner.strengths : parsed.strengths,
            issues: Array.isArray(inner.issues) && inner.issues.length > 0 ? inner.issues : parsed.issues,
            breakdown: (Array.isArray(inner.breakdown) && inner.breakdown.length > 0)
              ? inner.breakdown
              : (Array.isArray(inner.rubric_breakdown) ? inner.rubric_breakdown : parsed.breakdown),
          };
        }
      } catch {}
    }

    const summary = parsed.summary || parsed.feedback || '';
    const strengths = Array.isArray(parsed.strengths) ? parsed.strengths : [];
    const issues = Array.isArray(parsed.issues) ? parsed.issues : [];
    const breakdown = Array.isArray(parsed.breakdown) && parsed.breakdown.length > 0
      ? parsed.breakdown
      : (Array.isArray(parsed.rubric_breakdown) && parsed.rubric_breakdown.length > 0 ? parsed.rubric_breakdown : []);

    const cellEvidence = Array.isArray(parsed.cell_evidence)
      ? parsed.cell_evidence
      : (Array.isArray(parsed.assertion_results) ? parsed.assertion_results : []);

    return { summary, strengths, issues, breakdown, cellEvidence };
  };

  const { summary, strengths, issues, breakdown, cellEvidence } = parseFeedback(studentResult?.feedback);

  const marks = Number(studentResult?.marks ?? 0);
  const maxScore = Number(evaluation?.max_score ?? 100);
  const percentage = Math.min(100, Math.round((marks / (maxScore || 100)) * 100));

  const status = studentResult?.status || 'evaluated';
  const isPending = status === 'pending';
  const isFailed = status === 'failed';

  const assignmentName = evaluation?.assignment_name || evaluation?.assignment_id || 'Assignment Evaluation';

  // Determine back navigation link based on current path
  const isFacilitator = location.pathname.includes('/facilitator/');
  const backUrl = isFacilitator
    ? `/dashboard/facilitator/results/${id}`
    : `/dashboard/admin/results/${id}`;

  return (
    <div className="min-h-screen bg-slate-50/50 pb-16">
      {/* ─── Top Navigation Bar ─── */}
      <div className="bg-white border-b border-slate-200 sticky top-0 z-20 shadow-xs">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3.5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate(backUrl)}
              className="p-2 rounded-lg text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition flex items-center gap-1.5 text-xs font-semibold"
            >
              <ArrowLeft size={16} />
              <span>Back to Results</span>
            </button>
            <div className="h-4 w-px bg-slate-200 hidden sm:block" />
            <div className="hidden sm:flex items-center gap-2 text-xs text-slate-500">
              <span className="truncate max-w-[200px]">{assignmentName}</span>
              <ChevronRight size={13} className="text-slate-400" />
              <span className="font-semibold text-slate-800">
                {studentResult?.student_name || 'Student Evaluation'}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleReEvaluate}
              disabled={reEvaluating}
              className="text-xs font-semibold gap-1.5 border-slate-200 hover:bg-slate-50"
            >
              <RefreshCw size={13} className={reEvaluating ? 'animate-spin' : ''} />
              {reEvaluating ? 'Re-evaluating...' : 'Re-evaluate'}
            </Button>

            {studentResult?.submission_link && (
              <a
                href={studentResult.submission_link}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 transition shadow-xs"
              >
                <ExternalLink size={13} />
                <span>Open Submission</span>
              </a>
            )}
            {studentResult?.submission_file_url && (
              <a
                href={studentResult.submission_file_url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 transition shadow-xs"
              >
                <FileText size={13} />
                <span>View File</span>
              </a>
            )}
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-6 space-y-6">
        {loading ? (
          <div className="space-y-6">
            <Skeleton className="h-32 w-full rounded-2xl" />
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <Skeleton className="h-64 lg:col-span-1 rounded-2xl" />
              <Skeleton className="h-64 lg:col-span-2 rounded-2xl" />
            </div>
          </div>
        ) : (
          <>
            {/* ─── Hero Overview Card ─── */}
            <div className="bg-white rounded-2xl border border-slate-200/80 p-5 sm:p-6 shadow-xs relative overflow-hidden">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                {/* Student Info */}
                <div className="space-y-2">
                  <div className="flex items-center gap-2.5">
                    <div className="w-10 h-10 rounded-xl bg-blue-50 border border-blue-100 flex items-center justify-center text-blue-600 font-bold text-sm">
                      {studentResult?.student_name ? studentResult.student_name.charAt(0).toUpperCase() : <User size={18} />}
                    </div>
                    <div>
                      <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">
                        {studentResult?.student_name || 'Unknown Student'}
                      </h1>
                      <p className="text-xs text-slate-500 font-medium">
                        Submission ID: <span className="font-mono text-slate-600">{studentResult?.submission_id || submissionId}</span>
                      </p>
                    </div>
                  </div>

                  {/* Metadata Chips */}
                  <div className="flex flex-wrap items-center gap-2 pt-2 text-xs text-slate-600">
                    {studentResult?.college_name && (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-slate-100/80 font-medium">
                        <Building2 size={13} className="text-slate-500" />
                        {studentResult.college_name}
                      </span>
                    )}
                    {studentResult?.expected_graduation_year && (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-slate-100/80 font-medium">
                        <Calendar size={13} className="text-slate-500" />
                        Batch {studentResult.expected_graduation_year}
                      </span>
                    )}
                    {evaluation?.evaluator_type && (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-indigo-50 text-indigo-700 border border-indigo-100 font-semibold uppercase text-[11px]">
                        <Layers size={13} />
                        {evaluation.evaluator_type} Evaluator
                      </span>
                    )}
                  </div>
                </div>

                {/* Score & Status Pill */}
                <div className="flex items-center gap-4 bg-slate-50/80 p-4 rounded-xl border border-slate-100 shrink-0">
                  <div className="text-right">
                    <p className="text-[11px] uppercase tracking-wider font-semibold text-slate-400">Total Score</p>
                    <div className="flex items-baseline justify-end gap-1">
                      <span className="text-3xl sm:text-4xl font-extrabold text-slate-900 tracking-tight">
                        {isPending ? '—' : marks}
                      </span>
                      <span className="text-sm font-semibold text-slate-400">/ {maxScore}</span>
                    </div>
                    <p className="text-xs font-semibold text-slate-500">{isPending ? 'Evaluating...' : `${percentage}% overall`}</p>
                  </div>

                  <div className="h-12 w-px bg-slate-200" />

                  <div className="flex flex-col items-center justify-center">
                    {isPending ? (
                      <span className="px-3 py-1 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200 animate-pulse">
                        Evaluating
                      </span>
                    ) : isFailed ? (
                      <span className="px-3 py-1 rounded-full text-xs font-semibold bg-red-50 text-red-700 border border-red-200">
                        Failed
                      </span>
                    ) : (
                      <span className="px-3 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center gap-1">
                        <CheckCircle2 size={13} /> Evaluated
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* ─── Two-Column Details Layout ─── */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              {/* Left Column: Rubric Breakdown (5 cols) */}
              <div className="lg:col-span-5 space-y-6">
                <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-xs">
                  <div className="flex items-center justify-between pb-3.5 border-b border-slate-100 mb-4">
                    <div className="flex items-center gap-2">
                      <Award size={18} className="text-blue-600" />
                      <h2 className="text-base font-bold text-slate-900">Rubric Criteria Breakdown</h2>
                    </div>
                    <span className="text-xs font-semibold text-slate-400">
                      {breakdown.length} {breakdown.length === 1 ? 'Criterion' : 'Criteria'}
                    </span>
                  </div>

                  {breakdown.length === 0 ? (
                    <div className="py-8 text-center text-slate-400 text-xs">
                      No criterion breakdown data returned for this submission.
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {breakdown.map((item: any, idx: number) => {
                        const critScore = Number(item.score ?? item.awarded ?? item.points ?? 0);
                        const critMax = Number(item.max_score ?? item.weight ?? item.maxScore ?? 20);
                        const critPct = Math.min(100, Math.round((critScore / (critMax || 1)) * 100));

                        return (
                          <div key={idx} className="p-3.5 rounded-xl border border-slate-100 bg-slate-50/50 space-y-2">
                            <div className="flex items-start justify-between gap-2">
                              <div>
                                <h3 className="text-xs sm:text-sm font-bold text-slate-800">
                                  {item.criterion || item.name || `Criterion ${idx + 1}`}
                                </h3>
                                {item.description && (
                                  <p className="text-[11px] text-slate-500 mt-0.5 line-clamp-2">
                                    {item.description}
                                  </p>
                                )}
                              </div>
                              <span className="px-2 py-0.5 rounded text-xs font-bold text-slate-900 bg-white border border-slate-200 shrink-0">
                                {critScore} / {critMax} pts
                              </span>
                            </div>

                            {/* Progress bar */}
                            <div className="w-full bg-slate-200 rounded-full h-1.5 overflow-hidden">
                              <div
                                className={`h-1.5 rounded-full transition-all duration-500 ${
                                  critPct >= 80 ? 'bg-emerald-500' : critPct >= 50 ? 'bg-amber-500' : 'bg-red-500'
                                }`}
                                style={{ width: `${critPct}%` }}
                              />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Submission Links Card */}
                <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-xs space-y-3">
                  <h3 className="text-xs uppercase tracking-wider font-bold text-slate-400">Submission Deliverables</h3>
                  <div className="space-y-2">
                    {studentResult?.submission_link && (
                      <a
                        href={studentResult.submission_link}
                        target="_blank"
                        rel="noreferrer"
                        className="flex items-center justify-between p-3 rounded-xl border border-slate-100 hover:border-blue-200 hover:bg-blue-50/50 transition group"
                      >
                        <div className="flex items-center gap-2.5 truncate">
                          <ExternalLink size={16} className="text-blue-600 shrink-0" />
                          <span className="text-xs font-semibold text-slate-800 group-hover:text-blue-600 truncate">
                            {studentResult.submission_link}
                          </span>
                        </div>
                        <span className="text-[11px] font-semibold text-blue-600 shrink-0">Open ↗</span>
                      </a>
                    )}
                    {studentResult?.submission_file_url && (
                      <a
                        href={studentResult.submission_file_url}
                        target="_blank"
                        rel="noreferrer"
                        className="flex items-center justify-between p-3 rounded-xl border border-slate-100 hover:border-blue-200 hover:bg-blue-50/50 transition group"
                      >
                        <div className="flex items-center gap-2.5 truncate">
                          <FileText size={16} className="text-blue-600 shrink-0" />
                          <span className="text-xs font-semibold text-slate-800 group-hover:text-blue-600 truncate">
                            {studentResult.submission_file_name || 'Download Submitted File'}
                          </span>
                        </div>
                        <span className="text-[11px] font-semibold text-blue-600 shrink-0">Download ↗</span>
                      </a>
                    )}
                    {!studentResult?.submission_link && !studentResult?.submission_file_url && (
                      <p className="text-xs text-slate-400 italic">No deliverable link or file attached.</p>
                    )}
                  </div>
                </div>
              </div>

              {/* Right Column: AI Qualitative Feedback & Assertions (7 cols) */}
              <div className="lg:col-span-7 space-y-6">
                {/* AI Executive Summary */}
                <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-xs space-y-3">
                  <div className="flex items-center gap-2 pb-3 border-b border-slate-100">
                    <Sparkles size={18} className="text-indigo-600" />
                    <h2 className="text-base font-bold text-slate-900">AI Evaluation Summary</h2>
                  </div>

                  {summary ? (
                    <div className="text-xs sm:text-sm text-slate-700 leading-relaxed space-y-2 whitespace-pre-line bg-indigo-50/40 p-4 rounded-xl border border-indigo-100/60">
                      {summary}
                    </div>
                  ) : (
                    <p className="text-xs text-slate-400 italic py-2">No summary feedback available.</p>
                  )}
                </div>

                {/* Key Strengths Card */}
                {strengths.length > 0 && (
                  <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-xs space-y-3">
                    <div className="flex items-center gap-2 pb-3 border-b border-slate-100">
                      <CheckCircle2 size={18} className="text-emerald-600" />
                      <h2 className="text-sm sm:text-base font-bold text-slate-900">Key Strengths</h2>
                    </div>
                    <ul className="space-y-2">
                      {strengths.map((item: string, i: number) => (
                        <li key={i} className="flex items-start gap-2.5 text-xs sm:text-sm text-slate-700 bg-emerald-50/40 p-3 rounded-xl border border-emerald-100/60">
                          <span className="text-emerald-600 font-bold mt-0.5">•</span>
                          <span>{item}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Areas for Improvement / Issues Card */}
                {issues.length > 0 && (
                  <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-xs space-y-3">
                    <div className="flex items-center gap-2 pb-3 border-b border-slate-100">
                      <AlertTriangle size={18} className="text-amber-600" />
                      <h2 className="text-sm sm:text-base font-bold text-slate-900">Areas for Improvement</h2>
                    </div>
                    <ul className="space-y-2">
                      {issues.map((item: string, i: number) => (
                        <li key={i} className="flex items-start gap-2.5 text-xs sm:text-sm text-slate-700 bg-amber-50/40 p-3 rounded-xl border border-amber-100/60">
                          <span className="text-amber-600 font-bold mt-0.5">•</span>
                          <span>{item}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Cell-Level / Test Assertions Evidence */}
                {cellEvidence.length > 0 && (
                  <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-xs space-y-3">
                    <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                      <div className="flex items-center gap-2">
                        <Layers size={18} className="text-slate-600" />
                        <h2 className="text-sm sm:text-base font-bold text-slate-900">Evaluation Assertions & Evidence</h2>
                      </div>
                      <span className="text-xs text-slate-400 font-semibold">{cellEvidence.length} Checks</span>
                    </div>

                    <div className="max-h-[360px] overflow-y-auto space-y-2 pr-1 custom-scrollbar">
                      {cellEvidence.map((ev: any, i: number) => {
                        const passed = ev.passed === true;
                        const cellLoc = ev.cell ? `[${ev.sheet ? `${ev.sheet}!` : ''}${ev.cell}] ` : (ev.sheet ? `[${ev.sheet}] ` : '');

                        return (
                          <div
                            key={i}
                            className={`p-3 rounded-xl border text-xs flex items-start gap-2.5 ${
                              passed ? 'bg-emerald-50/30 border-emerald-100 text-emerald-900' : 'bg-red-50/30 border-red-100 text-red-900'
                            }`}
                          >
                            <span className={`font-bold mt-0.5 ${passed ? 'text-emerald-600' : 'text-red-600'}`}>
                              {passed ? '✓' : '✗'}
                            </span>
                            <div className="flex-1 space-y-0.5">
                              <p className="font-semibold">
                                {cellLoc}{ev.reason || ev.criterion || 'Assertion Check'}
                              </p>
                              {ev.expectedValue !== undefined && (
                                <p className="text-[11px] opacity-80">
                                  Expected: <span className="font-mono">{String(ev.expectedValue)}</span>
                                  {ev.actualValue !== undefined && (
                                    <> | Actual: <span className="font-mono">{String(ev.actualValue)}</span></>
                                  )}
                                </p>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
