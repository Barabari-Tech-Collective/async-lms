import { useEffect, useMemo, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router';
import {
  Loader2,
  XCircle,
  ClipboardList,
  CheckCircle2,
  ArrowRight,
  PartyPopper,
  AlertTriangle,
  Upload,
  FileText,
  ExternalLink,
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import apiClient from '@/services/api';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import toast from 'react-hot-toast';
import { getErrorMessage } from '@/lib/utils';
import { fireConfetti } from '@/lib/confetti';
import { notifyCourseProgressUpdated } from '@/utils/progressEvents';
import { AssignmentRubricsViewer } from '@/components/common/assignment/AssignmentRubricsViewer';
import { AssignmentTestCasesViewer } from '@/components/common/assignment/AssignmentTestCasesViewer';
import type { SubmissionType } from '@/utils/types';
import { SUBMISSION_TYPE_CONFIGS, ALL_SUBMISSION_TYPES } from '@/utils/types';

const SUBMISSION_REGEX: Record<SubmissionType, { pattern: RegExp; example: string }> = {
  file: { pattern: /.+/, example: 'Any uploaded file' },
  github: {
    pattern: /^https?:\/\/(www\.)?(github\.com|gitlab\.com|bitbucket\.org)\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+/i,
    example: 'https://github.com/username/repository',
  },
  docs: {
    pattern: /^https?:\/\/(docs\.google\.com\/(document|presentation)|[A-Za-z0-9-]+\.sharepoint\.com|1drv\.ms)/i,
    example: 'https://docs.google.com/document/d/...',
  },
  figma: {
    pattern: /^https?:\/\/(www\.)?figma\.com\/(file|design|proto|board)\/[A-Za-z0-9]+/i,
    example: 'https://www.figma.com/design/... or https://www.figma.com/proto/...',
  },
  excel: {
    pattern: /^https?:\/\/(docs\.google\.com\/spreadsheets|[A-Za-z0-9-]+\.sharepoint\.com|1drv\.ms)/i,
    example: 'https://docs.google.com/spreadsheets/d/...',
  },
  url: {
    pattern: /^https?:\/\/.+/i,
    example: 'https://your-deployed-app.vercel.app',
  },
};

/* =======================
   Course-wide "next item" navigation
======================= */

type FlatItem =
  | { type: 'subtopic'; id: string; slug: string; title: string }
  | { type: 'quiz'; id: string; title: string }
  | { type: 'assignment'; id: string; title: string }
  | { type: 'capstone'; id: string; title: string };

function flattenCourseStructure(topics: any[]): FlatItem[] {
  const flat: FlatItem[] = [];
  topics.forEach((topic) => {
    (topic.units || []).forEach((unit: any) => {
      (unit.subtopics || []).forEach((sub: any) =>
        flat.push({ type: 'subtopic', id: sub.id, slug: sub.slug, title: sub.title }),
      );
      (unit.quizzes || []).forEach((quiz: any) =>
        flat.push({ type: 'quiz', id: quiz.id, title: `Unit Quiz: ${unit.title}` }),
      );
      (unit.assignments || []).forEach((a: any) =>
        flat.push({ type: 'assignment', id: a.id, title: a.title }),
      );
    });
    if (topic.capstone) {
      flat.push({ type: 'capstone', id: topic.capstone.id, title: topic.capstone.title });
    }
  });
  return flat;
}

function buildItemUrl(slug: string, item: FlatItem): string {
  const base = `/dashboard/student/courses/${slug}`;
  if (item.type === 'subtopic') return `${base}/lesson/${item.slug}`;
  if (item.type === 'quiz') return `${base}/quiz/${item.id}`;
  if (item.type === 'capstone') return `${base}/capstone/${item.id}`;
  return `${base}/assignment/${item.id}`;
}

interface AssignmentDetail {
  id: string;
  title: string;
  instructions?: string;
  max_score: number;
  evaluator_type?: string | null;
  test_cases?: any;
  rubric?: any;
  unit_title?: string;
  subject_title?: string;
  allowed_submission_types?: SubmissionType[];
  submission_type?: SubmissionType | null;
  submission_link?: string | null;
  submission_file_url?: string | null;
  submission_file_name?: string | null;
  submitted_at?: string | null;
  updated_at?: string | null;
}

export default function AssignmentView() {
  const { assignmentId, slug } = useParams();
  const navigate = useNavigate();
  const [assignment, setAssignment] = useState<AssignmentDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [courseStructure, setCourseStructure] = useState<any[]>([]);

  const [activeType, setActiveType] = useState<SubmissionType>('github');
  const [solutionUrl, setSolutionUrl] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [urlValidationError, setUrlValidationError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!slug) return;
    apiClient
      .get(`/subjects/${slug}`)
      .then((res) => setCourseStructure(res.data?.data || []))
      .catch(() => {});
  }, [slug]);

  const nextItem = useMemo(() => {
    if (!courseStructure.length || !assignmentId) return undefined;
    const flat = flattenCourseStructure(courseStructure);
    const currentIndex = flat.findIndex(
      (item) => item.type === 'assignment' && item.id === assignmentId,
    );
    if (currentIndex === -1) return undefined;
    return flat[currentIndex + 1] ?? null;
  }, [courseStructure, assignmentId]);

  const goToNext = () => {
    if (!slug) return;
    if (nextItem) {
      navigate(buildItemUrl(slug, nextItem));
    } else {
      fireConfetti();
      toast.success('🎉 Course completed! Great work!');
      setTimeout(() => navigate(`/dashboard/student/courses/${slug}`), 800);
    }
  };

  const fetchAssignment = async () => {
    if (!assignmentId) return;
    try {
      setLoading(true);
      setError(false);
      const res = await apiClient.get<{
        success: boolean;
        data: AssignmentDetail;
      }>(`/students/assignments/${assignmentId}`);
      const data = res.data.data;
      setAssignment(data);

      const available = Array.isArray(data.allowed_submission_types) && data.allowed_submission_types.length > 0
        ? data.allowed_submission_types
        : ALL_SUBMISSION_TYPES;

      if (data.submission_type && available.includes(data.submission_type)) {
        setActiveType(data.submission_type);
      } else if (available.length > 0) {
        setActiveType(available[0]);
      }

      if (data.submission_link) {
        setSolutionUrl(data.submission_link);
      }
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAssignment();
  }, [assignmentId]);

  const allowedTypes: SubmissionType[] = useMemo(() => {
    return Array.isArray(assignment?.allowed_submission_types) && assignment.allowed_submission_types.length > 0
      ? assignment.allowed_submission_types
      : ALL_SUBMISSION_TYPES;
  }, [assignment?.allowed_submission_types]);

  const handleTypeSelect = (type: SubmissionType) => {
    setActiveType(type);
    setUrlValidationError(null);
    if (assignment?.submission_type === type && assignment.submission_link) {
      setSolutionUrl(assignment.submission_link);
    } else {
      setSolutionUrl('');
    }
  };

  const handleUrlChange = (value: string) => {
    setSolutionUrl(value);
    if (!value.trim()) {
      setUrlValidationError(null);
      return;
    }
    const validator = SUBMISSION_REGEX[activeType];
    if (validator && !validator.pattern.test(value.trim())) {
      setUrlValidationError(`Invalid format. Example: ${validator.example}`);
    } else {
      setUrlValidationError(null);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 25 * 1024 * 1024) {
        toast.error('File size must be under 25MB');
        return;
      }
      setSelectedFile(file);
    }
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) {
      if (file.size > 25 * 1024 * 1024) {
        toast.error('File size must be under 25MB');
        return;
      }
      setSelectedFile(file);
    }
  };

  const handleSubmit = async () => {
    if (activeType === 'file') {
      if (!selectedFile && !assignment?.submission_file_url) {
        toast.error('Please select a file to upload');
        return;
      }
      if (!selectedFile && isSubmitted && assignment?.submission_type === 'file') {
        toast.error('Please select a new file to update your submission');
        return;
      }
    } else {
      if (!solutionUrl.trim()) {
        toast.error(`Please enter your ${SUBMISSION_TYPE_CONFIGS[activeType].label} URL`);
        return;
      }
      const validator = SUBMISSION_REGEX[activeType];
      if (validator && !validator.pattern.test(solutionUrl.trim())) {
        toast.error(`Please provide a valid ${SUBMISSION_TYPE_CONFIGS[activeType].shortLabel} URL`);
        return;
      }
    }

    try {
      setSubmitting(true);
      const formData = new FormData();
      formData.append('submission_type', activeType);

      if (activeType === 'file') {
        if (selectedFile) {
          formData.append('submission_file', selectedFile);
        }
      } else {
        formData.append('submission_link', solutionUrl.trim());
      }

      const res = await apiClient.post<{
        success: boolean;
        data: Partial<AssignmentDetail>;
      }>(`/students/assignments/${assignmentId}/submit`, formData);

      setAssignment((prev) => (prev ? { ...prev, ...res.data.data } : prev));
      setSelectedFile(null);
      toast.success(isSubmitted ? 'Submission updated successfully!' : 'Assignment submitted successfully!');
      notifyCourseProgressUpdated();
    } catch (error) {
      toast.error(getErrorMessage(error, 'Failed to submit assignment'));
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className='flex h-[60vh] items-center justify-center'>
        <Loader2 className='h-10 w-10 animate-spin text-[#333D7C]' />
      </div>
    );
  }

  if (error || !assignment) {
    return (
      <div className='flex h-[60vh] flex-col items-center justify-center gap-3 p-10 text-center'>
        <XCircle className='h-12 w-12 text-red-400' />
        <p className='text-lg font-semibold text-slate-700'>Failed to load assignment</p>
        <p className='text-sm text-slate-500'>Please try refreshing the page.</p>
      </div>
    );
  }

  const isSubmitted = Boolean(assignment.submission_link || assignment.submission_file_url);
  const currentTypeConfig = SUBMISSION_TYPE_CONFIGS[activeType] || SUBMISSION_TYPE_CONFIGS.file;

  return (
    <div className='p-4 sm:p-6 md:p-8 max-w-4xl mx-auto space-y-6 sm:space-y-8'>
      {/* Header */}
      <header className='space-y-3'>
        <div className='flex items-start gap-3'>
          <div className='w-10 h-10 sm:w-11 sm:h-11 rounded-2xl bg-[#333D7C]/10 text-[#333D7C] flex items-center justify-center shrink-0 mt-0.5'>
            <ClipboardList className='h-5 w-5' />
          </div>
          <h1 className='text-2xl sm:text-3xl font-bold text-[#1e293b] leading-tight'>
            {assignment.title}
          </h1>
        </div>
        <div className='flex flex-wrap gap-1.5 sm:gap-2'>
          <Badge className='bg-[#333D7C]/10 text-[#333D7C] border-none text-xs'>Assignment</Badge>
          <Badge className='bg-slate-100 text-slate-600 border-none text-xs'>
            Max: {assignment.max_score} pts
          </Badge>
          {assignment.unit_title && (
            <Badge className='bg-slate-100 text-slate-500 border-none text-xs'>
              {assignment.unit_title}
            </Badge>
          )}
          {assignment.evaluator_type && (
            <Badge className='bg-indigo-50 text-indigo-700 border-indigo-200 text-xs font-semibold uppercase'>
              {assignment.evaluator_type} Evaluator
            </Badge>
          )}
          {isSubmitted && (
            <Badge className='bg-emerald-50 text-emerald-700 border-none text-xs'>
              <CheckCircle2 className='h-3 w-3 mr-1' />
              Submitted
            </Badge>
          )}
        </div>
      </header>

      {/* Instructions */}
      <Card className='overflow-hidden rounded-2xl sm:rounded-[2rem] border border-slate-100 shadow-sm p-0'>
        <div className='px-4 sm:px-8 pt-5 sm:pt-6'>
          <p className='text-xs font-semibold uppercase tracking-widest text-slate-400'>Instructions</p>
          <p className='text-xs sm:text-sm text-slate-500 mt-0.5'>Read carefully before submitting</p>
        </div>
        <div className='px-4 py-5 sm:px-8 sm:py-6'>
          {assignment.instructions ? (
            <div className='prose prose-slate max-w-full overflow-x-auto text-sm sm:text-base lg:prose-lg'>
              {/^<[a-z][\s\S]*>/i.test(assignment.instructions.trimStart()) ? (
                <div dangerouslySetInnerHTML={{ __html: assignment.instructions }} />
              ) : (
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{assignment.instructions}</ReactMarkdown>
              )}
            </div>
          ) : (
            <p className='italic text-slate-400 text-sm'>No instructions provided.</p>
          )}
        </div>
      </Card>

      {/* Grading Rubric */}
      {assignment.rubric && (
        <AssignmentRubricsViewer rubric={assignment.rubric} maxScore={assignment.max_score} />
      )}

      {/* Test Cases */}
      {assignment.test_cases && (
        <AssignmentTestCasesViewer
          testCases={assignment.test_cases}
          evaluatorType={assignment.evaluator_type}
          isStaff={false}
        />
      )}

      {/* Submission Card */}
      <Card className='overflow-hidden rounded-2xl sm:rounded-[2rem] border border-slate-100 shadow-sm p-0'>
        <div className='px-4 sm:px-8 pt-5 sm:pt-6'>
          <p className='text-xs font-semibold uppercase tracking-widest text-slate-400'>Your Submission</p>
          <p className='text-xs sm:text-sm text-slate-500 mt-0.5'>
            {isSubmitted
              ? 'Already submitted — you can resubmit or update your deliverable below'
              : 'Choose an accepted submission method and deliver your work'}
          </p>
        </div>

        <div className='px-4 py-5 sm:px-8 sm:py-6 space-y-4'>
          {/* Method Tabs if multiple options allowed */}
          {allowedTypes.length > 1 && (
            <div className='space-y-1.5'>
              <p className='text-xs font-medium text-slate-500'>Choose submission method:</p>
              <div className='grid grid-cols-2 sm:grid-cols-3 gap-1.5 bg-slate-100 p-1.5 rounded-xl'>
                {allowedTypes.map((type) => {
                  const cfg = SUBMISSION_TYPE_CONFIGS[type];
                  const isSelected = activeType === type;
                  return (
                    <button
                      key={type}
                      type='button'
                      onClick={() => handleTypeSelect(type)}
                      className={`flex items-center justify-center gap-1.5 py-2 px-2 text-xs font-semibold rounded-lg transition-all ${
                        isSelected
                          ? 'bg-[#333D7C] text-white shadow-xs'
                          : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
                      }`}
                    >
                      <span>{cfg.emoji}</span>
                      <span className='truncate'>{cfg.shortLabel}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Cloud Permissions Warning */}
          {currentTypeConfig.requiresPermissionsWarning && (
            <div className='flex items-start gap-2.5 p-3 rounded-xl bg-amber-50 border border-amber-200/80 text-amber-800 text-xs'>
              <AlertTriangle className='w-4 h-4 text-amber-600 shrink-0 mt-0.5' />
              <div>
                <span className='font-semibold'>Sharing Permission Notice:</span> Ensure your link is set to{' '}
                <span className='font-semibold underline'>&quot;Anyone with the link can view&quot;</span> so instructors can grade your deliverable.
              </div>
            </div>
          )}

          {/* Input Area Based on Selected Method */}
          {activeType === 'file' ? (
            <div
              onClick={() => fileInputRef.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={onDrop}
              className={`border-2 border-dashed rounded-2xl p-6 sm:p-8 text-center space-y-3 transition-all group cursor-pointer ${
                selectedFile
                  ? 'border-emerald-400 bg-emerald-50/50'
                  : 'border-slate-200 hover:border-[#333D7C] hover:bg-slate-50/50'
              }`}
            >
              <input
                type='file'
                className='hidden'
                ref={fileInputRef}
                onChange={handleFileChange}
                accept='.pdf,.docx,.doc,.txt,.xlsx,.xls,.pptx,.ppt,.zip,.rar'
              />
              <div
                className={`w-12 h-12 rounded-2xl flex items-center justify-center mx-auto transition-transform group-hover:scale-110 ${
                  selectedFile ? 'bg-emerald-100 text-emerald-600' : 'bg-[#333D7C]/10 text-[#333D7C]'
                }`}
              >
                <Upload className='w-5 h-5' />
              </div>
              <div className='space-y-1'>
                <p className='text-xs sm:text-sm font-semibold text-[#1e293b] break-all'>
                  {selectedFile
                    ? selectedFile.name
                    : assignment.submission_file_name
                    ? `Current: ${assignment.submission_file_name}`
                    : 'Click to upload or drag and drop your deliverable'}
                </p>
                <p className='text-[11px] sm:text-xs text-slate-400'>
                  {selectedFile
                    ? `${(selectedFile.size / 1024 / 1024).toFixed(2)} MB`
                    : 'PDF, DOCX, XLSX, PPTX, ZIP (Max 25MB)'}
                </p>
              </div>
            </div>
          ) : (
            <div className='space-y-2'>
              <div className='relative'>
                <div className='absolute left-3.5 top-3.5 text-lg select-none'>
                  {currentTypeConfig.emoji}
                </div>
                <textarea
                  value={solutionUrl}
                  onChange={(e) => handleUrlChange(e.target.value)}
                  placeholder={currentTypeConfig.placeholder}
                  className={`w-full rounded-2xl border-2 px-11 py-3 text-xs sm:text-sm outline-none transition-all placeholder:text-slate-300 min-h-24 resize-none ${
                    urlValidationError
                      ? 'border-red-300 bg-red-50/20 focus:border-red-500'
                      : 'border-slate-100 focus:border-[#333D7C]'
                  }`}
                />
              </div>
              {urlValidationError ? (
                <p className='text-xs text-red-500 font-medium px-1 flex items-center gap-1'>
                  <span>⚠️</span> {urlValidationError}
                </p>
              ) : (
                <p className='text-[11px] text-slate-400 italic px-1'>
                  {currentTypeConfig.helperText}
                </p>
              )}
            </div>
          )}

          {/* Active Deliverable Summary */}
          {isSubmitted && (
            <div className='p-3.5 rounded-xl bg-slate-50 border border-slate-200/70 space-y-1.5'>
              <div className='flex items-center justify-between text-xs text-slate-500'>
                <span className='font-medium'>
                  {assignment.updated_at && assignment.submitted_at && new Date(assignment.updated_at).getTime() > new Date(assignment.submitted_at).getTime() + 1000
                    ? 'Last Updated:'
                    : 'Submitted On:'}
                </span>
                <span>
                  {assignment.updated_at || assignment.submitted_at
                    ? new Date(assignment.updated_at || assignment.submitted_at!).toLocaleString()
                    : 'Recently'}
                </span>
              </div>
              {assignment.submission_type && (
                <div className='flex items-center justify-between text-xs text-slate-500'>
                  <span className='font-medium'>Submitted Via:</span>
                  <span className='font-semibold text-slate-700 capitalize flex items-center gap-1'>
                    <span>{SUBMISSION_TYPE_CONFIGS[assignment.submission_type]?.emoji || '📄'}</span>
                    <span>{SUBMISSION_TYPE_CONFIGS[assignment.submission_type]?.label || assignment.submission_type}</span>
                  </span>
                </div>
              )}
              {assignment.submission_link && (
                <div className='flex items-center justify-between gap-2 text-xs'>
                  <span className='text-slate-500 truncate'>Link:</span>
                  <a
                    href={assignment.submission_link}
                    target='_blank'
                    rel='noopener noreferrer'
                    className='text-[#333D7C] hover:underline font-semibold flex items-center gap-1 truncate'
                  >
                    <span className='truncate max-w-[280px] sm:max-w-md'>{assignment.submission_link}</span>
                    <ExternalLink className='w-3 h-3 shrink-0' />
                  </a>
                </div>
              )}
              {assignment.submission_file_url && (
                <div className='flex items-center justify-between gap-2 text-xs'>
                  <span className='text-slate-500'>File:</span>
                  <a
                    href={assignment.submission_file_url}
                    target='_blank'
                    rel='noopener noreferrer'
                    className='text-[#333D7C] hover:underline font-semibold flex items-center gap-1'
                  >
                    <FileText className='w-3 h-3' />
                    <span className='truncate'>{assignment.submission_file_name || 'Download Deliverable'}</span>
                  </a>
                </div>
              )}
            </div>
          )}

          <div className='flex justify-end pt-2'>
            <Button
              onClick={handleSubmit}
              loading={submitting}
              className='bg-[#333D7C] hover:bg-[#2a3268] h-11 px-8 font-semibold w-full sm:w-auto shadow-sm'
            >
              {isSubmitted ? 'Update Submission' : 'Submit Assignment'}
            </Button>
          </div>
        </div>
      </Card>

      {isSubmitted && nextItem !== undefined && (
        <div className='flex justify-end'>
          <Button
            onClick={goToNext}
            className='bg-emerald-600 hover:bg-emerald-700 gap-2 h-11 px-6 font-semibold w-full sm:w-auto min-h-[44px]'
          >
            {nextItem ? (
              <span className='flex items-center gap-1.5 truncate'>
                <span className='truncate'>Next: {nextItem.title}</span>
                <ArrowRight className='h-4 w-4 shrink-0' />
              </span>
            ) : (
              <>
                Finish Course
                <PartyPopper className='h-4 w-4 shrink-0' />
              </>
            )}
          </Button>
        </div>
      )}
    </div>
  );
}
