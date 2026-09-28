import { useEffect, useState } from 'react';
import { BookOpen, Users, CheckSquare, BarChart2, User } from 'lucide-react';
import apiClient from '@/services/api';
import {
  QuizTab, AssignmentsTab, ProjectsTab, BatchTab, StudentsTab,
  type College, type Batch, type Subject,
} from '@/pages/dashboard/shared/EngagementAnalyticsTabs';

type TabId = 'quiz' | 'assignments' | 'projects' | 'batch' | 'students';

const TABS: { id: TabId; label: string; icon: React.ReactNode }[] = [
  { id: 'quiz', label: 'Quiz Analytics', icon: <BookOpen className="w-4 h-4" /> },
  { id: 'assignments', label: 'Assignment Tracker', icon: <CheckSquare className="w-4 h-4" /> },
  { id: 'projects', label: 'Project Tracker', icon: <BarChart2 className="w-4 h-4" /> },
  { id: 'batch', label: 'Batch Dashboard', icon: <Users className="w-4 h-4" /> },
  { id: 'students', label: 'Student Dashboard', icon: <User className="w-4 h-4" /> },
];

const FacilitatorAnalytics = () => {
  const [activeTab, setActiveTab] = useState<TabId>('quiz');
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
    <div className="flex flex-col gap-4 sm:gap-6 min-w-0">
      <div>
        <p className="text-[10px] sm:text-[11px] text-slate-400 mb-0.5 sm:mb-1">Dashboard / Analytics</p>
        <h1 className="text-xl sm:text-2xl font-bold text-slate-800 tracking-tight">Analytics Dashboard</h1>
        <p className="text-xs sm:text-sm text-slate-500 mt-0.5">Quiz, Assignment, Project, and Student Performance Insights</p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:flex lg:flex-wrap gap-1.5 bg-slate-100 p-1.5 rounded-2xl w-full">
        {TABS.map((tab, idx) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center justify-center gap-1.5 sm:gap-2 px-2.5 sm:px-4 py-2 rounded-xl text-xs sm:text-sm font-medium transition-all min-h-[38px] ${
              idx === TABS.length - 1 ? 'col-span-2 sm:col-span-1' : ''
            } ${
              activeTab === tab.id
                ? 'bg-white text-slate-800 shadow-xs font-bold'
                : 'text-slate-500 hover:text-slate-700 hover:bg-slate-200/50'
            }`}
          >
            {tab.icon}
            <span className="truncate">{tab.label}</span>
          </button>
        ))}
      </div>

      <div className="min-w-0">
        {activeTab === 'quiz' && <QuizTab colleges={colleges} batches={batches} subjects={subjects} />}
        {activeTab === 'assignments' && <AssignmentsTab colleges={colleges} batches={batches} subjects={subjects} />}
        {activeTab === 'projects' && <ProjectsTab colleges={colleges} batches={batches} subjects={subjects} />}
        {activeTab === 'batch' && <BatchTab colleges={colleges} batches={batches} subjects={subjects} />}
        {activeTab === 'students' && <StudentsTab colleges={colleges} batches={batches} subjects={subjects} />}
      </div>
    </div>
  );
};

export default FacilitatorAnalytics;
