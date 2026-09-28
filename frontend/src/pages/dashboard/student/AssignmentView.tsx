import { useEffect, useMemo, useState } from 'react';
import { useParams, useNavigate } from 'react-router';
import {
  Loader2,
  XCircle,
  ClipboardList,
  CheckCircle2,
  Link2,
  ArrowRight,
  PartyPopper,
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import apiClient from '@/services/api';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import toast from 'react-hot-toast';
import { getErrorMessage } from '@/lib/utils';
import { fireConfetti } from '@/lib/confetti';
import { notifyCourseProgressUpdated } from '@/utils/progressEvents';

/* =======================
   Course-wide "next item" navigation
   (mirrors the flattening logic in Lesson.tsx, scoped to this page since
   AssignmentView is a separate route/component from the lesson view)
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
  unit_title?: string;
  subject_title?: string;
  submission_link?: string | null;
  submitted_at?: string | null;
}

export default function AssignmentView() {
  const { assignmentId, slug } = useParams();
  const navigate = useNavigate();
  const [assignment, setAssignment] = useState<AssignmentDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [courseStructure, setCourseStructure] = useState<any[]>([]);

  const [link, setLink] = useState('');
  const [submitting, setSubmitting] = useState(false);

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
    if (!courseStructure.length || !assignmentId) return undefined;
    const flat = flattenCourseStructure(courseStructure);
    const currentIndex = flat.findIndex(
      (item) => item.type === 'assignment' && item.id === assignmentId,
    );
    if (currentIndex === -1) return undefined;
    // undefined = not found yet, null = found and is the last item in the course
    return flat[currentIndex + 1] ?? null;
  }, [courseStructure, assignmentId]);

  const goToNext = () => {
    if (!slug) return;
    if (nextItem) {
      navigate(buildItemUrl(slug, nextItem));
    } else {
      // Last item in the whole course — celebrate and land on the overview,
      // which shows the "Course Completed" state.
      fireConfetti();
      toast.success('🎉 Course completed! Great work!');
      setTimeout(() => navigate(`/dashboard/student/courses/${slug}`), 800);
    }
  };

  useEffect(() => {
    if (!assignmentId) return;

    const fetchAssignment = async () => {
      try {
        setLoading(true);
        setError(false);
        const res = await apiClient.get<{
          success: boolean;
          data: AssignmentDetail;
        }>(`/students/assignments/${assignmentId}`);
        const data = res.data.data;
        setAssignment(data);
        if (data.submission_link) setLink(data.submission_link);
      } catch {
        setError(true);
      } finally {
        setLoading(false);
      }
    };

    fetchAssignment();
  }, [assignmentId]);

  const handleSubmit = async () => {
    if (!link.trim()) {
      toast.error('Please enter a submission link');
      return;
    }
    try {
      new URL(link.trim());
    } catch {
      toast.error('Please enter a valid URL');
      return;
    }

    try {
      setSubmitting(true);
      const res = await apiClient.post<{
        success: boolean;
        data: { submission_link: string; submitted_at: string };
      }>(`/students/assignments/${assignmentId}/submit`, {
        submission_link: link.trim(),
      });
      setAssignment((prev) => (prev ? { ...prev, ...res.data.data } : prev));
      toast.success('Assignment submitted successfully!');
      notifyCourseProgressUpdated();
    } catch (error) {
      toast.error(getErrorMessage(error, 'Failed to submit assignment'));
    } finally {
      setSubmitting(false);
      setLink('');
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
        <p className='text-lg font-semibold text-slate-700'>
          Failed to load assignment
        </p>
        <p className='text-sm text-slate-500'>
          Please try refreshing the page.
        </p>
      </div>
    );
  }

  const isSubmitted = Boolean(assignment.submission_link);

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
          <Badge className='bg-[#333D7C]/10 text-[#333D7C] border-none text-xs'>
            Assignment
          </Badge>
          <Badge className='bg-slate-100 text-slate-600 border-none text-xs'>
            Max: {assignment.max_score} pts
          </Badge>
          {assignment.unit_title && (
            <Badge className='bg-slate-100 text-slate-500 border-none text-xs'>
              {assignment.unit_title}
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
          <p className='text-xs font-semibold uppercase tracking-widest text-slate-400'>
            Instructions
          </p>
          <p className='text-xs sm:text-sm text-slate-500 mt-0.5'>
            Read carefully before submitting
          </p>
        </div>
        <div className='px-4 py-5 sm:px-8 sm:py-6'>
          {assignment.instructions ? (
            <div className='prose prose-slate max-w-full overflow-x-auto text-sm sm:text-base lg:prose-lg'>
              {/^<[a-z][\s\S]*>/i.test(assignment.instructions.trimStart()) ? (
                <div
                  dangerouslySetInnerHTML={{ __html: assignment.instructions }}
                />
              ) : (
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                  {assignment.instructions}
                </ReactMarkdown>
              )}
            </div>
          ) : (
            <p className='italic text-slate-400 text-sm'>No instructions provided.</p>
          )}
        </div>
      </Card>

      {/* Submission */}
      <Card className='overflow-hidden rounded-2xl sm:rounded-[2rem] border border-slate-100 shadow-sm p-0'>
        <div className='px-4 sm:px-8 pt-5 sm:pt-6'>
          <p className='text-xs font-semibold uppercase tracking-widest text-slate-400'>
            Your Submission
          </p>
          <p className='text-xs sm:text-sm text-slate-500 mt-0.5'>
            {isSubmitted
              ? 'Already submitted — you can update your link below'
              : 'Paste the link to your solution (GitHub, Google Drive, etc.)'}
          </p>
        </div>
        <div className='px-4 py-5 sm:px-8 sm:py-6 space-y-4'>
          {isSubmitted && (
            <div className='flex items-center gap-2 p-3 bg-emerald-50 rounded-xl text-xs sm:text-sm'>
              <CheckCircle2 className='h-4 w-4 text-emerald-600 shrink-0' />
              <span className='text-emerald-700 font-medium'>
                Submitted on{' '}
                {new Date(assignment.submitted_at!).toLocaleDateString(
                  'en-US',
                  {
                    year: 'numeric',
                    month: 'short',
                    day: 'numeric',
                  },
                )}
              </span>
            </div>
          )}

          <div className='flex flex-col sm:flex-row gap-3'>
            <div className='relative flex-1'>
              <Link2 className='absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400' />
              <Input
                type='url'
                disabled={isSubmitted}
                placeholder='https://github.com/your-repo'
                value={link}
                onChange={(e) => setLink(e.target.value)}
                className='pl-9 h-11 text-sm'
              />
            </div>
            <Button
              onClick={handleSubmit}
              loading={submitting}
              disabled={isSubmitted}
              className='bg-[#333D7C] hover:bg-[#2a3268] shrink-0 h-11 px-6 font-semibold w-full sm:w-auto'
            >
              Submit
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
