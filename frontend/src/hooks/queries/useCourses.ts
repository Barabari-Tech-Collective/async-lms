import { useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import apiClient from '@/services/api';
import type { Subject } from '@/utils/types';
import { notifyCourseProgressUpdated } from '@/utils/progressEvents';

export function useEnrolledCourses() {
  const queryClient = useQueryClient();

  useEffect(() => {
    const handleUpdate = () => {
      queryClient.invalidateQueries({ queryKey: ['courses'] });
      queryClient.invalidateQueries({ queryKey: ['student', 'subjects'] });
    };
    window.addEventListener('course-progress-updated', handleUpdate);
    const handleStorage = (e: StorageEvent) => {
      if (e.key === 'codeguru-progress-updated') {
        handleUpdate();
      }
    };
    window.addEventListener('storage', handleStorage);
    return () => {
      window.removeEventListener('course-progress-updated', handleUpdate);
      window.removeEventListener('storage', handleStorage);
    };
  }, [queryClient]);

  return useQuery<Subject[]>({
    queryKey: ['student', 'subjects'],
    queryFn: () =>
      apiClient.get('/users/subjects').then((r) => r.data.data ?? []),
    staleTime: 10 * 1000,
    refetchOnWindowFocus: true,
  });
}

export function useAllCourses() {
  return useQuery<Subject[]>({
    queryKey: ['courses', 'all'],
    queryFn: () =>
      apiClient.get('/subjects/published').then((r) => r.data.data ?? []),
    staleTime: 15 * 60 * 1000,
  });
}

export interface EnrollmentRequest {
  id: string;
  subject_id: string;
  status: 'pending' | 'approved' | 'rejected';
  rejection_reason: string | null;
  created_at: string;
  reviewed_at: string | null;
  subject_name: string;
  subject_slug: string;
  thumbnail_url?: string;
}

export function useStudentEnrollmentRequests() {
  return useQuery<EnrollmentRequest[]>({
    queryKey: ['student', 'enrollment-requests'],
    queryFn: () =>
      apiClient.get('/students/enrollment-requests').then((r) => r.data.data ?? []),
    staleTime: 10 * 1000,
  });
}

export function useRequestEnrollmentMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (subjectId: number | string) =>
      apiClient.post('/students/enrollment-requests', { subject_id: subjectId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['courses'] });
      queryClient.invalidateQueries({ queryKey: ['student', 'subjects'] });
      queryClient.invalidateQueries({ queryKey: ['student', 'enrollment-requests'] });
      notifyCourseProgressUpdated();
    },
  });
}

export function useEnrollMutation() {
  return useRequestEnrollmentMutation();
}
