import { useEffect, useState, useCallback, Fragment } from 'react';
import {
  Loader2,
  Check,
  X,
  Search,
  Clock,
  CheckCircle2,
  XCircle,
  RotateCcw,
  ChevronLeft,
  ChevronRight,
  Building2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import apiClient from '@/services/api';
import toast from 'react-hot-toast';
import { getErrorMessage, cn } from '@/lib/utils';

export interface EnrollmentRequestItem {
  id: string;
  user_id: string;
  subject_id: string;
  status: 'pending' | 'approved' | 'rejected';
  rejection_reason: string | null;
  created_at: string;
  reviewed_at: string | null;
  student_name: string;
  student_email: string;
  degree: string | null;
  batch: number | null;
  college_id: string | null;
  college_name: string | null;
  college_short_name: string | null;
  subject_name: string;
  subject_slug: string;
  reviewer_name: string | null;
}

interface Props {
  apiPrefix: 'admin' | 'facilitator';
  onRequestCountChange?: (count: number) => void;
}

const PAGE_SIZE = 10;

export default function EnrollmentRequestsPanel({ apiPrefix, onRequestCountChange }: Props) {
  const [requests, setRequests] = useState<EnrollmentRequestItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState<'pending' | 'approved' | 'rejected' | 'all'>('pending');
  const [searchQuery, setSearchQuery] = useState('');
  const [totalCount, setTotalCount] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);

  // Review states
  const [rejectTarget, setRejectTarget] = useState<EnrollmentRequestItem | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');
  const [submittingAction, setSubmittingAction] = useState(false);

  const fetchRequests = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiClient.get<{ success: boolean; data: EnrollmentRequestItem[]; total: number }>(
        `/${apiPrefix}/enrollment-requests`,
        {
          params: {
            status: statusFilter,
            search: searchQuery.trim() || undefined,
            limit: PAGE_SIZE,
            offset: (currentPage - 1) * PAGE_SIZE,
          },
        },
      );
      setRequests(res.data.data ?? []);
      setTotalCount(res.data.total ?? 0);
      if (statusFilter === 'pending' && onRequestCountChange) {
        onRequestCountChange(res.data.total ?? 0);
      }
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to fetch enrollment requests'));
    } finally {
      setLoading(false);
    }
  }, [apiPrefix, statusFilter, searchQuery, currentPage, onRequestCountChange]);

  useEffect(() => {
    fetchRequests();
  }, [fetchRequests]);

  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

  const handleApprove = async (item: EnrollmentRequestItem) => {
    setSubmittingAction(true);
    try {
      await apiClient.patch(`/${apiPrefix}/enrollment-requests/${item.id}`, {
        status: 'approved',
      });
      toast.success(`Approved ${item.student_name} for ${item.subject_name}`);
      if (requests.length === 1 && currentPage > 1) {
        setCurrentPage((p) => p - 1);
      } else {
        fetchRequests();
      }
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to approve enrollment request'));
    } finally {
      setSubmittingAction(false);
    }
  };

  const handleRejectConfirm = async () => {
    if (!rejectTarget) return;
    setSubmittingAction(true);
    try {
      await apiClient.patch(`/${apiPrefix}/enrollment-requests/${rejectTarget.id}`, {
        status: 'rejected',
        rejection_reason: rejectionReason.trim() || undefined,
      });
      toast.success(`Rejected request for ${rejectTarget.subject_name}`);
      setRejectTarget(null);
      setRejectionReason('');
      if (requests.length === 1 && currentPage > 1) {
        setCurrentPage((p) => p - 1);
      } else {
        fetchRequests();
      }
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to reject enrollment request'));
    } finally {
      setSubmittingAction(false);
    }
  };

  return (
    <div className='space-y-4'>
      {/* Controls row */}
      <div className='flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3'>
        <div className='flex items-center gap-2 flex-1 max-w-md'>
          <div className='relative flex-1'>
            <Search className='absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400' />
            <Input
              placeholder='Search by student or course...'
              className='pl-9 bg-white text-xs sm:text-sm h-10 border-slate-200'
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setCurrentPage(1);
              }}
            />
          </div>
          <Button
            variant='outline'
            size='icon'
            onClick={() => {
              setCurrentPage(1);
              fetchRequests();
            }}
            title='Refresh'
            className='h-10 w-10 border-slate-200 bg-white shrink-0'
          >
            <RotateCcw className={`h-4 w-4 text-slate-500 ${loading ? 'animate-spin' : ''}`} />
          </Button>
        </div>

        {/* Status filter pills */}
        <div className='flex items-center gap-1 bg-slate-100 p-1 rounded-xl w-full sm:w-auto overflow-x-auto no-scrollbar shrink-0'>
          {(['pending', 'approved', 'rejected', 'all'] as const).map((st) => (
            <button
              key={st}
              onClick={() => {
                setStatusFilter(st);
                setCurrentPage(1);
              }}
              className={`flex-1 sm:flex-initial px-3 py-1.5 rounded-lg text-xs font-semibold capitalize transition-colors text-center ${
                statusFilter === st
                  ? 'bg-white text-slate-900 shadow-2xs'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              {st}
            </button>
          ))}
        </div>
      </div>

      {/* Main Table / List */}
      <Card className='border-slate-200 bg-white overflow-hidden shadow-2xs min-w-0'>
        {loading ? (
          <div className='py-20 flex flex-col items-center justify-center gap-2'>
            <Loader2 className='h-7 w-7 animate-spin text-[#333D7C]' />
            <p className='text-xs text-slate-400'>Loading enrollment requests...</p>
          </div>
        ) : requests.length === 0 ? (
          <div className='py-16 text-center space-y-2 px-4'>
            <Clock className='h-8 w-8 text-slate-300 mx-auto' />
            <p className='text-sm font-semibold text-slate-700'>No {statusFilter !== 'all' ? statusFilter : ''} requests found</p>
            <p className='text-xs text-slate-400 max-w-sm mx-auto'>
              When students request to enroll in an additional subject, their requests will appear here for your approval.
            </p>
          </div>
        ) : (
          <>
            {/* Mobile View (< md): Stacked Clean Cards */}
            <div className='md:hidden divide-y divide-slate-100'>
              {requests.map((item) => (
                <div key={item.id} className='p-3.5 space-y-2.5 bg-white'>
                  {/* Header: Student name, email, and Status */}
                  <div className='flex items-start justify-between gap-2'>
                    <div className='min-w-0 flex-1'>
                      <p className='font-bold text-xs sm:text-sm text-slate-900 truncate'>{item.student_name}</p>
                      <p className='text-[11px] text-slate-400 truncate mt-0.5'>{item.student_email}</p>
                    </div>
                    {item.status === 'pending' && (
                      <Badge className='bg-amber-50 text-amber-700 border-amber-200 gap-1 text-[10px] font-semibold shrink-0'>
                        <Clock size={11} />
                        Pending
                      </Badge>
                    )}
                    {item.status === 'approved' && (
                      <Badge className='bg-emerald-50 text-emerald-700 border-emerald-200 gap-1 text-[10px] font-semibold shrink-0'>
                        <CheckCircle2 size={11} />
                        Approved
                      </Badge>
                    )}
                    {item.status === 'rejected' && (
                      <Badge className='bg-red-50 text-red-700 border-red-200 gap-1 text-[10px] font-semibold shrink-0'>
                        <XCircle size={11} />
                        Rejected
                      </Badge>
                    )}
                  </div>

                  {/* Course Banner */}
                  <div className='flex items-center gap-2'>
                    <span className='text-[10px] uppercase font-bold text-slate-400 tracking-wider shrink-0'>
                      Course:
                    </span>
                    <span className='font-semibold text-xs text-[#333D7C] bg-[#333D7C]/10 px-2.5 py-1 rounded-md line-clamp-1'>
                      {item.subject_name}
                    </span>
                  </div>

                  {/* College & Degree/Batch */}
                  <div className='text-[11px] bg-slate-50/80 p-2.5 rounded-lg border border-slate-100 space-y-1.5'>
                    <div className='flex items-center gap-1.5 text-slate-800 font-semibold'>
                      <Building2 className='w-3.5 h-3.5 text-indigo-500 shrink-0' />
                      <span className='line-clamp-1 leading-tight' title={item.college_name || undefined}>
                        {item.college_short_name || item.college_name || 'No College Assigned'}
                      </span>
                    </div>
                    <div className='flex flex-wrap items-center gap-1.5 text-slate-500 pt-1 border-t border-slate-200/50 text-[10px]'>
                      <span className='font-medium text-slate-700'>{item.degree || 'Degree N/A'}</span>
                      {item.batch && (
                        <>
                          <span className='text-slate-300'>•</span>
                          <span className='text-slate-600 font-medium'>Batch {item.batch}</span>
                        </>
                      )}
                      <span className='text-slate-300'>•</span>
                      <span>
                        {new Date(item.created_at).toLocaleDateString('en-GB', {
                          day: '2-digit',
                          month: 'short',
                          year: 'numeric',
                        })}
                      </span>
                    </div>
                  </div>

                  {/* Review Notes (if any) */}
                  {item.status === 'rejected' && item.rejection_reason && (
                    <div className='text-[11px] text-red-600 bg-red-50/70 border border-red-100 rounded-lg p-2 italic'>
                      Reason: "{item.rejection_reason}"
                    </div>
                  )}
                  {item.status === 'approved' && item.reviewer_name && (
                    <div className='text-[10px] text-slate-400'>
                      Reviewed by <span className='font-medium text-slate-600'>{item.reviewer_name}</span>
                    </div>
                  )}

                  {/* Actions for mobile (if pending) */}
                  {item.status === 'pending' && (
                    <div className='flex items-center gap-2 pt-1 border-t border-slate-50'>
                      <Button
                        size='sm'
                        disabled={submittingAction}
                        onClick={() => handleApprove(item)}
                        className='flex-1 h-8 text-xs bg-emerald-600 hover:bg-emerald-700 text-white gap-1 font-semibold cursor-pointer'
                      >
                        <Check size={13} />
                        Approve
                      </Button>
                      <Button
                        size='sm'
                        variant='outline'
                        disabled={submittingAction}
                        onClick={() => {
                          setRejectTarget(item);
                          setRejectionReason('');
                        }}
                        className='flex-1 h-8 text-xs border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700 gap-1 font-semibold cursor-pointer'
                      >
                        <X size={13} />
                        Reject
                      </Button>
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Desktop View (>= md): Full Table */}
            <div className='hidden md:block overflow-x-auto'>
              <table className='w-full text-left text-sm'>
                <thead className='bg-slate-50 border-b border-slate-200 text-[11px] font-bold uppercase tracking-wider text-slate-500'>
                  <tr>
                    <th className='py-3 px-4'>Student</th>
                    <th className='py-3 px-4'>College & Batch</th>
                    <th className='py-3 px-4'>Requested Course</th>
                    <th className='py-3 px-4'>Requested On</th>
                    <th className='py-3 px-4'>Status</th>
                    <th className='py-3 px-4 text-right'>Action</th>
                  </tr>
                </thead>
                <tbody className='divide-y divide-slate-100'>
                  {requests.map((item) => (
                    <tr key={item.id} className='hover:bg-slate-50/80 transition-colors'>
                      <td className='py-3.5 px-4'>
                        <div className='font-semibold text-slate-900 text-xs sm:text-sm'>{item.student_name}</div>
                        <div className='text-[11px] text-slate-400'>{item.student_email}</div>
                      </td>
                      <td className='py-3.5 px-4'>
                        <div className='text-xs text-slate-700 font-medium truncate max-w-44' title={item.college_name || ''}>
                          {item.college_short_name || item.college_name || 'N/A'}
                        </div>
                        <div className='text-[10px] text-slate-400'>
                          {item.degree || 'Degree'} {item.batch ? `• Batch ${item.batch}` : ''}
                        </div>
                      </td>
                      <td className='py-3.5 px-4'>
                        <span className='font-semibold text-xs text-[#333D7C] bg-[#333D7C]/10 px-2.5 py-1 rounded-md'>
                          {item.subject_name}
                        </span>
                      </td>
                      <td className='py-3.5 px-4 text-xs text-slate-500 whitespace-nowrap'>
                        {new Date(item.created_at).toLocaleDateString('en-GB', {
                          day: '2-digit',
                          month: 'short',
                          year: 'numeric',
                        })}
                      </td>
                      <td className='py-3.5 px-4'>
                        {item.status === 'pending' && (
                          <Badge className='bg-amber-50 text-amber-700 border-amber-200 gap-1 text-[10px] font-semibold'>
                            <Clock size={11} />
                            Pending
                          </Badge>
                        )}
                        {item.status === 'approved' && (
                          <div className='space-y-0.5'>
                            <Badge className='bg-emerald-50 text-emerald-700 border-emerald-200 gap-1 text-[10px] font-semibold'>
                              <CheckCircle2 size={11} />
                              Approved
                            </Badge>
                            {item.reviewer_name && (
                              <p className='text-[10px] text-slate-400'>by {item.reviewer_name}</p>
                            )}
                          </div>
                        )}
                        {item.status === 'rejected' && (
                          <div className='space-y-0.5'>
                            <Badge className='bg-red-50 text-red-700 border-red-200 gap-1 text-[10px] font-semibold'>
                              <XCircle size={11} />
                              Rejected
                            </Badge>
                            {item.rejection_reason && (
                              <p className='text-[10px] text-slate-500 italic max-w-48 truncate' title={item.rejection_reason}>
                                "{item.rejection_reason}"
                              </p>
                            )}
                          </div>
                        )}
                      </td>
                      <td className='py-3.5 px-4 text-right'>
                        {item.status === 'pending' ? (
                          <div className='flex items-center justify-end gap-1.5'>
                            <Button
                              size='sm'
                              disabled={submittingAction}
                              onClick={() => handleApprove(item)}
                              className='h-8 px-2.5 text-xs bg-emerald-600 hover:bg-emerald-700 text-white gap-1 font-semibold'
                            >
                              <Check size={13} />
                              Approve
                            </Button>
                            <Button
                              size='sm'
                              variant='outline'
                              disabled={submittingAction}
                              onClick={() => {
                                setRejectTarget(item);
                                setRejectionReason('');
                              }}
                              className='h-8 px-2.5 text-xs border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700 gap-1 font-semibold'
                            >
                              <X size={13} />
                              Reject
                            </Button>
                          </div>
                        ) : (
                          <span className='text-xs text-slate-400 italic'>Reviewed</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        {/* Pagination Controls */}
        {!loading && totalCount > 0 && (
          <div className='flex flex-col sm:flex-row items-center justify-between gap-3 px-3 sm:px-4 py-3 bg-slate-50/70 border-t border-slate-100'>
            <p className='text-[11px] sm:text-xs text-slate-500 font-medium text-center sm:text-left'>
              Showing <span className='font-bold text-slate-800'>{(currentPage - 1) * PAGE_SIZE + 1}</span> to{' '}
              <span className='font-bold text-slate-800'>{Math.min(currentPage * PAGE_SIZE, totalCount)}</span> of{' '}
              <span className='font-bold text-slate-800'>{totalCount}</span> requests
            </p>

            {totalPages > 1 && (
              <div className='flex items-center justify-center gap-1.5 w-full sm:w-auto flex-wrap'>
                <Button
                  variant='outline'
                  size='sm'
                  disabled={currentPage <= 1 || loading}
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  className='rounded-xl h-8 px-2.5 text-xs text-slate-700 bg-white shadow-2xs hover:bg-slate-50 cursor-pointer'
                >
                  <ChevronLeft className='h-3.5 w-3.5 mr-1' />
                  Prev
                </Button>

                {/* Page Number Buttons */}
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
                          disabled={loading}
                          className={cn(
                            'w-7 h-7 rounded-lg text-xs font-bold transition-all flex items-center justify-center cursor-pointer',
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
                  disabled={currentPage >= totalPages || loading}
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  className='rounded-xl h-8 px-2.5 text-xs text-slate-700 bg-white shadow-2xs hover:bg-slate-50 cursor-pointer'
                >
                  Next
                  <ChevronRight className='h-3.5 w-3.5 ml-1' />
                </Button>
              </div>
            )}
          </div>
        )}
      </Card>

      {/* Reject Reason Dialog */}
      <Dialog open={!!rejectTarget} onOpenChange={(open) => !open && setRejectTarget(null)}>
        <DialogContent className='sm:max-w-md'>
          <DialogHeader>
            <DialogTitle>Reject Enrollment Request</DialogTitle>
            <DialogDescription>
              Rejecting <span className='font-semibold text-slate-800'>{rejectTarget?.student_name}</span>'s request for{' '}
              <span className='font-semibold text-slate-800'>{rejectTarget?.subject_name}</span>.
            </DialogDescription>
          </DialogHeader>

          <div className='space-y-2 py-2'>
            <label className='text-xs font-semibold text-slate-700'>Reason for rejection (optional)</label>
            <Input
              placeholder='e.g., Please complete existing coursework first...'
              value={rejectionReason}
              onChange={(e) => setRejectionReason(e.target.value)}
            />
          </div>

          <DialogFooter>
            <Button variant='outline' onClick={() => setRejectTarget(null)} disabled={submittingAction}>
              Cancel
            </Button>
            <Button
              onClick={handleRejectConfirm}
              disabled={submittingAction}
              className='bg-red-600 hover:bg-red-700 text-white'
            >
              {submittingAction && <Loader2 className='w-4 h-4 animate-spin mr-1.5' />}
              Confirm Rejection
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
