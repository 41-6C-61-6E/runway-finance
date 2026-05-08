/**
 * Format a number as currency
 */
export function formatCurrency(
  amount: number | string,
  currency = 'USD',
  locale = 'en-US'
): string {
  const num = typeof amount === 'string' ? parseFloat(amount) : amount;
  
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(num);
}

/**
 * Format a number as a percentage
 */
export function formatPercent(
  value: number | string,
  decimals = 2,
): string {
  const num = typeof value === 'string' ? parseFloat(value) : value;
  return `${num >= 0 ? '+' : ''}${num.toFixed(decimals)}%`;
}

/**
 * Format a number with thousand separators
 */
export function formatNumber(value: number | string, decimals = 2): string {
  const num = typeof value === 'string' ? parseFloat(value) : value;
  return num.toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

/**
 * Format date consistently across the app
 */
export function formatDate(date: Date | string, locale = 'en-US'): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleDateString(locale);
}
