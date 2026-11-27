import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import SEO from '@/components/common/SEO';
import AttendanceKpiCards from '@/components/common/attendance/AttendanceKpiCards';
import AttendanceTrendsChart from '@/components/common/attendance/AttendanceTrendsChart';
import AttendanceCalendarWidget from '@/components/common/attendance/AttendanceCalendarWidget';
import TopStudentsCard from '@/components/common/attendance/TopStudentsCard';
import UpcomingEventsCard from '@/components/common/attendance/UpcomingEventsCard';
import {
  getAttendanceOverview,
  getAttendanceTrends,
  getUpcomingClasses,
} from '@/services/attendance';

function AttendanceLoadError({ label, retry }: { label: string; retry: () => void }) {
  return (
    <div className="flex h-full min-h-28 flex-col items-center justify-center gap-3 rounded-2xl border border-slate-200 bg-white p-4 text-center">
      <p role="alert" className="text-sm text-slate-700">Couldn’t load {label}.</p>
      <button type="button" onClick={retry} className="rounded-lg bg-slate-900 px-3 py-1.5 text-sm text-white">
        Retry
      </button>
    </div>
  );
}

export const AttendanceDashboard: React.FC = () => {
  const [timeRange, setTimeRange] = useState<string>('30d');
  const [selectedBatch, setSelectedBatch] = useState<string>('all');
  const [selectedSubject, setSelectedSubject] = useState<string>('all');
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  // 1. Fetch Overview Stats, Top Students, Batches, and Subjects
  const {
    data: overviewData,
    isPending: isOverviewPending,
    isFetching: isOverviewFetching,
    isError: isOverviewError,
    refetch: refetchOverview,
  } = useQuery({
    queryKey: ['attendance-overview'],
    queryFn: getAttendanceOverview,
    staleTime: 60 * 1000,
  });

  // 2. Fetch Attendance Trends (Time-series or single date, with batch and subject filter)
  const {
    data: trendsResponse,
    isPending: isTrendsPending,
    isFetching: isTrendsFetching,
    isError: isTrendsError,
    refetch: refetchTrends,
  } = useQuery({
    queryKey: ['attendance-trends', timeRange, selectedBatch, selectedDate, selectedSubject],
    queryFn: () => getAttendanceTrends(timeRange, selectedBatch, selectedDate, selectedSubject),
    staleTime: 60 * 1000,
  });

  // 3. Fetch Upcoming Classes
  const {
    data: upcomingClasses,
    isPending: isUpcomingPending,
    isFetching: isUpcomingFetching,
    isError: isUpcomingError,
    refetch: refetchUpcoming,
  } = useQuery({
    queryKey: ['attendance-upcoming-classes'],
    queryFn: getUpcomingClasses,
    staleTime: 30 * 1000,
    refetchInterval: 30 * 1000,
  });

  const defaultStats = {
    totalStudents: 0,
    studentsDeltaMonth: 0,
    totalCohorts: 0,
    cohortsDeltaMonth: 0,
    totalColleges: 0,
    collegesDeltaMonth: 0,
    highestAttendingBatch: { name: 'N/A', averageAttendance: 0 },
    lowestAttendingBatch: { name: 'N/A', averageAttendance: 0 },
  };

  const stats = overviewData?.stats || defaultStats;
  const batches = overviewData?.batches || [];
  const subjects = overviewData?.subjects || [];
  const topStudents = overviewData?.topStudents || [];
  const events = upcomingClasses || [];
  const isOverviewLoading = isOverviewPending || (isOverviewFetching && !overviewData);
  const isTrendsLoading = isTrendsPending || (isTrendsFetching && !trendsResponse);
  const isUpcomingLoading = isUpcomingPending || (isUpcomingFetching && !upcomingClasses);

  return (
    <>
      <SEO title="Attendance Dashboard | CodeGuru" />

      <div className="w-full space-y-6 pb-12">
        {/* Main Dashboard Layout: Left Column (KPIs) + Right Column (Charts & Lists) */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
          {/* Left Column: 5 KPI Cards (approx 28% of desktop width) */}
          <div className="lg:col-span-3 xl:col-span-3 w-full h-auto lg:h-full flex flex-col">
            {isOverviewError ? (
              <AttendanceLoadError label="attendance overview and filter options" retry={() => void refetchOverview()} />
            ) : (
              <AttendanceKpiCards stats={stats} isLoading={isOverviewLoading} />
            )}
          </div>

          {/* Right Area (approx 72% of desktop width) */}
          <div className="lg:col-span-9 xl:col-span-9 flex flex-col gap-6">
            {/* Top Row: Attendance Trends Graph + Calendar (aligned horizontally from top) */}
            <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
              {/* Trends Chart (approx 68% of row) */}
              <div className="xl:col-span-8 w-full">
                <AttendanceTrendsChart
                  data={trendsResponse?.data || []}
                  batches={batches}
                  subjects={subjects}
                  timeRange={timeRange}
                  selectedBatch={selectedBatch}
                  selectedSubject={selectedSubject}
                  onTimeRangeChange={setTimeRange}
                  onBatchChange={setSelectedBatch}
                  onSubjectChange={setSelectedSubject}
                  isLoading={isTrendsLoading}
                  selectedDate={selectedDate}
                  onClearDateSelection={() => setSelectedDate(null)}
                  errorAction={isTrendsError ? (
                    <AttendanceLoadError label="attendance trends" retry={() => void refetchTrends()} />
                  ) : undefined}
                />
              </div>

              {/* Monthly Calendar Widget (approx 32% of row, top-aligned with graph) */}
              <div className="xl:col-span-4 w-full flex items-start justify-center xl:justify-start">
                <AttendanceCalendarWidget
                  selectedDate={selectedDate}
                  onSelectDate={(date) => setSelectedDate(date)}
                />
              </div>
            </div>

            {/* Bottom Row: Top Students + Upcoming Events (under chart) + Gap under Calendar */}
            <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-stretch">
              {/* Top Students + Upcoming Events taking xl:col-span-8 under the chart */}
              <div className="xl:col-span-8 grid grid-cols-1 md:grid-cols-2 gap-6 items-stretch">
                <div className="w-full h-full min-h-[360px] flex flex-col">
                  {isOverviewError ? (
                    <AttendanceLoadError label="top students" retry={() => void refetchOverview()} />
                  ) : (
                    <TopStudentsCard students={topStudents} isLoading={isOverviewLoading} />
                  )}
                </div>

                <div className="w-full h-full min-h-[360px] flex flex-col">
                  {isUpcomingError ? (
                    <AttendanceLoadError label="upcoming events" retry={() => void refetchUpcoming()} />
                  ) : (
                    <UpcomingEventsCard events={events} isLoading={isUpcomingLoading} />
                  )}
                </div>
              </div>

              {/* Reserved Empty Gap (xl:col-span-4) under the Calendar widget as per Figma PNG */}
              <div className="hidden xl:block xl:col-span-4" aria-hidden="true" />
            </div>
          </div>
        </div>
      </div>
    </>
  );
};

export default AttendanceDashboard;
