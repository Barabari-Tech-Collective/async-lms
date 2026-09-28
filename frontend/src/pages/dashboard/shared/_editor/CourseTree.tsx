import { memo, useRef, useState } from 'react';
import {
  ChevronDown,
  ChevronRight,
  ClipboardList,
  GripVertical,
  ListChecks,
  Loader2,
  MoreHorizontal,
  Pencil,
  Plus,
  Sparkles,
  Trash2,
  Trophy,
} from 'lucide-react';
import toast from 'react-hot-toast';
import type {
  AiCapstoneProject,
  AiLesson,
  AiModule,
  AiTopic,
} from '@/features/aiCurriculum/types';
import { aiCurriculumApi } from '@/features/aiCurriculum/aiCurriculumApi';
import { getLessonMeta } from './types';
import { InlineInput, InlineTitle } from './InlineWidgets';
import { QuizModal } from './QuizModal';
import { AssignmentModal } from './AssignmentModal';

// ─── Ellipsis dropdown ────────────────────────────────────────────────────────

function DropMenu({
  items,
}: {
  items: {
    label: string;
    icon: React.ReactNode;
    onClick: () => void;
    disabled?: boolean;
  }[];
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const handleBlur = () => setTimeout(() => setOpen(false), 120);

  return (
    <div ref={ref} className='relative' onBlur={handleBlur}>
      <button
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        className='p-1 text-slate-300 hover:text-indigo-500 rounded transition-colors'
      >
        <MoreHorizontal className='w-3.5 h-3.5' />
      </button>
      {open && (
        <div className='absolute right-0 top-full mt-1 z-50 w-52 bg-white border border-slate-200 rounded-lg shadow-lg py-1 text-[13px]'>
          {items.map((item, i) => (
            <button
              key={i}
              disabled={item.disabled}
              onMouseDown={(e) => e.preventDefault()}
              onClick={(e) => {
                e.stopPropagation();
                setOpen(false);
                item.onClick();
              }}
              className='w-full flex items-center gap-2.5 px-3 py-2 text-left text-slate-700 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors'
            >
              {item.icon}
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Subtopic row ─────────────────────────────────────────────────────────────

export const LessonItem = memo(function LessonItem({
  lesson,
  selected,
  canEdit,
  onSelect,
  onDelete,
  onRename,
}: {
  lesson: AiLesson;
  selected: boolean;
  canEdit: boolean;
  onSelect: () => void;
  onDelete: (id: string) => void;
  onRename: (id: string, title: string) => void;
}) {
  const [deleting, setDeleting] = useState(false);
  const [renaming, setRenaming] = useState(false);

  const handleDelete = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm('Delete this subtopic?')) return;
    setDeleting(true);
    try {
      await aiCurriculumApi.deleteLesson(lesson.id);
      onDelete(lesson.id);
    } catch {
      toast.error('Failed to delete subtopic');
      setDeleting(false);
    }
  };

  const { Icon, color } = getLessonMeta();

  return (
    <div
      onClick={onSelect}
      className={`flex items-center gap-2 py-2 px-3 rounded-lg cursor-pointer transition-colors group ${
        selected ? 'bg-indigo-50' : 'hover:bg-slate-50'
      }`}
    >
      {canEdit && (
        <GripVertical className='w-3.5 h-3.5 text-slate-300 shrink-0 cursor-grab' />
      )}
      <Icon
        className={`w-4 h-4 shrink-0 ${selected ? 'text-indigo-500' : color}`}
      />
      <InlineTitle
        value={lesson.title || 'New Lesson'}
        disabled={!canEdit}
        editing={renaming}
        onStopEditing={() => setRenaming(false)}
        className={`flex-1 text-[13px] min-w-0 ${selected ? 'text-indigo-700 font-semibold' : 'text-slate-700'}`}
        onSave={async (v) => {
          await aiCurriculumApi.updateLesson(lesson.id, { title: v });
          onRename(lesson.id, v);
        }}
      />
      {lesson.is_new && (
        <span className='inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 shrink-0 shadow-2xs animate-pulse'>
          <span className='w-1.5 h-1.5 rounded-full bg-emerald-500' />
          New
        </span>
      )}
      {lesson.is_modified && (
        <span className='inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200 shrink-0 shadow-2xs'>
          <span className='w-1.5 h-1.5 rounded-full bg-amber-500' />
          Edited
        </span>
      )}
      {canEdit && (
        <div className='flex items-center gap-0.5 shrink-0'>
          <button
            onClick={(e) => {
              e.stopPropagation();
              setRenaming(true);
            }}
            className='p-1 text-slate-300 hover:text-indigo-500 transition-colors'
          >
            <Pencil className='w-3 h-3' />
          </button>
          <button
            onClick={handleDelete}
            disabled={deleting}
            className='p-1 text-slate-300 hover:text-red-400 transition-colors'
          >
            {deleting ? (
              <Loader2 className='w-3 h-3 animate-spin' />
            ) : (
              <Trash2 className='w-3 h-3' />
            )}
          </button>
        </div>
      )}
    </div>
  );
});

// ─── Unit card ────────────────────────────────────────────────────────────────

export function TopicItem({
  topic,
  selectedLessonId,
  canEdit,
  onSelectLesson,
  onDeleteLesson,
  onDeleteTopic,
  onAddLesson,
  onRenameLesson,
  onRename,
  onUpdateTopic,
  onGenerateSubtopics,
  onGenerateTopicQuiz,
  onGenerateTopicAssignment,
  dragHandlers,
}: {
  topic: AiTopic;
  selectedLessonId: string | null;
  canEdit: boolean;
  onSelectLesson: (l: AiLesson) => void;
  onDeleteLesson: (topicId: string, lessonId: string) => void;
  onDeleteTopic: (id: string) => void;
  onAddLesson: (topicId: string, lesson: AiLesson) => void;
  onRenameLesson: (lessonId: string, title: string) => void;
  onRename: (topicId: string, title: string) => void;
  onUpdateTopic: (topicId: string, data: Partial<AiTopic>) => void;
  onGenerateSubtopics: (topicId: string) => Promise<void>;
  onGenerateTopicQuiz: (topicId: string) => Promise<void>;
  onGenerateTopicAssignment: (topicId: string) => Promise<void>;
  dragHandlers?: React.HTMLAttributes<HTMLDivElement>;
}) {
  const [deleting, setDeleting] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [addingLesson, setAddingLesson] = useState(false);
  const [savingLesson, setSavingLesson] = useState(false);
  const [generatingSubtopics, setGeneratingSubtopics] = useState(false);
  const [generatingQuiz, setGeneratingQuiz] = useState(false);
  const [generatingAssignment, setGeneratingAssignment] = useState(false);
  const [quizModalOpen, setQuizModalOpen] = useState(false);
  const [assignmentModalOpen, setAssignmentModalOpen] = useState(false);

  const handleDeleteTopic = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm(`Delete unit "${topic.title}" and all its subtopics?`)) return;
    setDeleting(true);
    try {
      await aiCurriculumApi.deleteTopic(topic.id);
      onDeleteTopic(topic.id);
    } catch {
      toast.error('Failed to delete unit');
      setDeleting(false);
    }
  };

  const handleAddLesson = async (title: string) => {
    setSavingLesson(true);
    try {
      const res = await aiCurriculumApi.addLesson(topic.id, title);
      onAddLesson(topic.id, res.data.data);
      setAddingLesson(false);
      toast.success('Subtopic added');
    } catch {
      toast.error('Failed to add subtopic');
    } finally {
      setSavingLesson(false);
    }
  };

  const handleGenerateSubtopics = async () => {
    setGeneratingSubtopics(true);
    try {
      await onGenerateSubtopics(topic.id);
    } finally {
      setGeneratingSubtopics(false);
    }
  };

  const handleGenerateQuiz = async () => {
    setGeneratingQuiz(true);
    try {
      await onGenerateTopicQuiz(topic.id);
    } finally {
      setGeneratingQuiz(false);
    }
  };

  const handleGenerateAssignment = async () => {
    setGeneratingAssignment(true);
    try {
      await onGenerateTopicAssignment(topic.id);
    } finally {
      setGeneratingAssignment(false);
    }
  };

  const hasQuiz =
    Array.isArray(topic.quiz_questions) && topic.quiz_questions.length > 0;
  const hasAssignment = !!topic.assignment;
  const totalQs = hasQuiz ? topic.quiz_questions.length : 0;
  const anyGenerating =
    generatingSubtopics || generatingQuiz || generatingAssignment;

  return (
    <>
      <div
        className='bg-white border border-slate-200 rounded-xl overflow-hidden'
        {...dragHandlers}
      >
        {/* Unit header */}
        <div className='flex items-center gap-2 px-3 py-2.5 border-b border-slate-100 group/unit'>
          {canEdit && (
            <GripVertical className='w-3.5 h-3.5 text-slate-300 shrink-0 cursor-grab' />
          )}
          <InlineTitle
            value={topic.title}
            disabled={!canEdit}
            editing={renaming}
            onStopEditing={() => setRenaming(false)}
            className='flex-1 text-[12px] font-bold text-slate-600 uppercase tracking-wider min-w-0'
            onSave={async (v) => {
              await aiCurriculumApi.updateTopic(topic.id, { title: v });
              onRename(topic.id, v);
            }}
          />
          {topic.is_new && (
            <span className='inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 shrink-0 shadow-2xs animate-pulse'>
              <span className='w-1.5 h-1.5 rounded-full bg-emerald-500' />
              New Unit
            </span>
          )}
          {canEdit && (
            <div className='flex items-center gap-0.5 shrink-0'>
              {anyGenerating ? (
                <Loader2 className='w-3.5 h-3.5 animate-spin text-indigo-400' />
              ) : (
                <DropMenu
                  items={[
                    {
                      label: 'Generate Subtopics',
                      icon: (
                        <Sparkles className='w-3.5 h-3.5 text-indigo-400' />
                      ),
                      onClick: handleGenerateSubtopics,
                    },
                  ]}
                />
              )}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setRenaming(true);
                }}
                className='p-1 text-slate-300 hover:text-indigo-500 transition-colors'
              >
                <Pencil className='w-3 h-3' />
              </button>
              <button
                onClick={handleDeleteTopic}
                disabled={deleting}
                className='p-1 text-slate-300 hover:text-red-400 transition-colors'
              >
                {deleting ? (
                  <Loader2 className='w-3 h-3 animate-spin' />
                ) : (
                  <Trash2 className='w-3 h-3' />
                )}
              </button>
            </div>
          )}
        </div>

        {/* Subtopic list */}
        <div className='px-1 py-1.5 space-y-0.5'>
          {topic.lessons.length === 0 && !addingLesson && (
            <p className='px-3 py-2 text-[12px] text-slate-300 italic'>
              No subtopics yet
            </p>
          )}
          {topic.lessons.map((lesson) => (
            <LessonItem
              key={lesson.id}
              lesson={lesson}
              selected={selectedLessonId === lesson.id}
              canEdit={canEdit}
              onSelect={() => onSelectLesson(lesson)}
              onDelete={(lessonId) => onDeleteLesson(topic.id, lessonId)}
              onRename={onRenameLesson}
            />
          ))}

          {canEdit &&
            (addingLesson ? (
              <div className='px-2 py-1'>
                <InlineInput
                  placeholder='Subtopic title...'
                  onConfirm={handleAddLesson}
                  onCancel={() => setAddingLesson(false)}
                  loading={savingLesson}
                />
              </div>
            ) : (
              <button
                onClick={() => setAddingLesson(true)}
                className='w-full flex items-center gap-2 py-1.5 px-3 text-[12px] text-slate-400 hover:text-indigo-500 hover:bg-indigo-50 rounded-lg transition-colors'
              >
                <Plus className='w-3.5 h-3.5 shrink-0' /> Add Subtopic
              </button>
            ))}
        </div>

        {/* Quiz + Assignment — always visible at bottom */}
        <div className='border-t border-slate-100 px-2 py-1.5 space-y-1'>
          {/* Quiz row */}
          {hasQuiz ? (
            <button
              onClick={() => setQuizModalOpen(true)}
              className='w-full flex items-center gap-2 py-1.5 px-3 rounded-lg bg-orange-50 hover:bg-orange-100 transition-colors text-left'
            >
              <ListChecks className='w-3.5 h-3.5 text-orange-500 shrink-0' />
              <span className='flex-1 text-[12px] font-medium text-orange-700'>
                Unit Quiz
              </span>
              <span className='text-[11px] font-semibold text-orange-500 bg-white border border-orange-200 px-1.5 py-0.5 rounded-full shrink-0'>
                {totalQs}Q
              </span>
            </button>
          ) : (
            canEdit && (
              <button
                disabled={generatingQuiz}
                onClick={handleGenerateQuiz}
                className='w-full flex items-center gap-2 py-1.5 px-3 rounded-lg border border-dashed border-orange-200 text-[12px] text-orange-400 hover:bg-orange-50 hover:border-orange-300 disabled:opacity-50 transition-colors'
              >
                {generatingQuiz ? (
                  <Loader2 className='w-3.5 h-3.5 animate-spin shrink-0' />
                ) : (
                  <ListChecks className='w-3.5 h-3.5 shrink-0' />
                )}
                {generatingQuiz ? 'Generating Quiz...' : 'Generate Quiz'}
              </button>
            )
          )}

          {/* Assignment row */}
          {hasAssignment ? (
            <button
              onClick={() => setAssignmentModalOpen(true)}
              className='w-full flex items-center gap-2 py-1.5 px-3 rounded-lg bg-amber-50 hover:bg-amber-100 transition-colors text-left'
            >
              <ClipboardList className='w-3.5 h-3.5 text-amber-500 shrink-0' />
              <span className='flex-1 text-[12px] font-medium text-amber-700 truncate'>
                {topic.assignment!.title}
              </span>
              <span className='text-[11px] font-semibold text-amber-500 bg-white border border-amber-200 px-1.5 py-0.5 rounded-full shrink-0'>
                {topic.assignment!.max_score}pts
              </span>
            </button>
          ) : (
            canEdit && (
              <button
                disabled={generatingAssignment}
                onClick={handleGenerateAssignment}
                className='w-full flex items-center gap-2 py-1.5 px-3 rounded-lg border border-dashed border-amber-200 text-[12px] text-amber-400 hover:bg-amber-50 hover:border-amber-300 disabled:opacity-50 transition-colors'
              >
                {generatingAssignment ? (
                  <Loader2 className='w-3.5 h-3.5 animate-spin shrink-0' />
                ) : (
                  <ClipboardList className='w-3.5 h-3.5 shrink-0' />
                )}
                {generatingAssignment
                  ? 'Generating Assignment...'
                  : 'Generate Assignment'}
              </button>
            )
          )}
        </div>
      </div>

      {/* Modals */}
      {quizModalOpen && (
        <QuizModal
          topicId={topic.id}
          topicTitle={topic.title}
          initialQuestions={topic.quiz_questions ?? []}
          canEdit={canEdit}
          onClose={() => setQuizModalOpen(false)}
          onQuestionsChange={(questions) =>
            onUpdateTopic(topic.id, { quiz_questions: questions })
          }
          onGenerateQuiz={async (topicId) => {
            await onGenerateTopicQuiz(topicId);
          }}
        />
      )}
      {assignmentModalOpen && (
        <AssignmentModal
          topicId={topic.id}
          topicTitle={topic.title}
          initialAssignment={topic.assignment ?? null}
          canEdit={canEdit}
          onClose={() => setAssignmentModalOpen(false)}
          onAssignmentChange={(assignment) =>
            onUpdateTopic(topic.id, { assignment: assignment ?? undefined })
          }
          onGenerateAssignment={async (topicId) => {
            await onGenerateTopicAssignment(topicId);
          }}
        />
      )}
    </>
  );
}

// ─── Topic accordion ──────────────────────────────────────────────────────────

export function ModuleItem({
  module: mod,
  index,
  selectedLessonId,
  canEdit,
  onSelectLesson,
  onDeleteLesson,
  onDeleteTopic,
  onDeleteModule,
  onAddTopic,
  onAddLesson,
  onRenameLesson,
  onRenameTopic,
  onRenameModule,
  onReorderTopics,
  onUpdateTopic,
  onGenerateUnits,
  onGenerateSubtopics,
  onGenerateTopicQuiz,
  onGenerateTopicAssignment,
  onGenerateCapstone,
  onUpdateModule,
  isDragOver,
  dragHandlers,
}: {
  module: AiModule;
  index: number;
  selectedLessonId: string | null;
  canEdit: boolean;
  onSelectLesson: (l: AiLesson) => void;
  onDeleteLesson: (topicId: string, lessonId: string) => void;
  onDeleteTopic: (moduleId: string, topicId: string) => void;
  onDeleteModule: (id: string) => void;
  onAddTopic: (moduleId: string, topic: AiTopic) => void;
  onAddLesson: (topicId: string, lesson: AiLesson) => void;
  onRenameLesson: (lessonId: string, title: string) => void;
  onRenameTopic: (moduleId: string, topicId: string, title: string) => void;
  onRenameModule: (moduleId: string, title: string) => void;
  onReorderTopics: (moduleId: string, topics: AiTopic[]) => void;
  onUpdateTopic: (topicId: string, data: Partial<AiTopic>) => void;
  onGenerateUnits: (moduleId: string) => Promise<void>;
  onGenerateSubtopics: (topicId: string) => Promise<void>;
  onGenerateTopicQuiz: (topicId: string) => Promise<void>;
  onGenerateTopicAssignment: (topicId: string) => Promise<void>;
  onGenerateCapstone: (moduleId: string) => Promise<void>;
  onUpdateModule: (moduleId: string, data: Partial<AiModule>) => void;
  isDragOver: boolean;
  dragHandlers: React.HTMLAttributes<HTMLDivElement>;
}) {
  const [open, setOpen] = useState(index === 0);
  const [deleting, setDeleting] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [addingTopic, setAddingTopic] = useState(false);
  const [savingTopic, setSavingTopic] = useState(false);
  const [generatingUnits, setGeneratingUnits] = useState(false);
  const [generatingCapstone, setGeneratingCapstone] = useState(false);
  const [capstoneEditOpen, setCapstoneEditOpen] = useState(false);
  const [capstoneForm, setCapstoneForm] = useState<AiCapstoneProject>({
    title: '',
    description: '',
    instructions: '',
  });
  const [capstoneFormSaving, setCapstoneFormSaving] = useState(false);
  const [dragTopicIdx, setDragTopicIdx] = useState<number | null>(null);
  const [dragTopicOver, setDragTopicOver] = useState<number | null>(null);

  const handleDeleteModule = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm(`Delete topic "${mod.title}" and all its content?`)) return;
    setDeleting(true);
    try {
      await aiCurriculumApi.deleteModule(mod.id);
      onDeleteModule(mod.id);
    } catch {
      toast.error('Failed to delete topic');
      setDeleting(false);
    }
  };

  const handleAddTopic = async (title: string) => {
    setSavingTopic(true);
    try {
      const res = await aiCurriculumApi.addTopic(mod.id, title);
      onAddTopic(mod.id, res.data.data);
      setAddingTopic(false);
      toast.success('Unit added');
    } catch {
      toast.error('Failed to add unit');
    } finally {
      setSavingTopic(false);
    }
  };

  const handleGenerateUnits = async () => {
    setGeneratingUnits(true);
    setOpen(true);
    try {
      await onGenerateUnits(mod.id);
    } finally {
      setGeneratingUnits(false);
    }
  };

  const handleGenerateCapstone = async () => {
    setGeneratingCapstone(true);
    try {
      await onGenerateCapstone(mod.id);
    } finally {
      setGeneratingCapstone(false);
    }
  };

  const handleSaveCapstone = async () => {
    if (!capstoneForm.title.trim()) return;
    setCapstoneFormSaving(true);
    try {
      await aiCurriculumApi.updateModule(mod.id, {
        capstone_project: capstoneForm,
      } as any);
      onUpdateModule(mod.id, { capstone_project: capstoneForm });
      setCapstoneEditOpen(false);
      toast.success('Capstone saved');
    } catch {
      toast.error('Failed to save capstone');
    } finally {
      setCapstoneFormSaving(false);
    }
  };

  const handleDropTopic = async (from: number, to: number) => {
    if (from === to) return;
    const reordered = [...mod.topics];
    const [moved] = reordered.splice(from, 1);
    reordered.splice(to, 0, moved);
    onReorderTopics(mod.id, reordered);
    setDragTopicIdx(null);
    setDragTopicOver(null);
    try {
      await aiCurriculumApi.reorderTopics(
        mod.course_id,
        reordered.map((t, i) => ({ id: t.id, order_index: i })),
      );
    } catch {
      toast.error('Failed to reorder units');
      onReorderTopics(mod.id, mod.topics);
    }
  };

  return (
    <div
      className={`transition-all space-y-2 ${isDragOver ? 'opacity-60' : ''}`}
      {...dragHandlers}
    >
      {/* Topic header row */}
      <div className='flex items-center gap-2 px-3 py-2.5 rounded-xl bg-slate-100/80 hover:bg-slate-200/70 border border-slate-200/70 transition-colors group/mod'>
        {canEdit && (
          <GripVertical className='w-4 h-4 text-slate-300 cursor-grab shrink-0' />
        )}
        <button
          onClick={() => setOpen((v) => !v)}
          className='shrink-0 text-slate-400 hover:text-slate-600 transition-colors p-0.5'
        >
          {open ? (
            <ChevronDown className='w-4 h-4' />
          ) : (
            <ChevronRight className='w-4 h-4' />
          )}
        </button>
        <InlineTitle
          value={mod.title}
          disabled={!canEdit}
          editing={renaming}
          onStopEditing={() => setRenaming(false)}
          className='flex-1 text-[13px] sm:text-[14px] font-bold text-slate-800 min-w-0'
          onSave={async (v) => {
            await aiCurriculumApi.updateModule(mod.id, { title: v });
            onRenameModule(mod.id, v);
          }}
        />
        {mod.is_new && (
          <span className='inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 shrink-0 shadow-2xs animate-pulse'>
            <span className='w-1.5 h-1.5 rounded-full bg-emerald-500' />
            New Topic
          </span>
        )}
        {canEdit && (
          <div className='flex items-center gap-0.5 shrink-0'>
            {generatingUnits ? (
              <Loader2 className='w-3.5 h-3.5 animate-spin text-indigo-400' />
            ) : (
              <button
                onClick={handleGenerateUnits}
                title='Generate Units with AI'
                className='p-1.5 text-slate-400 hover:text-indigo-500 rounded-lg hover:bg-indigo-50 transition-all'
              >
                <Sparkles className='w-3.5 h-3.5' />
              </button>
            )}
            <button
              onClick={(e) => {
                e.stopPropagation();
                setRenaming(true);
              }}
              className='p-1.5 text-slate-400 hover:text-indigo-500 rounded-lg hover:bg-indigo-50 transition-all'
            >
              <Pencil className='w-3.5 h-3.5' />
            </button>
            <button
              onClick={handleDeleteModule}
              disabled={deleting}
              className='p-1.5 text-slate-400 hover:text-red-400 rounded-lg hover:bg-red-50 transition-all'
            >
              {deleting ? (
                <Loader2 className='w-3.5 h-3.5 animate-spin' />
              ) : (
                <Trash2 className='w-3.5 h-3.5' />
              )}
            </button>
          </div>
        )}
      </div>

      {/* Unit cards */}
      {open && (
        <div className='mt-2 space-y-2.5'>
          {mod.topics.length === 0 && (
            <p className='text-[13px] text-slate-300 italic px-2 py-1'>
              No units yet.
            </p>
          )}
          {mod.topics.map((topic, ti) => (
            <TopicItem
              key={topic.id}
              topic={topic}
              selectedLessonId={selectedLessonId}
              canEdit={canEdit}
              onSelectLesson={onSelectLesson}
              onDeleteLesson={onDeleteLesson}
              onDeleteTopic={(topicId) => onDeleteTopic(mod.id, topicId)}
              onAddLesson={onAddLesson}
              onRenameLesson={onRenameLesson}
              onRename={(topicId, title) =>
                onRenameTopic(mod.id, topicId, title)
              }
              onUpdateTopic={onUpdateTopic}
              onGenerateSubtopics={onGenerateSubtopics}
              onGenerateTopicQuiz={onGenerateTopicQuiz}
              onGenerateTopicAssignment={onGenerateTopicAssignment}
              dragHandlers={
                canEdit
                  ? {
                      draggable: true,
                      onDragStart: (e) => {
                        e.stopPropagation();
                        setDragTopicIdx(ti);
                      },
                      onDragOver: (e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setDragTopicOver(ti);
                      },
                      onDrop: (e) => {
                        e.stopPropagation();
                        if (dragTopicIdx !== null)
                          handleDropTopic(dragTopicIdx, ti);
                      },
                      onDragEnd: (e) => {
                        e.stopPropagation();
                        setDragTopicIdx(null);
                        setDragTopicOver(null);
                      },
                      style:
                        dragTopicOver === ti && dragTopicIdx !== ti
                          ? {
                              opacity: 0.5,
                              outline: '2px solid #818cf8',
                              outlineOffset: 2,
                            }
                          : undefined,
                    }
                  : undefined
              }
            />
          ))}

          {canEdit &&
            (addingTopic ? (
              <div className='bg-white border border-slate-200 rounded-xl px-3 py-2'>
                <InlineInput
                  placeholder='Unit title...'
                  onConfirm={handleAddTopic}
                  onCancel={() => setAddingTopic(false)}
                  loading={savingTopic}
                />
              </div>
            ) : (
              <button
                onClick={() => {
                  setOpen(true);
                  setAddingTopic(true);
                }}
                className='w-full flex items-center gap-2 py-2 px-3 text-[12px] text-slate-400 border border-dashed border-slate-200 rounded-xl hover:border-indigo-300 hover:text-indigo-500 hover:bg-indigo-50/30 transition-all'
              >
                <Plus className='w-3.5 h-3.5 shrink-0' /> Add Unit
              </button>
            ))}

          {/* Capstone section */}
          {canEdit && !mod.capstone_project && !capstoneEditOpen && (
            <button
              disabled={generatingCapstone}
              onClick={handleGenerateCapstone}
              className='w-full flex items-center gap-2 py-2 px-3 text-[12px] text-indigo-400 border border-dashed border-indigo-200 rounded-xl hover:bg-indigo-50 hover:border-indigo-400 disabled:opacity-50 transition-colors'
            >
              {generatingCapstone ? (
                <Loader2 className='w-3.5 h-3.5 animate-spin shrink-0' />
              ) : (
                <Sparkles className='w-3.5 h-3.5 shrink-0' />
              )}
              {generatingCapstone
                ? 'Generating Capstone Project...'
                : 'Generate Capstone Project with AI'}
            </button>
          )}

          {mod.capstone_project && !capstoneEditOpen && (
            <div className='flex items-start gap-2.5 px-3 py-3 rounded-xl bg-linear-to-r from-indigo-50 to-purple-50 border border-indigo-200'>
              <Trophy className='w-4 h-4 text-indigo-500 shrink-0 mt-0.5' />
              <div className='flex-1 min-w-0'>
                <p className='text-[10px] font-bold text-indigo-400 uppercase tracking-wide mb-0.5'>
                  Capstone Project
                </p>
                <p className='text-[13px] font-bold text-indigo-800 line-clamp-1'>
                  {mod.capstone_project.title}
                </p>
                <p className='text-[11px] text-indigo-500 mt-0.5 line-clamp-2'>
                  {mod.capstone_project.description}
                </p>
              </div>
              {canEdit && (
                <button
                  onClick={() => {
                    setCapstoneForm({ ...mod.capstone_project! });
                    setCapstoneEditOpen(true);
                  }}
                  className='shrink-0 p-1 text-indigo-300 hover:text-indigo-600 rounded transition-colors'
                >
                  <Pencil className='w-3.5 h-3.5' />
                </button>
              )}
            </div>
          )}

          {capstoneEditOpen && (
            <div className='border border-indigo-200 rounded-xl p-3 space-y-2 bg-white'>
              <p className='text-[11px] font-bold text-indigo-600 flex items-center gap-1.5'>
                <Trophy className='w-3.5 h-3.5' /> Capstone Project
              </p>
              <input
                className='w-full border border-slate-200 rounded-lg px-3 py-1.5 text-[13px] focus:outline-none focus:ring-2 focus:ring-indigo-300'
                placeholder='Title...'
                value={capstoneForm.title}
                onChange={(e) =>
                  setCapstoneForm((f) => ({ ...f, title: e.target.value }))
                }
              />
              <textarea
                className='w-full border border-slate-200 rounded-lg px-3 py-1.5 text-[13px] focus:outline-none focus:ring-2 focus:ring-indigo-300 resize-none'
                placeholder='Description...'
                rows={2}
                value={capstoneForm.description}
                onChange={(e) =>
                  setCapstoneForm((f) => ({
                    ...f,
                    description: e.target.value,
                  }))
                }
              />
              <textarea
                className='w-full border border-slate-200 rounded-lg px-3 py-1.5 text-[13px] focus:outline-none focus:ring-2 focus:ring-indigo-300 resize-none'
                placeholder='Instructions...'
                rows={3}
                value={capstoneForm.instructions}
                onChange={(e) =>
                  setCapstoneForm((f) => ({
                    ...f,
                    instructions: e.target.value,
                  }))
                }
              />
              <div className='flex gap-2'>
                <button
                  onClick={handleSaveCapstone}
                  disabled={capstoneFormSaving || !capstoneForm.title.trim()}
                  className='flex items-center gap-1.5 px-3 py-1.5 text-[12px] font-semibold bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors'
                >
                  {capstoneFormSaving ? (
                    <Loader2 className='w-3 h-3 animate-spin' />
                  ) : null}{' '}
                  Save
                </button>
                <button
                  onClick={() => setCapstoneEditOpen(false)}
                  className='px-3 py-1.5 text-[12px] text-slate-500 bg-slate-100 rounded-lg hover:bg-slate-200 transition-colors'
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
