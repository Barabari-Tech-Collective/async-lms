import EnrollmentRequestsPanel from '@/components/common/EnrollmentRequestsPanel';

export default function FacilitatorRequests() {
  return (
    <div className='p-3 sm:p-6 md:p-8 max-w-7xl mx-auto space-y-4 sm:space-y-6 min-w-0'>
      <div className='flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-b border-slate-200/60 pb-3 sm:pb-5'>
        <div>
          <h1 className='text-lg sm:text-2xl font-bold tracking-tight text-slate-900'>
            Course Enrollment Requests
          </h1>
          <p className='text-xs sm:text-sm text-slate-500 mt-1'>
            Review and approve or reject student course enrollment requests from your assigned colleges and subjects.
          </p>
        </div>
      </div>

      <EnrollmentRequestsPanel apiPrefix='facilitator' />
    </div>
  );
}
