import { Button } from '@/components/ui/button';
import type { TopicModalProps } from '@/utils/types';
import { Save, X } from 'lucide-react';
import { useState, useEffect } from 'react';
import toast from 'react-hot-toast';

const TopicModal: React.FC<TopicModalProps> = ({
  isOpen,
  onClose,
  onSave,
  editData,
  loading = false,
}) => {
  const [title, setTitle] = useState(editData?.title || '');
  const [description, setDescription] = useState(editData?.description || '');

  useEffect(() => {
    if (isOpen) {
      setTitle(editData?.title || '');
      setDescription(editData?.description || '');
    }
  }, [isOpen, editData]);

  const handleSave = () => {
    if (!title.trim()) {
      toast.error('Topic title is required');
      return;
    }
    onSave({ title: title.trim(), description: description.trim() });
    setTitle('');
    setDescription('');
  };

  if (!isOpen) return null;

  return (
    <div className='fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-3 sm:p-4 backdrop-blur-xs'>
      <div className='w-[94vw] sm:max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl bg-white p-4 sm:p-6 shadow-xl'>
        <div className='mb-4 flex items-center justify-between'>
          <h3 className='text-lg font-bold text-slate-900'>
            {editData ? 'Edit Topic' : 'Add New Topic'}
          </h3>
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
              Topic Title
            </label>
            <input
              type='text'
              autoFocus
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder='e.g., Introduction to Arrays'
              className='w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200'
            />
          </div>

          <div>
            <label className='mb-2 block text-sm font-medium text-slate-700'>
              Description (Optional)
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder='Brief description of this topic...'
              rows={3}
              className='w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200'
            />
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
            className='flex-1 bg-indigo-600 text-white hover:bg-indigo-700'
          >
            {!loading && <Save className='mr-2 h-4 w-4' />}
            {editData ? 'Update' : 'Create'} Topic
          </Button>
        </div>
      </div>
    </div>
  );
};

export default TopicModal;
