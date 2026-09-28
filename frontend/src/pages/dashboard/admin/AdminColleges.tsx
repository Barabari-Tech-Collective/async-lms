import { useEffect, useState, useCallback, useMemo } from 'react';
import { Plus, MapPin, MoreHorizontal, Loader2, Search, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { getErrorMessage } from '@/lib/utils';

import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

import apiClient from '@/services/api';
import DeleteCollegeDialog from '@/components/common/admin/DeleteCollegeDialog';
import CollegeFormDialog from '@/components/common/admin/CollegeFormDialog';
import CollegeDetailSheet from '@/components/common/admin/CollegeDetailSheet';

/* ======================
   Types (API aligned)
====================== */

export interface College {
  id: string;
  name: string;
  short_code: string;
  city: string;
  state: string;
  is_verified: boolean;
  created_at: string;
}

/* ======================
   Pagination Helper
====================== */

function getPageNumbers(currentPage: number, totalPages: number) {
  if (totalPages <= 5) {
    return Array.from({ length: totalPages }, (_, i) => i + 1);
  }
  if (currentPage <= 2) {
    return [1, 2, 3, '...', totalPages];
  }
  if (currentPage >= totalPages - 1) {
    return [1, '...', totalPages - 2, totalPages - 1, totalPages];
  }
  return [1, '...', currentPage, '...', totalPages];
}

function PaginationControls({
  page,
  totalPages,
  onPageChange,
}: {
  page: number;
  totalPages: number;
  onPageChange: (p: number) => void;
}) {
  const pages = getPageNumbers(page, totalPages);

  return (
    <div className="flex flex-wrap items-center justify-center gap-1 sm:gap-1.5 shrink-0">
      <button
        onClick={() => onPageChange(page - 1)}
        disabled={page === 1}
        className="px-2.5 py-1 text-xs font-semibold rounded-lg border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors text-slate-600 min-h-[30px]"
      >
        Prev
      </button>

      {pages.map((p, i) => (
        <button
          key={i}
          onClick={() => typeof p === 'number' && onPageChange(p)}
          disabled={p === '...'}
          className={`min-w-[28px] h-[30px] sm:min-w-[30px] sm:h-[30px] px-1.5 flex items-center justify-center rounded-lg border text-xs transition-colors font-medium ${
            p === page
              ? 'bg-blue-600 text-white border-blue-600 font-bold shadow-xs'
              : p === '...'
              ? 'border-transparent text-slate-400 cursor-default'
              : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
          }`}
        >
          {p}
        </button>
      ))}

      <button
        onClick={() => onPageChange(page + 1)}
        disabled={page === totalPages}
        className="px-2.5 py-1 text-xs font-semibold rounded-lg border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors text-slate-600 min-h-[30px]"
      >
        Next
      </button>
    </div>
  );
}

/* ======================
   Component
====================== */

export default function AdminColleges() {
  const [colleges, setColleges] = useState<College[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const pageSize = 10;

  const [formOpen, setFormOpen] = useState(false);
  const [editingCollege, setEditingCollege] = useState<College | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);

  /* ======================
     Fetch Colleges
  ====================== */

  const fetchColleges = useCallback(async () => {
    let isMounted = true;

    try {
      setLoading(true);
      const res = await apiClient.get<{ data: College[] }>('/colleges');
      if (isMounted) {
        setColleges(res.data.data ?? []);
      }
    } catch (error) {
      toast.error(getErrorMessage(error, 'Failed to load colleges'));
    } finally {
      if (isMounted) {
        setLoading(false);
      }
    }

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    fetchColleges();
  }, [fetchColleges]);

  /* ======================
     Helpers & Filtering
  ====================== */

  const getInitials = useMemo(
    () => (name: string) =>
      name
        .split(' ')
        .map((n) => n[0])
        .join('')
        .slice(0, 2)
        .toUpperCase(),
    [],
  );

  const filteredColleges = useMemo(() => {
    if (!search.trim()) return colleges;
    const q = search.toLowerCase();
    return colleges.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        (c.city && c.city.toLowerCase().includes(q)) ||
        (c.state && c.state.toLowerCase().includes(q)) ||
        (c.short_code && c.short_code.toLowerCase().includes(q))
    );
  }, [colleges, search]);

  const totalPages = Math.ceil(filteredColleges.length / pageSize);

  const paginatedColleges = useMemo(() => {
    return filteredColleges.slice((page - 1) * pageSize, page * pageSize);
  }, [filteredColleges, page, pageSize]);

  useEffect(() => {
    setPage(1);
  }, [search]);

  /* ======================
     Render
  ====================== */

  return (
    <div className='space-y-4 sm:space-y-6 min-w-0 animate-in fade-in duration-300'>
      {/* Header */}
      <div className='flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3'>
        <div>
          <h2 className='text-lg sm:text-xl font-bold text-slate-900 tracking-tight'>Colleges</h2>
          <p className='text-xs sm:text-sm text-slate-500'>Manage registered educational institutions</p>
        </div>
        <Button
          className='gap-2 bg-blue-600 hover:bg-blue-700 min-h-[40px] rounded-xl font-semibold shadow-xs shrink-0'
          disabled={loading}
          onClick={() => {
            setEditingCollege(null);
            setFormOpen(true);
          }}
        >
          <Plus className='w-4 h-4' /> Add College
        </Button>
      </div>

      {/* Main Card */}
      <Card className='border border-slate-200/80 shadow-xs rounded-2xl overflow-hidden bg-white min-w-0'>
        {/* Card Header with Search Bar */}
        <div className='p-3.5 sm:p-4 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-50/50'>
          <div className='relative w-full sm:w-72'>
            <Search className='absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400' />
            <input
              type='text'
              placeholder='Search by college name...'
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className='w-full pl-9 pr-8 py-2 bg-white border border-slate-200 rounded-xl text-xs sm:text-sm text-slate-700 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 min-h-[38px] transition-all'
            />
            {search && (
              <button
                onClick={() => setSearch('')}
                className='absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5'
              >
                <X className='w-3.5 h-3.5' />
              </button>
            )}
          </div>
          <span className='text-xs text-slate-500 font-medium self-end sm:self-auto'>
            {filteredColleges.length} {filteredColleges.length === 1 ? 'college' : 'colleges'}
          </span>
        </div>

        <CardContent className='p-0'>
          {/* Mobile Card View (No horizontal scrollbar) */}
          <div className='divide-y divide-slate-100 md:hidden'>
            {loading ? (
              <div className='py-20 flex justify-center items-center'>
                <Loader2 className='w-8 h-8 animate-spin text-blue-600' />
              </div>
            ) : paginatedColleges.length === 0 ? (
              <div className='py-16 text-center text-slate-400 text-xs sm:text-sm'>
                {search ? 'No colleges matching your search.' : 'No colleges found.'}
              </div>
            ) : (
              paginatedColleges.map((college) => (
                <div key={college.id} className='p-3.5 sm:p-4 space-y-2 hover:bg-slate-50/60 transition-colors'>
                  <div className='flex items-start justify-between gap-2'>
                    <div className='flex items-center gap-2.5 min-w-0 flex-1'>
                      <div className='w-9 h-9 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center font-bold text-xs shrink-0 border border-blue-100'>
                        {getInitials(college.name)}
                      </div>
                      <div className='min-w-0 flex-1'>
                        <p className='font-bold text-slate-800 text-xs sm:text-sm truncate'>{college.name}</p>
                        <div className='flex items-center gap-1.5 text-slate-500 text-[11px] mt-0.5'>
                          <MapPin className='w-3 h-3 text-slate-400 shrink-0' />
                          <span className='truncate'>{college.city || '—'}{college.state ? `, ${college.state}` : ''}</span>
                        </div>
                      </div>
                    </div>

                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant='ghost'
                          size='icon'
                          className='h-8 w-8 text-slate-400 hover:text-slate-700 rounded-lg shrink-0'
                          aria-label='College actions'
                        >
                          <MoreHorizontal className='w-4 h-4' />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align='end' className='rounded-xl shadow-lg border border-slate-200'>
                        <DropdownMenuItem onClick={() => setDetailId(college.id)} className='cursor-pointer'>
                          View Details
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => {
                            setEditingCollege(college);
                            setFormOpen(true);
                          }}
                          className='cursor-pointer'
                        >
                          Edit
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          className='text-red-600 focus:text-red-700 focus:bg-red-50 cursor-pointer'
                          onClick={() => setDeleteId(college.id)}
                        >
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>

                  <div className='flex items-center justify-between pt-1 text-[11px]'>
                    <span className='text-slate-400 font-medium'>Status</span>
                    <Badge
                      className={
                        college.is_verified
                          ? 'bg-emerald-50 text-emerald-700 border-emerald-200/60 font-semibold text-[11px]'
                          : 'bg-orange-50 text-orange-700 border-orange-200/60 font-semibold text-[11px]'
                      }
                    >
                      {college.is_verified ? 'Verified' : 'Pending'}
                    </Badge>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Desktop Table View */}
          <div className='hidden md:block overflow-x-auto no-scrollbar w-full min-w-0'>
            <Table className='w-full text-xs sm:text-sm'>
              <TableHeader className='bg-slate-50 border-b border-slate-100'>
                <TableRow>
                  <TableHead className='pl-4 sm:pl-6 py-3.5'>College</TableHead>
                  <TableHead className='py-3.5'>Location</TableHead>
                  <TableHead className='py-3.5'>Status</TableHead>
                  <TableHead className='w-14 text-right pr-4 sm:pr-6 py-3.5' />
                </TableRow>
              </TableHeader>

              <TableBody className='divide-y divide-slate-100'>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={4} className='h-64 text-center'>
                      <Loader2 className='w-8 h-8 animate-spin text-blue-600 mx-auto' />
                    </TableCell>
                  </TableRow>
                ) : paginatedColleges.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={4}
                      className='h-64 text-center text-slate-400 text-xs sm:text-sm'
                    >
                      {search ? 'No colleges matching your search.' : 'No colleges found.'}
                    </TableCell>
                  </TableRow>
                ) : (
                  paginatedColleges.map((college) => (
                    <TableRow
                      key={college.id}
                      className='hover:bg-slate-50/60 transition-colors'
                    >
                      <TableCell className='pl-4 sm:pl-6 py-3.5'>
                        <div className='flex items-center gap-3 sm:gap-4 min-w-0'>
                          <div className='w-9 h-9 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center font-bold text-xs shrink-0 border border-blue-100'>
                            {getInitials(college.name)}
                          </div>
                          <span className='font-semibold text-slate-800 text-xs sm:text-sm truncate'>
                            {college.name}
                          </span>
                        </div>
                      </TableCell>

                      <TableCell className='py-3.5 whitespace-nowrap'>
                        <div className='flex items-center gap-1.5 text-slate-500 text-xs sm:text-sm'>
                          <MapPin className='w-3.5 h-3.5 text-slate-400 shrink-0' />
                          <span>{college.city || '—'}{college.state ? `, ${college.state}` : ''}</span>
                        </div>
                      </TableCell>

                      <TableCell className='py-3.5 whitespace-nowrap'>
                        <Badge
                          className={
                            college.is_verified
                              ? 'bg-emerald-50 text-emerald-700 border-emerald-200/60 font-semibold text-[11px]'
                              : 'bg-orange-50 text-orange-700 border-orange-200/60 font-semibold text-[11px]'
                          }
                        >
                          {college.is_verified ? 'Verified' : 'Pending'}
                        </Badge>
                      </TableCell>

                      <TableCell className='text-right pr-4 sm:pr-6 py-3.5'>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant='ghost'
                              size='icon'
                              className='h-8 w-8 text-slate-400 hover:text-slate-700 rounded-lg'
                              aria-label='College actions'
                            >
                              <MoreHorizontal className='w-4 h-4' />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align='end' className='rounded-xl shadow-lg border border-slate-200'>
                            <DropdownMenuItem onClick={() => setDetailId(college.id)} className='cursor-pointer'>
                              View Details
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => {
                                setEditingCollege(college);
                                setFormOpen(true);
                              }}
                              className='cursor-pointer'
                            >
                              Edit
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              className='text-red-600 focus:text-red-700 focus:bg-red-50 cursor-pointer'
                              onClick={() => setDeleteId(college.id)}
                            >
                              Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>

          {/* Pagination Controls */}
          {totalPages > 1 && (
            <div className='flex flex-col sm:flex-row items-center justify-between gap-2.5 px-4 sm:px-6 py-3.5 border-t border-slate-100 text-xs text-slate-500'>
              <span className='text-center sm:text-left'>
                Showing {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, filteredColleges.length)} of {filteredColleges.length} colleges · page {page} of {totalPages}
              </span>
              <PaginationControls page={page} totalPages={totalPages} onPageChange={setPage} />
            </div>
          )}
        </CardContent>
      </Card>

      {/* Add / Edit Dialog */}
      <CollegeFormDialog
        open={formOpen}
        college={editingCollege}
        onClose={() => {
          setFormOpen(false);
          setEditingCollege(null);
        }}
        onSuccess={fetchColleges}
      />

      {/* Delete Dialog */}
      {deleteId && (
        <DeleteCollegeDialog
          open={!!deleteId}
          collegeId={deleteId}
          onClose={() => setDeleteId(null)}
          onSuccess={fetchColleges}
        />
      )}

      {/* College Detail Sheet */}
      <CollegeDetailSheet
        collegeId={detailId}
        onClose={() => setDetailId(null)}
      />
    </div>
  );
}
