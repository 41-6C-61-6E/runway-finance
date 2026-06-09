/**
 * Format a number as currency
 */
export function formatCurrency(
  amount: number | string | undefined | null,
  currency = 'USD',
  locale = 'en-US'
): string {
  const val = amount === undefined || amount === null ? 0 : amount;
  const num = typeof val === 'string' ? parseFloat(val) : val;
  const validNum = isNaN(num) ? 0 : num;
  
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(validNum);
}

/**
 * Format a number as a percentage
 */
export function formatPercent(
  value: number | string | undefined | null,
  decimals = 2,
): string {
  if (value === undefined || value === null) return '+0.00%';
  const num = typeof value === 'string' ? parseFloat(value) : value;
  if (isNaN(num)) return '+0.00%';
  return `${num >= 0 ? '+' : ''}${num.toFixed(decimals)}%`;
}

/**
 * Format date consistently across the app
 * If date is a string, appends T00:00:00 to ensure it's parsed as local time
 * (not UTC), which prevents off-by-one-day issues in different timezones.
 */
export function formatDate(date: Date | string, locale = 'en-US'): string {
  let d: Date;
  if (typeof date === 'string') {
    // Append T00:00:00 to parse as local time, not UTC
    // This prevents toLocaleDateString() from shifting the date by a timezone offset
    d = new Date(date + 'T00:00:00');
  } else {
    d = date;
  }
  return d.toLocaleDateString(locale);
}
