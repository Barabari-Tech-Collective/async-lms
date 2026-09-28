import { Button } from '@/components/ui/button';
import type { QuizModalProps } from '@/utils/types';
import { Save, X } from 'lucide-react';
import { useState, useEffect } from 'react';

const DEFAULT_PASSING_SCORE = 70;

// Whole numbers only, 1-100 — mirrors the backend's validation
// (admin.controller.js createQuiz/updateQuiz).
const validatePassingScore = (raw: string): string | null => {
  if (raw.trim() === '') return 'Passing threshold is required';
  if (!/^\d+$/.test(raw.trim())) {
    return 'Enter a whole number, no decimals or symbols';
  }
  const value = Number(raw);
  if (value < 1 || value > 100) {
    return 'Passing threshold must be between 1 and 100';
  }
  return null;
};

const QuizModal: React.FC<QuizModalProps> = ({
  isOpen,
  onClose,
  onSave,
  editData,
  unitTitle,
  loading = false,
}) => {
  const [passingScoreInput, setPassingScoreInput] = useState(
    String(editData?.passing_score ?? DEFAULT_PASSING_SCORE),
  );
  const [touched, setTouched] = useState(false);

  const error = validatePassingScore(passingScoreInput);

  const handleSave = () => {
    setTouched(true);
    if (error) return;
    onSave({
      passing_score: Number(passingScoreInput),
      max_score: 100,
    });
    setPassingScoreInput(String(DEFAULT_PASSING_SCORE));
    setTouched(false);
  };

  useEffect(() => {
    if (isOpen) {
      setPassingScoreInput(
        String(editData?.passing_score ?? DEFAULT_PASSING_SCORE),
      );
      setTouched(false);
    }
  }, [isOpen, editData]);

  if (!isOpen) return null;

  return (
    <div className='fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-3 sm:p-4 backdrop-blur-xs'>
      <div className='w-[94vw] sm:max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl bg-white p-4 sm:p-6 shadow-xl'>
        <div className='mb-4 flex items-center justify-between'>
          <div>
            <h3 className='text-lg font-bold text-slate-900'>
              {editData ? 'Update' : 'Create'} Quiz
            </h3>
            <p className='text-sm text-slate-500'>Unit: {unitTitle}</p>
          </div>
          <button
            onClick={onClose}
            className='text-slate-400 hover:text-slate-600'
          >
            <X className='h-5 w-5' />
          </button>
        </div>

        <div className='space-y-4'>
          <div>
            <label className='mb-2 block text-sm font-medium text-slate-700'>
              Passing Threshold (%)
            </label>
            <div className='relative'>
              <input
                type='number'
                autoFocus
                value={passingScoreInput}
                onChange={(e) => setPassingScoreInput(e.target.value)}
                onBlur={() => setTouched(true)}
                placeholder='70'
                min='1'
                max='100'
                step='1'
                aria-invalid={touched && !!error}
                className={`w-full rounded-lg border px-3 py-2 pr-8 outline-none focus:ring-2 ${
                  touched && error
                    ? 'border-red-400 focus:border-red-500 focus:ring-red-100'
                    : 'border-slate-300 focus:border-indigo-500 focus:ring-indigo-200'
                }`}
              />
              <span className='pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-slate-400'>
                %
              </span>
            </div>
            {touched && error ? (
              <p className='mt-1 text-xs font-medium text-red-500'>{error}</p>
            ) : (
              <p className='mt-1 text-xs text-slate-500'>
                Students must score at least {passingScoreInput || 0}% of a
                quiz's total points to pass. Points are set per-question when
                adding questions — there's no separate max score to keep in
                sync.
              </p>
            )}
          </div>
        </div>

        <div className='mt-6 flex gap-3'>
          <Button
            onClick={onClose}
            disabled={loading}
            className='flex-1 border border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
          >
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            loading={loading}
            disabled={!!error && touched}
            className='flex-1 bg-indigo-600 text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50'
          >
            {!loading && <Save className='mr-2 h-4 w-4' />}
            {editData ? 'Update' : 'Create'} Quiz
          </Button>
        </div>
      </div>
    </div>
  );
};

export default QuizModal;
