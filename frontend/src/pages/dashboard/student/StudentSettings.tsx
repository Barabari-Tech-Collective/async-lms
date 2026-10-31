import { useEffect, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Loader2, KeyRound, User, Eye, EyeOff, CheckCircle2, Link2, AlertTriangle } from 'lucide-react';
import apiClient from '@/services/api';
import toast from 'react-hot-toast';
import { getErrorMessage } from '@/lib/utils';

interface UserProfile {
  id: string;
  full_name: string;
  email: string;
  role: string;
  degree?: string | null;
  year?: string | null;
  college_name?: string | null;
  created_at: string;
}

type MeetIdentityStatus = 'verified' | 'pending' | 'review_required' | 'revoked' | null;

interface MeetIdentity {
  linked: boolean;
  email: string | null;
  status: MeetIdentityStatus;
  verifiedAt?: string | null;
  reviewReason?: string | null;
}

function getInitials(name: string) {
  return name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

export default function StudentSettings() {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [meetIdentity, setMeetIdentity] = useState<MeetIdentity | null>(null);
  const [linkingMeetAccount, setLinkingMeetAccount] = useState(false);

  const [currentPw, setCurrentPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [changingPw, setChangingPw] = useState(false);

  const [showCurrentPw, setShowCurrentPw] = useState(false);
  const [showNewPw, setShowNewPw] = useState(false);
  const [showConfirmPw, setShowConfirmPw] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const linkResult = params.get('meet_link');
    if (linkResult) {
      const messages: Record<string, string> = {
        success: 'Google Meet account linked successfully.',
        conflict: 'That Google account is already linked to another student.',
        state_mismatch: 'The Google linking session expired. Please try again.',
        invalid_identity: 'Google could not verify the selected account.',
        cancelled: 'Google account linking was cancelled.',
        failed: 'Google account linking failed. Please try again.',
      };
      if (messages[linkResult]) {
        if (linkResult === 'success') {
          toast.success(messages[linkResult]);
        } else if (linkResult === 'cancelled') {
          toast(messages[linkResult]);
        } else {
          toast.error(messages[linkResult]);
        }
      }
      window.history.replaceState({}, document.title, window.location.pathname);
    }

    Promise.allSettled([
      apiClient.get<{ success: boolean; data: UserProfile }>('/users/profile'),
      apiClient.get<{ success: boolean; data: MeetIdentity }>('/me/google-identity'),
    ])
      .then(([profileRes, identityRes]) => {
        if (profileRes.status === 'fulfilled') setProfile(profileRes.value.data.data);
        if (identityRes.status === 'fulfilled') setMeetIdentity(identityRes.value.data.data);
      })
      .finally(() => setLoading(false));
  }, []);

  const handleLinkMeetAccount = async () => {
    try {
      setLinkingMeetAccount(true);
      const response = await apiClient.post<{ authorizationUrl: string }>(
        '/me/google-identity/link',
      );
      window.location.assign(response.data.authorizationUrl);
    } catch (err) {
      toast.error(getErrorMessage(err, 'Google account linking is not available'));
      setLinkingMeetAccount(false);
    }
  };

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
        <p className='text-slate-500'>Failed to load profile.</p>
      </div>
    );
  }

  const subtitle = [profile.degree, profile.year ? `Batch ${profile.year}` : null]
    .filter(Boolean)
    .join(' • ');

  return (
    <div className='p-4 sm:p-6 md:p-8 max-w-2xl mx-auto space-y-5 sm:space-y-6'>
      <h1 className='text-2xl sm:text-3xl font-bold text-slate-900'>Settings</h1>

      {/* Account Info */}
      <Card className='overflow-hidden rounded-2xl'>
        <div className='bg-slate-50 px-4 sm:px-6 py-3.5 sm:py-4 flex items-center gap-2 border-b'>
          <User className='h-4 w-4 text-slate-500' />
          <p className='text-xs sm:text-sm font-semibold text-slate-700'>Account Details</p>
        </div>
        <div className='p-4 sm:p-6 flex flex-col sm:flex-row items-center sm:items-start text-center sm:text-left gap-4 sm:gap-6'>
          <Avatar className='h-16 w-16 sm:h-20 sm:w-20 border-4 border-slate-100 shrink-0'>
            <AvatarFallback className='bg-indigo-100 text-indigo-700 text-lg sm:text-xl font-bold'>
              {getInitials(profile.full_name)}
            </AvatarFallback>
          </Avatar>
          <div className='flex-1 space-y-1 min-w-0'>
            <h2 className='text-lg sm:text-xl font-bold text-slate-900 truncate'>{profile.full_name}</h2>
            <p className='text-slate-500 text-xs sm:text-sm truncate'>{profile.email}</p>
            {subtitle && <p className='text-slate-400 text-xs sm:text-sm'>{subtitle}</p>}
            {profile.college_name && (
              <p className='text-slate-400 text-xs sm:text-sm'>{profile.college_name}</p>
            )}
            <p className='text-slate-400 text-[11px] sm:text-xs pt-1'>
              Member since{' '}
              {new Date(profile.created_at).toLocaleDateString('en-US', {
                year: 'numeric',
                month: 'long',
                day: 'numeric',
              })}
            </p>
          </div>
        </div>
      </Card>

      <Card className='overflow-hidden rounded-2xl'>
        <div className='bg-slate-50 px-4 sm:px-6 py-3.5 sm:py-4 flex items-center gap-2 border-b'>
          <Link2 className='h-4 w-4 text-slate-500' />
          <p className='text-xs sm:text-sm font-semibold text-slate-700'>Meet attendance account</p>
        </div>
        <div className='p-4 sm:p-6 space-y-4'>
          {!meetIdentity?.linked ?(<p className='text-sm text-slate-600'>
            Link the Google account you will use to join Google Meet classes.We recommend using {profile.email}.
          </p>) : <p className='text-sm text-slate-600'>Your Google account is linked successfully.</p>}
          
          {meetIdentity?.linked && meetIdentity.status === 'verified' ? (
            <div className='flex items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4'>
              <CheckCircle2 className='mt-0.5 h-5 w-5 shrink-0 text-emerald-600' />
              <div>
                <p className='text-sm font-semibold text-emerald-800'>Google Meet account verified</p>
                <p className='mt-1 text-sm text-emerald-700'>{meetIdentity.email}</p>
                <p className='mt-1 text-xs text-emerald-700'>
                  Join classes using this Google account for automatic attendance matching.
                </p>
              </div>
            </div>
          ) : (
            <>
              {meetIdentity?.status === 'review_required' || meetIdentity?.status === 'revoked' ? (
                <div className='flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4'>
                  <AlertTriangle className='mt-0.5 h-5 w-5 shrink-0 text-amber-600' />
                  <p className='text-sm text-amber-800'>
                    This Google Meet account needs attention before automatic attendance can be recorded.
                  </p>
                </div>
              ) : (
                <p className='text-sm text-slate-500'>
                  Your Meet account is not linked. Link it before joining classes so your attendance can be matched.
                </p>
              )}
              <Button
                type='button'
                onClick={handleLinkMeetAccount}
                disabled={linkingMeetAccount}
                className='w-full sm:w-auto'
              >
                {linkingMeetAccount && <Loader2 className='mr-2 h-4 w-4 animate-spin' />}
                {linkingMeetAccount ? 'Opening Google...' : 'Sign in with Google for Meet'}
              </Button>
            </>
          )}
        </div>
      </Card>

      {/* Change Password */}
      <Card className='overflow-hidden rounded-2xl'>
        <div className='bg-slate-50 px-4 sm:px-6 py-3.5 sm:py-4 flex items-center gap-2 border-b'>
          <KeyRound className='h-4 w-4 text-slate-500' />
          <p className='text-xs sm:text-sm font-semibold text-slate-700'>Change Password</p>
        </div>
        <div className='p-4 sm:p-6 space-y-3.5 sm:space-y-4'>
          <div className='space-y-1.5'>
            <label className='text-xs sm:text-sm font-medium text-slate-700'>Current Password</label>
            <div className='relative'>
              <Input
                type={showCurrentPw ? 'text' : 'password'}
                placeholder='Enter current password'
                value={currentPw}
                onChange={(e) => setCurrentPw(e.target.value)}
                className='h-11 text-sm pr-10'
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
                className='h-11 text-sm pr-10'
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
                className='h-11 text-sm pr-10'
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
            className='w-full bg-slate-800 hover:bg-slate-900 h-11 min-h-[44px] text-sm font-semibold'
          >
            Update Password
          </Button>
        </div>
      </Card>
    </div>
  );
}
