import { useEffect, useState } from 'react';
import { CheckCircle2, Loader2, Plus, Sparkles, Trash2, X } from 'lucide-react';
import toast from 'react-hot-toast';
import type { AiQuizQuestion } from '@/features/aiCurriculum/types';
import { aiCurriculumApi } from '@/features/aiCurriculum/aiCurriculumApi';

// ─── Empty question factory ───────────────────────────────────────────────────

function emptyQuestion(): AiQuizQuestion {
  return { question: '', options: ['', '', '', ''], correct_index: 0, explanation: '' };
}

// ─── Single question form ─────────────────────────────────────────────────────

function QuestionForm({
  q,
  onChange,
}: {
  q: AiQuizQuestion;
  onChange: (updated: AiQuizQuestion) => void;
}) {
  const set = (patch: Partial<AiQuizQuestion>) => onChange({ ...q, ...patch });
  const setOption = (i: number, val: string) => {
    const opts = [...q.options];
    opts[i] = val;
    set({ options: opts });
  };

  return (
    <div className='space-y-3'>
      <div>
        <label className='block text-[11px] font-semibold text-slate-500 mb-1'>Question</label>
        <textarea
          rows={2}
          value={q.question}
          onChange={(e) => set({ question: e.target.value })}
          placeholder='Type the question...'
          className='w-full border border-slate-200 rounded-lg px-3 py-2 text-[13px] text-slate-800 placeholder:text-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-200 resize-none'
        />
      </div>

      <div>
        <label className='block text-[11px] font-semibold text-slate-500 mb-1.5'>
          Options <span className='font-normal text-slate-400'>(click radio to mark correct)</span>
        </label>
        <div className='space-y-2'>
          {q.options.map((opt, i) => (
            <div key={i} className='flex items-center gap-2'>
              <button
                type='button'
                onClick={() => set({ correct_index: i })}
                className={`shrink-0 w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors ${
                  q.correct_index === i
                    ? 'border-green-500 bg-green-500'
                    : 'border-slate-300 hover:border-indigo-400'
                }`}
              >
                {q.correct_index === i && <span className='w-2 h-2 rounded-full bg-white' />}
              </button>
              <input
                value={opt}
                onChange={(e) => setOption(i, e.target.value)}
                placeholder={`Option ${String.fromCharCode(65 + i)}`}
                className={`flex-1 border rounded-lg px-3 py-1.5 text-[13px] focus:outline-none focus:ring-2 focus:ring-indigo-200 transition-colors ${
                  q.correct_index === i
                    ? 'border-green-300 bg-green-50 text-green-800'
                    : 'border-slate-200 text-slate-700'
                }`}
              />
            </div>
          ))}
        </div>
      </div>

      <div>
        <label className='block text-[11px] font-semibold text-slate-500 mb-1'>Explanation</label>
        <textarea
          rows={2}
          value={q.explanation}
          onChange={(e) => set({ explanation: e.target.value })}
          placeholder='Why is this answer correct?'
          className='w-full border border-slate-200 rounded-lg px-3 py-2 text-[13px] text-slate-700 placeholder:text-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-200 resize-none'
        />
      </div>
    </div>
  );
}

// ─── Quiz Modal ───────────────────────────────────────────────────────────────

