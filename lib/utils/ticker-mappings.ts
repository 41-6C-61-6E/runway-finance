// ─────────────────────────────────────────────────────────────────────────────
// Ticker → public price-source mappings.
//
// Retirement-plan (e.g. 401k/ESOP) funds are typically internally-named and
// have no publicly tradeable ticker of their own, so Yahoo Finance has no
// price series for their code. We look up prices for a well-known *proxy*
// (a publicly listed ETF/tracking equivalent) and store/label the result
// under the fund's own ticker.
//
// Previously this table was duplicated in:
//   - lib/services/account-history.ts
//   - app/api/investments/quotes/route.ts
//   - app/api/investments/quotes/security-history/route.ts
//   - app/api/investments/holding-history/route.ts
// Keep a single source of truth here.
// ─────────────────────────────────────────────────────────────────────────────

/** Fund ticker → public ticker used as the price source. */
export const TICKER_MAPPINGS: Record<string, string> = {
  LMCSTK: 'LMT',
  LMCMBI: 'AGG',
  LMSMPH: 'IWM',
  LMMEPH: 'IJH',
};

/**
 * Tickers that always trade at par (stable value / money market funds).
 * Price history for these is rendered as a flat line at 1.00 instead of
 * fetching from Yahoo.
 *
 * Previously duplicated in:
 *   - lib/services/account-history.ts
 *   - app/api/investments/quotes/route.ts
 *   - app/api/investments/quotes/security-history/route.ts
 *   - app/api/investments/holding-history/route.ts
 */
export const CONSTANT_PRICE_TICKERS = new Set(['SCHMMF', 'LMCSVF', 'SCHSEC']);

/** Display names for constant-price tickers. */
export const CONSTANT_PRICE_NAMES: Record<string, string> = {
  SCHMMF: 'Schwab Money Market Fund',
  LMCSVF: 'Lockheed Martin Stable Value Fund',
  SCHSEC: 'Schwab Sweep Security',
};

/**
 * Resolve the actual price-source ticker for a given security ticker.
 *
 * Order:
 *   1. explicit override (e.g. user-assigned `publicEquivalent` from the
 *      Holding detail drawer) — checked first
 *   2. the static `TICKER_MAPPINGS` table
 *   3. the ticker itself
 *
 * Returns an empty string when there is no resolvable ticker (constant-price
 * tickers should be short-circuited by the caller BEFORE calling this).
 */
export function resolvePriceSourceTicker(
  ticker: string | null | undefined,
  publicEquivalent?: string | null,
): string {
  const t = (ticker ?? '').trim().toUpperCase();
  if (!t) return '';
  const eq = (publicEquivalent ?? '').trim().toUpperCase();
  if (eq) return eq;
  return TICKER_MAPPINGS[t] ?? t;
}

/** Whether a given ticker should be treated as constant-price (par 1.00). */
export function isConstantPriceTicker(ticker: string | null | undefined): boolean {
  const t = (ticker ?? '').trim().toUpperCase();
  return t !== '' && CONSTANT_PRICE_TICKERS.has(t);
}

/** Display name for a constant-price ticker (falls back to the ticker). */
export function constantPriceName(ticker: string | null | undefined): string {
  const t = (ticker ?? '').trim().toUpperCase();
  return CONSTANT_PRICE_NAMES[t] ?? t;
}
