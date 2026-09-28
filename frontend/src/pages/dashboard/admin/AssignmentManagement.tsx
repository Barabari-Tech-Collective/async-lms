import { useState, useEffect, useMemo, Fragment } from 'react';
import { useNavigate, useLocation } from 'react-router';
import {
  Plus,
  Search,
  Play,
  Eye,
  Loader2,
  Edit3,
  BarChart2,
  Trash2,
  X,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import apiClient from '@/services/api';
import toast from 'react-hot-toast';
import { cn, getErrorMessage } from '@/lib/utils';
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

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

/* ======================
   Types
====================== */

interface Assignment {
  id: number;
  name: string;
  course: string;
  college: string;
  collegeId: string;
  batch: string;
  submissionsCount: number;
  submissionsTotal: number;
  dueDate: string;
  rawDueDate?: string;
  status: 'Active' | 'Submitted' | 'Completed' | 'Pending' | 'Overdue';
}

/* ======================
   Static Data
====================== */

type Tab = 'Active' | 'Submitted' | 'Completed';

/* ======================
   Component
====================== */

export default function AssignmentManagement() {
  const navigate = useNavigate();
  const location = useLocation();
  const dashboardType = location.pathname.includes('/dashboard/admin')
    ? 'admin'
    : 'facilitator';
  const basePath = `/dashboard/${dashboardType}`;

  const [searchQuery, setSearchQuery] = useState('');
  const [collegeFilter, setCollegeFilter] = useState('all');
  const [activeTab, setActiveTab] = useState<Tab>('Active');
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 10;

  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleteTarget, setDeleteTarget] = useState<Assignment | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [runningEvalId, setRunningEvalId] = useState<number | null>(null);

  const toggleSelectAll = () => {
    if (allFilteredSelected) {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        filtered.forEach((a) => next.delete(a.id));
        return next;
      });
    } else {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        filtered.forEach((a) => next.add(a.id));
        return next;
      });
    }
  };

  const toggleSelect = (id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const handleRunEvaluation = async (assignment: Assignment) => {
    try {
      setRunningEvalId(assignment.id);
      const res = await apiClient.post<{
        success: boolean;
        evaluationId: string;
      }>('/evaluations/run', { assignmentId: assignment.id });
      toast.success('Evaluation started');
      navigate(`${basePath}/results/${res.data.evaluationId}`);
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to run evaluation'));
    } finally {
      setRunningEvalId(null);
    }
  };

  const handleViewResults = async (assignment: Assignment) => {
    try {
      const res = await apiClient.get<{
        success: boolean;
        evaluationId: string;
      }>(`/evaluations/by-assignment/${assignment.id}`);
      navigate(`${basePath}/results/${res.data.evaluationId}`);
    } catch {
      toast.error('No evaluation has been run for this assignment yet');
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      setDeleting(true);
      await apiClient.delete(`/college-assignments/${deleteTarget.id}`);
      setAssignments((prev) => prev.filter((a) => a.id !== deleteTarget.id));
      setSelectedIds((prev) => {
        const next = new Set(prev);
        next.delete(deleteTarget.id);
        return next;
      });
      toast.success('Assignment deleted');
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to delete assignment'));
    } finally {
      setDeleting(false);
      setDeleteTarget(null);
    }
  };

  const handleBulkDelete = async () => {
    try {
      setDeleting(true);
      await Promise.all(
        [...selectedIds].map((id) =>
          apiClient.delete(`/college-assignments/${id}`),
        ),
      );
      setAssignments((prev) => prev.filter((a) => !selectedIds.has(a.id)));
      toast.success(
        `${selectedIds.size} assignment${selectedIds.size > 1 ? 's' : ''} deleted`,
      );
      setSelectedIds(new Set());
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to delete assignments'));
    } finally {
      setDeleting(false);
      setBulkDeleteOpen(false);
    }
  };

  // Fetch assignments on mount
  useEffect(() => {
    apiClient
      .get<{ success: boolean; data: any[] }>('/college-assignments/manage')
      .then((res) => {
        const mapped = res.data.data.map((item) => {
          const subsCount = parseInt(item.submissions_count) || 0;
          const subsTotal = parseInt(item.submissions_total) || 0;
          const isOverdue =
            item.due_date && new Date(item.due_date) < new Date();

          let status: Assignment['status'] = 'Active';
          if (item.evaluation_status === 'completed') {
            status = 'Completed';
          } else if (isOverdue) {
            status = 'Overdue';
          } else if (subsCount > 0) {
            status = 'Submitted';
          }

          return {
            id: item.id,
            name: item.title,
            course: item.course || 'N/A',
            college: item.college_name,
            collegeId: item.college_id,
            batch: item.batch || 'N/A',
            submissionsCount: subsCount,
            submissionsTotal: subsTotal,
            dueDate: item.due_date
              ? new Date(item.due_date).toLocaleDateString()
              : 'No Due Date',
            rawDueDate: item.due_date ? item.due_date.split('T')[0] : '',
            status,
          };
        });
        setAssignments(mapped);
      })
      .catch(() => {
        // assignments remains empty — empty state is shown below
      })
      .finally(() => setLoading(false));
  }, []);

  const tabs: { label: string; shortLabel: string; value: Tab; dot?: string }[] = [
    { label: 'Active', shortLabel: 'Active', value: 'Active' },
    {
      label: 'Submitted – Pending Evaluation',
      shortLabel: 'Pending Eval',
      value: 'Submitted',
      dot: 'bg-amber-400',
    },
    { label: 'Completed', shortLabel: 'Completed', value: 'Completed' },
  ];

  // Derive unique colleges
  const uniqueColleges = Array.from(
    new Map(assignments.map((a) => [a.collegeId, a.college])).entries(),
  );

  // Reset page when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, collegeFilter, activeTab]);

  // Client-side filter
  const filtered = assignments.filter((a) => {
    const matchesSearch = a.name
      .toLowerCase()
      .includes(searchQuery.toLowerCase());
    const matchesCollege =
      collegeFilter === 'all' || a.collegeId === collegeFilter;
    const matchesTab =
      activeTab === 'Active'
        ? a.status === 'Active' || a.status === 'Submitted'
        : activeTab === 'Completed'
          ? a.status === 'Overdue' || a.status === 'Completed'
          : a.status === 'Submitted';
    return matchesSearch && matchesCollege && matchesTab;
  });

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const paginated = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filtered.slice(start, start + pageSize);
  }, [filtered, currentPage, pageSize]);

  const allFilteredSelected =
    filtered.length > 0 && filtered.every((a) => selectedIds.has(a.id));
  const someFilteredSelected = filtered.some((a) => selectedIds.has(a.id));

  const getStatusBadge = (status: Assignment['status']) => {
    switch (status) {
      case 'Active':
        return (
          <Badge className='bg-emerald-50 text-emerald-600 hover:bg-emerald-50 font-medium text-xs rounded-full px-3'>
            Active
          </Badge>
        );
      case 'Submitted':
        return (
          <Badge className='bg-amber-50 text-amber-600 hover:bg-amber-50 font-medium text-xs rounded-full px-3'>
            Submitted
          </Badge>
        );
      case 'Completed':
        return (
          <Badge className='bg-blue-50 text-blue-600 hover:bg-blue-50 font-medium text-xs rounded-full px-3'>
            Completed
          </Badge>
        );
      case 'Pending':
        return (
          <Badge className='bg-blue-50 text-blue-600 hover:bg-blue-50 font-medium text-xs'>
            Pending
          </Badge>
        );
      case 'Overdue':
        return (
          <Badge className='bg-red-50 text-red-600 hover:bg-red-50 font-medium text-xs'>
            Overdue
          </Badge>
        );
    }
  };

  return (
    <div className='p-3.5 sm:p-6 space-y-4 sm:space-y-6 animate-in fade-in duration-500 min-w-0'>
      {/* Breadcrumb */}
      <div className='text-xs sm:text-sm text-slate-500'>
        {dashboardType === 'admin' ? 'Dashboard' : 'Facilitator'} /{' '}
        <span className='font-medium text-slate-700'>
          Assignment Management
        </span>
      </div>

      {/* Header */}
      <div className='flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3'>
        <div>
          <h1 className='text-xl sm:text-2xl font-bold text-slate-900 tracking-tight'>
            Assignment Management
          </h1>
          <p className='text-xs sm:text-sm text-slate-500 mt-0.5'>
            Create, manage and track assignments
          </p>
        </div>
        <Button
          className='w-full sm:w-auto gap-2 bg-blue-600 hover:bg-blue-700 min-h-[40px]'
          onClick={() => navigate(`${basePath}/create-assignment`)}
        >
          <Plus className='w-4 h-4' />
          Create Assignment
        </Button>
      </div>

      {/* Filters Row */}
      <div className='flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 sm:gap-3 w-full'>
        <div className='relative flex-1 w-full max-w-none sm:max-w-xs'>
          <Search className='absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400' />
          <Input
            className='pl-9 text-xs sm:text-sm h-10 bg-white'
            placeholder='Search assignments...'
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        <Select value={collegeFilter} onValueChange={setCollegeFilter}>
          <SelectTrigger className='w-full sm:w-[180px] text-xs sm:text-sm h-10 bg-white'>
            <SelectValue placeholder='All Colleges' />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value='all'>All Colleges</SelectItem>
            {uniqueColleges.map(([id, name]) => (
              <SelectItem key={id} value={id}>
                {name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Bulk action bar */}
      {selectedIds.size > 0 && (
        <div className='flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5 rounded-xl bg-blue-50 border border-blue-200 px-3.5 sm:px-4 py-2.5 shadow-xs'>
          <span className='text-xs sm:text-sm font-medium text-blue-800 text-center sm:text-left'>
            {selectedIds.size} assignment{selectedIds.size > 1 ? 's' : ''}{' '}
            selected
          </span>
          <div className='flex items-center justify-end gap-2'>
            <Button
              size='sm'
              variant='ghost'
              className='h-8 text-xs text-slate-600 hover:text-slate-800 flex-1 sm:flex-initial'
              onClick={() => setSelectedIds(new Set())}
            >
              <X className='w-3.5 h-3.5 mr-1' />
              Clear
            </Button>
            <Button
              size='sm'
              className='h-8 text-xs bg-red-600 hover:bg-red-700 text-white flex-1 sm:flex-initial'
              onClick={() => setBulkDeleteOpen(true)}
            >
              <Trash2 className='w-3.5 h-3.5 mr-1' />
              Delete Selected
            </Button>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className='grid grid-cols-3 sm:inline-flex items-center gap-1 rounded-xl bg-slate-100 p-1 w-full sm:w-auto shrink-0'>
        {tabs.map((tab) => (
          <button
            key={tab.value}
            onClick={() => setActiveTab(tab.value)}
            className={cn(
              'flex items-center justify-center gap-1 sm:gap-2 px-1.5 sm:px-4 py-2 rounded-lg text-xs sm:text-sm font-bold transition-all min-h-[38px] text-center',
              activeTab === tab.value
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-500 hover:text-slate-800',
            )}
          >
            <span className='truncate hidden sm:inline'>{tab.label}</span>
            <span className='truncate sm:hidden'>{tab.shortLabel}</span>
            {tab.dot && <span className={`w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full shrink-0 ${tab.dot}`} />}
          </button>
        ))}
      </div>

      {/* Main Table / Mobile Cards */}
      <Card className='border-none shadow-sm overflow-hidden min-w-0'>
        <CardContent className='p-0'>
          {/* Mobile Card View (< md): Zero horizontal scroll */}
          <div className='md:hidden divide-y divide-slate-100'>
            {loading ? (
              <div className='py-12 flex justify-center'>
                <Loader2 className='w-6 h-6 animate-spin text-blue-600' />
              </div>
            ) : filtered.length === 0 ? (
              <div className='py-12 text-center text-slate-500 text-xs sm:text-sm'>
                No assignments found.
              </div>
            ) : (
              paginated.map((assignment) => (
                <div
                  key={assignment.id}
                  className={`p-3.5 space-y-2.5 bg-white transition-colors ${
                    selectedIds.has(assignment.id) ? 'bg-blue-50/40' : ''
                  }`}
                >
                  {/* Top: Checkbox + Name + Status */}
                  <div className='flex items-start gap-2.5 justify-between'>
                    <div className='flex items-start gap-2.5 min-w-0 flex-1'>
                      <Checkbox
                        checked={selectedIds.has(assignment.id)}
                        onCheckedChange={() => toggleSelect(assignment.id)}
                        className='mt-0.5'
                      />
                      <div className='min-w-0 flex-1'>
                        <p className='font-bold text-xs sm:text-sm text-slate-900 line-clamp-2 leading-snug'>
                          {assignment.name}
                        </p>
                      </div>
                    </div>
                    <div className='shrink-0'>{getStatusBadge(assignment.status)}</div>
                  </div>

                  {/* Academic details box */}
                  <div className='text-[11px] bg-slate-50/80 p-2.5 rounded-lg border border-slate-100 space-y-1.5'>
                    <div className='flex items-center justify-between gap-2'>
                      <span className='font-semibold text-slate-800 truncate'>
                        {assignment.course}
                      </span>
                      <span className='text-slate-500 font-medium shrink-0 max-w-[140px] truncate' title={assignment.college}>
                        {assignment.college}
                      </span>
                    </div>
                    <div className='flex items-center justify-between gap-2 pt-1 border-t border-slate-200/50 text-slate-500'>
                      <div className='flex items-center gap-1.5'>
                        <span className='font-medium'>{assignment.batch}</span>
                        <span className='text-slate-300'>•</span>
                        <span className={`font-bold ${
                          assignment.submissionsCount === assignment.submissionsTotal
                            ? 'text-emerald-600'
                            : 'text-amber-600'
                        }`}>
                          {assignment.submissionsCount}/{assignment.submissionsTotal} submitted
                        </span>
                      </div>
                      <span className='text-slate-400 shrink-0 font-medium'>
                        Due {assignment.dueDate}
                      </span>
                    </div>
                  </div>

                  {/* Action Buttons */}
                  <div className='flex items-center justify-end gap-1.5 pt-1 border-t border-slate-50'>
                    {activeTab === 'Active' && (
                      <button
                        className='flex items-center gap-1 px-2.5 py-1 rounded-lg bg-blue-50 text-xs text-blue-600 hover:bg-blue-100 font-semibold'
                        onClick={() => {
                          navigate(`${basePath}/create-assignment`, {
                            state: {
                              editId: assignment.id,
                              title: assignment.name,
                              course: assignment.course === 'N/A' ? '' : assignment.course,
                              collegeId: assignment.collegeId,
                              deadline: assignment.rawDueDate || '',
                              description: '',
                            },
                          });
                        }}
                      >
                        <Edit3 className='w-3 h-3' />
                        Edit
                      </button>
                    )}

                    {activeTab === 'Submitted' && (
                      <>
                        <button
                          className='flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-50 text-xs text-emerald-700 hover:bg-emerald-100 font-semibold disabled:opacity-50'
                          disabled={runningEvalId === assignment.id}
                          onClick={() => handleRunEvaluation(assignment)}
                        >
                          {runningEvalId === assignment.id ? (
                            <Loader2 className='w-3 h-3 animate-spin' />
                          ) : (
                            <Play className='w-3 h-3' />
                          )}
                          Evaluate
                        </button>
                        <button
                          className='flex items-center gap-1 px-2.5 py-1 rounded-lg bg-blue-50 text-xs text-blue-600 hover:bg-blue-100 font-semibold'
                          onClick={() => handleViewResults(assignment)}
                        >
                          <Eye className='w-3 h-3' />
                          Submissions
                        </button>
                      </>
                    )}

                    {activeTab === 'Completed' && (
                      <>
                        <button
                          className='flex items-center gap-1 px-2.5 py-1 rounded-lg bg-blue-50 text-xs text-blue-600 hover:bg-blue-100 font-semibold'
                          onClick={() => handleViewResults(assignment)}
                        >
                          <Eye className='w-3 h-3' />
                          View
                        </button>
                        <button
                          className='flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-100 text-xs text-slate-700 hover:bg-slate-200 font-semibold'
                          onClick={() => handleViewResults(assignment)}
                        >
                          <BarChart2 className='w-3 h-3' />
                          Analytics
                        </button>
                      </>
                    )}

                    <button
                      className='flex items-center gap-1 px-2.5 py-1 rounded-lg bg-red-50 text-xs text-red-600 hover:bg-red-100 font-semibold'
                      onClick={() => setDeleteTarget(assignment)}
                    >
                      <Trash2 className='w-3 h-3' />
                      Delete
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Desktop Table View (>= md) */}
          <div className='hidden md:block overflow-x-auto custom-scrollbar w-full min-w-0'>
            <Table className='min-w-[850px]'>
              <TableHeader className='bg-slate-50/50'>
                <TableRow>
                  <TableHead className='w-10 pl-4'>
                    <Checkbox
                      checked={allFilteredSelected}
                      data-state={
                        someFilteredSelected && !allFilteredSelected
                          ? 'indeterminate'
                          : undefined
                      }
                      onCheckedChange={toggleSelectAll}
                      disabled={filtered.length === 0}
                    />
                  </TableHead>
                  <TableHead className='pl-2 text-[11px] sm:text-xs font-bold uppercase'>Assignment Name</TableHead>
                  <TableHead className='text-[11px] sm:text-xs font-bold uppercase'>Course</TableHead>
                  <TableHead className='text-[11px] sm:text-xs font-bold uppercase'>College</TableHead>
                  <TableHead className='text-[11px] sm:text-xs font-bold uppercase'>Batch</TableHead>
                  <TableHead className='text-[11px] sm:text-xs font-bold uppercase'>Submissions</TableHead>
                  <TableHead className='text-[11px] sm:text-xs font-bold uppercase'>Due Date</TableHead>
                  <TableHead className='text-[11px] sm:text-xs font-bold uppercase'>Status</TableHead>
                  <TableHead className='text-right pr-6 text-[11px] sm:text-xs font-bold uppercase'>Actions</TableHead>
                </TableRow>
              </TableHeader>

            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell
                    colSpan={9}
                    className='h-40 text-center text-slate-500'
                  >
                    <div className='flex flex-col items-center justify-center gap-2'>
                      <Loader2 className='w-6 h-6 animate-spin text-blue-600' />
                      <p>Loading assignments...</p>
                    </div>
                  </TableCell>
                </TableRow>
              ) : filtered.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={9}
                    className='h-40 text-center text-slate-500'
                  >
                    No assignments found.
                  </TableCell>
                </TableRow>
              ) : (
                paginated.map((assignment) => (
                  <TableRow
                    key={assignment.id}
                    className={`hover:bg-slate-50/50 ${selectedIds.has(assignment.id) ? 'bg-blue-50/50' : ''}`}
                  >
                    <TableCell className='w-10 pl-4'>
                      <Checkbox
                        checked={selectedIds.has(assignment.id)}
                        onCheckedChange={() => toggleSelect(assignment.id)}
                      />
                    </TableCell>
                    <TableCell className='pl-2 font-medium text-slate-800 text-sm'>
                      {assignment.name}
                    </TableCell>
                    <TableCell className='text-slate-500 text-sm'>
                      {assignment.course}
                    </TableCell>
                    <TableCell className='text-slate-500 text-sm'>
                      {assignment.college}
                    </TableCell>
                    <TableCell className='text-slate-500 text-sm'>
                      {assignment.batch}
                    </TableCell>
                    <TableCell>
                      <span
                        className={`text-sm font-semibold ${
                          assignment.submissionsCount ===
                          assignment.submissionsTotal
                            ? 'text-emerald-600'
                            : 'text-amber-600'
                        }`}
                      >
                        {assignment.submissionsCount}/
                        {assignment.submissionsTotal}
                      </span>
                    </TableCell>
                    <TableCell className='text-slate-500 text-sm'>
                      {assignment.dueDate}
                    </TableCell>
                    <TableCell>{getStatusBadge(assignment.status)}</TableCell>
                    <TableCell className='text-right pr-6'>
                      <div className='flex items-center justify-end gap-3'>
                        {activeTab === 'Active' && (
                          <button
                            className='flex items-center gap-1.5 text-sm text-blue-600 hover:text-blue-700 transition font-medium'
                            onClick={() => {
                              navigate(`${basePath}/create-assignment`, {
                                state: {
                                  editId: assignment.id,
                                  title: assignment.name,
                                  course:
                                    assignment.course === 'N/A'
                                      ? ''
                                      : assignment.course,
                                  collegeId: assignment.collegeId,
                                  deadline: assignment.rawDueDate || '',
                                  description: '',
                                },
                              });
                            }}
                          >
                            <Edit3 className='w-3.5 h-3.5' />
                            Edit
                          </button>
                        )}

                        {activeTab === 'Submitted' && (
                          <>
                            <button
                              className='flex items-center gap-1.5 text-sm text-emerald-600 hover:text-emerald-700 transition font-medium disabled:opacity-50'
                              disabled={runningEvalId === assignment.id}
                              onClick={() => handleRunEvaluation(assignment)}
                            >
                              {runningEvalId === assignment.id ? (
                                <Loader2 className='w-3.5 h-3.5 animate-spin' />
                              ) : (
                                <Play className='w-3.5 h-3.5' />
                              )}
                              Run Evaluation
                            </button>
                            <button
                              className='flex items-center gap-1.5 text-sm text-blue-600 hover:text-blue-700 transition font-medium'
                              onClick={() => handleViewResults(assignment)}
                            >
                              <Eye className='w-3.5 h-3.5' />
                              View Submissions
                            </button>
                          </>
                        )}
                        {activeTab === 'Completed' && (
                          <>
                            <button
                              className='flex items-center gap-1.5 text-sm text-blue-600 hover:text-blue-700 transition font-medium'
                              onClick={() => handleViewResults(assignment)}
                            >
                              <Eye className='w-3.5 h-3.5' />
                              View
                            </button>
                            <button
                              className='flex items-center gap-1.5 text-sm text-slate-600 hover:text-slate-700 transition font-medium'
                              onClick={() => handleViewResults(assignment)}
                            >
                              <BarChart2 className='w-3.5 h-3.5' />
                              Analytics
                            </button>
                          </>
                        )}
                        <button
                          className='flex items-center gap-1.5 text-sm text-red-500 hover:text-red-600 transition font-medium'
                          onClick={() => setDeleteTarget(assignment)}
                        >
                          <Trash2 className='w-3.5 h-3.5' />
                          Delete
                        </button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
          </div>

          {/* Pagination Footer */}
          {filtered.length > 0 && totalPages > 1 && (
            <div className='flex flex-col sm:flex-row items-center justify-between gap-3 px-4 py-3 bg-slate-50/70 border-t border-slate-100'>
              <p className='text-[11px] sm:text-xs text-slate-500 font-medium'>
                Showing <span className='font-bold text-slate-800'>{(currentPage - 1) * pageSize + 1}</span> to{' '}
                <span className='font-bold text-slate-800'>{Math.min(currentPage * pageSize, filtered.length)}</span> of{' '}
                <span className='font-bold text-slate-800'>{filtered.length}</span> assignments
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
        </CardContent>
      </Card>

      <AlertDialog
        open={bulkDeleteOpen}
        onOpenChange={(open) => !open && setBulkDeleteOpen(false)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Delete {selectedIds.size} Assignment
              {selectedIds.size > 1 ? 's' : ''}
            </AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete {selectedIds.size} selected
              assignment{selectedIds.size > 1 ? 's' : ''} and all their
              submissions. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className='bg-red-600 hover:bg-red-700 focus:ring-red-600'
              disabled={deleting}
              onClick={handleBulkDelete}
            >
              {deleting ? (
                <>
                  <Loader2 className='mr-2 h-4 w-4 animate-spin' />
                  Deleting...
                </>
              ) : (
                `Delete ${selectedIds.size}`
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Assignment</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete{' '}
              <span className='font-semibold text-slate-800'>
                "{deleteTarget?.name}"
              </span>
              ? This will permanently remove the assignment and all its
              submissions. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className='bg-red-600 hover:bg-red-700 focus:ring-red-600'
              disabled={deleting}
              onClick={handleDelete}
            >
              {deleting ? (
                <>
                  <Loader2 className='mr-2 h-4 w-4 animate-spin' />
                  Deleting...
                </>
              ) : (
                'Delete'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
