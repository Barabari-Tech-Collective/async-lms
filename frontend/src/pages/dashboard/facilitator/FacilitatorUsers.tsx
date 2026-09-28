import { Fragment, useEffect, useMemo, useState } from 'react';
import { Search, Eye, ShieldCheck, ShieldX, Pencil, Trash2, Archive, ChevronLeft, ChevronRight, Building2 } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { cn, getErrorMessage } from '@/lib/utils';
import RecycleBinModal from '@/components/common/RecycleBinModal';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

function FacilitatorUsersSkeleton() {
  return (
    <div className='space-y-6'>
      <div className='space-y-2'>
        <Skeleton className='h-8 w-52' />
        <Skeleton className='h-4 w-80' />
      </div>
      <div className='flex gap-3'>
        <Skeleton className='h-9 w-64' />
        <Skeleton className='h-9 w-44' />
      </div>
      <div className='rounded-xl border border-slate-200 overflow-hidden bg-white'>
        <div className='grid grid-cols-6 gap-4 px-4 py-3 border-b'>
          {[...Array(6)].map((_, i) => <Skeleton key={i} className='h-3 w-full' />)}
        </div>
        {[...Array(8)].map((_, i) => (
          <div key={i} className='grid grid-cols-6 gap-4 px-4 py-4 border-b border-slate-100 items-center'>
            <div className='flex items-center gap-3 col-span-2'>
              <Skeleton className='h-8 w-8 rounded-full shrink-0' />
              <div className='space-y-1.5 flex-1'>
                <Skeleton className='h-3.5 w-28' />
                <Skeleton className='h-3 w-36' />
              </div>
            </div>
            <Skeleton className='h-3 w-20' />
            <Skeleton className='h-3 w-16' />
            <Skeleton className='h-2 w-full rounded-full' />
            <Skeleton className='h-7 w-16 rounded' />
          </div>
        ))}
      </div>
    </div>
  );
}
import StudentProfileDialog from '@/components/common/StudentProfileDialog';
import toast from 'react-hot-toast';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import apiClient from '@/services/api';

interface StudentRow {
  id: string;
  full_name: string;
  email: string;
  degree?: string | null;
  batch?: number | null;
  college_name?: string | null;
  enrolled_courses?: number;
  progress_percent?: number;
  joined_date: string;
  is_verified: boolean;
}

interface CollegeOption {
  id: string;
  name: string;
  is_verified: boolean;
}

