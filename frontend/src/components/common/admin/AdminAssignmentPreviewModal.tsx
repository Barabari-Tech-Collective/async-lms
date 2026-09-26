import React, { useEffect, useMemo, useState } from 'react';
import {
  X,
  Loader2,
  AlertTriangle,
  ClipboardList,
  Eye,
  Award,
  Terminal,
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import apiClient from '@/services/api';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { AssignmentRubricsViewer } from '@/components/common/assignment/AssignmentRubricsViewer';
import { AssignmentTestCasesViewer } from '@/components/common/assignment/AssignmentTestCasesViewer';

export interface AssignmentPreviewData {
  id?: string;
  title: string;
  instructions?: string;
  max_score: number;
  evaluator_type?: string | null;
  test_cases?: any;
  rubric?: any;
  unit_title?: string;
  subject_title?: string;
}

interface AdminAssignmentPreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  assignmentId?: string | null;
  assignmentData?: AssignmentPreviewData | null;
  unitTitle?: string;
}

export const AdminAssignmentPreviewModal: React.FC<AdminAssignmentPreviewModalProps> = ({
  isOpen,
  onClose,
  assignmentId,
  assignmentData,
  unitTitle,
}) => {
  const [data, setData] = useState<AssignmentPreviewData | null>(assignmentData || null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) {
      setData(null);
      setError(null);
      return;
    }

    // If an assignmentId is provided, always fetch complete and updated details from the backend
    if (assignmentId) {
      setLoading(true);
      setError(null);
      apiClient
        .get<{ success: boolean; data: any }>(`/admin/assignments/${assignmentId}`)
        .then((res) => {
          if (res.data?.success && res.data.data) {
            setData({
              ...res.data.data,
              unit_title: res.data.data.unit_title || unitTitle || assignmentData?.unit_title,
            });
          } else {
            setError('Failed to load assignment details.');
          }
        })
        .catch((err) => {
          console.error('[AdminAssignmentPreview] Fetch error:', err);
          setError(err?.response?.data?.message || 'Failed to load assignment details.');
        })
        .finally(() => {
          setLoading(false);
        });
      return;
    }

    // Otherwise, use in-memory draft data (e.g. while editing in AssignmentModal)
    if (assignmentData) {
      setData(assignmentData);
      setLoading(false);
      setError(null);
    }
  }, [isOpen, assignmentId, assignmentData, unitTitle]);

  const hasRubric = useMemo(() => {
    if (!data?.rubric) return false;
    if (Array.isArray(data.rubric) && data.rubric.length > 0) return true;
    if (typeof data.rubric === 'string') {
      try {
        const parsed = JSON.parse(data.rubric);
        return Array.isArray(parsed) ? parsed.length > 0 : Boolean(parsed);
      } catch {
        return data.rubric.trim().length > 0;
      }
    }
    if (typeof data.rubric === 'object') {
      return Object.keys(data.rubric).length > 0;
    }
    return false;
  }, [data?.rubric]);

  const hasTestCases = useMemo(() => {
    if (!data?.test_cases) return false;
    if (Array.isArray(data.test_cases) && data.test_cases.length > 0) return true;
    if (typeof data.test_cases === 'string') {
      try {
        const parsed = JSON.parse(data.test_cases);
        if (Array.isArray(parsed)) return parsed.length > 0;
        if (typeof parsed === 'object' && parsed !== null) {
          return Object.keys(parsed).length > 0;
        }
        return false;
      } catch {
        return data.test_cases.trim().length > 0;
      }
    }
    if (typeof data.test_cases === 'object') {
      return Object.keys(data.test_cases).length > 0;
    }
    return false;
  }, [data?.test_cases]);

  if (!isOpen) return null;

  return (
    <div className='fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-2 sm:p-4 backdrop-blur-xs animate-in fade-in-50'>
      <div className='w-full sm:max-w-4xl rounded-2xl sm:rounded-3xl bg-slate-50 shadow-2xl flex flex-col max-h-[92vh] overflow-hidden border border-slate-200'>
        {/* Modal Top Action Bar */}
        <div className='flex items-center justify-between px-4 sm:px-6 py-3.5 bg-white border-b border-slate-200 shrink-0'>
          <div className='flex items-center gap-2'>
            <Badge className='bg-indigo-50 text-indigo-700 border-indigo-200 flex items-center gap-1.5 font-semibold text-xs py-1 px-2.5'>
              <Eye className='h-3.5 w-3.5' />
              Assignment Preview
            </Badge>
            <span className='text-xs text-slate-400 hidden sm:inline'>
              Learner-facing content preview (read-only verification)
            </span>
          </div>
          <button
            type='button'
            onClick={onClose}
            className='rounded-xl p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition-colors cursor-pointer'
            title='Close preview'
          >
            <X className='h-5 w-5' />
          </button>
        </div>

        {/* Modal Body */}
        <div className='overflow-y-auto flex-1 p-4 sm:p-6 md:p-8 space-y-6'>
          {loading ? (
            <div className='flex flex-col items-center justify-center gap-3 py-20 text-slate-500'>
              <Loader2 className='h-9 w-9 animate-spin text-indigo-600' />
              <p className='text-sm font-medium'>Loading assignment preview...</p>
            </div>
          ) : error ? (
            <div className='flex flex-col items-center justify-center gap-3 py-16 text-center bg-white rounded-2xl border border-red-100 p-8'>
              <AlertTriangle className='h-10 w-10 text-red-500' />
              <p className='text-base font-semibold text-slate-800'>Unable to Preview Assignment</p>
              <p className='text-xs text-slate-500 max-w-md'>{error}</p>
              <Button variant='outline' size='sm' onClick={onClose} className='mt-2'>
                Dismiss
              </Button>
            </div>
          ) : data ? (
            <div className='space-y-6'>
              {/* Header */}
              <header className='space-y-3 bg-white p-5 sm:p-7 rounded-2xl border border-slate-100 shadow-2xs'>
                <div className='flex items-start gap-3'>
                  <div className='w-10 h-10 sm:w-11 sm:h-11 rounded-2xl bg-[#333D7C]/10 text-[#333D7C] flex items-center justify-center shrink-0 mt-0.5'>
                    <ClipboardList className='h-5 w-5' />
                  </div>
                  <div className='space-y-1 flex-1 min-w-0'>
                    <h1 className='text-xl sm:text-2xl font-bold text-slate-900 leading-tight'>
                      {data.title || 'Untitled Assignment'}
                    </h1>
                    {(data.unit_title || unitTitle) && (
                      <p className='text-xs sm:text-sm text-slate-500 font-medium'>
                        Unit: {data.unit_title || unitTitle}
                      </p>
                    )}
                  </div>
                </div>

                <div className='flex flex-wrap gap-1.5 sm:gap-2 pt-1'>
                  <Badge className='bg-[#333D7C]/10 text-[#333D7C] border-none text-xs font-semibold'>
                    Assignment
                  </Badge>
                  <Badge className='bg-slate-100 text-slate-700 border-none text-xs font-semibold'>
                    Max: {data.max_score || 100} pts
                  </Badge>
                  {data.evaluator_type && (
                    <Badge className='bg-indigo-50 text-indigo-700 border-indigo-200 text-xs font-semibold uppercase'>
                      {data.evaluator_type} Evaluator
                    </Badge>
                  )}
                  <Badge className='bg-emerald-50 text-emerald-700 border-emerald-200 text-xs font-medium'>
                    Active in Curriculum
                  </Badge>
                </div>
              </header>

              {/* Instructions Section */}
              <Card className='overflow-hidden rounded-2xl sm:rounded-[2rem] border border-slate-100 shadow-sm p-0 bg-white'>
                <div className='px-4 sm:px-8 pt-5 sm:pt-6'>
                  <p className='text-xs font-semibold uppercase tracking-widest text-slate-400'>
                    Instructions
                  </p>
                  <p className='text-xs sm:text-sm text-slate-500 mt-0.5'>
                    Detailed task instructions and requirements
                  </p>
                </div>
                <div className='px-4 py-5 sm:px-8 sm:py-6'>
                  {data.instructions && data.instructions.trim().length > 0 ? (
                    <div className='prose prose-slate max-w-full overflow-x-auto text-sm sm:text-base leading-relaxed'>
                      {/<[a-z][\s\S]*>/i.test(data.instructions) ? (
                        <div dangerouslySetInnerHTML={{ __html: data.instructions }} />
                      ) : (
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>
                          {data.instructions}
                        </ReactMarkdown>
                      )}
                    </div>
                  ) : (
                    <p className='italic text-slate-400 text-sm'>No instructions provided yet.</p>
                  )}
                </div>
              </Card>

              {/* Test Cases Section */}
              {hasTestCases ? (
                <AssignmentTestCasesViewer
                  testCases={data.test_cases}
                  evaluatorType={data.evaluator_type}
                  isStaff={true}
                />
              ) : (
                <Card className='overflow-hidden rounded-2xl sm:rounded-[2rem] border border-slate-100 shadow-sm p-0 bg-white'>
                  <div className='flex items-center justify-between px-4 sm:px-8 pt-5 sm:pt-6 pb-2'>
                    <div>
                      <div className='flex items-center gap-2'>
                        <Terminal className='h-4 w-4 text-indigo-500' />
                        <p className='text-xs font-semibold uppercase tracking-widest text-slate-400'>
                          Test Cases & Verification
                        </p>
                      </div>
                      <p className='text-xs sm:text-sm text-slate-500 mt-0.5'>
                        Automated verification checks and expected behavior
                      </p>
                    </div>
                    <Badge className='bg-slate-100 text-slate-500 text-xs font-normal'>
                      Manual Evaluation
                    </Badge>
                  </div>
                  <div className='px-4 sm:px-8 py-5'>
                    <p className='italic text-slate-400 text-sm'>
                      No automated test cases configured for this assignment.
                    </p>
                  </div>
                </Card>
              )}

              {/* Rubrics Section */}
              {hasRubric ? (
                <AssignmentRubricsViewer rubric={data.rubric} maxScore={data.max_score} />
              ) : (
                <Card className='overflow-hidden rounded-2xl sm:rounded-[2rem] border border-slate-100 shadow-sm p-0 bg-white'>
                  <div className='flex items-center justify-between px-4 sm:px-8 pt-5 sm:pt-6 pb-2'>
                    <div>
                      <div className='flex items-center gap-2'>
                        <Award className='h-4 w-4 text-amber-500' />
                        <p className='text-xs font-semibold uppercase tracking-widest text-slate-400'>
                          Grading Rubric
                        </p>
                      </div>
                      <p className='text-xs sm:text-sm text-slate-500 mt-0.5'>
                        Evaluation criteria and score distribution
                      </p>
                    </div>
                    <Badge className='bg-slate-100 text-slate-500 text-xs font-normal'>
                      Not Configured
                    </Badge>
                  </div>
                  <div className='px-4 sm:px-8 py-5'>
                    <p className='italic text-slate-400 text-sm'>
                      No grading rubric defined for this assignment.
                    </p>
                  </div>
                </Card>
              )}
            </div>
          ) : null}
        </div>

        {/* Modal Footer */}
        <div className='flex items-center justify-end px-4 sm:px-6 py-3.5 bg-white border-t border-slate-200 shrink-0'>
          <Button
            type='button'
            onClick={onClose}
            className='bg-slate-900 text-white hover:bg-slate-800 text-xs sm:text-sm px-5 h-9 rounded-xl cursor-pointer'
          >
            Close Preview
          </Button>
        </div>
      </div>
    </div>
  );
};

export default AdminAssignmentPreviewModal;
