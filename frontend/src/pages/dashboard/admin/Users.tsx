import { useEffect, useMemo, useState } from 'react';
import { Pencil, Eye, EyeOff, Search, Loader2, ChevronLeft, ChevronRight, Trash2, Archive, UserPlus, Building2 } from 'lucide-react';
import StudentProfileDialog from '@/components/common/StudentProfileDialog';
import FacilitatorProfileDialog from '@/components/common/FacilitatorProfileDialog';
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
import toast from 'react-hot-toast';
import { getErrorMessage } from '@/lib/utils';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import apiClient from '@/services/api';
import { useAppSelector } from '@/app/hooks';
import { selectUser } from '@/features/auth/authSelectors';

type UserRole = 'student' | 'facilitator' | 'admin' | 'curriculum_developer';
type ActiveTab = 'student' | 'facilitator' | 'curriculum_developer';

interface College {
  id: string;
  name: string;
  short_code: string;
}

interface UserRow {
  id: string;
  full_name: string;
  email: string;
  role: UserRole;
  degree?: string | null;
  year?: number | null;
  college_id?: string | null;
  college_name?: string | null;
  college_short_name?: string | null;
  enrolled_courses?: number;
  completed_subtopics?: number;
  total_subtopics?: number;
  progress_percent?: number;
  facilitator_college_ids?: string[];
  facilitator_college_names?: string[];
  facilitator_subject_ids?: string[];
  facilitator_subject_names?: string[];
  domain?: string | null;
  role_focus?: string | null;
  is_verified: boolean;
  created_at: string;
}

interface Subject {
  id: string;
  name: string;
}

interface CollegesResponse {
  success: boolean;
  data: College[];
}

interface EditForm {
  full_name: string;
  degree: string;
  year: string;
  college_id: string;
  facilitator_college_ids: string[];
  facilitator_subject_ids: string[];
  domain?: string;
  role_focus?: string;
}

