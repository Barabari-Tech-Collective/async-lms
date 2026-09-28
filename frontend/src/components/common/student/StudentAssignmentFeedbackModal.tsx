import type { FC } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Trophy,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
  FileCode,
  Calendar,
  Layers,
  Sparkles,
} from 'lucide-react';
import type { StudentAssignmentOverviewItem } from '@/utils/types';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  assignment: StudentAssignmentOverviewItem | null;
}

export const StudentAssignmentFeedbackModal: FC<Props> = ({
  isOpen,
  onClose,
  assignment,
}) => {
  if (!assignment) return null;

  const marks = assignment.marks ?? 0;
  const maxScore = assignment.max_score || 100;
  const percentage = Math.round((marks / maxScore) * 100);

  const feedback = assignment.feedback || {};
  const summary = feedback.summary || feedback.feedback || 'Evaluation completed successfully.';
  const strengths = Array.isArray(feedback.strengths) ? feedback.strengths : [];
  const issues = Array.isArray(feedback.issues) ? feedback.issues : [];
  const breakdown = Array.isArray(feedback.breakdown) && feedback.breakdown.length > 0
    ? feedback.breakdown
    : Array.isArray(feedback.rubric_breakdown) && feedback.rubric_breakdown.length > 0
      ? feedback.rubric_breakdown
      : [];

  const getScoreColor = (pct: number) => {
    if (pct >= 80) return 'text-emerald-600 bg-emerald-50 border-emerald-200';
    if (pct >= 60) return 'text-amber-600 bg-amber-50 border-amber-200';
    return 'text-rose-600 bg-rose-50 border-rose-200';
  };

  const getGradeBadge = (pct: number) => {
    if (pct >= 90) return { label: 'Outstanding', bg: 'bg-emerald-500 text-white' };
    if (pct >= 80) return { label: 'Great Job', bg: 'bg-emerald-600 text-white' };
    if (pct >= 65) return { label: 'Good Effort', bg: 'bg-amber-500 text-white' };
    return { label: 'Needs Improvement', bg: 'bg-rose-500 text-white' };
  };

  const grade = getGradeBadge(percentage);

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className='w-[calc(100vw-1.25rem)] sm:w-full max-w-2xl max-h-[92dvh] sm:max-h-[85vh] flex flex-col p-0 overflow-hidden rounded-2xl sm:rounded-3xl border-slate-200 shadow-2xl'>
        {/* Header */}
        <DialogHeader className='px-4 sm:px-6 pt-4 sm:pt-6 pb-3 sm:pb-4 border-b border-slate-100 bg-slate-50/50 shrink-0 text-left pr-11 sm:pr-12'>
          <div className='flex items-center gap-1.5 sm:gap-2 flex-wrap mb-1'>
            <Badge
              variant='secondary'
              className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md shrink-0 ${
                assignment.type === 'CURRICULUM'
                  ? 'bg-indigo-100 text-indigo-700'
                  : 'bg-purple-100 text-purple-700'
              }`}
            >
              {assignment.type === 'CURRICULUM' ? 'Curriculum Assignment' : 'Course Assignment'}
            </Badge>
            <span className='text-xs text-slate-400 font-medium flex items-center gap-1 truncate min-w-0'>
              <Layers className='w-3 h-3 shrink-0' />
              <span className='truncate'>{assignment.course_name}</span>
            </span>
          </div>

          <DialogTitle className='text-base sm:text-xl font-bold text-slate-900 leading-snug break-words'>
            {assignment.title}
          </DialogTitle>
          <DialogDescription className='sr-only'>
            Evaluation results and rubric feedback for {assignment.title}
          </DialogDescription>
        </DialogHeader>

        {/* Scrollable Body */}
        <div className='flex-1 overflow-y-auto px-3.5 sm:px-6 py-3.5 sm:py-5 space-y-3.5 sm:space-y-5 custom-scrollbar min-w-0'>
          {/* Score & Verdict Banner */}
          <div className='p-3.5 sm:p-5 rounded-2xl bg-gradient-to-br from-indigo-950 via-slate-900 to-indigo-900 text-white flex flex-col sm:flex-row items-center justify-between gap-3.5 sm:gap-4 shadow-md'>
            <div className='flex items-center gap-3.5 sm:gap-4 w-full sm:w-auto'>
              <div className='w-12 h-12 sm:w-16 sm:h-16 rounded-xl sm:rounded-2xl bg-white/10 backdrop-blur-md border border-white/20 flex flex-col items-center justify-center shrink-0 shadow-inner'>
                <Trophy className='w-5 h-5 sm:w-7 sm:h-7 text-yellow-400' />
              </div>
              <div className='min-w-0 flex-1'>
                <div className='flex items-center gap-2 flex-wrap'>
                  <span className='text-xl sm:text-3xl font-extrabold tracking-tight text-white'>
                    {marks}
                    <span className='text-sm sm:text-lg font-semibold text-slate-300'>
                      {' '}
                      / {maxScore}
                    </span>
                  </span>
                  <Badge className={`${grade.bg} text-[10px] font-bold px-2 py-0.5 rounded-full border-none shrink-0`}>
                    {grade.label}
                  </Badge>
                </div>
                <p className='text-xs text-slate-300 mt-0.5'>
                  Overall Score: <strong className='text-white'>{percentage}%</strong>
                </p>
              </div>
            </div>

            {assignment.submission_link && (
              <a
                href={assignment.submission_link}
                target='_blank'
                rel='noreferrer'
                className='w-full sm:w-auto inline-flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold bg-white/10 hover:bg-white/20 border border-white/15 text-slate-200 hover:text-white transition-colors shrink-0'
              >
                <FileCode className='w-3.5 h-3.5 shrink-0' />
                <span>View Submitted Code</span>
                <ExternalLink className='w-3 h-3 opacity-70 ml-0.5 shrink-0' />
              </a>
            )}
          </div>

          {/* Evaluator Summary */}
          {summary && (
            <div className='p-3.5 sm:p-4 rounded-2xl bg-slate-50 border border-slate-200/80 space-y-1.5'>
              <div className='flex items-center gap-2 text-slate-800 font-bold text-xs uppercase tracking-wider'>
                <Sparkles className='w-3.5 h-3.5 text-indigo-600 shrink-0' />
                Evaluator Feedback Summary
              </div>
              <p className='text-xs sm:text-sm text-slate-700 leading-relaxed font-normal whitespace-pre-wrap break-words'>
                {summary}
              </p>
            </div>
          )}

          {/* Strengths & Issues Grid */}
          {(strengths.length > 0 || issues.length > 0) && (
            <div className='grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-3.5'>
              {strengths.length > 0 && (
                <div className='p-3.5 sm:p-4 rounded-2xl bg-emerald-50/70 border border-emerald-100 space-y-2 min-w-0'>
                  <div className='flex items-center gap-1.5 text-emerald-800 font-bold text-xs'>
                    <CheckCircle2 className='w-4 h-4 text-emerald-600 shrink-0' />
                    Key Strengths ({strengths.length})
                  </div>
                  <ul className='space-y-1.5'>
                    {strengths.map((str, i) => (
                      <li key={i} className='text-xs text-emerald-900 flex items-start gap-1.5 leading-snug min-w-0'>
                        <span className='text-emerald-500 font-bold shrink-0 mt-0.5'>•</span>
                        <span className='break-words min-w-0 flex-1'>{str}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {issues.length > 0 && (
                <div className='p-3.5 sm:p-4 rounded-2xl bg-amber-50/70 border border-amber-100 space-y-2 min-w-0'>
                  <div className='flex items-center gap-1.5 text-amber-800 font-bold text-xs'>
                    <AlertCircle className='w-4 h-4 text-amber-600 shrink-0' />
                    Areas to Improve ({issues.length})
                  </div>
                  <ul className='space-y-1.5'>
                    {issues.map((iss, i) => (
                      <li key={i} className='text-xs text-amber-900 flex items-start gap-1.5 leading-snug min-w-0'>
                        <span className='text-amber-500 font-bold shrink-0 mt-0.5'>•</span>
                        <span className='break-words min-w-0 flex-1'>{iss}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          {/* Rubric Breakdown */}
          {breakdown.length > 0 && (
            <div className='space-y-2.5'>
              <h4 className='text-xs font-bold uppercase tracking-wider text-slate-500'>
                Detailed Rubric Breakdown ({breakdown.length} criteria)
              </h4>
              <div className='space-y-2'>
                {breakdown.map((item, idx) => {
                  const criterionName = item.item || item.criterion || item.name || `Criterion #${idx + 1}`;
                  const ptsAwarded = item.awarded ?? item.points_awarded ?? item.score ?? 0;
                  const ptsMax = item.max ?? item.max_points ?? item.weight ?? 0;
                  const reason = item.reason || item.feedback || '';
                  const itemPct = ptsMax > 0 ? Math.round((Number(ptsAwarded) / Number(ptsMax)) * 100) : 100;

                  return (
                    <div
                      key={idx}
                      className='p-3 sm:p-3.5 rounded-xl border border-slate-200 bg-white hover:border-indigo-200 transition-colors space-y-1.5 min-w-0'
                    >
                      <div className='flex items-start sm:items-center justify-between gap-2'>
                        <span className='font-semibold text-xs sm:text-sm text-slate-800 break-words min-w-0 flex-1'>
                          {criterionName}
                        </span>
                        <Badge
                          variant='outline'
                          className={`text-xs font-bold px-2 py-0.5 rounded-lg border shrink-0 ${getScoreColor(itemPct)}`}
                        >
                          {ptsAwarded} / {ptsMax} pts
                        </Badge>
                      </div>
                      {reason && (
                        <p className='text-xs text-slate-500 leading-normal break-words'>
                          {reason}
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className='px-4 sm:px-6 py-3 border-t border-slate-100 bg-slate-50/60 flex items-center justify-between gap-2 shrink-0'>
          <span className='text-[11px] text-slate-500 flex items-center gap-1 truncate min-w-0'>
            <Calendar className='w-3 h-3 shrink-0 text-slate-400' />
            <span className='truncate'>
              {assignment.submitted_at
                ? `Submitted ${new Date(assignment.submitted_at).toLocaleDateString()}`
                : 'Evaluation Complete'}
            </span>
          </span>
          <Button
            onClick={onClose}
            className='bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-semibold px-4 h-8 sm:h-9 shrink-0'
          >
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
