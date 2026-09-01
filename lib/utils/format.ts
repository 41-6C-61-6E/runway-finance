const formatterCache = new Map<string, Intl.NumberFormat>();

function getCachedFormatter(
  locale: string,
  currency: string,
  options?: Intl.NumberFormatOptions
): Intl.NumberFormat {
  const key = `${locale}-${currency}-${JSON.stringify(options || {})}`;
  let formatter = formatterCache.get(key);
  if (!formatter) {
    formatter = new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: currency,
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
      ...options,
    });
    formatterCache.set(key, formatter);
  }
  return formatter;
}

/**
 * Format a number as currency with options caching
 */
export function formatCurrency(
  amount: number | string | undefined | null,
  currency = 'USD',
  locale = 'en-US',
  options?: Intl.NumberFormatOptions
): string {
  const val = amount === undefined || amount === null ? 0 : amount;
  const num = typeof val === 'string' ? parseFloat(val) : val;
  const validNum = isNaN(num) ? 0 : num;
  
  return getCachedFormatter(locale, currency, options).format(validNum);
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
 * The *measurement* percent role (R-7): a share or rate, not a signed delta.
 * One decimal by default, no forced `+`, negatives print bare (`-0.2%`),
 * exactly zero prints `0%` without a trailing decimal.
 *
 *   formatPlainPercent(12.34)   // "12.3%"
 *   formatPlainPercent(-0.21)   // "-0.2%"
 *   formatPlainPercent(0)       // "0%"
 *
 * Use `formatPercent` for signed deltas (`+0.00%`) instead.
 */
export function formatPlainPercent(
  value: number | string | undefined | null,
  decimals = 1,
): string {
  if (value === undefined || value === null) return '0%';
  const num = typeof value === 'string' ? parseFloat(value) : value;
  if (isNaN(num)) return '0%';
  const fixed = num.toFixed(decimals);
  if (Number(fixed) === 0) return '0%'; // -0.04 → "-0%" is meaningless
  const trimmed = fixed.replace(/\.0+$/, '');
  return `${trimmed}%`;
}

/**
 * Format date consistently across the app
 * If date is a string, appends T00:00:00 to ensure it's parsed as local time
 * (not UTC), which prevents off-by-one-day issues in different timezones.
 *
 * variant: "short" (default) → "Jul 7, 2026" for dense lists and charts;
 *          "long"  → "July 7, 2026" for page headers and report titles.
 */
export function formatDate(date: Date | string, variant: 'long' | 'short' | 'mdy' = 'short', locale = 'en-US'): string {
  let d: Date;
  if (typeof date === 'string') {
    d = new Date(date + 'T00:00:00');
  } else {
    d = date;
  }
  if (variant === 'long') {
    return d.toLocaleDateString(locale, { month: 'long', day: 'numeric', year: 'numeric' });
  }
  if (variant === 'mdy') {
    return d.toLocaleDateString(locale, { month: 'short', day: 'numeric', year: 'numeric' });
  }
  return d.toLocaleDateString(locale);
}

/**
 * Safely rounds a number or numeric string to 2 decimal places (cents)
 */
export function roundToCents(val: number | string | null | undefined): number {
  if (val === null || val === undefined) return 0;
  const num = typeof val === 'string' ? parseFloat(val) : val;
  if (isNaN(num)) return 0;
  return Math.round(num * 100) / 100;
}

/**
 * Role-aware money formatters (G3 / W-3). One rule table for every place a
 * number is printed — balances vs amounts vs projections were drifting:
 *   - **balance**   → whole dollars              $98,635   (cards, lists, net worth)
 *   - **amount**    → exactly 2 decimals         -$48.02   (per-transaction, ledger lines)
 *   - **projected** → 1 decimal, no trailing .0  $420 / $1.5 (forecasts, milestones)
 *
 * Trailing zeros never appear; the sign is preserved (negatives print "-$48.02").
 */

/** Whole dollars — use where a number represents a *position* (balance, net worth, card totals). */
export function formatBalance(
  amount: number | string | null | undefined,
  currency = 'USD',
  locale = 'en-US'
): string {
  return formatCurrency(amount, currency, locale, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
}

/** Exactly 2 decimals — use for individual movements (per-transaction amounts, ledger lines). */
export function formatAmount(
  amount: number | string | null | undefined,
  currency = 'USD',
  locale = 'en-US'
): string {
  return formatCurrency(amount, currency, locale, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/**
 * Forecasts / milestones. One decimal when the decimals matter, otherwise
 * whole dollars, so "$420.0" never renders — e.g. `$420`, `$1.5`, `$0`.
 */
export function formatProjected(
  amount: number | string | null | undefined,
  currency = 'USD',
  locale = 'en-US'
): string {
  const val = amount === undefined || amount === null ? 0 : amount;
  const num = typeof val === 'string' ? parseFloat(val) : val;
  const safe = isNaN(num) ? 0 : num;
  const rounded = Math.round(safe * 10) / 10;
  const isWhole = rounded % 1 === 0;
  return isWhole
    ? formatCurrency(rounded, currency, locale, { minimumFractionDigits: 0, maximumFractionDigits: 0 })
    : formatCurrency(rounded, currency, locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}

/**
 * Compact currency for chart axes and dense tick labels: `$1.2M`, `$340k`, `$98`.
 */
export function formatCompactCurrency(
  amount: number | string | null | undefined,
  locale = 'en-US'
): string {
  const val = amount === undefined || amount === null ? 0 : amount;
  const num = typeof val === 'string' ? parseFloat(val) : val;
  const n = isNaN(num) ? 0 : num;
  const sign = n < 0 ? '-' : '';
  const abs = Math.abs(n);
  if (abs >= 1_000_000_000) return `${sign}$${trimOneDecimal(abs / 1_000_000_000)}B`;
  if (abs >= 1_000_000) return `${sign}$${trimOneDecimal(abs / 1_000_000)}M`;
  if (abs >= 1_000) return `${sign}$${Math.round(abs / 1_000)}k`;
  return `${sign}$${Math.round(abs)}`;
}

/** "1.0" → "1", "1.5" → "1.5" (drops a single trailing zero). */
function trimOneDecimal(n: number): string {
  const s = n.toFixed(1);
  return s.endsWith('.0') ? s.slice(0, -2) : s;
}

/**
 * R-7 number-formatting role table — the single source of truth for "how many
 * decimals does this kind of number get?" (resolves P2-5 / mobile C-4).
 *
 * Pick the role by what the number *means*, never by where it is rendered:
 *
 *   role        formatter                  example     where
 *   ----------  -------------------------  ---------   -----------------------------
 *   balance     formatBalance()            $98,635     positions: net worth, card totals
 *   amount      formatAmount()             -$48.02     ledger / per-transaction (2dp is CORRECT there)
 *   projected   formatProjected()          $420 / $1.5 forecasts, milestones (1dp max, no trailing .0)
 *   percent     formatPlainPercent()       12.3%       shares, rates; negative prints -0.2%, zero prints 0%
 *   signed %    formatPercent()            +4.50%      deltas that earn an explicit sign
 *   axis $      formatChartYAxisCurrency() $15 / $1.9K whole $ below $1,000, 3-sig-fig K/M above
 *   compact $   formatCompactCurrency()    $340k       dense ticks, non-currency axes
 *
 * Rules:
 *  - Never render a raw `$${n}` template — commas must come from `Intl`.
 *  - A local `.toFixed(1)` on a *percent* (including per-second/per-year
 *    rates printed with a unit suffix like "12.3s" or "2.5 yrs") should be
 *    `formatPlainPercent(value)`. The `.toFixed(1)`s that legitimately remain
 *    in the code base format non-money, non-percent *sizes and ratios* that
 *    no role formatter owns (e.g. "1.4x" card ratio, "4.8 KB" file size) —
 *    those are intentional and pinned by the R-7 ratchet baseline (count 2).
 */
export const MONEY_ROLES = {
  balance: 'formatBalance',
  amount: 'formatAmount',
  projected: 'formatProjected',
  percent: 'formatPlainPercent',
  signedPercent: 'formatPercent',
  axisCurrency: 'formatChartYAxisCurrency',
  compactCurrency: 'formatCompactCurrency',
} as const;

