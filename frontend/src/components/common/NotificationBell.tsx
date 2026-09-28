import { useEffect, useRef, useState } from 'react';
import { Bell, X, Check, CheckCheck, Trash2 } from 'lucide-react';
import { useAppDispatch, useAppSelector } from '@/app/hooks';
import { selectUser } from '@/features/auth/authSelectors';
import { pushNotification, type Notification } from '@/features/notifications/notificationSlice';
import {
  fetchNotifications,
  markRead,
  markAllRead,
  removeNotification,
} from '@/features/notifications/notificationThunks';
import { io } from 'socket.io-client';
import { useNavigate } from 'react-router';

const TYPE_STYLES: Record<string, { dot: string; icon: string }> = {
  achievement:        { dot: 'bg-yellow-400', icon: '🏆' },
  assignment_graded:  { dot: 'bg-green-400',  icon: '✅' },
  new_assignment:     { dot: 'bg-blue-400',   icon: '📋' },
  submission_received:{ dot: 'bg-purple-400', icon: '📥' },
  general:            { dot: 'bg-slate-400',  icon: '📣' },
};

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1)  return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export default function NotificationBell() {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const user = useAppSelector(selectUser);
  const { items, unreadCount, loading } = useAppSelector((s) => s.notifications);

  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  // Fetch on mount
  useEffect(() => {
    if (user?.id) dispatch(fetchNotifications());
  }, [user?.id, dispatch]);

  // Socket.io real-time subscription
  useEffect(() => {
    if (!user?.id) return;
    const socket = io(import.meta.env.VITE_API_URL || undefined, { transports: ['websocket'] });
    socket.on('connect', () => socket.emit('notification:subscribe', { userId: user.id }));
    socket.on('notification:new', (n: Notification) => dispatch(pushNotification(n)));
    return () => { socket.disconnect(); };
  }, [user?.id, dispatch]);

  // Close panel on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const handleClick = (n: Notification) => {
    if (!n.is_read) dispatch(markRead(n.id));
    if (n.link) { navigate(n.link); setOpen(false); }
  };

  const handleRemove = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    dispatch(removeNotification(id));
  };

  return (
    <div className='relative' ref={panelRef}>
      {/* Bell button */}
      <button
        onClick={() => setOpen((v) => !v)}
        className='relative p-2 text-slate-400 hover:text-slate-600 transition-colors'
        aria-label='Notifications'
      >
        <Bell className='w-5 h-5' />
        {unreadCount > 0 && (
          <span className='absolute top-1.5 right-1.5 min-w-[16px] h-4 px-0.5 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center border-2 border-white leading-none'>
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown panel */}
      {open && (
        <div className='absolute -right-8 sm:right-0 top-full mt-2 w-[270px] sm:w-76 md:w-80 max-w-[calc(100vw-1.5rem)] bg-white rounded-2xl shadow-xl border border-slate-200/90 z-50 overflow-hidden animate-in fade-in zoom-in-95 duration-150'>
          {/* Header */}
          <div className='flex items-center justify-between px-3.5 py-2.5 border-b border-slate-100 bg-slate-50/50'>
            <div className='flex items-center gap-1.5'>
              <span className='text-xs font-bold text-slate-800'>Notifications</span>
              {unreadCount > 0 && (
                <span className='text-[10px] bg-red-100 text-red-600 font-bold px-1.5 py-0.2 rounded-full'>
                  {unreadCount} new
                </span>
              )}
            </div>
            <div className='flex items-center gap-0.5'>
              {unreadCount > 0 && (
                <button
                  onClick={() => dispatch(markAllRead())}
                  className='p-1 text-slate-400 hover:text-indigo-600 transition-colors rounded-md hover:bg-indigo-50'
                  title='Mark all as read'
                >
                  <CheckCheck className='w-3.5 h-3.5' />
                </button>
              )}
              <button
                onClick={() => setOpen(false)}
                className='p-1 text-slate-400 hover:text-slate-600 transition-colors rounded-md hover:bg-slate-100'
                title='Close'
              >
                <X className='w-3.5 h-3.5' />
              </button>
            </div>
          </div>

          {/* List */}
          <div className='max-h-72 sm:max-h-80 overflow-y-auto divide-y divide-slate-50'>
            {loading && (
              <div className='py-6 text-center text-xs text-slate-400'>Loading…</div>
            )}
            {!loading && items.length === 0 && (
              <div className='py-6 text-center'>
                <Bell className='w-6 h-6 text-slate-200 mx-auto mb-1.5' />
                <p className='text-xs text-slate-400'>No notifications yet</p>
              </div>
            )}
            {items.map((n) => {
              const style = TYPE_STYLES[n.type] ?? TYPE_STYLES.general;
              return (
                <div
                  key={n.id}
                  onClick={() => handleClick(n)}
                  className={`flex items-start gap-2.5 px-3 py-2.5 cursor-pointer hover:bg-slate-50 transition-colors group ${
                    !n.is_read ? 'bg-indigo-50/30' : ''
                  }`}
                >
                  {/* Type dot */}
                  <div className='flex-shrink-0 mt-0.5'>
                    <span className='text-base leading-none'>{style.icon}</span>
                  </div>

                  <div className='flex-1 min-w-0'>
                    <p className={`text-xs leading-snug ${!n.is_read ? 'font-bold text-slate-800' : 'font-medium text-slate-700'}`}>
                      {n.title}
                    </p>
                    <p className='text-[11px] text-slate-500 mt-0.5 line-clamp-2 leading-relaxed'>{n.body}</p>
                    <p className='text-[9px] text-slate-400 mt-1 font-medium'>{timeAgo(n.created_at)}</p>
                  </div>

                  {/* Actions */}
                  <div className='flex-shrink-0 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity'>
                    {!n.is_read && (
                      <button
                        onClick={(e) => { e.stopPropagation(); dispatch(markRead(n.id)); }}
                        className='p-1 text-slate-400 hover:text-indigo-600 rounded'
                        title='Mark as read'
                      >
                        <Check className='w-3 h-3' />
                      </button>
                    )}
                    <button
                      onClick={(e) => handleRemove(e, n.id)}
                      className='p-1 text-slate-400 hover:text-red-500 rounded'
                      title='Delete'
                    >
                      <Trash2 className='w-3 h-3' />
                    </button>
                  </div>

                  {/* Unread indicator */}
                  {!n.is_read && (
                    <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 mt-1.5 ${style.dot}`} />
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