const FacilitatorStudents = () => {
  const [students, setStudents] = useState<StudentRow[]>([]);
  const [colleges, setColleges] = useState<CollegeOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCollege, setSelectedCollege] = useState<string>('all');
  const [profileId, setProfileId] = useState<string | null>(null);
  const [verifyingId, setVerifyingId] = useState<string | null>(null);
  const [tab, setTab] = useState<'all' | 'pending'>('all');
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 10;
  const [editStudent, setEditStudent] = useState<StudentRow | null>(null);
  const [editForm, setEditForm] = useState({ degree: '', current_academic_year: '', expected_graduation_year: '' });
  const [saving, setSaving] = useState(false);
  const [isBinOpen, setIsBinOpen] = useState(false);
  const [userToDelete, setUserToDelete] = useState<StudentRow | null>(null);

  const fetchStudents = async () => {
    try {
      setLoading(true);
      const [studentsRes, collegesRes] = await Promise.all([
        apiClient.get<StudentRow[]>('/facilitator/students'),
        apiClient.get<{ success: boolean; data: CollegeOption[] }>('/facilitator/colleges'),
      ]);
      setStudents(studentsRes.data);
      setColleges(collegesRes.data.data);
    } catch (error) {
      toast.error(getErrorMessage(error, 'Failed to load students'));
    } finally {
      setLoading(false);
    }
  };

  const handleVerify = async (studentId: string, value: boolean) => {
    setVerifyingId(studentId);
    try {
      await apiClient.patch(`/facilitator/students/${studentId}/verify`, { is_verified: value });
      setStudents((prev) =>
        prev.map((s) => (s.id === studentId ? { ...s, is_verified: value } : s)),
      );
      toast.success(value ? 'Student verified' : 'Student unverified');
    } catch (error) {
      toast.error(getErrorMessage(error, 'Failed to update verification'));
    } finally {
      setVerifyingId(null);
    }
  };

  const handleDeleteUser = async () => {
    if (!userToDelete) return;
    try {
      await apiClient.delete(`/facilitator/students/${userToDelete.id}`);
      toast.success('Student moved to recycle bin');
      setUserToDelete(null);
      await fetchStudents();
    } catch (error) {
      toast.error(getErrorMessage(error, 'Failed to move to bin'));
    }
  };

  const openEdit = (student: StudentRow) => {
    setEditStudent(student);
    setEditForm({
      degree: student.degree || '',
      current_academic_year: (student as any).current_academic_year || '',
      expected_graduation_year: (student as any).expected_graduation_year || '',
    });
  };

  const handleSaveEdit = async () => {
    if (!editStudent) return;
    setSaving(true);
    try {
      await apiClient.patch(`/facilitator/students/${editStudent.id}`, editForm);
      setStudents((prev) =>
        prev.map((s) => s.id === editStudent.id ? { ...s, degree: editForm.degree } : s),
      );
      toast.success('Student profile updated');
      setEditStudent(null);
    } catch (error) {
      toast.error(getErrorMessage(error, 'Failed to update student'));
    } finally {
      setSaving(false);
    }
  };

  useEffect(() => {
    fetchStudents();
  }, []);

  const filteredStudents = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return students.filter(
      (s) =>
        (tab === 'all' || !s.is_verified) &&
        (selectedCollege === 'all' || colleges.find((c) => c.id === selectedCollege)?.name === s.college_name) &&
        (s.full_name.toLowerCase().includes(q) ||
          s.email.toLowerCase().includes(q)),
    );
  }, [students, searchQuery, selectedCollege, tab]);

  // Reset page when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, selectedCollege, tab]);

  const totalPages = Math.max(1, Math.ceil(filteredStudents.length / pageSize));
  const paginatedStudents = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredStudents.slice(start, start + pageSize);
  }, [filteredStudents, currentPage, pageSize]);

  const pendingCount = useMemo(
    () => students.filter((s) => !s.is_verified).length,
    [students],
  );

  if (loading) return <FacilitatorUsersSkeleton />;

  return (
    <div className='space-y-4 sm:space-y-6 animate-in fade-in duration-500 min-w-0'>
      <div className='flex flex-col gap-1 sm:gap-2'>
        <h1 className='text-xl sm:text-2xl font-bold text-[#1e2653] tracking-tight'>
          Student Management
        </h1>
        <p className='text-slate-500 text-xs sm:text-sm'>
          Viewing all students enrolled in your assigned colleges.
        </p>
      </div>

      <div className='flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3'>
        <div className='flex overflow-x-auto no-scrollbar gap-1 rounded-xl bg-slate-100 p-1 w-full sm:w-fit'>
          <button
            onClick={() => setTab('all')}
            className={`px-3.5 sm:px-4 py-2 sm:py-1.5 rounded-lg text-xs sm:text-sm font-medium transition-colors whitespace-nowrap flex-1 sm:flex-initial text-center ${tab === 'all' ? 'bg-white shadow-xs text-slate-900' : 'text-slate-500 hover:text-slate-700'}`}
          >
            All Students
          </button>
          <button
            onClick={() => setTab('pending')}
            className={`px-3.5 sm:px-4 py-2 sm:py-1.5 rounded-lg text-xs sm:text-sm font-medium transition-colors flex items-center justify-center gap-1.5 whitespace-nowrap flex-1 sm:flex-initial ${tab === 'pending' ? 'bg-white shadow-xs text-slate-900' : 'text-slate-500 hover:text-slate-700'}`}
          >
            <span>Pending Verification</span>
            {pendingCount > 0 && (
              <span className='bg-yellow-500 text-white text-[10px] font-bold rounded-full px-1.5 py-0.5 leading-none'>
                {pendingCount}
              </span>
            )}
          </button>
        </div>
      </div>

      <div className='flex flex-col gap-3 sm:gap-4 md:flex-row md:items-center md:justify-between'>
        <div className='flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 sm:gap-3 w-full md:w-auto flex-1'>
          {/* Search bar + Recycle Bin in a single line */}
          <div className='flex items-center gap-2 w-full sm:w-auto flex-1'>
            <div className='relative flex-1 min-w-0'>
              <Search className='absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400' />
              <Input
                placeholder='Search students by name or email...'
                className='border-slate-200 bg-white pl-9 sm:pl-10 text-xs sm:text-sm h-10 w-full'
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            <button
              onClick={() => setIsBinOpen(true)}
              className='flex items-center justify-center gap-1.5 px-3 sm:px-4 h-10 rounded-xl border border-slate-200 bg-white text-xs sm:text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors shadow-2xs shrink-0'
              title='Recycle Bin'
            >
              <Archive className='h-4 w-4 text-slate-500 shrink-0' />
              <span className='hidden xs:inline sm:inline'>Recycle Bin</span>
              <span className='xs:hidden sm:hidden'>Bin</span>
            </button>
          </div>

          {colleges.length > 1 && (
            <Select value={selectedCollege} onValueChange={setSelectedCollege}>
              <SelectTrigger className='w-full sm:w-56 border-slate-200 bg-white text-xs sm:text-sm h-10 shrink-0'>
                <SelectValue placeholder='All Colleges' />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value='all'>All Colleges</SelectItem>
                {colleges.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>

        <p className='text-xs sm:text-sm font-medium text-slate-500'>
          Total Students:{' '}
          <span className='font-bold text-slate-900'>{filteredStudents.length}</span>
        </p>
      </div>

      <Card className='overflow-hidden border-none shadow-sm min-w-0'>
        {/* Mobile View (< md): Clean Student Cards with NO horizontal scroll */}
        <div className='md:hidden divide-y divide-slate-100'>
          {paginatedStudents.map((student) => (
            <div key={student.id} className='p-3.5 space-y-2.5 bg-white'>
              {/* Header: Name, Email & Status Badge */}
              <div className='flex items-start justify-between gap-2'>
                <div className='min-w-0 flex-1'>
                  <p className='font-bold text-xs sm:text-sm text-slate-900 truncate'>
                    {student.full_name}
                  </p>
                  <p className='text-[11px] text-slate-500 truncate mt-0.5'>{student.email}</p>
                </div>
                {student.is_verified ? (
                  <Badge className='bg-green-50 text-green-700 border-green-100 border text-[10px] shrink-0 font-semibold px-2 py-0.5'>
                    Verified
                  </Badge>
                ) : (
                  <Badge className='bg-yellow-50 text-yellow-700 border-yellow-100 border text-[10px] shrink-0 font-semibold px-2 py-0.5'>
                    Pending
                  </Badge>
                )}
              </div>

              {/* College & Degree/Batch */}
              <div className='text-[11px] bg-slate-50/80 p-2.5 rounded-lg border border-slate-100 space-y-1.5'>
                <div className='flex items-center gap-1.5 text-slate-800 font-semibold'>
                  <Building2 className='w-3.5 h-3.5 text-indigo-500 shrink-0' />
                  <span className='line-clamp-1 break-words leading-tight' title={student.college_name || undefined}>
                    {student.college_name || 'No College Assigned'}
                  </span>
                </div>
                <div className='flex flex-wrap items-center gap-1.5 text-slate-500 pt-1 border-t border-slate-200/50'>
                  <span className='font-medium text-slate-700'>{student.degree || 'Degree N/A'}</span>
                  {student.batch && (
                    <Badge
                      variant='outline'
                      className='text-[9px] h-4.5 bg-blue-50/60 text-blue-600 border-blue-100 px-1.5'
                    >
                      Batch {student.batch}
                    </Badge>
                  )}
                  <span className='text-slate-300'>•</span>
                  <Badge className='bg-indigo-50 text-indigo-700 border-none text-[10px] px-1.5 py-0'>
                    {student.enrolled_courses || 0} subjects
                  </Badge>
                </div>
              </div>

              {/* Progress Bar (if verified) */}
              {student.is_verified && (
                <div className='space-y-1 pt-0.5'>
                  <div className='flex items-center justify-between text-[10px] font-bold uppercase tracking-wider'>
                    <span className='text-slate-400'>Overall Progress</span>
                    <span className='text-indigo-600 font-extrabold'>
                      {student.progress_percent || 0}%
                    </span>
                  </div>
                  <Progress
                    value={student.progress_percent || 0}
                    className='h-1.5 bg-indigo-50'
                  />
                </div>
              )}

              {/* Action Buttons Bar */}
              <div className='flex items-center justify-between pt-1 border-t border-slate-50'>
                <p className='text-[10px] text-slate-400 font-medium'>
                  Joined {new Date(student.joined_date).toLocaleDateString('en-GB')}
                </p>
                <div className='flex items-center gap-1'>
                  <button
                    onClick={() => setProfileId(student.id)}
                    className='p-1.5 rounded-lg bg-slate-50 hover:bg-slate-100 text-slate-500 hover:text-blue-600 transition-colors flex items-center justify-center'
                    title='View details'
                  >
                    <Eye className='w-3.5 h-3.5' />
                  </button>
                  <button
                    onClick={() => openEdit(student)}
                    className='p-1.5 rounded-lg bg-slate-50 hover:bg-slate-100 text-slate-500 hover:text-amber-600 transition-colors flex items-center justify-center'
                    title='Edit student'
                  >
                    <Pencil className='w-3.5 h-3.5' />
                  </button>
                  <button
                    disabled={verifyingId === student.id}
                    onClick={() => handleVerify(student.id, !student.is_verified)}
                    className='p-1.5 rounded-lg bg-slate-50 hover:bg-slate-100 text-slate-500 hover:text-indigo-600 transition-colors disabled:opacity-50 flex items-center justify-center'
                    title={student.is_verified ? 'Unverify student' : 'Verify student'}
                  >
                    {student.is_verified ? (
                      <ShieldX className='w-3.5 h-3.5' />
                    ) : (
                      <ShieldCheck className='w-3.5 h-3.5' />
                    )}
                  </button>
                  <button
                    onClick={() => setUserToDelete(student)}
                    className='p-1.5 rounded-lg bg-red-50/60 hover:bg-red-50 text-slate-400 hover:text-red-600 transition-colors flex items-center justify-center'
                    title='Move to recycle bin'
                  >
                    <Trash2 className='w-3.5 h-3.5' />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Desktop View (>= md): Full 8-column Table */}
        <div className='hidden md:block overflow-x-auto custom-scrollbar w-full min-w-0'>
          <Table className='min-w-[760px]'>
            <TableHeader className='bg-slate-50/50'>
              <TableRow>
                <TableHead className='font-bold uppercase text-[11px] sm:text-xs'>
                  Student
                </TableHead>
                <TableHead className='font-bold uppercase text-[11px] sm:text-xs'>
                  College
                </TableHead>
                <TableHead className='font-bold uppercase text-[11px] sm:text-xs'>
                  Degree/Batch
                </TableHead>
                <TableHead className='font-bold uppercase text-[11px] sm:text-xs'>
                  Courses
                </TableHead>
                <TableHead className='font-bold uppercase text-[11px] sm:text-xs'>
                  Overall Progress
                </TableHead>
                <TableHead className='font-bold uppercase text-[11px] sm:text-xs'>
                  Status
                </TableHead>
                <TableHead className='font-bold uppercase text-[11px] sm:text-xs'>
                  Joined
                </TableHead>
                <TableHead className='font-bold uppercase text-[11px] sm:text-xs'>
                  Actions
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody className='bg-white'>
              {paginatedStudents.map((student) => (
                <TableRow
                  key={student.id}
                  className='hover:bg-slate-50/60 transition-colors'
                >
                  <TableCell>
                    <div className='min-w-0'>
                      <p className='font-bold text-xs sm:text-sm text-slate-900 truncate'>
                        {student.full_name}
                      </p>
                      <p className='text-[11px] text-slate-500 truncate'>{student.email}</p>
                    </div>
                  </TableCell>
                  <TableCell>
                    <span className='text-xs sm:text-sm text-slate-700 truncate block max-w-64' title={student.college_name || undefined}>
                      {student.college_name || 'N/A'}
                    </span>
                  </TableCell>
                  <TableCell>
                    <div className='flex flex-col gap-1'>
                      <span className='text-xs text-slate-600 font-medium'>
                        {student.degree || 'N/A'}
                      </span>
                      {student.batch && (
                        <Badge
                          variant='outline'
                          className='w-fit text-[10px] h-5 bg-blue-50/50 text-blue-600 border-blue-100'
                        >
                          Batch {student.batch}
                        </Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge className='bg-indigo-50 text-indigo-700 hover:bg-indigo-100 border-none text-[11px] whitespace-nowrap'>
                      {student.enrolled_courses || 0} subjects
                    </Badge>
                  </TableCell>
                  <TableCell className='min-w-36'>
                    {student.is_verified ? (
                      <div className='space-y-1.5'>
                        <div className='flex items-center justify-between text-[10px] font-bold uppercase tracking-wider'>
                          <span className='text-slate-400'>Progress</span>
                          <span className='text-indigo-600'>
                            {student.progress_percent || 0}%
                          </span>
                        </div>
                        <Progress
                          value={student.progress_percent || 0}
                          className='h-1.5 bg-indigo-50'
                        />
                      </div>
                    ) : (
                      <span className='text-slate-300 text-xs'>—</span>
                    )}
                  </TableCell>
                  <TableCell>
                    {student.is_verified ? (
                      <Badge className='bg-green-50 text-green-700 border-green-100 hover:bg-green-100 border text-[11px] whitespace-nowrap'>
                        Verified
                      </Badge>
                    ) : (
                      <Badge className='bg-yellow-50 text-yellow-700 border-yellow-100 hover:bg-yellow-100 border text-[11px] whitespace-nowrap'>
                        Pending
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    <p className='text-xs text-slate-500 whitespace-nowrap'>
                      {new Date(student.joined_date).toLocaleDateString('en-GB')}
                    </p>
                  </TableCell>
                  <TableCell>
                    <div className='flex items-center gap-1'>
                      <button
                        onClick={() => setProfileId(student.id)}
                        className='p-2 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-blue-600 transition-colors min-h-[32px] min-w-[32px] flex items-center justify-center'
                        title='View details'
                      >
                        <Eye className='w-4 h-4' />
                      </button>
                      <button
                        onClick={() => openEdit(student)}
                        className='p-2 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-amber-600 transition-colors min-h-[32px] min-w-[32px] flex items-center justify-center'
                        title='Edit student'
                      >
                        <Pencil className='w-4 h-4' />
                      </button>
                      <button
                        disabled={verifyingId === student.id}
                        onClick={() => handleVerify(student.id, !student.is_verified)}
                        className='p-2 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-indigo-600 transition-colors disabled:opacity-50 min-h-[32px] min-w-[32px] flex items-center justify-center'
                        title={student.is_verified ? 'Unverify student' : 'Verify student'}
                      >
                        {student.is_verified ? (
                          <ShieldX className='w-4 h-4' />
                        ) : (
                          <ShieldCheck className='w-4 h-4' />
                        )}
                      </button>
                      <button
                        onClick={() => setUserToDelete(student)}
                        className='p-2 rounded-lg hover:bg-red-50 text-slate-400 hover:text-red-600 transition-colors min-h-[32px] min-w-[32px] flex items-center justify-center'
                        title='Move to recycle bin'
                      >
                        <Trash2 className='w-4 h-4' />
                      </button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        {filteredStudents.length === 0 && (
          <div className='py-16 text-center'>
            <div className='inline-flex items-center justify-center w-12 h-12 rounded-full bg-slate-100 mb-3'>
              <Search className='w-6 h-6 text-slate-400' />
            </div>
            <p className='text-slate-500 font-medium text-xs sm:text-sm'>
              No students found matching your search.
            </p>
          </div>
        )}

        {/* Pagination Bar */}
        {filteredStudents.length > 0 && totalPages > 1 && (
          <div className='flex flex-col sm:flex-row items-center justify-between gap-3 px-4 py-3 bg-slate-50/70 border-t border-slate-100'>
            <p className='text-[11px] sm:text-xs text-slate-500 font-medium'>
              Showing <span className='font-bold text-slate-800'>{(currentPage - 1) * pageSize + 1}</span> to{' '}
              <span className='font-bold text-slate-800'>{Math.min(currentPage * pageSize, filteredStudents.length)}</span> of{' '}
              <span className='font-bold text-slate-800'>{filteredStudents.length}</span> students
            </p>

            <div className='flex items-center gap-1.5'>
              <Button
                variant='outline'
                size='sm'
                disabled={currentPage <= 1}
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                className='rounded-xl h-8 px-2.5 text-xs text-slate-700 bg-white shadow-2xs hover:bg-slate-50'
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
                        className={cn(
                          'w-7 h-7 rounded-lg text-xs font-bold transition-all flex items-center justify-center',
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
                className='rounded-xl h-8 px-2.5 text-xs text-slate-700 bg-white shadow-2xs hover:bg-slate-50'
              >
                Next
                <ChevronRight className='h-3.5 w-3.5 ml-1' />
              </Button>
            </div>
          </div>
        )}
      </Card>

      <StudentProfileDialog
        studentId={profileId}
        apiPrefix='facilitator'
        onClose={() => setProfileId(null)}
      />

      <Dialog open={!!editStudent} onOpenChange={(open) => !open && setEditStudent(null)}>
        <DialogContent className='w-[92vw] sm:max-w-md rounded-2xl p-4 sm:p-6'>
          <DialogHeader>
            <DialogTitle className='text-base sm:text-lg'>Edit Student — {editStudent?.full_name}</DialogTitle>
          </DialogHeader>
          <div className='space-y-3.5 sm:space-y-4 py-2'>
            <div className='space-y-1.5'>
              <Label className='text-xs sm:text-sm'>Degree Program</Label>
              <Select value={editForm.degree} onValueChange={(v) => setEditForm((f) => ({ ...f, degree: v }))}>
                <SelectTrigger className='h-10 text-xs sm:text-sm'>
                  <SelectValue placeholder='Select degree' />
                </SelectTrigger>
                <SelectContent>
                  {['B.Tech', 'BCA', 'M.Tech', 'BSC', 'BCOM', 'BA'].map((d) => (
                    <SelectItem key={d} value={d}>{d}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className='space-y-1.5'>
              <Label className='text-xs sm:text-sm'>Academic Year</Label>
              <Select value={editForm.current_academic_year} onValueChange={(v) => setEditForm((f) => ({ ...f, current_academic_year: v }))}>
                <SelectTrigger className='h-10 text-xs sm:text-sm'>
                  <SelectValue placeholder='Select year' />
                </SelectTrigger>
                <SelectContent>
                  {['1st year', '2nd year', '3rd year', '4th year'].map((y) => (
                    <SelectItem key={y} value={y}>{y}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className='space-y-1.5'>
              <Label className='text-xs sm:text-sm'>Expected Graduation Year</Label>
              <Select value={editForm.expected_graduation_year} onValueChange={(v) => setEditForm((f) => ({ ...f, expected_graduation_year: v }))}>
                <SelectTrigger className='h-10 text-xs sm:text-sm'>
                  <SelectValue placeholder='Select graduation year' />
                </SelectTrigger>
                <SelectContent>
                  {['2024-25','2025-26','2026-27','2027-28','2028-29','2029-30','2030-31'].map((y) => (
                    <SelectItem key={y} value={y}>{y}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter className='flex-col-reverse sm:flex-row gap-2 mt-2'>
            <button
              onClick={() => setEditStudent(null)}
              className='w-full sm:w-auto px-4 py-2 text-xs sm:text-sm font-medium text-slate-600 hover:text-slate-900 transition-colors border border-slate-200 sm:border-transparent rounded-lg'
            >
              Cancel
            </button>
            <button
              disabled={saving}
              onClick={handleSaveEdit}
              className='w-full sm:w-auto px-4 py-2.5 text-xs sm:text-sm font-semibold bg-[#344499] text-white rounded-lg hover:bg-[#2c3983] disabled:opacity-50 transition-colors shadow-xs'
            >
              {saving ? 'Saving...' : 'Save Changes'}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <RecycleBinModal
        open={isBinOpen}
        onClose={() => setIsBinOpen(false)}
        apiPrefix="facilitator"
        onRestored={fetchStudents}
      />

      <AlertDialog open={!!userToDelete} onOpenChange={(open) => !open && setUserToDelete(null)}>
        <AlertDialogContent className='w-[92vw] sm:max-w-md rounded-2xl p-4 sm:p-6'>
          <AlertDialogHeader>
            <AlertDialogTitle className='text-base sm:text-lg'>Move to Recycle Bin?</AlertDialogTitle>
            <AlertDialogDescription className='text-xs sm:text-sm'>
              This will move <strong>{userToDelete?.full_name}</strong> to the Recycle Bin. 
              They will not be able to log in, but their progress is preserved. You can restore them later.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className='flex-col-reverse sm:flex-row gap-2 mt-2'>
            <AlertDialogCancel className='w-full sm:w-auto mt-0'>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteUser} className="w-full sm:w-auto bg-red-600 hover:bg-red-700 text-white">
              Move to Bin
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default FacilitatorStudents;
