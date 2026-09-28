import { Fragment, useEffect, useMemo, useState } from 'react';
import { Loader2, RotateCcw, Trash2, X, Search, ChevronLeft, ChevronRight } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import toast from 'react-hot-toast';
import { cn, getErrorMessage } from '@/lib/utils';
import apiClient from '@/services/api';

interface DeletedUser {
  id: string;
  full_name: string;
  email: string;
  role: string;
  deleted_at: string;
  deleted_by_name?: string | null;
}

interface RecycleBinModalProps {
  open: boolean;
  onClose: () => void;
  apiPrefix: 'admin' | 'facilitator';
  onRestored: () => void;
}

export default function RecycleBinModal({
  open,
  onClose,
  apiPrefix,
  onRestored,
}: RecycleBinModalProps) {
  const [users, setUsers] = useState<DeletedUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 10;

  const endpointPrefix = apiPrefix === 'admin' ? '/users' : '/facilitator/students';

  const fetchBin = async () => {
    try {
      setLoading(true);
      const res = await apiClient.get<{ success: boolean; data: DeletedUser[] }>(
        `${endpointPrefix}/bin`
      );
      setUsers(res.data.data || []);
    } catch (error) {
      toast.error('Failed to load recycle bin');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) {
      fetchBin();
      setSearchQuery('');
      setCurrentPage(1);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery]);

  const filteredUsers = useMemo(() => {
    return users.filter((user) =>
      user.full_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      user.email.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [users, searchQuery]);

  const totalPages = Math.max(1, Math.ceil(filteredUsers.length / pageSize));
  const paginatedUsers = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredUsers.slice(start, start + pageSize);
  }, [filteredUsers, currentPage, pageSize]);

  const getDaysRemaining = (deletedAt: string) => {
    const deletedDate = new Date(deletedAt);
    const purgeDate = new Date(deletedDate.getTime() + 30 * 24 * 60 * 60 * 1000);
    const diffMs = purgeDate.getTime() - Date.now();
    const days = Math.max(0, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));
    return days;
  };

  const handleRestore = async (id: string) => {
    try {
      setProcessingId(id);
      await apiClient.post(`${endpointPrefix}/${id}/restore`);
      toast.success('User restored successfully');
      setUsers((prev) => prev.filter((u) => u.id !== id));
      onRestored();
    } catch (error) {
      toast.error(getErrorMessage(error, 'Failed to restore user'));
    } finally {
      setProcessingId(null);
    }
  };

  const handlePermanentDelete = async (id: string) => {
    if (!window.confirm('Are you absolutely sure? This will instantly destroy all of their submissions and progress FOREVER. This cannot be undone.')) {
      return;
    }
    try {
      setProcessingId(id);
      await apiClient.delete(`${endpointPrefix}/${id}/permanent`);
      toast.success('User permanently deleted');
      setUsers((prev) => prev.filter((u) => u.id !== id));
    } catch (error) {
      toast.error(getErrorMessage(error, 'Failed to delete permanently'));
    } finally {
      setProcessingId(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(val) => !val && onClose()}>
      <DialogContent className='w-[95vw] sm:max-w-3xl max-h-[85vh] overflow-hidden flex flex-col p-4 sm:p-6 rounded-2xl'>
        <DialogHeader className='flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-3 border-b border-slate-100'>
          <DialogTitle className='text-lg sm:text-xl font-bold flex items-center gap-2 text-slate-900'>
            <Trash2 className="h-5 w-5 text-red-500 shrink-0" />
            <span>Recycle Bin</span>
          </DialogTitle>
          <div className='relative w-full sm:w-64 sm:mr-6'>
            <Search className='absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400' />
            <input
              type='text'
              placeholder='Search by name or email...'
              className='h-9 w-full rounded-xl border border-slate-200 bg-white pl-9 pr-3 text-xs sm:text-sm placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-400'
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </DialogHeader>
        <div className='flex-1 overflow-y-auto -mx-4 sm:-mx-6 px-4 sm:px-6 py-2'>
          {loading ? (
            <div className='py-12 flex justify-center'>
              <Loader2 className='h-8 w-8 animate-spin text-slate-300' />
            </div>
          ) : users.length === 0 ? (
            <div className='py-12 text-center text-slate-500 text-xs sm:text-sm'>
              The recycle bin is empty.
            </div>
          ) : filteredUsers.length === 0 ? (
            <div className='py-12 text-center text-slate-500 text-xs sm:text-sm'>
              No matching users found.
            </div>
          ) : (
            <div className="border border-slate-100 rounded-xl overflow-hidden bg-white shadow-2xs">
              {/* Mobile View (< sm): Responsive Cards with NO horizontal scroll */}
              <div className='sm:hidden divide-y divide-slate-100'>
                {paginatedUsers.map((user) => {
                  const days = getDaysRemaining(user.deleted_at);
                  const isCritical = days <= 7;
                  return (
                    <div key={user.id} className='p-3.5 space-y-2.5 bg-white'>
                      <div className='flex items-start justify-between gap-2'>
                        <div className='min-w-0 flex-1'>
                          <p className='font-bold text-xs text-slate-900 truncate'>{user.full_name}</p>
                          <p className='text-[11px] text-slate-500 truncate mt-0.5'>{user.email}</p>
                          {user.deleted_by_name && (
                            <p className='text-[10px] text-slate-400 mt-0.5 italic truncate'>
                              Deleted by {user.deleted_by_name}
                            </p>
                          )}
                        </div>
                        <Badge variant="outline" className="capitalize text-[10px] shrink-0 h-5 px-1.5 font-semibold">
                          {user.role}
                        </Badge>
                      </div>

                      <div className='flex items-center justify-between gap-2 text-[11px] text-slate-500 bg-slate-50/80 p-2 rounded-lg border border-slate-100'>
                        <span>
                          {new Date(user.deleted_at).toLocaleDateString('en-GB', {
                            day: '2-digit', month: 'short', year: 'numeric',
                          })}
                        </span>
                        <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold border ${
                          isCritical 
                            ? 'bg-amber-50 text-amber-700 border-amber-200' 
                            : 'bg-white text-slate-600 border-slate-200'
                        }`}>
                          {isCritical ? '⚠️ ' : ''}{days} {days === 1 ? 'day' : 'days'} left
                        </span>
                      </div>

                      <div className='flex items-center gap-2 pt-1'>
                        <Button
                          variant='outline'
                          size='sm'
                          className='flex-1 h-8 text-xs font-semibold text-emerald-700 bg-emerald-50/70 border-emerald-200 hover:bg-emerald-100'
                          disabled={processingId === user.id}
                          onClick={() => handleRestore(user.id)}
                        >
                          {processingId === user.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5 mr-1" />}
                          Restore
                        </Button>
                        <Button
                          variant='outline'
                          size='sm'
                          className='flex-1 h-8 text-xs font-semibold text-red-700 bg-red-50/70 border-red-200 hover:bg-red-100'
                          disabled={processingId === user.id}
                          onClick={() => handlePermanentDelete(user.id)}
                        >
                          {processingId === user.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <X className="h-3.5 w-3.5 mr-1" />}
                          Destroy
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Desktop View (>= sm): Full Table */}
              <div className='hidden sm:block overflow-x-auto'>
                <Table>
                  <TableHeader className="bg-slate-50/50">
                    <TableRow>
                      <TableHead>User</TableHead>
                      <TableHead>Role</TableHead>
                      <TableHead>Deleted On</TableHead>
                      <TableHead className='text-center'>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {paginatedUsers.map((user) => (
                      <TableRow key={user.id}>
                        <TableCell>
                          <p className='font-medium text-slate-900'>{user.full_name}</p>
                          <p className='text-xs text-slate-500'>{user.email}</p>
                          {user.deleted_by_name && (
                            <p className='text-[10px] text-slate-400 mt-1 italic'>
                              Deleted by {user.deleted_by_name}
                            </p>
                          )}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="capitalize">{user.role}</Badge>
                        </TableCell>
                        <TableCell>
                          <div className='text-sm text-slate-600'>
                            {new Date(user.deleted_at).toLocaleDateString('en-GB', {
                              day: '2-digit', month: 'short', year: 'numeric',
                            })}
                          </div>
                          {(() => {
                            const days = getDaysRemaining(user.deleted_at);
                            const isCritical = days <= 7;
                            return (
                              <div className='mt-1'>
                                <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium border ${
                                  isCritical 
                                    ? 'bg-amber-50 text-amber-700 border-amber-200' 
                                    : 'bg-slate-50 text-slate-600 border-slate-200'
                                }`}>
                                  {isCritical ? '⚠️ ' : ''}{days} {days === 1 ? 'day' : 'days'} left
                                </span>
                              </div>
                            );
                          })()}
                        </TableCell>
                        <TableCell className='text-center'>
                          <Button
                            variant='ghost'
                            size='sm'
                            className='h-8 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 mr-2'
                            disabled={processingId === user.id}
                            onClick={() => handleRestore(user.id)}
                          >
                            {processingId === user.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4 mr-1" />}
                            Restore
                          </Button>
                          <Button
                            variant='ghost'
                            size='sm'
                            className='h-8 text-red-600 hover:text-red-700 hover:bg-red-50'
                            disabled={processingId === user.id}
                            onClick={() => handlePermanentDelete(user.id)}
                          >
                            {processingId === user.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <X className="h-4 w-4 mr-1" />}
                            Destroy
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {/* Pagination Bar */}
              {filteredUsers.length > 0 && totalPages > 1 && (
                <div className='flex flex-col sm:flex-row items-center justify-between gap-2.5 px-4 py-2.5 bg-slate-50/80 border-t border-slate-100'>
                  <p className='text-[11px] sm:text-xs text-slate-500 font-medium'>
                    Showing <span className='font-bold text-slate-800'>{(currentPage - 1) * pageSize + 1}</span> to{' '}
                    <span className='font-bold text-slate-800'>{Math.min(currentPage * pageSize, filteredUsers.length)}</span> of{' '}
                    <span className='font-bold text-slate-800'>{filteredUsers.length}</span> items
                  </p>

                  <div className='flex items-center gap-1.5'>
                    <Button
                      variant='outline'
                      size='sm'
                      disabled={currentPage <= 1}
                      onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                      className='rounded-lg h-7 px-2 text-xs text-slate-700 bg-white shadow-2xs hover:bg-slate-50'
                    >
                      <ChevronLeft className='h-3.5 w-3.5 mr-0.5' />
                      Prev
                    </Button>

                    <div className='flex items-center gap-1 mx-0.5'>
                      {Array.from({ length: totalPages }, (_, i) => i + 1)
                        .filter((p) => p === 1 || p === totalPages || Math.abs(p - currentPage) <= 1)
                        .map((p, idx, arr) => (
                          <Fragment key={p}>
                            {idx > 0 && arr[idx - 1] !== p - 1 && (
                              <span className='text-slate-300 text-xs px-0.5 select-none'>...</span>
                            )}
                            <button
                              onClick={() => setCurrentPage(p)}
                              className={cn(
                                'w-6 h-6 rounded-md text-xs font-bold transition-all flex items-center justify-center',
                                currentPage === p
                                  ? 'bg-[#1e2653] text-white shadow-xs'
                                  : 'text-slate-600 bg-white border border-slate-200 hover:bg-slate-100',
                              )}
                            >
                              {p}
                            </button>
                          </Fragment>
                        ))}
                    </div>

                    <Button
                      variant='outline'
                      size='sm'
                      disabled={currentPage >= totalPages}
                      onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                      className='rounded-lg h-7 px-2 text-xs text-slate-700 bg-white shadow-2xs hover:bg-slate-50'
                    >
                      Next
                      <ChevronRight className='h-3.5 w-3.5 ml-0.5' />
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
