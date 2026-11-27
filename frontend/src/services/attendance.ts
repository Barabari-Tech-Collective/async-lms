import apiClient from './api';

export interface AttendanceStats {
  totalStudents: number;
  studentsDeltaMonth: number;
  totalCohorts: number;
  cohortsDeltaMonth: number;
  totalColleges: number;
  collegesDeltaMonth: number;
  highestAttendingBatch: {
    name: string;
    averageAttendance: number;
  };
  lowestAttendingBatch: {
    name: string;
    averageAttendance: number;
  };
}

export interface TopStudent {
  id: string;
  fullName: string;
  email: string;
  attendancePercent: number;
}

export interface BatchOption {
  id: string;
  name: string;
}

export interface SubjectOption {
  id: string;
  name: string;
}

export interface AttendanceOverviewData {
  stats: AttendanceStats;
  topStudents: TopStudent[];
  batches: BatchOption[];
  subjects: SubjectOption[];
}

export interface AttendanceTrendPoint {
  date: string;
  day: string;
  onlineAttendancePercent: number;
  totalClasses: number;
}

export interface UpcomingClass {
  id: string;
  title: string;
  scheduledStartAt: string;
  plannedEndAt: string;
  actualEndAt?: string;
  status: string;
  hasMeetSpace: boolean;
  canJoin: boolean;
  rosterCount: number;
  subjectTitle?: string;
}

export const getAttendanceOverview = async (): Promise<AttendanceOverviewData> => {
  const response = await apiClient.get<{ success: boolean; data: AttendanceOverviewData }>(
    '/classes/dashboard/overview',
  );
  return response.data.data;
};

export interface AttendanceTrendsResponse {
  data: AttendanceTrendPoint[];
  mode?: string;
  selectedDate?: string;
}

export const getAttendanceTrends = async (
  timeRange = '30d',
  batchId = 'all',
  date?: string | null,
  subjectId = 'all',
): Promise<AttendanceTrendsResponse> => {
  const response = await apiClient.get<{
    success: boolean;
    data: AttendanceTrendPoint[];
    mode?: string;
    selectedDate?: string;
  }>('/classes/dashboard/trends', {
    params: {
      timeRange,
      batchId,
      ...(date ? { date } : {}),
      ...(subjectId && subjectId !== 'all' ? { subjectId } : {}),
    },
  });
  return {
    data: response.data.data,
    mode: response.data.mode,
    selectedDate: response.data.selectedDate,
  };
};

export const getUpcomingClasses = async (): Promise<UpcomingClass[]> => {
  const response = await apiClient.get<{ success: boolean; data: UpcomingClass[] }>(
    '/classes',
    {
      params: { status: 'upcoming', limit: 5 },
    },
  );
  return response.data.data;
};

export const getFacilitatorAccess = async (classId: string): Promise<string> => {
  const response = await apiClient.get<{ success: boolean; data: { url: string } }>(
    `/classes/${classId}/facilitator-access`,
  );
  return response.data.data.url;
};
