import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { FileText, CheckCircle2 } from 'lucide-react';
import type { Assignment } from '@/utils/types';
import { FormattedContent } from '@/utils/contentFormat';

export type { Assignment };

export const AssignmentCard = ({ assignment }: { assignment: Assignment }) => {
  const isCompleted = assignment.status === 'COMPLETED';

  return (
    <Card className='w-full border-slate-100 shadow-sm transition-all hover:shadow-md'>
      <CardHeader className='flex flex-row items-start justify-between space-y-0 pb-2'>
        <div
          className={`p-2 rounded-lg ${
            isCompleted ? 'bg-emerald-50' : 'bg-blue-50'
          }`}
        >
          {isCompleted ? (
            <CheckCircle2 className='w-5 h-5 text-emerald-500' />
          ) : (
            <FileText className='w-5 h-5 text-blue-500' />
          )}
        </div>
        <Badge
          variant='secondary'
          className={
            isCompleted
              ? 'bg-emerald-50 text-emerald-600 border-none font-bold'
              : 'bg-orange-50 text-orange-600 border-none font-bold'
          }
        >
          {assignment.status}
        </Badge>
      </CardHeader>

      <CardContent className='space-y-4'>
        <div className='space-y-1'>
          <CardTitle className='text-xl font-bold text-slate-800'>
            {assignment.title}
          </CardTitle>
          <FormattedContent
            content={assignment.instructions}
            className='prose prose-sm max-w-none text-slate-500 leading-relaxed line-clamp-3'
          />
        </div>

        <div className='space-y-2 text-sm pt-2'>
          <div className='flex justify-between'>
            <span className='text-slate-400'>Course:</span>
            <span className='font-semibold text-slate-700 text-right'>
              {assignment.subject_title}
            </span>
          </div>
          <div className='flex justify-between'>
            <span className='text-slate-400'>Unit:</span>
            <span className='text-slate-600 text-right'>
              {assignment.unit_title}
            </span>
          </div>
          <div className='flex justify-between'>
            <span className='text-slate-400'>Max Score:</span>
            <span className='font-semibold text-slate-700'>
              {assignment.max_score} pts
            </span>
          </div>
        </div>

        {isCompleted && assignment.score !== undefined && (
          <div className='flex items-center justify-between p-3 bg-emerald-50/50 rounded-lg mt-4 border border-emerald-100'>
            <span className='text-emerald-700 font-bold'>
              Score: {assignment.score}/{assignment.max_score}
            </span>
            <button className='text-xs font-bold text-emerald-600 hover:underline'>
              View Feedback
            </button>
          </div>
        )}
      </CardContent>

      {!isCompleted && (
        <CardFooter>
          <Button
            variant='outline'
            className='w-full border-indigo-900 text-indigo-900 hover:bg-indigo-50 font-bold'
          >
            View Details
          </Button>
        </CardFooter>
      )}
    </Card>
  );
};
