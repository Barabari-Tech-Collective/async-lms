import React, { useMemo } from 'react';
import { Award } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

export interface RubricItem {
  name: string;
  description?: string;
  weight?: number;
  score?: number;
  points?: number;
}

interface AssignmentRubricsViewerProps {
  rubric: string | RubricItem[] | null | undefined;
  maxScore?: number;
  className?: string;
}

export const AssignmentRubricsViewer: React.FC<AssignmentRubricsViewerProps> = ({
  rubric,
  maxScore,
  className = '',
}) => {
  const parsedRubric = useMemo<RubricItem[] | null>(() => {
    if (!rubric) return null;
    if (Array.isArray(rubric)) return rubric;
    if (typeof rubric === 'string') {
      try {
        const parsed = JSON.parse(rubric);
        return Array.isArray(parsed) ? parsed : null;
      } catch {
        return null;
      }
    }
    if (typeof rubric === 'object' && Array.isArray((rubric as any).criteria)) {
      return (rubric as any).criteria;
    }
    return null;
  }, [rubric]);

  if (!parsedRubric || parsedRubric.length === 0) {
    return null;
  }

  const totalWeight = parsedRubric.reduce(
    (acc, curr) => acc + (curr.weight ?? curr.score ?? curr.points ?? 0),
    0,
  );

  return (
    <Card className={`overflow-hidden rounded-2xl sm:rounded-[2rem] border border-slate-100 shadow-sm p-0 ${className}`}>
      {/* Card Header */}
      <div className='flex items-center justify-between px-4 sm:px-8 pt-5 sm:pt-6 pb-2'>
        <div>
          <div className='flex items-center gap-2'>
            <Award className='h-4 w-4 text-amber-500' />
            <p className='text-xs font-semibold uppercase tracking-widest text-slate-400'>
              Grading Rubric
            </p>
          </div>
          <p className='text-xs sm:text-sm text-slate-500 mt-0.5'>
            Evaluation criteria and score distribution
          </p>
        </div>
        <div className='flex items-center gap-2'>
          {maxScore !== undefined && maxScore > 0 && (
            <Badge className='bg-slate-100 text-slate-700 border-slate-200 text-xs font-semibold px-2.5 py-0.5'>
              Max: {maxScore} pts
            </Badge>
          )}
          <Badge className='bg-amber-50 text-amber-700 border-amber-200 text-xs font-semibold px-2.5 py-0.5'>
            {parsedRubric.length} {parsedRubric.length === 1 ? 'Criterion' : 'Criteria'}
          </Badge>
          {totalWeight > 0 && (
            <Badge className='bg-slate-100 text-slate-700 border-slate-200 text-xs font-semibold px-2.5 py-0.5'>
              {totalWeight}% Weightage
            </Badge>
          )}
        </div>
      </div>

      {/* Criteria List */}
      <div className='px-4 sm:px-8 py-4 sm:py-6 space-y-3.5'>
        {parsedRubric.map((item, idx) => {
          const points = item.weight ?? item.score ?? item.points ?? 0;
          return (
            <div
              key={idx}
              className='p-4 rounded-xl border border-slate-100 bg-slate-50/60 hover:bg-slate-50 transition-colors space-y-2'
            >
              <div className='flex items-start justify-between gap-3'>
                <div className='flex items-start gap-2.5'>
                  <div className='w-6 h-6 rounded-lg bg-amber-100 text-amber-700 flex items-center justify-center shrink-0 mt-0.5 text-xs font-bold'>
                    {idx + 1}
                  </div>
                  <div>
                    <h4 className='text-sm font-semibold text-slate-800 leading-snug'>
                      {item.name || `Criterion ${idx + 1}`}
                    </h4>
                    {item.description && (
                      <p className='text-xs sm:text-sm text-slate-600 mt-1 leading-relaxed'>
                        {item.description}
                      </p>
                    )}
                  </div>
                </div>

                {points > 0 && (
                  <Badge className='bg-white text-slate-700 border-slate-200 font-bold text-xs shrink-0 shadow-2xs px-2.5 py-1'>
                    {points} {points === 1 ? 'pt' : 'pts'}
                    {totalWeight === 100 ? '%' : ''}
                  </Badge>
                )}
              </div>

              {/* Visual weight indicator bar */}
              {totalWeight > 0 && points > 0 && (
                <div className='w-full bg-slate-200/80 rounded-full h-1.5 mt-2 overflow-hidden'>
                  <div
                    className='bg-amber-400 h-1.5 rounded-full transition-all duration-300'
                    style={{ width: `${Math.min(100, Math.round((points / totalWeight) * 100))}%` }}
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </Card>
  );
};

export default AssignmentRubricsViewer;
