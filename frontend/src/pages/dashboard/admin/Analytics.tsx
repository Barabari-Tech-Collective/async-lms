import { useEffect, useState } from 'react';
import {
  BookOpen, TrendingUp, Users,
  Loader2, CheckSquare, BarChart2, User,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import apiClient from '@/services/api';
import {
  QuizTab, AssignmentsTab, ProjectsTab, BatchTab, StudentsTab,
  type College, type Batch, type Subject,
} from '@/pages/dashboard/shared/EngagementAnalyticsTabs';

// ─── General Analytics types ──────────────────────────────────────────────────

interface AnalyticsData {
  quizStats: { totalAttempts: number; avgScore: number; passedCount: number; passRate: number };
  exerciseStats: { totalSubmissions: number; passedCount: number; passRate: number };
  contentInventory: { topics: number; units: number; subtopics: number; lessons: number; quizzes: number; exercises: number };
  studentsPerCollege: { college: string; count: number }[];
  dailyRegistrations: { label: string; count: number }[];
  subjectActivity: { subject: string; attempts: number; avgScore: number; uniqueStudents: number }[];
}

// ─── Primitives ───────────────────────────────────────────────────────────────

function Bar({ pct, color }: { pct: number; color: string }) {
  return (
    <div className='h-2 w-full rounded-full bg-slate-100 overflow-hidden'>
      <div className={`h-full rounded-full transition-all duration-500 ${color}`} style={{ width: `${Math.min(pct, 100)}%` }} />
    </div>
  );
}


// ─── Student Registrations Chart Component ─────────────────────────────────────

function StudentRegistrationsChart() {
  const [rangeType, setRangeType] = useState<string>('7');
  const [fromDate, setFromDate] = useState<string>('');
  const [toDate, setToDate] = useState<string>('');
  const [registrations, setRegistrations] = useState<{ label: string; count: number }[]>([]);
  const [meta, setMeta] = useState<{ from: string; to: string } | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const fillTimeline = (
    data: { label: string; count: number }[],
    metaInfo: { from: string; to: string; groupBy: 'day' | 'month' }
  ) => {
    if (!metaInfo) return data;
    const start = new Date(metaInfo.from + 'T00:00:00Z');
    const end = new Date(metaInfo.to + 'T23:59:59Z');
    const result: { label: string; count: number }[] = [];
    const map = new Map(data.map((r) => [r.label, r.count]));

    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    let current = new Date(start);
    let iterations = 0;

    while (current <= end && iterations < 366) {
      iterations++;
      const monthLabel = months[current.getUTCMonth()];
      let label = '';
      if (metaInfo.groupBy === 'month') {
        label = `${monthLabel} ${current.getUTCFullYear()}`;
      } else {
        const dayLabel = String(current.getUTCDate()).padStart(2, '0');
        label = `${monthLabel} ${dayLabel}`;
      }

      result.push({
        label,
        count: map.get(label) || 0,
      });

      if (metaInfo.groupBy === 'month') {
        current.setUTCMonth(current.getUTCMonth() + 1);
      } else {
        current.setUTCDate(current.getUTCDate() + 1);
      }
    }
    return result;
  };

  const fetchRegistrations = (params: { days?: string; from?: string; to?: string }) => {
    setLoading(true);
    setError(null);
    apiClient.get<{ success: boolean; data: { registrations: { label: string; count: number }[]; meta: { from: string; to: string; groupBy: 'day' | 'month' } } }>('/admin/analytics/registrations', { params })
      .then((res) => {
        const raw = res.data.data.registrations;
        const metaInfo = res.data.data.meta;
        const filled = fillTimeline(raw, metaInfo);
        setRegistrations(filled);
        setMeta(metaInfo);
      })
      .catch((err) => {
        setError(err?.response?.data?.message || 'Failed to load registrations');
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    if (rangeType !== 'custom') {
      fetchRegistrations({ days: rangeType });
    } else if (fromDate && toDate) {
      fetchRegistrations({ from: fromDate, to: toDate });
    }
  }, [rangeType, fromDate, toDate]);

  // Set default dates when clicking custom
  const handleCustomClick = () => {
    setRangeType('custom');
    if (!fromDate || !toDate) {
      const today = new Date().toISOString().split('T')[0];
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      const thirtyAgoStr = thirtyDaysAgo.toISOString().split('T')[0];
      setFromDate(thirtyAgoStr);
      setToDate(today);
    }
  };

  const maxDayCount = Math.max(...registrations.map((d) => d.count), 1);

  const formatDateLabel = (dateStr?: string) => {
    if (!dateStr) return '';
    const parts = dateStr.split('-');
    const date = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  return (
    <Card className='border border-slate-200/80 shadow-xs rounded-2xl flex flex-col justify-between min-h-[280px] bg-white min-w-0'>
      <CardHeader className='pb-2 pt-4 sm:pt-5 px-4 sm:px-5'>
        <div className='flex flex-col sm:flex-row sm:items-center justify-between gap-2.5'>
          <CardTitle className='text-xs sm:text-sm font-bold text-slate-800 flex items-center gap-2 tracking-tight'>
            <TrendingUp className='w-4 h-4 text-violet-600' />
            <span>New Students {meta ? `— ${formatDateLabel(meta.from)} to ${formatDateLabel(meta.to)}` : ''}</span>
          </CardTitle>
          
          <div className='flex overflow-x-auto no-scrollbar gap-1 bg-slate-100 p-0.5 rounded-xl text-xs w-full sm:w-fit'>
            {[
              { label: '7D', value: '7' },
              { label: '15D', value: '15' },
              { label: '1M', value: '30' },
              { label: '3M', value: '90' },
              { label: '1Y', value: '365' },
            ].map((p) => (
              <button
                key={p.value}
                onClick={() => setRangeType(p.value)}
                className={`px-2.5 py-1 rounded-lg transition-all font-medium text-xs shrink-0 ${
                  rangeType === p.value ? 'bg-white text-slate-900 shadow-xs font-bold' : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                {p.label}
              </button>
            ))}
            <button
              onClick={handleCustomClick}
              className={`px-2.5 py-1 rounded-lg transition-all font-medium text-xs shrink-0 ${
                rangeType === 'custom' ? 'bg-white text-slate-900 shadow-xs font-bold' : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              Custom
            </button>
          </div>
        </div>
        
        {rangeType === 'custom' && (
          <div className='flex flex-wrap items-center gap-2 mt-3 animate-in slide-in-from-top duration-200'>
            <div className='flex flex-col gap-0.5'>
              <span className='text-[10px] text-slate-400 font-semibold uppercase'>From</span>
              <input
                type='date'
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
                className='text-xs px-2.5 py-1 border border-slate-200 rounded-lg bg-white text-slate-700 focus:outline-none focus:ring-1 focus:ring-violet-500 shadow-xs'
              />
            </div>
            <div className='flex flex-col gap-0.5'>
              <span className='text-[10px] text-slate-400 font-semibold uppercase'>To</span>
              <input
                type='date'
                value={toDate}
                onChange={(e) => setToDate(e.target.value)}
                className='text-xs px-2.5 py-1 border border-slate-200 rounded-lg bg-white text-slate-700 focus:outline-none focus:ring-1 focus:ring-violet-500 shadow-xs'
              />
            </div>
          </div>
        )}
      </CardHeader>
      
      <CardContent className='px-4 sm:px-5 pb-4 sm:pb-5 flex-1 flex flex-col justify-end min-h-[140px] min-w-0'>
        {loading ? (
          <div className='flex h-32 items-center justify-center'>
            <Loader2 className='w-6 h-6 animate-spin text-violet-500' />
          </div>
        ) : error ? (
          <p className='text-xs text-red-500 text-center py-8'>{error}</p>
        ) : registrations.length === 0 ? (
          <p className='text-xs text-slate-400 text-center py-8'>No registrations in this period.</p>
        ) : (
          <div className='flex items-end gap-2 h-32 pt-4 overflow-x-auto pb-1 custom-scrollbar w-full min-w-0'>
            {registrations.map((d) => (
              <div key={d.label} className='flex flex-col items-center gap-1 flex-1 min-w-[24px] max-w-[60px]'>
                <span className='text-[9px] font-bold text-slate-700'>{d.count}</span>
                <div 
                  className='w-full rounded-t bg-violet-400 hover:bg-violet-500 transition-all duration-300' 
                  style={{ height: `${Math.max((d.count / maxDayCount) * 88, 4)}px` }}
                  title={`${d.count} students registered on ${d.label}`}
                />
                <span className='text-[9px] text-slate-400 truncate w-full text-center' title={d.label}>
                  {d.label}
                </span>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Active Students Chart Component ─────────────────────────────────────

function ActiveStudentsChart() {
  const [rangeType, setRangeType] = useState<string>('7');
  const [fromDate, setFromDate] = useState<string>('');
  const [toDate, setToDate] = useState<string>('');
  const [activeUsers, setActiveUsers] = useState<{ label: string; count: number }[]>([]);
  const [meta, setMeta] = useState<{ from: string; to: string } | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const fillTimeline = (
    data: { label: string; count: number }[],
    metaInfo: { from: string; to: string; groupBy: 'day' | 'month' }
  ) => {
    if (!metaInfo) return data;
    const start = new Date(metaInfo.from + 'T00:00:00Z');
    const end = new Date(metaInfo.to + 'T23:59:59Z');
    const result: { label: string; count: number }[] = [];
    const map = new Map(data.map((r) => [r.label, r.count]));

    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    let current = new Date(start);
    let iterations = 0;

    while (current <= end && iterations < 366) {
      iterations++;
      const monthLabel = months[current.getUTCMonth()];
      let label = '';
      if (metaInfo.groupBy === 'month') {
        label = `${monthLabel} ${current.getUTCFullYear()}`;
      } else {
        const dayLabel = String(current.getUTCDate()).padStart(2, '0');
        label = `${monthLabel} ${dayLabel}`;
      }

      result.push({
        label,
        count: map.get(label) || 0,
      });

      if (metaInfo.groupBy === 'month') {
        current.setUTCMonth(current.getUTCMonth() + 1);
      } else {
        current.setUTCDate(current.getUTCDate() + 1);
      }
    }
    return result;
  };

  const fetchActiveUsers = (params: { days?: string; from?: string; to?: string }) => {
    setLoading(true);
    setError(null);
    apiClient.get<{ success: boolean; data: { activeUsers: { label: string; count: number }[]; meta: { from: string; to: string; groupBy: 'day' | 'month' } } }>('/admin/analytics/active-users', { params })
      .then((res) => {
        const raw = res.data.data.activeUsers;
        const metaInfo = res.data.data.meta;
        const filled = fillTimeline(raw, metaInfo);
        setActiveUsers(filled);
        setMeta(metaInfo);
      })
      .catch((err) => {
        setError(err?.response?.data?.message || 'Failed to load active student data');
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    if (rangeType !== 'custom') {
      fetchActiveUsers({ days: rangeType });
    } else if (fromDate && toDate) {
      fetchActiveUsers({ from: fromDate, to: toDate });
    }
  }, [rangeType, fromDate, toDate]);

  // Set default dates when clicking custom
  const handleCustomClick = () => {
    setRangeType('custom');
    if (!fromDate || !toDate) {
      const today = new Date().toISOString().split('T')[0];
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      const thirtyAgoStr = thirtyDaysAgo.toISOString().split('T')[0];
      setFromDate(thirtyAgoStr);
      setToDate(today);
    }
  };

  const maxActiveCount = Math.max(...activeUsers.map((d) => d.count), 1);

  const formatDateLabel = (dateStr?: string) => {
    if (!dateStr) return '';
    const parts = dateStr.split('-');
    const date = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  return (
    <Card className='border border-slate-200/80 shadow-xs rounded-2xl flex flex-col justify-between min-h-[280px] bg-white min-w-0'>
      <CardHeader className='pb-2 pt-4 sm:pt-5 px-4 sm:px-5'>
        <div className='flex flex-col sm:flex-row sm:items-center justify-between gap-2.5'>
          <CardTitle className='text-xs sm:text-sm font-bold text-slate-800 flex items-center gap-2 tracking-tight'>
            <Users className='w-4 h-4 text-rose-500' />
            <span>Active Students {meta ? `— ${formatDateLabel(meta.from)} to ${formatDateLabel(meta.to)}` : ''}</span>
          </CardTitle>
          
          <div className='flex overflow-x-auto no-scrollbar gap-1 bg-slate-100 p-0.5 rounded-xl text-xs w-full sm:w-fit'>
            {[
              { label: '7D', value: '7' },
              { label: '15D', value: '15' },
              { label: '1M', value: '30' },
              { label: '3M', value: '90' },
              { label: '1Y', value: '365' },
            ].map((p) => (
              <button
                key={p.value}
                onClick={() => setRangeType(p.value)}
                className={`px-2.5 py-1 rounded-lg transition-all font-medium text-xs shrink-0 ${
                  rangeType === p.value ? 'bg-white text-slate-900 shadow-xs font-bold' : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                {p.label}
              </button>
            ))}
            <button
              onClick={handleCustomClick}
              className={`px-2.5 py-1 rounded-lg transition-all font-medium text-xs shrink-0 ${
                rangeType === 'custom' ? 'bg-white text-slate-900 shadow-xs font-bold' : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              Custom
            </button>
          </div>
        </div>
        
        {rangeType === 'custom' && (
          <div className='flex flex-wrap items-center gap-2 mt-3 animate-in slide-in-from-top duration-200'>
            <div className='flex flex-col gap-0.5'>
              <span className='text-[10px] text-slate-400 font-semibold uppercase'>From</span>
              <input
                type='date'
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
                className='text-xs px-2.5 py-1 border border-slate-200 rounded-lg bg-white text-slate-700 focus:outline-none focus:ring-1 focus:ring-rose-500 shadow-xs'
              />
            </div>
            <div className='flex flex-col gap-0.5'>
              <span className='text-[10px] text-slate-400 font-semibold uppercase'>To</span>
              <input
                type='date'
                value={toDate}
                onChange={(e) => setToDate(e.target.value)}
                className='text-xs px-2.5 py-1 border border-slate-200 rounded-lg bg-white text-slate-700 focus:outline-none focus:ring-1 focus:ring-rose-500 shadow-xs'
              />
            </div>
          </div>
        )}
      </CardHeader>
      
      <CardContent className='px-4 sm:px-5 pb-4 sm:pb-5 flex-1 flex flex-col justify-end min-h-[140px] min-w-0'>
        {loading ? (
          <div className='flex h-32 items-center justify-center'>
            <Loader2 className='w-6 h-6 animate-spin text-rose-500' />
          </div>
        ) : error ? (
          <p className='text-xs text-red-500 text-center py-8'>{error}</p>
        ) : activeUsers.length === 0 ? (
          <p className='text-xs text-slate-400 text-center py-8'>No active student activity in this period.</p>
        ) : (
          <div className='flex items-end gap-2 h-32 pt-4 overflow-x-auto pb-1 custom-scrollbar w-full min-w-0'>
            {activeUsers.map((d) => (
              <div key={d.label} className='flex flex-col items-center gap-1 flex-1 min-w-[24px] max-w-[60px]'>
                <span className='text-[9px] font-bold text-slate-700'>{d.count}</span>
                <div 
                  className='w-full rounded-t bg-rose-400 hover:bg-rose-500 transition-all duration-300' 
                  style={{ height: `${Math.max((d.count / maxActiveCount) * 88, 4)}px` }}
                  title={`${d.count} active students on ${d.label}`}
                />
                <span className='text-[9px] text-slate-400 truncate w-full text-center' title={d.label}>
                  {d.label}
                </span>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── General Analytics tab ────────────────────────────────────────────────────

function GeneralAnalytics() {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiClient.get<{ success: boolean; data: AnalyticsData }>('/admin/analytics')
      .then((res) => setData(res.data.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <div className='flex h-64 items-center justify-center bg-white rounded-2xl border border-slate-200/80'><Loader2 className='w-8 h-8 animate-spin text-indigo-600' /></div>;
  }

  if (!data) {
    return <div className='flex h-64 items-center justify-center text-slate-400 text-xs sm:text-sm bg-white rounded-2xl border border-slate-200/80'>Failed to load analytics.</div>;
  }

  const { studentsPerCollege, subjectActivity } = data;
  const maxCollegeCount = Math.max(...studentsPerCollege.map((c) => c.count), 1);
  const maxAttempts = Math.max(...subjectActivity.map((s) => s.attempts), 1);

  return (
    <div className='space-y-4 sm:space-y-6 min-w-0'>
      <div className='grid grid-cols-1 md:grid-cols-2 gap-4'>
        <Card className='border border-slate-200/80 shadow-xs rounded-2xl bg-white min-w-0'>
          <CardHeader className='pb-2 pt-4 sm:pt-5 px-4 sm:px-5'>
            <CardTitle className='text-xs sm:text-sm font-bold text-slate-800 flex items-center gap-2 tracking-tight'>
              <Users className='w-4 h-4 text-indigo-500' /> Students per College
            </CardTitle>
          </CardHeader>
          <CardContent className='px-4 sm:px-5 pb-4 sm:pb-5 space-y-3'>
            {studentsPerCollege.length === 0 ? (
              <p className='text-xs text-slate-400'>No data yet.</p>
            ) : (
              studentsPerCollege.map((c) => (
                <div key={c.college} className='space-y-1'>
                  <div className='flex justify-between text-xs text-slate-600'>
                    <span className='truncate max-w-[70%] font-medium'>{c.college}</span>
                    <span className='font-bold text-slate-800'>{c.count}</span>
                  </div>
                  <Bar pct={(c.count / maxCollegeCount) * 100} color='bg-indigo-400' />
                </div>
              ))
            )}
          </CardContent>
        </Card>
        
        <StudentRegistrationsChart />
      </div>

      <ActiveStudentsChart />

      <Card className='border border-slate-200/80 shadow-xs rounded-2xl bg-white min-w-0'>
        <CardHeader className='pb-2 pt-4 sm:pt-5 px-4 sm:px-5'>
          <CardTitle className='text-xs sm:text-sm font-bold text-slate-800 tracking-tight'>Subject Activity</CardTitle>
        </CardHeader>
        <CardContent className='px-4 sm:px-5 pb-4 sm:pb-5'>
          {subjectActivity.length === 0 ? (
            <p className='text-xs text-slate-400'>No quiz activity recorded yet.</p>
          ) : (
            <div className='space-y-4'>
              {subjectActivity.map((s) => (
                <div key={s.subject} className='space-y-1.5'>
                  <div className='flex flex-col sm:flex-row sm:items-center justify-between gap-1 text-xs'>
                    <span className='font-semibold text-slate-800 truncate max-w-full sm:max-w-[45%]'>{s.subject}</span>
                    <div className='flex items-center gap-3 text-slate-500 text-[11px] shrink-0'>
                      <span>{s.attempts} attempts</span>
                      <span>{s.uniqueStudents} students</span>
                      <span className='font-bold text-slate-800'>avg {s.avgScore || '—'}</span>
                    </div>
                  </div>
                  <Bar pct={(s.attempts / maxAttempts) * 100} color='bg-amber-400' />
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Tab config ───────────────────────────────────────────────────────────────

type TabId = 'general' | 'quiz' | 'assignments' | 'projects' | 'batch' | 'students';

const TABS: { id: TabId; label: string; icon: React.ReactNode }[] = [
  { id: 'general', label: 'General Analytics', icon: <TrendingUp className='w-4 h-4' /> },
  { id: 'quiz', label: 'Quiz Analytics', icon: <BookOpen className='w-4 h-4' /> },
  { id: 'assignments', label: 'Assignment Tracker', icon: <CheckSquare className='w-4 h-4' /> },
  { id: 'projects', label: 'Project Tracker', icon: <BarChart2 className='w-4 h-4' /> },
  { id: 'batch', label: 'Batch Dashboard', icon: <Users className='w-4 h-4' /> },
  { id: 'students', label: 'Student Dashboard', icon: <User className='w-4 h-4' /> },
];

// ─── Main component ───────────────────────────────────────────────────────────

export default function Analytics() {
  const [activeTab, setActiveTab] = useState<TabId>('general');
  const [colleges, setColleges] = useState<College[]>([]);
  const [batches, setBatches] = useState<Batch[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);

  useEffect(() => {
    Promise.all([
      apiClient.get('/facilitator/colleges'),
      apiClient.get('/facilitator/batches'),
      apiClient.get('/facilitator/analytics/subjects'),
    ]).then(([c, b, s]) => {
      setColleges(c.data?.data ?? []);
      setBatches(b.data?.data ?? []);
      setSubjects(s.data?.data ?? []);
    }).catch(() => {});
  }, []);

  return (
    <div className='space-y-4 sm:space-y-6 min-w-0 animate-in fade-in duration-300'>
      <div>
        <h2 className='text-lg sm:text-xl font-bold text-slate-900 tracking-tight'>Analytics</h2>
        <p className='text-xs sm:text-sm text-slate-500 mt-0.5'>Platform-wide activity and engagement overview</p>
      </div>

      <div className='grid grid-cols-2 sm:grid-cols-3 lg:flex lg:flex-wrap gap-1.5 bg-slate-100 p-1.5 rounded-2xl w-full'>
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center justify-center gap-1.5 sm:gap-2 px-2.5 sm:px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold transition-all min-h-[38px] ${
              activeTab === tab.id
                ? 'bg-white text-slate-900 shadow-xs font-bold'
                : 'text-slate-500 hover:text-slate-800 hover:bg-slate-200/50'
            }`}
          >
            {tab.icon}
            <span className='truncate'>{tab.label}</span>
          </button>
        ))}
      </div>

      <div className='min-w-0'>
        {activeTab === 'general' && <GeneralAnalytics />}
        {activeTab === 'quiz' && <QuizTab colleges={colleges} batches={batches} subjects={subjects} />}
        {activeTab === 'assignments' && <AssignmentsTab colleges={colleges} batches={batches} subjects={subjects} />}
        {activeTab === 'projects' && <ProjectsTab colleges={colleges} batches={batches} subjects={subjects} />}
        {activeTab === 'batch' && <BatchTab colleges={colleges} batches={batches} subjects={subjects} />}
        {activeTab === 'students' && <StudentsTab colleges={colleges} batches={batches} subjects={subjects} />}
      </div>
    </div>
  );
}
