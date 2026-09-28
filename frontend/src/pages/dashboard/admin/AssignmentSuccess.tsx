import { useLocation, useNavigate } from 'react-router';
import { CheckCircle2, Pencil, Trash2, ArrowRight } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

/* ======================
   Types
====================== */

interface AssignmentData {
  title: string;
  course: string;
  college: string;
  topicId: string;
  deadline: string;
  totalMarks: number;
  rubrics: { name: string; score: number }[];
}

/* ======================
   Component
====================== */

export default function AssignmentSuccess() {
  const location = useLocation();
  const navigate = useNavigate();
  const assignment = location.state as AssignmentData | null;

  const dashboardType = location.pathname.includes('/dashboard/admin') ? 'admin' : 'facilitator';
  const basePath = `/dashboard/${dashboardType}`;
  const managementPath = dashboardType === 'admin' ? '/assignment-management' : '/assignments';

  // If no data was passed (e.g. user navigated directly), redirect to create page
  if (!assignment) {
    return (
      <div className='min-h-screen bg-slate-50/60 flex items-center justify-center px-4'>
        <div className='max-w-md w-full text-center space-y-4 animate-in fade-in duration-500'>
          <div className='w-16 h-16 rounded-full bg-slate-100 flex items-center justify-center mx-auto'>
            <CheckCircle2 className='w-10 h-10 text-slate-300' />
          </div>
          <h1 className='text-xl font-bold text-slate-900'>No Assignment Data</h1>
          <p className='text-sm text-slate-500'>
            Please create an assignment first to see the success page.
          </p>
          <Button
            className='bg-blue-600 hover:bg-blue-700'
            onClick={() => navigate(`${basePath}/create-assignment`)}
          >
            Go to Create Assignment
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className='min-h-screen bg-slate-50/60 flex items-center justify-center px-3.5 sm:px-6 py-6 sm:py-10'>
      <div className='max-w-2xl w-full space-y-6 sm:space-y-8 animate-in fade-in duration-500'>
        {/* ── Success Icon & Heading ── */}
        <div className='text-center space-y-2.5 sm:space-y-3'>
          <div className='flex justify-center'>
            <div className='w-14 h-14 sm:w-16 sm:h-16 rounded-full bg-emerald-50 flex items-center justify-center'>
              <CheckCircle2 className='w-8 h-8 sm:w-10 sm:h-10 text-emerald-500' />
            </div>
          </div>
          <h1 className='text-xl sm:text-2xl font-bold text-slate-900 tracking-tight'>
            Assignment Created Successfully
          </h1>
          <p className='text-xs sm:text-sm text-slate-500'>
            Your assignment is now live and visible to students.
          </p>
        </div>

        {/* ── Assignment Preview Card ── */}
        <div className='bg-white rounded-2xl border border-slate-200 shadow-sm p-4 sm:p-6 space-y-4 sm:space-y-5'>
          <h2 className='text-sm sm:text-base font-semibold text-slate-900'>
            Assignment Preview
          </h2>

          {/* Info Grid */}
          <div className='grid grid-cols-1 sm:grid-cols-2 gap-y-3.5 sm:gap-y-5 gap-x-6 sm:gap-x-8'>
            {/* Title */}
            <div className='space-y-1'>
              <p className='text-[10px] sm:text-xs font-semibold text-slate-400 uppercase tracking-wider'>
                Title
              </p>
              <p className='text-xs sm:text-sm font-medium text-slate-800 break-words'>
                {assignment.title || '—'}
              </p>
            </div>

            {/* Course */}
            <div className='space-y-1'>
              <p className='text-[10px] sm:text-xs font-semibold text-slate-400 uppercase tracking-wider'>
                Course
              </p>
              <p className='text-xs sm:text-sm font-medium text-slate-800 break-words'>
                {assignment.course || '—'}
              </p>
            </div>

            {/* College */}
            <div className='space-y-1'>
              <p className='text-[10px] sm:text-xs font-semibold text-slate-400 uppercase tracking-wider'>
                College
              </p>
              <p className='text-xs sm:text-sm font-medium text-slate-800 break-words'>
                {assignment.college || '—'}
              </p>
            </div>

            {/* Subject */}
            <div className='space-y-1'>
              <p className='text-[10px] sm:text-xs font-semibold text-slate-400 uppercase tracking-wider'>
                Subject
              </p>
              <p className='text-xs sm:text-sm font-medium text-slate-800'>
                {assignment.topicId || '—'}
              </p>
            </div>

            {/* Due Date */}
            <div className='space-y-1'>
              <p className='text-[10px] sm:text-xs font-semibold text-slate-400 uppercase tracking-wider'>
                Due Date
              </p>
              <p className='text-xs sm:text-sm font-medium text-slate-800'>
                {assignment.deadline || '—'}
              </p>
            </div>

            {/* Total Marks */}
            <div className='space-y-1'>
              <p className='text-[10px] sm:text-xs font-semibold text-slate-400 uppercase tracking-wider'>
                Total Marks
              </p>
              <p className='text-xs sm:text-sm font-medium text-slate-800'>
                {assignment.totalMarks || 0}
              </p>
            </div>
          </div>

          {/* Rubrics */}
          {assignment.rubrics && assignment.rubrics.length > 0 && (
            <div className='space-y-2 pt-2 border-t border-slate-100'>
              <p className='text-[10px] sm:text-xs font-semibold text-slate-400 uppercase tracking-wider'>
                Rubrics
              </p>
              <div className='flex flex-wrap gap-1.5 sm:gap-2'>
                {assignment.rubrics.map((rubric) => (
                  <Badge
                    key={rubric.name}
                    className='bg-slate-100 text-slate-700 hover:bg-slate-100 font-normal text-xs px-2.5 sm:px-3 py-1'
                  >
                    {rubric.name} ({rubric.score})
                  </Badge>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* ── Action Buttons ── */}
        <div className='flex flex-col sm:flex-row items-stretch sm:items-center justify-center gap-2.5 sm:gap-4 pb-8 w-full'>
          <Button
            variant='outline'
            className='w-full sm:w-auto gap-2 text-slate-700 border-slate-300 hover:bg-slate-50 min-h-[42px] text-xs sm:text-sm justify-center'
            onClick={() => navigate(`${basePath}/create-assignment`, { state: assignment })}
          >
            <Pencil className='w-4 h-4' />
            Edit Assignment
          </Button>

          <Button
            variant='outline'
            className='w-full sm:w-auto gap-2 text-red-500 border-red-200 hover:bg-red-50 hover:text-red-600 min-h-[42px] text-xs sm:text-sm justify-center'
            onClick={() => navigate(`${basePath}${managementPath}`)}
          >
            <Trash2 className='w-4 h-4' />
            Delete Assignment
          </Button>

          <Button
            className='w-full sm:w-auto gap-2 bg-blue-600 hover:bg-blue-700 min-h-[42px] text-xs sm:text-sm justify-center'
            onClick={() => navigate(`${basePath}${managementPath}`)}
          >
            Go to Assignment Management
            <ArrowRight className='w-4 h-4' />
          </Button>
        </div>
      </div>
    </div>
  );
}
