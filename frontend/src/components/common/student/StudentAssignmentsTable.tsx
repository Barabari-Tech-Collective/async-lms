import { useState, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router';
import {
  Search,
  FileText,
  Clock,
  CheckCircle2,
  Hourglass,
  ArrowUpRight,
  Eye,
  Send,
  Calendar,
  ChevronLeft,
  ChevronRight,
  BookOpen,
  Layers,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { StudentAssignmentFeedbackModal } from './StudentAssignmentFeedbackModal';
import type {
  StudentAssignmentOverviewItem,
  AssignmentLifecycleStatus,
} from '@/utils/types';

interface Props {
  assignments: StudentAssignmentOverviewItem[];
  isLoading: boolean;
}

type TabKey = 'all' | 'pending' | 'pending_evaluation' | 'evaluated';

export const StudentAssignmentsTable: React.FC<Props> = ({
  assignments,
  isLoading,
}) => {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<TabKey>('all');
  const [selectedCourse, setSelectedCourse] = useState<string>('all');
  const [selectedTopic, setSelectedTopic] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [selectedAssignment, setSelectedAssignment] =
    useState<StudentAssignmentOverviewItem | null>(null);
  const [feedbackModalOpen, setFeedbackModalOpen] = useState(false);

  const pageSize = 10;

  // Extract available courses dynamically
  const availableCourses = useMemo(() => {
    const map = new Map<string, number>();
    assignments.forEach((a) => {
      const key = a.course_name || 'General';
      map.set(key, (map.get(key) || 0) + 1);
    });
    return Array.from(map.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);
  }, [assignments]);

  // Base list filtered by selected course
  const courseFilteredAssignments = useMemo(() => {
    if (selectedCourse === 'all') return assignments;
    return assignments.filter((a) => (a.course_name || 'General') === selectedCourse);
  }, [assignments, selectedCourse]);

  // Extract available topics / units for the selected course (only when a course is chosen)
  const availableTopics = useMemo(() => {
    if (selectedCourse === 'all') return [];
    const map = new Map<string, number>();
    courseFilteredAssignments.forEach((a) => {
      const topic = a.topic_title || a.unit_title;
      if (topic && topic.trim()) {
        const key = topic.trim();
        map.set(key, (map.get(key) || 0) + 1);
      }
    });
    return Array.from(map.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [courseFilteredAssignments, selectedCourse]);

  // Reset selectedTopic when selectedCourse changes
  useEffect(() => {
    setSelectedTopic('all');
  }, [selectedCourse]);

  // List filtered by course and topic/unit
  const scopedAssignments = useMemo(() => {
    if (selectedTopic === 'all') return courseFilteredAssignments;
    return courseFilteredAssignments.filter((a) => {
      const topic = (a.topic_title || a.unit_title || '').trim();
      return topic === selectedTopic;
    });
  }, [courseFilteredAssignments, selectedTopic]);

  // Compute status counts for the selected course & topic
  const counts = useMemo(() => {
    return {
      all: scopedAssignments.length,
      pending: scopedAssignments.filter((a) => a.status === 'pending').length,
      pending_evaluation: scopedAssignments.filter(
        (a) => a.status === 'pending_evaluation',
      ).length,
      evaluated: scopedAssignments.filter((a) => a.status === 'evaluated').length,
    };
  }, [scopedAssignments]);

  // Filter assignments by activeTab and search query
  const filteredAssignments = useMemo(() => {
    return scopedAssignments.filter((item) => {
      // Tab filter
      if (activeTab !== 'all' && item.status !== activeTab) {
        return false;
      }
      // Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesTitle = item.title.toLowerCase().includes(q);
        const matchesCourse = (item.course_name || '').toLowerCase().includes(q);
        const matchesTopic = (item.topic_title || '').toLowerCase().includes(q);
        const matchesUnit = (item.unit_title || '').toLowerCase().includes(q);
        if (!matchesTitle && !matchesCourse && !matchesTopic && !matchesUnit) return false;
      }
      return true;
    });
  }, [scopedAssignments, activeTab, searchQuery]);

  // Reset to page 1 whenever filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [activeTab, selectedCourse, selectedTopic, searchQuery]);

  // Pagination calculations
  const totalPages = Math.max(1, Math.ceil(filteredAssignments.length / pageSize));
  const paginatedAssignments = useMemo(() => {
    const startIdx = (currentPage - 1) * pageSize;
    return filteredAssignments.slice(startIdx, startIdx + pageSize);
  }, [filteredAssignments, currentPage, pageSize]);

  const startRecord =
    filteredAssignments.length === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const endRecord = Math.min(currentPage * pageSize, filteredAssignments.length);

  const handleOpenFeedback = (item: StudentAssignmentOverviewItem) => {
    setSelectedAssignment(item);
    setFeedbackModalOpen(true);
  };

  const getStatusBadge = (status: AssignmentLifecycleStatus) => {
    switch (status) {
      case 'evaluated':
        return (
          <span className='inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200/80'>
            <CheckCircle2 className='w-3 h-3 text-emerald-600' />
            Evaluated
          </span>
        );
      case 'pending_evaluation':
        return (
          <span className='inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-sky-50 text-sky-700 border border-sky-200/80'>
            <Hourglass className='w-3 h-3 text-sky-600 animate-pulse' />
            Pending Evaluation
          </span>
        );
      case 'pending':
      default:
        return (
          <span className='inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200/80'>
            <Clock className='w-3 h-3 text-amber-600' />
            Pending
          </span>
        );
    }
  };

  const tabs: {
    key: TabKey;
    label: string;
    mobileLabel: string;
    count: number;
    dotColor?: string;
  }[] = [
    {
      key: 'all',
      label: 'All Assignments',
      mobileLabel: 'All Assignments',
      count: counts.all,
    },
    {
      key: 'pending',
      label: 'Pending',
      mobileLabel: 'Pending',
      count: counts.pending,
      dotColor: 'bg-amber-500',
    },
    {
      key: 'pending_evaluation',
      label: 'Pending Evaluation',
      mobileLabel: 'Pending Eval',
      count: counts.pending_evaluation,
      dotColor: 'bg-sky-500',
    },
    {
      key: 'evaluated',
      label: 'Evaluated',
      mobileLabel: 'Evaluated',
      count: counts.evaluated,
      dotColor: 'bg-emerald-500',
    },
  ];

  return (
    <div className='rounded-2xl sm:rounded-3xl border border-slate-200/80 bg-white shadow-xs overflow-hidden min-w-0'>
      {/* Header section with title, 2-tier filters (Course, Topic/Unit), and search */}
      <div className='p-4 sm:p-6 border-b border-slate-100 flex flex-col xl:flex-row xl:items-center justify-between gap-4'>
        <div>
          <h3 className='text-base sm:text-lg font-bold text-slate-900 tracking-tight'>
            Assignments & Evaluations
          </h3>
          <p className='text-xs text-slate-500 mt-0.5'>
            Track submissions, view facilitator reviews, and inspect your rubric scores
          </p>
        </div>

        {/* Toolbar: Course Filter, Topic/Unit Filter, and Search */}
        <div className='flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 w-full xl:w-auto flex-wrap min-w-0'>
          {/* 1. Course Dropdown Selector */}
          <div className='w-full sm:w-52 min-w-0'>
            <Select value={selectedCourse} onValueChange={(val) => setSelectedCourse(val)}>
              <SelectTrigger className='w-full h-9 bg-slate-50 hover:bg-slate-100/70 border-slate-200 rounded-xl text-xs sm:text-sm font-semibold text-slate-800 shadow-2xs cursor-pointer min-w-0'>
                <div className='flex items-center gap-2 min-w-0 truncate'>
                  <BookOpen className='w-3.5 h-3.5 text-slate-400 shrink-0' />
                  <SelectValue placeholder='All Courses' />
                </div>
              </SelectTrigger>
              <SelectContent className='max-w-[calc(100vw-2.5rem)] w-full sm:w-64 z-50 bg-white border border-slate-200 rounded-xl shadow-lg'>
                <SelectItem value='all' className='cursor-pointer text-xs sm:text-sm font-medium'>
                  All Courses ({assignments.length})
                </SelectItem>
                {availableCourses.map((c) => (
                  <SelectItem key={c.name} value={c.name} className='cursor-pointer text-xs sm:text-sm font-medium'>
                    <span className='truncate block max-w-[240px]'>
                      {c.name} ({c.count})
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* 2. Topic / Unit Dropdown (Enabled only when a course is selected) */}
          <div className='w-full sm:w-52 min-w-0'>
            <Select
              value={selectedTopic}
              disabled={selectedCourse === 'all'}
              onValueChange={(val) => setSelectedTopic(val)}
            >
              <SelectTrigger
                className={cn(
                  'w-full h-9 border-slate-200 rounded-xl text-xs sm:text-sm font-semibold shadow-2xs min-w-0',
                  selectedCourse === 'all'
                    ? 'bg-slate-100/70 text-slate-400 cursor-not-allowed opacity-60'
                    : 'bg-slate-50 hover:bg-slate-100/70 text-slate-800 cursor-pointer',
                )}
              >
                <div className='flex items-center gap-2 min-w-0 truncate'>
                  <Layers
                    className={cn(
                      'w-3.5 h-3.5 shrink-0',
                      selectedCourse === 'all' ? 'text-slate-300' : 'text-slate-400',
                    )}
                  />
                  <SelectValue
                    placeholder={
                      selectedCourse === 'all'
                        ? 'Select Course First'
                        : `All Topics & Units (${courseFilteredAssignments.length})`
                    }
                  />
                </div>
              </SelectTrigger>
              <SelectContent className='max-w-[calc(100vw-2.5rem)] w-full sm:w-64 max-h-60 overflow-y-auto z-50 bg-white border border-slate-200 rounded-xl shadow-lg'>
                <SelectItem value='all' className='cursor-pointer text-xs sm:text-sm font-medium'>
                  All Topics & Units ({courseFilteredAssignments.length})
                </SelectItem>
                {availableTopics.map((t) => (
                  <SelectItem key={t.name} value={t.name} className='cursor-pointer text-xs sm:text-sm font-medium'>
                    <span className='truncate block max-w-[240px]' title={t.name}>
                      {t.name} ({t.count})
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* 3. Search */}
          <div className='relative w-full sm:w-56 min-w-0 shrink-0'>
            <Search className='absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4 pointer-events-none' />
            <input
              type='text'
              placeholder='Search assignments...'
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className='w-full pl-9 pr-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs sm:text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-300 focus:bg-white transition-all shadow-2xs h-9 min-w-0'
            />
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className='border-b border-slate-100'>
        {/* Mobile: 2x2 Segmented Grid (All 4 states immediately visible, zero horizontal scroll) */}
        <div className='grid grid-cols-2 sm:hidden gap-1.5 p-2.5 bg-slate-50/70'>
          {tabs.map((tab) => {
            const isActive = activeTab === tab.key;
            return (
              <button
                key={tab.key}
                type='button'
                onClick={() => setActiveTab(tab.key)}
                className={cn(
                  'flex items-center justify-between px-2.5 py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer min-w-0 border',
                  isActive
                    ? 'bg-white text-indigo-700 border-indigo-200 shadow-xs'
                    : 'bg-white/60 text-slate-600 border-slate-200/70 hover:bg-white hover:text-slate-900',
                )}
              >
                <div className='flex items-center gap-1.5 min-w-0 truncate'>
                  {tab.dotColor && (
                    <span
                      className={cn(
                        'w-1.5 h-1.5 rounded-full shrink-0',
                        tab.dotColor,
                      )}
                    />
                  )}
                  <span className='truncate text-[11px]'>{tab.mobileLabel}</span>
                </div>
                <span
                  className={cn(
                    'text-[10px] font-bold px-1.5 py-0.5 rounded-full shrink-0 ml-1.5',
                    isActive
                      ? 'bg-indigo-50 text-indigo-700'
                      : 'bg-slate-100 text-slate-500',
                  )}
                >
                  {tab.count}
                </span>
              </button>
            );
          })}
        </div>

        {/* Desktop: Standard Horizontal Tab Strip */}
        <div className='hidden sm:flex items-center gap-2 px-6'>
          {tabs.map((tab) => (
            <button
              key={tab.key}
              type='button'
              onClick={() => setActiveTab(tab.key)}
              className={`flex items-center gap-2 py-3.5 px-4 text-xs sm:text-sm font-semibold border-b-2 -mb-px transition-colors shrink-0 cursor-pointer ${
                activeTab === tab.key
                  ? 'border-indigo-600 text-indigo-600'
                  : 'border-transparent text-slate-500 hover:text-slate-800 hover:border-slate-300'
              }`}
            >
              {tab.dotColor && (
                <span
                  className={cn('w-2 h-2 rounded-full shrink-0', tab.dotColor)}
                />
              )}
              {tab.label}
              <span
                className={`text-[10px] sm:text-[11px] font-bold px-1.5 py-0.5 rounded-full ${
                  activeTab === tab.key
                    ? 'bg-indigo-50 text-indigo-600'
                    : 'bg-slate-100 text-slate-500'
                }`}
              >
                {tab.count}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      {isLoading ? (
        <div className='p-6 space-y-4'>
          {[...Array(4)].map((_, i) => (
            <div
              key={i}
              className='flex flex-col sm:flex-row items-center justify-between p-4 rounded-xl border border-slate-100 gap-3'
            >
              <div className='flex items-center gap-3 w-full sm:w-auto'>
                <Skeleton className='w-10 h-10 rounded-xl shrink-0' />
                <div className='space-y-1.5 flex-1'>
                  <Skeleton className='h-4 w-48' />
                  <Skeleton className='h-3 w-32' />
                </div>
              </div>
              <Skeleton className='h-8 w-28 rounded-xl' />
            </div>
          ))}
        </div>
      ) : filteredAssignments.length === 0 ? (
        <div className='p-12 text-center text-slate-400 space-y-2'>
          <FileText className='w-10 h-10 mx-auto text-slate-300' />
          <p className='text-sm font-medium text-slate-600'>
            {searchQuery
              ? 'No assignments match your search.'
              : selectedTopic !== 'all'
                ? `No ${activeTab === 'all' ? '' : activeTab.replace('_', ' ') + ' '}assignments for "${selectedTopic}".`
                : selectedCourse !== 'all'
                  ? `No ${activeTab === 'all' ? '' : activeTab.replace('_', ' ') + ' '}assignments for ${selectedCourse}.`
                  : activeTab === 'all'
                    ? 'No assignments currently assigned.'
                    : `No ${activeTab.replace('_', ' ')} assignments found.`}
          </p>
          <p className='text-xs text-slate-400'>
            Try selecting a different course, topic, or status filter.
          </p>
        </div>
      ) : (
        <>
          {/* Desktop Table View */}
          <div className='hidden md:block overflow-x-auto'>
            <table className='w-full text-left border-collapse'>
              <thead>
                <tr className='border-b border-slate-100 bg-slate-50/50 text-[11px] font-bold text-slate-400 uppercase tracking-wider'>
                  <th className='py-3.5 pl-6 pr-3 w-12'>#</th>
                  <th className='py-3.5 px-4'>Assignment Name</th>
                  <th className='py-3.5 px-4 w-28'>Type</th>
                  <th className='py-3.5 px-4 w-48'>Course / Topic</th>
                  <th className='py-3.5 px-4 w-36'>Status</th>
                  <th className='py-3.5 px-4 w-28'>Score</th>
                  <th className='py-3.5 pr-6 pl-4 text-right w-36'>Action</th>
                </tr>
              </thead>
              <tbody className='divide-y divide-slate-100 text-xs sm:text-sm text-slate-700'>
                {paginatedAssignments.map((item, index) => {
                  const absoluteIndex = (currentPage - 1) * pageSize + index + 1;
                  const topicOrUnit = item.topic_title || item.unit_title;
                  return (
                    <tr
                      key={item.id}
                      className='hover:bg-slate-50/70 transition-colors group'
                    >
                      <td className='py-4 pl-6 pr-3 font-semibold text-slate-400 text-xs'>
                        {absoluteIndex}
                      </td>

                      {/* Assignment Name */}
                      <td className='py-4 px-4'>
                        <div className='min-w-0 max-w-xs sm:max-w-sm'>
                          <p
                            className='font-bold text-slate-900 truncate group-hover:text-indigo-600 transition-colors'
                            title={item.title}
                          >
                            {item.title}
                          </p>
                          {topicOrUnit && (
                            <p className='text-[11px] text-slate-400 mt-0.5 truncate' title={topicOrUnit}>
                              Topic: {topicOrUnit}
                            </p>
                          )}
                        </div>
                      </td>

                      {/* Type */}
                      <td className='py-4 px-4 whitespace-nowrap'>
                        <Badge
                          variant='secondary'
                          className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md ${
                            item.type === 'CURRICULUM'
                              ? 'bg-indigo-50 text-indigo-700 border-none'
                              : 'bg-purple-50 text-purple-700 border-none'
                          }`}
                        >
                          {item.type}
                        </Badge>
                      </td>

                      {/* Course / Topic */}
                      <td className='py-4 px-4'>
                        <div className='flex items-center gap-1.5 text-xs text-slate-700 font-semibold truncate max-w-[200px]'>
                          <BookOpen className='w-3.5 h-3.5 text-slate-400 shrink-0' />
                          <span className='truncate' title={item.course_name}>
                            {item.course_name}
                          </span>
                        </div>
                        {topicOrUnit && (
                          <span className='text-[10px] text-slate-400 truncate block mt-0.5' title={topicOrUnit}>
                            {topicOrUnit}
                          </span>
                        )}
                      </td>

                      {/* Status */}
                      <td className='py-4 px-4 whitespace-nowrap'>
                        {getStatusBadge(item.status)}
                      </td>

                      {/* Score */}
                      <td className='py-4 px-4 whitespace-nowrap font-medium'>
                        {item.status === 'evaluated' && item.marks !== null ? (
                          <div className='flex items-center gap-1'>
                            <span className='font-bold text-slate-900'>
                              {item.marks}
                            </span>
                            <span className='text-xs text-slate-400'>
                              / {item.max_score}
                            </span>
                          </div>
                        ) : (
                          <span className='text-slate-300 font-medium'>—</span>
                        )}
                      </td>

                      {/* Action */}
                      <td className='py-4 pr-6 pl-4 text-right whitespace-nowrap'>
                        {item.status === 'evaluated' ? (
                          <Button
                            size='sm'
                            onClick={() => handleOpenFeedback(item)}
                            className='bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-xl text-xs h-8 px-3.5 shadow-xs inline-flex items-center gap-1.5 cursor-pointer'
                          >
                            <Eye className='w-3.5 h-3.5' />
                            View Results
                          </Button>
                        ) : item.status === 'pending_evaluation' ? (
                          <Button
                            size='sm'
                            variant='outline'
                            onClick={() => navigate(item.navigation_url)}
                            className='border-slate-200 text-slate-700 hover:bg-slate-100 font-semibold rounded-xl text-xs h-8 px-3 shadow-2xs inline-flex items-center gap-1.5 cursor-pointer'
                          >
                            <FileText className='w-3.5 h-3.5 text-slate-400' />
                            View Submission
                          </Button>
                        ) : (
                          <Button
                            size='sm'
                            onClick={() => navigate(item.navigation_url)}
                            className='bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-xl text-xs h-8 px-3.5 shadow-xs inline-flex items-center gap-1.5 cursor-pointer'
                          >
                            <Send className='w-3.5 h-3.5' />
                            Start
                          </Button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile Card View */}
          <div className='md:hidden divide-y divide-slate-100'>
            {paginatedAssignments.map((item) => {
              const topicOrUnit = item.topic_title || item.unit_title;
              return (
                <div key={item.id} className='p-4 space-y-3'>
                  <div className='flex items-start justify-between gap-2'>
                    <div className='min-w-0 flex-1'>
                      <div className='flex items-center gap-1.5 mb-1 flex-wrap'>
                        <Badge
                          variant='secondary'
                          className={`text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-md ${
                            item.type === 'CURRICULUM'
                              ? 'bg-indigo-50 text-indigo-700'
                              : 'bg-purple-50 text-purple-700'
                          }`}
                        >
                          {item.type}
                        </Badge>
                        <span className='text-[11px] text-slate-500 font-semibold truncate max-w-[180px]'>
                          {item.course_name}
                        </span>
                        {topicOrUnit && (
                          <span className='text-[10px] text-slate-400 truncate max-w-[140px]'>
                            • {topicOrUnit}
                          </span>
                        )}
                      </div>
                      <h4 className='text-sm font-bold text-slate-900 leading-snug'>
                        {item.title}
                      </h4>
                    </div>
                    <div className='shrink-0'>{getStatusBadge(item.status)}</div>
                  </div>

                  <div className='flex items-center justify-between text-xs text-slate-500 pt-1'>
                    <div>
                      {item.status === 'evaluated' && item.marks !== null ? (
                        <span className='font-bold text-slate-900'>
                          Score: {item.marks} / {item.max_score} pts
                        </span>
                      ) : item.due_date ? (
                        <span className='flex items-center gap-1 text-[11px] text-slate-400'>
                          <Calendar className='w-3 h-3' />
                          Due: {new Date(item.due_date).toLocaleDateString()}
                        </span>
                      ) : (
                        <span className='text-[11px] text-slate-400'>
                          Max Score: {item.max_score} pts
                        </span>
                      )}
                    </div>

                    <div>
                      {item.status === 'evaluated' ? (
                        <Button
                          size='sm'
                          onClick={() => handleOpenFeedback(item)}
                          className='bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-xl text-xs h-8 px-3 cursor-pointer'
                        >
                          <Eye className='w-3.5 h-3.5 mr-1' /> View Results
                        </Button>
                      ) : item.status === 'pending_evaluation' ? (
                        <Button
                          size='sm'
                          variant='outline'
                          onClick={() => navigate(item.navigation_url)}
                          className='border-slate-200 text-slate-700 hover:bg-slate-100 font-semibold rounded-xl text-xs h-8 px-3 cursor-pointer'
                        >
                          View Submission
                        </Button>
                      ) : (
                        <Button
                          size='sm'
                          onClick={() => navigate(item.navigation_url)}
                          className='bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-xl text-xs h-8 px-4 cursor-pointer'
                        >
                          Start <ArrowUpRight className='w-3.5 h-3.5 ml-1' />
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Pagination Controls Footer Bar */}
          {filteredAssignments.length > 0 && (
            <div className='px-4 sm:px-6 py-3.5 border-t border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-3 bg-slate-50/50'>
              <div className='text-xs text-slate-500 font-medium'>
                Showing <span className='font-bold text-slate-800'>{startRecord}</span> to{' '}
                <span className='font-bold text-slate-800'>{endRecord}</span> of{' '}
                <span className='font-bold text-slate-800'>{filteredAssignments.length}</span> assignments
              </div>

              {totalPages > 1 && (
                <div className='flex items-center gap-1.5'>
                  <Button
                    variant='outline'
                    size='sm'
                    disabled={currentPage === 1}
                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                    className='h-8 px-2.5 rounded-lg text-xs font-semibold text-slate-600 border-slate-200 hover:bg-white disabled:opacity-40 shadow-2xs cursor-pointer'
                  >
                    <ChevronLeft className='w-4 h-4 mr-0.5' /> Prev
                  </Button>

                  <div className='flex items-center gap-1'>
                    {Array.from({ length: totalPages }, (_, i) => i + 1).map((pageNum) => (
                      <button
                        type='button'
                        key={pageNum}
                        onClick={() => setCurrentPage(pageNum)}
                        className={cn(
                          'w-8 h-8 rounded-lg text-xs font-bold transition-all cursor-pointer',
                          currentPage === pageNum
                            ? 'bg-indigo-600 text-white shadow-xs'
                            : 'text-slate-600 hover:bg-slate-200/70',
                        )}
                      >
                        {pageNum}
                      </button>
                    ))}
                  </div>

                  <Button
                    variant='outline'
                    size='sm'
                    disabled={currentPage === totalPages}
                    onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                    className='h-8 px-2.5 rounded-lg text-xs font-semibold text-slate-600 border-slate-200 hover:bg-white disabled:opacity-40 shadow-2xs cursor-pointer'
                  >
                    Next <ChevronRight className='w-4 h-4 ml-0.5' />
                  </Button>
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* Evaluation Results Feedback Modal */}
      <StudentAssignmentFeedbackModal
        isOpen={feedbackModalOpen}
        onClose={() => setFeedbackModalOpen(false)}
        assignment={selectedAssignment}
      />
    </div>
  );
};
