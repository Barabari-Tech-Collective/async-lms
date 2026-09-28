import { useState } from 'react';
import { UserCircle, Lock, Loader2, Eye, EyeOff } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { useAppDispatch, useAppSelector } from '@/app/hooks';
import { selectUser } from '@/features/auth/authSelectors';
import { loadUser } from '@/features/auth/authThunks';
import apiClient from '@/services/api';
import toast from 'react-hot-toast';
import { getErrorMessage } from '@/lib/utils';

const AdminProfile = () => {
  const dispatch = useAppDispatch();
  const currentUser = useAppSelector(selectUser);

  const [nameForm, setNameForm] = useState({ full_name: currentUser?.full_name || '' });
  const [savingName, setSavingName] = useState(false);

  const [pwForm, setPwForm] = useState({
    current_password: '',
    new_password: '',
    confirm_password: '',
  });
  const [savingPw, setSavingPw] = useState(false);

  const [showCurrentPw, setShowCurrentPw] = useState(false);
  const [showNewPw, setShowNewPw] = useState(false);
  const [showConfirmPw, setShowConfirmPw] = useState(false);

  const handleSaveName = async () => {
    if (!nameForm.full_name.trim()) {
      toast.error('Name cannot be empty');
      return;
    }
    try {
      setSavingName(true);
      await apiClient.put(`/users/${currentUser?.id}`, { full_name: nameForm.full_name.trim() });
      dispatch(loadUser());
      toast.success('Name updated');
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to update name'));
    } finally {
      setSavingName(false);
    }
  };

  const handleChangePassword = async () => {
    if (!pwForm.current_password || !pwForm.new_password || !pwForm.confirm_password) {
      toast.error('All password fields are required');
      return;
    }
    if (pwForm.new_password !== pwForm.confirm_password) {
      toast.error('New passwords do not match');
      return;
    }
    if (pwForm.new_password.length < 6) {
      toast.error('New password must be at least 6 characters');
      return;
    }
    try {
      setSavingPw(true);
      await apiClient.put('/users/password', {
        current_password: pwForm.current_password,
        new_password: pwForm.new_password,
      });
      toast.success('Password changed successfully');
      setPwForm({ current_password: '', new_password: '', confirm_password: '' });
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to change password'));
    } finally {
      setSavingPw(false);
    }
  };

  const initials = currentUser?.full_name
    ?.split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2) || 'A';

  return (
    <div className='max-w-2xl mx-auto space-y-4 sm:space-y-6 min-w-0 animate-in fade-in duration-300'>
      {/* Avatar + info */}
      <Card className='border border-slate-200/80 shadow-xs rounded-2xl bg-white'>
        <CardContent className='p-4 sm:p-6 flex flex-col sm:flex-row items-center sm:items-start text-center sm:text-left gap-4 sm:gap-5'>
          <div className='h-16 w-16 rounded-2xl bg-[#1e2653] flex items-center justify-center text-white text-xl font-bold shrink-0 shadow-sm'>
            {initials}
          </div>
          <div className='min-w-0'>
            <p className='text-base sm:text-lg font-bold text-slate-900 truncate'>{currentUser?.full_name}</p>
            <p className='text-xs sm:text-sm text-slate-500 truncate'>{currentUser?.email}</p>
            <div className='mt-2 flex justify-center sm:justify-start'>
              <Badge className='bg-blue-50 text-blue-700 border-blue-200 font-semibold text-[11px] capitalize'>
                {currentUser?.role}
              </Badge>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Edit name */}
      <Card className='border border-slate-200/80 shadow-xs rounded-2xl bg-white'>
        <CardHeader className='p-4 sm:p-6 pb-2 sm:pb-3'>
          <CardTitle className='text-sm sm:text-base font-bold text-slate-900 flex items-center gap-2'>
            <UserCircle className='h-4 w-4 text-slate-500' />
            Account Information
          </CardTitle>
        </CardHeader>
        <CardContent className='p-4 sm:p-6 pt-2 sm:pt-3 space-y-3.5'>
          <div className='space-y-1.5'>
            <Label htmlFor='full-name' className='text-xs font-semibold text-slate-600'>Full Name</Label>
            <Input
              id='full-name'
              className='h-10 rounded-xl border-slate-200 text-xs sm:text-sm'
              value={nameForm.full_name}
              onChange={(e) => setNameForm({ full_name: e.target.value })}
            />
          </div>
          <div className='space-y-1.5'>
            <Label className='text-xs font-semibold text-slate-600'>Email Address</Label>
            <Input value={currentUser?.email || ''} disabled className='h-10 rounded-xl bg-slate-50 border-slate-200 text-slate-500 text-xs sm:text-sm' />
          </div>
          <Button onClick={handleSaveName} disabled={savingName} className='bg-indigo-600 hover:bg-indigo-700 rounded-xl min-h-[40px] font-semibold text-xs sm:text-sm shadow-xs w-full sm:w-auto'>
            {savingName ? <><Loader2 className='mr-2 h-4 w-4 animate-spin' />Saving...</> : 'Save Changes'}
          </Button>
        </CardContent>
      </Card>

      <Separator />

      {/* Change password */}
      <Card className='border border-slate-200/80 shadow-xs rounded-2xl bg-white'>
        <CardHeader className='p-4 sm:p-6 pb-2 sm:pb-3'>
          <CardTitle className='text-sm sm:text-base font-bold text-slate-900 flex items-center gap-2'>
            <Lock className='h-4 w-4 text-slate-500' />
            Change Password
          </CardTitle>
        </CardHeader>
        <CardContent className='p-4 sm:p-6 pt-2 sm:pt-3 space-y-3.5'>
          <div className='space-y-1.5'>
            <Label htmlFor='current-pw' className='text-xs font-semibold text-slate-600'>Current Password</Label>
            <div className='relative'>
              <Input
                id='current-pw'
                type={showCurrentPw ? 'text' : 'password'}
                className='h-10 rounded-xl border-slate-200 text-xs sm:text-sm pr-10'
                value={pwForm.current_password}
                onChange={(e) => setPwForm((p) => ({ ...p, current_password: e.target.value }))}
              />
              <button
                type='button'
                onClick={() => setShowCurrentPw((v) => !v)}
                className='absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors'
                tabIndex={-1}
                aria-label={showCurrentPw ? 'Hide password' : 'Show password'}
              >
                {showCurrentPw ? <EyeOff className='h-4 w-4' /> : <Eye className='h-4 w-4' />}
              </button>
            </div>
          </div>
          <div className='space-y-1.5'>
            <Label htmlFor='new-pw' className='text-xs font-semibold text-slate-600'>New Password</Label>
            <div className='relative'>
              <Input
                id='new-pw'
                type={showNewPw ? 'text' : 'password'}
                className='h-10 rounded-xl border-slate-200 text-xs sm:text-sm pr-10'
                value={pwForm.new_password}
                onChange={(e) => setPwForm((p) => ({ ...p, new_password: e.target.value }))}
              />
              <button
                type='button'
                onClick={() => setShowNewPw((v) => !v)}
                className='absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors'
                tabIndex={-1}
                aria-label={showNewPw ? 'Hide password' : 'Show password'}
              >
                {showNewPw ? <EyeOff className='h-4 w-4' /> : <Eye className='h-4 w-4' />}
              </button>
            </div>
          </div>
          <div className='space-y-1.5'>
            <Label htmlFor='confirm-pw' className='text-xs font-semibold text-slate-600'>Confirm New Password</Label>
            <div className='relative'>
              <Input
                id='confirm-pw'
                type={showConfirmPw ? 'text' : 'password'}
                className='h-10 rounded-xl border-slate-200 text-xs sm:text-sm pr-10'
                value={pwForm.confirm_password}
                onChange={(e) => setPwForm((p) => ({ ...p, confirm_password: e.target.value }))}
              />
              <button
                type='button'
                onClick={() => setShowConfirmPw((v) => !v)}
                className='absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors'
                tabIndex={-1}
                aria-label={showConfirmPw ? 'Hide password' : 'Show password'}
              >
                {showConfirmPw ? <EyeOff className='h-4 w-4' /> : <Eye className='h-4 w-4' />}
              </button>
            </div>
          </div>
          <Button onClick={handleChangePassword} disabled={savingPw} variant='outline' className='rounded-xl min-h-[40px] font-semibold text-xs sm:text-sm border-slate-200 w-full sm:w-auto'>
            {savingPw ? <><Loader2 className='mr-2 h-4 w-4 animate-spin' />Updating...</> : 'Update Password'}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
};

export default AdminProfile;
