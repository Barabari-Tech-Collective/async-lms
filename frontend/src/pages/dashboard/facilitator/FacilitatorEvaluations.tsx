import { useState, useCallback } from 'react';
import TopHeader from '@/components/common/facilitator/TopHeader';
import EvaluationTable from '@/components/evaluations/EvaluationTable';

const FacilitatorEvaluations = () => {
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

        <div>
          <h1 className='text-xl sm:text-2xl font-bold text-slate-800 tracking-tight'>
            Evaluation Center
          </h1>
          <p className='text-xs sm:text-sm text-slate-500'>
            Evaluate assignments by domain, batch, and students
          </p>
        </div>

        <div className='flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 sm:gap-3'>
          <div className='w-full sm:w-64'>
            <input
              type='text'
              placeholder='Search assignments...'
              className='border bg-white border-slate-200 px-3 py-2 rounded-lg text-xs sm:text-sm w-full focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-400 min-h-[38px]'
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <TopHeader onFilterChange={handleFilterChange} />
        </div>

        <EvaluationTable
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
