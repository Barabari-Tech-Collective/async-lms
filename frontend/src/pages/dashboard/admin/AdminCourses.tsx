import { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import { getErrorMessage } from '@/lib/utils';
import type { Subject } from '@/utils/types';
import {
  Search,
  Plus,
  MoreVertical,
  BookOpen,
  Layers,
  Loader2,
  Edit2,
  Trash2,
  Globe,
  Lock,
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { CreateCourseModal } from '@/components/common/admin/CreateCourseModal';
import { ManageAccessModal } from '@/components/common/admin/ManageAccessModal';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { useAppDispatch, useAppSelector } from '@/app/hooks';
import { fetchSubjects, deleteSubject } from '@/features/subjects/subjectSlice';

export default function AdminCourses() {
  const dispatch = useAppDispatch();
  const { items: courses, status } = useAppSelector((state) => state.subjects);
  const loading = status === 'loading';

  const [searchQuery, setSearchQuery] = useState('');
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isAccessModalOpen, setIsAccessModalOpen] = useState(false);
  const [selectedCourse, setSelectedCourse] = useState<Subject | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<{
    id: string;
    label?: string;
  } | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    dispatch(fetchSubjects());
  }, [dispatch]);

  const handleDelete = async (id: string) => {
    try {
      setDeleting(true);
      await dispatch(deleteSubject(id)).unwrap();
      toast.success('Course deleted');
    } catch (error) {
      toast.error(
        getErrorMessage(error, 'Failed to delete course. Please try again.'),
      );
    } finally {
      setDeleting(false);
    }
  };

  const handleRefresh = () => {
    dispatch(fetchSubjects());
  };

  const filteredCourses = courses.filter((c) =>
    c.name.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  return (
    <div className='space-y-4 sm:space-y-6 min-w-0 animate-in fade-in duration-300'>
      {/* Top Search & Actions Bar */}
      <div className='flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3'>
        <div className='relative w-full sm:max-w-md'>
          <Search className='absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4' />
          <Input
            placeholder='Search courses...'
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className='pl-9 bg-white border-slate-200 rounded-xl h-10 sm:h-11 text-xs sm:text-sm'
          />
        </div>
        <Button
          onClick={() => {
            setSelectedCourse(null);
            setIsCreateModalOpen(true);
          }}
          className='bg-[#2e3c85] hover:bg-[#25316d] text-white gap-2 min-h-[40px] rounded-xl font-semibold shadow-xs shrink-0'
        >
          <Plus className='w-4 h-4' /> Create Course
        </Button>
      </div>

      {loading ? (
        <div className='flex justify-center py-20'>
          <Loader2 className='w-8 h-8 animate-spin text-indigo-500' />
        </div>
      ) : filteredCourses.length === 0 ? (
        <div className='text-center py-20 text-slate-400 text-xs sm:text-sm bg-white rounded-2xl border border-slate-200/80 p-8'>
          No courses found matching your search.
        </div>
      ) : (
        <div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6'>
          {filteredCourses.map((course) => (
            <Card
              key={course.id}
              className='border py-0 border-slate-200/80 overflow-hidden bg-white rounded-2xl shadow-xs hover:shadow-md transition-shadow flex flex-col justify-between'
            >
              <div>
                <div
                  className={`h-1.5 w-full ${
                    course.is_published ? 'bg-emerald-500' : 'bg-amber-500'
                  }`}
                />
                <CardHeader className='p-4 sm:p-5 pb-3 space-y-3 overflow-hidden'>
                  <div className='flex justify-between items-start gap-2'>
                    <div className='flex items-center gap-1.5 min-w-0 flex-1 flex-wrap'>
                      <Badge
                        variant='secondary'
                        className='font-bold text-[10px] uppercase whitespace-normal break-words leading-tight bg-slate-100 text-slate-700'
                      >
                        {course.slug.replace(/-?\d+$/, '')}
                      </Badge>
                      {course.is_published ? (
                        <Badge className='bg-emerald-50 text-emerald-700 border-emerald-200 flex gap-1 items-center text-[10px] shrink-0 whitespace-nowrap font-semibold'>
                          <Globe className='w-3 h-3' /> Published
                        </Badge>
                      ) : (
                        <Badge className='bg-amber-50 text-amber-700 border-amber-200 flex gap-1 items-center text-[10px] shrink-0 whitespace-nowrap font-semibold'>
                          <Lock className='w-3 h-3' /> Draft
                        </Badge>
                      )}
                    </div>

                    <DropdownMenu>
                      <DropdownMenuTrigger className='p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 focus:outline-none min-h-[32px] min-w-[32px] flex items-center justify-center'>
                        <MoreVertical className='w-4 h-4' />
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align='end' className='w-40 rounded-xl shadow-lg border border-slate-200'>
                        <DropdownMenuItem
                          onClick={() => {
                            setSelectedCourse(course);
                            setIsCreateModalOpen(true);
                          }}
                          className='gap-2 cursor-pointer font-medium'
                        >
                          <Edit2 className='w-4 h-4' /> Edit Details
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() =>
                            setConfirmDelete({
                              id: course.id,
                              label: course.name,
                            })
                          }
                          className='gap-2 cursor-pointer text-red-600 focus:text-red-700 focus:bg-red-50 font-medium'
                        >
                          <Trash2 className='w-4 h-4' /> Delete Course
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>

                  <div className='min-w-0'>
                    <h3 className='text-base sm:text-lg font-bold text-slate-900 break-words leading-snug'>
                      {course.name}
                    </h3>
                    <p className='text-xs sm:text-sm text-slate-500 line-clamp-2 mt-1 leading-relaxed'>
                      {course.description || 'No description provided.'}
                    </p>
                  </div>
                </CardHeader>
              </div>

              <CardContent className='p-4 sm:p-5 pt-2 border-t border-slate-100'>
                <div className='flex items-center justify-between gap-2 flex-wrap'>
                  <div className='flex items-center gap-3 text-slate-500 text-xs font-medium'>
                    <span className='flex items-center gap-1'>
                      <BookOpen className='w-3.5 h-3.5 text-slate-400' /> {course.units_count ?? 0} Units
                    </span>
                    <span className='flex items-center gap-1'>
                      <Layers className='w-3.5 h-3.5 text-slate-400' /> {course.topics_count ?? 0} Lessons
                    </span>
                  </div>
                  <button
                    onClick={() => {
                      setSelectedCourse(course);
                      setIsAccessModalOpen(true);
                    }}
                    className='text-indigo-600 font-bold text-xs hover:text-indigo-800 transition-colors py-1'
                  >
                    Manage Access →
                  </button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <CreateCourseModal
        open={isCreateModalOpen}
        onOpenChange={setIsCreateModalOpen}
        onSuccess={handleRefresh}
        editData={selectedCourse}
      />

      {selectedCourse && (
        <ManageAccessModal
          open={isAccessModalOpen}
          onOpenChange={setIsAccessModalOpen}
          courseId={selectedCourse.id}
          courseName={selectedCourse.name}
        />
      )}

      <ConfirmDialog
        open={!!confirmDelete}
        onOpenChange={(open) => {
          if (!open) setConfirmDelete(null);
        }}
        title='Delete Course'
        description={
          <>
            Are you sure you want to delete{' '}
            <span className='font-semibold'>
              {confirmDelete?.label ?? 'this course'}
            </span>
            ? This action cannot be undone.
          </>
        }
        confirmLabel='Delete'
        loading={deleting}
        onConfirm={async () => {
          if (!confirmDelete) return;
          await handleDelete(confirmDelete.id);
          setConfirmDelete(null);
        }}
      />
    </div>
  );
}
