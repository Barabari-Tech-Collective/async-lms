import { useEffect, useState } from 'react';
import {
  Building2,
  Users,
  BookOpen,
  Lock,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import apiClient from '@/services/api';

/* =======================
   Types
======================= */

interface AdminStats {
  totalStudents: number;
  totalColleges: number;
  totalSubjects: number;
  totalFacilitators: number;
}

interface RecentActivity {
  full_name: string;
  email: string;
  created_at: string;
}

interface AdminDashboardResponse {
  stats: AdminStats;
  recentActivity: RecentActivity[];
}

/* =======================
   Component
======================= */

export default function AdminHome() {
  const [data, setData] = useState<AdminDashboardResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const result =
          await apiClient.get<AdminDashboardResponse>('/admin/stats');
        setData(result.data);
      } catch {
        // data remains null — the null check below shows a fallback UI
      } finally {
        setLoading(false);
      }
    };

    fetchStats();
  }, []);

  if (loading) {
    return (
      <div className='space-y-4 sm:space-y-6 min-w-0'>
        <div className='grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-4'>
          {[...Array(4)].map((_, i) => (
            <Card key={i} className='border border-slate-200/80 shadow-xs rounded-2xl bg-white'>
              <CardContent className='p-3 sm:p-5 flex flex-col justify-between h-24 sm:h-32'>
                <div className='flex justify-between items-start'>
                  <div className='space-y-1.5 sm:space-y-2'>
                    <Skeleton className='h-3 w-16 sm:w-24' />
                    <Skeleton className='h-5 sm:h-7 w-12 sm:w-16' />
                  </div>
                  <Skeleton className='h-7 w-7 sm:h-10 sm:w-10 rounded-xl' />
                </div>
                <Skeleton className='h-2.5 sm:h-3 w-20 sm:w-28 mt-1 sm:mt-2' />
              </CardContent>
            </Card>
          ))}
        </div>
        <Card className='border border-slate-200/80 shadow-xs rounded-2xl p-4 sm:p-6 bg-white'>
          <Skeleton className='h-5 w-36 mb-4 sm:mb-6' />
          <Skeleton className='h-3 w-24 mb-4' />
          <div className='space-y-4 sm:space-y-6'>
            {[...Array(5)].map((_, i) => (
              <div key={i} className='flex gap-3 sm:gap-4'>
                <Skeleton className='h-2 w-2 rounded-full mt-1.5 shrink-0' />
                <div className='space-y-1.5 flex-1 min-w-0'>
                  <Skeleton className='h-4 w-3/4' />
                  <Skeleton className='h-3 w-32' />
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>
    );
  }

  if (!data) {
    return (
      <div className='flex py-20 w-full items-center justify-center text-slate-500 text-sm'>
        Failed to load dashboard data
      </div>
    );
  }

  const { stats, recentActivity } = data;

  const statsConfig = [
    {
      label: 'Total Colleges',
      value: stats.totalColleges,
      trend: 'Registered Institutions',
      icon: Building2,
      color: 'text-blue-600',
      bg: 'bg-blue-50',
    },
    {
      label: 'Active Students',
      value: stats.totalStudents.toLocaleString(),
      trend: 'Enrolled Users',
      icon: Users,
      color: 'text-purple-600',
      bg: 'bg-purple-50',
    },
    {
      label: 'Course Subjects',
      value: stats.totalSubjects,
      trend: 'Total Content',
      icon: BookOpen,
      color: 'text-indigo-600',
      bg: 'bg-indigo-50',
    },
    {
      label: 'Facilitators',
      value: stats.totalFacilitators,
      trend: 'Active Staff',
      icon: Lock,
      color: 'text-orange-600',
      bg: 'bg-orange-50',
    },
  ];

  return (
    <div className='space-y-4 sm:space-y-6 min-w-0 animate-in fade-in duration-300'>
      {/* Statistics Grid: 2x2 on mobile, 4 across on lg */}
      <div className='grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-4'>
        {statsConfig.map((stat) => (
          <Card key={stat.label} className='border border-slate-200/80 shadow-xs rounded-2xl bg-white'>
            <CardContent className='p-3 sm:p-5 flex flex-col justify-between h-24 sm:h-32'>
              <div className='flex justify-between items-start gap-1'>
                <div className='min-w-0 flex-1 pr-1'>
                  <p className='text-[11px] sm:text-xs font-semibold text-slate-500 truncate'>
                    {stat.label}
                  </p>
                  <h3 className='text-lg sm:text-2xl font-bold text-slate-900 mt-0.5 sm:mt-1 tracking-tight truncate'>
                    {stat.value}
                  </h3>
                </div>
                <div className={`${stat.bg} p-1.5 sm:p-2.5 rounded-xl shrink-0`}>
                  <stat.icon className={`w-3.5 h-3.5 sm:w-5 sm:h-5 ${stat.color}`} />
                </div>
              </div>
              <p className='text-[10px] sm:text-xs font-semibold text-emerald-600 truncate mt-1'>
                {stat.trend}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Main Card: Recent Activity */}
      <Card className='border border-slate-200/80 shadow-xs rounded-2xl p-4 sm:p-6 bg-white min-w-0'>
        <div className='mb-4 pb-3 border-b border-slate-100 flex items-center justify-between'>
          <h3 className='text-sm sm:text-base font-bold text-[#1e2653] tracking-tight'>
            Recent Platform Activity
          </h3>
          <span className='text-[11px] sm:text-xs font-semibold text-slate-400'>
            Live Updates
          </span>
        </div>

        <div className='space-y-4 sm:space-y-5'>
          {recentActivity.length === 0 ? (
            <p className='text-xs sm:text-sm text-slate-400 py-4 text-center'>
              No recent activity found.
            </p>
          ) : (
            recentActivity.map((user, idx) => (
              <div key={idx} className='flex items-start gap-3 sm:gap-4 min-w-0'>
                <div className='w-2 h-2 rounded-full bg-blue-600 mt-2 shrink-0' />
                <div className='min-w-0 flex-1'>
                  <p className='text-xs sm:text-sm text-slate-700 leading-snug break-words'>
                    User{' '}
                    <span className='font-bold text-slate-900'>
                      {user.full_name}
                    </span>{' '}
                    joined via <span className='text-slate-500 font-medium'>{user.email}</span>
                  </p>
                  <p className='text-[10px] sm:text-xs text-slate-400 mt-0.5'>
                    {new Date(user.created_at).toLocaleDateString()} at{' '}
                    {new Date(user.created_at).toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </p>
                </div>
              </div>
            ))
          )}
        </div>
      </Card>
    </div>
  );
}
