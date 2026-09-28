import { useEffect, useState } from 'react';
import { Search, Filter, Eye, MoreHorizontal } from 'lucide-react';
import StudentProfileDialog from '@/components/common/StudentProfileDialog';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import apiClient from '@/services/api';

// Defined based on your actual API response
interface Student {
  id: string;
  full_name: string;
  email: string;
  degree: string;
  batch: number;
  joined_date: string;
  role: 'student';
  college_name: string;
  college_short_name: string;
}

const Students = () => {
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [profileId, setProfileId] = useState<string | null>(null);

  useEffect(() => {
    const fetchStudents = async () => {
      try {
        const response = await apiClient.get<Student[]>('/admin/all-students');
        setStudents(response.data);
      } catch {
        // students remains empty — empty state is shown below
      } finally {
        setLoading(false);
      }
    };
    fetchStudents();
  }, []);

  // Explicitly type the filter callback
  const filteredStudents = students.filter(
    (s: Student) =>
      s.full_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      s.email.toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (loading)
    return (
      <div className='space-y-4 sm:space-y-6 min-w-0'>
        <div className='flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4'>
          <Skeleton className='h-10 w-full sm:w-96 rounded-xl' />
          <Skeleton className='h-10 w-32 rounded-xl' />
        </div>
        <Card className='border border-slate-200/80 shadow-xs rounded-2xl overflow-hidden bg-white'>
          <div className='bg-slate-50/50 px-4 py-3 grid grid-cols-5 gap-4'>
            {[...Array(5)].map((_, i) => <Skeleton key={i} className='h-3 w-full' />)}
          </div>
          {[...Array(8)].map((_, i) => (
            <div key={i} className='px-4 py-4 border-t border-slate-100 grid grid-cols-5 gap-4 items-center'>
              <div className='flex items-center gap-3'>
                <Skeleton className='h-9 w-9 rounded-full shrink-0' />
                <div className='space-y-1.5 flex-1'>
                  <Skeleton className='h-3.5 w-full' />
                  <Skeleton className='h-3 w-3/4' />
                </div>
              </div>
              <div className='space-y-1.5'>
                <Skeleton className='h-3.5 w-16' />
                <Skeleton className='h-3 w-full' />
              </div>
              <Skeleton className='h-6 w-16 rounded-md' />
              <Skeleton className='h-3.5 w-24' />
              <div className='flex justify-end gap-1'>
                <Skeleton className='h-8 w-8 rounded' />
                <Skeleton className='h-8 w-8 rounded' />
              </div>
            </div>
          ))}
        </Card>
      </div>
    );

  return (
    <div className='space-y-4 sm:space-y-6 min-w-0 animate-in fade-in duration-300'>
      {/* Filters Header */}
      <div className='flex flex-col sm:flex-row justify-between items-stretch sm:items-center gap-3'>
        <div className='relative w-full sm:w-96'>
          <Search className='absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400' />
          <Input
            placeholder='Search student by name or email...'
            className='pl-9 bg-white border-slate-200 h-10 rounded-xl text-xs sm:text-sm shadow-xs'
            value={searchQuery}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
              setSearchQuery(e.target.value)
            }
          />
        </div>
        <div className='flex items-center justify-between sm:justify-end gap-3 w-full sm:w-auto'>
          <Button variant='outline' className='bg-white border-slate-200 rounded-xl min-h-[40px] text-xs sm:text-sm font-semibold shadow-xs'>
            <Filter className='w-3.5 h-3.5 mr-2 text-slate-500' /> All Colleges
          </Button>
          <p className='text-xs font-semibold text-slate-400 whitespace-nowrap'>
            Showing <strong className='text-slate-800'>{filteredStudents.length}</strong> students
          </p>
        </div>
      </div>

      {/* Students Table */}
      <Card className='border border-slate-200/80 shadow-xs rounded-2xl overflow-hidden bg-white min-w-0'>
        <div className='overflow-x-auto custom-scrollbar w-full min-w-0'>
          <Table className='min-w-[620px] text-xs sm:text-sm'>
            <TableHeader className='bg-slate-50 border-b border-slate-100'>
              <TableRow>
                <TableHead className='font-bold text-slate-600 uppercase text-[11px] py-3.5 pl-4 sm:pl-6'>
                  Student Name
                </TableHead>
                <TableHead className='font-bold text-slate-600 uppercase text-[11px] py-3.5'>
                  College
                </TableHead>
                <TableHead className='font-bold text-slate-600 uppercase text-[11px] py-3.5'>
                  Batch
                </TableHead>
                <TableHead className='font-bold text-slate-600 uppercase text-[11px] py-3.5'>
                  Joined Date
                </TableHead>
                <TableHead className='font-bold text-slate-600 text-right uppercase text-[11px] py-3.5 pr-4 sm:pr-6'>
                  Actions
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody className='divide-y divide-slate-100'>
              {filteredStudents.map((student) => (
                <TableRow key={student.id} className='hover:bg-slate-50/60 transition-colors'>
                  <TableCell className='pl-4 sm:pl-6 py-3.5'>
                    <div className='flex items-center gap-3 min-w-0'>
                      <div className='w-9 h-9 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center font-bold text-xs shrink-0 border border-blue-100'>
                        {student.full_name
                          .split(' ')
                          .map((n) => n[0])
                          .join('')
                          .slice(0, 2)}
                      </div>
                      <div className='min-w-0'>
                        <p className='font-bold text-slate-900 truncate'>
                          {student.full_name}
                        </p>
                        <p className='text-xs text-slate-500 truncate'>
                          {student.email}
                        </p>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className='py-3.5'>
                    <p className='text-xs sm:text-sm text-slate-700 truncate max-w-[180px]'>
                      {student.college_name || 'N/A'}
                    </p>
                  </TableCell>
                  <TableCell className='py-3.5 whitespace-nowrap'>
                    <span className='px-2.5 py-1 rounded-lg bg-blue-50 text-blue-700 text-xs font-semibold border border-blue-200/60'>
                      Year {student.batch}
                    </span>
                  </TableCell>
                  <TableCell className='text-slate-500 text-xs sm:text-sm py-3.5 whitespace-nowrap'>
                    {new Date(student.joined_date).toLocaleDateString('en-GB', {
                      day: '2-digit',
                      month: 'short',
                      year: 'numeric',
                    })}
                  </TableCell>
                  <TableCell className='text-right pr-4 sm:pr-6 py-3.5'>
                    <div className='flex items-center justify-end gap-1'>
                      <Button
                        variant='ghost'
                        size='icon'
                        className='h-8 w-8 text-slate-400 hover:text-indigo-600 rounded-lg'
                        onClick={() => setProfileId(student.id)}
                        title='View Profile'
                      >
                        <Eye className='w-4 h-4' />
                      </Button>
                      <Button
                        variant='ghost'
                        size='icon'
                        className='h-8 w-8 text-slate-400 hover:text-slate-700 rounded-lg'
                        title='More Actions'
                      >
                        <MoreHorizontal className='w-4 h-4' />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        {filteredStudents.length === 0 && (
          <div className='p-12 sm:p-16 text-center'>
            <p className='text-slate-400 text-xs sm:text-sm'>
              No students found matching your search.
            </p>
          </div>
        )}
      </Card>

      <StudentProfileDialog
        studentId={profileId}
        apiPrefix='admin'
        onClose={() => setProfileId(null)}
      />
    </div>
  );
};

export default Students;
