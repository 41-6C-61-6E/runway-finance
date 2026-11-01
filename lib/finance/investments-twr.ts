import { classifyTransaction, bucketCashFlow, type TransactionType } from '@/lib/utils/investment-flows';

export interface RawTransactionInput {
  externalId?: string | null;
  description?: string | null;
  payee?: string | null;
  categoryName?: string | null;
  amount: number;
}

/**
 * Filters out internal, synthetic, or non-external flows and determines
 * the net external cash flow crossing the portfolio boundary.
 *
 * Rules:
 * 1. Ignore synthetic equity sync transactions (`equity-sync-*`) and adjustment transactions (`adj-*`).
 * 2. Ignore internal transfers and balance adjustments (category `Transfer` or `Balance Adjustments`).
 * 3. Classify transaction via `classifyTransaction`.
 * 4. Only genuine external capital flows count:
 *    - Contributions / deposits -> +|amount|
 *    - Withdrawals / fees -> -|amount|
 *    - Internal trades (buys, sells), reinvestments, transfers, and organic income (dividends, interest) return null (no external cash flow).
 */
export function filterAndClassifyCashFlow(tx: RawTransactionInput): number | null {
  const extId = tx.externalId ?? '';
  if (extId.startsWith('equity-sync-') || extId.startsWith('adj-')) {
    return null;
  }

  const cat = tx.categoryName ?? '';
  if (cat === 'Transfer' || cat === 'Balance Adjustments') {
    return null;
  }

  const desc = tx.description ?? '';
  if (desc.toLowerCase().includes('vested equity intrinsic value')) {
    return null;
  }

  const txType = classifyTransaction(desc, tx.payee ?? null, tx.amount);
  const bucketResult = bucketCashFlow(txType, tx.amount);

  if (!bucketResult) return null;

  if (bucketResult.bucket === 'contributions') {
    return bucketResult.mag;
  }
  if (bucketResult.bucket === 'withdrawals') {
    return -bucketResult.mag;
  }

  // Organic investment income (dividends, interest) stays inside the portfolio
  return null;
}

export interface DailySnapshotPoint {
  date: string;
  value: number;
}

export interface TwrDailyPoint {
  date: string;
  value: number;
  twr: number;
}

/**
 * Computes daily Time-Weighted Return (TWR) series with liquidation recovery.
 *
 * Single-period return formula removing external cash flows:
 *   r_t = (Ending Value - Net Cash Flow) / Beginning Value - 1
 *
 * Liquidation lockout guard:
 *   If the portfolio balance drops to 0 (cumulative factor reaches 0),
 *   and is subsequently refunded/restarted with a positive balance,
 *   reset the cumulative factor to track subsequent organic performance.
 */
export function computeTwrDailyPoints(
  dailySnapshots: DailySnapshotPoint[],
  dailyCashFlows: Map<string, number>
): TwrDailyPoint[] {
  if (dailySnapshots.length === 0) return [];

  const points: TwrDailyPoint[] = [];
  let prevTotalValue = dailySnapshots[0].value;
  let cumulativeTwrFactor = 1.0;

  for (let idx = 0; idx < dailySnapshots.length; idx++) {
    const { date: dateStr, value: totalValue } = dailySnapshots[idx];

    if (idx === 0) {
      prevTotalValue = totalValue;
      points.push({
        date: dateStr,
        value: totalValue,
        twr: 0,
      });
    } else {
      const netCashFlow = dailyCashFlows.get(dateStr) || 0;

      if (prevTotalValue > 0) {
        const r_t = (totalValue - netCashFlow) / prevTotalValue - 1;
        const factor = Math.max(0, 1 + r_t);

        if (cumulativeTwrFactor === 0 && totalValue > 0) {
          // Recover from full liquidation lockout when new capital achieves returns
          cumulativeTwrFactor = factor > 0 ? factor : 1.0;
        } else {
          cumulativeTwrFactor *= factor;
        }
      } else if (prevTotalValue === 0 && totalValue > 0) {
        // Portfolio was at zero and was re-funded
        if (cumulativeTwrFactor === 0) {
          cumulativeTwrFactor = 1.0;
        }
      }

      const currentTwrPct = (cumulativeTwrFactor - 1) * 100;
      prevTotalValue = totalValue;

      points.push({
        date: dateStr,
        value: totalValue,
        twr: Math.round(currentTwrPct * 100) / 100,
      });
    }
  }

  return points;
}
