import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { CollegeAssignmentCard } from '@/components/common/student/CollegeAssignmentCard';
import { FileText } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import apiClient from '@/services/api';
import type { CollegeAssignment } from '@/utils/types';

type TabType = 'All' | 'Pending' | 'Completed';

export default function Assignments() {
  const navigate = useNavigate();
  const [assignments, setAssignments] = useState<CollegeAssignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabType>('All');

  const fetchAssignments = () => {
    setLoading(true);
    apiClient
      .get<{ success: boolean; data: CollegeAssignment[] }>('/college-assignments')
      .then((res) => setAssignments(res.data.data))
      .catch(() => {
        // assignments remains empty — empty state is shown below
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchAssignments();
  }, []);

  const isSubmitted = (item: CollegeAssignment) =>
    Boolean(item.submission_link || item.submission_file_url);

  const filteredAssignments = assignments.filter((item) => {
    if (activeTab === 'Pending' && isSubmitted(item)) return false;
    if (activeTab === 'Completed' && !isSubmitted(item)) return false;
    return true;
  });

  const tabs: { id: TabType; label: string; count: number }[] = [
    { id: 'All', label: 'All', count: assignments.length },
    {
      id: 'Pending',
      label: 'Pending',
      count: assignments.filter((a) => !isSubmitted(a)).length,
    },
    {
      id: 'Completed',
      label: 'Completed',
      count: assignments.filter(isSubmitted).length,
    },
  ];

  return (
    <div className='p-4 sm:p-6 md:p-8 max-w-7xl mx-auto space-y-6 sm:space-y-8'>
      <div>
        <h1 className='text-2xl sm:text-3xl font-bold text-[#1e293b]'>Assignments</h1>
        <p className='text-slate-500 mt-1 text-sm sm:text-base'>Track and submit your projects</p>
      </div>

      <div className='flex items-center gap-1 border-b border-slate-200 overflow-x-auto [&::-webkit-scrollbar]:hidden'>
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 px-3.5 sm:px-4 py-2.5 text-xs sm:text-sm font-semibold border-b-2 -mb-px transition-colors shrink-0 min-h-[40px] ${
              activeTab === tab.id
                ? 'border-[#333D7C] text-[#333D7C]'
                : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
            }`}
          >
            {tab.label}
            <span
              className={`text-[10px] sm:text-[11px] font-bold px-1.5 py-0.5 rounded-full ${
                activeTab === tab.id
                  ? 'bg-[#333D7C]/10 text-[#333D7C]'
                  : 'bg-slate-100 text-slate-500'
              }`}
            >
              {tab.count}
            </span>
          </button>
        ))}
      </div>

      {loading ? (
        <div className='grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6 lg:gap-8'>
          {[...Array(6)].map((_, i) => (
            <div
              key={i}
              className='bg-white rounded-2xl sm:rounded-[2rem] border border-slate-100 shadow-sm p-5 sm:p-8 space-y-4 sm:space-y-5'
            >
              <div className='flex items-start justify-between'>
                <Skeleton className='h-10 w-10 sm:h-11 sm:w-11 rounded-2xl' />
                <Skeleton className='h-5 w-20 rounded-full' />
              </div>
              <Skeleton className='h-6 w-3/4' />
              <Skeleton className='h-4 w-full' />
              <Skeleton className='h-4 w-2/3' />
              <Skeleton className='h-11 w-full rounded-xl mt-2' />
            </div>
          ))}
        </div>
      ) : filteredAssignments.length > 0 ? (
        <div className='grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6 lg:gap-8'>
          {filteredAssignments.map((item) => (
            <CollegeAssignmentCard
              key={item.id}
              assignment={item}
              onClick={() => navigate(`/dashboard/student/assignments/${item.id}`)}
            />
          ))}
        </div>
      ) : (
        <div className='flex flex-col items-center justify-center h-60 text-slate-400 gap-3'>
          <FileText className='w-10 h-10 text-slate-300' />
          <p className='text-sm'>
            {activeTab === 'All'
              ? "You don't have any assignments yet."
              : `No ${activeTab.toLowerCase()} assignments.`}
          </p>
        </div>
      )}
    </div>
  );
}
