import React, { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { isAxiosError } from 'axios';
import toast from 'react-hot-toast';
import { getFacilitatorAccess } from '@/services/attendance';
import type { UpcomingClass } from '@/services/attendance';
import { formatEventDate, formatEventTime } from '@/utils/dateFormat';

interface UpcomingEventsCardProps {
  events: UpcomingClass[];
  isLoading?: boolean;
}

export const UpcomingEventsCard: React.FC<UpcomingEventsCardProps> = ({
  events,
  isLoading,
}) => {
  const [joiningId, setJoiningId] = useState<string | null>(null);

  const handleJoinClass = async (classItem: UpcomingClass) => {
    setJoiningId(classItem.id);
    // Open the tab BEFORE the async call so the browser treats it as a
    // direct result of the click event — popup blockers ignore user-gesture-
    // initiated window.open calls even if the content is set after an await.
    const newTab = window.open('about:blank', '_blank');
    if (newTab) newTab.opener = null;
    try {
      const meetUrl = await getFacilitatorAccess(classItem.id);
      if (!meetUrl) {
        newTab?.close();
        toast.error('Google Meet space is not ready yet');
      } else if (newTab && !newTab.closed) {
        newTab.location.replace(meetUrl);
      } else {
        window.location.assign(meetUrl);
      }
    } catch (error) {
      newTab?.close();
      const message = isAxiosError<{ message?: string }>(error) ? error.response?.data.message : undefined;
      toast.error(message || 'Unable to join class');
    } finally {
      setJoiningId(null);
    }
  };

  return (
    <div className='bg-white rounded-3xl p-5 shadow-xs border border-slate-100/80 flex flex-col h-full'>
      {/* Header */}
      <div className='flex items-center justify-between mb-4'>
        <h3 className='text-base font-bold text-slate-900 tracking-tight'>
          Upcoming Events
        </h3>
      </div>

      {/* Events List */}
      <div className='flex flex-col gap-3'>
        {isLoading ? (
          Array.from({ length: 5 }).map((_, i) => (
            <div
              key={i}
              className='h-12 rounded-xl bg-slate-100 animate-pulse'
            />
          ))
        ) : events.length === 0 ? (
          <div className='py-8 text-center text-xs text-slate-400'>
            No upcoming events scheduled
          </div>
        ) : (
          events.slice(0, 5).map((item) => {
            const [time, ampm] = formatEventTime(item.scheduledStartAt).split(/\s+(?=[AP]M$)/);
            const dateStr = formatEventDate(item.scheduledStartAt);
            const isInProgress = item.status === 'active';

            const isJoinable = item.canJoin;

            const isJoining = joiningId === item.id;

            return (
              <div
                key={item.id}
                className='flex items-center justify-between gap-3 py-1.5'
              >
                {/* Time */}
                <div className='w-14 shrink-0 text-left'>
                  <span className='block text-xs font-bold text-slate-900 leading-tight'>
                    {time}
                  </span>
                  <span className='block text-[10px] font-semibold text-slate-400 leading-tight'>
                    {ampm}
                  </span>
                </div>

                {/* Event Details */}
                <div className='flex-1 min-w-0'>
                  {isInProgress && (
                    <span className='text-[10px] font-bold text-emerald-600 block leading-tight mb-0.5'>
                      In Progress
                    </span>
                  )}
                  <p className='text-xs font-bold text-slate-900 truncate leading-snug'>
                    {item.title}
                  </p>
                  <p className='text-[11px] text-slate-400 truncate leading-tight mt-0.5'>
                    {dateStr} - {item.rosterCount || 0} students
                  </p>
                </div>

                {/* Join Button */}
                <div className='shrink-0'>
                  <button
                    type='button'
                    disabled={!isJoinable || isJoining}
                    onClick={() => handleJoinClass(item)}
                    className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center justify-center min-w-[56px] ${
                      isJoinable
                        ? 'bg-slate-900 text-white hover:bg-slate-800 shadow-xs cursor-pointer'
                        : 'bg-slate-200 text-slate-400 cursor-not-allowed'
                    }`}
                  >
                    {isJoining ? (
                      <Loader2 className='w-3.5 h-3.5 animate-spin' />
                    ) : (
                      'Join'
                    )}
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};

export default UpcomingEventsCard;

