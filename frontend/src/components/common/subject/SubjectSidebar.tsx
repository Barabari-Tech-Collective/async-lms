import { useEffect, useRef, useState } from 'react';
import { useParams, NavLink } from 'react-router';
import apiClient from '@/services/api';
import { Loader2, PlayCircle, ListChecks, FileText, Trophy, CheckCircle2, X } from 'lucide-react';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';

interface SubjectSidebarProps {
  isMobile?: boolean;
  onCloseMobile?: () => void;
}

export const SubjectSidebar = ({ isMobile, onCloseMobile }: SubjectSidebarProps) => {
  const { slug, subtopicSlug, exerciseId, quizId } = useParams();
  const [structure, setStructure] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedValue, setExpandedValue] = useState<string[]>([]);
  const hasAutoExpandedRef = useRef(false);

  useEffect(() => {
    const fetchStructure = async (showLoader: boolean) => {
      try {
        if (showLoader) setLoading(true);
        const { data } = await apiClient.get(`/subjects/${slug}`);
        setStructure(data.data);
      } catch {
        // structure remains null — sidebar renders empty gracefully
      } finally {
        if (showLoader) setLoading(false);
      }
    };

    if (!slug) return;
    hasAutoExpandedRef.current = false;
    fetchStructure(true);

    const handleProgressUpdate = () => fetchStructure(false);
    window.addEventListener('course-progress-updated', handleProgressUpdate);
    const handleStorage = (e: StorageEvent) => {
      if (e.key === 'codeguru-progress-updated') {
        fetchStructure(false);
      }
    };
    window.addEventListener('storage', handleStorage);
    return () => {
      window.removeEventListener(
        'course-progress-updated',
        handleProgressUpdate,
      );
      window.removeEventListener('storage', handleStorage);
    };
  }, [slug]);

  // Auto-expand topic when a lesson/content within it is active
  useEffect(() => {
    if (!structure.length) return;

    const currentTopic = structure.find((topic) =>
      topic.units?.some(
        (unit: any) =>
          unit.subtopics?.some((sub: any) => sub.slug === subtopicSlug) ||
          unit.assignments?.some((a: any) => a.id === exerciseId) ||
          unit.quizzes?.some((q: any) => q.id === quizId),
      ),
    );

    if (currentTopic) {
      const itemValue = `item-${currentTopic.id}`;
      setExpandedValue((prev) =>
        prev.includes(itemValue) ? prev : [...prev, itemValue],
      );
      hasAutoExpandedRef.current = true;
    } else if (!hasAutoExpandedRef.current) {
      const firstTopic = structure[0];
      if (firstTopic) {
        const itemValue = `item-${firstTopic.id}`;
        setExpandedValue((prev) =>
          prev.includes(itemValue) ? prev : [...prev, itemValue],
        );
        hasAutoExpandedRef.current = true;
      }
    }
  }, [structure, subtopicSlug, exerciseId, quizId]);

  const handleItemClick = () => {
    if (isMobile && onCloseMobile) {
      onCloseMobile();
    }
  };

  if (loading)
    return (
      <div className='p-10 flex justify-center'>
        <Loader2 className='animate-spin text-blue-600' />
      </div>
    );

  return (
    <div
      className={`h-full bg-slate-50 border-r flex flex-col overflow-y-auto shrink-0 ${
        isMobile ? 'w-full' : 'w-80'
      }`}
    >
      <div className='p-4 sm:p-6 border-b bg-white flex items-center justify-between'>
        <h2 className='font-bold text-base sm:text-lg text-slate-900'>Course Content</h2>
        {isMobile && onCloseMobile && (
          <button
            onClick={onCloseMobile}
            className='p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition-colors'
            aria-label='Close Curriculum'
          >
            <X className='w-5 h-5' />
          </button>
        )}
      </div>

      <Accordion
        type='multiple'
        className='w-full'
        value={expandedValue}
        onValueChange={setExpandedValue}
      >
        {structure.map((topic, index) => (
          <AccordionItem value={`item-${topic.id}`} key={topic.id}>
            <AccordionTrigger className='px-4 sm:px-6 py-3.5 hover:no-underline min-h-[48px]'>
              <span className='text-xs sm:text-sm font-semibold text-left'>
                {index + 1}. {topic.title}
              </span>
            </AccordionTrigger>
            <AccordionContent>
              {topic.units?.map((unit: any) => (
                <div key={unit.id} className='mb-2'>
                  <div className='bg-slate-100 px-4 sm:px-6 py-2 text-[11px] sm:text-xs font-bold uppercase text-slate-500'>
                    {unit.title}
                  </div>
                  {unit.subtopics?.map((sub: any) => (
                    <NavLink
                      key={sub.id}
                      to={`/dashboard/student/courses/${slug}/lesson/${sub.slug}`}
                      onClick={handleItemClick}
                      className={({ isActive }) =>
                        `flex items-center gap-3 py-2.5 pl-6 sm:pl-10 pr-4 text-xs sm:text-sm transition-all min-h-[44px] ${
                          isActive
                            ? 'border-r-4 border-blue-600 bg-blue-50 text-blue-700 font-semibold'
                            : 'text-slate-600 hover:bg-slate-50'
                        }`
                      }
                    >
                      <PlayCircle className='h-4 w-4 shrink-0' />
                      <span className='flex-1 truncate'>{sub.title}</span>
                      {sub.is_completed && (
                        <CheckCircle2 className='h-4 w-4 shrink-0 text-emerald-500' />
                      )}
                    </NavLink>
                  ))}

                  {unit.quizzes?.map((quiz: any) => (
                    <NavLink
                      key={quiz.id}
                      to={`/dashboard/student/courses/${slug}/quiz/${quiz.id}`}
                      onClick={handleItemClick}
                      className={({ isActive }) =>
                        `flex items-center gap-3 py-2.5 pl-6 sm:pl-10 pr-4 text-xs sm:text-sm transition-all min-h-[44px] ${
                          isActive
                            ? 'border-r-4 border-blue-600 bg-blue-50 text-blue-700 font-semibold'
                            : 'text-slate-600 hover:bg-slate-50'
                        }`
                      }
                    >
                      <ListChecks className='h-4 w-4 shrink-0' />
                      <span className='flex-1 truncate'>Quiz</span>
                      {quiz.is_passed && (
                        <CheckCircle2 className='h-4 w-4 shrink-0 text-emerald-500' />
                      )}
                    </NavLink>
                  ))}

                  {unit.assignments?.map((a: any) => (
                    <NavLink
                      key={a.id}
                      to={`/dashboard/student/courses/${slug}/assignment/${a.id}`}
                      onClick={handleItemClick}
                      className={({ isActive }) =>
                        `flex items-center gap-3 py-2.5 pl-6 sm:pl-10 pr-4 text-xs sm:text-sm transition-all min-h-[44px] ${
                          isActive
                            ? 'border-r-4 border-blue-600 bg-blue-50 text-blue-700 font-semibold'
                            : 'text-slate-600 hover:bg-slate-50'
                        }`
                      }
                    >
                      <FileText className='h-4 w-4 shrink-0' />
                      <span className='flex-1 truncate'>{a.title}</span>
                      {a.is_submitted && (
                        <CheckCircle2 className='h-4 w-4 shrink-0 text-emerald-500' />
                      )}
                    </NavLink>
                  ))}
                </div>
              ))}
              {/* Capstone (topic-level) */}
              {topic.capstone && (
                <NavLink
                  to={`/dashboard/student/courses/${slug}/capstone/${topic.capstone.id}`}
                  onClick={handleItemClick}
                  className={({ isActive }) =>
                    `flex items-center gap-3 py-2.5 pl-4 sm:pl-6 pr-4 text-xs sm:text-sm transition-all border-t border-slate-200 min-h-[44px] ${
                      isActive
                        ? 'border-r-4 border-amber-500 bg-amber-50 text-amber-700 font-semibold'
                        : 'text-slate-600 hover:bg-amber-50/60'
                    }`
                  }
                >
                  <Trophy className='h-4 w-4 shrink-0 text-amber-500' />
                  <span className='font-medium truncate'>{topic.capstone.title}</span>
                </NavLink>
              )}
            </AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
    </div>
  );
};

