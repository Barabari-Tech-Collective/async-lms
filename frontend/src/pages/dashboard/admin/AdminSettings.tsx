import { useEffect, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Loader2, ShieldCheck, KeyRound, User, Eye, EyeOff } from 'lucide-react';
import apiClient from '@/services/api';
import toast from 'react-hot-toast';
import { getErrorMessage } from '@/lib/utils';

interface UserProfile {
  id: string;
  full_name: string;
  email: string;
  role: string;
  created_at: string;
}

function getInitials(name: string) {
  return name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

const AdminSettings = () => {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  const [currentPw, setCurrentPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [changingPw, setChangingPw] = useState(false);

  const [showCurrentPw, setShowCurrentPw] = useState(false);
  const [showNewPw, setShowNewPw] = useState(false);
  const [showConfirmPw, setShowConfirmPw] = useState(false);

  useEffect(() => {
    apiClient
      .get<{ success: boolean; data: UserProfile }>('/users/profile')
      .then((res) => setProfile(res.data.data))
      .catch(() => {
        // profile remains null — the null check below shows a fallback UI
      })
      .finally(() => setLoading(false));
  }, []);

  const handleChangePassword = async () => {
    if (!currentPw || !newPw || !confirmPw) {
      toast.error('Please fill in all password fields');
      return;
    }
    if (newPw !== confirmPw) {
      toast.error('New passwords do not match');
      return;
    }
    if (newPw.length < 6) {
      toast.error('New password must be at least 6 characters');
      return;
    }
    try {
      setChangingPw(true);
      await apiClient.put('/users/password', {
        current_password: currentPw,
        new_password: newPw,
      });
      toast.success('Password updated successfully');
      setCurrentPw('');
      setNewPw('');
      setConfirmPw('');
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to update password'));
    } finally {
      setChangingPw(false);
    }
  };

  if (loading) {
    return (
      <div className='flex h-[60vh] items-center justify-center'>
        <Loader2 className='h-8 w-8 animate-spin text-indigo-600' />
      </div>
    );
  }

  if (!profile) {
    return (
      <div className='flex h-[60vh] items-center justify-center'>
        <p className='text-slate-500 text-sm'>Failed to load profile.</p>
      </div>
    );
  }

  return (
    <div className='max-w-2xl mx-auto space-y-4 sm:space-y-6 min-w-0 animate-in fade-in duration-300'>
      <div>
        <h1 className='text-lg sm:text-xl font-bold text-slate-900 tracking-tight'>Profile & Settings</h1>
        <p className='text-xs sm:text-sm text-slate-500 mt-0.5'>Manage your administrative credentials and security</p>
      </div>

      {/* Account Info */}
      <Card className='border border-slate-200/80 shadow-xs rounded-2xl overflow-hidden bg-white'>
        <div className='bg-slate-50 px-4 sm:px-6 py-3.5 flex items-center gap-2 border-b border-slate-100'>
          <User className='h-4 w-4 text-slate-500' />
          <p className='text-xs sm:text-sm font-semibold text-slate-700'>Account Details</p>
        </div>
        <div className='p-4 sm:p-6 flex flex-col sm:flex-row items-center sm:items-start text-center sm:text-left gap-4 sm:gap-6'>
          <Avatar className='h-16 w-16 sm:h-20 sm:w-20 border-4 border-slate-100 shrink-0 shadow-xs'>
            <AvatarFallback className='bg-indigo-100 text-indigo-700 text-lg sm:text-xl font-bold'>
              {getInitials(profile.full_name)}
            </AvatarFallback>
          </Avatar>
          <div className='flex-1 space-y-1 min-w-0'>
            <h2 className='text-base sm:text-lg font-bold text-slate-900 truncate'>{profile.full_name}</h2>
            <p className='text-slate-500 text-xs sm:text-sm truncate'>{profile.email}</p>
            <p className='text-slate-400 text-xs'>
              Member since{' '}
              {new Date(profile.created_at).toLocaleDateString('en-US', {
                year: 'numeric',
                month: 'long',
                day: 'numeric',
              })}
            </p>
            <div className='pt-1 flex justify-center sm:justify-start'>
              <Badge className='bg-indigo-50 text-indigo-700 border-indigo-200 gap-1 font-semibold text-[11px]'>
                <ShieldCheck className='h-3 w-3' />
                Administrator
              </Badge>
            </div>
          </div>
        </div>
      </Card>

      {/* Change Password */}
      <Card className='border border-slate-200/80 shadow-xs rounded-2xl overflow-hidden bg-white'>
        <div className='bg-slate-50 px-4 sm:px-6 py-3.5 flex items-center gap-2 border-b border-slate-100'>
          <KeyRound className='h-4 w-4 text-slate-500' />
          <p className='text-xs sm:text-sm font-semibold text-slate-700'>Change Password</p>
        </div>
        <div className='p-4 sm:p-6 space-y-3.5'>
          <div className='space-y-1.5'>
            <label className='text-xs font-semibold text-slate-600'>Current Password</label>
            <div className='relative'>
              <Input
                type={showCurrentPw ? 'text' : 'password'}
                placeholder='Enter current password'
                value={currentPw}
                onChange={(e) => setCurrentPw(e.target.value)}
                className='h-10 rounded-xl border-slate-200 text-xs sm:text-sm pr-10'
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
            <label className='text-xs font-semibold text-slate-600'>New Password</label>
            <div className='relative'>
              <Input
                type={showNewPw ? 'text' : 'password'}
                placeholder='Enter new password (min. 6 characters)'
                value={newPw}
                onChange={(e) => setNewPw(e.target.value)}
                className='h-10 rounded-xl border-slate-200 text-xs sm:text-sm pr-10'
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
            <label className='text-xs font-semibold text-slate-600'>Confirm New Password</label>
            <div className='relative'>
              <Input
                type={showConfirmPw ? 'text' : 'password'}
                placeholder='Confirm new password'
                value={confirmPw}
                onChange={(e) => setConfirmPw(e.target.value)}
                className='h-10 rounded-xl border-slate-200 text-xs sm:text-sm pr-10'
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
          <div className='pt-2'>
            <Button
              onClick={handleChangePassword}
              disabled={changingPw}
              className='bg-indigo-600 hover:bg-indigo-700 rounded-xl min-h-[40px] font-semibold text-xs sm:text-sm shadow-xs w-full sm:w-auto'
            >
              {changingPw ? (
                <>
                  <Loader2 className='mr-2 h-4 w-4 animate-spin' />
                  Updating...
                </>
              ) : (
                'Update Password'
              )}
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
};

export default AdminSettings;
