import TopHeader from '@/components/common/facilitator/TopHeader';
import { useNavigate, useParams } from 'react-router';
import { useState, useEffect } from 'react';
import StatsCard from '@/components/common/results/StatsCard';
import ScoreChart from '@/components/common/results/ScoreChart';
import BatchTable from '@/components/common/results/BatchTable';
import StudentTable from '@/components/common/results/StudentTable';
import apiClient from '@/services/api';
import { Skeleton } from '@/components/ui/skeleton';

type Evaluation = {
  id: string;
  assignment_id: string;
  assignment_name?: string;
  evaluator_type?: string;
};
const ResultsPage = () => {
  const navigate = useNavigate();
  const { id } = useParams(); // evaluationId

  const [evaluation, setEvaluation] = useState<Evaluation | null>(null);
  const [results, setResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({
    college: '',
    domain: '',
    batch: '',
  });

  const assignmentName =
    evaluation?.assignment_name || evaluation?.assignment_id;
  const fetchResults = async () => {
    try {
      setLoading(true);
      const { data } = await apiClient.get(`/evaluations/assignment/${id}/results`);

      setEvaluation(data.evaluation);
      setResults(data.results);
    } catch (err) {
      console.error('Failed to fetch results', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (id) fetchResults();
  }, [id]);

  const filteredResults = (results || []).filter((r) => {
    // If the backend doesn't supply these fields yet, we shouldn't filter by them
    // or else the list will be empty when a filter is chosen.
    if (filters.college && r.college_id && r.college_id !== filters.college)
      return false;
    if (
      filters.batch &&
      r.expected_graduation_year &&
      r.expected_graduation_year.toString() !== filters.batch.toString()
    )
      return false;
    return true;
  });

  return (
    <div className='min-w-0'>
      <div className='px-1 sm:px-6 space-y-4 pb-12 min-w-0'>
        {/* Back + Title */}
        <div className='flex items-center gap-3 mt-2 sm:mt-4'>
          <button
            onClick={() => navigate(-1)}
            className='p-1.5 rounded-lg text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition min-h-[36px] min-w-[36px] flex items-center justify-center text-sm font-semibold'
          >
            ← Back
          </button>

          <h1 className='text-lg sm:text-xl font-bold text-slate-900 tracking-tight'>Evaluation Results</h1>
        </div>

        <div className='flex flex-col sm:flex-row sm:items-center justify-between gap-2.5'>
          {/* Assignment */}
          <p className='text-xs sm:text-sm text-slate-500 font-medium truncate max-w-md'>{assignmentName}</p>
          <TopHeader onFilterChange={setFilters} />
        </div>

        {loading ? (
          <div className='mt-4 sm:mt-6 space-y-4 sm:space-y-6'>
            {/* Stat cards skeleton */}
            <div className='grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-4'>
              {[...Array(4)].map((_, i) => (
                <div
                  key={i}
                  className='bg-white border rounded-xl p-3 sm:px-4 sm:py-3 flex flex-col sm:flex-row items-center gap-2 sm:gap-3'
                >
                  <Skeleton className='w-8 h-8 sm:w-9 sm:h-9 rounded-xl' />
                  <div className='flex-1 space-y-1.5 w-full flex flex-col items-center sm:items-start'>
                    <Skeleton className='h-3 w-16 sm:w-20' />
                    <Skeleton className='h-4 sm:h-5 w-10 sm:w-12' />
                  </div>
                </div>
              ))}
            </div>

            {/* Chart skeleton */}
            <div className='bg-white border rounded-xl p-4'>
              <Skeleton className='h-4 w-32 mb-4' />
              <Skeleton className='h-64 w-full' />
            </div>

            {/* Batch table skeleton */}
            <div className='bg-white border rounded-xl p-4 space-y-3'>
              <Skeleton className='h-4 w-40' />
              {[...Array(3)].map((_, i) => (
                <Skeleton key={i} className='h-8 w-full' />
              ))}
            </div>

            {/* Student table skeleton */}
            <div className='bg-white border rounded-xl p-4 space-y-3'>
              <Skeleton className='h-4 w-32' />
              {[...Array(5)].map((_, i) => (
                <Skeleton key={i} className='h-8 w-full' />
              ))}
            </div>
          </div>
        ) : (
          <div className='space-y-4 sm:space-y-6 min-w-0'>
            {/* Cards */}
            <StatsCard results={filteredResults} />

            {/* Chart */}
            <ScoreChart results={filteredResults} />

            {/* Batch Table */}
            <BatchTable results={filteredResults} />

            {/* Student Table */}
            <StudentTable 
              results={filteredResults} 
              evaluation={evaluation} 
              assignmentId={id}
              onRefresh={fetchResults}
            />
          </div>
        )}
      </div>
    </div>
  );
};

export default ResultsPage;
