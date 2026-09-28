import { Button } from '@/components/ui/button';
import { Save, X } from 'lucide-react';
import { useState, useEffect } from 'react';
import toast from 'react-hot-toast';

interface CapstoneModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: { title: string; instructions: string }) => void;
  editData?: { title: string; instructions?: string | null };
  topicTitle: string;
  loading?: boolean;
}

const CapstoneModal: React.FC<CapstoneModalProps> = ({
  isOpen,
  onClose,
  onSave,
  editData,
  topicTitle,
  loading = false,
}) => {
  const [title, setTitle] = useState(editData?.title ?? '');
  const [instructions, setInstructions] = useState(
    editData?.instructions ?? '',
  );

  useEffect(() => {
    if (isOpen) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setTitle(editData?.title ?? '');
      setInstructions(editData?.instructions ?? '');
    }
  }, [isOpen, editData]);

  const handleSave = () => {
    if (!title.trim()) {
      toast.error('Capstone title is required');
      return;
    }
    onSave({ title: title.trim(), instructions: instructions.trim() });
  };

  if (!isOpen) return null;

  return (
    <div className='fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-3 sm:p-4 backdrop-blur-xs'>
      <div className='w-[94vw] sm:max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl bg-white p-4 sm:p-6 shadow-xl'>
        <div className='mb-4 flex items-center justify-between'>
          <div>
            <h3 className='text-lg font-bold text-slate-900'>
              {editData ? 'Edit Capstone Project' : 'Add Capstone Project'}
            </h3>
            <p className='text-sm text-slate-500'>Topic: {topicTitle}</p>
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
              Project Title
            </label>
            <input
              type='text'
              autoFocus
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder='e.g., Build a Full-Stack Todo App'
              className='w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200'
            />
          </div>

          <div>
            <label className='mb-2 block text-sm font-medium text-slate-700'>
              Instructions
            </label>
            <textarea
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              placeholder={`Describe what the student needs to build, requirements, deliverables, and evaluation criteria...\n\nSupports markdown formatting.`}
              rows={8}
              className='w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200 resize-none'
            />
            <p className='mt-1 text-xs text-slate-400'>
              Supports markdown. Awards 20 XP on submission.
            </p>
          </div>
        </div>

        <div className='mt-6 flex gap-3'>
          <Button
            onClick={onClose}
            className='flex-1 border border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
          >
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            loading={loading}
            className='flex-1 bg-blue-500 text-white hover:bg-blue-600'
          >
            {!loading && <Save className='mr-2 h-4 w-4' />}
            {editData ? 'Update' : 'Add'} Capstone
          </Button>
        </div>
      </div>
    </div>
  );
};

export default CapstoneModal;
