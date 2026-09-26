import { useEffect, useState, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router';
import {
  ChevronLeft,
  Calendar,
  Download,
  FileText,
  Link2,
  Loader2,
  ArrowRight,
  Code2,
  ExternalLink,
  CheckCircle2,
  Lock,
} from 'lucide-react';
import apiClient from '@/services/api';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import toast from 'react-hot-toast';
import { getErrorMessage } from '@/lib/utils';
import type { CollegeAssignment } from '@/utils/types';

export default function CollegeAssignmentView() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [assignment, setAssignment] = useState<CollegeAssignment | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const [solution, setSolution] = useState('');

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

      if (data.submission_link) {
        setSolution(data.submission_link);
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

  const handleSubmit = async () => {
    const cleanLink = solution.trim();
    if (!cleanLink) {
      toast.error('Please enter your GitHub repository link');
      return;
    }

    const lower = cleanLink.toLowerCase();
    if (lower.includes('drive.google.com') || lower.includes('docs.google.com')) {
      toast.error('Google Drive links are not accepted. Please provide a public GitHub repository link (https://github.com/username/project).');
      return;
    }

    if (!lower.includes('github.com')) {
      toast.error('Only public GitHub repository links (https://github.com/...) are accepted for automated evaluation.');
      return;
    }

    try {
      new URL(cleanLink);
    } catch {
      toast.error('Please enter a valid URL (e.g. https://github.com/username/project)');
      return;
    }

    try {
      setSubmitting(true);
      const formData = new FormData();
      formData.append('submission_link', cleanLink);

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

  const isSubmitted = Boolean(
    assignment.submission_link || assignment.submission_file_url,
  );

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
                className={`px-3 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                  isSubmitted
                    ? 'bg-emerald-50 text-emerald-700'
                    : 'bg-orange-50 text-orange-600'
                }`}
              >
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
          <div className='lg:col-span-5 space-y-6'>
            <Card className='border border-slate-100 rounded-2xl sm:rounded-[2rem] p-5 sm:p-8 md:p-10 shadow-sm space-y-6 sm:space-y-8'>
              <div className='space-y-1.5'>
                <h2 className='text-lg sm:text-xl font-bold text-[#1e293b]'>
                  Submit Assignment
                </h2>
                <p className='text-xs sm:text-sm text-slate-500'>
                  Submit your public GitHub repository URL for automated evaluation.
                </p>
              </div>

              {/* GitHub Link Input */}
              <div className='space-y-3 sm:space-y-4'>
                <div className='relative'>
                  <Link2 className='absolute left-4 top-4 w-4 h-4 sm:w-5 sm:h-5 text-[#333D7C]' />
                  <textarea
                    value={solution}
                    onChange={(e) => setSolution(e.target.value)}
                    placeholder='https://github.com/username/repository'
                    className='w-full rounded-2xl border-2 border-slate-100 px-10 sm:px-12 py-3.5 sm:py-4 text-xs sm:text-sm focus:border-[#333D7C] outline-none transition-all placeholder:text-slate-300 min-h-24 sm:min-h-28 resize-none'
                  />
                </div>
                <div className='p-3.5 bg-blue-50/70 rounded-xl sm:rounded-2xl border border-blue-100 flex items-start gap-2.5 text-slate-600 text-xs leading-relaxed'>
                  <Code2 className='w-4 h-4 text-blue-600 shrink-0 mt-0.5' />
                  <span>
                    Make sure your GitHub repository is <strong>public</strong> and contains your project files. File uploads or Google Drive links are not supported for automated evaluation.
                  </span>
                </div>
              </div>

              <Button
                onClick={handleSubmit}
                disabled={submitting || !solution.trim()}
                className='w-full h-12 sm:h-14 rounded-xl sm:rounded-2xl font-semibold text-xs sm:text-sm flex items-center justify-center gap-2 transition-all disabled:opacity-50 bg-[#333D7C] hover:bg-[#2a3268] text-white min-h-[44px]'
              >
                {submitting ? (
                  <Loader2 className='w-4 h-4 sm:w-5 sm:h-5 animate-spin' />
                ) : (
                  <>
                    Submit Assignment
                    <ArrowRight className='w-4 h-4' />
                  </>
                )}
              </Button>

              {isSubmitted && (
                <div className='p-4 bg-emerald-50/80 rounded-xl sm:rounded-2xl border border-emerald-100 space-y-2'>
                  <div className='flex items-center gap-2 text-emerald-700 font-bold text-xs uppercase tracking-wider'>
                    <CheckCircle2 className='w-4 h-4 text-emerald-600' />
                    <span>Submission Received</span>
                  </div>
                  {assignment?.submission_link && (
                    <a
                      href={assignment.submission_link}
                      target='_blank'
                      rel='noopener noreferrer'
                      className='inline-flex items-center gap-1.5 text-xs text-blue-600 hover:text-blue-800 font-medium break-all hover:underline'
                    >
                      <ExternalLink className='w-3.5 h-3.5 shrink-0' />
                      <span className='truncate'>{assignment.submission_link}</span>
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
