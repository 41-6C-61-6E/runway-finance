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
 * Format a number with thousand separators
 */
export function formatNumber(value: number | string | undefined | null, decimals = 2): string {
  const val = value === undefined || value === null ? 0 : value;
  const num = typeof val === 'string' ? parseFloat(val) : val;
  const validNum = isNaN(num) ? 0 : num;
  return validNum.toLocaleString('en-US', {
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
