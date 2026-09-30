import { useState, useCallback } from 'react';
import TopHeader from '@/components/common/facilitator/TopHeader';
import EvaluationTable from '@/components/evaluations/EvaluationTable';
import { FileText, Trophy } from 'lucide-react';

const FacilitatorEvaluations = () => {
  const [activeTab, setActiveTab] = useState<'assignments' | 'projects'>('assignments');
  const [filters, setFilters] = useState({
    college: '',
    domain: '',
    batch: '',
  });
  const [search, setSearch] = useState('');

  const handleFilterChange = useCallback(
    (f: { college: string; domain: string; batch: string }) => {
      setFilters(f);
    },
    [],
  );

  return (
    <div className='min-w-0'>
      <div className='space-y-3.5 sm:space-y-4 px-1 sm:px-4 py-2 sm:py-3 min-w-0'>
        <div className='text-xs text-slate-400'>
          Dashboard / <span className='text-slate-800 font-medium'>Evaluation Center</span>
        </div>

        <div className='flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3'>
          <div>
            <h1 className='text-xl sm:text-2xl font-bold text-slate-800 tracking-tight'>
              Evaluation Center
            </h1>
            <p className='text-xs sm:text-sm text-slate-500'>
              {activeTab === 'assignments'
                ? 'Evaluate curriculum & college assignments by domain, batch, and students'
                : 'Evaluate capstone projects with central automated test & rubric evaluators'}
            </p>
          </div>

          {/* Two Tabs: Assignments & Projects */}
          <div className='flex items-center p-1 bg-slate-100 rounded-xl border border-slate-200/80 w-fit self-start sm:self-auto'>
            <button
              type='button'
              onClick={() => setActiveTab('assignments')}
              className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs sm:text-sm font-semibold transition-all ${
                activeTab === 'assignments'
                  ? 'bg-white text-blue-700 shadow-xs border border-slate-200/80'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/50'
              }`}
            >
              <FileText className='w-4 h-4' />
              <span>Assignments</span>
            </button>
            <button
              type='button'
              onClick={() => setActiveTab('projects')}
              className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs sm:text-sm font-semibold transition-all ${
                activeTab === 'projects'
                  ? 'bg-white text-blue-700 shadow-xs border border-slate-200/80'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/50'
              }`}
            >
              <Trophy className={`w-4 h-4 ${activeTab === 'projects' ? 'text-amber-500' : 'text-slate-500'}`} />
              <span>Projects</span>
            </button>
          </div>
        </div>

        <div className='flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 sm:gap-3'>
          <div className='w-full sm:w-64'>
            <input
              type='text'
              placeholder={activeTab === 'assignments' ? 'Search assignments...' : 'Search projects...'}
              className='border bg-white border-slate-200 px-3 py-2 rounded-lg text-xs sm:text-sm w-full focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-400 min-h-[38px]'
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <TopHeader onFilterChange={handleFilterChange} />
        </div>

        <EvaluationTable
          tab={activeTab}
          search={search}
          selectedCollege={filters.college}
          selectedDomain={filters.domain}
          selectedBatch={filters.batch}
        />
      </div>
    </div>
  );
};

export default FacilitatorEvaluations;