export function QuizModal({
  topicId,
  topicTitle,
  initialQuestions,
  canEdit,
  onClose,
  onQuestionsChange,
  onGenerateQuiz,
}: {
  topicId: string;
  topicTitle: string;
  initialQuestions: AiQuizQuestion[];
  canEdit: boolean;
  onClose: () => void;
  onQuestionsChange: (questions: AiQuizQuestion[]) => void;
  onGenerateQuiz: (topicId: string) => Promise<void>;
}) {
  const [questions, setQuestions] = useState<AiQuizQuestion[]>(initialQuestions);
  const [editingIdx, setEditingIdx] = useState<number | null>(null);
  const [addingNew, setAddingNew] = useState(false);
  const [newQ, setNewQ] = useState<AiQuizQuestion>(emptyQuestion());
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);

  // Keep in sync if parent changes (e.g., after generation)
  useEffect(() => { setQuestions(initialQuestions); }, [initialQuestions]);

  const persist = async (updated: AiQuizQuestion[]) => {
    setSaving(true);
    try {
      await aiCurriculumApi.updateTopic(topicId, { quiz_questions: updated } as never);
      setQuestions(updated);
      onQuestionsChange(updated);
    } catch {
      toast.error('Failed to save quiz');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveEdit = async (idx: number, updated: AiQuizQuestion) => {
    const next = questions.map((q, i) => (i === idx ? updated : q));
    await persist(next);
    setEditingIdx(null);
  };

  const handleDelete = async (idx: number) => {
    if (!confirm('Delete this question?')) return;
    await persist(questions.filter((_, i) => i !== idx));
    if (editingIdx === idx) setEditingIdx(null);
  };

  const handleAddQuestion = async () => {
    if (!newQ.question.trim()) { toast.error('Question text is required'); return; }
    if (newQ.options.some((o) => !o.trim())) { toast.error('All 4 options are required'); return; }
    await persist([...questions, newQ]);
    setNewQ(emptyQuestion());
    setAddingNew(false);
  };

  const handleGenerate = async () => {
    setGenerating(true);
    try {
      await onGenerateQuiz(topicId);
      // parent will update initialQuestions → useEffect will sync
    } finally {
      setGenerating(false);
    }
  };

  // Edit state per question
  const [editDrafts, setEditDrafts] = useState<Record<number, AiQuizQuestion>>({});
  const startEdit = (idx: number) => {
    setEditDrafts((d) => ({ ...d, [idx]: { ...questions[idx] } }));
    setEditingIdx(idx);
  };
  const cancelEdit = () => setEditingIdx(null);

  return (
    <div className='fixed inset-0 z-50 flex items-center justify-center p-2.5 sm:p-4'>
      <div className='absolute inset-0 bg-black/40 backdrop-blur-sm' onClick={onClose} />
      <div className='relative bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[88vh] flex flex-col overflow-hidden'>
        {/* Header */}
        <div className='flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2.5 px-4 sm:px-6 py-3 sm:py-4 border-b border-slate-100 shrink-0'>
          <div className='min-w-0'>
            <h2 className='text-sm sm:text-base font-bold text-slate-800'>Unit Quiz</h2>
            <p className='text-xs text-slate-400 mt-0.5 truncate max-w-sm'>{topicTitle}</p>
          </div>
          <div className='flex items-center gap-1.5 sm:gap-2 shrink-0 flex-wrap'>
            {canEdit && (
              <button
                onClick={handleGenerate}
                disabled={generating || saving}
                className='flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 text-xs font-semibold text-indigo-600 bg-indigo-50 hover:bg-indigo-100 rounded-lg disabled:opacity-50 transition-colors min-h-[32px]'
              >
                {generating ? <Loader2 className='w-3.5 h-3.5 animate-spin' /> : <Sparkles className='w-3.5 h-3.5' />}
                <span>{questions.length > 0 ? 'Regenerate All' : 'Generate Questions'}</span>
              </button>
            )}
            {saving && <Loader2 className='w-4 h-4 animate-spin text-indigo-400' />}
            <button onClick={onClose} className='p-1.5 hover:bg-slate-100 rounded-lg text-slate-400 transition-colors min-h-[32px] min-w-[32px] flex items-center justify-center'>
              <X className='w-4 h-4' />
            </button>
          </div>
        </div>

        {/* Question list */}
        <div className='overflow-y-auto flex-1 px-4 sm:px-6 py-3 sm:py-4 space-y-3 custom-scrollbar'>
          {questions.length === 0 && !addingNew && (
            <div className='py-12 text-center'>
              <p className='text-xs sm:text-[13px] text-slate-400'>No questions yet.</p>
              {canEdit && (
                <p className='text-xs text-slate-300 mt-1'>
                  Click "Generate Questions" or "Add Question" to get started.
                </p>
              )}
            </div>
          )}

          {questions.map((q, idx) => (
            <div key={idx} className='border border-slate-200 rounded-2xl overflow-hidden shadow-xs'>
              {editingIdx === idx ? (
                /* Edit mode */
                <div className='p-3.5 sm:p-4 bg-indigo-50/30'>
                  <QuestionForm
                    q={editDrafts[idx] ?? q}
                    onChange={(updated) => setEditDrafts((d) => ({ ...d, [idx]: updated }))}
                  />
                  <div className='flex justify-end gap-2 mt-3'>
                    <button onClick={cancelEdit} className='px-3 py-1.5 text-xs font-semibold text-slate-500 hover:text-slate-700 transition-colors min-h-[32px]'>
                      Cancel
                    </button>
                    <button
                      onClick={() => handleSaveEdit(idx, editDrafts[idx] ?? q)}
                      disabled={saving}
                      className='flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors min-h-[32px]'
                    >
                      {saving ? <Loader2 className='w-3 h-3 animate-spin' /> : null}
                      <span>Save Question</span>
                    </button>
                  </div>
                </div>
              ) : (
                /* View mode */
                <div className='p-3.5 sm:p-4'>
                  <div className='flex items-start gap-2 mb-3'>
                    <span className='text-[10px] font-bold text-indigo-500 bg-indigo-50 border border-indigo-100 rounded px-1.5 py-0.5 shrink-0 mt-0.5'>
                      Q{idx + 1}
                    </span>
                    <p className='text-xs sm:text-[13px] font-semibold text-slate-800 flex-1'>{q.question}</p>
                    {canEdit && (
                      <div className='flex items-center gap-1 shrink-0'>
                        <button
                          onClick={() => startEdit(idx)}
                          className='px-2 py-1 text-[11px] font-semibold text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 rounded transition-colors min-h-[28px]'
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => handleDelete(idx)}
                          className='p-1 text-slate-300 hover:text-red-400 transition-colors min-h-[28px]'
                        >
                          <Trash2 className='w-3.5 h-3.5' />
                        </button>
                      </div>
                    )}
                  </div>
                  <div className='grid grid-cols-1 sm:grid-cols-2 gap-1.5'>
                    {q.options.map((opt, oi) => (
                      <div
                        key={oi}
                        className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs sm:text-[12px] ${
                          oi === q.correct_index
                            ? 'bg-green-50 text-green-700 font-semibold border border-green-200'
                            : 'bg-slate-50 text-slate-600 border border-slate-100'
                        }`}
                      >
                        <CheckCircle2 className={`w-3.5 h-3.5 shrink-0 ${oi === q.correct_index ? 'text-green-500' : 'text-slate-200'}`} />
                        <span className='truncate'>{opt}</span>
                      </div>
                    ))}
                  </div>
                  {q.explanation && (
                    <p className='mt-2.5 text-[11px] text-blue-600 bg-blue-50 rounded-xl px-3 py-2 border border-blue-100'>
                      {q.explanation}
                    </p>
                  )}
                </div>
              )}
            </div>
          ))}

          {/* Add new question form */}
          {addingNew && (
            <div className='border-2 border-indigo-200 rounded-2xl p-3.5 sm:p-4 bg-indigo-50/20'>
              <p className='text-[11px] font-bold text-indigo-500 uppercase tracking-wide mb-3'>New Question</p>
              <QuestionForm q={newQ} onChange={setNewQ} />
              <div className='flex justify-end gap-2 mt-3'>
                <button onClick={() => { setAddingNew(false); setNewQ(emptyQuestion()); }} className='px-3 py-1.5 text-xs font-semibold text-slate-500 hover:text-slate-700 transition-colors min-h-[32px]'>
                  Cancel
                </button>
                <button
                  onClick={handleAddQuestion}
                  disabled={saving}
                  className='flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors min-h-[32px]'
                >
                  {saving ? <Loader2 className='w-3 h-3 animate-spin' /> : <Plus className='w-3 h-3' />}
                  <span>Add Question</span>
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        {canEdit && !addingNew && (
          <div className='border-t border-slate-100 px-4 sm:px-6 py-3 shrink-0'>
            <button
              onClick={() => { setAddingNew(true); setEditingIdx(null); }}
              className='flex items-center gap-2 px-4 py-2 text-xs sm:text-[13px] font-semibold text-indigo-600 border-2 border-dashed border-indigo-200 rounded-xl hover:bg-indigo-50 transition-colors w-full justify-center min-h-[38px]'
            >
              <Plus className='w-4 h-4' /> <span>Add Question</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
