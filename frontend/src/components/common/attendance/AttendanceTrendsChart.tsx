import React from 'react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  type TooltipContentProps,
  type TooltipValueType,
} from 'recharts';
import { ChevronDown, Calendar, X } from 'lucide-react';
import type { AttendanceTrendPoint, BatchOption, SubjectOption } from '@/services/attendance';
import { formatEventTime, formatToDDMMYYYY } from '@/utils/dateFormat';

interface AttendanceTrendsChartProps {
  data: AttendanceTrendPoint[];
  batches: BatchOption[];
  subjects: SubjectOption[];
  timeRange: string;
  selectedBatch: string;
  selectedSubject: string;
  onTimeRangeChange: (range: string) => void;
  onBatchChange: (batch: string) => void;
  onSubjectChange: (subject: string) => void;
  isLoading?: boolean;
  selectedDate?: string | null;
  onClearDateSelection?: () => void;
  errorAction?: React.ReactNode;
}

type AttendanceTooltipProps = Pick<TooltipContentProps<TooltipValueType, string>, 'active' | 'payload'> & {
  isDateMode: boolean;
};

const CustomTooltip = ({ active, payload, isDateMode }: AttendanceTooltipProps) => {
  if (active && payload && payload.length) {
    const data: AttendanceTrendPoint = payload[0].payload;
    const formattedDate = formatToDDMMYYYY(data.date);
    return (
      <div className='bg-white/95 backdrop-blur-xs border border-slate-200/80 rounded-xl p-3 shadow-lg text-xs min-w-[170px]'>
        <p className='font-bold text-slate-800 mb-0.5 truncate max-w-[200px]'>
          {data.day || 'Class'}
        </p>
        <p className='text-[11px] text-slate-500 mb-2'>
          {formattedDate}{isDateMode && ` · ${formatEventTime(data.date)}`}
        </p>
        <div className='flex items-center justify-between gap-3 text-slate-700 font-medium pt-1 border-t border-slate-100'>
          <span className='flex items-center gap-1.5'>
            <span className='w-2 h-2 rounded-full bg-blue-600 inline-block' />
            Online Attendance
          </span>
          <span className='font-bold text-blue-600'>{data.onlineAttendancePercent}%</span>
        </div>
      </div>
    );
  }
  return null;
};

