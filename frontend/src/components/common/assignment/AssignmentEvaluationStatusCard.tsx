import type { FC } from 'react';
import {
  Sparkles,
  Clock,
  CheckCircle2,
  AlertCircle,
  Eye,
  RefreshCw,
  Trophy,
  History,
  AlertTriangle,
  ExternalLink,
  FileText,
  Quote,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';

export interface AssignmentEvaluationData {
  status: 'not_submitted' | 'pending_evaluation' | 'evaluated' | 'resubmitted_pending' | 'evaluation_failed';
  marks: number | null;
  max_score: number;
  evaluated_at?: string | null;
  feedback?: {
    summary?: string;
    strengths?: string[];
    issues?: string[];
    breakdown?: any[];
  } | null;
}

export interface AssignmentEvaluationStatusCardProps {
  evaluation?: AssignmentEvaluationData | null;
  submittedAt?: string | null;
  updatedAt?: string | null;
  submissionLink?: string | null;
  submissionFileName?: string | null;
  onOpenFeedbackModal: () => void;
  onRefresh?: () => void;
  isRefreshing?: boolean;
}

export const AssignmentEvaluationStatusCard: FC<AssignmentEvaluationStatusCardProps> = ({
  evaluation,
  submittedAt,
  updatedAt,
  submissionLink,
  submissionFileName,
  onOpenFeedbackModal,
  onRefresh,
  isRefreshing = false,
}) => {
  if (!evaluation || evaluation.status === 'not_submitted') {
    return null;
  }

  const { status, marks, max_score, evaluated_at, feedback } = evaluation;
  const maxScore = max_score || 100;
  const currentMarks = marks ?? 0;
  const percentage = Math.round((currentMarks / maxScore) * 100);

  const getGradeBadge = (pct: number) => {
    if (pct >= 90) return { label: 'Outstanding', bg: 'bg-emerald-500 text-white' };
    if (pct >= 80) return { label: 'Great Job', bg: 'bg-emerald-600 text-white' };
    if (pct >= 65) return { label: 'Good Effort', bg: 'bg-amber-500 text-white' };
    return { label: 'Needs Improvement', bg: 'bg-rose-500 text-white' };
  };

  const grade = getGradeBadge(percentage);

  // 1. Pending Evaluation State
  if (status === 'pending_evaluation') {
    return (
      <Card className='overflow-hidden rounded-2xl sm:rounded-3xl border border-indigo-200/80 bg-gradient-to-br from-indigo-50/70 via-white to-amber-50/40 shadow-sm p-5 sm:p-6'>
        <div className='flex flex-col sm:flex-row sm:items-center justify-between gap-4'>
          <div className='flex items-start gap-3.5'>
            <div className='p-2.5 bg-indigo-100 text-indigo-700 rounded-2xl shrink-0 mt-0.5 animate-pulse'>
              <Clock className='w-6 h-6' />
            </div>
            <div className='space-y-1'>
              <div className='flex items-center gap-2 flex-wrap'>
                <h3 className='text-base sm:text-lg font-bold text-slate-900'>
                  Deliverable Submitted — Awaiting Evaluation
                </h3>
                <Badge className='bg-amber-100 text-amber-800 border-amber-300 text-[11px] font-bold'>
                  In Review
                </Badge>
              </div>
              <p className='text-xs sm:text-sm text-slate-600 leading-relaxed max-w-xl'>
                Your deliverable has been recorded. The facilitator or automated evaluator will review your work shortly. Your score, strengths, and areas for improvement will appear right here once evaluated.
              </p>
              {submittedAt && (
                <p className='text-[11px] text-slate-400 font-medium pt-1'>
                  Submitted on {new Date(submittedAt).toLocaleString()}
                </p>
              )}
            </div>
          </div>

          {onRefresh && (
            <Button
              variant='outline'
              size='sm'
              onClick={onRefresh}
              disabled={isRefreshing}
              className='rounded-xl text-xs font-semibold gap-1.5 shrink-0 border-indigo-200 hover:bg-indigo-50 self-start sm:self-center'
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
              <span>{isRefreshing ? 'Checking...' : 'Check Status'}</span>
            </Button>
          )}
        </div>
      </Card>
    );
  }

  // 2. Resubmitted - Awaiting Re-evaluation State
  if (status === 'resubmitted_pending') {
    return (
      <Card className='overflow-hidden rounded-2xl sm:rounded-3xl border border-sky-200/80 bg-gradient-to-br from-sky-50/80 via-white to-amber-50/30 shadow-sm'>
        <div className='p-5 sm:p-6 space-y-4'>
          <div className='flex flex-col sm:flex-row sm:items-center justify-between gap-3'>
            <div className='flex items-start gap-3.5'>
              <div className='p-2.5 bg-sky-100 text-sky-700 rounded-2xl shrink-0 mt-0.5'>
                <History className='w-6 h-6 animate-spin-slow' />
              </div>
              <div>
                <div className='flex items-center gap-2 flex-wrap'>
                  <h3 className='text-base sm:text-lg font-bold text-slate-900'>
                    Updated Deliverable Submitted — Awaiting Re-evaluation
                  </h3>
                  <Badge className='bg-sky-100 text-sky-800 border-sky-300 text-[11px] font-bold'>
                    Re-evaluation Queued
                  </Badge>
                </div>
                <p className='text-xs sm:text-sm text-slate-600 leading-relaxed mt-1'>
                  You updated your deliverable on{' '}
                  <span className='font-semibold text-slate-800'>
                    {updatedAt ? new Date(updatedAt).toLocaleString() : 'recently'}
                  </span>
                  . Your latest version is queued for review. Your previous score and feedback remain accessible below.
                </p>
              </div>
            </div>

            {marks !== null && (
              <div className='flex items-center gap-3 bg-white/90 border border-sky-200 px-4 py-2 rounded-2xl shrink-0 shadow-xs'>
                <div>
                  <span className='text-[10px] uppercase font-bold text-slate-400 block'>
                    Previous Score
                  </span>
                  <span className='text-base font-extrabold text-slate-800'>
                    {marks} / {maxScore}
                  </span>
                </div>
                <Button
                  size='sm'
                  variant='ghost'
                  onClick={onOpenFeedbackModal}
                  className='text-xs font-semibold text-sky-700 hover:text-sky-800 hover:bg-sky-50 rounded-xl h-8 px-2.5'
                >
                  <Eye className='w-3.5 h-3.5 mr-1' /> View Past Rubric
                </Button>
              </div>
            )}
          </div>
        </div>
      </Card>
    );
  }

  // 3. Evaluation Failed State
  if (status === 'evaluation_failed') {
    return (
      <Card className='overflow-hidden rounded-2xl sm:rounded-3xl border border-rose-200 bg-rose-50/40 shadow-sm p-5 sm:p-6'>
        <div className='flex flex-col sm:flex-row sm:items-start justify-between gap-4'>
          <div className='flex items-start gap-3.5'>
            <div className='p-2.5 bg-rose-100 text-rose-700 rounded-2xl shrink-0 mt-0.5'>
              <AlertTriangle className='w-6 h-6' />
            </div>
            <div className='space-y-1.5'>
              <div className='flex items-center gap-2 flex-wrap'>
                <h3 className='text-base sm:text-lg font-bold text-rose-950'>
                  Evaluation Incomplete
                </h3>
                <Badge variant='destructive' className='text-[10px] font-bold'>
                  Action Required
                </Badge>
              </div>
              <p className='text-xs sm:text-sm text-rose-800 leading-relaxed max-w-xl'>
                {feedback?.summary ||
                  'The evaluation could not be completed for this deliverable (for example, repository private, link inaccessible, or unexpected format). Please review your submission link or file and update it below.'}
              </p>
            </div>
          </div>

          {onRefresh && (
            <Button
              variant='outline'
              size='sm'
              onClick={onRefresh}
              disabled={isRefreshing}
              className='rounded-xl text-xs font-semibold gap-1.5 shrink-0 border-rose-300 text-rose-700 hover:bg-rose-100/50 self-start sm:self-center'
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
              <span>Retry / Re-check</span>
            </Button>
          )}
        </div>
      </Card>
    );
  }

  // 4. Evaluated / Graded State
  const strengths = Array.isArray(feedback?.strengths) ? feedback.strengths : [];
  const issues = Array.isArray(feedback?.issues) ? feedback.issues : [];

  return (
    <Card className='overflow-hidden rounded-2xl sm:rounded-3xl border border-emerald-200/90 shadow-sm'>
      {/* Banner Header */}
      <div className='bg-gradient-to-r from-emerald-600 via-teal-600 to-emerald-700 px-5 sm:px-7 py-4 text-white flex flex-col sm:flex-row sm:items-center justify-between gap-4'>
        <div className='flex items-center gap-3.5'>
          <div className='p-2.5 bg-white/20 backdrop-blur-md rounded-2xl shrink-0 shadow-inner'>
            <Trophy className='w-6 h-6 text-yellow-300' />
          </div>
          <div>
            <div className='flex items-center gap-2 flex-wrap'>
              <span className='text-[10px] sm:text-xs font-bold uppercase tracking-wider text-emerald-100'>
                Evaluation Complete
              </span>
              <Badge className={`${grade.bg} text-[10px] font-bold px-2 py-0.5 rounded-full shadow-xs`}>
                {grade.label}
              </Badge>
            </div>
            <h3 className='text-xl sm:text-2xl font-black text-white tracking-tight mt-0.5'>
              Score: {currentMarks} / {maxScore}{' '}
              <span className='text-sm sm:text-base font-semibold text-emerald-100 opacity-90'>
                ({percentage}%)
              </span>
            </h3>
          </div>
        </div>

        <Button
          onClick={onOpenFeedbackModal}
          className='bg-white text-emerald-900 hover:bg-emerald-50 font-bold rounded-xl text-xs h-10 px-5 shadow-sm transition-all cursor-pointer self-start sm:self-center'
        >
          <Eye className='w-4 h-4 mr-1.5 text-emerald-700' />
          <span>View Rubric & Breakdown</span>
        </Button>
      </div>

      {/* Evaluator Summary & Insights */}
      <div className='p-5 sm:p-7 bg-white space-y-4'>
        {feedback?.summary && (
          <div className='p-4 rounded-2xl bg-slate-50 border border-slate-100 text-xs sm:text-sm text-slate-700 relative leading-relaxed'>
            <div className='flex items-start gap-2.5'>
              <Quote className='w-4 h-4 text-emerald-600 shrink-0 mt-0.5 opacity-70' />
              <div>
                <p className='font-bold text-slate-900 text-xs uppercase tracking-wider mb-1'>
                  Evaluator Feedback
                </p>
                <p className='text-slate-600'>{feedback.summary}</p>
              </div>
            </div>
          </div>
        )}

        {/* Strengths & Improvements Chips */}
        {(strengths.length > 0 || issues.length > 0) && (
          <div className='grid grid-cols-1 md:grid-cols-2 gap-4 pt-1'>
            {strengths.length > 0 && (
              <div className='space-y-2'>
                <p className='text-xs font-bold uppercase tracking-wider text-emerald-700 flex items-center gap-1.5'>
                  <CheckCircle2 className='w-4 h-4 text-emerald-600' />
                  <span>Key Strengths</span>
                </p>
                <div className='flex flex-wrap gap-1.5'>
                  {strengths.slice(0, 4).map((str, idx) => (
                    <span
                      key={idx}
                      className='inline-flex items-center text-xs px-2.5 py-1 rounded-xl bg-emerald-50 text-emerald-800 border border-emerald-200/80 font-medium'
                    >
                      ✓ {str}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {issues.length > 0 && (
              <div className='space-y-2'>
                <p className='text-xs font-bold uppercase tracking-wider text-rose-700 flex items-center gap-1.5'>
                  <AlertCircle className='w-4 h-4 text-rose-600' />
                  <span>Areas for Improvement</span>
                </p>
                <div className='flex flex-wrap gap-1.5'>
                  {issues.slice(0, 4).map((iss, idx) => (
                    <span
                      key={idx}
                      className='inline-flex items-center text-xs px-2.5 py-1 rounded-xl bg-rose-50 text-rose-800 border border-rose-200/80 font-medium'
                    >
                      • {iss}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {evaluated_at && (
          <div className='flex items-center justify-between text-[11px] text-slate-400 font-medium pt-2 border-t border-slate-100'>
            <span>Evaluated on {new Date(evaluated_at).toLocaleString()}</span>
            <span>Rubric-based assessment</span>
          </div>
        )}
      </div>
    </Card>
  );
};
