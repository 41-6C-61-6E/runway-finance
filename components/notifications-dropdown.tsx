'use client';

import { useRouter } from 'next/navigation';
import { useState, useRef, useEffect } from 'react';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { Bell, Check, ExternalLink, Inbox, Settings, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';

interface UserNotification {
  id: string;
  userId: string;
  title: string;
  body: string;
  urlPath: string | null;
  type: string;
  isRead: boolean;
  createdAt: string;
  readAt: string | null;
}

function formatTimeAgo(dateStr: string) {
  const date = new Date(dateStr);
  const now = new Date();
  const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);
  
  if (seconds < 10) return 'just now';
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export default function NotificationsDropdown() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<UserNotification[]>([]);
  const [shouldWiggle, setShouldWiggle] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const prevUnreadCountRef = useRef(0);

  const unreadCount = notifications.filter(n => !n.isRead).length;

  const fetchNotifications = async () => {
    try {
      const res = await fetch('/api/notifications');
      if (res.ok) {
        const data = await res.json();
        const newNotifications = data.notifications || [];
        setNotifications(newNotifications);
        
        // Trigger a wiggle animation if unread count increases
        const newUnreadCount = newNotifications.filter((n: UserNotification) => !n.isRead).length;
        if (newUnreadCount > prevUnreadCountRef.current) {
          setShouldWiggle(true);
          setTimeout(() => setShouldWiggle(false), 1000);
        }
        prevUnreadCountRef.current = newUnreadCount;
      }
    } catch (err) {
      console.error('Error fetching notifications:', err);
    }
  };

  // Close dropdown on click outside or escape key
  useEffect(() => {
    if (!open) return;
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function handleEscape(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [open]);

  // Initial fetch, polling setup, and window focus sync
  useEffect(() => {
    fetchNotifications();

    const interval = setInterval(fetchNotifications, 30000);

    const handleFocus = () => {
      fetchNotifications();
    };
    window.addEventListener('focus', handleFocus);

    let bc: BroadcastChannel | null = null;
    try {
      bc = new BroadcastChannel('notification-updates');
      bc.onmessage = (event) => {
        if (event.data?.type === 'REFRESH') {
          fetchNotifications();
        }
      };
    } catch (e) {
      console.warn('BroadcastChannel not initialized:', e);
    }

    return () => {
      clearInterval(interval);
      window.removeEventListener('focus', handleFocus);
      if (bc) bc.close();
    };
  }, []);

  const handleMarkAsRead = async (id: string) => {
    // Optimistic UI update
    setNotifications(prev => 
      prev.map(n => n.id === id ? { ...n, isRead: true, readAt: new Date().toISOString() } : n)
    );

    try {
      const res = await fetch(`/api/notifications/${id}/read`, {
        method: 'POST',
      });
      if (!res.ok) {
        throw new Error('Failed to update status on server');
      }
    } catch (err) {
      console.error('Error marking notification as read:', err);
      // Revert state on error
      fetchNotifications();
    }
  };

  const handleMarkAllAsRead = async () => {
    if (unreadCount === 0) return;

    // Optimistic UI update
    setNotifications(prev => 
      prev.map(n => ({ ...n, isRead: true, readAt: new Date().toISOString() }))
    );

    try {
      const res = await fetch('/api/notifications', {
        method: 'POST',
      });
      if (res.ok) {
        toast.success('All notifications marked as read.');
      } else {
        throw new Error('Failed to update status on server');
      }
    } catch (err) {
      console.error('Error marking all notifications as read:', err);
      fetchNotifications();
    }
  };

  const handleNotificationClick = (n: UserNotification) => {
    setOpen(false);
    if (!n.isRead) {
      handleMarkAsRead(n.id);
    }
    if (n.urlPath) {
      router.push(n.urlPath);
    }
  };

  const handleClearAll = async () => {
    if (notifications.length === 0) return;
    if (!confirm('Are you sure you want to clear all notifications?')) return;

    // Optimistic UI update
    setNotifications([]);

    try {
      const res = await fetch('/api/notifications', {
        method: 'DELETE',
      });
      if (res.ok) {
        toast.success('All notifications cleared.');
      } else {
        throw new Error('Failed to delete on server');
      }
    } catch (err) {
      console.error('Error clearing notifications:', err);
      fetchNotifications();
    }
  };

  const handleDeleteNotification = async (id: string) => {
    // Optimistic UI update
    setNotifications(prev => prev.filter(n => n.id !== id));

    try {
      const res = await fetch(`/api/notifications/${id}`, {
        method: 'DELETE',
      });
      if (!res.ok) {
        throw new Error('Failed to delete on server');
      }
    } catch (err) {
      console.error('Error deleting notification:', err);
      fetchNotifications();
    }
  };

  const handleToggleOpen = () => {
    const nextOpen = !open;
    setOpen(nextOpen);
    if (nextOpen) {
      fetchNotifications();
    }
  };

  return (
    <div className="relative" ref={ref}>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            onClick={handleToggleOpen}
            className="relative p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors focus:outline-none focus:ring-2 focus:ring-ring"
            aria-label="Notifications"
          >
            <Bell className={`w-5 h-5 ${shouldWiggle ? 'animate-bounce' : ''}`} />
            {unreadCount > 0 && (
              <span className="absolute top-1 right-1 block h-2 w-2 rounded-full bg-destructive" />
            )}
          </button>
        </TooltipTrigger>
        <TooltipContent side="bottom">Notifications</TooltipContent>
      </Tooltip>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-80 bg-popover border border-border rounded-xl shadow-xl z-50 flex flex-col overflow-hidden max-h-[420px] text-foreground">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-muted/20">
            <span className="font-semibold text-sm">Notifications</span>
            <div className="flex items-center gap-2">
              {unreadCount > 0 && (
                <button
                  type="button"
                  onClick={handleMarkAllAsRead}
                  className="text-xs text-primary hover:text-primary/80 flex items-center gap-1 transition-colors"
                >
                  <Check className="w-3.5 h-3.5" />
                  Mark all read
                </button>
              )}
              {notifications.length > 0 && (
                <button
                  type="button"
                  onClick={handleClearAll}
                  className="p-1 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors focus:outline-none"
                  aria-label="Clear all notifications"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  router.push('/settings?tab=notifications');
                }}
                className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors focus:outline-none"
                aria-label="Notification settings"
              >
                <Settings className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* List */}
          <div className="flex-1 overflow-y-auto divide-y divide-border no-scrollbar">
            {notifications.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 px-4 text-center text-muted-foreground">
                <Inbox className="w-8 h-8 mb-2 opacity-40" />
                <p className="text-xs font-medium">All caught up!</p>
                <p className="text-[10px] opacity-75 mt-0.5">No notifications yet.</p>
              </div>
            ) : (
              notifications.map((n) => (
                <div
                  key={n.id}
                  onClick={() => handleNotificationClick(n)}
                  className={`group/notif flex gap-3 px-4 py-3 text-left transition-colors cursor-pointer hover:bg-muted/50 ${
                    !n.isRead ? 'bg-primary/5 hover:bg-primary/10' : ''
                  }`}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <p className={`text-xs truncate ${!n.isRead ? 'font-semibold text-foreground' : 'text-foreground/90'}`}>
                        {n.title}
                      </p>
                      <span className="text-[9px] text-muted-foreground whitespace-nowrap flex-shrink-0 mt-0.5">
                        {formatTimeAgo(n.createdAt)}
                      </span>
                    </div>
                    <p className="text-[10px] text-muted-foreground line-clamp-2 mt-0.5 leading-relaxed">
                      {n.body}
                    </p>
                    {n.urlPath && n.urlPath !== '/' && (
                      <span className="inline-flex items-center gap-0.5 text-[9px] text-primary mt-1.5 font-medium hover:underline">
                        View
                        <ExternalLink className="w-2 h-2" />
                      </span>
                    )}
                  </div>
                  <div className="flex-shrink-0 self-center flex items-center gap-1.5 min-w-[24px] justify-end">
                    {!n.isRead && (
                      <span className="block w-1.5 h-1.5 rounded-full bg-primary group-hover/notif:hidden" />
                    )}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteNotification(n.id);
                      }}
                      className="p-1 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 opacity-0 group-hover/notif:opacity-100 transition-opacity focus:opacity-100 focus:outline-none"
                      aria-label="Delete notification"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
