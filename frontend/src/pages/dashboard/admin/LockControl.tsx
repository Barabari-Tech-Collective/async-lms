import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  BookOpen,
  Building2,
  Calendar,
  ChevronDown,
  ChevronRight,
  GraduationCap,
  Lock,
  Search,
  ShieldCheck,
  Unlock,
  Loader2,
  Users2,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { getErrorMessage } from '@/lib/utils';

import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import apiClient from '@/services/api';
import type { College, Subject, SubjectListResponse } from '@/utils/types';

interface LockSubtopic {
  id: string;
  title: string;
  slug: string;
  order_index: number;
  content_type: 'video' | 'markdown' | 'external' | null;
  unlocked_count: number;
  completed_count: number;
  is_unlocked: boolean;
}

interface LockUnit {
  id: string;
  title: string;
  order_index: number;
  subtopics: LockSubtopic[];
}

interface LockTopic {
  id: string;
  title: string;
  order_index: number;
  units?: LockUnit[];
  subtopics: LockSubtopic[]; // Flattened for display
}

interface LockOverview {
  cohort_size: number;
  completion_rate: number;
  total_subtopics: number;
  completed_subtopics: number;
  topics: LockTopic[];
}

interface LockOverviewResponse {
  success: boolean;
  data: LockOverview;
}

interface LockBatchesResponse {
  success: boolean;
  data: number[];
}

