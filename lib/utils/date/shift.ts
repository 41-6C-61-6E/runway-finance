/**
 * Pure UTC date shifting utilities
 */

/**
 * Shift a YYYY-MM-DD date string by N days (may be negative).
 * Pure UTC math — returns YYYY-MM-DD, or '' when the input is malformed.
 */
export function shiftDaysUTC(dateStr: string, days: number): string {
  const parts = String(dateStr).split('T')[0].split('-');
  if (parts.length < 3) return '';
  const d = new Date(Date.UTC(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2])));
  if (isNaN(d.getTime())) return '';
  d.setUTCDate(d.getUTCDate() + days);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

