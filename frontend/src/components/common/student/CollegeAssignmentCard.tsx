import { FileText, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { CollegeAssignment } from '@/utils/types';
import { formatDateTime, isPastDate } from '@/utils/dateUtils';

function stripHtml(html: string) {
  return html
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function formatDueDate(dateStr: string) {
  const isPast = isPastDate(dateStr);
  const label = formatDateTime(dateStr);
  return { label, isPast };
}

interface Props {
  assignment: CollegeAssignment;
  onClick?: () => void;
}

export const CollegeAssignmentCard = ({ assignment, onClick }: Props) => {
  const due = assignment.due_date ? formatDueDate(assignment.due_date) : null;
  const isSubmitted = Boolean(
    assignment.submission_link || assignment.submission_file_url,
  );

  return (
    <div
      className='group bg-white border border-slate-100 rounded-[2rem] shadow-sm p-8 space-y-5 hover:shadow-xl transition-all duration-300 cursor-pointer flex flex-col h-full'
      onClick={onClick}
    >
      <div className='flex items-start justify-between'>
        <div
          className={`w-11 h-11 rounded-2xl flex items-center justify-center ${
            isSubmitted
              ? 'bg-emerald-50 text-emerald-600'
              : 'bg-[#333D7C]/10 text-[#333D7C]'
          }`}
        >
          {isSubmitted ? (
            <CheckCircle2 className='w-5 h-5' />
          ) : (
            <FileText className='w-5 h-5' />
          )}
        </div>

        <span
          className={`px-3 py-0.5 rounded-full text-[10px] font-bold uppercase ${
            isSubmitted
              ? 'bg-emerald-50 text-emerald-700 border-none'
              : due?.isPast
              ? 'bg-red-50 text-red-600 border-none'
              : 'bg-orange-50 text-orange-600 border-none'
          }`}
        >
          {isSubmitted ? 'Completed' : due?.isPast ? 'Overdue' : 'Pending'}
        </span>
      </div>

      <div className='space-y-2 flex-1'>
        <h3 className='text-xl font-bold text-[#1e293b] group-hover:text-[#333D7C] transition-colors leading-tight'>
          {assignment.title}
        </h3>
        {assignment.description && (
          <p className='text-slate-500 line-clamp-3 text-sm leading-relaxed'>
            {stripHtml(assignment.description)}
          </p>
        )}
      </div>

      <div className='space-y-2 pt-4 border-t border-slate-100 text-sm'>
        <div className='flex items-center justify-between'>
          <span className='text-slate-400'>Course</span>
          <span className='text-[#1e293b] font-semibold text-right'>
            {assignment.course || 'Build Web Applications'}
          </span>
        </div>
        {due && (
          <div className='flex items-center justify-between'>
            <span className='text-slate-400'>Due date</span>
            <span
              className={`text-right font-semibold ${due.isPast ? 'text-red-500' : 'text-orange-500'}`}
            >
              {due.label}
            </span>
          </div>
        )}
      </div>

      <div className='pt-1'>
        {isSubmitted ? (
          <div className='bg-emerald-50 rounded-xl p-3 flex items-center justify-center gap-2'>
            <CheckCircle2 className='w-4 h-4 text-emerald-600' />
            <span className='text-emerald-700 font-semibold text-sm'>
              Submitted
            </span>
          </div>
        ) : (
          <Button
            size='sm'
            className='w-full gap-2 bg-[#333D7C] hover:bg-[#2a3268] text-white'
            onClick={(e) => {
              e.stopPropagation();
              onClick?.();
            }}
          >
            View Details
          </Button>
        )}
      </div>
    </div>
  );
};
