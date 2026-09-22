import { useEffect, useMemo, useState } from 'react';
import { useParams, useNavigate } from 'react-router';
import { CheckCircle2, XCircle, Award, TrendingUp, Lock } from 'lucide-react';
import EmbeddedIDE from '@/components/common/EmbeddedIDE';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import toast from 'react-hot-toast';
import { getErrorMessage } from '@/lib/utils';
import { fireConfetti, fireCelebrationBoom } from '@/lib/confetti';
import { notifyCourseProgressUpdated } from '@/utils/progressEvents';

import LessonAssistant from '@/components/common/LessonAssistant';
import { useAppDispatch, useAppSelector } from '@/app/hooks';
import {
  fetchLesson,
  submitQuiz,
  submitExercise,
  completeLesson,
  fetchExercise,
  fetchQuiz,
  setQuizAnswer,
  resetQuiz,
  resetLessonState,
} from '@/features/lesson/lessonSlice';
import type { Quiz, Topic, SubjectDetailResponse } from '@/utils/types';
import apiClient from '@/services/api';
import { Skeleton } from '@/components/ui/skeleton';
import { getYouTubeEmbedUrl } from '@/utils/youtube';

/* =======================
   Types
======================= */

type FlattenedItem = {
  type: 'subtopic' | 'assignment' | 'quiz';
  id: string;
  quiz_id?: string;
  slug?: string;
  title?: string;
};

/* =======================
   Component
======================= */

