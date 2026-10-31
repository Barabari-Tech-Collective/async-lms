import TopHeader from '@/components/common/facilitator/TopHeader';
import { useNavigate, useParams } from 'react-router';
import { useState, useEffect } from 'react';
import StatsCard from '@/components/common/results/StatsCard';
import ScoreChart from '@/components/common/results/ScoreChart';
import BatchTable from '@/components/common/results/BatchTable';
import StudentTable from '@/components/common/results/StudentTable';
import apiClient from '@/services/api';
import { Skeleton } from '@/components/ui/skeleton';
import { Loader2, CheckCircle2, AlertCircle, Award } from 'lucide-react';

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
  const fetchResults = async (isInitial = false) => {
    try {
      if (isInitial) setLoading(true);
      const { data } = await apiClient.get(`/evaluations/assignment/${id}/results`, {
        params: { _t: Date.now() },
      });

      setEvaluation(data.evaluation);
      setResults(data.results || []);
    } catch (err) {
      console.error('Failed to fetch results by assignment, attempting direct evaluation lookup:', err);
      try {
        const directRes = await apiClient.get(`/evaluations/${id}`, {
          params: { _t: Date.now() },
        });
        if (directRes.data?.evaluation) {
          setEvaluation(directRes.data.evaluation);
          setResults(directRes.data.results || []);
        }
      } catch (fallbackErr) {
        console.error('Fallback evaluation fetch failed:', fallbackErr);
      }
    } finally {
      if (isInitial) setLoading(false);
    }
  };

  useEffect(() => {
    if (id) fetchResults(true);
  }, [id]);

  const filteredResults = (results || [])
    .filter((r) => {
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
    })
    .sort((a, b) => {
      const nameA = (a.student_name || '').trim();
      const nameB = (b.student_name || '').trim();
      const cmp = nameA.localeCompare(nameB, undefined, { sensitivity: 'base' });
      if (cmp !== 0) return cmp;
      return String(a.submission_id || a.id || '').localeCompare(String(b.submission_id || b.id || ''));
    });

  const totalSubmissions = results.length;
  const isActivelyEvaluating = (r: any) =>
    Boolean((r.status === 'pending' || r.status === 'evaluating' || r.status === 'running') && r.id);
  const isCompleted = (r: any) => r.status === 'completed' || r.status === 'evaluated';
  const isFailed = (r: any) => r.status === 'failed';
  const isUnevaluated = (r: any) =>
    r.status === 'not_evaluated' ||
    r.status === 'not_started' ||
    r.status === 'unevaluated' ||
    r.status === 'cancelled' ||
    r.status === 'stopped' ||
    (!r.id && (r.status === 'pending' || !r.status));

  const pendingSubmissions = results.filter(isActivelyEvaluating).length;
  const failedSubmissions = results.filter(isFailed).length;
  const completedSubmissions = results.filter(isCompleted).length;
  const unevaluatedSubmissions = results.filter(isUnevaluated).length;
  const processedSubmissions = completedSubmissions + failedSubmissions;
  const progressPercent = totalSubmissions > 0 ? Math.round((processedSubmissions / totalSubmissions) * 100) : 0;

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
            {/* Cohort Live Progress / Evaluation Summary Bar */}
            {totalSubmissions > 0 && (
              <div className='bg-gradient-to-r from-blue-50 via-indigo-50 to-purple-50 border border-blue-200/80 rounded-2xl p-4 sm:p-5 shadow-xs transition-all'>
                <div className='flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-3'>
                  <div className='flex items-center gap-3'>
                    <div className={`w-10 h-10 rounded-xl text-white flex items-center justify-center shadow-xs shrink-0 ${
                      pendingSubmissions > 0
                        ? 'bg-blue-600'
                        : progressPercent === 100
                        ? 'bg-emerald-600'
                        : failedSubmissions > 0 && completedSubmissions === 0
                        ? 'bg-red-600'
                        : 'bg-indigo-600'
                    }`}>
                      {pendingSubmissions > 0 ? (
                        <Loader2 className='w-5 h-5 animate-spin' />
                      ) : progressPercent === 100 ? (
                        <CheckCircle2 className='w-5 h-5' />
                      ) : failedSubmissions > 0 && completedSubmissions === 0 ? (
                        <AlertCircle className='w-5 h-5' />
                      ) : (
                        <Award className='w-5 h-5' />
                      )}
                    </div>
                    <div>
                      <h3 className='text-sm sm:text-base font-bold text-slate-900 flex items-center gap-2 flex-wrap'>
                        {pendingSubmissions > 0
                          ? 'Batch Evaluation in Progress'
                          : progressPercent === 100
                          ? 'Evaluation Completed'
                          : 'Evaluation Progress'}

                        <span className='text-[11px] font-semibold text-emerald-700 bg-emerald-100/80 px-2.5 py-0.5 rounded-full border border-emerald-200/60'>
                          {completedSubmissions} evaluated
                        </span>

                        {pendingSubmissions > 0 && (
                          <span className='text-[11px] font-semibold text-blue-700 bg-blue-100/80 px-2.5 py-0.5 rounded-full border border-blue-200/60'>
                            {pendingSubmissions} running
                          </span>
                        )}

                        {failedSubmissions > 0 && (
                          <span className='text-[11px] font-semibold text-red-700 bg-red-100/80 px-2.5 py-0.5 rounded-full border border-red-200/60'>
                            {failedSubmissions} failed
                          </span>
                        )}

                        {unevaluatedSubmissions > 0 && (
                          <span className='text-[11px] font-semibold text-orange-700 bg-orange-100/80 px-2.5 py-0.5 rounded-full border border-orange-200/60'>
                            {unevaluatedSubmissions} not evaluated
                          </span>
                        )}
                      </h3>
                      <p className='text-xs text-slate-500 font-medium mt-0.5'>
                        {processedSubmissions} of {totalSubmissions} evaluated ({progressPercent}%)
                        {pendingSubmissions > 0 ? ' • Auto-syncing status in real-time' : ' • Cohort results summary'}
                      </p>
                    </div>
                  </div>
                  <div className='text-right shrink-0'>
                    <span className={`text-xl sm:text-2xl font-extrabold ${
                      progressPercent === 100 ? 'text-emerald-700' : 'text-blue-700'
                    }`}>
                      {progressPercent}%
                    </span>
                  </div>
                </div>

                {/* Progress track */}
                <div className='w-full bg-slate-200/80 rounded-full h-2.5 overflow-hidden'>
                  <div
                    className={`h-2.5 rounded-full transition-all duration-500 ease-out ${
                      progressPercent === 100
                        ? 'bg-gradient-to-r from-emerald-500 to-teal-500'
                        : 'bg-gradient-to-r from-blue-600 to-indigo-600'
                    }`}
                    style={{ width: `${Math.max(progressPercent > 0 ? 3 : 0, progressPercent)}%` }}
                  />
                </div>
              </div>
            )}

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
              assignmentId={String((evaluation as any)?.college_assignment_id || (evaluation as any)?.assignment_id || (evaluation as any)?.project_id || id)}
              onRefresh={fetchResults}
            />
          </div>
        )}
      </div>
    </div>
  );
};

export default ResultsPage;
