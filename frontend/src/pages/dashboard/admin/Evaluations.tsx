import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { Loader2, Clock, AlertCircle, CheckCircle } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import apiClient from '@/services/api';

interface Submission {
  id: string;
  student_name: string;
  subject_short: string;
  task_name: string;
  type: 'Mini Project' | 'Code' | 'Design';
  submitted_at: string;
  status: 'PENDING' | 'CHANGES REQUESTED' | 'GRADED';
}

const Evaluations = () => {
  const navigate = useNavigate();
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'pending' | 'history'>('pending');

  useEffect(() => {
    const fetchSubmissions = async () => {
      try {
        const response = await apiClient.get<Submission[]>(
          '/admin/project-submissions'
        );
        setSubmissions(response.data);
      } catch {
        // submissions remains empty — empty state is shown below
      } finally {
        setLoading(false);
      }
    };
    fetchSubmissions();
  }, []);

  const pendingSubmissions = submissions.filter((s) => s.status !== 'GRADED');
  const gradedSubmissions = submissions.filter((s) => s.status === 'GRADED');

  const visibleSubmissions =
    activeTab === 'pending' ? pendingSubmissions : gradedSubmissions;

  if (loading) {
    return (
      <div className='flex h-96 items-center justify-center'>
        <Loader2 className='w-8 h-8 animate-spin text-blue-600' />
      </div>
    );
  }

  return (
    <div className='space-y-4 sm:space-y-6 min-w-0 animate-in fade-in duration-300'>
      {/* Header & Tabs */}
      <div className='flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3'>
        <div className='bg-slate-100 p-1 rounded-2xl flex gap-1 w-full sm:w-auto overflow-x-auto no-scrollbar'>
          <Button
            variant={activeTab === 'pending' ? 'secondary' : 'ghost'}
            size='sm'
            className={`rounded-xl text-xs sm:text-sm font-semibold shrink-0 py-2 px-3 sm:px-4 min-h-[38px] ${
              activeTab === 'pending' ? 'shadow-xs bg-white text-slate-900' : 'text-slate-500'
            }`}
            onClick={() => setActiveTab('pending')}
          >
            Pending Review ({pendingSubmissions.length})
          </Button>
          <Button
            variant={activeTab === 'history' ? 'secondary' : 'ghost'}
            size='sm'
            className={`rounded-xl text-xs sm:text-sm font-semibold shrink-0 py-2 px-3 sm:px-4 min-h-[38px] ${
              activeTab === 'history' ? 'shadow-xs bg-white text-slate-900' : 'text-slate-500'
            }`}
            onClick={() => setActiveTab('history')}
          >
            Grading History ({gradedSubmissions.length})
          </Button>
        </div>
      </div>

      {/* Table */}
      <Card className='border border-slate-200/80 shadow-xs rounded-2xl overflow-hidden bg-white min-w-0'>
        <div className='overflow-x-auto custom-scrollbar w-full min-w-0'>
          <Table className='min-w-[640px] text-xs sm:text-sm'>
            <TableHeader className='bg-slate-50 border-b border-slate-100'>
              <TableRow>
                <TableHead className='text-[11px] font-bold uppercase text-slate-500 py-3.5 pl-4 sm:pl-6'>
                  Student
                </TableHead>
                <TableHead className='text-[11px] font-bold uppercase text-slate-500 py-3.5'>
                  Task
                </TableHead>
                <TableHead className='text-[11px] font-bold uppercase text-slate-500 py-3.5'>
                  Type
                </TableHead>
                <TableHead className='text-[11px] font-bold uppercase text-slate-500 py-3.5'>
                  Submitted
                </TableHead>
                <TableHead className='text-[11px] font-bold uppercase text-slate-500 py-3.5'>
                  Status
                </TableHead>
                <TableHead className='text-[11px] font-bold uppercase text-slate-500 text-right py-3.5 pr-4 sm:pr-6'>
                  Action
                </TableHead>
              </TableRow>
            </TableHeader>

            <TableBody className='divide-y divide-slate-100'>
              {visibleSubmissions.map((sub) => (
                <TableRow key={sub.id} className='hover:bg-slate-50/60 transition-colors'>
                  <TableCell className='pl-4 sm:pl-6 py-3.5'>
                    <p className='font-bold text-slate-900 truncate'>{sub.student_name}</p>
                    <p className='text-xs text-slate-400 truncate'>{sub.subject_short}</p>
                  </TableCell>

                  <TableCell className='font-medium text-slate-700 py-3.5'>
                    <span className='truncate block max-w-[200px]'>{sub.task_name}</span>
                  </TableCell>

                  <TableCell className='py-3.5 whitespace-nowrap'>
                    <Badge className='bg-blue-50 text-blue-700 border-blue-200 font-semibold text-[11px]'>
                      {sub.type}
                    </Badge>
                  </TableCell>

                  <TableCell className='text-xs sm:text-sm text-slate-500 py-3.5 whitespace-nowrap'>
                    {new Date(sub.submitted_at)
                      .toLocaleString('en-GB', {
                        day: '2-digit',
                        month: '2-digit',
                        year: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })
                      .replace(',', '')}
                  </TableCell>

                  <TableCell className='py-3.5 whitespace-nowrap'>
                    {sub.status === 'PENDING' && (
                      <StatusBadge
                        icon={Clock}
                        text='PENDING'
                        className='bg-blue-50 text-blue-700 border border-blue-200/60'
                      />
                    )}
                    {sub.status === 'CHANGES REQUESTED' && (
                      <StatusBadge
                        icon={AlertCircle}
                        text='CHANGES'
                        className='bg-orange-50 text-orange-700 border border-orange-200/60'
                      />
                    )}
                    {sub.status === 'GRADED' && (
                      <StatusBadge
                        icon={CheckCircle}
                        text='GRADED'
                        className='bg-emerald-50 text-emerald-700 border border-emerald-200/60'
                      />
                    )}
                  </TableCell>

                  <TableCell className='text-right pr-4 sm:pr-6 py-3.5 whitespace-nowrap'>
                    <Button
                      variant='ghost'
                      className='text-indigo-600 font-bold hover:text-indigo-800 hover:bg-indigo-50 text-xs rounded-xl min-h-[34px]'
                      onClick={() => navigate(`/admin/evaluate/${sub.id}`)}
                    >
                      {sub.status === 'GRADED' ? 'View Review' : 'Grade Now →'}
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        {visibleSubmissions.length === 0 && (
          <div className='p-12 sm:p-16 text-center'>
            <p className='text-slate-400 text-xs sm:text-sm'>
              {activeTab === 'pending'
                ? 'No submissions pending review.'
                : 'No grading history available.'}
            </p>
          </div>
        )}
      </Card>
    </div>
  );
};

export default Evaluations;

/* ======================
   Small Helper
====================== */

function StatusBadge({
  icon: Icon,
  text,
  className,
}: {
  icon: React.ComponentType<{ className?: string }>;
  text: string;
  className: string;
}) {
  return (
    <div
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-bold ${className}`}
    >
      <Icon className='w-3.5 h-3.5' />
      {text}
    </div>
  );
}
