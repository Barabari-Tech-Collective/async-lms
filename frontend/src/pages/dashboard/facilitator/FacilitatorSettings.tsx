import { useEffect, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { BookOpen, KeyRound, User, Eye, EyeOff } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import apiClient from '@/services/api';
import toast from 'react-hot-toast';
import { getErrorMessage } from '@/lib/utils';

function FacilitatorSettingsSkeleton() {
  return (
    <div className='p-3.5 sm:p-8 max-w-2xl mx-auto space-y-4 sm:space-y-6 min-w-0'>
      <div className='space-y-2'>
        <Skeleton className='h-8 w-40' />
        <Skeleton className='h-4 w-64' />
      </div>
      <div className='rounded-2xl border border-slate-200 bg-white p-4 sm:p-6 space-y-4'>
        <div className='flex flex-col sm:flex-row items-start sm:items-center gap-4'>
          <Skeleton className='h-16 w-16 sm:h-20 sm:w-20 rounded-full' />
          <div className='space-y-2 flex-1 w-full'>
            <Skeleton className='h-5 w-40' />
            <Skeleton className='h-4 w-56' />
            <Skeleton className='h-5 w-20 rounded-full' />
          </div>
        </div>
        <div className='grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2'>
          {[...Array(4)].map((_, i) => (
            <div key={i} className='space-y-1.5'>
              <Skeleton className='h-3 w-20' />
              <Skeleton className='h-9 w-full rounded-lg' />
            </div>
          ))}
        </div>
      </div>
      <div className='rounded-2xl border border-slate-200 bg-white p-4 sm:p-6 space-y-4'>
        <Skeleton className='h-5 w-36' />
        {[...Array(3)].map((_, i) => (
          <div key={i} className='space-y-1.5'>
            <Skeleton className='h-3 w-24' />
            <Skeleton className='h-9 w-full rounded-lg' />
          </div>
        ))}
        <Skeleton className='h-10 w-full sm:w-36 rounded-xl' />
      </div>
    </div>
  );
}

interface UserProfile {
  id: string;
  full_name: string;
  email: string;
  role: string;
  college_name?: string | null;
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

const FacilitatorSettings = () => {
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

  if (loading) return <FacilitatorSettingsSkeleton />;

  if (!profile) {
    return (
      <div className='flex h-[60vh] items-center justify-center p-4 text-center'>
        <p className='text-sm text-slate-500'>Failed to load profile.</p>
      </div>
    );
  }

  return (
    <div className='p-3.5 sm:p-8 max-w-2xl mx-auto space-y-4 sm:space-y-6 min-w-0'>
      <div>
        <h1 className='text-xl sm:text-2xl font-bold text-slate-900 tracking-tight'>Profile & Settings</h1>
        <p className='text-xs sm:text-sm text-slate-500 mt-0.5'>Manage your facilitator account settings and security</p>
      </div>

      {/* Account Info */}
      <Card className='overflow-hidden rounded-2xl border-slate-200/80 shadow-xs'>
        <div className='bg-slate-50 px-4 sm:px-6 py-3.5 sm:py-4 flex items-center gap-2 border-b border-slate-100'>
          <User className='h-4 w-4 text-slate-500' />
          <p className='text-xs sm:text-sm font-semibold text-slate-700'>Account Details</p>
        </div>
        <div className='p-4 sm:p-6 flex flex-col sm:flex-row items-start sm:items-center gap-4 sm:gap-6'>
          <Avatar className='h-16 w-16 sm:h-20 sm:w-20 border-4 border-slate-100 shrink-0'>
            <AvatarFallback className='bg-emerald-100 text-emerald-700 text-lg sm:text-xl font-bold'>
              {getInitials(profile.full_name)}
            </AvatarFallback>
          </Avatar>
          <div className='flex-1 space-y-1 min-w-0 w-full'>
            <h2 className='text-lg sm:text-xl font-bold text-slate-900 truncate'>{profile.full_name}</h2>
            <p className='text-slate-500 text-xs sm:text-sm truncate'>{profile.email}</p>
            {profile.college_name && (
              <p className='text-slate-500 text-xs sm:text-sm truncate'>{profile.college_name}</p>
            )}
            <p className='text-slate-400 text-[11px] sm:text-xs pt-0.5'>
              Member since{' '}
              {new Date(profile.created_at).toLocaleDateString('en-US', {
                year: 'numeric',
                month: 'long',
                day: 'numeric',
              })}
            </p>
            <div className='pt-1.5'>
              <Badge className='bg-emerald-100 text-emerald-700 gap-1 text-xs'>
                <BookOpen className='h-3 w-3' />
                Facilitator
              </Badge>
            </div>
          </div>
        </div>
      </Card>

      {/* Change Password */}
      <Card className='overflow-hidden rounded-2xl border-slate-200/80 shadow-xs'>
        <div className='bg-slate-50 px-4 sm:px-6 py-3.5 sm:py-4 flex items-center gap-2 border-b border-slate-100'>
          <KeyRound className='h-4 w-4 text-slate-500' />
          <p className='text-xs sm:text-sm font-semibold text-slate-700'>Change Password</p>
        </div>
        <div className='p-4 sm:p-6 space-y-4'>
          <div className='space-y-1.5'>
            <label className='text-xs sm:text-sm font-medium text-slate-700'>Current Password</label>
            <div className='relative'>
              <Input
                type={showCurrentPw ? 'text' : 'password'}
                placeholder='Enter current password'
                value={currentPw}
                onChange={(e) => setCurrentPw(e.target.value)}
                className='min-h-[40px] rounded-xl text-xs sm:text-sm pr-10'
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
            <label className='text-xs sm:text-sm font-medium text-slate-700'>New Password</label>
            <div className='relative'>
              <Input
                type={showNewPw ? 'text' : 'password'}
                placeholder='Min. 6 characters'
                value={newPw}
                onChange={(e) => setNewPw(e.target.value)}
                className='min-h-[40px] rounded-xl text-xs sm:text-sm pr-10'
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
            <label className='text-xs sm:text-sm font-medium text-slate-700'>Confirm New Password</label>
            <div className='relative'>
              <Input
                type={showConfirmPw ? 'text' : 'password'}
                placeholder='Repeat new password'
                value={confirmPw}
                onChange={(e) => setConfirmPw(e.target.value)}
                className='min-h-[40px] rounded-xl text-xs sm:text-sm pr-10'
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
          <Button
            onClick={handleChangePassword}
            loading={changingPw}
            className='w-full bg-emerald-600 hover:bg-emerald-700 min-h-[44px] rounded-xl text-xs sm:text-sm font-semibold'
          >
            Update Password
          </Button>
        </div>
      </Card>
    </div>
  );
};

export default FacilitatorSettings;
