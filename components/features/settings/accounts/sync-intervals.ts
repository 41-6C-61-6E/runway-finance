export const SYNC_FREQUENCIES = [
  { value: 'manual', label: 'Manual only' },
  { value: '4h', label: 'Every 4 hours' },
  { value: '12h', label: 'Every 12 hours' },
  { value: 'daily', label: 'Daily' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' },
] as const;

export const SYNC_INTERVALS: Record<string, number> = {
  manual: 0,
  '4h': 4 * 60 * 60 * 1000,
  '12h': 12 * 60 * 60 * 1000,
  daily: 24 * 60 * 60 * 1000,
  weekly: 7 * 24 * 60 * 60 * 1000,
  margin: 0,
  monthly: 30 * 24 * 60 * 60 * 1000,
};

export const SYNC_FREQUENCY_LABELS: Record<string, string> = {
  manual: 'Manual only',
  '4h': 'Every 4 hours',
  '12h': 'Every 12 hours',
  daily: 'Daily',
  weekly: 'Weekly',
  monthly: 'Monthly',
};

export const SYNC_FREQ_COLORS: Record<string, string> = {
  '4h': 'text-emerald-500 bg-emerald-500/10',
  '12h': 'text-emerald-500 bg-emerald-500/10',
  daily: 'text-emerald-500 bg-emerald-500/10',
  weekly: 'text-blue-500 bg-blue-500/10',
  monthly: 'text-amber-500 bg-amber-500/10',
  manual: 'text-muted-foreground bg-muted',
};

export function computeNextSync(
  syncFrequency: string,
  lastSyncDate: string | null,
  options?: { fallbackNowIfMissingDate?: boolean }
): Date | null {
  const normalizedFreq = syncFrequency === 'hourly' ? 'daily' : syncFrequency;
  if (normalizedFreq === 'manual') return null;
  const interval = SYNC_INTERVALS[normalizedFreq];
  if (!interval || interval <= 0) return null;
  if (!lastSyncDate) {
    return options?.fallbackNowIfMissingDate ? new Date() : null;
  }
  const last = new Date(lastSyncDate).getTime();
  if (isNaN(last)) return null;
  return new Date(last + interval);
}
