import { Fragment, useEffect, useMemo, useState } from 'react';
import { X, ExternalLink, FileText, Loader2, Search, ChevronLeft, ChevronRight, Building2 } from 'lucide-react';
import apiClient from '@/services/api';
import toast from 'react-hot-toast';
import { cn, getErrorMessage } from '@/lib/utils';
import { Button } from '@/components/ui/button';

type Submission = {
  id: string;
  student_name: string;
  student_email: string;
  college_name?: string;
  submission_link?: string;
  submission_file_url?: string;
  submission_file_name?: string;
  submitted_at: string;
};

type Props = {
  open: boolean;
  onClose: () => void;
  assignmentId: string;
  assignmentTitle: string;
};

export default function SubmissionsModal({ open, onClose, assignmentId, assignmentTitle }: Props) {
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 10;

  useEffect(() => {
    if (!open || !assignmentId) return;
    let cancelled = false;
    setLoading(true);
    setSearchQuery('');
    setCurrentPage(1);
    apiClient
      .get(`/college-assignments/submissions/${assignmentId}`)
      .then((res) => { if (!cancelled) setSubmissions(res.data.data || []); })
      .catch((err) => { if (!cancelled) toast.error(getErrorMessage(err, 'Failed to load submissions')); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [open, assignmentId]);

  const filtered = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    return submissions.filter(
      (s) =>
        s.student_name.toLowerCase().includes(q) ||
        s.student_email.toLowerCase().includes(q) ||
        (s.college_name && s.college_name.toLowerCase().includes(q)),
    );
  }, [submissions, searchQuery]);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const paginated = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filtered.slice(start, start + pageSize);
  }, [filtered, currentPage, pageSize]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-2xs flex items-center justify-center z-50 p-3 sm:p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[85vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="flex items-center justify-between px-4 sm:px-5 py-3.5 border-b border-slate-100">
          <div className="min-w-0 flex-1 mr-3">
            <h2 className="font-bold text-slate-900 text-sm sm:text-base tracking-tight">Student Submissions</h2>
            <p className="text-xs text-slate-500 mt-0.5 truncate">{assignmentTitle}</p>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition"
          >
            <X size={18} />
          </button>
        </div>

        {/* Search Bar */}
        <div className="relative px-4 sm:px-5 py-2.5 border-b border-slate-100 bg-slate-50/60">
          <Search className="absolute left-7 sm:left-8 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder="Search by student name, email, or college..."
            className="w-full pl-9 pr-3 py-1.5 text-xs sm:text-sm bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-400 min-h-[36px]"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-3 sm:p-5">
          {loading ? (
            <div className="flex items-center justify-center py-16 text-slate-400 text-xs sm:text-sm">
              <Loader2 size={20} className="animate-spin mr-2 text-blue-600" />
              Loading submissions...
            </div>
          ) : submissions.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-slate-400 gap-2">
              <FileText size={32} className="opacity-30" />
              <p className="text-xs sm:text-sm">No submissions yet for this assignment.</p>
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-slate-400 gap-2">
              <Search size={28} className="opacity-30" />
              <p className="text-xs sm:text-sm">No matching submissions found.</p>
            </div>
          ) : (
            <div className="border border-slate-100 rounded-xl overflow-hidden bg-white shadow-2xs">
              {/* Mobile Card View (< sm): Zero horizontal scroll */}
              <div className="sm:hidden divide-y divide-slate-100">
                {paginated.map((s) => (
                  <div key={s.id} className="p-3 space-y-2 bg-white">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="font-bold text-xs text-slate-900 truncate">{s.student_name}</p>
                        <p className="text-[11px] text-slate-500 truncate mt-0.5">{s.student_email}</p>
                      </div>
                      <span className="text-[10px] text-slate-400 shrink-0 font-medium">
                        {s.submitted_at ? new Date(s.submitted_at).toLocaleDateString('en-GB') : '—'}
                      </span>
                    </div>

                    <div className="flex items-center justify-between gap-2 text-[11px] bg-slate-50/80 p-2 rounded-lg border border-slate-100">
                      <div className="flex items-center gap-1.5 text-slate-700 min-w-0 flex-1">
                        <Building2 className="w-3 h-3 text-slate-400 shrink-0" />
                        <span className="truncate">{s.college_name || 'No College'}</span>
                      </div>
                      <div className="shrink-0">
                        {s.submission_link ? (
                          <a
                            href={s.submission_link}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-700 font-bold text-xs bg-blue-50 px-2 py-1 rounded-md"
                          >
                            <ExternalLink size={11} /> View Link
                          </a>
                        ) : s.submission_file_url ? (
                          <a
                            href={s.submission_file_url}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 text-indigo-600 hover:text-indigo-700 font-bold text-xs bg-indigo-50 px-2 py-1 rounded-md"
                          >
                            <FileText size={11} /> File
                          </a>
                        ) : (
                          <span className="text-slate-300 text-xs">—</span>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Desktop View (>= sm): Full Table */}
              <div className="hidden sm:block overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs text-slate-500 uppercase bg-slate-50/70 border-b border-slate-100">
                      <th className="py-2.5 px-4 font-semibold">Student</th>
                      <th className="py-2.5 px-4 font-semibold">College</th>
                      <th className="py-2.5 px-4 font-semibold">Submitted</th>
                      <th className="py-2.5 px-4 font-semibold text-right">Submission</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {paginated.map((s) => (
                      <tr key={s.id} className="hover:bg-slate-50/60 transition">
                        <td className="py-3 px-4">
                          <div className="font-semibold text-slate-900 text-xs sm:text-sm">{s.student_name}</div>
                          <div className="text-[11px] text-slate-500">{s.student_email}</div>
                        </td>
                        <td className="py-3 px-4 text-slate-600 text-xs">{s.college_name || '—'}</td>
                        <td className="py-3 px-4 text-slate-500 text-xs whitespace-nowrap">
                          {s.submitted_at ? new Date(s.submitted_at).toLocaleDateString('en-GB') : '—'}
                        </td>
                        <td className="py-3 px-4 text-right">
                          {s.submission_link ? (
                            <a
                              href={s.submission_link}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-700 text-xs font-semibold hover:underline"
                            >
                              <ExternalLink size={12} /> View Link
                            </a>
                          ) : s.submission_file_url ? (
                            <a
                              href={s.submission_file_url}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-1 text-indigo-600 hover:text-indigo-700 text-xs font-semibold hover:underline"
                            >
                              <FileText size={12} /> {s.submission_file_name || 'Download'}
                            </a>
                          ) : (
                            <span className="text-slate-300 text-xs">—</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* Footer with Pagination */}
        <div className="px-4 sm:px-5 py-3 border-t border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-2.5 bg-slate-50/80">
          <p className="text-[11px] sm:text-xs text-slate-500 font-medium">
            Showing <span className="font-bold text-slate-800">{(currentPage - 1) * pageSize + 1}</span> to{' '}
            <span className="font-bold text-slate-800">{Math.min(currentPage * pageSize, filtered.length)}</span> of{' '}
            <span className="font-bold text-slate-800">{filtered.length}</span> submissions
          </p>

          {totalPages > 1 && (
            <div className="flex items-center gap-1.5">
              <Button
                variant="outline"
                size="sm"
                disabled={currentPage <= 1}
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                className="rounded-lg h-7 px-2 text-xs text-slate-700 bg-white shadow-2xs hover:bg-slate-50"
              >
                <ChevronLeft className="h-3.5 w-3.5 mr-0.5" />
                Prev
              </Button>

              <div className="flex items-center gap-1 mx-0.5">
                {Array.from({ length: totalPages }, (_, i) => i + 1)
                  .filter((p) => p === 1 || p === totalPages || Math.abs(p - currentPage) <= 1)
                  .map((p, idx, arr) => (
                    <Fragment key={p}>
                      {idx > 0 && arr[idx - 1] !== p - 1 && (
                        <span className="text-slate-300 text-xs px-0.5 select-none">...</span>
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
                variant="outline"
                size="sm"
                disabled={currentPage >= totalPages}
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                className="rounded-lg h-7 px-2 text-xs text-slate-700 bg-white shadow-2xs hover:bg-slate-50"
              >
                Next
                <ChevronRight className="h-3.5 w-3.5 ml-0.5" />
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