const Lesson = () => {
  const { subtopicSlug, exerciseId, quizId, slug } = useParams<{
    subtopicSlug?: string;
    exerciseId?: string;
    quizId?: string;
    slug?: string;
  }>();
  const navigate = useNavigate();
  const dispatch = useAppDispatch();

  const [courseStructure, setCourseStructure] = useState<Topic[]>([]);
  const {
    data,
    status,
    quizAnswers,
    quizSubmitted,
    quizResults,
    submittingQuiz,
    submittingExercise,
    passedExercises,
    lessonCompleted,
  } = useAppSelector((state) => state.lesson);

  const [isNavigating, setIsNavigating] = useState(false);
  const [isCompleting, setIsCompleting] = useState(false);
  const [retakingQuizIds, setRetakingQuizIds] = useState<Set<string>>(
    new Set(),
  );

  const loading = status === 'loading';

  useEffect(() => {
    if (subtopicSlug) {
      dispatch(fetchLesson(subtopicSlug));
    } else if (exerciseId) {
      dispatch(fetchExercise(exerciseId));
    } else if (quizId) {
      dispatch(fetchQuiz(quizId));
    }
    return () => {
      dispatch(resetLessonState());
    };
  }, [subtopicSlug, exerciseId, quizId, dispatch]);

  useEffect(() => {
    const fetchStructure = async () => {
      if (!slug) return;
      try {
        const response = await apiClient.get<SubjectDetailResponse>(
          `/subjects/${slug}`,
        );
        setCourseStructure(response.data?.data || []);
      } catch {
        // Non-critical — course structure drives prev/next navigation only.
        // If it fails the lesson still loads normally.
      }
    };

    fetchStructure();
  }, [slug]);

  const getEmbedUrl = (url?: string | null) => {
    if (!url) return '';
    return getYouTubeEmbedUrl(url) || url;
  };

  /* =======================
     Data Processing
  ======================= */

  const buildNextUrl = (
    item: {
      type: 'subtopic' | 'quiz' | 'assignment';
      slug?: string;
      id?: string;
    } | null,
    courseSlug: string | undefined,
  ): string => {
    if (!item || !courseSlug)
      return `/dashboard/student/courses/${courseSlug ?? ''}`;
    if (item.type === 'subtopic')
      return `/dashboard/student/courses/${courseSlug}/lesson/${item.slug}`;
    if (item.type === 'assignment')
      return `/dashboard/student/courses/${courseSlug}/assignment/${item.id}`;
    return `/dashboard/student/courses/${courseSlug}/quiz/${item.id}`;
  };

  const nextLabel = (type: string) => {
    if (type === 'subtopic') return 'Lesson';
    if (type === 'assignment') return 'Assignment';
    return 'Quiz';
  };

  const { lessonIndex, totalLessons, nextItem, isCourseComplete } = useMemo<{
    lessonIndex: number | null;
    totalLessons: number | null;
    nextItem: {
      type: 'subtopic' | 'quiz' | 'assignment';
      slug?: string;
      id?: string;
    } | null;
    // True only when the current item was actually found in the flattened
    // course sequence AND has nothing after it — distinct from "not found"
    // (e.g. on an exercise page, which isn't in this sequence at all), so
    // we don't mistake "unknown position" for "course finished".
    isCourseComplete: boolean;
  }>(() => {
    const flattened: FlattenedItem[] = [];
    courseStructure.forEach((topic) => {
      (topic.units || []).forEach((unit) => {
        (unit.subtopics || []).forEach((sub) => {
          flattened.push({ ...sub, type: 'subtopic' });
        });
        (unit.quizzes || []).forEach((quiz) => {
          flattened.push({
            ...quiz,
            type: 'quiz',
            title: `Unit Quiz: ${unit.title}`,
          });
        });
        (unit.assignments || []).forEach((assignment) => {
          flattened.push({ ...assignment, type: 'assignment' });
        });
      });
    });

    const total = flattened.length;

    const currentIndex = flattened.findIndex((item) => {
      if (subtopicSlug && item.type === 'subtopic')
        return item.slug === subtopicSlug;
      if (quizId && item.type === 'quiz')
        return (item.id || item.quiz_id) === quizId;
      return false;
    });

    const next = currentIndex >= 0 ? flattened[currentIndex + 1] : null;

    return {
      lessonIndex: currentIndex >= 0 ? currentIndex + 1 : null,
      totalLessons: total || null,
      nextItem: next
        ? {
            type: next.type,
            slug: next.slug,
            id: next.id || next.quiz_id,
          }
        : null,
      isCourseComplete: currentIndex >= 0 && currentIndex === total - 1,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [courseStructure, subtopicSlug, exerciseId, quizId]);

  /* =======================
     Exercise Completion Gating
  ======================= */
  const lessonExercises = data?.exercises;
  const hasExercises = Boolean(lessonExercises && lessonExercises.length > 0);
  const allExercisesPassed = useMemo(() => {
    if (!hasExercises || !lessonExercises) return true;
    return lessonExercises.every(
      (ex) => ex.is_completed || passedExercises?.[ex.id],
    );
  }, [hasExercises, lessonExercises, passedExercises]);

  const canMarkComplete = !hasExercises || allExercisesPassed;

  /* =======================
     Lesson Completion
  ======================= */

  const handleCompleteLesson = async () => {
    const lessonId = data?.lesson?.id;
    if (!lessonId) {
      toast.error('No lesson content to complete.');
      return;
    }
    setIsCompleting(true);
    try {
      await dispatch(completeLesson(lessonId)).unwrap();
      toast.success('Lesson completed! +10 points 🎉');
      notifyCourseProgressUpdated();
      setIsNavigating(true);
    } catch (error) {
      toast.error(getErrorMessage(error, 'Failed to mark lesson complete'));
    } finally {
      setIsCompleting(false);
    }
  };

  useEffect(() => {
    if (!lessonCompleted || !isNavigating || !slug) return;
    // Unchanged from before: only navigate if there's a concrete next item,
    // or this was confirmed to be the actual last item in the course
    // (isCourseComplete) — an exercise page (not part of this sequence at
    // all) still does nothing, exactly as before.
    if (!nextItem && !isCourseComplete) return;

    const nextUrl = isCourseComplete
      ? `/dashboard/student/courses/${slug}`
      : buildNextUrl(nextItem, slug);

    const timer = setTimeout(() => {
      if (isCourseComplete) {
        fireConfetti();
        toast.success('🎉 Course completed! Great work!');
      }
      navigate(nextUrl);
      setIsNavigating(false);
    }, 1000);
    return () => clearTimeout(timer);
  }, [lessonCompleted, isNavigating, nextItem, isCourseComplete, slug, navigate]);

  /* =======================
     Quiz Submission
  ======================= */

  const handleQuizAnswerChange = (questionId: string, value: string) => {
    dispatch(setQuizAnswer({ questionId, value }));
  };

  const handleSubmitQuiz = async (quiz: Quiz) => {
    if (submittingQuiz) return; // prevent double-submit
    const unanswered = quiz.questions.filter((q) => !quizAnswers[q.id]);
    if (unanswered.length > 0) {
      toast.error(
        `Please answer all questions. ${unanswered.length} remaining.`,
      );
      return;
    }

    try {
      const result = await dispatch(
        submitQuiz({ quizId: quiz.id, answers: quizAnswers }),
      ).unwrap();
      notifyCourseProgressUpdated();
      if (result.attempt.is_passed) {
        toast.success(`Quiz passed! 🎉`);
      } else {
        toast.error(`Not quite — review the explanations and try again.`);
      }
    } catch (error) {
      toast.error(getErrorMessage(error, 'Failed to submit quiz'));
    }
  };

  const handleRetakeQuiz = () => {
    if (
      !window.confirm('Retake the quiz? Your current answers will be cleared.')
    )
      return;
    dispatch(resetQuiz());
  };

  const handleStartRetake = (quizId: string) => {
    setRetakingQuizIds((prev) => new Set(prev).add(quizId));
  };

  /* =======================
     Exercise Submission
  ======================= */

  const handleSubmitExercise = async (exerciseId: string, files?: any[], taskId?: string) => {
    if (submittingExercise[exerciseId]) return; // prevent double-submit
    try {
      const result = await dispatch(submitExercise({ exerciseId, files, taskId })).unwrap();
      fireCelebrationBoom(160);
      const hasRubric = Array.isArray(result?.testResults?.rubric_breakdown) && result.testResults.rubric_breakdown.length > 0;
      if (hasRubric) {
        toast.success('🎉 Exercise passed with flying colors! Great work!');
      } else {
        toast.success('Successfully submitted ✅');
      }
      notifyCourseProgressUpdated();
      return result;
    } catch (error) {
      toast.error(getErrorMessage(error, 'Failed to submit exercise'));
      throw error;
    }
  };

  /* =======================
     Rendering
  ======================= */

  if (loading) {
    return (
      <div className='mx-auto max-w-4xl space-y-8 p-6 md:p-10'>
        <div className='space-y-3'>
          <Skeleton className='h-10 w-2/3' />
          <Skeleton className='h-4 w-1/3' />
        </div>
        <Skeleton className='h-64 w-full rounded-3xl' />
        <div className='space-y-3'>
          <Skeleton className='h-4 w-full' />
          <Skeleton className='h-4 w-5/6' />
          <Skeleton className='h-4 w-4/6' />
        </div>
        <Skeleton className='h-12 w-48 rounded-xl' />
      </div>
    );
  }

  if (status === 'failed') {
    return (
      <div className='flex h-[60vh] flex-col items-center justify-center gap-3 p-10 text-center'>
        <XCircle className='h-12 w-12 text-red-400' />
        <p className='text-lg font-semibold text-slate-700'>
          Failed to load content
        </p>
        <p className='text-sm text-slate-500'>
          Please try refreshing the page.
        </p>
      </div>
    );
  }

  if (!data) {
    return (
      <div className='p-10 text-center text-slate-500'>
        Lesson not found or locked
      </div>
    );
  }

  const { subtopic, lesson, quizzes } = data;
  const exercises = lessonExercises || [];
  const hasMarkdown = Boolean(lesson.markdown_content);

  return (
    <div className={`mx-auto space-y-6 sm:space-y-10 p-3 sm:p-6 md:p-10 transition-all duration-300 ${
      exercises && exercises.length > 0 ? 'w-full max-w-7xl' : 'max-w-4xl'
    }`}>
      {/* Header */}
      <header className='space-y-3 sm:space-y-4'>
        <div className='flex flex-wrap items-center gap-2 sm:gap-3'>
          <h1 className='text-2xl sm:text-3xl md:text-4xl font-extrabold tracking-tight text-slate-900 break-words'>
            {subtopic.title}
          </h1>
          {lessonCompleted && (
            <Badge className='bg-emerald-50 text-emerald-700 border border-emerald-200'>
              Completed
            </Badge>
          )}
        </div>

        {subtopic.description && (
          <p className='text-sm sm:text-base text-slate-600'>{subtopic.description}</p>
        )}

        <div className='flex flex-wrap items-center gap-1.5 sm:gap-2 text-[11px] sm:text-xs font-semibold uppercase tracking-wider text-slate-400'>
          {lessonIndex && totalLessons && (
            <Badge className='bg-blue-50 text-blue-700 border border-blue-200 text-[11px]'>
              Lesson {lessonIndex} of {totalLessons}
            </Badge>
          )}
          <Badge className='bg-slate-100 text-slate-600 border border-slate-200 text-[11px]'>
            {lesson.content_type || 'Lesson'}
          </Badge>
          {lesson.read_time && (
            <span className='text-slate-500 normal-case font-medium'>
              {lesson.read_time} min read
            </span>
          )}
          {lesson.video_url && (
            <span className='text-slate-500 normal-case font-medium'>
              Video included
            </span>
          )}
        </div>
      </header>

      {/* Lesson Content — hidden on pure quiz pages */}
      {lesson.content_type !== 'quiz' && (
        <Card className='overflow-hidden rounded-2xl sm:rounded-3xl border border-slate-200 shadow-sm'>
          <div className='flex flex-wrap items-center justify-between gap-2 bg-slate-50 px-4 sm:px-6 py-3 sm:py-4'>
            <div>
              <p className='text-[10px] sm:text-xs font-semibold uppercase tracking-widest text-slate-400'>
                Lesson Content
              </p>
              <p className='text-xs sm:text-sm text-slate-600'>
                Follow the material, then complete to unlock the next lesson
              </p>
            </div>
          </div>

          <div className='bg-white px-4 py-6 sm:px-6 sm:py-8'>
            {lesson.video_url && !lesson.video_url.includes('results?') && (
              <div className='not-prose mb-6'>
                <div className='aspect-video w-full overflow-hidden rounded-xl sm:rounded-2xl border border-slate-200 bg-black'>
                  <iframe
                    className='h-full w-full'
                    src={getEmbedUrl(lesson.video_url)}
                    title='Lesson video'
                    allow='accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share'
                    referrerPolicy='strict-origin-when-cross-origin'
                    allowFullScreen
                  />
                </div>
              </div>
            )}

            <div className='prose prose-slate max-w-full overflow-x-auto text-sm sm:text-base lg:prose-lg'>
              {hasMarkdown ? (
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                  {lesson.markdown_content}
                </ReactMarkdown>
              ) : !lesson.video_url ? (
                <p className='italic text-slate-400'>
                  Lesson content is empty.
                </p>
              ) : null}
            </div>
          </div>
        </Card>
      )}

      {/* Quizzes */}
      {quizId && quizzes && quizzes.length > 0 && (
        <section className='space-y-6'>
          <div className='flex items-center gap-2'>
            <Award className='h-6 w-6 text-indigo-600' />
            <h2 className='text-2xl font-bold text-slate-900'>Quiz</h2>
          </div>

          {quizzes.map((quiz) => {
            const effectiveMax = quiz.questions.reduce(
              (sum, q) => sum + q.points,
              0,
            );
            const passingRatio =
              quiz.max_score > 0
                ? Math.min(1, quiz.passing_score / quiz.max_score)
                : 0.7;
            const displayPassingScore = Math.ceil(effectiveMax * passingRatio);
            const answeredCount = quiz.questions.filter(
              (q) => quizAnswers[q.id],
            ).length;
            const isPassed =
              quizSubmitted &&
              quizResults &&
              (quizResults.attempt.is_passed ??
                quizResults.attempt.score >=
                  (quizResults.effective_passing_score ?? quiz.passing_score));
            const showPreviousAttempt =
              !!quiz.last_attempt &&
              !quizSubmitted &&
              !retakingQuizIds.has(quiz.id);

            return (
              <Card key={quiz.id} className='p-6'>
                {/* Quiz Header */}
                <div className='mb-6 flex items-start justify-between gap-4'>
                  <div>
                    <p className='text-lg font-bold text-slate-800'>
                      {quiz.title || 'Unit Quiz'}
                    </p>
                    <p className='text-xs text-slate-500 mt-0.5'>
                      {quiz.questions.length} questions &bull; Pass at{' '}
                      {displayPassingScore}/{effectiveMax} pts
                    </p>
                  </div>
                  {!quizSubmitted && !showPreviousAttempt && (
                    <span className='shrink-0 rounded-full bg-indigo-50 px-3 py-1 text-sm font-semibold text-indigo-600'>
                      {answeredCount}/{quiz.questions.length} answered
                    </span>
                  )}
                </div>

                {/* Previously Attempted */}
                {showPreviousAttempt && quiz.last_attempt && (
                  <div
                    className={`rounded-2xl border p-6 text-center ${
                      quiz.last_attempt.is_passed
                        ? 'bg-emerald-50 border-emerald-200'
                        : 'bg-orange-50 border-orange-200'
                    }`}
                  >
                    {quiz.last_attempt.is_passed ? (
                      <CheckCircle2 className='mx-auto mb-3 h-10 w-10 text-emerald-600' />
                    ) : (
                      <XCircle className='mx-auto mb-3 h-10 w-10 text-orange-500' />
                    )}
                    <p
                      className={`text-lg font-bold ${
                        quiz.last_attempt.is_passed
                          ? 'text-emerald-800'
                          : 'text-orange-800'
                      }`}
                    >
                      You've already attempted this quiz
                    </p>
                    <p className='mt-2 text-sm text-slate-600'>
                      Score: {quiz.last_attempt.score} pts &bull;{' '}
                      {quiz.last_attempt.is_passed ? 'Passed' : 'Not passed'}
                    </p>
                    <Button
                      variant='outline'
                      onClick={() => handleStartRetake(quiz.id)}
                      className='mt-6'
                    >
                      Retake Quiz
                    </Button>
                  </div>
                )}

                {/* Questions */}
                {!showPreviousAttempt && (
                  <>
                    <div className='space-y-6'>
                      {quiz.questions.map((question, idx) => (
                        <div key={question.id} className='space-y-3'>
                          <div className='flex items-start justify-between gap-2'>
                            <div className='flex items-start gap-1 flex-1 min-w-0 font-medium'>
                              <span className='shrink-0'>{idx + 1}.</span>
                              <div className='min-w-0 flex-1 prose prose-sm max-w-none prose-pre:overflow-x-auto prose-pre:max-w-full'>
                                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                                  {question.question_text}
                                </ReactMarkdown>
                              </div>
                            </div>
                            <span className='shrink-0 rounded bg-slate-100 px-2 py-0.5 text-xs font-bold text-slate-600'>
                              {question.points} pt{question.points !== 1 ? 's' : ''}
                            </span>
                          </div>

                          {/* Multiple Choice */}
                          {question.question_type === 'multiple_choice' && (
                            <div className='space-y-2'>
                              {question.options.map((option) => {
                                const isSelected =
                                  quizAnswers[question.id] === option.id;
                                const qResult =
                                  quizResults?.question_results?.[question.id];
                                // Only mark the student's own selection as
                                // right/wrong — the correct option is only
                                // ever revealed once the backend includes it
                                // (after enough attempts), never guessed here.
                                const isSelectedCorrect =
                                  quizSubmitted && isSelected && !!qResult?.is_correct;
                                const isSelectedWrong =
                                  quizSubmitted &&
                                  isSelected &&
                                  qResult != null &&
                                  !qResult.is_correct;
                                const isRevealedCorrect =
                                  quizSubmitted &&
                                  !isSelected &&
                                  !!qResult?.correct_option_id &&
                                  qResult.correct_option_id === option.id;
                                return (
                                  <label
                                    key={option.id}
                                    className={`flex items-start sm:items-center gap-2.5 sm:gap-3 rounded-xl border p-3 text-xs sm:text-sm transition-colors min-h-[44px] ${
                                      !quizSubmitted
                                        ? `cursor-pointer ${
                                            isSelected
                                              ? 'border-indigo-500 bg-indigo-50'
                                              : 'border-slate-200 hover:bg-slate-50'
                                          }`
                                        : `cursor-default ${
                                            isSelectedCorrect || isRevealedCorrect
                                              ? 'border-green-500 bg-green-50'
                                              : isSelectedWrong
                                                ? 'border-red-500 bg-red-50'
                                                : 'border-slate-200'
                                          }`
                                    }`}
                                  >
                                    <input
                                      type='radio'
                                      name={question.id}
                                      checked={isSelected}
                                      onChange={() =>
                                        !quizSubmitted &&
                                        handleQuizAnswerChange(
                                          question.id,
                                          option.id,
                                        )
                                      }
                                      disabled={quizSubmitted}
                                      className='text-indigo-600 mt-0.5 sm:mt-0 shrink-0'
                                    />
                                    <span className='flex-1 break-words'>
                                      {option.option_text}
                                    </span>
                                    {(isSelectedCorrect || isRevealedCorrect) && (
                                      <CheckCircle2 className='h-4 w-4 text-green-600 shrink-0' />
                                    )}
                                    {isSelectedWrong && (
                                      <XCircle className='h-4 w-4 text-red-600 shrink-0' />
                                    )}
                                  </label>
                                );
                              })}
                            </div>
                          )}

                          {/* True / False */}
                          {question.question_type === 'true_false' && (
                            <div className='grid grid-cols-2 gap-3 sm:gap-4'>
                              {['True', 'False'].map((value) => {
                                const isSelected =
                                  quizAnswers[question.id] === value;
                                const qResult =
                                  quizResults?.question_results?.[question.id];
                                const isSelectedCorrect =
                                  quizSubmitted && isSelected && !!qResult?.is_correct;
                                const isSelectedWrong =
                                  quizSubmitted &&
                                  isSelected &&
                                  qResult != null &&
                                  !qResult.is_correct;
                                const isRevealedCorrect =
                                  quizSubmitted &&
                                  !isSelected &&
                                  !!qResult?.correct_option_text &&
                                  qResult.correct_option_text === value;
                                return (
                                  <label
                                    key={value}
                                    className={`flex items-center justify-center gap-2 rounded-lg border px-4 py-3 text-sm font-semibold transition-colors min-h-[44px] ${
                                      !quizSubmitted
                                        ? `cursor-pointer ${
                                            isSelected
                                              ? 'border-indigo-500 bg-indigo-50 text-indigo-700'
                                              : 'border-slate-200 hover:bg-slate-50 text-slate-700'
                                          }`
                                        : `cursor-default ${
                                            isSelectedCorrect || isRevealedCorrect
                                              ? 'border-green-500 bg-green-50 text-green-800'
                                              : isSelectedWrong
                                                ? 'border-red-500 bg-red-50 text-red-800'
                                                : 'border-slate-200 text-slate-500'
                                          }`
                                    }`}
                                  >
                                    <input
                                      type='radio'
                                      name={question.id}
                                      checked={isSelected}
                                      onChange={() =>
                                        !quizSubmitted &&
                                        handleQuizAnswerChange(
                                          question.id,
                                          value,
                                        )
                                      }
                                      disabled={quizSubmitted}
                                      className='text-indigo-600'
                                    />
                                    <span>{value}</span>
                                    {(isSelectedCorrect || isRevealedCorrect) && (
                                      <CheckCircle2 className='h-4 w-4 text-green-600 ml-1' />
                                    )}
                                    {isSelectedWrong && (
                                      <XCircle className='h-4 w-4 text-red-600 ml-1' />
                                    )}
                                  </label>
                                );
                              })}
                            </div>
                          )}

                          {/* Short Answer */}
                          {question.question_type === 'short_answer' && (
                            <div>
                              <textarea
                                value={quizAnswers[question.id] || ''}
                                onChange={(e) =>
                                  !quizSubmitted &&
                                  handleQuizAnswerChange(
                                    question.id,
                                    e.target.value,
                                  )
                                }
                                disabled={quizSubmitted}
                                rows={3}
                                placeholder='Write your answer here...'
                                className='w-full rounded-lg border border-slate-200 p-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-200'
                              />
                              {quizSubmitted && (
                                <p className='mt-1 text-xs italic text-slate-400'>
                                  Short answers are reviewed manually.
                                </p>
                              )}
                            </div>
                          )}

                          {/* Explanation — only revealed once the student has attempted
                          this quiz 3+ times (server withholds it otherwise) */}
                          {quizSubmitted &&
                            quizResults?.question_results[question.id]
                              ?.explanation && (
                              <div className='rounded-lg bg-blue-50 border border-blue-200 p-3 text-sm'>
                                <p className='font-semibold text-blue-900 mb-1'>
                                  Explanation:
                                </p>
                                <div className='text-blue-800 prose prose-sm max-w-none prose-p:my-0'>
                                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                                    {
                                      quizResults.question_results[question.id]!
                                        .explanation as string
                                    }
                                  </ReactMarkdown>
                                </div>
                              </div>
                            )}
                        </div>
                      ))}
                    </div>

                    {/* Submit Button */}
                    {!quizSubmitted && (
                      <div className='mt-8 border-t border-slate-100 pt-6'>
                        <Button
                          onClick={() => handleSubmitQuiz(quiz)}
                          loading={submittingQuiz}
                          className='w-full h-12 bg-indigo-600 hover:bg-indigo-700 text-base font-semibold'
                        >
                          Submit Quiz
                        </Button>
                      </div>
                    )}
                  </>
                )}

                {/* Results Panel — only for a submission made this session */}
                {quizSubmitted && quizResults && (
                  <div
                    className={`mt-8 rounded-2xl border p-6 text-center ${
                      isPassed
                        ? 'bg-emerald-50 border-emerald-200'
                        : 'bg-orange-50 border-orange-200'
                    }`}
                  >
                    {isPassed ? (
                      <CheckCircle2 className='mx-auto mb-3 h-10 w-10 text-emerald-600' />
                    ) : (
                      <XCircle className='mx-auto mb-3 h-10 w-10 text-orange-500' />
                    )}
                    <p
                      className={`text-lg font-bold ${
                        isPassed ? 'text-emerald-800' : 'text-orange-800'
                      }`}
                    >
                      {isPassed ? 'Quiz Passed! 🎉' : 'Not quite — try again!'}
                    </p>
                    {(() => {
                      const results = quizResults.question_results ?? {};
                      const correctCount = Object.values(results).filter(
                        (r: any) => r.is_correct,
                      ).length;
                      const totalCount = quiz.questions.length;
                      return (
                        <>
                          <p className='mt-2 text-4xl font-extrabold text-slate-900'>
                            {correctCount}
                            <span className='text-xl font-semibold text-slate-400'>
                              /{totalCount} correct
                            </span>
                          </p>
                          <p className='mt-1 text-sm text-slate-500'>
                            {quizResults.attempt.score} pts
                            {' · '}Passing:{' '}
                            {quizResults.effective_passing_score ??
                              quiz.passing_score}{' '}
                            pts
                            {quizResults.points_awarded > 0 &&
                              ` • +${quizResults.points_awarded} XP earned`}
                          </p>
                        </>
                      );
                    })()}

                    <div className='mt-6 flex flex-col sm:flex-row gap-3'>
                      <Button
                        variant='outline'
                        onClick={handleRetakeQuiz}
                        className={`w-full sm:flex-1 min-h-[44px] ${
                          isPassed
                            ? 'border-emerald-300 text-emerald-700 hover:bg-emerald-100 hover:text-emerald-700'
                            : 'border-orange-300 text-orange-700 hover:bg-orange-100 hover:text-orange-700'
                        }`}
                      >
                        Retake Quiz
                      </Button>
                      {isPassed && slug && (
                        <Button
                          className='w-full sm:flex-1 bg-emerald-600 hover:bg-emerald-700 min-h-[44px]'
                          onClick={() => navigate(buildNextUrl(nextItem, slug))}
                        >
                          {nextItem ? 'Continue →' : 'Back to Course'}
                        </Button>
                      )}
                    </div>
                  </div>
                )}
              </Card>
            );
          })}
        </section>
      )}

      {/* Exercises */}
      {exercises && exercises.length > 0 && (
        <section className='space-y-6'>
          <div className='flex items-center gap-2'>
            <TrendingUp className='h-6 w-6 text-indigo-600' />
            <h2 className='text-2xl font-bold text-slate-900'>Exercises</h2>
          </div>

          {exercises.length === 1 ? (
            <EmbeddedIDE
              exercise={exercises[0]}
              submitting={!!submittingExercise[exercises[0].id]}
              onSubmit={handleSubmitExercise}
            />
          ) : (
            <Tabs defaultValue={exercises[0].id} className='w-full'>
              <div className='overflow-x-auto pb-2 -mb-2 no-scrollbar'>
                <TabsList className='inline-flex w-auto max-w-full mb-4 shrink-0'>
                  {exercises.map((ex) => (
                    <TabsTrigger
                      key={ex.id}
                      value={ex.id}
                      className='max-w-40 sm:max-w-56 truncate text-xs sm:text-sm min-h-[36px]'
                    >
                      {ex.title}
                    </TabsTrigger>
                  ))}
                </TabsList>
              </div>
              {exercises.map((ex) => (
                <TabsContent key={ex.id} value={ex.id}>
                  <EmbeddedIDE
                    exercise={ex}
                    submitting={!!submittingExercise[ex.id]}
                    onSubmit={handleSubmitExercise}
                  />
                </TabsContent>
              ))}
            </Tabs>
          )}
        </section>
      )}

      {/* Completion banner & Mark as Read / Finished — shown after exercises */}
      {lesson.content_type !== 'quiz' && (
        <div className='flex flex-col items-center justify-center pb-8 pt-2 gap-3 w-full px-2'>
          {lessonCompleted ? (
            <div className='w-full rounded-2xl border border-emerald-200 bg-emerald-50 p-4 sm:p-6 text-center shadow-xs'>
              <CheckCircle2 className='mx-auto mb-2 h-7 w-7 text-emerald-600' />
              <p className='font-semibold text-emerald-800 text-base sm:text-lg'>
                {lesson.content_type === 'exercise'
                  ? 'Exercise Completed!'
                  : 'Lesson Completed!'}
              </p>
              {nextItem && slug && (
                <Button
                  variant='outline'
                  className='mt-4 border-emerald-300 text-emerald-700 hover:bg-emerald-100 hover:text-emerald-700 font-semibold px-6 py-2.5 w-full sm:w-auto min-h-[44px]'
                  onClick={() => navigate(buildNextUrl(nextItem, slug))}
                >
                  Next {nextLabel(nextItem?.type || '')} →
                </Button>
              )}
            </div>
          ) : data?.lesson?.id ? (
            <div className='flex flex-col items-center gap-2.5 w-full max-w-lg px-1 sm:px-2'>
              <Button
                onClick={handleCompleteLesson}
                disabled={!canMarkComplete || isCompleting || isNavigating}
                loading={isCompleting || isNavigating}
                size='lg'
                className={`w-full sm:w-auto min-h-[48px] sm:min-h-[56px] px-4 sm:px-8 py-3 sm:py-5 text-xs sm:text-base md:text-lg font-bold shadow-lg transition-all rounded-xl flex items-center justify-center text-center ${
                  canMarkComplete
                    ? 'bg-emerald-600 hover:bg-emerald-700 text-white cursor-pointer hover:shadow-emerald-500/25 ring-2 ring-emerald-400/30'
                    : 'bg-slate-200 text-slate-400 border border-slate-300 cursor-not-allowed shadow-none'
                }`}
              >
                {canMarkComplete ? (
                  <CheckCircle2 className='mr-2 h-4 w-4 sm:h-5 sm:w-5 shrink-0' />
                ) : (
                  <Lock className='mr-2 h-4 w-4 sm:h-5 sm:w-5 text-slate-400 shrink-0' />
                )}
                <span className='truncate'>
                  {canMarkComplete
                    ? 'Mark as Finished & Next →'
                    : 'Complete Exercise Below to Unlock'}
                </span>
              </Button>
              {!canMarkComplete && (
                <p className='text-xs text-slate-500 font-medium text-center px-2 sm:px-4 leading-relaxed'>
                  Pass all test cases in the coding exercise below to complete this module.
                </p>
              )}
            </div>
          ) : null}
        </div>
      )}

      <LessonAssistant
        lessonContext={{
          title: subtopic.title,
          contentType: lesson.content_type || 'lesson',
          content: lesson.markdown_content?.slice(0, 1500) ?? '',
        }}
      />
    </div>
  );
};

export default Lesson;