const LockControl = () => {
  const [colleges, setColleges] = useState<College[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [batches, setBatches] = useState<number[]>([]);

  const [selectedCollegeId, setSelectedCollegeId] = useState<string>('all');
  const [selectedBatch, setSelectedBatch] = useState<string>('all');
  const [selectedSubjectId, setSelectedSubjectId] = useState<string>('');

  const [overview, setOverview] = useState<LockOverview | null>(null);
  const [loadingOverview, setLoadingOverview] = useState(true);
  const [loadingFilters, setLoadingFilters] = useState(true);
  const [topicLoadingIds, setTopicLoadingIds] = useState<string[]>([]);
  const [subtopicLoadingIds, setSubtopicLoadingIds] = useState<string[]>([]);
  const [expandedTopics, setExpandedTopics] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState('');

  const filterParams = useMemo(() => {
    const params: Record<string, string> = {};
    if (selectedCollegeId !== 'all') params.collegeId = selectedCollegeId;
    if (selectedBatch !== 'all') params.batch = selectedBatch;
    if (selectedSubjectId) params.subjectId = selectedSubjectId;
    return params;
  }, [selectedCollegeId, selectedBatch, selectedSubjectId]);

  const fetchFilters = useCallback(async () => {
    try {
      setLoadingFilters(true);
      const [collegeRes, subjectRes] = await Promise.all([
        apiClient.get<{ data: College[] }>('/colleges'),
        apiClient.get<SubjectListResponse>('/subjects'),
      ]);

      setColleges(collegeRes.data.data);
      setSubjects(subjectRes.data.data);

      if (!selectedSubjectId && subjectRes.data.data.length > 0) {
        setSelectedSubjectId(subjectRes.data.data[0].id);
      }
    } catch (error) {
      toast.error(getErrorMessage(error, 'Failed to load lock control filters'));
    } finally {
      setLoadingFilters(false);
    }
  }, [selectedSubjectId]);

  const fetchBatches = useCallback(async () => {
    try {
      const res = await apiClient.get<LockBatchesResponse>(
        '/admin/lock-control/batches',
        {
          params:
            selectedCollegeId === 'all' ? {} : { collegeId: selectedCollegeId },
        },
      );
      setBatches(res.data.data);
      if (
        selectedBatch !== 'all' &&
        !res.data.data.includes(Number(selectedBatch))
      ) {
        setSelectedBatch('all');
      }
    } catch (error) {
      toast.error(getErrorMessage(error, 'Failed to load batches'));
    }
  }, [selectedCollegeId, selectedBatch]);

  const fetchOverview = useCallback(async () => {
    if (!selectedSubjectId) return;

    try {
      setLoadingOverview(true);
      const res = await apiClient.get<LockOverviewResponse>(
        '/admin/lock-control/overview',
        { params: filterParams },
      );
      const raw = res.data.data;
      if (raw && Array.isArray(raw.topics)) {
        const normalizedTopics: LockTopic[] = raw.topics.map((t) => ({
          ...t,
          subtopics: (Array.isArray(t.subtopics) && t.subtopics.length > 0)
            ? t.subtopics
            : (t.units || []).flatMap((u) => u.subtopics || []),
        }));
        setOverview({
          ...raw,
          topics: normalizedTopics,
        });
      } else {
        setOverview(raw || null);
      }
    } catch (error) {
      toast.error(getErrorMessage(error, 'Failed to load lock control overview'));
    } finally {
      setLoadingOverview(false);
    }
  }, [filterParams, selectedSubjectId]);

  useEffect(() => {
    fetchFilters();
  }, [fetchFilters]);

  useEffect(() => {
    fetchBatches();
  }, [fetchBatches]);

  useEffect(() => {
    if (selectedSubjectId) {
      fetchOverview();
    }
  }, [fetchOverview, selectedSubjectId]);

  const stats = useMemo(() => {
    if (!overview || !Array.isArray(overview.topics)) {
      return {
        completionRate: 0,
        lockedTopics: 0,
        unlockedTopics: 0,
      };
    }

    const totalTopics = overview.topics.length;
    const fullyUnlockedTopics = overview.topics.filter((topic) => {
      const subs = Array.isArray(topic.subtopics)
        ? topic.subtopics
        : (topic.units || []).flatMap((u) => u.subtopics || []);
      return subs.length > 0 && subs.every((subtopic) => subtopic.is_unlocked);
    }).length;

    return {
      completionRate: Math.round(overview.completion_rate || 0),
      lockedTopics: totalTopics - fullyUnlockedTopics,
      unlockedTopics: fullyUnlockedTopics,
    };
  }, [overview]);

  const filteredTopics = useMemo(() => {
    if (!overview?.topics || !Array.isArray(overview.topics)) return [];
    if (!searchQuery.trim()) return overview.topics;

    const query = searchQuery.toLowerCase();
    return overview.topics.filter((topic) => {
      const subs = Array.isArray(topic.subtopics)
        ? topic.subtopics
        : (topic.units || []).flatMap((u) => u.subtopics || []);
      return (
        topic.title.toLowerCase().includes(query) ||
        subs.some((subtopic) =>
          subtopic.title.toLowerCase().includes(query),
        )
      );
    });
  }, [overview, searchQuery]);

  const handleTopicToggle = async (topicId: string, unlock: boolean) => {
    try {
      setTopicLoadingIds((prev) => [...prev, topicId]);
      const action = unlock ? 'unlock' : 'lock';
      await apiClient.post(
        `/admin/lock-control/topics/${topicId}/${action}`,
        { unlock, ...filterParams },
        { params: filterParams },
      );

      toast.success(
        unlock ? 'Topic unlocked for cohort' : 'Topic locked for cohort',
      );
      await fetchOverview();
    } catch (error) {
      toast.error(getErrorMessage(error, 'Failed to update topic lock'));
    } finally {
      setTopicLoadingIds((prev) => prev.filter((id) => id !== topicId));
    }
  };

  const handleSubtopicToggle = async (subtopicId: string, unlock: boolean) => {
    try {
      setSubtopicLoadingIds((prev) => [...prev, subtopicId]);
      const action = unlock ? 'unlock' : 'lock';
      await apiClient.post(
        `/admin/lock-control/subtopics/${subtopicId}/${action}`,
        { unlock, ...filterParams },
        { params: filterParams },
      );

      toast.success(
        unlock ? 'Subtopic unlocked for cohort' : 'Subtopic locked for cohort',
      );
      await fetchOverview();
    } catch (error) {
      toast.error(getErrorMessage(error, 'Failed to update subtopic lock'));
    } finally {
      setSubtopicLoadingIds((prev) => prev.filter((id) => id !== subtopicId));
    }
  };

  return (
    <div className='space-y-4 sm:space-y-6 min-w-0 animate-in fade-in duration-300'>
      {/* Stats */}
      <div className='grid grid-cols-3 gap-2 sm:gap-4'>
        <Card className='border border-slate-200/80 shadow-xs rounded-2xl bg-white'>
          <CardContent className='p-2.5 sm:p-5 flex flex-col sm:flex-row items-center sm:justify-between text-center sm:text-left gap-1 sm:gap-3'>
            <div className='min-w-0'>
              <p className='text-[10px] sm:text-sm font-semibold text-slate-500 truncate'>
                Progress
              </p>
              <h3 className='text-base sm:text-2xl font-bold text-slate-900 tracking-tight'>
                {stats.completionRate}%
              </h3>
              <p className='text-[9px] sm:text-xs text-slate-400 hidden sm:block mt-0.5'>Completion Rate</p>
            </div>
            <div className='bg-blue-50 p-2 sm:p-3 rounded-xl sm:rounded-2xl shrink-0'>
              <GraduationCap className='w-4 h-4 sm:w-5 sm:h-5 text-blue-600' />
            </div>
          </CardContent>
        </Card>

        <Card className='border border-slate-200/80 shadow-xs rounded-2xl bg-white'>
          <CardContent className='p-2.5 sm:p-5 flex flex-col sm:flex-row items-center sm:justify-between text-center sm:text-left gap-1 sm:gap-3'>
            <div className='min-w-0'>
              <p className='text-[10px] sm:text-sm font-semibold text-red-500 truncate'>
                Locked
              </p>
              <h3 className='text-base sm:text-2xl font-bold text-slate-900 tracking-tight'>
                {stats.lockedTopics}
              </h3>
              <p className='text-[9px] sm:text-xs text-slate-400 hidden sm:block mt-0.5'>Cannot access</p>
            </div>
            <div className='bg-red-50 p-2.5 sm:p-3 rounded-xl sm:rounded-2xl shrink-0'>
              <Lock className='w-4 h-4 sm:w-5 sm:h-5 text-red-500' />
            </div>
          </CardContent>
        </Card>

        <Card className='border border-slate-200/80 shadow-xs rounded-2xl bg-white'>
          <CardContent className='p-2.5 sm:p-5 flex flex-col sm:flex-row items-center sm:justify-between text-center sm:text-left gap-1 sm:gap-3'>
            <div className='min-w-0'>
              <p className='text-[10px] sm:text-sm font-semibold text-emerald-600 truncate'>
                Unlocked
              </p>
              <h3 className='text-base sm:text-2xl font-bold text-slate-900 tracking-tight'>
                {stats.unlockedTopics}
              </h3>
              <p className='text-[9px] sm:text-xs text-slate-400 hidden sm:block mt-0.5'>Available</p>
            </div>
            <div className='bg-emerald-50 p-2.5 sm:p-3 rounded-xl sm:rounded-2xl shrink-0'>
              <Unlock className='w-4 h-4 sm:w-5 sm:h-5 text-emerald-600' />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card className='border border-slate-200/80 shadow-xs rounded-2xl overflow-hidden bg-white min-w-0'>
        <div className='flex items-center gap-2.5 sm:gap-3 px-3.5 sm:px-5 py-3 sm:py-3.5 border-b border-slate-100 bg-slate-50/60'>
          <div className='bg-indigo-50 text-indigo-600 p-1.5 sm:p-2 rounded-xl shrink-0 border border-indigo-100'>
            <ShieldCheck className='w-3.5 h-3.5 sm:w-4 sm:h-4' />
          </div>
          <div className='min-w-0'>
            <h3 className='text-xs sm:text-sm font-bold text-slate-900 tracking-tight'>Cohort Class Controls</h3>
            <p className='text-[10px] sm:text-[11px] text-slate-400 truncate'>Manage topic access and schedule by cohort</p>
          </div>
        </div>

        <CardContent className='p-3.5 sm:p-5'>
          <div className='grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3'>
            <div className='flex flex-col gap-1 sm:gap-1.5'>
              <label className='flex items-center gap-1 sm:gap-1.5 text-[10px] sm:text-[11px] font-semibold text-slate-400 uppercase tracking-wider truncate'>
                <Building2 className='w-3 h-3 shrink-0' />
                College
              </label>
              <Select
                value={selectedCollegeId}
                onValueChange={setSelectedCollegeId}
                disabled={loadingFilters}
              >
                <SelectTrigger className='w-full bg-white border-slate-200 shadow-xs h-9 sm:h-10 rounded-xl text-xs sm:text-sm'>
                  <SelectValue placeholder='Select college' />
                </SelectTrigger>
                <SelectContent className='rounded-xl shadow-lg border-slate-200 max-h-60'>
                  <SelectItem value='all'>All Colleges</SelectItem>
                  {colleges.map((college) => (
                    <SelectItem key={college.id} value={college.id}>
                      {college.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className='flex flex-col gap-1 sm:gap-1.5'>
              <label className='flex items-center gap-1 sm:gap-1.5 text-[10px] sm:text-[11px] font-semibold text-slate-400 uppercase tracking-wider truncate'>
                <Users2 className='w-3 h-3 shrink-0' />
                Batch
              </label>
              <Select
                value={selectedBatch}
                onValueChange={setSelectedBatch}
                disabled={loadingFilters}
              >
                <SelectTrigger className='w-full bg-white border-slate-200 shadow-xs h-9 sm:h-10 rounded-xl text-xs sm:text-sm'>
                  <SelectValue placeholder='Select batch' />
                </SelectTrigger>
                <SelectContent className='rounded-xl shadow-lg border-slate-200 max-h-60'>
                  <SelectItem value='all'>All Batches</SelectItem>
                  {batches.map((batch) => (
                    <SelectItem key={batch} value={String(batch)}>
                      Batch {batch}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className='flex flex-col gap-1 sm:gap-1.5'>
              <label className='flex items-center gap-1.5 text-[10px] sm:text-[11px] font-semibold text-slate-400 uppercase tracking-wider truncate'>
                <BookOpen className='w-3 h-3 shrink-0' />
                Subject
              </label>
              <Select
                value={selectedSubjectId}
                onValueChange={setSelectedSubjectId}
                disabled={loadingFilters}
              >
                <SelectTrigger className='w-full bg-white border-slate-200 shadow-xs h-9 sm:h-10 rounded-xl text-xs sm:text-sm'>
                  <SelectValue placeholder='Select subject' />
                </SelectTrigger>
                <SelectContent className='rounded-xl shadow-lg border-slate-200 max-h-60'>
                  {subjects.map((subject) => (
                    <SelectItem key={subject.id} value={subject.id}>
                      {subject.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className='flex flex-col gap-1 sm:gap-1.5'>
              <label className='flex items-center gap-1.5 text-[10px] sm:text-[11px] font-semibold text-slate-400 uppercase tracking-wider truncate'>
                <Search className='w-3 h-3 shrink-0' />
                Search
              </label>
              <div className='relative'>
                <Search className='absolute left-2.5 sm:left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 sm:w-4 sm:h-4 text-slate-400' />
                <Input
                  placeholder='Find topic...'
                  className='pl-8 sm:pl-9 bg-white border-slate-200 shadow-xs h-9 sm:h-10 rounded-xl text-xs sm:text-sm'
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Topics */}
      {loadingOverview ? (
        <div className='flex items-center justify-center py-20 bg-white rounded-2xl border border-slate-200/80'>
          <Loader2 className='w-8 h-8 animate-spin text-indigo-500' />
        </div>
      ) : !overview || filteredTopics.length === 0 ? (
        <Card className='border border-slate-200/80 shadow-xs rounded-2xl bg-white'>
          <CardContent className='p-12 sm:p-16 text-center text-slate-400 text-xs sm:text-sm'>
            No topics found for this selection.
          </CardContent>
        </Card>
      ) : (
        <div className='space-y-3 sm:space-y-4'>
          {filteredTopics.map((topic) => {
            const isExpanded = expandedTopics.includes(topic.id);
            const topicSubtopics = Array.isArray(topic.subtopics)
              ? topic.subtopics
              : (topic.units || []).flatMap((u) => u.subtopics || []);
            const unlockedSubtopics = topicSubtopics.filter(
              (subtopic) => subtopic.is_unlocked,
            ).length;
            const progress =
              topicSubtopics.length > 0
                ? Math.round((unlockedSubtopics / topicSubtopics.length) * 100)
                : 0;
            const fullyUnlocked =
              topicSubtopics.length > 0 &&
              topicSubtopics.every((subtopic) => subtopic.is_unlocked);
            const topicLoading = topicLoadingIds.includes(topic.id);

            return (
              <Card key={topic.id} className='border border-slate-200/80 shadow-xs rounded-2xl overflow-hidden bg-white'>
                <CardContent className='p-0'>
                  <div className='p-3.5 sm:p-5 border-b border-slate-100'>
                    <div className='flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 sm:gap-4'>
                      <div className='flex items-center gap-2 sm:gap-3 min-w-0'>
                        <button
                          className='p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition shrink-0 min-h-[30px] min-w-[30px] flex items-center justify-center'
                          onClick={() =>
                            setExpandedTopics((prev) =>
                              prev.includes(topic.id)
                                ? prev.filter((id) => id !== topic.id)
                                : [...prev, topic.id],
                            )
                          }
                          aria-label='Toggle topic'
                        >
                          {isExpanded ? (
                            <ChevronDown className='w-4 h-4' />
                          ) : (
                            <ChevronRight className='w-4 h-4' />
                          )}
                        </button>
                        <div className='min-w-0 flex-1'>
                          <p className='text-xs sm:text-sm font-bold text-slate-800 tracking-tight truncate'>
                            {topic.title}
                          </p>
                          <p className='text-[10px] sm:text-xs text-slate-500 font-medium'>
                            {unlockedSubtopics}/{topicSubtopics.length} Subtopics Unlocked
                          </p>
                        </div>
                      </div>

                      <div className='flex items-center gap-2.5 sm:gap-3 justify-between sm:justify-end pl-8 sm:pl-0'>
                        <div className='w-24 sm:w-36 bg-slate-100 rounded-full h-2 overflow-hidden shrink-0'>
                          <div
                            className='h-full bg-emerald-500 transition-all duration-500'
                            style={{ width: `${progress}%` }}
                          />
                        </div>
                        <button
                          disabled={topicLoading}
                          onClick={() => handleTopicToggle(topic.id, !fullyUnlocked)}
                          className={`inline-flex items-center gap-1.5 rounded-xl border px-2.5 sm:px-3 py-1 sm:py-1.5 text-[11px] sm:text-xs font-semibold transition-colors disabled:opacity-50 disabled:pointer-events-none shrink-0 min-h-[30px] sm:min-h-[34px] ${
                            fullyUnlocked
                              ? 'border-red-200 text-red-600 bg-red-50/50 hover:bg-red-50 hover:border-red-300'
                              : 'border-emerald-200 text-emerald-700 bg-emerald-50/50 hover:bg-emerald-50 hover:border-emerald-300'
                          }`}
                        >
                          {topicLoading ? (
                            <Loader2 className='w-3.5 h-3.5 animate-spin' />
                          ) : fullyUnlocked ? (
                            'Lock Unit'
                          ) : (
                            'Unlock Unit'
                          )}
                        </button>
                      </div>
                    </div>
                  </div>

                  {isExpanded && (
                    <div className='divide-y divide-slate-100 bg-slate-50/40'>
                      {topicSubtopics.map((subtopic) => {
                        const subtopicLoading = subtopicLoadingIds.includes(
                          subtopic.id,
                        );
                        const isUnlocked = subtopic.is_unlocked;

                        return (
                          <div
                            key={subtopic.id}
                            className='flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 p-3.5 sm:p-5'
                          >
                            <div className='flex items-center gap-2.5 sm:gap-4 min-w-0'>
                              <div className='bg-emerald-50 text-emerald-600 p-1.5 sm:p-2 rounded-xl shrink-0 border border-emerald-100'>
                                <BookOpen className='w-3.5 h-3.5 sm:w-4 sm:h-4' />
                              </div>
                              <div className='min-w-0'>
                                <p className='font-semibold text-slate-800 text-xs sm:text-sm truncate'>
                                  {subtopic.title}
                                </p>
                                <div className='flex items-center gap-2 mt-0.5'>
                                  <Badge className='bg-slate-100 text-slate-500 text-[10px] uppercase font-semibold border border-slate-200/60'>
                                    {subtopic.content_type === 'video'
                                      ? 'Video'
                                      : subtopic.content_type === 'external'
                                        ? 'Resource'
                                        : 'Reading'}
                                  </Badge>
                                </div>
                              </div>
                            </div>

                            <div className='flex items-center gap-3 sm:gap-4 justify-between sm:justify-end pl-9 sm:pl-0'>
                              <div className='flex items-center gap-1 text-slate-400 text-[11px] sm:text-xs font-medium'>
                                <Calendar className='w-3 h-3 sm:w-3.5 sm:h-3.5' />
                                <span>Schedule</span>
                              </div>
                              <div className='flex items-center gap-2'>
                                <span
                                  className={
                                    isUnlocked
                                      ? 'text-emerald-700 text-[11px] sm:text-xs font-semibold'
                                      : 'text-slate-400 text-[11px] sm:text-xs font-semibold'
                                  }
                                >
                                  {isUnlocked ? 'Unlocked' : 'Locked'}
                                </span>
                                <Switch
                                  checked={isUnlocked}
                                  disabled={subtopicLoading}
                                  onCheckedChange={(checked) =>
                                    handleSubtopicToggle(subtopic.id, checked)
                                  }
                                />
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default LockControl;
