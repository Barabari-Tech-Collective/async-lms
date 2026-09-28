import { useEffect, useRef, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Trophy,
  Users,
  Loader2,
  ChevronLeft,
  ChevronRight,
  Flame,
} from 'lucide-react';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { cn } from '@/lib/utils';
import { useAppSelector } from '@/app/hooks';
import { selectUser } from '@/features/auth/authSelectors';
import {
  useOverallLeaderboard,
  useWeeklyLeaderboard,
  useCollegeLeaderboard,
} from '@/hooks/queries/useLeaderboard';

interface LeaderboardEntry {
  user_id: string;
  full_name: string;
  email?: string;
  college_name?: string;
  total_points: number;
  rank: number;
}

interface MyRank {
  rank: number;
  total_points: number;
}

const rankMessage = (rank: number) => {
  if (rank === 1) return "You're #1";
  if (rank <= 3) return 'So close to the top!';
  return 'Keep climbing!';
};

const RankPanel = ({
  myRank,
  onJumpToMe,
}: {
  myRank?: MyRank | null;
  onJumpToMe?: () => void;
}) => {
  if (!myRank) return <div />;
  return (
    <button
      onClick={onJumpToMe}
      className='flex items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm hover:shadow-md transition-shadow text-left'
    >
      <div className='flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-600 text-white font-bold text-xs shrink-0'>
        #{myRank.rank}
      </div>
      <div>
        <p className='text-sm font-bold text-slate-900 leading-tight flex items-center gap-1.5'>
          Your Rank
          <span className='inline-flex items-center gap-0.5 rounded-full bg-indigo-600 text-white text-[11px] font-bold px-2 py-0.5'>
            {rankMessage(myRank.rank)}
            <ChevronRight className='h-3 w-3' />
          </span>
        </p>
        <p className='text-xs text-slate-500 mt-0.5'>
          <span className='font-bold text-slate-900'>{myRank.total_points}</span> total points
        </p>
      </div>
    </button>
  );
};

interface Pagination {
  page: number;
  pageSize: number;
  totalCount: number;
  totalPages: number;
}

const getInitials = (name: string) =>
  name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2);

type TabKey = 'overall' | 'weekly' | 'college';

const tabMeta: Record<TabKey, { label: string; shortLabel: string; icon: typeof Trophy; hint: string }> = {
  overall: { label: 'Overall', shortLabel: 'Overall', icon: Trophy, hint: 'All-time points' },
  weekly: { label: 'This Week', shortLabel: 'Weekly', icon: Flame, hint: 'Points since Monday' },
  college: { label: 'My College', shortLabel: 'College', icon: Users, hint: 'Ranked within your college' },
};

const podiumStyle = [
  {
    border: 'border-2 border-yellow-400',
    numberBg: 'bg-yellow-400',
    ring: 'ring-4 ring-yellow-200',
    pillBg: 'bg-yellow-50',
    pillText: 'text-yellow-700',
    order: 'md:order-2',
    height: 'md:pt-0 md:pb-6',
    scale: 'md:scale-105',
  },
  {
    border: 'border border-slate-100',
    numberBg: 'bg-slate-400',
    ring: 'ring-4 ring-slate-200',
    pillBg: 'bg-slate-100',
    pillText: 'text-slate-600',
    order: 'md:order-1',
    height: 'md:pt-6',
    scale: '',
  },
  {
    border: 'border border-slate-100',
    numberBg: 'bg-amber-600',
    ring: 'ring-4 ring-amber-100',
    pillBg: 'bg-amber-50',
    pillText: 'text-amber-700',
    order: 'md:order-3',
    height: 'md:pt-6',
    scale: '',
  },
];

