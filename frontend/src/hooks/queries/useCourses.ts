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

export function useEnrollMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (subjectId: number | string) =>
      apiClient.post(`/students/subjects/${subjectId}/enroll`),
    onSuccess: () => {
      // Invalidate both lists so they refetch fresh data
      queryClient.invalidateQueries({ queryKey: ['courses'] });
      queryClient.invalidateQueries({ queryKey: ['student', 'subjects'] });
      notifyCourseProgressUpdated();
    },
  });
}
