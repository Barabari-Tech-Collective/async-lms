import { useEffect, useState, useMemo, useRef } from 'react';
import { useParams, useNavigate } from 'react-router';
import {
  ChevronLeft,
  Calendar,
  Download,
  FileText,
  Loader2,
  ArrowRight,
  Upload,
  AlertTriangle,
  ExternalLink,
  CheckCircle2,
  Lock,
} from 'lucide-react';
import apiClient from '@/services/api';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import toast from 'react-hot-toast';
import { getErrorMessage } from '@/lib/utils';
import type { CollegeAssignment, SubmissionType } from '@/utils/types';
import { SUBMISSION_TYPE_CONFIGS, ALL_SUBMISSION_TYPES } from '@/utils/types';

// URL Validation Regex Patterns
const SUBMISSION_REGEX: Record<string, { pattern: RegExp; example: string }> = {
  figma: {
    pattern: /^https?:\/\/(www\.)?figma\.com\/(file|design|proto|board)\/[A-Za-z0-9]+/i,
    example: 'https://www.figma.com/design/... or https://www.figma.com/proto/...',
  },
  docs: {
    pattern: /^https?:\/\/((docs\.google\.com\/document\/d\/)|([A-Za-z0-9-]+\.(sharepoint\.com|office\.com|1drv\.ms)))/i,
    example: 'https://docs.google.com/document/d/... or Word Online link',
  },
  excel: {
    pattern: /^https?:\/\/((docs\.google\.com\/spreadsheets\/d\/)|([A-Za-z0-9-]+\.(sharepoint\.com|office\.com|1drv\.ms)))/i,
    example: 'https://docs.google.com/spreadsheets/d/... or Excel Online link',
  },
  github: {
    pattern: /^https?:\/\/(www\.)?(github\.com|gitlab\.com|bitbucket\.org)\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+/i,
    example: 'https://github.com/username/repository',
  },
  url: {
    pattern: /^https?:\/\/[A-Za-z0-9-._~:/?#[\]@!$&'()*+,;=]+/i,
    example: 'https://my-app.vercel.app',
  },
};

export default function CollegeAssignmentView() {
  const { id } = useParams();
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [assignment, setAssignment] = useState<CollegeAssignment | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const [activeType, setActiveType] = useState<SubmissionType>('file');
  const [solutionUrl, setSolutionUrl] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [urlValidationError, setUrlValidationError] = useState<string | null>(null);

  const parsedRubric = useMemo<any[] | null>(() => {
    if (!assignment?.rubric) return null;
    if (Array.isArray(assignment.rubric)) return assignment.rubric;
    if (typeof assignment.rubric === 'string') {
      try {
        const parsed = JSON.parse(assignment.rubric);
        if (Array.isArray(parsed)) return parsed;
        if (typeof parsed === 'object' && parsed && Array.isArray((parsed as any).criteria)) {
          return (parsed as any).criteria;
        }
        return null;
      } catch {
        return null;
      }
    }
    if (typeof assignment.rubric === 'object' && Array.isArray((assignment.rubric as any).criteria)) {
      return (assignment.rubric as any).criteria;
    }
    return null;
  }, [assignment?.rubric]);

  const totalRubricPoints = useMemo(() => {
    if (!parsedRubric) return 0;
    return parsedRubric.reduce((acc, curr) => {
      const p = Number(
        curr.weight ?? curr.score ?? curr.points ?? curr.maxScore ?? curr.max_score ?? 0
      );
      return acc + (isNaN(p) ? 0 : p);
    }, 0);
  }, [parsedRubric]);

  const fetchAssignment = async () => {
    try {
      setLoading(true);
      const res = await apiClient.get<{
        success: boolean;
        data: CollegeAssignment;
      }>(`/college-assignments/${id}`);
      const data = res.data.data;
      setAssignment(data);

      const allowed: SubmissionType[] =
        Array.isArray(data.allowed_submission_types) && data.allowed_submission_types.length > 0
          ? data.allowed_submission_types
          : ALL_SUBMISSION_TYPES;

      if (data.submission_type && allowed.includes(data.submission_type)) {
        setActiveType(data.submission_type);
        if (data.submission_link) {
          setSolutionUrl(data.submission_link);
        }
      } else if (data.submission_link) {
        setSolutionUrl(data.submission_link);
        const linkType = allowed.find((t) => t !== 'file') || 'github';
        setActiveType(linkType);
      } else if (data.submission_file_url) {
        setActiveType('file');
      } else {
        setActiveType(allowed[0] || 'file');
      }
    } catch (error) {
      toast.error(getErrorMessage(error, 'Failed to load assignment details'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAssignment();
  }, [id]);

  const validateUrlInput = (type: SubmissionType, val: string) => {
    if (!val.trim()) {
      setUrlValidationError(null);
      return;
    }
    const validator = SUBMISSION_REGEX[type];
    if (validator && !validator.pattern.test(val.trim())) {
      setUrlValidationError(`Invalid format. Expected e.g. ${validator.example}`);
    } else {
      setUrlValidationError(null);
    }
  };

  const handleUrlChange = (val: string) => {
    setSolutionUrl(val);
    validateUrlInput(activeType, val);
  };

  const handleTypeSelect = (type: SubmissionType) => {
    setActiveType(type);
    if (type !== 'file') {
      validateUrlInput(type, solutionUrl);
    } else {
      setUrlValidationError(null);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      if (file.size > 25 * 1024 * 1024) {
        toast.error('File size exceeds 25MB limit');
        return;
      }
      setSelectedFile(file);
    }
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const file = e.dataTransfer.files[0];
      if (file.size > 25 * 1024 * 1024) {
        toast.error('File size exceeds 25MB limit');
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

      await apiClient.post(`/college-assignments/${id}/submit`, formData);

      toast.success('Assignment submitted successfully!');
      fetchAssignment();
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

  if (!assignment) {
    return (
      <div className='p-10 text-center'>
        <p className='text-slate-500'>Assignment not found.</p>
        <Button variant='ghost' onClick={() => navigate(-1)} className='mt-4'>
          Go Back
        </Button>
      </div>
    );
  }

  const allowedTypes: SubmissionType[] =
    Array.isArray(assignment.allowed_submission_types) &&
    assignment.allowed_submission_types.length > 0
      ? assignment.allowed_submission_types
      : ALL_SUBMISSION_TYPES;

  const isSubmitted = Boolean(
    assignment.submission_link || assignment.submission_file_url
  );

  const currentTypeConfig = SUBMISSION_TYPE_CONFIGS[activeType] || SUBMISSION_TYPE_CONFIGS.file;

  return (
    <div className='min-h-screen bg-[#FDFDFD] p-4 sm:p-6 md:p-10'>
      <div className='max-w-6xl mx-auto'>
        {/* Navigation / Back Button */}
        <div className='flex items-center justify-between mb-6 sm:mb-8'>
          <button
            onClick={() => navigate(-1)}
            className='flex items-center gap-2 text-slate-400 hover:text-[#1e293b] font-semibold text-sm transition-all group py-2'
          >
            <div className='w-8 h-8 rounded-xl bg-white border border-slate-100 flex items-center justify-center group-hover:border-[#333D7C] group-hover:text-[#333D7C] transition-all shadow-xs'>
              <ChevronLeft className='w-4 h-4' />
            </div>
            <span>Back to Assignments</span>
          </button>
        </div>

        {/* Hero Card */}
        <Card className='border border-slate-100 mb-6 sm:mb-8 rounded-2xl sm:rounded-[2rem] p-5 sm:p-8 md:p-10 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-6 overflow-hidden relative'>
          <div className='space-y-3 sm:space-y-4'>
            <div className='flex flex-wrap items-center gap-2 sm:gap-3'>
              <span className='px-3 py-0.5 bg-[#333D7C]/10 text-[#333D7C] text-[10px] font-bold uppercase rounded-full'>
                {assignment.course || 'General'}
              </span>
              <span
                className={`px-3 py-0.5 rounded-full text-[10px] font-bold uppercase flex items-center gap-1.5 ${
                  isSubmitted
                    ? 'bg-emerald-50 text-emerald-700'
                    : 'bg-orange-50 text-orange-600'
                }`}
              >
                {isSubmitted && <CheckCircle2 className='w-3 h-3' />}
                {isSubmitted ? 'Completed' : 'Pending'}
              </span>
            </div>
            <h1 className='text-2xl sm:text-3xl font-bold text-[#1e293b] tracking-tight capitalize'>
              {assignment.title}
            </h1>
            <div className='flex items-center gap-2 text-slate-400 font-medium text-xs sm:text-sm'>
              <Calendar className='w-4 h-4 text-[#333D7C]' />
              <span>
                Due:{' '}
                {assignment.due_date
                  ? new Date(assignment.due_date).toLocaleDateString('en-US', {
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric',
                    })
                  : 'No Deadline'}
              </span>
            </div>
          </div>
          {assignment.instruction_file_url && (
            <a
              href={assignment.instruction_file_url}
              target='_blank'
              rel='noopener noreferrer'
              className='p-3 sm:p-4 rounded-full bg-slate-50 text-slate-400 hover:text-slate-900 transition-all hover:bg-slate-100 self-start md:self-auto shrink-0'
              title='Download instruction document'
            >
              <Download className='w-5 h-5' />
            </a>
          )}
        </Card>

        {/* Two Column Section */}
        <div className='grid grid-cols-1 lg:grid-cols-12 gap-6 sm:gap-8'>
          {/* Left: Assignment Brief */}
          <div className='lg:col-span-7 space-y-6'>
            <Card className='border border-slate-100 rounded-2xl sm:rounded-[2rem] p-5 sm:p-8 md:p-10 shadow-sm h-full'>
              <div className='space-y-8 sm:space-y-10'>
                <div className='space-y-6 sm:space-y-8'>
                  <div className='space-y-3 sm:space-y-4'>
                    <h2 className='text-lg sm:text-xl font-bold text-[#1e293b]'>
                      Assignment Brief
                    </h2>
                    {assignment.description ? (
                      <div
                        className='prose prose-sm max-w-full overflow-x-auto text-slate-500 leading-7'
                        dangerouslySetInnerHTML={{
                          __html: assignment.description,
                        }}
                      />
                    ) : (
                      <p className='text-slate-500 italic text-sm'>
                        No description provided.
                      </p>
                    )}
                  </div>

                  {assignment.assignment_description && (
                    <div className='space-y-3 sm:space-y-4 pt-6 border-t border-slate-100'>
                      <h2 className='text-lg sm:text-xl font-bold text-[#1e293b]'>
                        Instructions
                      </h2>
                      <div
                        className='prose prose-sm max-w-full overflow-x-auto text-slate-500 leading-7'
                        dangerouslySetInnerHTML={{
                          __html: assignment.assignment_description,
                        }}
                      />
                    </div>
                  )}

                  {assignment.test_cases &&
                    assignment.test_cases.length > 0 && (
                      <div className='space-y-3 sm:space-y-4 pt-6 border-t border-slate-100'>
                        <h2 className='text-lg sm:text-xl font-bold text-[#1e293b]'>
                          Test Cases
                        </h2>
                        <div className='rounded-xl border border-slate-200 overflow-x-auto max-w-full'>
                          <table className='w-full text-xs sm:text-sm text-left min-w-[340px]'>
                            <thead className='bg-slate-50 text-slate-600 font-semibold'>
                              <tr>
                                <th className='px-3 sm:px-4 py-3 border-b'>Input</th>
                                <th className='px-3 sm:px-4 py-3 border-b'>
                                  Expected Output
                                </th>
                                <th className='px-3 sm:px-4 py-3 border-b w-20 sm:w-24 text-center'>
                                  Points
                                </th>
                              </tr>
                            </thead>
                            <tbody className='divide-y divide-slate-100 bg-white'>
                              {assignment.test_cases.map((tc, idx) => (
                                <tr
                                  key={idx}
                                  className='hover:bg-slate-50 transition-colors'
                                >
                                  <td className='px-3 sm:px-4 py-3 font-mono text-slate-700'>
                                    {tc.input}
                                  </td>
                                  <td className='px-3 sm:px-4 py-3 font-mono text-slate-700'>
                                    <span className='inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-slate-100 text-slate-600 border border-slate-200'>
                                      <Lock className='w-3 h-3 text-slate-400' />
                                      Locked (Evaluated on submission)
                                    </span>
                                  </td>
                                  <td className='px-3 sm:px-4 py-3 text-center font-semibold text-[#333D7C]'>
                                    {tc.score}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}

                  {parsedRubric && parsedRubric.length > 0 && (
                    <div className='space-y-3 sm:space-y-4 pt-6 border-t border-slate-100'>
                      <div className='flex items-center justify-between'>
                        <div>
                          <h2 className='text-lg sm:text-xl font-bold text-[#1e293b]'>
                            Evaluation Rubric
                          </h2>
                          <p className='text-xs sm:text-sm text-slate-500 mt-0.5'>
                            Criteria and point distribution for automated evaluation
                          </p>
                        </div>
                        <div className='flex items-center gap-1.5 sm:gap-2'>
                          <span className='px-2.5 py-1 rounded-lg text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200/70'>
                            {parsedRubric.length} {parsedRubric.length === 1 ? 'Criterion' : 'Criteria'}
                          </span>
                          {totalRubricPoints > 0 && (
                            <span className='px-2.5 py-1 rounded-lg text-xs font-semibold bg-slate-100 text-slate-700 border border-slate-200'>
                              {totalRubricPoints} pts total
                            </span>
                          )}
                        </div>
                      </div>

                      <div className='grid gap-2.5 sm:gap-3'>
                        {parsedRubric.map((item: any, idx: number) => {
                          const rawPoints =
                            item.weight ??
                            item.score ??
                            item.points ??
                            item.maxScore ??
                            item.max_score ??
                            0;
                          const points = Number.isNaN(Number(rawPoints))
                            ? rawPoints
                            : Number(rawPoints);
                          const title =
                            item.name || item.title || item.criterion || `Criterion ${idx + 1}`;

                          return (
                            <div
                              key={idx}
                              className='p-3.5 sm:p-4 rounded-xl border border-slate-200 bg-white hover:border-[#333D7C]/30 transition-colors space-y-2'
                            >
                              <div className='flex items-start justify-between gap-3'>
                                <div className='flex items-start gap-2.5 min-w-0 flex-1'>
                                  <div className='w-6 h-6 rounded-lg bg-[#333D7C]/10 text-[#333D7C] flex items-center justify-center shrink-0 mt-0.5 text-xs font-bold'>
                                    {idx + 1}
                                  </div>
                                  <div className='min-w-0 flex-1'>
                                    <h3 className='font-semibold text-xs sm:text-sm text-slate-800 leading-snug'>
                                      {title}
                                    </h3>
                                    {item.description && (
                                      <p className='text-xs sm:text-sm text-slate-600 mt-1 leading-relaxed'>
                                        {item.description}
                                      </p>
                                    )}
                                  </div>
                                </div>
                                <div className='shrink-0 ml-3 px-2.5 py-1 bg-[#333D7C]/10 text-[#333D7C] border border-[#333D7C]/20 rounded-lg font-bold text-xs sm:text-sm whitespace-nowrap shadow-2xs'>
                                  {points} {points === 1 ? 'pt' : 'pts'}
                                </div>
                              </div>

                              {totalRubricPoints > 0 &&
                                typeof points === 'number' &&
                                points > 0 && (
                                  <div className='w-full bg-slate-100 rounded-full h-1.5 mt-1 overflow-hidden'>
                                    <div
                                      className='bg-[#333D7C] h-1.5 rounded-full transition-all duration-300'
                                      style={{
                                        width: `${Math.min(
                                          100,
                                          Math.round((points / totalRubricPoints) * 100)
                                        )}%`,
                                      }}
                                    />
                                  </div>
                                )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>

                <div className='pt-6 sm:pt-8 border-t border-slate-50'>
                  {assignment.instruction_file_url ? (
                    <a
                      href={assignment.instruction_file_url}
                      target='_blank'
                      rel='noopener noreferrer'
                      className='inline-flex items-center gap-2 text-xs sm:text-sm font-semibold text-[#333D7C] hover:underline'
                    >
                      <FileText className='w-4 h-4' />
                      <span>Download Full Instructions PDF</span>
                    </a>
                  ) : null}
                </div>
              </div>
            </Card>
          </div>

          {/* Right: Submit Assignment */}
          <div className='lg:col-span-5 space-y-6 min-w-0'>
            <Card className='border border-slate-100 rounded-2xl sm:rounded-[2rem] p-5 sm:p-8 md:p-10 shadow-sm space-y-5 sm:space-y-6'>
              <div className='flex items-center justify-between'>
                <h2 className='text-lg sm:text-xl font-bold text-[#1e293b]'>
                  Submit Assignment
                </h2>
                {isSubmitted && (
                  <span className='px-2.5 py-0.5 bg-emerald-50 text-emerald-700 text-xs font-semibold rounded-full'>
                    Submitted
                  </span>
                )}
              </div>

              {/* Dynamic Submission Type Tabs */}
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

              {/* Cloud Sharing Permission Warning Alert */}
              {currentTypeConfig.requiresPermissionsWarning && (
                <div className='flex items-start gap-2.5 p-3 rounded-xl bg-amber-50 border border-amber-200/80 text-amber-800 text-xs'>
                  <AlertTriangle className='w-4 h-4 text-amber-600 shrink-0 mt-0.5' />
                  <div>
                    <span className='font-semibold'>Sharing Permission Notice:</span> Ensure your link is set to{' '}
                    <span className='font-semibold underline'>&quot;Anyone with the link can view&quot;</span> so facilitators can grade your deliverable.
                  </div>
                </div>
              )}

              {/* Input Area Based on Selected Submission Type */}
              {activeType === 'file' ? (
                <div
                  onClick={() => fileInputRef.current?.click()}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={onDrop}
                  className={`border-2 border-dashed rounded-2xl sm:rounded-[2rem] p-6 sm:p-10 text-center space-y-3 sm:space-y-4 transition-all group cursor-pointer ${
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
                    className={`w-12 h-12 sm:w-14 sm:h-14 rounded-2xl flex items-center justify-center mx-auto transition-transform group-hover:scale-110 ${
                      selectedFile ? 'bg-emerald-100' : 'bg-[#333D7C]/10'
                    }`}
                  >
                    <Upload
                      className={`w-5 h-5 sm:w-6 sm:h-6 ${selectedFile ? 'text-emerald-600' : 'text-[#333D7C]'}`}
                    />
                  </div>
                  <div className='space-y-1'>
                    <p className='text-xs sm:text-sm font-semibold text-[#1e293b] break-all'>
                      {selectedFile
                        ? selectedFile.name
                        : assignment.submission_file_name
                        ? `Current: ${assignment.submission_file_name}`
                        : 'Click to upload or drag and drop'}
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

              {/* Current Active Submission Review */}
              {isSubmitted && (
                <div className='p-3.5 rounded-xl bg-slate-50 border border-slate-200/70 space-y-1.5'>
                  <div className='flex items-center justify-between text-xs text-slate-500'>
                    <span className='font-medium'>Submitted On:</span>
                    <span>
                      {assignment.submitted_at
                        ? new Date(assignment.submitted_at).toLocaleString()
                        : 'Recently'}
                    </span>
                  </div>
                  {assignment.submission_link && (
                    <div className='flex items-center justify-between gap-2 text-xs'>
                      <span className='text-slate-500 truncate'>Link:</span>
                      <a
                        href={assignment.submission_link}
                        target='_blank'
                        rel='noopener noreferrer'
                        className='text-blue-600 font-medium hover:underline flex items-center gap-1 truncate max-w-[220px]'
                      >
                        <span className='truncate'>{assignment.submission_link}</span>
                        <ExternalLink className='w-3 h-3 shrink-0' />
                      </a>
                    </div>
                  )}
                  {assignment.submission_file_url && (
                    <div className='flex items-center justify-between gap-2 text-xs'>
                      <span className='text-slate-500 truncate'>File:</span>
                      <a
                        href={assignment.submission_file_url}
                        target='_blank'
                        rel='noopener noreferrer'
                        className='text-blue-600 font-medium hover:underline flex items-center gap-1 truncate max-w-[220px]'
                      >
                        <span className='truncate'>
                          {assignment.submission_file_name || 'Download File'}
                        </span>
                        <Download className='w-3 h-3 shrink-0' />
                      </a>
                    </div>
                  )}
                </div>
              )}

              <Button
                onClick={handleSubmit}
                disabled={
                  submitting ||
                  (activeType === 'file' && !selectedFile && !assignment.submission_file_url) ||
                  (activeType !== 'file' && !solutionUrl.trim()) ||
                  Boolean(urlValidationError)
                }
                className='w-full h-12 sm:h-14 rounded-xl sm:rounded-2xl font-semibold text-xs sm:text-sm flex items-center justify-center gap-2 transition-all disabled:opacity-50 bg-[#333D7C] hover:bg-[#2a3268] text-white min-h-[44px]'
              >
                {submitting ? (
                  <Loader2 className='w-4 h-4 sm:w-5 sm:h-5 animate-spin' />
                ) : (
                  <>
                    {isSubmitted ? 'Resubmit Assignment' : 'Submit Assignment'}
                    <ArrowRight className='w-4 h-4' />
                  </>
                )}
              </Button>

              {isSubmitted && (
                <div className='p-4 bg-emerald-50/80 rounded-xl sm:rounded-2xl border border-emerald-100 space-y-2 overflow-hidden min-w-0 max-w-full'>
                  <div className='flex items-center gap-2 text-emerald-700 font-bold text-xs uppercase tracking-wider'>
                    <CheckCircle2 className='w-4 h-4 text-emerald-600 shrink-0' />
                    <span>Submission Received</span>
                  </div>
                  {assignment?.submission_link && (
                    <a
                      href={assignment.submission_link}
                      target='_blank'
                      rel='noopener noreferrer'
                      title={assignment.submission_link}
                      className='flex items-center gap-1.5 text-xs text-blue-600 hover:text-blue-800 font-medium hover:underline w-full max-w-full min-w-0'
                    >
                      <ExternalLink className='w-3.5 h-3.5 shrink-0 text-blue-600' />
                      <span className='truncate block min-w-0 flex-1'>{assignment.submission_link}</span>
                    </a>
                  )}
                  {assignment?.submission_file_url && !assignment?.submission_link && (
                    <a
                      href={assignment.submission_file_url}
                      target='_blank'
                      rel='noopener noreferrer'
                      title={assignment.submission_file_name || 'Uploaded File'}
                      className='flex items-center gap-1.5 text-xs text-blue-600 hover:text-blue-800 font-medium hover:underline w-full max-w-full min-w-0'
                    >
                      <FileText className='w-3.5 h-3.5 shrink-0 text-blue-600' />
                      <span className='truncate block min-w-0 flex-1'>{assignment.submission_file_name || 'View Uploaded File'}</span>
                    </a>
                  )}
                </div>
              )}
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
