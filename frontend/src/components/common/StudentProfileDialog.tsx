import { useEffect, useState, useCallback } from 'react';
import {
  Loader2,
  BookOpen,
  Flame,
  Star,
  CheckCircle2,
  Building2,
  GraduationCap,
  CalendarDays,
  Plus,
  Trash2,
  Check,
  X,
  AlertTriangle,
  Clock,
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import apiClient from '@/services/api';
import toast from 'react-hot-toast';
import { getErrorMessage } from '@/lib/utils';

interface SubjectRow {
  id: string;
  name: string;
  completed_subtopics: number;
  total_subtopics: number;
  progress_percent: number;
  is_completed?: boolean;
  can_manage?: boolean;
}

interface PendingRequestRow {
  id: string;
  subject_id: string;
  subject_name: string;
  status: string;
  rejection_reason?: string | null;
  created_at: string;
  can_manage?: boolean;
}

interface StudentStats {
  enrolled_subjects: number;
  completed_subtopics: number;
  total_points: number;
  current_streak: number;
  longest_streak: number;
}

interface StudentProfile {
  id: string;
  full_name: string;
  email: string;
  is_verified: boolean;
  created_at: string;
  degree: string | null;
  batch: number | null;
  college_name: string | null;
  college_short_name: string | null;
  stats: StudentStats;
  subjects: SubjectRow[];
  pending_requests?: PendingRequestRow[];
}

interface AvailableCourse {
  id: string;
  name: string;
  slug?: string;
  description?: string;
}

interface Props {
  studentId: string | null;
  apiPrefix: 'admin' | 'facilitator';
  onClose: () => void;
}

export default function StudentProfileDialog({ studentId, apiPrefix, onClose }: Props) {
  const [profile, setProfile] = useState<StudentProfile | null>(null);
  const [loading, setLoading] = useState(false);

  // Add course states
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [availableCourses, setAvailableCourses] = useState<AvailableCourse[]>([]);
  const [loadingAvailable, setLoadingAvailable] = useState(false);
  const [selectedCourseId, setSelectedCourseId] = useState('');
  const [submittingAdd, setSubmittingAdd] = useState(false);

  // Revoke course states
  const [revokeTarget, setRevokeTarget] = useState<SubjectRow | null>(null);
  const [forceRevoke, setForceRevoke] = useState(false);
  const [submittingRevoke, setSubmittingRevoke] = useState(false);

  // Reject request state
  const [rejectTarget, setRejectTarget] = useState<PendingRequestRow | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');
  const [submittingReview, setSubmittingReview] = useState(false);

  const fetchProfile = useCallback(() => {
    if (!studentId) return;
    setLoading(true);
    apiClient
      .get<{ success: boolean; data: StudentProfile }>(`/${apiPrefix}/students/${studentId}`)
      .then((res) => setProfile(res.data.data))
      .catch((err) => {
        console.error('Failed to load profile:', err);
        setProfile(null);
      })
      .finally(() => setLoading(false));
  }, [studentId, apiPrefix]);

  useEffect(() => {
    fetchProfile();
  }, [fetchProfile]);

  const handleOpenAddDialog = async () => {
    if (!studentId) return;
    setShowAddDialog(true);
    setSelectedCourseId('');
    setLoadingAvailable(true);
    try {
      const res = await apiClient.get<{ success: boolean; data: AvailableCourse[] }>(
        `/${apiPrefix}/students/${studentId}/available-courses`,
      );
      setAvailableCourses(res.data.data ?? []);
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to fetch available courses'));
    } finally {
      setLoadingAvailable(false);
    }
  };

  const handleConfirmAddCourse = async () => {
    if (!studentId || !selectedCourseId) return;
    setSubmittingAdd(true);
    try {
      await apiClient.post(`/${apiPrefix}/students/${studentId}/courses`, {
        subject_id: selectedCourseId,
      });
      toast.success('Course added successfully!');
      setShowAddDialog(false);
      fetchProfile();
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to enroll student in course'));
    } finally {
      setSubmittingAdd(false);
    }
  };

  const handleConfirmRevokeCourse = async () => {
    if (!studentId || !revokeTarget) return;
    setSubmittingRevoke(true);
    try {
      await apiClient.delete(
        `/${apiPrefix}/students/${studentId}/courses/${revokeTarget.id}${
          forceRevoke ? '?force=true' : ''
        }`,
      );
      toast.success(`Access to ${revokeTarget.name} revoked successfully`);
      setRevokeTarget(null);
      setForceRevoke(false);
      fetchProfile();
    } catch (err: any) {
      if (err.response?.data?.isCompleted) {
        setForceRevoke(true);
        toast.error('This course is completed with a certificate. Check the force box to confirm.');
      } else {
        toast.error(getErrorMessage(err, 'Failed to revoke course access'));
      }
    } finally {
      setSubmittingRevoke(false);
    }
  };

  const handleApproveRequest = async (reqItem: PendingRequestRow) => {
    setSubmittingReview(true);
    try {
      await apiClient.patch(`/${apiPrefix}/enrollment-requests/${reqItem.id}`, {
        status: 'approved',
      });
      toast.success(`Approved enrollment in ${reqItem.subject_name}!`);
      fetchProfile();
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to approve enrollment request'));
    } finally {
      setSubmittingReview(false);
    }
  };

  const handleConfirmRejectRequest = async () => {
    if (!rejectTarget) return;
    setSubmittingReview(true);
    try {
      await apiClient.patch(`/${apiPrefix}/enrollment-requests/${rejectTarget.id}`, {
        status: 'rejected',
        rejection_reason: rejectionReason.trim() || undefined,
      });
      toast.success(`Rejected request for ${rejectTarget.subject_name}`);
      setRejectTarget(null);
      setRejectionReason('');
      fetchProfile();
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to reject enrollment request'));
    } finally {
      setSubmittingReview(false);
    }
  };

  const initials = profile?.full_name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .slice(0, 2)
    .toUpperCase() ?? '?';

  return (
    <>
      <Dialog open={!!studentId} onOpenChange={(open) => !open && onClose()}>
        <DialogContent className='sm:max-w-xl max-h-[90vh] overflow-y-auto'>
          <DialogHeader>
            <DialogTitle>Student Profile</DialogTitle>
          </DialogHeader>

          {loading && (
            <div className='flex items-center justify-center py-16'>
              <Loader2 className='h-7 w-7 animate-spin text-blue-500' />
            </div>
          )}

          {!loading && profile && (
            <div className='space-y-5'>
              {/* Header */}
              <div className='flex items-center gap-4'>
                <div className='w-14 h-14 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center font-bold text-lg shrink-0'>
                  {initials}
                </div>
                <div className='min-w-0 flex-1'>
                  <p className='font-bold text-lg text-slate-900 truncate'>{profile.full_name}</p>
                  <p className='text-sm text-slate-500 truncate'>{profile.email}</p>
                  <Badge
                    className={`mt-1 text-[10px] ${
                      profile.is_verified
                        ? 'bg-emerald-50 text-emerald-700'
                        : 'bg-yellow-50 text-yellow-700'
                    }`}
                  >
                    {profile.is_verified ? 'Verified' : 'Unverified'}
                  </Badge>
                </div>
              </div>

              {/* Info grid */}
              <div className='grid grid-cols-2 gap-3'>
                <div className='flex items-start gap-2 rounded-lg bg-slate-50 p-3'>
                  <Building2 size={15} className='text-slate-400 mt-0.5 shrink-0' />
                  <div>
                    <p className='text-[10px] font-semibold uppercase text-slate-400 tracking-wider'>College</p>
                    <p className='text-sm font-semibold text-slate-800'>
                      {profile.college_name || 'N/A'}
                    </p>
                  </div>
                </div>
                <div className='flex items-start gap-2 rounded-lg bg-slate-50 p-3'>
                  <GraduationCap size={15} className='text-slate-400 mt-0.5 shrink-0' />
                  <div>
                    <p className='text-[10px] font-semibold uppercase text-slate-400 tracking-wider'>Degree</p>
                    <p className='text-sm font-semibold text-slate-800'>{profile.degree || 'N/A'}</p>
                    {profile.batch && (
                      <p className='text-[11px] text-slate-500'>Batch {profile.batch}</p>
                    )}
                  </div>
                </div>
                <div className='flex items-start gap-2 rounded-lg bg-slate-50 p-3 col-span-2'>
                  <CalendarDays size={15} className='text-slate-400 mt-0.5 shrink-0' />
                  <div>
                    <p className='text-[10px] font-semibold uppercase text-slate-400 tracking-wider'>Joined</p>
                    <p className='text-sm font-semibold text-slate-800'>
                      {new Date(profile.created_at).toLocaleDateString('en-GB', {
                        day: '2-digit',
                        month: 'long',
                        year: 'numeric',
                      })}
                    </p>
                  </div>
                </div>
              </div>

              {/* Stats */}
              <div className='grid grid-cols-2 gap-3 sm:grid-cols-4'>
                {[
                  { icon: BookOpen, label: 'Subjects', value: profile.stats.enrolled_subjects, color: 'text-blue-500' },
                  { icon: CheckCircle2, label: 'Completed', value: profile.stats.completed_subtopics, color: 'text-emerald-500' },
                  { icon: Star, label: 'XP Points', value: profile.stats.total_points, color: 'text-yellow-500' },
                  { icon: Flame, label: 'Streak', value: `${profile.stats.current_streak}d`, color: 'text-orange-500' },
                ].map(({ icon: Icon, label, value, color }) => (
                  <div key={label} className='flex flex-col items-center gap-1 rounded-lg border border-slate-100 bg-white p-3 text-center shadow-sm'>
                    <Icon size={18} className={color} />
                    <p className='text-lg font-bold text-slate-900'>{value}</p>
                    <p className='text-[10px] text-slate-400 uppercase tracking-wide'>{label}</p>
                  </div>
                ))}
              </div>

              {/* Pending Enrollment Requests (if any) */}
              {profile.pending_requests && profile.pending_requests.length > 0 && (
                <div className='rounded-xl border border-amber-200 bg-amber-50/50 p-4 space-y-3'>
                  <div className='flex items-center gap-2 text-amber-800 font-bold text-xs uppercase tracking-wider'>
                    <Clock size={15} className='text-amber-600' />
                    Pending Enrollment Requests ({profile.pending_requests.length})
                  </div>
                  <div className='space-y-2'>
                    {profile.pending_requests.map((reqItem) => (
                      <div
                        key={reqItem.id}
                        className='flex items-center justify-between p-2.5 bg-white rounded-lg border border-amber-100 shadow-xs'
                      >
                        <div className='min-w-0'>
                          <p className='text-sm font-bold text-slate-800 truncate'>{reqItem.subject_name}</p>
                          <p className='text-[11px] text-slate-400'>
                            Requested on {new Date(reqItem.created_at).toLocaleDateString()}
                          </p>
                        </div>
                        {reqItem.can_manage !== false ? (
                          <div className='flex items-center gap-1.5 shrink-0'>
                            <Button
                              size='sm'
                              disabled={submittingReview}
                              onClick={() => handleApproveRequest(reqItem)}
                              className='h-8 px-2.5 text-xs bg-emerald-600 hover:bg-emerald-700 text-white gap-1'
                            >
                              <Check size={13} />
                              Approve
                            </Button>
                            <Button
                              size='sm'
                              variant='outline'
                              disabled={submittingReview}
                              onClick={() => {
                                setRejectTarget(reqItem);
                                setRejectionReason('');
                              }}
                              className='h-8 px-2.5 text-xs border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700 gap-1'
                            >
                              <X size={13} />
                              Reject
                            </Button>
                          </div>
                        ) : (
                          <Badge variant='outline' className='text-[10px] text-slate-400 border-slate-200'>
                            Assigned to another instructor
                          </Badge>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Enrolled subjects */}
              <div>
                <div className='flex items-center justify-between mb-2'>
                  <p className='text-xs font-bold uppercase tracking-wider text-slate-400'>
                    Enrolled Subjects ({profile.subjects.length})
                  </p>
                  <Button
                    size='sm'
                    variant='outline'
                    onClick={handleOpenAddDialog}
                    className='h-7 text-xs font-semibold gap-1 text-[#333D7C] hover:bg-[#333D7C]/10 border-[#333D7C]/30'
                  >
                    <Plus size={13} />
                    Add Course
                  </Button>
                </div>

                {profile.subjects.length > 0 ? (
                  <div className='space-y-2.5'>
                    {profile.subjects.map((s) => (
                      <div key={s.id} className='p-3 rounded-lg border border-slate-100 bg-white space-y-2 shadow-xs'>
                        <div className='flex items-center justify-between gap-2'>
                          <div className='flex items-center gap-2 min-w-0'>
                            <span className='font-semibold text-sm text-slate-800 truncate'>{s.name}</span>
                            {s.is_completed && (
                              <Badge className='bg-emerald-50 text-emerald-700 border-none text-[9px] font-bold uppercase py-0'>
                                Completed
                              </Badge>
                            )}
                          </div>
                          <div className='flex items-center gap-2 shrink-0'>
                            <span className='text-xs font-bold text-indigo-600'>{s.progress_percent}%</span>
                            {s.can_manage !== false && (
                              <Button
                                size='icon'
                                variant='ghost'
                                onClick={() => {
                                  setRevokeTarget(s);
                                  setForceRevoke(false);
                                }}
                                title='Revoke Course Access'
                                className='h-7 w-7 text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors'
                              >
                                <Trash2 size={14} />
                              </Button>
                            )}
                          </div>
                        </div>
                        <Progress value={s.progress_percent} className='h-1.5 bg-indigo-50' />
                        <div className='flex items-center justify-between text-[11px] text-slate-400'>
                          <span>
                            {s.completed_subtopics} / {s.total_subtopics} subtopics
                          </span>
                          {s.can_manage === false && (
                            <span className='text-[10px] text-slate-400 italic'>Managed by another instructor</span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className='text-center py-6 bg-slate-50 rounded-lg border border-dashed border-slate-200'>
                    <p className='text-sm text-slate-500 font-medium'>No subjects currently enrolled.</p>
                    <Button
                      size='sm'
                      onClick={handleOpenAddDialog}
                      className='mt-2 text-xs bg-[#333D7C] hover:bg-[#2a3268] text-white gap-1'
                    >
                      <Plus size={13} />
                      Enroll in First Course
                    </Button>
                  </div>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Add Course Modal */}
      <Dialog open={showAddDialog} onOpenChange={(open) => !open && setShowAddDialog(false)}>
        <DialogContent className='sm:max-w-md'>
          <DialogHeader>
            <DialogTitle>Enroll Student in Course</DialogTitle>
            <DialogDescription>
              Select a course to directly enroll <span className='font-semibold text-slate-800'>{profile?.full_name}</span>.
            </DialogDescription>
          </DialogHeader>

          {loadingAvailable ? (
            <div className='flex items-center justify-center py-8'>
              <Loader2 className='h-6 w-6 animate-spin text-blue-500' />
            </div>
          ) : availableCourses.length === 0 ? (
            <div className='py-6 text-center text-sm text-slate-500'>
              No additional courses available to enroll this student in.
            </div>
          ) : (
            <div className='space-y-4 py-2'>
              <div className='space-y-1.5'>
                <label className='text-xs font-semibold text-slate-700'>Select Course</label>
                <select
                  value={selectedCourseId}
                  onChange={(e) => setSelectedCourseId(e.target.value)}
                  className='w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 shadow-xs focus:outline-hidden focus:ring-2 focus:ring-[#333D7C]/20'
                >
                  <option value=''>-- Choose a course --</option>
                  {availableCourses.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant='outline' onClick={() => setShowAddDialog(false)} disabled={submittingAdd}>
              Cancel
            </Button>
            <Button
              onClick={handleConfirmAddCourse}
              disabled={submittingAdd || !selectedCourseId || loadingAvailable}
              className='bg-[#333D7C] hover:bg-[#2a3268] text-white'
            >
              {submittingAdd && <Loader2 className='w-4 h-4 animate-spin mr-1.5' />}
              {submittingAdd ? 'Enrolling...' : 'Enroll Course'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Revoke Course Access Confirmation Modal */}
      <Dialog open={!!revokeTarget} onOpenChange={(open) => !open && setRevokeTarget(null)}>
        <DialogContent className='sm:max-w-md'>
          <DialogHeader>
            <div className='flex items-center gap-2 text-red-600 mb-1'>
              <AlertTriangle size={18} />
              <DialogTitle className='text-red-600'>Revoke Course Access?</DialogTitle>
            </div>
            <DialogDescription className='text-slate-600'>
              Are you sure you want to remove <span className='font-bold text-slate-800'>{revokeTarget?.name}</span> from{' '}
              <span className='font-bold text-slate-800'>{profile?.full_name}</span>?
            </DialogDescription>
          </DialogHeader>

          {revokeTarget?.is_completed && (
            <div className='p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-800 space-y-2'>
              <p className='font-semibold'>⚠️ Completed Course Notice:</p>
              <p>
                The student has already completed this course and holds an issued certificate. Revoking access will detach
                this credential.
              </p>
              <label className='flex items-center gap-2 pt-1 cursor-pointer font-medium text-red-900'>
                <input
                  type='checkbox'
                  checked={forceRevoke}
                  onChange={(e) => setForceRevoke(e.target.checked)}
                  className='rounded border-red-300 text-red-600 focus:ring-red-500'
                />
                Confirm force revocation of completed course
              </label>
            </div>
          )}

          <DialogFooter>
            <Button variant='outline' onClick={() => setRevokeTarget(null)} disabled={submittingRevoke}>
              Cancel
            </Button>
            <Button
              onClick={handleConfirmRevokeCourse}
              disabled={submittingRevoke || (revokeTarget?.is_completed && !forceRevoke)}
              className='bg-red-600 hover:bg-red-700 text-white'
            >
              {submittingRevoke && <Loader2 className='w-4 h-4 animate-spin mr-1.5' />}
              {submittingRevoke ? 'Revoking...' : 'Revoke Access'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reject Request Modal */}
      <Dialog open={!!rejectTarget} onOpenChange={(open) => !open && setRejectTarget(null)}>
        <DialogContent className='sm:max-w-md'>
          <DialogHeader>
            <DialogTitle>Reject Enrollment Request</DialogTitle>
            <DialogDescription>
              Reject request for <span className='font-semibold text-slate-800'>{rejectTarget?.subject_name}</span>. You can
              optionally provide feedback to the student.
            </DialogDescription>
          </DialogHeader>

          <div className='space-y-2 py-2'>
            <label className='text-xs font-semibold text-slate-700'>Reason for rejection (optional)</label>
            <Input
              placeholder='e.g., Prerequisites not met, complete prerequisite first...'
              value={rejectionReason}
              onChange={(e) => setRejectionReason(e.target.value)}
            />
          </div>

          <DialogFooter>
            <Button variant='outline' onClick={() => setRejectTarget(null)} disabled={submittingReview}>
              Cancel
            </Button>
            <Button
              onClick={handleConfirmRejectRequest}
              disabled={submittingReview}
              className='bg-red-600 hover:bg-red-700 text-white'
            >
              {submittingReview && <Loader2 className='w-4 h-4 animate-spin mr-1.5' />}
              {submittingReview ? 'Rejecting...' : 'Confirm Rejection'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
