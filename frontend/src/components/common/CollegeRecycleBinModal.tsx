import { useEffect, useMemo, useState } from 'react';
import {
  Loader2,
  RotateCcw,
  Trash2,
  X,
  Search,
  ChevronLeft,
  ChevronRight,
  Archive,
  MapPin,
} from 'lucide-react';
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

interface DeletedCollege {
  id: string;
  name: string;
  short_code?: string | null;
  city?: string | null;
  state?: string | null;
  is_verified?: boolean;
  deleted_at: string;
  deleted_by_name?: string | null;
}

interface CollegeRecycleBinModalProps {
  open: boolean;
  onClose: () => void;
  onRestored: () => void;
}

export default function CollegeRecycleBinModal({
  open,
  onClose,
  onRestored,
}: CollegeRecycleBinModalProps) {
  const [colleges, setColleges] = useState<DeletedCollege[]>([]);
  const [loading, setLoading] = useState(true);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 8;

  const fetchBin = async () => {
    try {
      setLoading(true);
      const res = await apiClient.get<{ success: boolean; data: DeletedCollege[] }>(
        '/colleges/bin'
      );
      setColleges(res.data.data || []);
    } catch (error) {
      toast.error('Failed to load colleges recycle bin');
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
  }, [open]);

  const filteredColleges = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return colleges;
    return colleges.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        (c.short_code && c.short_code.toLowerCase().includes(q)) ||
        (c.city && c.city.toLowerCase().includes(q)) ||
        (c.state && c.state.toLowerCase().includes(q)) ||
        (c.deleted_by_name && c.deleted_by_name.toLowerCase().includes(q))
    );
  }, [colleges, searchQuery]);

  const totalPages = Math.max(1, Math.ceil(filteredColleges.length / pageSize));
  const paginatedColleges = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredColleges.slice(start, start + pageSize);
  }, [filteredColleges, currentPage, pageSize]);

  const getDaysRemaining = (deletedAt: string) => {
    const deletedDate = new Date(deletedAt);
    const purgeDate = new Date(deletedDate.getTime() + 30 * 24 * 60 * 60 * 1000);
    const diffMs = purgeDate.getTime() - Date.now();
    return Math.max(0, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));
  };

  const handleRestore = async (college: DeletedCollege) => {
    try {
      setProcessingId(college.id);
      await apiClient.post(`/colleges/${college.id}/restore`);
      toast.success(`"${college.name}" restored successfully`);
      setColleges((prev) => prev.filter((c) => c.id !== college.id));
      onRestored();
    } catch (error) {
      toast.error(getErrorMessage(error, 'Failed to restore college'));
    } finally {
      setProcessingId(null);
    }
  };

  const handlePermanentDelete = async (college: DeletedCollege) => {
    const confirmed = window.confirm(
      `Are you sure you want to permanently delete "${college.name}"? This action cannot be undone and will permanently purge all related assignments, submissions, and facilitator mappings.`
    );
    if (!confirmed) return;

    try {
      setProcessingId(college.id);
      await apiClient.delete(`/colleges/${college.id}/permanent`);
      toast.success(`"${college.name}" permanently deleted`);
      setColleges((prev) => prev.filter((c) => c.id !== college.id));
      onRestored();
    } catch (error) {
      toast.error(getErrorMessage(error, 'Failed to permanently delete college'));
    } finally {
      setProcessingId(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="w-[95vw] sm:max-w-3xl max-h-[85vh] overflow-hidden flex flex-col p-4 sm:p-6 rounded-2xl bg-white border border-slate-200 shadow-xl">
        <DialogHeader className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-3 border-b border-slate-100">
          <div className="pr-8 sm:pr-0">
            <DialogTitle className="text-lg sm:text-xl font-bold flex items-center gap-2 text-slate-900">
              <Archive className="h-5 w-5 text-red-500 shrink-0" />
              <span>Colleges Recycle Bin</span>
            </DialogTitle>
            <p className="text-xs text-slate-500 mt-0.5">
              Deleted institutions are retained for 30 days before being permanently purged.
            </p>
          </div>
          <div className="relative w-full sm:w-64 sm:mr-6">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search deleted colleges..."
              className="h-9 w-full rounded-xl border border-slate-200 bg-white pl-9 pr-8 text-xs sm:text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setCurrentPage(1);
              }}
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </DialogHeader>

        {/* Content */}
        <div className="flex-1 overflow-y-auto -mx-4 sm:-mx-6 px-4 sm:px-6 py-2">
          {loading ? (
            <div className="py-16 flex flex-col items-center justify-center text-slate-400 gap-2">
              <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
              <span className="text-xs">Loading deleted colleges...</span>
            </div>
          ) : colleges.length === 0 ? (
            <div className="py-16 text-center text-slate-400 text-xs sm:text-sm">
              The college recycle bin is empty.
            </div>
          ) : filteredColleges.length === 0 ? (
            <div className="py-16 text-center text-slate-400 text-xs sm:text-sm">
              No matching colleges found in the Recycle Bin.
            </div>
          ) : (
            <div className="border border-slate-100 rounded-xl overflow-hidden bg-white shadow-2xs">
              {/* Mobile View (< sm): Cards */}
              <div className="sm:hidden divide-y divide-slate-100">
                {paginatedColleges.map((c) => {
                  const daysLeft = getDaysRemaining(c.deleted_at);
                  const isCritical = daysLeft <= 7;
                  const isProcessing = processingId === c.id;

                  return (
                    <div key={c.id} className="p-3.5 space-y-2.5 bg-white">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <p className="font-bold text-xs text-slate-900 truncate">{c.name}</p>
                          {(c.city || c.state) && (
                            <p className="text-[11px] text-slate-500 truncate mt-0.5 flex items-center gap-1">
                              <MapPin className="w-3 h-3 text-slate-400 shrink-0" />
                              {c.city || '—'}{c.state ? `, ${c.state}` : ''}
                            </p>
                          )}
                          {c.deleted_by_name && (
                            <p className="text-[10px] text-slate-400 mt-0.5 italic truncate">
                              Deleted by {c.deleted_by_name}
                            </p>
                          )}
                        </div>
                        {c.short_code && (
                          <Badge variant="outline" className="font-mono text-[10px] shrink-0 h-5 px-1.5 uppercase">
                            {c.short_code}
                          </Badge>
                        )}
                      </div>

                      <div className="flex items-center justify-between gap-2 text-[11px] text-slate-500 bg-slate-50/80 p-2 rounded-lg border border-slate-100">
                        <span>
                          {new Date(c.deleted_at).toLocaleDateString('en-GB', {
                            day: '2-digit',
                            month: 'short',
                            year: 'numeric',
                          })}
                        </span>
                        <span
                          className={cn(
                            'inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold border',
                            isCritical
                              ? 'bg-amber-50 text-amber-700 border-amber-200'
                              : 'bg-white text-slate-600 border-slate-200'
                          )}
                        >
                          {isCritical ? '⚠️ ' : ''}{daysLeft} {daysLeft === 1 ? 'day' : 'days'} left
                        </span>
                      </div>

                      <div className="flex items-center gap-2 pt-1">
                        <Button
                          variant="outline"
                          size="sm"
                          className="flex-1 h-8 text-xs font-semibold text-emerald-700 bg-emerald-50/70 border-emerald-200 hover:bg-emerald-100"
                          disabled={isProcessing}
                          onClick={() => handleRestore(c)}
                        >
                          {isProcessing ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <RotateCcw className="h-3.5 w-3.5 mr-1" />
                          )}
                          Restore
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="flex-1 h-8 text-xs font-semibold text-red-700 bg-red-50/70 border-red-200 hover:bg-red-100"
                          disabled={isProcessing}
                          onClick={() => handlePermanentDelete(c)}
                        >
                          {isProcessing ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Trash2 className="h-3.5 w-3.5 mr-1" />
                          )}
                          Destroy
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Desktop View (>= sm): Table */}
              <div className="hidden sm:block overflow-x-auto">
                <Table>
                  <TableHeader className="bg-slate-50/80 text-[11px] uppercase font-semibold text-slate-500">
                    <TableRow>
                      <TableHead className="pl-4">College</TableHead>
                      <TableHead>Location</TableHead>
                      <TableHead>Deleted By</TableHead>
                      <TableHead>Retention</TableHead>
                      <TableHead className="text-right pr-4">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {paginatedColleges.map((c) => {
                      const daysLeft = getDaysRemaining(c.deleted_at);
                      const isCritical = daysLeft <= 7;
                      const isProcessing = processingId === c.id;

                      return (
                        <TableRow key={c.id} className="hover:bg-slate-50/60 transition-colors">
                          <TableCell className="pl-4 py-3">
                            <p className="font-semibold text-xs text-slate-900">{c.name}</p>
                            {c.short_code && (
                              <span className="text-[10px] text-slate-400 uppercase font-mono">
                                {c.short_code}
                              </span>
                            )}
                          </TableCell>
                          <TableCell className="text-xs text-slate-600">
                            {c.city || '—'}{c.state ? `, ${c.state}` : ''}
                          </TableCell>
                          <TableCell className="text-xs text-slate-500">
                            {c.deleted_by_name || 'System Admin'}
                          </TableCell>
                          <TableCell>
                            <span
                              className={cn(
                                'inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold border',
                                isCritical
                                  ? 'bg-amber-50 text-amber-700 border-amber-200'
                                  : 'bg-slate-100 text-slate-600 border-slate-200'
                              )}
                            >
                              {isCritical ? '⚠️ ' : ''}{daysLeft} {daysLeft === 1 ? 'day' : 'days'} left
                            </span>
                          </TableCell>
                          <TableCell className="text-right pr-4">
                            <div className="flex items-center justify-end gap-1.5">
                              <Button
                                variant="ghost"
                                size="sm"
                                disabled={isProcessing}
                                onClick={() => handleRestore(c)}
                                className="h-7 px-2.5 text-xs font-semibold text-emerald-700 hover:text-emerald-800 hover:bg-emerald-50 rounded-lg gap-1"
                              >
                                {isProcessing ? (
                                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                ) : (
                                  <RotateCcw className="w-3.5 h-3.5" />
                                )}
                                Restore
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                disabled={isProcessing}
                                onClick={() => handlePermanentDelete(c)}
                                className="h-7 px-2 text-xs font-semibold text-red-600 hover:text-red-700 hover:bg-red-50 rounded-lg gap-1"
                              >
                                {isProcessing ? (
                                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                ) : (
                                  <Trash2 className="w-3.5 h-3.5" />
                                )}
                                Destroy
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}
        </div>

        {/* Footer with Pagination */}
        {totalPages > 1 && (
          <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
            <span>
              Page {currentPage} of {totalPages} ({filteredColleges.length} in bin)
            </span>
            <div className="flex items-center gap-1">
              <Button
                variant="outline"
                size="sm"
                disabled={currentPage === 1}
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                className="h-7 w-7 p-0 rounded-lg"
              >
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={currentPage === totalPages}
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                className="h-7 w-7 p-0 rounded-lg"
              >
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
