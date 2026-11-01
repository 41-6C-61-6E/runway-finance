/**
 * Date formatting and timezone projection utilities
 */

/**
 * Safely format a date string or Date object to a timezone-safe UTC string.
 * Supports YYYY-MM-DD, YYYY-MM, or Date objects/ISO strings.
 */
export function formatSafeUTCDate(
  dateInput: string | Date,
  options: Intl.DateTimeFormatOptions = { month: 'short', year: '2-digit' }
): string {
  if (!dateInput) return '';
  const dateStr = typeof dateInput === 'string' ? dateInput.split('T')[0] : dateInput.toISOString().split('T')[0];
  const parts = dateStr.split('-');
  let year = 1970;
  let month = 1;
  let day = 1;
  
  if (parts.length >= 1) year = parseInt(parts[0], 10);
  if (parts.length >= 2) month = parseInt(parts[1], 10);
  if (parts.length >= 3) day = parseInt(parts[2], 10);
  
  if (isNaN(year) || isNaN(month) || isNaN(day)) {
    try {
      return new Date(dateInput).toLocaleDateString('en-US', { ...options, timeZone: 'UTC' });
    } catch {
      return String(dateInput);
    }
  }
  
  const utcDate = new Date(Date.UTC(year, month - 1, day));
  return utcDate.toLocaleDateString('en-US', { ...options, timeZone: 'UTC' });
}

/**
 * Formats a Date as a YYYY-MM-DD string in the given IANA timezone.
 *
 * Single source of truth for "what date is it over there" — used by every
 * snapshot / chart date-boundary computation so client and server agree on
 * the "today" string regardless of process timezone.
 */
export function formatInTimezone(date: Date, tz: string): string {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const parts = formatter.formatToParts(date);
  const year = parts.find((p) => p.type === 'year')?.value;
  const month = parts.find((p) => p.type === 'month')?.value;
  const day = parts.find((p) => p.type === 'day')?.value;
  return `${year}-${month}-${day}`;
}