const Users = () => {
  const currentUser = useAppSelector(selectUser);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [colleges, setColleges] = useState<College[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState<ActiveTab>('student');
  const [selectedCollegeId, setSelectedCollegeId] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const PAGE_SIZE = 15;
  const [editingUser, setEditingUser] = useState<UserRow | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [profileId, setProfileId] = useState<string | null>(null);
  const [facilitatorProfileId, setFacilitatorProfileId] = useState<string | null>(null);
  const [isBinOpen, setIsBinOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState({
    full_name: '',
    email: '',
    password: '',
    confirm_password: '',
    domain: '',
    role_focus: '',
  });
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [userToDelete, setUserToDelete] = useState<UserRow | null>(null);
  const [form, setForm] = useState<EditForm>({
    full_name: '',
    degree: '',
    year: '',
    college_id: '',
    facilitator_college_ids: [],
    facilitator_subject_ids: [],
    domain: '',
    role_focus: '',
  });

  const fetchUsers = async () => {
    try {
      const [usersRes, collegesRes, subjectsRes] = await Promise.all([
        apiClient.get<UserRow[]>('/users'),
        apiClient.get<CollegesResponse>('/colleges'),
        apiClient.get<{ success: boolean; data: Subject[] }>('/subjects/published'),
      ]);

      const currentId = String(currentUser?.id ?? '');
      setUsers(usersRes.data.filter((u) => String(u.id) !== currentId));
      setColleges(collegesRes.data?.data || []);
      setSubjects(subjectsRes.data?.data || subjectsRes.data || []);
    } catch (error) {
      toast.error(getErrorMessage(error, 'Failed to load users'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, [currentUser?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, selectedCollegeId]);

  const filteredUsers = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return users
      .filter((u) => u.role === activeTab)
      .filter((u) => {
        if (!selectedCollegeId) return true;
        if (u.role === 'student') return u.college_id === selectedCollegeId;
        return u.facilitator_college_ids?.includes(selectedCollegeId) ?? false;
      })
      .filter(
        (u) =>
          u.full_name.toLowerCase().includes(q) ||
          u.email.toLowerCase().includes(q),
      );
  }, [users, activeTab, searchQuery, selectedCollegeId]);

  const totalPages = Math.max(1, Math.ceil(filteredUsers.length / PAGE_SIZE));

  const paginatedUsers = useMemo(
    () => filteredUsers.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE),
    [filteredUsers, currentPage],
  );

  const studentCount = useMemo(
    () => users.filter((u) => u.role === 'student').length,
    [users],
  );
  const facilitatorCount = useMemo(
    () => users.filter((u) => u.role === 'facilitator').length,
    [users],
  );
  const curriculumDevCount = useMemo(
    () => users.filter((u) => u.role === 'curriculum_developer').length,
    [users],
  );

  const openEditModal = (user: UserRow) => {
    setEditingUser(user);
    setForm({
      full_name: user.full_name || '',
      degree: user.degree || '',
      year: user.year ? String(user.year) : '',
      college_id: user.college_id || '',
      facilitator_college_ids: user.facilitator_college_ids || [],
      facilitator_subject_ids: user.facilitator_subject_ids || [],
      domain: user.domain || '',
      role_focus: user.role_focus || '',
    });
    setEditOpen(true);
  };

  const closeEditModal = () => {
    setEditingUser(null);
    setEditOpen(false);
  };

  const toggleFacilitatorCollege = (collegeId: string) => {
    setForm((prev) => ({
      ...prev,
      facilitator_college_ids: prev.facilitator_college_ids.includes(collegeId)
        ? prev.facilitator_college_ids.filter((id) => id !== collegeId)
        : [...prev.facilitator_college_ids, collegeId],
    }));
  };

  const toggleFacilitatorSubject = (subjectId: string) => {
    setForm((prev) => ({
      ...prev,
      facilitator_subject_ids: prev.facilitator_subject_ids.includes(subjectId)
        ? prev.facilitator_subject_ids.filter((id) => id !== subjectId)
        : [...prev.facilitator_subject_ids, subjectId],
    }));
  };

  const saveUser = async () => {
    if (!editingUser) return;
    if (!form.full_name.trim()) {
      toast.error('Full name is required');
      return;
    }

    try {
      setSaving(true);

      await apiClient.put(`/users/${editingUser.id}`, {
        full_name: form.full_name.trim(),
        degree: editingUser.role === 'student' ? form.degree || null : null,
        year:
          editingUser.role === 'student' && form.year
            ? Number(form.year)
            : null,
        college_id:
          editingUser.role === 'student' ? form.college_id || null : null,
        facilitator_college_ids:
          editingUser.role === 'facilitator'
            ? form.facilitator_college_ids
            : undefined,
        facilitator_subject_ids:
          editingUser.role === 'facilitator'
            ? form.facilitator_subject_ids
            : undefined,
        domain:
          editingUser.role === 'curriculum_developer' ? form.domain || null : undefined,
        role_focus:
          editingUser.role === 'curriculum_developer' ? form.role_focus?.trim() || null : undefined,
      });

      toast.success('User updated successfully');
      closeEditModal();
      await fetchUsers();
    } catch (error) {
      toast.error(getErrorMessage(error, 'Failed to update user'));
    } finally {
      setSaving(false);
    }
  };

  const handleVerify = async (userId: string, currentStatus: boolean) => {
    try {
      await apiClient.patch(`/users/${userId}/verify`, {
        is_verified: !currentStatus,
      });
      toast.success(`User ${!currentStatus ? 'verified' : 'unverified'} successfully`);
      await fetchUsers();
    } catch (error) {
      toast.error(getErrorMessage(error, 'Failed to update user verification status'));
    }
  };

  const handleCreateCurriculumDeveloper = async () => {
    if (
      !createForm.full_name.trim() ||
      !createForm.email.trim() ||
      !createForm.password ||
      !createForm.domain ||
      !createForm.role_focus.trim()
    ) {
      toast.error('Please fill in all required fields (including domain and role)');
      return;
    }
    if (createForm.password !== createForm.confirm_password) {
      toast.error('Passwords do not match');
      return;
    }

    try {
      setSaving(true);
      await apiClient.post('/users/curriculum-developer', {
        full_name: createForm.full_name.trim(),
        email: createForm.email.trim(),
        password: createForm.password,
        domain: createForm.domain,
        role_focus: createForm.role_focus.trim(),
      });
      toast.success('Curriculum developer created successfully');
      setCreateOpen(false);
      setCreateForm({
        full_name: '',
        email: '',
        password: '',
        confirm_password: '',
        domain: '',
        role_focus: '',
      });
      await fetchUsers();
    } catch (error) {
      toast.error(getErrorMessage(error, 'Failed to create user'));
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteUser = async () => {
    if (!userToDelete) return;
    try {
      await apiClient.delete(`/users/${userToDelete.id}`);
      toast.success('User moved to recycle bin');
      setUserToDelete(null);
      await fetchUsers();
    } catch (error) {
      toast.error(getErrorMessage(error, 'Failed to delete user'));
    }
  };

  if (loading) {
    return (
      <div className='space-y-4 sm:space-y-6 min-w-0'>
        <div className='flex flex-col gap-4 md:flex-row md:items-center md:justify-between'>
          <Skeleton className='h-10 w-96' />
          <Skeleton className='h-4 w-36' />
        </div>
        <div className='flex gap-2 mb-2'>
          <Skeleton className='h-9 w-36 rounded-md' />
          <Skeleton className='h-9 w-36 rounded-md' />
        </div>
        <Card className='border border-slate-200/80 shadow-xs rounded-2xl overflow-hidden bg-white'>
          <Table>
            <TableHeader className='bg-slate-50/50'>
              <TableRow>
                {[...Array(7)].map((_, i) => (
                  <TableHead key={i}><Skeleton className='h-3 w-20' /></TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody className='bg-white'>
              {[...Array(8)].map((_, i) => (
                <TableRow key={i}>
                  <TableCell>
                    <div className='space-y-1.5'>
                      <Skeleton className='h-3.5 w-32' />
                      <Skeleton className='h-3 w-40' />
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className='space-y-1.5'>
                      <Skeleton className='h-3.5 w-8' />
                      <Skeleton className='h-3 w-36' />
                    </div>
                  </TableCell>
                  <TableCell><Skeleton className='h-6 w-20 rounded-full' /></TableCell>
                  <TableCell><Skeleton className='h-4 w-40' /></TableCell>
                  <TableCell><Skeleton className='h-6 w-14 rounded-full' /></TableCell>
                  <TableCell><Skeleton className='h-6 w-16 rounded-full' /></TableCell>
                  <TableCell>
                    <div className='flex justify-end gap-1'>
                      <Skeleton className='h-8 w-8 rounded' />
                      <Skeleton className='h-8 w-8 rounded' />
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      </div>
    );
  }

  return (
    <div className='space-y-4 sm:space-y-6 min-w-0 animate-in fade-in duration-300'>
      {/* Top Search & Filter Bar */}
      <div className='flex flex-col gap-3 md:flex-row md:items-center md:justify-between'>
        <div className='flex flex-col gap-2.5 sm:flex-row sm:items-center flex-1 min-w-0'>
          <div className='relative w-full sm:w-80'>
            <Search className='absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400' />
            <Input
              placeholder='Search by name or email...'
              className='border-slate-200 bg-white pl-9 h-10 rounded-xl text-xs sm:text-sm'
              value={searchQuery}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                setSearchQuery(e.target.value);
                setCurrentPage(1);
              }}
            />
          </div>
          <select
            className='h-10 rounded-xl border border-slate-200 bg-white px-3 text-xs sm:text-sm text-slate-700 w-full sm:w-52 focus:outline-none focus:ring-2 focus:ring-indigo-300 shadow-xs'
            value={selectedCollegeId}
            onChange={(e: React.ChangeEvent<HTMLSelectElement>) => {
              setSelectedCollegeId(e.target.value);
              setCurrentPage(1);
            }}
          >
            <option value=''>All Colleges</option>
            {colleges.map((college) => (
              <option key={college.id} value={college.id}>
                {college.name}
              </option>
            ))}
          </select>
        </div>

        <div className='flex items-center gap-2 sm:gap-3 flex-wrap justify-between sm:justify-end shrink-0'>
          {activeTab === 'curriculum_developer' && (
            <Button onClick={() => setCreateOpen(true)} className="gap-2 bg-indigo-600 hover:bg-indigo-700 min-h-[40px] rounded-xl font-semibold shadow-xs">
              <UserPlus className="h-4 w-4" /> Create Developer
            </Button>
          )}
          <Button variant="outline" onClick={() => setIsBinOpen(true)} className="gap-2 min-h-[40px] rounded-xl font-semibold border-slate-200 bg-white shadow-xs">
            <Archive className="h-4 w-4 text-slate-500" />
            Recycle Bin
          </Button>
          <span className='text-xs font-semibold text-slate-400'>
            Showing <strong className='text-slate-800'>{filteredUsers.length}</strong> {activeTab === 'student' ? 'students' : activeTab === 'facilitator' ? 'facilitators' : 'developers'}
          </span>
        </div>
      </div>

      {/* Tabs */}
      <Tabs
        value={activeTab}
        onValueChange={(value) => {
          setActiveTab(value as ActiveTab);
          setSelectedCollegeId('');
          setCurrentPage(1);
        }}
        className='space-y-4'
      >
        <div className='w-full'>
          <TabsList className='bg-slate-100 p-1 rounded-2xl grid grid-cols-3 sm:flex sm:w-fit gap-1 w-full'>
            <TabsTrigger value='student' className='rounded-xl text-[11px] sm:text-sm font-semibold py-2 px-1 sm:px-4 truncate'>Students ({studentCount})</TabsTrigger>
            <TabsTrigger value='facilitator' className='rounded-xl text-[11px] sm:text-sm font-semibold py-2 px-1 sm:px-4 truncate'>
              Facilitators ({facilitatorCount})
            </TabsTrigger>
            <TabsTrigger value='curriculum_developer' className='rounded-xl text-[11px] sm:text-sm font-semibold py-2 px-1 sm:px-4 truncate'>
              Curriculum ({curriculumDevCount})
            </TabsTrigger>
          </TabsList>
        </div>

        {/* Student Tab */}
        <TabsContent value='student'>
          <Card className='border border-slate-200/80 shadow-xs rounded-2xl overflow-hidden bg-white min-w-0'>
            {/* Mobile Card View (No horizontal scrollbar) */}
            <div className='divide-y divide-slate-100 md:hidden'>
              {paginatedUsers.map((user) => (
                <div key={user.id} className='p-3.5 sm:p-4 space-y-2.5 bg-white hover:bg-slate-50/50 transition-colors'>
                  {/* Top: Name, Email & Verification */}
                  <div className='flex items-start justify-between gap-2'>
                    <div className='min-w-0 flex-1'>
                      <p className='font-bold text-slate-900 text-xs sm:text-sm truncate'>{user.full_name}</p>
                      <p className='text-[11px] text-slate-500 truncate'>{user.email}</p>
                    </div>
                    <div className='flex items-center gap-1.5 shrink-0'>
                      <Badge
                        className={
                          user.is_verified
                            ? 'bg-emerald-50 text-emerald-700 border-emerald-200 font-semibold text-[10px] px-2 py-0.5'
                            : 'bg-yellow-50 text-yellow-700 border-yellow-200 font-semibold text-[10px] px-2 py-0.5'
                        }
                      >
                        {user.is_verified ? 'Verified' : 'Unverified'}
                      </Badge>
                      <Button
                        variant='outline'
                        size='sm'
                        className='h-6 px-1.5 text-[10px] rounded-md font-semibold'
                        onClick={() => handleVerify(user.id, user.is_verified)}
                      >
                        {user.is_verified ? 'Unverify' : 'Verify'}
                      </Button>
                    </div>
                  </div>

                  {/* College & Details */}
                  <div className='text-[11px] bg-slate-50/80 p-2.5 rounded-xl border border-slate-100 space-y-1.5'>
                    <div className='flex items-center gap-1.5 text-slate-800 font-semibold'>
                      <Building2 className='w-3.5 h-3.5 text-indigo-500 shrink-0' />
                      <span className='truncate'>{user.college_name || 'No College Assigned'}</span>
                    </div>
                    <div className='flex flex-wrap items-center gap-1.5 text-slate-500 pt-1 border-t border-slate-200/50'>
                      <Badge className='bg-slate-100 text-slate-700 font-semibold text-[10px] border border-slate-200/60'>
                        {user.enrolled_courses || 0} enrolled
                      </Badge>
                      {user.year ? (
                        <Badge className='bg-blue-50 text-blue-700 border-blue-200 font-semibold text-[10px]'>
                          Year {user.year}
                        </Badge>
                      ) : null}
                    </div>
                  </div>

                  {/* Progress Bar */}
                  <div className='space-y-1 pt-0.5'>
                    <div className='flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-slate-500'>
                      <span>{user.completed_subtopics || 0}/{user.total_subtopics || 0} Subtopics</span>
                      <span className='text-indigo-600 font-extrabold'>{user.progress_percent || 0}%</span>
                    </div>
                    <Progress value={user.progress_percent || 0} className='h-1.5' />
                  </div>

                  {/* Actions */}
                  <div className='flex items-center justify-end gap-1 pt-1 border-t border-slate-50'>
                    <Button
                      variant='ghost'
                      size='sm'
                      className='h-7 px-2 text-xs text-slate-600 hover:text-indigo-600 rounded-lg gap-1'
                      onClick={() => setProfileId(user.id)}
                    >
                      <Eye className='h-3.5 w-3.5' /> Profile
                    </Button>
                    <Button
                      variant='ghost'
                      size='sm'
                      className='h-7 px-2 text-xs text-slate-600 hover:text-indigo-600 rounded-lg gap-1'
                      onClick={() => openEditModal(user)}
                    >
                      <Pencil className='h-3.5 w-3.5' /> Edit
                    </Button>
                    <Button
                      variant='ghost'
                      size='sm'
                      className='h-7 px-2 text-xs text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg gap-1'
                      onClick={() => setUserToDelete(user)}
                    >
                      <Trash2 className='h-3.5 w-3.5' /> Delete
                    </Button>
                  </div>
                </div>
              ))}
            </div>

            {/* Desktop Table View */}
            <div className='hidden md:block overflow-x-auto no-scrollbar w-full min-w-0'>
              <Table className='w-full text-xs sm:text-sm'>
                <TableHeader className='bg-slate-50 border-b border-slate-100'>
                  <TableRow>
                    <TableHead className='font-bold uppercase text-[11px] py-3.5 pl-4 sm:pl-6'>Student</TableHead>
                    <TableHead className='font-bold uppercase text-[11px] py-3.5'>College</TableHead>
                    <TableHead className='font-bold uppercase text-[11px] py-3.5'>Courses</TableHead>
                    <TableHead className='font-bold uppercase text-[11px] py-3.5'>Progress</TableHead>
                    <TableHead className='font-bold uppercase text-[11px] py-3.5'>Batch</TableHead>
                    <TableHead className='font-bold uppercase text-[11px] py-3.5'>Status</TableHead>
                    <TableHead className='text-right font-bold uppercase text-[11px] py-3.5 pr-4 sm:pr-6'>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody className='divide-y divide-slate-100'>
                  {paginatedUsers.map((user) => (
                    <TableRow key={user.id} className='hover:bg-slate-50/60 transition-colors'>
                      <TableCell className='pl-4 sm:pl-6 py-3.5'>
                        <p className='font-bold text-slate-900 truncate'>{user.full_name}</p>
                        <p className='text-xs text-slate-500 truncate'>{user.email}</p>
                      </TableCell>
                      <TableCell className='py-3.5'>
                        <p className='text-xs sm:text-sm text-slate-700 truncate max-w-[160px]'>{user.college_name || 'N/A'}</p>
                      </TableCell>
                      <TableCell className='py-3.5 whitespace-nowrap'>
                        <Badge className='bg-slate-100 text-slate-700 font-semibold text-[11px] border border-slate-200/60'>
                          {user.enrolled_courses || 0} enrolled
                        </Badge>
                      </TableCell>
                      <TableCell className='min-w-48 py-3.5'>
                        <div className='space-y-1'>
                          <div className='flex items-center justify-between text-[11px] text-slate-500 font-medium'>
                            <span>{user.completed_subtopics || 0}/{user.total_subtopics || 0} subtopics</span>
                            <span>{user.progress_percent || 0}%</span>
                          </div>
                          <Progress value={user.progress_percent || 0} className='h-1.5' />
                        </div>
                      </TableCell>
                      <TableCell className='py-3.5 whitespace-nowrap'>
                        {user.year ? (
                          <Badge className='bg-blue-50 text-blue-700 border-blue-200 font-semibold text-[11px]'>
                            Year {user.year}
                          </Badge>
                        ) : (
                          <span className='text-slate-400 text-xs'>N/A</span>
                        )}
                      </TableCell>
                      <TableCell className='py-3.5 whitespace-nowrap'>
                        <div className='flex items-center gap-1.5'>
                          <Badge
                            className={
                              user.is_verified
                                ? 'bg-emerald-50 text-emerald-700 border-emerald-200 font-semibold text-[11px]'
                                : 'bg-yellow-50 text-yellow-700 border-yellow-200 font-semibold text-[11px]'
                            }
                          >
                            {user.is_verified ? 'Verified' : 'Unverified'}
                          </Badge>
                          <Button
                            variant='outline'
                            size='sm'
                            className='h-6 px-2 text-[10px] rounded-md'
                            onClick={() => handleVerify(user.id, user.is_verified)}
                          >
                            {user.is_verified ? 'Unverify' : 'Verify'}
                          </Button>
                        </div>
                      </TableCell>
                      <TableCell className='text-right pr-4 sm:pr-6 py-3.5'>
                        <div className='flex items-center justify-end gap-1'>
                          <Button
                            variant='ghost'
                            size='icon'
                            className='h-8 w-8 text-slate-500 hover:text-indigo-600 rounded-lg'
                            onClick={() => setProfileId(user.id)}
                            title='View Profile'
                          >
                            <Eye className='h-4 w-4' />
                          </Button>
                          <Button
                            variant='ghost'
                            size='icon'
                            className='h-8 w-8 text-slate-500 hover:text-indigo-600 rounded-lg'
                            onClick={() => openEditModal(user)}
                            title='Edit User'
                          >
                            <Pencil className='h-4 w-4' />
                          </Button>
                          <Button
                            variant='ghost'
                            size='icon'
                            className='h-8 w-8 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg'
                            onClick={() => setUserToDelete(user)}
                            title='Delete User'
                          >
                            <Trash2 className='h-4 w-4' />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            {filteredUsers.length === 0 && (
              <div className='p-12 text-center text-slate-400 text-xs sm:text-sm'>
                No students found matching your criteria.
              </div>
            )}
            {totalPages > 1 && (
              <div className='flex flex-col sm:flex-row items-center justify-between gap-2.5 border-t border-slate-100 px-4 sm:px-6 py-3 text-xs text-slate-500'>
                <p>Page {currentPage} of {totalPages} &mdash; {filteredUsers.length} total</p>
                <div className='flex items-center gap-1'>
                  <Button
                    variant='outline'
                    size='icon'
                    className='h-8 w-8 rounded-lg'
                    disabled={currentPage === 1}
                    onClick={() => setCurrentPage((p) => p - 1)}
                  >
                    <ChevronLeft className='h-4 w-4' />
                  </Button>
                  {Array.from({ length: totalPages }, (_, i) => i + 1)
                    .filter((p) => p === 1 || p === totalPages || Math.abs(p - currentPage) <= 1)
                    .reduce<(number | '...')[]>((acc, p, idx, arr) => {
                      if (idx > 0 && p - (arr[idx - 1] as number) > 1) acc.push('...');
                      acc.push(p);
                      return acc;
                    }, [])
                    .map((p, i) =>
                      p === '...' ? (
                        <span key={`ellipsis-${i}`} className='px-1 text-slate-400 text-xs'>…</span>
                      ) : (
                        <Button
                          key={p}
                          variant={currentPage === p ? 'default' : 'outline'}
                          size='icon'
                          className='h-8 w-8 text-xs rounded-lg'
                          onClick={() => setCurrentPage(p as number)}
                        >
                          {p}
                        </Button>
                      )
                    )}
                  <Button
                    variant='outline'
                    size='icon'
                    className='h-8 w-8 rounded-lg'
                    disabled={currentPage === totalPages}
                    onClick={() => setCurrentPage((p) => p + 1)}
                  >
                    <ChevronRight className='h-4 w-4' />
                  </Button>
                </div>
              </div>
            )}
          </Card>
        </TabsContent>

        {/* Facilitator Tab */}
        <TabsContent value='facilitator'>
          <Card className='border border-slate-200/80 shadow-xs rounded-2xl overflow-hidden bg-white min-w-0'>
            {/* Mobile Card View (No horizontal scrollbar) */}
            <div className='divide-y divide-slate-100 md:hidden'>
              {paginatedUsers.map((user) => (
                <div key={user.id} className='p-3.5 sm:p-4 space-y-2.5 bg-white hover:bg-slate-50/50 transition-colors'>
                  {/* Top: Name, Email & Verification */}
                  <div className='flex items-start justify-between gap-2'>
                    <div className='min-w-0 flex-1'>
                      <p className='font-bold text-slate-900 text-xs sm:text-sm truncate'>{user.full_name}</p>
                      <p className='text-[11px] text-slate-500 truncate'>{user.email}</p>
                    </div>
                    <div className='flex items-center gap-1.5 shrink-0'>
                      <Badge
                        className={
                          user.is_verified
                            ? 'bg-emerald-50 text-emerald-700 border-emerald-200 font-semibold text-[10px] px-2 py-0.5'
                            : 'bg-yellow-50 text-yellow-700 border-yellow-200 font-semibold text-[10px] px-2 py-0.5'
                        }
                      >
                        {user.is_verified ? 'Verified' : 'Pending'}
                      </Badge>
                      <Button
                        variant='outline'
                        size='sm'
                        className='h-6 px-1.5 text-[10px] rounded-md font-semibold'
                        onClick={() => handleVerify(user.id, user.is_verified)}
                      >
                        {user.is_verified ? 'Unverify' : 'Verify'}
                      </Button>
                    </div>
                  </div>

                  {/* Assigned Colleges */}
                  <div className='text-[11px] bg-slate-50/80 p-2.5 rounded-xl border border-slate-100 space-y-1.5'>
                    <span className='text-[10px] font-bold uppercase text-slate-400 block'>Assigned Colleges</span>
                    <div className='flex flex-wrap gap-1'>
                      {user.facilitator_college_names && user.facilitator_college_names.length > 0 ? (
                        user.facilitator_college_names.map((name) => (
                          <Badge key={`${user.id}-${name}`} className='bg-emerald-50 text-emerald-700 border-emerald-200 font-semibold text-[10px]'>
                            {name}
                          </Badge>
                        ))
                      ) : (
                        <span className='text-xs text-slate-400 italic'>No colleges assigned</span>
                      )}
                    </div>
                  </div>

                  {/* Assigned Subjects */}
                  <div className='text-[11px] bg-slate-50/80 p-2.5 rounded-xl border border-slate-100 space-y-1.5'>
                    <span className='text-[10px] font-bold uppercase text-slate-400 block'>Assigned Subjects</span>
                    <div className='flex flex-wrap gap-1'>
                      {user.facilitator_subject_names && user.facilitator_subject_names.length > 0 ? (
                        user.facilitator_subject_names.map((name) => (
                          <Badge key={`${user.id}-sub-${name}`} className='bg-indigo-50 text-indigo-700 border-indigo-200 font-semibold text-[10px]'>
                            {name}
                          </Badge>
                        ))
                      ) : (
                        <span className='text-xs text-slate-400 italic'>No subjects assigned</span>
                      )}
                    </div>
                  </div>

                  {/* Joined Date & Actions */}
                  <div className='flex items-center justify-between pt-1 border-t border-slate-50'>
                    <p className='text-[10px] text-slate-400 font-medium'>
                      Joined {new Date(user.created_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
                    </p>
                    <div className='flex items-center gap-1'>
                      <Button
                        variant='ghost'
                        size='sm'
                        className='h-7 px-2 text-xs text-slate-600 hover:text-indigo-600 rounded-lg gap-1'
                        onClick={() => setFacilitatorProfileId(user.id)}
                      >
                        <Eye className='h-3.5 w-3.5' /> Profile
                      </Button>
                      <Button
                        variant='ghost'
                        size='sm'
                        className='h-7 px-2 text-xs text-slate-600 hover:text-indigo-600 rounded-lg gap-1'
                        onClick={() => openEditModal(user)}
                      >
                        <Pencil className='h-3.5 w-3.5' /> Edit
                      </Button>
                      <Button
                        variant='ghost'
                        size='sm'
                        className='h-7 px-2 text-xs text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg gap-1'
                        onClick={() => setUserToDelete(user)}
                      >
                        <Trash2 className='h-3.5 w-3.5' /> Delete
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
              {/* Desktop Table View */}
            <div className='hidden md:block overflow-x-auto no-scrollbar w-full min-w-0'>
              <Table className='w-full text-xs sm:text-sm'>
                <TableHeader className='bg-slate-50 border-b border-slate-100'>
                  <TableRow>
                    <TableHead className='font-bold uppercase text-[11px] py-3.5 pl-4 sm:pl-6'>Facilitator</TableHead>
                    <TableHead className='font-bold uppercase text-[11px] py-3.5'>Assigned Colleges</TableHead>
                    <TableHead className='font-bold uppercase text-[11px] py-3.5'>Assigned Subjects</TableHead>
                    <TableHead className='font-bold uppercase text-[11px] py-3.5'>Joined</TableHead>
                    <TableHead className='font-bold uppercase text-[11px] py-3.5'>Status</TableHead>
                    <TableHead className='text-right font-bold uppercase text-[11px] py-3.5 pr-4 sm:pr-6'>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody className='divide-y divide-slate-100'>
                  {paginatedUsers.map((user) => (
                    <TableRow key={user.id} className='hover:bg-slate-50/60 transition-colors'>
                      <TableCell className='pl-4 sm:pl-6 py-3.5'>
                        <p className='font-bold text-slate-900 truncate'>{user.full_name}</p>
                        <p className='text-xs text-slate-500 truncate'>{user.email}</p>
                      </TableCell>
                      <TableCell className='py-3.5'>
                        <div className='flex flex-wrap gap-1'>
                          {user.facilitator_college_names && user.facilitator_college_names.length > 0 ? (
                            user.facilitator_college_names.map((name) => (
                              <Badge key={`${user.id}-${name}`} className='bg-emerald-50 text-emerald-700 border-emerald-200 font-semibold text-[11px]'>
                                {name}
                              </Badge>
                            ))
                          ) : (
                            <span className='text-xs text-slate-400 italic'>No colleges assigned</span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className='py-3.5'>
                        <div className='flex flex-wrap gap-1'>
                          {user.facilitator_subject_names && user.facilitator_subject_names.length > 0 ? (
                            user.facilitator_subject_names.map((name) => (
                              <Badge key={`${user.id}-sub-${name}`} className='bg-indigo-50 text-indigo-700 border-indigo-200 font-semibold text-[11px]'>
                                {name}
                              </Badge>
                            ))
                          ) : (
                            <span className='text-xs text-slate-400 italic'>No subjects assigned</span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className='text-xs sm:text-sm text-slate-500 py-3.5 whitespace-nowrap'>
                        {new Date(user.created_at).toLocaleDateString('en-GB', {
                          day: '2-digit',
                          month: 'short',
                          year: 'numeric',
                        })}
                      </TableCell>
                      <TableCell className='py-3.5 whitespace-nowrap'>
                        <div className='flex items-center gap-1.5'>
                          <Badge
                            className={
                              user.is_verified
                                ? 'bg-emerald-50 text-emerald-700 border-emerald-200 font-semibold text-[11px]'
                                : 'bg-yellow-50 text-yellow-700 border-yellow-200 font-semibold text-[11px]'
                            }
                          >
                            {user.is_verified ? 'Verified' : 'Pending'}
                          </Badge>
                          <Button
                            variant='outline'
                            size='sm'
                            className='h-6 px-2 text-[10px] rounded-md'
                            onClick={() => handleVerify(user.id, user.is_verified)}
                          >
                            {user.is_verified ? 'Unverify' : 'Verify'}
                          </Button>
                        </div>
                      </TableCell>
                      <TableCell className='text-right pr-4 sm:pr-6 py-3.5'>
                        <div className='flex items-center justify-end gap-1'>
                          <Button
                            variant='ghost'
                            size='icon'
                            className='h-8 w-8 text-slate-500 hover:text-indigo-600 rounded-lg'
                            onClick={() => setFacilitatorProfileId(user.id)}
                            title='View Profile'
                          >
                            <Eye className='h-4 w-4' />
                          </Button>
                          <Button
                            variant='ghost'
                            size='icon'
                            className='h-8 w-8 text-slate-500 hover:text-indigo-600 rounded-lg'
                            onClick={() => openEditModal(user)}
                            title='Edit User'
                          >
                            <Pencil className='h-4 w-4' />
                          </Button>
                          <Button
                            variant='ghost'
                            size='icon'
                            className='h-8 w-8 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg'
                            onClick={() => setUserToDelete(user)}
                            title='Delete User'
                          >
                            <Trash2 className='h-4 w-4' />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            {filteredUsers.length === 0 && (
              <div className='p-12 text-center text-slate-400 text-xs sm:text-sm'>
                No facilitators found matching your criteria.
              </div>
            )}
            {totalPages > 1 && (
              <div className='flex flex-col sm:flex-row items-center justify-between gap-2.5 border-t border-slate-100 px-4 sm:px-6 py-3 text-xs text-slate-500'>
                <p>Page {currentPage} of {totalPages} &mdash; {filteredUsers.length} total</p>
                <div className='flex items-center gap-1'>
                  <Button
                    variant='outline'
                    size='icon'
                    className='h-8 w-8 rounded-lg'
                    disabled={currentPage === 1}
                    onClick={() => setCurrentPage((p) => p - 1)}
                  >
                    <ChevronLeft className='h-4 w-4' />
                  </Button>
                  {Array.from({ length: totalPages }, (_, i) => i + 1)
                    .filter((p) => p === 1 || p === totalPages || Math.abs(p - currentPage) <= 1)
                    .reduce<(number | '...')[]>((acc, p, idx, arr) => {
                      if (idx > 0 && p - (arr[idx - 1] as number) > 1) acc.push('...');
                      acc.push(p);
                      return acc;
                    }, [])
                    .map((p, i) =>
                      p === '...' ? (
                        <span key={`ellipsis-${i}`} className='px-1 text-slate-400 text-xs'>…</span>
                      ) : (
                        <Button
                          key={p}
                          variant={currentPage === p ? 'default' : 'outline'}
                          size='icon'
                          className='h-8 w-8 text-xs rounded-lg'
                          onClick={() => setCurrentPage(p as number)}
                        >
                          {p}
                        </Button>
                      )
                    )}
                  <Button
                    variant='outline'
                    size='icon'
                    className='h-8 w-8 rounded-lg'
                    disabled={currentPage === totalPages}
                    onClick={() => setCurrentPage((p) => p + 1)}
                  >
                    <ChevronRight className='h-4 w-4' />
                  </Button>
                </div>
              </div>
            )}
          </Card>
        </TabsContent>

        {/* Curriculum Developer Tab */}
        <TabsContent value='curriculum_developer'>
          <Card className='border border-slate-200/80 shadow-xs rounded-2xl overflow-hidden bg-white min-w-0'>
            {/* Mobile Card View (No horizontal scrollbar) */}
            <div className='divide-y divide-slate-100 md:hidden'>
              {paginatedUsers.map((user) => (
                <div key={user.id} className='p-3.5 sm:p-4 space-y-2.5 bg-white hover:bg-slate-50/50 transition-colors'>
                  {/* Top: Name, Email & Verification */}
                  <div className='flex items-start justify-between gap-2'>
                    <div className='min-w-0 flex-1'>
                      <p className='font-bold text-slate-900 text-xs sm:text-sm truncate'>{user.full_name}</p>
                      <p className='text-[11px] text-slate-500 truncate'>{user.email}</p>
                    </div>
                    <div className='flex items-center gap-1.5 shrink-0'>
                      <Badge
                        className={
                          user.is_verified
                            ? 'bg-emerald-50 text-emerald-700 border-emerald-200 font-semibold text-[10px] px-2 py-0.5'
                            : 'bg-yellow-50 text-yellow-700 border-yellow-200 font-semibold text-[10px] px-2 py-0.5'
                        }
                      >
                        {user.is_verified ? 'Verified' : 'Pending'}
                      </Badge>
                      <Button
                        variant='outline'
                        size='sm'
                        className='h-6 px-1.5 text-[10px] rounded-md font-semibold'
                        onClick={() => handleVerify(user.id, user.is_verified)}
                      >
                        {user.is_verified ? 'Unverify' : 'Verify'}
                      </Button>
                    </div>
                  </div>

                  {/* Domain & Role Tags */}
                  <div className='flex flex-wrap items-center gap-1.5 pt-0.5'>
                    {user.domain && (
                      <span className='inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200'>
                        {user.domain}
                      </span>
                    )}
                    {user.role_focus && (
                      <span className='inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-medium bg-slate-100 text-slate-700 border border-slate-200'>
                        {user.role_focus}
                      </span>
                    )}
                    {!user.domain && !user.role_focus && (
                      <span className='text-[10px] text-slate-400 italic'>
                        No domain / role assigned
                      </span>
                    )}
                  </div>

                  {/* Joined Date & Actions */}
                  <div className='flex items-center justify-between pt-1 border-t border-slate-50'>
                    <p className='text-[10px] text-slate-400 font-medium'>
                      Joined {new Date(user.created_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
                    </p>
                    <div className='flex items-center gap-1'>
                      <Button
                        variant='ghost'
                        size='sm'
                        className='h-7 px-2 text-xs text-slate-600 hover:text-indigo-600 rounded-lg gap-1'
                        onClick={() => openEditModal(user)}
                      >
                        <Pencil className='h-3.5 w-3.5' /> Edit
                      </Button>
                      <Button
                        variant='ghost'
                        size='sm'
                        className='h-7 px-2 text-xs text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg gap-1'
                        onClick={() => setUserToDelete(user)}
                      >
                        <Trash2 className='h-3.5 w-3.5' /> Delete
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Desktop Table View */}
            <div className='hidden md:block overflow-x-auto no-scrollbar w-full min-w-0'>
              <Table className='w-full text-xs sm:text-sm'>
                <TableHeader className='bg-slate-50 border-b border-slate-100'>
                  <TableRow>
                    <TableHead className='font-bold uppercase text-[11px] py-3.5 pl-4 sm:pl-6'>Developer</TableHead>
                    <TableHead className='font-bold uppercase text-[11px] py-3.5'>Domain & Role</TableHead>
                    <TableHead className='font-bold uppercase text-[11px] py-3.5'>Joined</TableHead>
                    <TableHead className='font-bold uppercase text-[11px] py-3.5'>Status</TableHead>
                    <TableHead className='text-right font-bold uppercase text-[11px] py-3.5 pr-4 sm:pr-6'>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody className='divide-y divide-slate-100'>
                  {paginatedUsers.map((user) => (
                    <TableRow key={user.id} className='hover:bg-slate-50/60 transition-colors'>
                      <TableCell className='pl-4 sm:pl-6 py-3.5'>
                        <p className='font-bold text-slate-900 truncate'>{user.full_name}</p>
                        <p className='text-xs text-slate-500 truncate'>{user.email}</p>
                      </TableCell>
                      <TableCell className='py-3.5 whitespace-nowrap'>
                        {user.domain || user.role_focus ? (
                          <div className='flex flex-wrap items-center gap-1.5'>
                            {user.domain && (
                              <span className='inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200'>
                                {user.domain}
                              </span>
                            )}
                            {user.role_focus && (
                              <span className='inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-medium bg-slate-100 text-slate-700 border border-slate-200'>
                                {user.role_focus}
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className='text-xs text-slate-400'>—</span>
                        )}
                      </TableCell>
                      <TableCell className='text-xs sm:text-sm text-slate-500 py-3.5 whitespace-nowrap'>
                        {new Date(user.created_at).toLocaleDateString('en-GB', {
                          day: '2-digit',
                          month: 'short',
                          year: 'numeric',
                        })}
                      </TableCell>
                      <TableCell className='py-3.5 whitespace-nowrap'>
                        <div className='flex items-center gap-1.5'>
                          <Badge
                            className={
                              user.is_verified
                                ? 'bg-emerald-50 text-emerald-700 border-emerald-200 font-semibold text-[11px]'
                                : 'bg-yellow-50 text-yellow-700 border-yellow-200 font-semibold text-[11px]'
                            }
                          >
                            {user.is_verified ? 'Verified' : 'Pending'}
                          </Badge>
                          <Button
                            variant='outline'
                            size='sm'
                            className='h-6 px-2 text-[10px] rounded-md'
                            onClick={() => handleVerify(user.id, user.is_verified)}
                          >
                            {user.is_verified ? 'Unverify' : 'Verify'}
                          </Button>
                        </div>
                      </TableCell>
                      <TableCell className='text-right pr-4 sm:pr-6 py-3.5'>
                        <div className='flex items-center justify-end gap-1'>
                          <Button
                            variant='ghost'
                            size='icon'
                            className='h-8 w-8 text-slate-500 hover:text-indigo-600 rounded-lg'
                            onClick={() => openEditModal(user)}
                            title='Edit Developer'
                          >
                            <Pencil className='h-4 w-4' />
                          </Button>
                          <Button
                            variant='ghost'
                            size='icon'
                            className='h-8 w-8 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg'
                            onClick={() => setUserToDelete(user)}
                            title='Delete Developer'
                          >
                            <Trash2 className='h-4 w-4' />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            {filteredUsers.length === 0 && (
              <div className='p-12 text-center text-slate-400 text-xs sm:text-sm'>
                No curriculum developers found.
              </div>
            )}
            {totalPages > 1 && (
              <div className='flex flex-col sm:flex-row items-center justify-between gap-2.5 border-t border-slate-100 px-4 sm:px-6 py-3 text-xs text-slate-500'>
                <p>Page {currentPage} of {totalPages} &mdash; {filteredUsers.length} total</p>
                <div className='flex items-center gap-1'>
                  <Button
                    variant='outline'
                    size='icon'
                    className='h-8 w-8 rounded-lg'
                    disabled={currentPage === 1}
                    onClick={() => setCurrentPage((p) => p - 1)}
                  >
                    <ChevronLeft className='h-4 w-4' />
                  </Button>
                  {Array.from({ length: totalPages }, (_, i) => i + 1)
                    .filter((p) => p === 1 || p === totalPages || Math.abs(p - currentPage) <= 1)
                    .reduce<(number | '...')[]>((acc, p, idx, arr) => {
                      if (idx > 0 && p - (arr[idx - 1] as number) > 1) acc.push('...');
                      acc.push(p);
                      return acc;
                    }, [])
                    .map((p, i) =>
                      p === '...' ? (
                        <span key={`ellipsis-${i}`} className='px-1 text-slate-400 text-xs'>…</span>
                      ) : (
                        <Button
                          key={p}
                          variant={currentPage === p ? 'default' : 'outline'}
                          size='icon'
                          className='h-8 w-8 text-xs rounded-lg'
                          onClick={() => setCurrentPage(p as number)}
                        >
                          {p}
                        </Button>
                      )
                    )}
                  <Button
                    variant='outline'
                    size='icon'
                    className='h-8 w-8 rounded-lg'
                    disabled={currentPage === totalPages}
                    onClick={() => setCurrentPage((p) => p + 1)}
                  >
                    <ChevronRight className='h-4 w-4' />
                  </Button>
                </div>
              </div>
            )}
          </Card>
        </TabsContent>
      </Tabs>

      {/* Create Modal */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className='w-[94vw] sm:max-w-md rounded-2xl p-4 sm:p-6'>
          <DialogHeader>
            <DialogTitle className='text-base sm:text-lg font-bold text-slate-900'>Create Curriculum Developer</DialogTitle>
          </DialogHeader>
          <div className='space-y-3.5 py-3'>
            <div className='space-y-1.5'>
              <Label htmlFor='create-name' className='text-xs font-semibold text-slate-600'>Full Name <span className='text-red-500'>*</span></Label>
              <Input
                id='create-name'
                placeholder='Enter full name'
                className='h-10 rounded-xl border-slate-200'
                value={createForm.full_name}
                onChange={(e) =>
                  setCreateForm((prev) => ({ ...prev, full_name: e.target.value }))
                }
              />
            </div>
            <div className='space-y-1.5'>
              <Label htmlFor='create-email' className='text-xs font-semibold text-slate-600'>Email <span className='text-red-500'>*</span></Label>
              <Input
                id='create-email'
                type='email'
                placeholder='name@domain.com'
                className='h-10 rounded-xl border-slate-200'
                value={createForm.email}
                onChange={(e) =>
                  setCreateForm((prev) => ({ ...prev, email: e.target.value }))
                }
              />
            </div>

            <div className='grid grid-cols-1 sm:grid-cols-2 gap-3'>
              <div className='space-y-1.5'>
                <Label htmlFor='create-domain' className='text-xs font-semibold text-slate-600'>Domain <span className='text-red-500'>*</span></Label>
                <select
                  id='create-domain'
                  className='h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-xs sm:text-sm text-slate-700 shadow-xs focus:outline-none focus:ring-2 focus:ring-indigo-300'
                  value={createForm.domain}
                  onChange={(e) =>
                    setCreateForm((prev) => ({ ...prev, domain: e.target.value }))
                  }
                >
                  <option value=''>Select Domain</option>
                  <option value='Tech'>Tech</option>
                  <option value='Business'>Business</option>
                  <option value='Creative'>Creative</option>
                  <option value='Non-IT'>Non-IT</option>
                  <option value='Data'>Data</option>
                </select>
              </div>
              <div className='space-y-1.5'>
                <Label htmlFor='create-role-focus' className='text-xs font-semibold text-slate-600'>Role <span className='text-red-500'>*</span></Label>
                <Input
                  id='create-role-focus'
                  placeholder='e.g. Full Stack Developer'
                  className='h-10 rounded-xl border-slate-200'
                  value={createForm.role_focus}
                  onChange={(e) =>
                    setCreateForm((prev) => ({ ...prev, role_focus: e.target.value }))
                  }
                />
              </div>
            </div>

            <div className='space-y-1.5'>
              <Label htmlFor='create-password' className='text-xs font-semibold text-slate-600'>Password <span className='text-red-500'>*</span></Label>
              <div className='relative'>
                <Input
                  id='create-password'
                  type={showPassword ? 'text' : 'password'}
                  placeholder='Create a secure password'
                  value={createForm.password}
                  onChange={(e) =>
                    setCreateForm((prev) => ({ ...prev, password: e.target.value }))
                  }
                  className='pr-10 h-10 rounded-xl border-slate-200'
                />
                <button
                  type='button'
                  onClick={() => setShowPassword(!showPassword)}
                  className='absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-1'
                >
                  {showPassword ? <EyeOff className='h-4 w-4' /> : <Eye className='h-4 w-4' />}
                </button>
              </div>
            </div>
            <div className='space-y-1.5'>
              <Label htmlFor='create-confirm-password' className='text-xs font-semibold text-slate-600'>Confirm Password <span className='text-red-500'>*</span></Label>
              <div className='relative'>
                <Input
                  id='create-confirm-password'
                  type={showConfirmPassword ? 'text' : 'password'}
                  placeholder='Repeat password'
                  value={createForm.confirm_password}
                  onChange={(e) =>
                    setCreateForm((prev) => ({ ...prev, confirm_password: e.target.value }))
                  }
                  className='pr-10 h-10 rounded-xl border-slate-200'
                />
                <button
                  type='button'
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  className='absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-1'
                >
                  {showConfirmPassword ? <EyeOff className='h-4 w-4' /> : <Eye className='h-4 w-4' />}
                </button>
              </div>
            </div>
          </div>
          <DialogFooter className='gap-2 sm:gap-0'>
            <Button variant='outline' onClick={() => setCreateOpen(false)} className='rounded-xl min-h-[40px]'>
              Cancel
            </Button>
            <Button onClick={handleCreateCurriculumDeveloper} disabled={saving} className='bg-indigo-600 hover:bg-indigo-700 rounded-xl min-h-[40px] font-semibold'>
              {saving && <Loader2 className='mr-2 h-4 w-4 animate-spin' />}
              Create User
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Modal */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className='w-[94vw] sm:max-w-xl max-h-[88vh] overflow-y-auto rounded-2xl p-4 sm:p-6 custom-scrollbar'>
          <DialogHeader>
            <DialogTitle className='text-base sm:text-lg font-bold text-slate-900'>Edit User Details</DialogTitle>
          </DialogHeader>

          {editingUser && (
            <div className='space-y-4 py-2'>
              <div className='space-y-1.5'>
                <Label htmlFor='full_name' className='text-xs font-semibold text-slate-600'>Full Name</Label>
                <Input
                  id='full_name'
                  className='h-10 rounded-xl border-slate-200'
                  value={form.full_name}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                    setForm((prev) => ({ ...prev, full_name: e.target.value }))
                  }
                />
              </div>

              <div className='space-y-1.5'>
                <Label className='text-xs font-semibold text-slate-600'>Email</Label>
                <Input value={editingUser.email} disabled className='h-10 rounded-xl bg-slate-50 border-slate-200 text-slate-500' />
              </div>

              {editingUser.role === 'curriculum_developer' && (
                <div className='grid grid-cols-1 gap-3 sm:grid-cols-2'>
                  <div className='space-y-1.5'>
                    <Label htmlFor='edit-domain' className='text-xs font-semibold text-slate-600'>Domain</Label>
                    <select
                      id='edit-domain'
                      className='h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-xs sm:text-sm text-slate-700 shadow-xs focus:outline-none focus:ring-2 focus:ring-indigo-300'
                      value={form.domain || ''}
                      onChange={(e: React.ChangeEvent<HTMLSelectElement>) =>
                        setForm((prev) => ({
                          ...prev,
                          domain: e.target.value,
                        }))
                      }
                    >
                      <option value=''>Select Domain</option>
                      <option value='Tech'>Tech</option>
                      <option value='Business'>Business</option>
                      <option value='Creative'>Creative</option>
                      <option value='Non-IT'>Non-IT</option>
                      <option value='Data'>Data</option>
                    </select>
                  </div>
                  <div className='space-y-1.5'>
                    <Label htmlFor='edit-role-focus' className='text-xs font-semibold text-slate-600'>Role Focus</Label>
                    <Input
                      id='edit-role-focus'
                      placeholder='e.g. Full Stack Developer, Data Analyst'
                      className='h-10 rounded-xl border-slate-200'
                      value={form.role_focus || ''}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                        setForm((prev) => ({
                          ...prev,
                          role_focus: e.target.value,
                        }))
                      }
                    />
                  </div>
                </div>
              )}

              {editingUser.role === 'student' && (
                <>
                  <div className='grid grid-cols-1 gap-3 sm:grid-cols-2'>
                    <div className='space-y-1.5'>
                      <Label htmlFor='degree' className='text-xs font-semibold text-slate-600'>Degree</Label>
                      <Input
                        id='degree'
                        placeholder='B.Tech, BCA, etc.'
                        className='h-10 rounded-xl border-slate-200'
                        value={form.degree}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                          setForm((prev) => ({
                            ...prev,
                            degree: e.target.value,
                          }))
                        }
                      />
                    </div>
                    <div className='space-y-1.5'>
                      <Label htmlFor='year' className='text-xs font-semibold text-slate-600'>Batch Year</Label>
                      <Input
                        id='year'
                        type='number'
                        placeholder='2026'
                        className='h-10 rounded-xl border-slate-200'
                        value={form.year}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                          setForm((prev) => ({ ...prev, year: e.target.value }))
                        }
                      />
                    </div>
                  </div>

                  <div className='space-y-1.5'>
                    <Label htmlFor='college' className='text-xs font-semibold text-slate-600'>College</Label>
                    <select
                      id='college'
                      className='h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-xs sm:text-sm shadow-xs focus:outline-none focus:ring-2 focus:ring-indigo-300'
                      value={form.college_id}
                      onChange={(e: React.ChangeEvent<HTMLSelectElement>) =>
                        setForm((prev) => ({
                          ...prev,
                          college_id: e.target.value,
                        }))
                      }
                    >
                      <option value=''>Unassigned</option>
                      {colleges.map((college) => (
                        <option key={college.id} value={college.id}>
                          {college.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </>
              )}

              {editingUser.role === 'facilitator' && (
                <>
                  <div className='space-y-2'>
                    <Label className='text-xs font-semibold text-slate-600'>Assigned Colleges</Label>
                    <small className='block text-xs text-slate-400'>
                      Tap to toggle college assignment
                    </small>
                    <div className='max-h-48 space-y-2 overflow-y-auto rounded-xl border border-slate-200 p-3 bg-slate-50/50 custom-scrollbar'>
                      {colleges.map((college) => {
                        const isSelected = form.facilitator_college_ids.includes(
                          college.id,
                        );
                        return (
                          <button
                            key={college.id}
                            type='button'
                            className={`w-full rounded-xl border px-3 py-2.5 text-left text-xs sm:text-sm font-medium transition-colors ${
                              isSelected
                                ? 'border-emerald-300 bg-emerald-50 text-emerald-800 font-semibold'
                                : 'border-slate-200 bg-white hover:bg-slate-50 text-slate-700'
                            }`}
                            onClick={() => toggleFacilitatorCollege(college.id)}
                          >
                            {college.name}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Assigned Subjects (Add / Remove) */}
                  <div className='space-y-2'>
                    <Label className='text-xs font-semibold text-slate-600'>Assigned Subjects</Label>
                    <small className='block text-xs text-slate-400'>
                      Tap to add or remove subjects assigned to this facilitator
                    </small>
                    <div className='max-h-48 space-y-2 overflow-y-auto rounded-xl border border-slate-200 p-3 bg-slate-50/50 custom-scrollbar'>
                      {subjects.length === 0 ? (
                        <p className='text-xs text-slate-400 p-2 text-center'>No active subjects found</p>
                      ) : (
                        subjects.map((subject) => {
                          const isSelected = form.facilitator_subject_ids.includes(
                            subject.id,
                          );
                          return (
                            <button
                              key={subject.id}
                              type='button'
                              className={`w-full rounded-xl border px-3 py-2.5 text-left text-xs sm:text-sm font-medium transition-colors ${
                                isSelected
                                  ? 'border-indigo-300 bg-indigo-50 text-indigo-800 font-semibold'
                                  : 'border-slate-200 bg-white hover:bg-slate-50 text-slate-700'
                              }`}
                              onClick={() => toggleFacilitatorSubject(subject.id)}
                            >
                              {subject.name}
                            </button>
                          );
                        })
                      )}
                    </div>
                  </div>
                </>
              )}
            </div>
          )}

          <DialogFooter className='gap-2 sm:gap-0'>
            <Button
              variant='outline'
              onClick={closeEditModal}
              disabled={saving}
              className='rounded-xl min-h-[40px]'
            >
              Cancel
            </Button>
            <Button onClick={saveUser} disabled={saving} className='bg-indigo-600 hover:bg-indigo-700 rounded-xl min-h-[40px] font-semibold'>
              {saving ? (
                <>
                  <Loader2 className='mr-2 h-4 w-4 animate-spin' />
                  Saving...
                </>
              ) : (
                'Save Changes'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <StudentProfileDialog
        studentId={profileId}
        apiPrefix='admin'
        onClose={() => setProfileId(null)}
      />

      <FacilitatorProfileDialog
        facilitatorId={facilitatorProfileId}
        onClose={() => setFacilitatorProfileId(null)}
      />

      <AlertDialog open={!!userToDelete} onOpenChange={(open) => !open && setUserToDelete(null)}>
        <AlertDialogContent className='w-[94vw] sm:max-w-md rounded-2xl'>
          <AlertDialogHeader>
            <AlertDialogTitle className='text-base sm:text-lg font-bold text-slate-900'>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription className='text-xs sm:text-sm text-slate-500'>
              This will move <strong className='text-slate-800'>{userToDelete?.full_name}</strong> to the Recycle Bin. 
              They will not be able to log in, but their progress is preserved. You can restore them later.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className='rounded-xl'>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteUser} className="bg-red-600 hover:bg-red-700 text-white rounded-xl">
              Move to Bin
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <RecycleBinModal
        open={isBinOpen}
        onClose={() => setIsBinOpen(false)}
        apiPrefix="admin"
        onRestored={fetchUsers}
      />
    </div>
  );
};

export default Users;
