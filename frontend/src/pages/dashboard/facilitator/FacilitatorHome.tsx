import { useEffect, useState } from 'react';
import { Users, BookOpen, Building2, Activity, Award } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import apiClient from '@/services/api';

function FacilitatorHomeSkeleton() {
  return (
    <div className='p-1 sm:p-2 space-y-6 sm:space-y-8'>
      <div className='space-y-2'>
        <Skeleton className='h-8 w-48 sm:w-56' />
        <Skeleton className='h-4 w-64 sm:w-80' />
      </div>
      <div className='grid grid-cols-3 gap-2 sm:gap-4 md:gap-6'>
        {[...Array(3)].map((_, i) => (
          <Card key={i} className='border-none shadow-sm'>
            <CardContent className='p-2.5 sm:p-6 flex flex-col justify-between h-auto min-h-[92px] sm:min-h-0 sm:h-36'>
              <div className='sm:hidden flex flex-col items-center justify-center h-full space-y-1.5 py-1'>
                <Skeleton className='h-7 w-7 rounded-lg' />
                <Skeleton className='h-5 w-10' />
                <Skeleton className='h-3 w-14' />
              </div>
              <div className='hidden sm:flex flex-col justify-between h-full'>
                <div className='flex justify-between items-start'>
                  <div className='space-y-2'>
                    <Skeleton className='h-4 w-24' />
                    <Skeleton className='h-8 w-16' />
                  </div>
                  <Skeleton className='h-12 w-12 rounded-xl shrink-0' />
                </div>
                <Skeleton className='h-3 w-32 mt-2' />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
      <div className='grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6'>
        <Card className='lg:col-span-2 border-none shadow-sm p-4 sm:p-6'>
          <div className='flex items-center gap-2 mb-4 sm:mb-6'>
            <Skeleton className='h-5 w-5 rounded' />
            <Skeleton className='h-5 w-48' />
          </div>
          <div className='space-y-3 sm:space-y-4'>
            {[...Array(5)].map((_, i) => (
              <div key={i} className='flex items-center justify-between p-2.5 sm:p-3'>
                <div className='flex gap-3 sm:gap-4 items-center min-w-0 flex-1 mr-2'>
                  <Skeleton className='h-9 w-9 sm:h-10 sm:w-10 rounded-full shrink-0' />
                  <div className='space-y-1.5 min-w-0 flex-1'>
                    <Skeleton className='h-4 w-28 sm:w-32' />
                    <Skeleton className='h-3 w-36 sm:w-44' />
                  </div>
                </div>
                <Skeleton className='h-3 w-16 shrink-0' />
              </div>
            ))}
          </div>
        </Card>
        <Card className='border-none shadow-sm p-4 sm:p-6 bg-slate-900'>
          <div className='flex items-center gap-2 mb-4 sm:mb-6'>
            <Skeleton className='h-5 w-5 rounded bg-slate-700' />
            <Skeleton className='h-5 w-32 bg-slate-700' />
          </div>
          <div className='space-y-2'>
            <Skeleton className='h-3 w-full bg-slate-700' />
            <Skeleton className='h-3 w-4/5 bg-slate-700' />
          </div>
          <div className='mt-6 sm:mt-8 p-3 sm:p-4 rounded-xl bg-white/5 space-y-2'>
            <Skeleton className='h-3 w-16 bg-slate-700' />
            <Skeleton className='h-3 w-full bg-slate-700' />
          </div>
        </Card>
      </div>
    </div>
  );
}

/* =======================
   Types
======================= */

interface FacilitatorStats {
  totalStudents: number;
  totalColleges: number;
  totalSubjects: number;
}

interface RecentActivity {
  full_name: string;
  email: string;
  created_at: string;
}

interface FacilitatorDashboardResponse {
  stats: FacilitatorStats;
  recentActivity: RecentActivity[];
}

/* =======================
   Component
======================= */

export default function FacilitatorHome() {
  const [data, setData] = useState<FacilitatorDashboardResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const result =
          await apiClient.get<FacilitatorDashboardResponse>(
            '/facilitator/stats',
          );
        setData(result.data);
      } catch {
        // data remains null — the null check below shows a fallback UI
      } finally {
        setLoading(false);
      }
    };

    fetchStats();
  }, []);

  if (loading) return <FacilitatorHomeSkeleton />;

  if (!data) {
    return (
      <div className='flex h-96 w-full items-center justify-center text-slate-500'>
        Failed to load dashboard data
      </div>
    );
  }

  const { stats, recentActivity } = data;

  const statsConfig = [
    {
      label: 'My Colleges',
      shortLabel: 'Colleges',
      value: stats.totalColleges,
      trend: 'Assigned Scope',
      icon: Building2,
      color: 'text-blue-600',
      bg: 'bg-blue-50',
    },
    {
      label: 'Total Students',
      shortLabel: 'Students',
      value: stats.totalStudents.toLocaleString(),
      trend: 'Enrolled in your colleges',
      icon: Users,
      color: 'text-purple-600',
      bg: 'bg-purple-50',
    },
    {
      label: 'Active Subjects',
      shortLabel: 'Subjects',
      value: stats.totalSubjects,
      trend: 'Content Scope',
      icon: BookOpen,
      color: 'text-indigo-600',
      bg: 'bg-indigo-50',
    },
  ];

  return (
    <div className='p-1 sm:p-2 space-y-5 sm:space-y-8 animate-in fade-in duration-500 min-w-0'>
      <div className='flex flex-col gap-0.5 sm:gap-2'>
        <h1 className='text-lg sm:text-2xl font-bold text-[#1e2653] tracking-tight'>
          Facilitator Dashboard
        </h1>
        <p className='text-slate-500 text-xs sm:text-sm'>
          Welcome back! Here's what's happening in your colleges.
        </p>
      </div>

      {/* Statistics Grid - 3 cards side-by-side across all screens */}
      <div className='grid grid-cols-3 gap-2 sm:gap-4 md:gap-6'>
        {statsConfig.map((stat) => (
          <Card key={stat.label} className='border-none shadow-sm overflow-hidden'>
            <CardContent className='p-2.5 sm:p-6 flex flex-col justify-between h-auto min-h-[92px] sm:min-h-0 sm:h-36'>
              {/* Mobile View (< sm): Centered Icon -> Value -> Label */}
              <div className='sm:hidden flex flex-col items-center text-center justify-center h-full space-y-1 py-1'>
                <div className={`${stat.bg} p-1.5 rounded-lg shrink-0 mb-0.5`}>
                  <stat.icon className={`w-4 h-4 ${stat.color}`} />
                </div>
                <h3 className='text-lg font-black text-slate-900 leading-none'>
                  {stat.value}
                </h3>
                <p className='text-[11px] font-bold text-slate-500 leading-tight'>
                  {stat.shortLabel}
                </p>
              </div>

              {/* Desktop / Tablet View (>= sm): Full layout with trend */}
              <div className='hidden sm:flex flex-col justify-between h-full'>
                <div className='flex justify-between items-start'>
                  <div>
                    <p className='text-sm font-medium text-slate-500'>
                      {stat.label}
                    </p>
                    <h3 className='text-3xl font-bold text-slate-900 mt-1'>
                      {stat.value}
                    </h3>
                  </div>
                  <div className={`${stat.bg} p-3 rounded-xl shrink-0`}>
                    <stat.icon className={`w-6 h-6 ${stat.color}`} />
                  </div>
                </div>
                <p className='text-xs font-medium text-slate-400 mt-2'>
                  {stat.trend}
                </p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Main Content Area */}
      <div className='grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6'>
        {/* Recent Activity */}
        <Card className='lg:col-span-2 border-none shadow-sm p-4 sm:p-6'>
          <div className='flex items-center gap-2 mb-4 sm:mb-6'>
            <Activity className='w-5 h-5 text-blue-600' />
            <h3 className='text-base sm:text-lg font-bold text-[#1e2653]'>
              Recent Student Registrations
            </h3>
          </div>

          <div className='space-y-3 sm:space-y-4'>
            {recentActivity.length === 0 && (
              <p className='text-xs sm:text-sm text-slate-400 py-4 text-center'>
                No recent activity found.
              </p>
            )}

            {recentActivity.map((user, idx) => (
              <div
                key={idx}
                className='flex items-center justify-between p-2.5 sm:p-3 rounded-xl hover:bg-slate-50 transition-colors border border-slate-50 min-w-0'
              >
                <div className='flex gap-3 sm:gap-4 items-center min-w-0 flex-1 mr-2'>
                  <div className='w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-slate-100 flex items-center justify-center text-slate-600 font-bold shrink-0 text-xs sm:text-sm'>
                    {user.full_name.charAt(0)}
                  </div>
                  <div className='min-w-0 flex-1'>
                    <p className='text-xs sm:text-sm font-bold text-slate-900 truncate' title={user.full_name}>
                      {user.full_name}
                    </p>
                    <p className='text-[10px] sm:text-xs text-slate-500 truncate' title={user.email}>
                      {user.email}
                    </p>
                  </div>
                </div>
                <div className='text-right shrink-0'>
                  <p className='text-[10px] sm:text-xs text-slate-400'>
                    {new Date(user.created_at).toLocaleDateString()}
                  </p>
                  <p className='text-[9px] sm:text-[10px] text-slate-400 uppercase font-bold tracking-wider'>
                    Joined
                  </p>
                </div>
              </div>
            ))}
          </div>
        </Card>

        {/* Quick Links / Info */}
        <Card className='border-none shadow-sm p-4 sm:p-6 bg-slate-900 text-white'>
          <div className='flex items-center gap-2 mb-4 sm:mb-6'>
            <Award className='w-5 h-5 text-yellow-400' />
            <h3 className='text-base sm:text-lg font-bold'>Facilitator Info</h3>
          </div>
          <p className='text-slate-400 text-xs sm:text-sm leading-relaxed'>
            As a facilitator, you have access to student data and progress
            within your assigned colleges.
          </p>
          <div className='mt-6 sm:mt-8 space-y-4'>
            <div className='p-3.5 sm:p-4 rounded-xl bg-white/5 border border-white/10'>
              <p className='text-[10px] sm:text-xs text-slate-400 uppercase font-bold tracking-wider'>
                Pro Tip
              </p>
              <p className='text-xs sm:text-sm mt-1 text-slate-200'>
                Check the "Students" tab to view detailed course progress for
                each user.
              </p>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
