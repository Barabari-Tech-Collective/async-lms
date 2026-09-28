import { useState, useEffect } from 'react';
import StatusBadge from './StatusBadge';
import { Eye, FileText } from 'lucide-react';
import SubmissionsModal from './SubmissionsModal';
import apiClient from '@/services/api';
import { getErrorMessage } from '@/lib/utils';
import toast from 'react-hot-toast';
import { Skeleton } from '@/components/ui/skeleton';
import { Link } from 'react-router';

type Props = {
  search: string;
  selectedCollege: string;
  selectedDomain: string;
  selectedBatch: string;
};

type Assignment = {
  id: string;
  title: string;
  course?: string;
  college_name?: string;
  type: 'unit' | 'college';
  batches_count?: number;
  submissions_count?: number;
  status: string;
  evaluation_id?: string;
};

const PAGE_SIZE = 10;

const EvaluationTable = ({
  search,
  selectedCollege,
  selectedDomain,
  selectedBatch,
}: Props) => {
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [submissionsOpen, setSubmissionsOpen] = useState(false);
  const [submissionsAssignment, setSubmissionsAssignment] = useState({
    id: '',
    title: '',
  });
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);

  const fetchAssignments = async () => {
    try {
      setLoading(true);
      const params: Record<string, string | number> = {
        page,
        pageSize: PAGE_SIZE,
      };
      if (selectedCollege) params.collegeId = selectedCollege;
      if (selectedDomain) params.domain = selectedDomain;
      if (selectedBatch) params.batch = selectedBatch;
      if (search) params.search = search;

      const res = await apiClient.get(
        '/college-assignments/evaluation-filters',
        { params },
      );
      if (res.data.success) {
        setAssignments(res.data.data);
        setTotalPages(res.data.pagination?.totalPages ?? 1);
        setTotal(res.data.pagination?.total ?? res.data.data.length);
      }
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to fetch assignments'));
    } finally {
      setLoading(false);
    }
  };

  // Reset to page 1 whenever filters/search change (a filter change can
  // easily land the current page past the new, smaller result set).
  useEffect(() => {
    setPage(1);
  }, [search, selectedCollege, selectedDomain, selectedBatch]);

  useEffect(() => {
    fetchAssignments();
  }, [search, selectedCollege, selectedDomain, selectedBatch, page]);

  if (loading) {
    return (
      <div className='mt-6 bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden'>
        <div className='grid grid-cols-8 gap-4 px-4 py-3 border-b'>
          {[...Array(8)].map((_, i) => (
            <Skeleton key={i} className='h-3 w-full' />
          ))}
        </div>
        {[...Array(5)].map((_, i) => (
          <div
            key={i}
            className='grid grid-cols-8 gap-4 px-4 py-4 border-b border-slate-100 items-center'
          >
            <Skeleton className='h-4 w-6' />
            <Skeleton className='h-4 w-full col-span-2' />
            <Skeleton className='h-4 w-full' />
            <Skeleton className='h-4 w-full' />
            <Skeleton className='h-4 w-8' />
            <Skeleton className='h-6 w-20 rounded-full' />
            <Skeleton className='h-8 w-20 rounded ml-auto' />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className='mt-4 sm:mt-6 bg-white border border-slate-200 rounded-2xl shadow-xs overflow-hidden min-w-0'>
      {/* Mobile View (< md): Clean Responsive Cards with NO horizontal scroll */}
      <div className='md:hidden divide-y divide-slate-100'>
        {assignments.length === 0 ? (
          <div className='py-12 text-center text-slate-500 text-xs sm:text-sm'>
            No assignments found matching filters.
          </div>
        ) : (
          assignments.map((item, index) => (
            <div
              key={`${item.id}-${item.evaluation_id ?? 'none'}-${index}`}
              className='p-3.5 space-y-2.5 bg-white'
            >
              {/* Header: #, Title, Type & Status */}
              <div className='flex items-start justify-between gap-2'>
                <div className='min-w-0 flex-1 flex items-start gap-2'>
                  <span className='text-[11px] font-extrabold text-slate-400 mt-0.5 shrink-0'>
                    #{(page - 1) * PAGE_SIZE + index + 1}
                  </span>
                  <div className='min-w-0 flex-1'>
                    <p className='font-bold text-xs sm:text-sm text-slate-900 line-clamp-2 leading-snug'>
                      {item.title}
                    </p>
                  </div>
                </div>
                <div className='flex items-center gap-1.5 shrink-0'>
                  <span
                    className={`px-1.5 py-0.5 rounded text-[9px] font-extrabold uppercase ${
                      item.type === 'unit'
                        ? 'bg-indigo-100 text-indigo-700'
                        : 'bg-amber-100 text-amber-700'
                    }`}
                  >
                    {item.type === 'unit' ? 'Curriculum' : 'College'}
                  </span>
                  <StatusBadge status={item.status} />
                </div>
              </div>

              {/* Details Sub-box */}
              <div className='text-[11px] bg-slate-50/80 p-2.5 rounded-lg border border-slate-100 space-y-1'>
                <div className='flex items-center justify-between gap-2'>
                  <span className='font-semibold text-slate-800 truncate'>
                    {item.course || 'General Domain'}
                  </span>
                  {item.college_name && (
                    <span className='text-slate-500 font-medium shrink-0 max-w-[140px] truncate' title={item.college_name}>
                      {item.college_name}
                    </span>
                  )}
                </div>
                <div className='flex items-center justify-between gap-2 pt-1 border-t border-slate-200/50 text-slate-500'>
                  <span className='font-medium text-slate-700'>
                    <span className='font-bold text-slate-900'>{item.submissions_count ?? 0}</span> Submissions
                  </span>
                  {item.batches_count !== undefined && item.batches_count > 0 && (
                    <span className='text-slate-400'>
                      {item.batches_count} Batches
                    </span>
                  )}
                </div>
              </div>

              {/* Action Bar */}
              <div className='flex items-center justify-end gap-2 pt-1 border-t border-slate-50'>
                <button
                  onClick={() => {
                    setSubmissionsAssignment({
                      id: item.id,
                      title: item.title,
                    });
                    setSubmissionsOpen(true);
                  }}
                  className='inline-flex items-center gap-1 text-xs text-slate-700 bg-slate-100 hover:bg-slate-200 px-2.5 py-1.5 rounded-lg font-medium transition'
                  title='View student submissions'
                >
                  <Eye size={13} /> Submissions
                </button>
                <Link
                  to={`/dashboard/facilitator/results/${item.id}`}
                  className='inline-flex items-center gap-1 text-xs text-blue-600 bg-blue-50 hover:bg-blue-100 font-semibold px-2.5 py-1.5 rounded-lg transition'
                  title='View Evaluation Results'
                >
                  <FileText size={14} /> View Results
                </Link>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Desktop Table View (>= md) */}
      <div className='hidden md:block overflow-x-auto custom-scrollbar w-full min-w-0'>
        <table className='w-full min-w-[780px] text-xs sm:text-sm border-separate border-spacing-0'>
          <thead className='text-slate-500 text-[11px] sm:text-[12px] uppercase bg-slate-50/60'>
            <tr>
              <th className='px-3.5 sm:px-4 py-3 text-left font-semibold'>#</th>
              <th className='px-3.5 sm:px-4 py-3 text-left font-semibold'>
                Assignment Name
              </th>
              <th className='px-3.5 sm:px-4 py-3 text-left font-semibold'>Type</th>
              <th className='px-3.5 sm:px-4 py-3 text-left font-semibold'>
                Course / Domain
              </th>
              <th className='px-3.5 sm:px-4 py-3 text-left font-semibold'>Colleges</th>
              <th className='px-3.5 sm:px-4 py-3 text-left font-semibold'>Submissions</th>
              <th className='px-3.5 sm:px-4 py-3 text-left font-semibold'>Status</th>
              <th className='px-3.5 sm:px-4 py-3 text-right font-semibold'>Action</th>
            </tr>
          </thead>

          <tbody className='[&>tr:first-child]:border-t-0'>
            {assignments.map((item, index) => (
              <tr
                key={`${item.id}-${item.evaluation_id ?? 'none'}-${index}`}
                className='border-t border-slate-100 hover:bg-slate-50/60 transition'
              >
                <td className='px-3.5 sm:px-4 py-3 text-slate-500 text-xs sm:text-sm'>
                  {index + 1}
                </td>
                <td className='px-3.5 sm:px-4 py-3 font-medium text-slate-800 text-xs sm:text-sm'>
                  {item.title}
                </td>
                <td className='px-3.5 sm:px-4 py-3'>
                  <span
                    className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                      item.type === 'unit'
                        ? 'bg-indigo-100 text-indigo-700'
                        : 'bg-amber-100 text-amber-700'
                    }`}
                  >
                    {item.type === 'unit' ? 'Curriculum' : 'College'}
                  </span>
                </td>
                <td className='px-3.5 sm:px-4 py-3 text-slate-500 text-xs sm:text-sm'>
                  {item.course}
                </td>
                <td className='px-3.5 sm:px-4 py-3 text-slate-700 text-xs sm:text-sm'>
                  {item.college_name}
                </td>
                <td className='px-3.5 sm:px-4 py-3 text-slate-700 font-medium text-xs sm:text-sm'>
                  {item.submissions_count}
                </td>
                <td className='px-3.5 sm:px-4 py-3'>
                  <div className='flex flex-col gap-1'>
                    <StatusBadge status={item.status} />
                  </div>
                </td>
                <td className='px-3.5 sm:px-4 py-3 text-right'>
                  <div className='flex items-center justify-end gap-1.5 sm:gap-2'>
                    <button
                      onClick={() => {
                        setSubmissionsAssignment({
                          id: item.id,
                          title: item.title,
                        });
                        setSubmissionsOpen(true);
                      }}
                      className='inline-flex items-center gap-1 text-xs text-slate-600 hover:text-slate-800 border border-slate-200 rounded-lg px-2.5 py-1.5 transition hover:bg-slate-50 min-h-[30px]'
                      title='View student submissions'
                    >
                      <Eye size={13} /> Submissions
                    </button>
                    <Link
                      to={`/dashboard/facilitator/results/${item.id}`}
                      className='inline-flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 font-semibold px-2.5 py-1.5 rounded-lg hover:bg-blue-50 transition min-h-[30px]'
                      title='View Evaluation Results'
                    >
                      <FileText size={14} /> View Results
                    </Link>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {assignments.length > 0 && (
        <div className='flex flex-col sm:flex-row items-center justify-between gap-3 px-3.5 sm:px-4 py-3 border-t border-slate-100 text-xs sm:text-sm'>
          <span className='text-slate-500 text-center sm:text-left'>
            Showing {(page - 1) * PAGE_SIZE + 1}–
            {Math.min(page * PAGE_SIZE, total)} of {total}
          </span>
          <div className='flex items-center gap-2'>
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
              className='px-3 py-1.5 rounded-lg border border-slate-200 text-slate-600 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-50 min-h-[32px]'
            >
              Previous
            </button>
            <span className='text-slate-500 px-1 font-medium'>
              Page {page} of {totalPages}
            </span>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
              className='px-3 py-1.5 rounded-lg border border-slate-200 text-slate-600 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-50 min-h-[32px]'
            >
              Next
            </button>
          </div>
        </div>
      )}


      <SubmissionsModal
        key={submissionsAssignment.id}
        open={submissionsOpen}
        onClose={() => setSubmissionsOpen(false)}
        assignmentId={submissionsAssignment.id}
        assignmentTitle={submissionsAssignment.title}
      />
    </div>
  );
};

export default EvaluationTable;
