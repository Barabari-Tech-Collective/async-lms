import React from 'react';
import { Users, Layers, School, Award, TrendingDown, type LucideIcon } from 'lucide-react';
import type { AttendanceStats } from '@/services/attendance';

interface AttendanceKpiCardsProps {
  stats: AttendanceStats;
  isLoading?: boolean;
}

interface KpiCardConfig {
  bgColor: string;
  icon: LucideIcon;
  label: string;
  value: React.ReactNode;
  badge: React.ReactNode;
}

function KpiCard({ bgColor, icon: Icon, label, value, badge }: KpiCardConfig) {
  return (
    <div
      className='rounded-2xl p-3 flex flex-col justify-between flex-1 min-h-[140px] transition-all hover:shadow-xs'
      style={{ backgroundColor: bgColor }}
    >
      <div className='flex flex-col gap-3'>
        <div className='flex items-center gap-3.5'>
          <div className='w-7 h-7 rounded bg-[#1D275E] text-white flex items-center justify-center shrink-0'>
            <Icon className='w-3.5 h-3.5 text-white' />
          </div>
          <span className='font-semibold text-base text-black'>{label}</span>
        </div>
        <div>
          <span className='text-2xl font-bold text-black tracking-tight'>{value}</span>
        </div>
      </div>
      <div className='flex items-center'>
        <div className='inline-flex items-center justify-center bg-[#090E2B] text-white px-6 py-2.5 rounded-[10px] text-xs font-medium'>
          {badge}
        </div>
      </div>
    </div>
  );
}

export const AttendanceKpiCards: React.FC<AttendanceKpiCardsProps> = ({ stats, isLoading }) => {
  if (isLoading) {
    return (
      <div className='bg-white rounded-3xl p-3 shadow-xs border border-slate-100 flex flex-col justify-between gap-3 w-full h-auto lg:h-full'>
        {[1, 2, 3, 4, 5].map((i) => (
          <div
            key={i}
            className='flex-1 min-h-[140px] rounded-2xl bg-slate-100 animate-pulse'
          />
        ))}
      </div>
    );
  }

  const cards: KpiCardConfig[] = [
    {
      bgColor: '#CDD0FF',
      icon: Users,
      label: 'Total Students',
      value: stats.totalStudents,
      badge: `+${stats.studentsDeltaMonth} last month`,
    },
    {
      bgColor: '#FFEFD4',
      icon: Layers,
      label: 'Total Cohorts',
      value: stats.totalCohorts,
      badge: `+${stats.cohortsDeltaMonth} last month`,
    },
    {
      bgColor: '#C8FEC3',
      icon: School,
      label: 'Total Colleges',
      value: stats.totalColleges,
      badge: `+${stats.collegesDeltaMonth} last month`,
    },
    {
      bgColor: '#F5CFCC',
      icon: Award,
      label: 'Highest Attending Batch',
      // Optional chaining guards against null/undefined from the API
      value: (
        <span className='text-xl font-light text-black truncate block'>
          {stats.highestAttendingBatch?.name || 'N/A'}
        </span>
      ),
      badge: `Avg - ${stats.highestAttendingBatch?.averageAttendance ?? 0}%`,
    },
    {
      bgColor: '#DDDFF6',
      icon: TrendingDown,
      label: 'Lowest Attending Batch',
      value: (
        <span className='text-xl font-light text-black truncate block'>
          {stats.lowestAttendingBatch?.name || 'N/A'}
        </span>
      ),
      badge: `Avg - ${stats.lowestAttendingBatch?.averageAttendance ?? 0}%`,
    },
  ];

  return (
    <div className='bg-white rounded-3xl p-3 shadow-xs border border-slate-100/80 flex flex-col justify-between gap-3 w-full h-auto lg:h-full select-none'>
      {cards.map((card) => (
        <KpiCard key={card.label} {...card} />
      ))}
    </div>
  );
};

export default AttendanceKpiCards;

