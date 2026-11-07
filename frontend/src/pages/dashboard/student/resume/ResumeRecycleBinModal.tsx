import { useState, useEffect, useMemo } from 'react';
import {
  Trash2,
  RotateCcw,
  Search,
  X,
  AlertTriangle,
  Loader2,
  Calendar,
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import apiClient from '@/services/api';
import { cn } from '@/lib/utils';
import { getCategoryConfig } from './types';
import type { ResumeCategory } from './types';

export interface RecycledResumeItem {
  id: string;
  title: string;
  schema_version: number;
  version: number;
  is_primary: boolean;
  template_id?: string;
  category?: ResumeCategory;
  target_role?: string;
  deleted_at: string;
  created_at?: string;
  updated_at?: string;
}

interface ResumeRecycleBinModalProps {
  open: boolean;
  onClose: () => void;
  onRestored: (restored: RecycledResumeItem) => void;
  onListUpdated?: () => void;
}

export default function ResumeRecycleBinModal({
  open,
  onClose,
  onRestored,
  onListUpdated,
}: ResumeRecycleBinModalProps) {
  const [items, setItems] = useState<RecycledResumeItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [restoringId, setRestoringId] = useState<string | null>(null);
  const [destroyingId, setDestroyingId] = useState<string | null>(null);
  const [itemToDestroy, setItemToDestroy] = useState<RecycledResumeItem | null>(null);
  const [confirmEmptyBin, setConfirmEmptyBin] = useState(false);
  const [emptying, setEmptying] = useState(false);

  const fetchRecycleBin = async () => {
    try {
      setLoading(true);
      const res = await apiClient.get('/assistant/resumes/bin');
      if (res.data?.success) {
        setItems(res.data.data || []);
      }
    } catch {
      toast.error('Failed to load resume recycle bin.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) {
      fetchRecycleBin();
      setSearchQuery('');
      setItemToDestroy(null);
      setConfirmEmptyBin(false);
    }
  }, [open]);

  const filteredItems = useMemo(() => {
    if (!searchQuery.trim()) return items;
    const q = searchQuery.toLowerCase();
    return items.filter(
      (item) =>
        (item.title || '').toLowerCase().includes(q) ||
        (item.target_role || '').toLowerCase().includes(q) ||
        (item.category || '').toLowerCase().includes(q)
    );
  }, [items, searchQuery]);

  const getDaysRemaining = (deletedAt: string) => {
    const deletedDate = new Date(deletedAt);
    const purgeDate = new Date(deletedDate.getTime() + 30 * 24 * 60 * 60 * 1000);
    const diffMs = purgeDate.getTime() - Date.now();
    const days = Math.max(0, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));
    return days;
  };

  const handleRestore = async (item: RecycledResumeItem) => {
    try {
      setRestoringId(item.id);
      const res = await apiClient.patch(`/assistant/resume/${item.id}/restore`);
      if (res.data?.success) {
        setItems((prev) => prev.filter((r) => r.id !== item.id));
        toast.success(`"${item.title}" restored to your active resumes!`);
        onRestored(res.data.data || item);
        onListUpdated?.();
      }
    } catch {
      toast.error('Failed to restore resume.');
    } finally {
      setRestoringId(null);
    }
  };

  const handleDestroyPermanent = async () => {
    if (!itemToDestroy) return;
    try {
      setDestroyingId(itemToDestroy.id);
      const res = await apiClient.delete(`/assistant/resume/${itemToDestroy.id}/destroy`);
      if (res.data?.success) {
        setItems((prev) => prev.filter((r) => r.id !== itemToDestroy.id));
        toast.success(`"${itemToDestroy.title}" permanently destroyed.`);
        setItemToDestroy(null);
        onListUpdated?.();
      }
    } catch {
      toast.error('Failed to delete resume permanently.');
    } finally {
      setDestroyingId(null);
    }
  };

  const handleEmptyBin = async () => {
    try {
      setEmptying(true);
      const res = await apiClient.delete('/assistant/resumes/bin/empty');
      if (res.data?.success) {
        setItems([]);
        setConfirmEmptyBin(false);
        toast.success('Recycle bin emptied successfully.');
        onListUpdated?.();
      }
    } catch {
      toast.error('Failed to empty recycle bin.');
    } finally {
      setEmptying(false);
    }
  };

  if (!open) return null;

  return (
    <div className='fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 animate-in fade-in-50'>
      <div className='bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col overflow-hidden'>
        {/* Header */}
        <div className='flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50/70'>
          <div className='flex items-center gap-2.5'>
            <div className='w-8 h-8 rounded-lg bg-red-100 text-red-600 flex items-center justify-center shadow-2xs'>
              <Trash2 size={16} />
            </div>
            <div>
              <div className='flex items-center gap-2'>
                <h3 className='font-bold text-slate-900 text-base'>Resume Recycle Bin</h3>
                <span className='px-2 py-0.2 rounded-full text-xs font-bold bg-slate-200 text-slate-700'>
                  {items.length}
                </span>
              </div>
              <p className='text-xs text-slate-500'>
                Deleted resumes stay here for 30 days before permanent deletion.
              </p>
            </div>
          </div>

          <div className='flex items-center gap-2'>
            {items.length > 0 && (
              <button
                type='button'
                onClick={() => setConfirmEmptyBin(true)}
                className='px-2.5 py-1 text-xs font-semibold text-red-600 hover:text-red-700 hover:bg-red-50 border border-red-200 rounded-lg transition-colors cursor-pointer'
              >
                Empty Bin
              </button>
            )}
            <button
              type='button'
              onClick={onClose}
              className='p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer'
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Search Bar */}
        {items.length > 0 && (
          <div className='px-6 py-3 border-b border-slate-100 bg-white'>
            <div className='relative'>
              <Search size={14} className='absolute left-3 top-1/2 -translate-y-1/2 text-slate-400' />
              <input
                type='text'
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder='Search deleted resumes by title or role...'
                className='w-full pl-9 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-1.5 focus:ring-[#333d7c] focus:bg-white transition-all placeholder:text-slate-400'
              />
            </div>
          </div>
        )}

        {/* List of Deleted Resumes */}
        <div className='flex-1 overflow-y-auto p-6 space-y-3'>
          {loading ? (
            <div className='py-12 flex flex-col items-center justify-center gap-2 text-slate-400'>
              <Loader2 size={24} className='animate-spin text-[#333d7c]' />
              <p className='text-xs font-medium'>Loading recycle bin...</p>
            </div>
          ) : items.length === 0 ? (
            <div className='py-14 text-center space-y-3'>
              <div className='w-12 h-12 rounded-full bg-slate-100 text-slate-400 mx-auto flex items-center justify-center'>
                <Trash2 size={22} />
              </div>
              <div>
                <p className='text-sm font-bold text-slate-800'>Your Recycle Bin is empty</p>
                <p className='text-xs text-slate-500 mt-0.5 max-w-sm mx-auto'>
                  Any resume you delete will be safely stored here first so you can recover it anytime.
                </p>
              </div>
            </div>
          ) : filteredItems.length === 0 ? (
            <div className='py-8 text-center text-xs text-slate-500'>
              No deleted resumes matching "{searchQuery}".
            </div>
          ) : (
            filteredItems.map((item) => {
              const catConfig = getCategoryConfig(item.category || 'general');
              const daysLeft = getDaysRemaining(item.deleted_at);
              const isRestoring = restoringId === item.id;
              const isDestroying = destroyingId === item.id;

              return (
                <div
                  key={item.id}
                  className='p-4 border border-slate-200 rounded-xl bg-white hover:border-slate-300 transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-2xs'
                >
                  <div className='space-y-1.5 min-w-0'>
                    <div className='flex items-center gap-2 flex-wrap'>
                      <h4 className='text-xs font-bold text-slate-900 truncate max-w-xs'>
                        {item.title}
                      </h4>
                      <span
                        className={cn(
                          'px-1.5 py-0.2 rounded text-[9.5px] font-bold border shrink-0',
                          catConfig.badgeBg,
                          catConfig.badgeText
                        )}
                      >
                        {catConfig.shortName}
                      </span>
                      <span className='px-1.5 py-0.2 rounded text-[9.5px] font-medium bg-slate-100 text-slate-600 border border-slate-200 shrink-0'>
                        v{item.version}
                      </span>
                    </div>

                    <div className='flex items-center gap-3 text-[11px] text-slate-500 flex-wrap'>
                      <span className='flex items-center gap-1'>
                        <Calendar size={12} className='text-slate-400' />
                        Deleted {new Date(item.deleted_at).toLocaleDateString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                      </span>
                      <span
                        className={cn(
                          'px-1.5 py-0.2 rounded text-[10px] font-semibold',
                          daysLeft <= 5
                            ? 'bg-red-50 text-red-700 border border-red-200'
                            : 'bg-amber-50 text-amber-700 border border-amber-200'
                        )}
                      >
                        {daysLeft} days remaining
                      </span>
                    </div>
                  </div>

                  <div className='flex items-center gap-2 shrink-0 self-end sm:self-auto'>
                    <button
                      type='button'
                      onClick={() => handleRestore(item)}
                      disabled={isRestoring || isDestroying}
                      className='inline-flex items-center gap-1 px-3 py-1.5 text-xs font-bold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 rounded-lg transition-colors disabled:opacity-50 cursor-pointer shadow-2xs'
                      title='Restore this resume to your active list'
                    >
                      {isRestoring ? (
                        <Loader2 size={13} className='animate-spin' />
                      ) : (
                        <RotateCcw size={13} />
                      )}
                      <span>Restore</span>
                    </button>

                    <button
                      type='button'
                      onClick={() => setItemToDestroy(item)}
                      disabled={isRestoring || isDestroying}
                      className='inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-red-600 hover:text-red-700 hover:bg-red-50 border border-red-200 rounded-lg transition-colors disabled:opacity-50 cursor-pointer'
                      title='Permanently destroy this resume'
                    >
                      <Trash2 size={13} />
                      <span className='hidden sm:inline'>Destroy</span>
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className='px-6 py-3 border-t border-slate-100 bg-slate-50 flex items-center justify-between text-xs text-slate-500'>
          <span>Each student's recycle bin is private and isolated to their account.</span>
          <button
            type='button'
            onClick={onClose}
            className='px-3 py-1.5 text-xs font-semibold text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer shadow-2xs'
          >
            Close
          </button>
        </div>
      </div>

      {/* Confirmation Modal: Destroy Single Resume */}
      {itemToDestroy && (
        <div className='fixed inset-0 z-60 bg-black/60 backdrop-blur-2xs flex items-center justify-center p-4 animate-in fade-in-50'>
          <div className='bg-white rounded-xl shadow-2xl max-w-md w-full p-5 space-y-4 border border-slate-200'>
            <div className='flex items-start gap-3'>
              <div className='w-9 h-9 rounded-full bg-red-100 text-red-600 flex items-center justify-center shrink-0'>
                <AlertTriangle size={18} />
              </div>
              <div>
                <h4 className='text-sm font-bold text-slate-900'>Permanently Destroy Resume?</h4>
                <p className='text-xs text-slate-500 mt-1'>
                  Are you sure you want to permanently delete <strong className='text-slate-800'>{itemToDestroy.title}</strong>? This action cannot be undone.
                </p>
              </div>
            </div>

            <div className='flex items-center justify-end gap-2 pt-2 border-t border-slate-100'>
              <button
                type='button'
                onClick={() => setItemToDestroy(null)}
                className='px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer'
              >
                Cancel
              </button>
              <button
                type='button'
                onClick={handleDestroyPermanent}
                disabled={Boolean(destroyingId)}
                className='inline-flex items-center gap-1 px-3 py-1.5 text-xs font-bold text-white bg-red-600 hover:bg-red-700 rounded-lg transition-colors cursor-pointer shadow-2xs disabled:opacity-50'
              >
                {destroyingId ? <Loader2 size={13} className='animate-spin' /> : <Trash2 size={13} />}
                <span>Permanently Destroy</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirmation Modal: Empty Entire Bin */}
      {confirmEmptyBin && (
        <div className='fixed inset-0 z-60 bg-black/60 backdrop-blur-2xs flex items-center justify-center p-4 animate-in fade-in-50'>
          <div className='bg-white rounded-xl shadow-2xl max-w-md w-full p-5 space-y-4 border border-slate-200'>
            <div className='flex items-start gap-3'>
              <div className='w-9 h-9 rounded-full bg-red-100 text-red-600 flex items-center justify-center shrink-0'>
                <AlertTriangle size={18} />
              </div>
              <div>
                <h4 className='text-sm font-bold text-slate-900'>Empty Resume Recycle Bin?</h4>
                <p className='text-xs text-slate-500 mt-1'>
                  This will permanently destroy all <strong className='text-slate-800'>{items.length}</strong> deleted resumes in your Recycle Bin. None of them will be recoverable.
                </p>
              </div>
            </div>

            <div className='flex items-center justify-end gap-2 pt-2 border-t border-slate-100'>
              <button
                type='button'
                onClick={() => setConfirmEmptyBin(false)}
                className='px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer'
              >
                Cancel
              </button>
              <button
                type='button'
                onClick={handleEmptyBin}
                disabled={emptying}
                className='inline-flex items-center gap-1 px-3 py-1.5 text-xs font-bold text-white bg-red-600 hover:bg-red-700 rounded-lg transition-colors cursor-pointer shadow-2xs disabled:opacity-50'
              >
                {emptying ? <Loader2 size={13} className='animate-spin' /> : <Trash2 size={13} />}
                <span>Empty Recycle Bin</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
