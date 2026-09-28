import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import apiClient from '@/services/api';
import { useAppSelector } from '@/app/hooks';
import { selectUser } from '@/features/auth/authSelectors';
import type {
  Assignment,
  Subject,
  StudentAssignmentsOverviewResponse,
} from '@/utils/types';

export function useMySubjects() {
  const queryClient = useQueryClient();
  const user = useAppSelector(selectUser);

  useEffect(() => {
    const handleUpdate = () => {
      queryClient.invalidateQueries({ queryKey: ['student', 'subjects'] });
      queryClient.invalidateQueries({ queryKey: ['courses'] });
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
    queryKey: ['student', 'subjects', user?.id],
    queryFn: () =>
      apiClient.get('/users/subjects').then((r) => r.data.data ?? []),
    staleTime: 10 * 1000,
    refetchOnWindowFocus: true,
    enabled: !!user?.id,
  });
}

export function useMyAssignments() {
  const user = useAppSelector(selectUser);
  return useQuery<Assignment[]>({
    queryKey: ['student', 'assignments', user?.id],
    queryFn: () =>
      apiClient.get('/students/assignments').then((r) => r.data.data ?? []),
    enabled: !!user?.id,
  });
}

export function useMyOverallRank() {
  const user = useAppSelector(selectUser);
  return useQuery<number | null>({
    queryKey: ['leaderboard', 'overall', 'myRank', user?.id],
    queryFn: () =>
      apiClient
        .get('/students/leaderboard/overall')
        .then((r) => r.data.data?.my_rank?.rank ?? null),
    staleTime: 10 * 60 * 1000,
    enabled: !!user?.id,
  });
}

export function useStudentAssignmentsOverview() {
  const user = useAppSelector(selectUser);
  return useQuery<StudentAssignmentsOverviewResponse>({
    queryKey: ['student', 'assignments', 'overview', user?.id],
    queryFn: () =>
      apiClient
        .get('/students/assignments/overview')
        .then((r) => r.data ?? { success: true, data: [], counts: { total: 0, pending: 0, pending_evaluation: 0, evaluated: 0 } }),
    enabled: !!user?.id,
  });
}