const LeaderboardTable = ({
  data = [],
  isLoading,
  pagination,
  onPageChange,
  currentUserId,
  scrollSignal,
}: {
  data?: LeaderboardEntry[];
  isLoading: boolean;
  pagination?: Pagination;
  onPageChange: (page: number) => void;
  currentUserId?: string | number;
  scrollSignal?: number;
}) => {
  const rowRefs = useRef<Record<string, HTMLElement | null>>({});

  useEffect(() => {
    if (!scrollSignal || !currentUserId) return;
    const row = rowRefs.current[String(currentUserId)];
    row?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [scrollSignal, currentUserId, data]);

  if (isLoading && !data.length) {
    return (
      <div className='flex flex-col items-center justify-center gap-3 py-24'>
        <Loader2 className='h-8 w-8 animate-spin text-indigo-600' />
        <p className='text-slate-400 text-sm'>Loading leaderboard...</p>
      </div>
    );
  }

  if (!data.length) {
    return (
      <Card className='border-none shadow-sm'>
        <CardContent className='flex flex-col items-center justify-center gap-3 py-20 text-center'>
          <Trophy className='h-10 w-10 text-slate-300' />
          <p className='text-slate-500 font-medium'>No data available yet</p>
        </CardContent>
      </Card>
    );
  }

  const isFirstPage = !pagination || pagination.page === 1;
  const top3 = isFirstPage ? data.slice(0, 3) : [];
  const rest = isFirstPage ? data.slice(3) : data;

  return (
    <div className='space-y-6'>
      {top3.length > 0 && (
        <div className='grid gap-5 md:grid-cols-3 items-end pt-4'>
          {top3.map((entry, index) => {
            const style = podiumStyle[index];
            const isMe = currentUserId !== undefined && String(entry.user_id) === String(currentUserId);
            return (
              <div
                key={entry.user_id}
                ref={(el) => {
                  rowRefs.current[String(entry.user_id)] = el;
                }}
                className={cn('relative', style.order, style.height, style.scale)}
              >
                <span
                  className={cn(
                    'absolute -top-3.5 left-1/2 -translate-x-1/2 z-10 flex h-7 w-7 items-center justify-center rounded-full text-white text-xs font-extrabold',
                    style.numberBg,
                  )}
                >
                  {entry.rank}
                </span>

                <Card
                  className={cn(
                    'relative overflow-hidden shadow-sm transition-all duration-300 hover:-translate-y-1',
                    style.border,
                  )}
                >
                  <CardContent className='relative pt-8 pb-6 flex flex-col items-center text-center'>
                    <Avatar className={`h-16 w-16 mb-4 ${style.ring}`}>
                      <AvatarFallback className='bg-indigo-50 text-indigo-600 font-bold text-lg'>
                        {getInitials(entry.full_name)}
                      </AvatarFallback>
                    </Avatar>

                    <h3 className='mb-0.5 font-bold text-slate-900 truncate max-w-full flex items-center gap-1.5'>
                      {entry.full_name}
                      {isMe && (
                        <span className='text-[9px] font-extrabold uppercase tracking-widest bg-indigo-600 text-white px-1.5 py-0.5 rounded-full'>
                          You
                        </span>
                      )}
                    </h3>
                    {entry.college_name && (
                      <p className='mb-3 text-xs text-muted-foreground truncate max-w-full'>
                        {entry.college_name}
                      </p>
                    )}

                    <div
                      className={cn(
                        'flex items-baseline gap-1 rounded-full px-4 py-1.5',
                        style.pillBg,
                      )}
                    >
                      <p className={cn('text-2xl font-extrabold', style.pillText)}>
                        {entry.total_points}
                      </p>
                      <span className={cn('text-[10px] uppercase font-bold tracking-widest', style.pillText, 'opacity-60')}>
                        pts
                      </span>
                    </div>
                  </CardContent>
                </Card>
              </div>
            );
          })}
        </div>
      )}

      {rest.length > 0 && (
        <Card className='border-none shadow-sm overflow-hidden'>
          {/* Mobile View (< md): Clean rows with zero horizontal scroll */}
          <div className='md:hidden divide-y divide-slate-100'>
            {rest.map((entry) => {
              const isMe =
                currentUserId !== undefined &&
                String(entry.user_id) === String(currentUserId);
              return (
                <div
                  key={entry.user_id}
                  ref={(el) => {
                    rowRefs.current[String(entry.user_id)] = el;
                  }}
                  className={cn(
                    'p-3.5 flex items-center justify-between gap-3 transition-colors',
                    isMe ? 'bg-indigo-50/70' : 'hover:bg-slate-50',
                  )}
                >
                  <div className='flex items-center gap-2.5 min-w-0 flex-1'>
                    <span className='text-xs font-extrabold text-slate-400 w-6 shrink-0 text-left'>
                      #{entry.rank}
                    </span>
                    <Avatar className={cn('h-8 w-8 shrink-0 ring-2 ring-white shadow-xs', isMe && 'ring-indigo-400')}>
                      <AvatarFallback className='bg-indigo-50 text-indigo-600 text-xs font-bold'>
                        {getInitials(entry.full_name)}
                      </AvatarFallback>
                    </Avatar>
                    <div className='min-w-0 flex-1'>
                      <p className='font-bold text-slate-900 text-xs truncate flex items-center gap-1.5'>
                        <span className='truncate'>{entry.full_name}</span>
                        {isMe && (
                          <span className='text-[8px] font-extrabold uppercase tracking-wider bg-indigo-600 text-white px-1.5 py-0.2 rounded-full shrink-0'>
                            You
                          </span>
                        )}
                      </p>
                      {entry.college_name && (
                        <p className='text-[10px] text-muted-foreground truncate mt-0.5'>
                          {entry.college_name}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className='bg-indigo-50 text-indigo-600 font-bold text-xs px-2.5 py-1 rounded-full shrink-0 flex items-baseline gap-1 border border-indigo-100/60'>
                    <span>{entry.total_points}</span>
                    <span className='text-[9px] uppercase tracking-wider opacity-70 font-semibold'>pts</span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Desktop View (>= md): Full Table */}
          <div className='hidden md:block overflow-x-auto'>
            <table className='w-full text-sm'>
              <thead>
                <tr className='border-b border-slate-100'>
                  <th className='px-6 py-3 text-left text-[10px] font-bold uppercase tracking-widest text-slate-400'>
                    Rank
                  </th>
                  <th className='px-6 py-3 text-left text-[10px] font-bold uppercase tracking-widest text-slate-400'>
                    Student
                  </th>
                  {rest[0]?.college_name && (
                    <th className='px-6 py-3 text-left text-[10px] font-bold uppercase tracking-widest text-slate-400'>
                      College
                    </th>
                  )}
                  <th className='px-6 py-3 text-right text-[10px] font-bold uppercase tracking-widest text-slate-400'>
                    Points
                  </th>
                </tr>
              </thead>
              <tbody className='divide-y divide-slate-50'>
                {rest.map((entry) => {
                  const isMe =
                    currentUserId !== undefined &&
                    String(entry.user_id) === String(currentUserId);
                  return (
                    <tr
                      key={entry.user_id}
                      ref={(el) => {
                        rowRefs.current[String(entry.user_id)] = el;
                      }}
                      className={cn(
                        'transition-colors group scroll-mt-24',
                        isMe
                          ? 'bg-indigo-50/70 hover:bg-indigo-50'
                          : 'hover:bg-indigo-50/40',
                      )}
                    >
                      <td className='whitespace-nowrap px-6 py-4 font-bold text-slate-400 group-hover:text-indigo-600 transition-colors'>
                        #{entry.rank}
                      </td>
                      <td className='whitespace-nowrap px-6 py-4'>
                        <div className='flex items-center gap-3'>
                          <Avatar
                            className={cn(
                              'h-9 w-9 ring-2 ring-white shadow-sm',
                              isMe && 'ring-2 ring-indigo-400',
                            )}
                          >
                            <AvatarFallback className='bg-indigo-50 text-indigo-600 text-xs font-bold'>
                              {getInitials(entry.full_name)}
                            </AvatarFallback>
                          </Avatar>
                          <p className='font-bold text-slate-900'>
                            {entry.full_name}
                          </p>
                          {isMe && (
                            <span className='text-[9px] font-extrabold uppercase tracking-widest bg-indigo-600 text-white px-1.5 py-0.5 rounded-full'>
                              You
                            </span>
                          )}
                        </div>
                      </td>
                      {entry.college_name && (
                        <td className='whitespace-nowrap px-6 py-4 text-muted-foreground'>
                          {entry.college_name}
                        </td>
                      )}
                      <td className='whitespace-nowrap px-6 py-4 text-right'>
                        <span className='inline-flex items-center rounded-full bg-indigo-50 px-3 py-1 font-bold text-indigo-600'>
                          {entry.total_points}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {pagination && pagination.totalPages > 1 && (
        <div className='flex items-center justify-between px-1'>
          <p className='text-xs text-muted-foreground'>
            Page {pagination.page} of {pagination.totalPages} &middot;{' '}
            {pagination.totalCount} students
          </p>
          <div className='flex items-center gap-2'>
            <Button
              variant='outline'
              size='sm'
              disabled={pagination.page <= 1 || isLoading}
              onClick={() => onPageChange(pagination.page - 1)}
              className='rounded-xl'
            >
              <ChevronLeft className='h-4 w-4 mr-1' />
              Prev
            </Button>
            <Button
              variant='outline'
              size='sm'
              disabled={pagination.page >= pagination.totalPages || isLoading}
              onClick={() => onPageChange(pagination.page + 1)}
              className='rounded-xl'
            >
              Next
              <ChevronRight className='h-4 w-4 ml-1' />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};

const Leaderboard = () => {
  const [activeTab, setActiveTab] = useState<TabKey>('overall');
  const [overallPage, setOverallPage] = useState(1);
  const [weeklyPage, setWeeklyPage] = useState(1);
  const [collegePage, setCollegePage] = useState(1);

  const { data: overall, isLoading: loadingOverall } = useOverallLeaderboard(overallPage);
  const { data: weekly, isLoading: loadingWeekly } = useWeeklyLeaderboard(weeklyPage);
  const { data: college, isLoading: loadingCollege } = useCollegeLeaderboard(collegePage);

  const byTab: Record<
    TabKey,
    { data: typeof overall; isLoading: boolean; page: number; setPage: (p: number) => void }
  > = {
    overall: { data: overall, isLoading: loadingOverall, page: overallPage, setPage: setOverallPage },
    weekly: { data: weekly, isLoading: loadingWeekly, page: weeklyPage, setPage: setWeeklyPage },
    college: { data: college, isLoading: loadingCollege, page: collegePage, setPage: setCollegePage },
  };

  const current = byTab[activeTab];
  const user = useAppSelector(selectUser);

  const tabRank: Record<TabKey, number | undefined> = {
    overall: overall?.my_rank?.rank,
    weekly: weekly?.my_rank?.rank,
    college: college?.my_rank?.rank,
  };

  const [jumpToken, setJumpToken] = useState(0);

  const handleJumpToMe = () => {
    const rank = current.data?.my_rank?.rank;
    if (!rank) return;
    const pageSize = current.data?.pagination?.pageSize ?? 20;
    const targetPage = Math.max(1, Math.ceil(rank / pageSize));
    if (current.page !== targetPage) current.setPage(targetPage);
    setJumpToken((t) => t + 1);
  };

  return (
    <main className='flex-1 space-y-5 sm:space-y-6 p-3.5 sm:p-6 md:p-8 pt-4 sm:pt-6 max-w-6xl mx-auto'>
      <div>
        <h1 className='text-2xl sm:text-3xl font-bold tracking-tight text-slate-900'>Leaderboard</h1>
        <p className='text-muted-foreground mt-1 text-xs sm:text-sm'>
          See how you stack up against fellow students
        </p>
      </div>

      <div className='flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3'>
        <div className='grid grid-cols-3 sm:inline-flex items-center gap-1 rounded-xl sm:rounded-2xl bg-slate-100 p-1 w-full sm:w-auto shrink-0'>
          {(Object.keys(tabMeta) as TabKey[]).map((key) => {
            const Icon = tabMeta[key].icon;
            const isActive = activeTab === key;
            const rank = tabRank[key];
            return (
              <button
                key={key}
                onClick={() => setActiveTab(key)}
                className={cn(
                  'flex items-center justify-center gap-1 sm:gap-2 px-1.5 sm:px-4 py-2 sm:py-2.5 rounded-lg sm:rounded-xl text-[11px] sm:text-sm font-bold transition-all min-h-[38px]',
                  isActive
                    ? 'bg-[#1e293b] text-white shadow-md'
                    : 'text-slate-500 hover:text-slate-800',
                )}
              >
                <Icon className={cn('h-3.5 w-3.5 sm:h-4 sm:w-4 shrink-0', isActive ? 'text-yellow-400' : 'text-slate-400')} />
                <span className='truncate hidden xs:inline sm:inline'>{tabMeta[key].label}</span>
                <span className='truncate xs:hidden sm:hidden'>{tabMeta[key].shortLabel}</span>
                {rank !== undefined && (
                  <span
                    className={cn(
                      'text-[9px] sm:text-[11px] font-extrabold px-1 sm:px-1.5 py-0.2 sm:py-0.5 rounded-full shrink-0',
                      isActive ? 'bg-white/20 text-white' : 'bg-white text-slate-500',
                    )}
                  >
                    #{rank}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        <RankPanel myRank={current.data?.my_rank} onJumpToMe={handleJumpToMe} />
      </div>

      <LeaderboardTable
        data={current.data?.leaderboard}
        isLoading={current.isLoading}
        pagination={current.data?.pagination}
        onPageChange={current.setPage}
        currentUserId={user?.id}
        scrollSignal={jumpToken}
      />
    </main>
  );
};

export default Leaderboard;
