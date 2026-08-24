/**
 * Shared client-side holdings types for the investments UI.
 *
 * Each component previously re-declared its own `Holding` interface; keep
 * those as thin extensions and use the helper below for ticker resolution.
 */

export interface InvestmentHolding {
  accountId: string;
  accountName?: string;
  institutionName?: string;
  securityId?: string;
  ticker: string | null;
  /** User override for the display ticker (set in the holding detail drawer). */
  tickerOverride?: string | null;
  /** User-assigned public ETF equivalent used as the price source. */
  publicEquivalent?: string | null;
  /**
   * Effective display ticker resolved server-side: tickerOverride (if set
   * and valid) → ticker → null. Prefer this for display & lookups.
   */
  displayTicker?: string | null;
  name: string;
  quantity?: number;
  price?: number;
  value: number;
  costBasis: number | null;
  unrealizedGainLoss: number | null;
  unrealizedReturnPct: number | null;
  portfolioWeight: number;
  currency?: string;
}

/**
 * Effective ticker for a holding: user override → Plaid-reported ticker →
 * user-assigned public equivalent → null. Mirrors server-side
 * `resolveDisplayTicker`.
 */
export function getDisplayTicker(
  holding?: Pick<InvestmentHolding, 'ticker' | 'tickerOverride' | 'displayTicker' | 'publicEquivalent'> | null,
): string | null {
  if (!holding) return null;
  const t = (holding.ticker ?? '').trim().toUpperCase();
  const override = (holding.tickerOverride ?? '').trim().toUpperCase();
  if (override) return override;
  const dt = (holding.displayTicker ?? '').trim().toUpperCase();
  if (dt) return dt;
  if (t) return t;
  const eq = (holding.publicEquivalent ?? '').trim().toUpperCase();
  return eq || null;
}