export const AttendanceTrendsChart: React.FC<AttendanceTrendsChartProps> = ({
  data,
  batches,
  subjects,
  timeRange,
  selectedBatch,
  selectedSubject,
  onTimeRangeChange,
  onBatchChange,
  onSubjectChange,
  isLoading,
  selectedDate,
  onClearDateSelection,
  errorAction,
}) => {
  const isDateMode = Boolean(selectedDate);
  const formatAxisValue = isDateMode ? formatEventTime : formatToDDMMYYYY;

  const dateDisplayLabel = formatToDDMMYYYY(selectedDate ?? '');
  const chartData = errorAction ? [] : data;

  return (
    <div className='bg-white rounded-3xl p-6 shadow-xs border border-slate-100/80 flex flex-col justify-between h-full'>
      {/* Header with Title and Filters */}
      <div className='flex flex-wrap items-center justify-between gap-4 mb-4'>
        <div>
          <div className='flex items-center gap-2.5'>
            <h2 className='text-lg font-bold text-slate-900 tracking-tight'>
              Attendance trends
            </h2>
            {isDateMode && (
              <button
                type='button'
                onClick={onClearDateSelection}
                className='inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-blue-50 text-blue-700 text-xs font-semibold hover:bg-blue-100 transition-colors border border-blue-200/60 cursor-pointer'
                title='Click to clear date filter'
              >
                <span>{dateDisplayLabel}</span>
                <X className='w-3 h-3 text-blue-500' />
              </button>
            )}
          </div>
          <p className='text-xs text-slate-500 mt-0.5'>
            {isDateMode
              ? `Showing online class attendance for ${dateDisplayLabel}`
              : 'Average attendance across your assigned batches'}
          </p>
        </div>

        {/* Dropdowns */}
        <div className='flex flex-wrap items-center gap-2.5'>
          {/* Time Range Select - hidden in single date mode */}
          {!isDateMode && (
            <div className='relative'>
              <select
                value={timeRange}
                aria-label='Filter by time range'
                onChange={(e) => onTimeRangeChange(e.target.value)}
                className='appearance-none bg-slate-900 text-white text-xs font-medium rounded-xl pl-3.5 pr-8 py-2 cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-xs'
              >
                <option value='7d'>Last 7 days</option>
                <option value='30d'>Last 30 days</option>
                <option value='90d'>Last 90 days</option>
              </select>
              <ChevronDown className='w-3.5 h-3.5 text-slate-300 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none' />
            </div>
          )}

          {/* Batch Filter Select */}
          <div className='relative'>
            <select
              value={selectedBatch}
              aria-label='Filter by batch'
              onChange={(e) => onBatchChange(e.target.value)}
              className='appearance-none bg-slate-900 text-white text-xs font-medium rounded-xl pl-3.5 pr-8 py-2 cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-xs max-w-[140px] truncate'
            >
              <option value='all'>All batches</option>
              {batches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
            <ChevronDown className='w-3.5 h-3.5 text-slate-300 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none' />
          </div>

          <div className='relative'>
            <select
              value={selectedSubject}
              onChange={(e) => onSubjectChange(e.target.value)}
              className='appearance-none bg-slate-900 text-white text-xs font-medium rounded-xl pl-3.5 pr-8 py-2 cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-xs max-w-[150px] truncate'
              aria-label='Filter by course'
            >
              <option value='all'>All courses</option>
              {subjects.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
            <ChevronDown className='w-3.5 h-3.5 text-slate-300 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none' />
          </div>
        </div>
      </div>

      {/* Legend */}
      <div className='flex items-center justify-between mb-2'>
        <div className='flex items-center gap-2 text-xs font-medium text-slate-600'>
          <span className='w-2.5 h-2.5 rounded-full bg-blue-600 inline-block' />
          <span>Online Classes</span>
        </div>
        {isDateMode && !errorAction && !isLoading && (
          <span className='text-xs text-slate-500 font-medium'>
            {chartData.length} {chartData.length === 1 ? 'class' : 'classes'} recorded
          </span>
        )}
      </div>

      {/* Chart Canvas or Empty State */}
      <div className='w-full h-72 sm:h-80'>
        {errorAction || (isLoading ? (
          <div className='w-full h-full flex items-center justify-center bg-slate-50/50 rounded-xl'>
            <div className='w-8 h-8 border-3 border-blue-600 border-t-transparent rounded-full animate-spin' />
          </div>
        ) : chartData.length === 0 ? (
          <div className='w-full h-full flex flex-col items-center justify-center text-center p-6 bg-slate-50/60 rounded-2xl border border-dashed border-slate-200'>
            <Calendar className='w-10 h-10 text-slate-400 mb-2.5' />
            <h3 className='text-sm font-bold text-slate-800'>
              {isDateMode
                ? `No classes found on ${dateDisplayLabel}`
                : `No attendance data for ${
                    timeRange === '7d'
                      ? 'the last 7 days'
                      : timeRange === '90d'
                      ? 'the last 90 days'
                      : 'the last 30 days'
                  }`}
            </h3>
            <p className='text-xs text-slate-500 max-w-xs mt-1 mb-4'>
              {isDateMode
                ? 'No attendance has been recorded for the selected date and filters.'
                : 'No attendance has been recorded for the selected range and filters.'}
            </p>
            {isDateMode && (
              <button
                type='button'
                onClick={onClearDateSelection}
                className='px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-medium transition-colors cursor-pointer shadow-xs'
              >
                Back to range view
              </button>
            )}
          </div>
        ) : (
          <ResponsiveContainer width='100%' height='100%'>
            <AreaChart
              data={chartData}
              margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
            >
              <defs>
                <linearGradient id='colorOnline' x1='0' y1='0' x2='0' y2='1'>
                  <stop offset='5%' stopColor='#2563EB' stopOpacity={0.25} />
                  <stop offset='95%' stopColor='#2563EB' stopOpacity={0.0} />
                </linearGradient>
              </defs>
              <CartesianGrid
                strokeDasharray='3 3'
                vertical={false}
                stroke='#F1F5F9'
              />
              <XAxis
                dataKey='date'
                tickLine={false}
                axisLine={false}
                tick={{ fontSize: 11, fill: '#94A3B8' }}
                tickFormatter={formatAxisValue}
                interval={isDateMode ? 0 : Math.floor(chartData.length / 4)}
              />
              <YAxis
                domain={[0, 100]}
                ticks={[0, 20, 40, 60, 80, 100]}
                tickFormatter={(val) => `${val}%`}
                tickLine={false}
                axisLine={false}
                tick={{ fontSize: 11, fill: '#94A3B8' }}
              />
              <Tooltip
                content={(props) => <CustomTooltip {...props} isDateMode={isDateMode} />}
              />
              <Area
                type='monotone'
                dataKey='onlineAttendancePercent'
                stroke='#2563EB'
                strokeWidth={3}
                fillOpacity={1}
                fill='url(#colorOnline)'
                dot={{ r: 4, stroke: '#2563EB', strokeWidth: 2, fill: '#FFFFFF' }}
                activeDot={{ r: 6, stroke: '#1E40AF', strokeWidth: 2, fill: '#2563EB' }}
              />
            </AreaChart>
          </ResponsiveContainer>
        ))}
      </div>

      {/* Bottom Axis Indicator Pills (rendered only when data points exist) */}
      {chartData.length > 0 && (
        <div className='flex items-center justify-between px-6 pt-2 border-t border-slate-100 text-xs text-slate-500 font-medium'>
          {isDateMode ? (
            <>
              <span className='px-2.5 py-0.5 rounded-md bg-slate-100 text-slate-600'>
                {formatEventTime(chartData[0].date)}
              </span>
              <span className='text-xs text-slate-400'>
                Single-day class timeline
              </span>
              <span className='px-2.5 py-0.5 rounded-md bg-slate-100 text-slate-600'>
                {formatEventTime(chartData[chartData.length - 1].date)}
              </span>
            </>
          ) : (
            <>
              <span className='px-2.5 py-0.5 rounded-md bg-slate-100 text-slate-600'>
                {formatToDDMMYYYY(chartData[0]?.date)}
              </span>
              {chartData.length > 2 && (
                <span className='px-2.5 py-0.5 rounded-md bg-slate-100 text-slate-600'>
                  {formatToDDMMYYYY(chartData[Math.floor(chartData.length / 2)]?.date)}
                </span>
              )}
              <span className='px-2.5 py-0.5 rounded-md bg-slate-100 text-slate-600'>
                {formatToDDMMYYYY(chartData[chartData.length - 1]?.date)}
              </span>
            </>
          )}
        </div>
      )}
    </div>
  );
};

export default AttendanceTrendsChart;
