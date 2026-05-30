/**
 * Pure helper functions for paystub operations, extracted to avoid importing
 * Next.js route or database dependencies in unit tests.
 */

/**
 * Parses MM/DD/YYYY dates to YYYY-MM-DD.
 */
export function parseDate(dateStr: string): string {
  const parts = dateStr.split('/');
  if (parts.length !== 3) return dateStr; // Return as-is if not parseable
  const [month, day, year] = parts;
  return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
}

/**
 * Add a frequency interval to a date string (YYYY-MM-DD).
 */
export function addFrequencyInterval(dateStr: string, frequency: string): string {
  const date = new Date(dateStr + 'T00:00:00Z');

  switch (frequency) {
    case 'weekly':
      date.setUTCDate(date.getUTCDate() + 7);
      break;
    case 'biweekly':
      date.setUTCDate(date.getUTCDate() + 14);
      break;
    case 'semimonthly':
      date.setUTCDate(date.getUTCDate() + 15);
      break;
    case 'monthly': {
      const originalDay = date.getUTCDate();
      date.setUTCMonth(date.getUTCMonth() + 1);
      if (date.getUTCDate() !== originalDay) {
        date.setUTCDate(0);
      }
      break;
    }
    default:
      date.setUTCDate(date.getUTCDate() + 14); // Default to biweekly
  }

  return date.toISOString().split('T')[0];
}

/**
 * Compute the number of days in a frequency interval.
 */
export function getFrequencyDays(frequency: string): number {
  switch (frequency) {
    case 'weekly':
      return 7;
    case 'biweekly':
      return 14;
    case 'semimonthly':
      return 15;
    case 'monthly':
      return 30;
    default:
      return 14;
  }
}
