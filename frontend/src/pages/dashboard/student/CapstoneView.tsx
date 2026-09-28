import { useEffect, useMemo, useState } from 'react';
import { useParams, useNavigate } from 'react-router';
import {
  Loader2,
  XCircle,
  Trophy,
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
   (mirrors the flattening logic in Lesson.tsx/AssignmentView.tsx, scoped
   here since CapstoneView is a separate route/component)
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
  submission_link?: string | null;
  submitted_at?: string | null;
  is_approved?: boolean | null;
}

export default function CapstoneView() {
  const { projectId, slug } = useParams();
  const navigate = useNavigate();
  const [capstone, setCapstone] = useState<CapstoneDetail | null>(null);
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
      fireConfetti();
      toast.success('🎉 Course completed! Great work!');
      setTimeout(() => navigate(`/dashboard/student/courses/${slug}`), 800);
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
        if (data.submission_link) setLink(data.submission_link);
      } catch {
        setError(true);
      } finally {
        setLoading(false);
      }
    };

    fetchCapstone();
  }, [projectId]);

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
      }>(`/students/capstone/${projectId}/submit`, {
        submission_link: link.trim(),
      });
      setCapstone((prev) => (prev ? { ...prev, ...res.data.data } : prev));
      toast.success('Capstone submitted! +20 XP');
      notifyCourseProgressUpdated();
    } catch (error) {
      toast.error(getErrorMessage(error, 'Failed to submit capstone'));
    } finally {
      setSubmitting(false);
      setLink('');
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
      <div className='flex h-[60vh] flex-col items-center justify-center gap-3 p-10 text-center'>
        <XCircle className='h-12 w-12 text-red-400' />
        <p className='text-lg font-semibold text-slate-700'>
          Failed to load capstone project
        </p>
        <p className='text-sm text-slate-500'>
          Please try refreshing the page.
        </p>
      </div>
    );
  }

  const isSubmitted = Boolean(capstone.submission_link);

  return (
    <div className='mx-auto max-w-4xl space-y-6 sm:space-y-8 p-4 sm:p-6 md:p-10'>
      {/* Header */}
      <header className='space-y-3'>
        <div className='flex items-start gap-3'>
          <Trophy className='h-6 w-6 sm:h-7 sm:w-7 text-amber-500 shrink-0 mt-1' />
          <h1 className='text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-900'>
            {capstone.title}
          </h1>
        </div>
        <div className='flex flex-wrap gap-1.5 sm:gap-2'>
          <Badge className='bg-amber-50 text-amber-700 border border-amber-200 text-xs'>
            Capstone Project
          </Badge>
          <Badge className='bg-slate-100 text-slate-600 border border-slate-200 text-xs'>
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

      {/* Submission */}
      <Card className='overflow-hidden rounded-2xl sm:rounded-3xl border border-slate-200 shadow-sm'>
        <div className='bg-slate-50 px-4 sm:px-6 py-3.5 sm:py-4'>
          <p className='text-xs font-semibold uppercase tracking-widest text-slate-400'>
            Your Submission
          </p>
          <p className='text-xs sm:text-sm text-slate-600 mt-0.5'>
            {isSubmitted
              ? 'Already submitted — submit again to update your link'
              : 'Paste the link to your completed project'}
          </p>
        </div>
        <div className='bg-white px-4 py-6 sm:px-6 sm:py-8 space-y-4'>
          {isSubmitted && (
            <div className='flex items-center gap-2 p-3 bg-emerald-50 rounded-xl border border-emerald-100 text-xs sm:text-sm'>
              <CheckCircle2 className='h-4 w-4 text-emerald-600 shrink-0' />
              <span className='text-emerald-700 font-medium'>
                Submitted on{' '}
                {new Date(capstone.submitted_at!).toLocaleDateString('en-US', {
                  year: 'numeric',
                  month: 'short',
                  day: 'numeric',
                })}
              </span>
            </div>
          )}

          <div className='flex flex-col sm:flex-row gap-3'>
            <div className='relative flex-1'>
              <Link2 className='absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400' />
              <Input
                type='url'
                placeholder='https://github.com/your-capstone-project'
                value={link}
                onChange={(e) => setLink(e.target.value)}
                className='pl-9 h-11 text-sm'
              />
            </div>
            <Button
              onClick={handleSubmit}
              loading={submitting}
              className='bg-amber-500 hover:bg-amber-600 shrink-0 h-11 px-6 font-semibold w-full sm:w-auto min-h-[44px]'
            >
              {isSubmitted ? 'Update' : 'Submit'}
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
