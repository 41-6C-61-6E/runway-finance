/**
 * Sync frequency intervals in milliseconds.
 */
export const SYNC_INTERVALS: Record<string, number> = {
  manual: 0,
  daily: 24 * 60 * 60 * 1000,
  weekly: 7 * 24 * 60 * 60 * 1000,
  monthly: 30 * 24 * 60 * 60 * 1000,
};

/**
 * Computes the next scheduled sync date based on lastSyncAt and configured frequency.
 */
export function computeNextSync(
  lastSyncAt: string | Date | null | undefined,
  frequency = 'daily'
): Date | null {
  if (!lastSyncAt || frequency === 'manual') return null;

  const lastDate = typeof lastSyncAt === 'string' ? new Date(lastSyncAt) : lastSyncAt;
  if (isNaN(lastDate.getTime())) return null;

  const intervalMs = SYNC_INTERVALS[frequency] || SYNC_INTERVALS.daily;
  return new Date(lastDate.getTime() + intervalMs);
}

/**
 * Formats a timestamp into a human-readable relative time string (e.g. "5m ago", "2h ago", "Just now").
 */
export function formatRelativeTime(dateInput: string | Date | null | undefined): string {
  if (!dateInput) return 'Never';

  const date = typeof dateInput === 'string' ? new Date(dateInput) : dateInput;
  if (isNaN(date.getTime())) return 'Never';

  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  if (diffMs < 0) return 'In the future';

  const diffSecs = Math.floor(diffMs / 1000);
  if (diffSecs < 60) return 'Just now';

  const diffMins = Math.floor(diffSecs / 60);
  if (diffMins < 60) return `${diffMins}m ago`;

  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;

  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return `${diffDays}d ago`;

  const diffWeeks = Math.floor(diffDays / 7);
  if (diffWeeks < 4) return `${diffWeeks}w ago`;

  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}
