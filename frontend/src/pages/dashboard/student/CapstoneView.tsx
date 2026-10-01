import { useEffect, useMemo, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router';
import {
  Loader2,
  XCircle,
  Trophy,
  CheckCircle2,
  ArrowRight,
  PartyPopper,
  Eye,
  Sparkles,
  Upload,
  FileText,
  ExternalLink,
  AlertTriangle,
} from 'lucide-react';
import { StudentAssignmentFeedbackModal } from '@/components/common/student/StudentAssignmentFeedbackModal';
import type { StudentAssignmentOverviewItem, SubmissionType } from '@/utils/types';
import { SUBMISSION_TYPE_CONFIGS, ALL_SUBMISSION_TYPES } from '@/utils/types';
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

interface CapstoneDetail {
  id: string;
  title: string;
  instructions?: string | null;
  max_score: number;
  evaluator_type?: string | null;
  rubric?: any;
  test_cases?: any;
  allowed_submission_types?: SubmissionType[];
  submission_type?: SubmissionType | null;
  submission_link?: string | null;
  submission_file_url?: string | null;
  submission_file_name?: string | null;
  submitted_at?: string | null;
  updated_at?: string | null;
  is_approved?: boolean | null;
  score?: number | null;
  rubric_breakdown?: any;
  execution_logs?: string | null;
  evaluation_status?: string | null;
}

export default function CapstoneView() {
  const { projectId, slug } = useParams();
  const navigate = useNavigate();
  const [capstone, setCapstone] = useState<CapstoneDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [courseStructure, setCourseStructure] = useState<any[]>([]);

  const [activeType, setActiveType] = useState<SubmissionType>('github');
  const [link, setLink] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [urlValidationError, setUrlValidationError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [feedbackModalOpen, setFeedbackModalOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const overviewItem: StudentAssignmentOverviewItem | null = useMemo(() => {
    if (!capstone || capstone.score === null || capstone.score === undefined) return null;
    let parsedFeedback = null;
    if (typeof capstone.rubric_breakdown === 'object') {
      parsedFeedback = capstone.rubric_breakdown;
    } else if (typeof capstone.rubric_breakdown === 'string') {
      try {
        parsedFeedback = JSON.parse(capstone.rubric_breakdown);
      } catch {}
    }
    return {
      id: capstone.id,
      title: capstone.title,
      type: 'CAPSTONE',
      course_name: slug ? slug.replace(/-/g, ' ').toUpperCase() : 'Capstone Course',
      max_score: capstone.max_score || 100,
      status: 'evaluated',
      marks: capstone.score,
      submission_link: capstone.submission_link,
      feedback: parsedFeedback,
      navigation_url: window.location.pathname,
    };
  }, [capstone, slug]);

  useEffect(() => {
    if (!slug) return;
    apiClient
      .get(`/subjects/${slug}`)
      .then((res) => setCourseStructure(res.data?.data || []))
      .catch(() => {
        // Non-critical — only drives the "Next" button; page still works without it.
      });
  }, [slug]);

  const nextItem = useMemo(() => {
    if (!courseStructure.length || !projectId) return undefined;
    const flat = flattenCourseStructure(courseStructure);
    const currentIndex = flat.findIndex(
      (item) => item.type === 'capstone' && item.id === projectId,
    );
    if (currentIndex === -1) return undefined;
    return flat[currentIndex + 1] ?? null;
  }, [courseStructure, projectId]);

  const goToNext = () => {
    if (!slug) return;
    if (nextItem) {
      navigate(buildItemUrl(slug, nextItem));
    } else {
      navigate(`/dashboard/student/courses/${slug}`);
    }
  };

  useEffect(() => {
    if (!projectId) return;

    const fetchCapstone = async () => {
      try {
        setLoading(true);
        setError(false);
        const res = await apiClient.get<{
          success: boolean;
          data: CapstoneDetail;
        }>(`/students/capstone/${projectId}`);
        const data = res.data.data;
        setCapstone(data);
        if (data.submission_type) {
          setActiveType(data.submission_type);
        }
        if (data.submission_link) {
          setLink(data.submission_link);
        }
      } catch {
        setError(true);
      } finally {
        setLoading(false);
      }
    };

    fetchCapstone();
  }, [projectId]);

  const allowedTypes: SubmissionType[] = useMemo(() => {
    const raw = capstone?.allowed_submission_types;
    if (!raw) return ALL_SUBMISSION_TYPES;
    if (Array.isArray(raw) && raw.length > 0) return raw as SubmissionType[];
    if (typeof raw === 'string') {
      try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed as SubmissionType[];
      } catch {}
    }
    return ALL_SUBMISSION_TYPES;
  }, [capstone?.allowed_submission_types]);

  useEffect(() => {
    if (capstone?.submission_type && allowedTypes.includes(capstone.submission_type)) {
      setActiveType(capstone.submission_type);
    } else if (allowedTypes.length > 0 && !allowedTypes.includes(activeType)) {
      setActiveType(allowedTypes[0]);
    }
  }, [allowedTypes, capstone?.submission_type]);

  const handleTypeSelect = (type: SubmissionType) => {
    setActiveType(type);
    setUrlValidationError(null);
    if (capstone?.submission_type === type && capstone.submission_link) {
      setLink(capstone.submission_link);
    } else {
      setLink('');
    }
  };

  const handleUrlChange = (value: string) => {
    setLink(value);
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
      if (!selectedFile && !capstone?.submission_file_url) {
        toast.error('Please select a file to upload');
        return;
      }
    } else {
      if (!link.trim()) {
        toast.error(`Please enter your ${SUBMISSION_TYPE_CONFIGS[activeType].label} URL`);
        return;
      }
      const validator = SUBMISSION_REGEX[activeType];
      if (validator && !validator.pattern.test(link.trim())) {
        toast.error(`Invalid URL format. Example: ${validator.example}`);
        return;
      }
    }

    try {
      setSubmitting(true);
      let res;
      if (activeType === 'file' && selectedFile) {
        const formData = new FormData();
        formData.append('submission_type', 'file');
        formData.append('submission_file', selectedFile);
        res = await apiClient.post<{
          success: boolean;
          data: CapstoneDetail;
        }>(`/students/capstone/${projectId}/submit`, formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });
      } else {
        res = await apiClient.post<{
          success: boolean;
          data: CapstoneDetail;
        }>(`/students/capstone/${projectId}/submit`, {
          submission_type: activeType,
          submission_link: activeType === 'file' ? null : link.trim(),
        });
      }
      setCapstone((prev) => (prev ? { ...prev, ...res.data.data } : prev));
      toast.success(isSubmitted ? 'Capstone resubmitted successfully!' : 'Capstone submitted! +20 XP');
      fireConfetti();
      notifyCourseProgressUpdated();
      setSelectedFile(null);
    } catch (error) {
      toast.error(getErrorMessage(error, 'Failed to submit capstone'));
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className='flex h-[60vh] items-center justify-center'>
        <Loader2 className='h-10 w-10 animate-spin text-amber-500' />
      </div>
    );
  }

  if (error || !capstone) {
    return (
      <div className='flex h-[60vh] flex-col items-center justify-center gap-3 p-6 sm:p-10 text-center'>
        <XCircle className='h-12 w-12 text-red-400' />
        <p className='text-lg font-semibold text-slate-700'>
          Failed to load capstone project
        </p>
        <p className='text-sm text-slate-500 max-w-sm'>
          Unable to fetch project details. Please try again or return to your dashboard.
        </p>
        <div className='flex items-center gap-3 mt-2'>
          <Button
            variant='outline'
            onClick={() => navigate('/dashboard/student')}
            className='rounded-xl text-xs'
          >
            Dashboard
          </Button>
          <Button
            onClick={() => window.location.reload()}
            className='bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs'
          >
            Retry
          </Button>
        </div>
      </div>
    );
  }

  const isSubmitted = Boolean(capstone.submission_link || capstone.submission_file_url);
  const currentTypeConfig = SUBMISSION_TYPE_CONFIGS[activeType] || SUBMISSION_TYPE_CONFIGS.github;

  return (
    <div className='mx-auto max-w-4xl space-y-6 sm:space-y-8 p-4 sm:p-6 md:p-10'>
      {/* Header */}
      <header className='space-y-3'>
        <div className='flex items-start gap-3'>
          <Trophy className='h-6 w-6 sm:h-7 sm:w-7 text-amber-500 shrink-0 mt-1' />
          <div>
            <h1 className='text-xl sm:text-2xl md:text-3xl font-extrabold text-slate-900 tracking-tight'>
              {capstone.title}
            </h1>
            <p className='text-xs sm:text-sm text-slate-500 mt-1'>
              Topic Capstone Deliverable
            </p>
          </div>
        </div>

        <div className='flex flex-wrap items-center gap-2 pt-1'>
          <Badge className='bg-amber-50 text-amber-700 border border-amber-200 text-xs font-semibold'>
            +{capstone.max_score} XP
          </Badge>
          {isSubmitted && (
            <Badge className='bg-emerald-50 text-emerald-700 border border-emerald-200 text-xs'>
              <CheckCircle2 className='h-3 w-3 mr-1' />
              Submitted
            </Badge>
          )}
          {capstone.is_approved && (
            <Badge className='bg-green-100 text-green-700 border border-green-200 text-xs'>
              Approved
            </Badge>
          )}
        </div>
      </header>

      {/* Instructions */}
      <Card className='overflow-hidden rounded-2xl sm:rounded-3xl border border-slate-200 shadow-sm'>
        <div className='bg-amber-50 px-4 sm:px-6 py-3.5 sm:py-4'>
          <p className='text-xs font-semibold uppercase tracking-widest text-amber-600'>
            Project Instructions
          </p>
          <p className='text-xs sm:text-sm text-slate-600 mt-0.5'>
            Read carefully before starting
          </p>
        </div>
        <div className='bg-white px-4 py-6 sm:px-6 sm:py-8'>
          {capstone.instructions ? (
            <div className='prose prose-slate max-w-full overflow-x-auto text-sm sm:text-base lg:prose-lg'>
              {/^<[a-z][\s\S]*>/i.test(capstone.instructions.trimStart()) ? (
                <div
                  dangerouslySetInnerHTML={{ __html: capstone.instructions }}
                />
              ) : (
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                  {capstone.instructions}
                </ReactMarkdown>
              )}
            </div>
          ) : (
            <p className='italic text-slate-400 text-sm'>No instructions provided.</p>
          )}
        </div>
      </Card>

      {/* Grading Rubric */}
      {capstone.rubric && (
        <AssignmentRubricsViewer rubric={capstone.rubric} maxScore={capstone.max_score} />
      )}

      {/* Test Cases */}
      {capstone.test_cases && (
        <AssignmentTestCasesViewer
          testCases={capstone.test_cases}
          evaluatorType={capstone.evaluator_type}
          isStaff={false}
        />
      )}

      {/* Evaluation Results Card (when project is scored/evaluated) */}
      {overviewItem && (
        <Card className='overflow-hidden rounded-2xl sm:rounded-3xl border border-emerald-200/80 shadow-sm'>
          <div className='bg-gradient-to-r from-emerald-500 to-teal-600 px-4 sm:px-6 py-4 text-white flex flex-col sm:flex-row sm:items-center justify-between gap-3'>
            <div className='flex items-center gap-3'>
              <div className='p-2 bg-white/15 backdrop-blur-sm rounded-xl'>
                <Sparkles className='w-5 h-5 text-yellow-300' />
              </div>
              <div>
                <p className='text-xs font-bold uppercase tracking-wider text-emerald-100'>
                  Evaluation Complete
                </p>
                <h3 className='text-lg font-extrabold text-white'>
                  Score: {overviewItem.marks} / {overviewItem.max_score}
                </h3>
              </div>
            </div>
            <Button
              size='sm'
              onClick={() => setFeedbackModalOpen(true)}
              className='bg-white text-emerald-800 hover:bg-emerald-50 font-bold rounded-xl text-xs h-9 px-4 shadow-sm cursor-pointer'
            >
              <Eye className='w-4 h-4 mr-1.5' /> View Detailed Rubric Results
            </Button>
          </div>
          {overviewItem.feedback?.summary && (
            <div className='p-4 sm:p-6 bg-emerald-50/40 text-xs sm:text-sm text-slate-700 leading-relaxed border-t border-emerald-100'>
              <p className='font-bold text-slate-900 mb-1 text-xs uppercase tracking-wider'>
                Evaluator Feedback:
              </p>
              <p>{overviewItem.feedback.summary}</p>
            </div>
          )}
        </Card>
      )}

      {/* Submission Card */}
      <Card className='overflow-hidden rounded-2xl sm:rounded-3xl border border-slate-200 shadow-sm'>
        <div className='bg-slate-50 px-4 sm:px-6 py-3.5 sm:py-4'>
          <p className='text-xs font-semibold uppercase tracking-widest text-slate-400'>
            Your Submission
          </p>
          <p className='text-xs sm:text-sm text-slate-600 mt-0.5'>
            {isSubmitted
              ? 'Already submitted — choose a method below to resubmit or update your deliverable'
              : 'Choose an accepted submission method and deliver your work'}
          </p>
        </div>

        <div className='bg-white px-4 py-5 sm:px-8 sm:py-6 space-y-4'>
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
                      className={`flex items-center justify-center gap-1.5 py-2 px-2 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
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
                  : 'border-slate-200 hover:border-amber-500 hover:bg-slate-50/50'
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
                  selectedFile ? 'bg-emerald-100 text-emerald-600' : 'bg-amber-100 text-amber-600'
                }`}
              >
                <Upload className='w-5 h-5' />
              </div>
              <div className='space-y-1'>
                <p className='text-xs sm:text-sm font-semibold text-slate-800 break-all'>
                  {selectedFile
                    ? selectedFile.name
                    : capstone.submission_file_name
                    ? `Current: ${capstone.submission_file_name}`
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
                  value={link}
                  onChange={(e) => handleUrlChange(e.target.value)}
                  placeholder={currentTypeConfig.placeholder}
                  className={`w-full rounded-2xl border-2 px-11 py-3 text-xs sm:text-sm outline-none transition-all placeholder:text-slate-300 min-h-24 resize-none ${
                    urlValidationError
                      ? 'border-red-300 bg-red-50/20 focus:border-red-500'
                      : 'border-slate-100 focus:border-amber-500'
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
                  {capstone.updated_at && capstone.submitted_at && new Date(capstone.updated_at).getTime() > new Date(capstone.submitted_at).getTime() + 1000
                    ? 'Last Updated:'
                    : 'Submitted On:'}
                </span>
                <span>
                  {capstone.updated_at || capstone.submitted_at
                    ? new Date(capstone.updated_at || capstone.submitted_at!).toLocaleString()
                    : 'Recently'}
                </span>
              </div>
              {capstone.submission_type && (
                <div className='flex items-center justify-between text-xs text-slate-500'>
                  <span className='font-medium'>Submitted Via:</span>
                  <span className='font-semibold text-slate-700 capitalize flex items-center gap-1'>
                    <span>{SUBMISSION_TYPE_CONFIGS[capstone.submission_type]?.emoji || '📄'}</span>
                    <span>{SUBMISSION_TYPE_CONFIGS[capstone.submission_type]?.label || capstone.submission_type}</span>
                  </span>
                </div>
              )}
              {capstone.submission_link && (
                <div className='flex items-center justify-between gap-2 text-xs'>
                  <span className='text-slate-500 truncate'>Link:</span>
                  <a
                    href={capstone.submission_link}
                    target='_blank'
                    rel='noopener noreferrer'
                    className='text-amber-600 hover:underline font-semibold flex items-center gap-1 truncate'
                  >
                    <span className='truncate max-w-[280px] sm:max-w-md'>{capstone.submission_link}</span>
                    <ExternalLink className='w-3 h-3 shrink-0' />
                  </a>
                </div>
              )}
              {capstone.submission_file_url && (
                <div className='flex items-center justify-between gap-2 text-xs'>
                  <span className='text-slate-500'>File:</span>
                  <a
                    href={capstone.submission_file_url}
                    target='_blank'
                    rel='noopener noreferrer'
                    className='text-amber-600 hover:underline font-semibold flex items-center gap-1'
                  >
                    <FileText className='w-3 h-3' />
                    <span className='truncate'>{capstone.submission_file_name || 'Download Deliverable'}</span>
                  </a>
                </div>
              )}
            </div>
          )}

          <div className='flex justify-end pt-2'>
            <Button
              onClick={handleSubmit}
              loading={submitting}
              className='bg-amber-500 hover:bg-amber-600 text-white h-11 px-8 font-semibold w-full sm:w-auto shadow-sm cursor-pointer'
            >
              {isSubmitted ? 'Update Submission' : 'Submit Capstone Project'}
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

      {/* Detailed Feedback Modal */}
      <StudentAssignmentFeedbackModal
        isOpen={feedbackModalOpen}
        onClose={() => setFeedbackModalOpen(false)}
        assignment={overviewItem}
      />
    </div>
  );
}
