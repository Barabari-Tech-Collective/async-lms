import { useEffect, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import toast from 'react-hot-toast';
import apiClient from '@/services/api';
import type { College } from '@/utils/types';
import { getErrorMessage } from '@/lib/utils';

interface Props {
  open: boolean;
  onClose: () => void;
  college?: College | null;
  onSuccess: () => void;
}

export default function CollegeFormDialog({
  open,
  onClose,
  college,
  onSuccess,
}: Props) {
  const [form, setForm] = useState({
    name: '',
    city: '',
    state: '',
  });

  const [isVerified, setIsVerified] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (college) {
      setForm({
        name: college.name,
        city: college.city,
        state: college.state,
      });
      setIsVerified(college.is_verified);
    } else {
      setForm({ name: '', city: '', state: '' });
      setIsVerified(false);
    }
  }, [college]);

  const handleSubmit = async () => {
    const trimmedName = form.name.trim();
    if (!trimmedName) {
      toast.error('College name is required');
      return;
    }

    try {
      setLoading(true);
      const payload = {
        name: trimmedName,
        city: form.city.trim(),
        state: form.state.trim(),
      };

      if (college) {
        await apiClient.put(`/colleges/${college.id}`, {
          ...payload,
          is_verified: isVerified,
        });
        toast.success(
          isVerified ? 'College verified & updated' : 'College updated',
        );
      } else {
        await apiClient.post('/colleges', payload);
        toast.success('College created');
      }

      onSuccess();
      onClose();
    } catch (err) {
      // Displays "College already exists" or backend validation message directly
      toast.error(getErrorMessage(err, 'Failed to save college'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{college ? 'Edit College' : 'Add College'}</DialogTitle>
        </DialogHeader>

        <div className='space-y-5'>
          {/* College Name */}
          <div className='space-y-2'>
            <Label htmlFor='college-name'>College Name</Label>
            <Input
              id='college-name'
              placeholder='IIT Delhi'
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </div>

          {/* City */}
          <div className='space-y-2'>
            <Label htmlFor='city'>City</Label>
            <Input
              id='city'
              placeholder='Delhi'
              value={form.city}
              onChange={(e) => setForm({ ...form, city: e.target.value })}
            />
          </div>

          {/* State */}
          <div className='space-y-2'>
            <Label htmlFor='state'>State</Label>
            <Input
              id='state'
              placeholder='Delhi'
              value={form.state}
              onChange={(e) => setForm({ ...form, state: e.target.value })}
            />
          </div>

          {/* Verify Toggle (Edit only) */}
          {college && (
            <div className='flex items-center justify-between rounded-lg border p-3'>
              <div className='space-y-1'>
                <Label>Verification Status</Label>
                <p className='text-xs text-muted-foreground'>
                  {isVerified
                    ? 'This college is verified'
                    : 'This college is not verified'}
                </p>
              </div>
              <Switch checked={isVerified} onCheckedChange={setIsVerified} />
            </div>
          )}

          <Button className='w-full' onClick={handleSubmit} disabled={loading}>
            {college ? 'Update College' : 'Create College'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
