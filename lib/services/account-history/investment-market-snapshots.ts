import { getDb, getPool } from "@/lib/db";
import { accounts, accountSnapshots, holdingSnapshots } from "@/lib/db/schema";
import { eq, and, asc, desc } from "drizzle-orm";
import { decryptRows, decryptField, encryptField } from "@/lib/crypto";
import { isConstantPriceTicker, resolvePriceSourceTicker } from "@/lib/utils/ticker-mappings";
import { roundToCents, formatToCents } from "@/lib/utils/format";
import { getAccountCurrentBalance } from "../asset-estimator";
import { logger } from "@/lib/logger";

const LOG_TAG = "[account-history]";

function toDateString(d: Date | string): string {
  if (typeof d === 'string') return d.slice(0, 10);
  if (d instanceof Date) return d.toISOString().slice(0, 10);
  return String(d).slice(0, 10);
}

export async function generateInvestmentMarketSnapshots(
  accountId: string,
  userId: string,
  fromDate: string,
  toDate: string,
  dek?: Uint8Array
): Promise<number | null> {
  const db = getDb();
  
  // 1. Get all holding snapshots for this account
  const dbSnapshots = await db
    .select()
    .from(holdingSnapshots)
    .where(
      and(
        eq(holdingSnapshots.accountId, accountId),
        eq(holdingSnapshots.userId, userId)
      )
    )
    .orderBy(asc(holdingSnapshots.snapshotDate));

  if (dbSnapshots.length === 0) {
    logger.debug(`${LOG_TAG} No holding snapshots available for investment account ${accountId}, falling back to transaction-based calculation`);
    return null;
  }

  // 2. Decrypt holding snapshots
  const decryptedSnaps = await decryptRows('holding_snapshots', dbSnapshots, dek);

  // Group snapshots by date
  const snapsByDate = new Map<string, typeof decryptedSnaps>();
  for (const s of decryptedSnaps) {
    const dateStr = toDateString(s.snapshotDate);
    if (!snapsByDate.has(dateStr)) {
      snapsByDate.set(dateStr, []);
    }
    snapsByDate.get(dateStr)!.push(s);
  }

  // Get all unique dates in sorted order
  const sortedSnapshotDates = Array.from(snapsByDate.keys()).sort((a, b) => a.localeCompare(b));

  // Determine unique valid tickers
  const uniqueTickers = new Set<string>();
  const isValidTicker = (t: string) => {
    const clean = t.trim().toUpperCase();
    return clean.length > 0 && clean.length <= 10 && /^[A-Z0-9=\-\.]+$/.test(clean);
  };

  for (const s of decryptedSnaps) {
    if (s.ticker && isValidTicker(s.ticker)) {
      uniqueTickers.add(s.ticker.toUpperCase().trim());
    }
  }

  // Determine overall range of days to evaluate
  // We calculate daily valuations from the first holding snapshot date (or fromDate, whichever is earlier) to toDate
  const calculationStartDate = sortedSnapshotDates[0] < fromDate ? sortedSnapshotDates[0] : fromDate;
  const start = new Date(calculationStartDate + 'T00:00:00Z');
  const end = new Date(toDate + 'T00:00:00Z');
  const dailyDates: string[] = [];
  let curr = new Date(start);
  while (curr <= end) {
    dailyDates.push(curr.toISOString().split('T')[0]);
    curr.setUTCDate(curr.getUTCDate() + 1);
  }

  // 3. Fetch historical prices from Yahoo Finance for each unique ticker
  const tickerPrices = new Map<string, Map<string, number>>();
  
  // Pre-populate constant-price tickers with 1.00
  for (const ticker of uniqueTickers) {
    if (isConstantPriceTicker(ticker)) {
      const priceMap = new Map<string, number>();
      for (const d of dailyDates) {
        priceMap.set(d, 1.00);
      }
      tickerPrices.set(ticker, priceMap);
    }
  }

  const fetchableTickers = Array.from(uniqueTickers).filter(t => !isConstantPriceTicker(t));

  if (fetchableTickers.length > 0) {
    const startTs = Math.floor(new Date(fromDate + 'T00:00:00Z').getTime() / 1000);
    const endTs = Math.floor(new Date(toDate + 'T00:00:00Z').getTime() / 1000) + 86400; // include end date

    await Promise.all(
      fetchableTickers.map(async (ticker) => {
        try {
          const mappedTicker = resolvePriceSourceTicker(ticker);
          const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(mappedTicker)}?period1=${startTs}&period2=${endTs}&interval=1d`;
          const res = await fetch(url, {
            headers: { 'User-Agent': 'Mozilla/5.0' },
            signal: AbortSignal.timeout(8000),
          });
          if (!res.ok) {
            logger.warn(`${LOG_TAG} Yahoo Finance fetch failed for ticker ${ticker} (mapped to ${mappedTicker}): ${res.status}`);
            return;
          }
          const data = await res.json() as any;
          const timestamps = data?.chart?.result?.[0]?.timestamp;
          const closes = data?.chart?.result?.[0]?.indicators?.quote?.[0]?.close;
          if (timestamps && closes) {
            const priceMap = new Map<string, number>();
            for (let i = 0; i < timestamps.length; i++) {
              const dateStr = new Date(timestamps[i] * 1000).toISOString().split('T')[0];
              const price = parseFloat(closes[i]);
              if (!isNaN(price)) {
                priceMap.set(dateStr, price);
              }
            }
            tickerPrices.set(ticker, priceMap); // Store under the original ticker
          }
        } catch (err) {
          logger.warn(`${LOG_TAG} Error fetching Yahoo Finance history for ticker ${ticker}:`, err);
        }
      })
    );
  }

  // 4. Generate daily raw holdings valuations V(t)
  const valuationByDate = new Map<string, number>();
  const activeHoldingsBySecurity = new Map<string, { ticker: string | null, name: string | null, quantity: number, price: number }>();
  const tradingDays = new Set<string>();

  // Walk forward day by day to compute daily V(t)
  for (const dateStr of dailyDates) {
    // If we have a snapshot on this date, update the active positions
    const daySnaps = snapsByDate.get(dateStr);
    if (daySnaps) {
      activeHoldingsBySecurity.clear();
      for (const s of daySnaps) {
        const securityId = s.securityId || s.ticker || s.name || '';
        if (securityId) {
          activeHoldingsBySecurity.set(securityId, {
            ticker: s.ticker,
            name: s.name,
            quantity: parseFloat(s.quantity) || 0,
            price: parseFloat(s.price) || 0,
          });
        }
      }
    }

    // Calculate total value V(t) for this day
    let dailyValuation = 0;
    let hasDailyPrice = false;
    for (const pos of activeHoldingsBySecurity.values()) {
      let price = pos.price; // fallback to last known price from snapshot
      if (pos.ticker) {
        const tickerUpper = pos.ticker.toUpperCase().trim();
        const priceMap = tickerPrices.get(tickerUpper);
        if (priceMap) {
          const yahooPrice = priceMap.get(dateStr);
          if (yahooPrice !== undefined) {
            price = yahooPrice;
              if (!isConstantPriceTicker(tickerUpper)) {
              hasDailyPrice = true;
            }
          } else {
            // Weekend/holiday lookback: carry forward the most recent price from Yahoo Finance
            let lookbackDate = new Date(dateStr + 'T00:00:00Z');
            for (let d = 0; d < 10; d++) {
              lookbackDate.setUTCDate(lookbackDate.getUTCDate() - 1);
              const lookbackStr = lookbackDate.toISOString().split('T')[0];
              const prevPrice = priceMap.get(lookbackStr);
              if (prevPrice !== undefined) {
                price = prevPrice;
                break;
              }
            }
          }
        }
      }
      dailyValuation += pos.quantity * price;
    }
    if (hasDailyPrice) {
      tradingDays.add(dateStr);
    }
    valuationByDate.set(dateStr, roundToCents(dailyValuation));
  }

  // 5. Get all real (confirmed) snapshots of the account balance to anchor
  const realSnaps = await db
    .select({
      date: accountSnapshots.snapshotDate,
      balance: accountSnapshots.balance,
    })
    .from(accountSnapshots)
    .where(
      and(
        eq(accountSnapshots.accountId, accountId),
        eq(accountSnapshots.userId, userId),
        eq(accountSnapshots.isSynthetic, false)
      )
    )
    .orderBy(asc(accountSnapshots.snapshotDate));

  const decryptedReal = await Promise.all(
    realSnaps.map(async (s) => {
      let balanceStr = String(s.balance);
      if (dek) {
        try {
          const decrypted = await decryptField(s.balance, dek);
          if (decrypted) balanceStr = decrypted;
        } catch {}
      }
      return { date: toDateString(s.date), balance: parseFloat(balanceStr) || 0 };
    })
  );

  // If there are no real snapshots, treat today as a real snapshot with currentBalance
  if (decryptedReal.length === 0) {
    const currentBalance = await getAccountCurrentBalance(accountId, dek);
    const todayStr = new Date().toISOString().split('T')[0];
    decryptedReal.push({ date: todayStr, balance: currentBalance });
  }

  // Group real snapshots by date for anchoring
  const realByDate = new Map<string, number>();
  for (const r of decryptedReal) {
    realByDate.set(r.date, r.balance);
  }

  const sortedRealDates = Array.from(realByDate.keys()).sort((a, b) => a.localeCompare(b));

  // Function to get discrepancy D(t) for a date
  const getDiscrepancy = (dateStr: string): number => {
    const realBal = realByDate.get(dateStr);
    if (realBal === undefined) return 0;
    const estVal = valuationByDate.get(dateStr) || 0;
    return realBal - estVal;
  };

  const firstHoldingDate = sortedSnapshotDates[0];
  const baselineRealDate = sortedRealDates.find(d => d >= firstHoldingDate) || sortedRealDates[sortedRealDates.length - 1];
  const baselineDiscrepancy = baselineRealDate ? getDiscrepancy(baselineRealDate) : 0;

  // Compute discrepancy D(t) on dates with real snapshots
  const realDiscrepancy = new Map<string, number>();
  for (const d of sortedRealDates) {
    if (d < firstHoldingDate) {
      realDiscrepancy.set(d, baselineDiscrepancy);
    } else {
      realDiscrepancy.set(d, getDiscrepancy(d));
    }
  }

  // 6. Calculate discrepancy D(t) for all dates in dailyDates using a step-function (no interpolation)
  const stepDiscrepancy = new Map<string, number>();
  for (const dateStr of dailyDates) {
    // Find the latest real snapshot on or before dateStr
    let prevRealDate: string | null = null;
    let nextRealDate: string | null = null;

    for (const d of sortedRealDates) {
      if (d <= dateStr) {
        prevRealDate = d;
      }
      if (d >= dateStr && nextRealDate === null) {
        nextRealDate = d;
      }
    }

    if (prevRealDate !== null) {
      stepDiscrepancy.set(dateStr, roundToCents(realDiscrepancy.get(prevRealDate)!));
    } else if (nextRealDate !== null) {
      stepDiscrepancy.set(dateStr, roundToCents(realDiscrepancy.get(nextRealDate)!));
    } else {
      stepDiscrepancy.set(dateStr, 0);
    }
  }

  // 7. Calculate daily estimated balance B(t) = V(t) + D(t)
  const finalBalances = new Map<string, number>();
  for (const dateStr of dailyDates) {
    if (dateStr >= firstHoldingDate) {
      const v = valuationByDate.get(dateStr) || 0;
      const d = stepDiscrepancy.get(dateStr) || 0;
      finalBalances.set(dateStr, roundToCents(v + d));
    }
  }

  // 8. Delete existing synthetic snapshots for this account in the date range
  await db
    .delete(accountSnapshots)
    .where(
      and(
        eq(accountSnapshots.accountId, accountId),
        eq(accountSnapshots.userId, userId),
        eq(accountSnapshots.isSynthetic, true)
      )
    );

  // 9. Batch insert estimated snapshots
  const toInsert: Array<{ userId: string; accountId: string; snapshotDate: string; balance: string; isSynthetic: boolean; isImported: boolean }> = [];
  const [account] = await db
    .select({ externalId: accounts.externalId })
    .from(accounts)
    .where(eq(accounts.id, accountId))
    .limit(1);
  const isAccountImported = account?.externalId?.startsWith('imported-') ?? false;

  for (const dateStr of dailyDates) {
    // Only insert for dates >= fromDate (to respect the requested range)
    if (dateStr < fromDate) continue;
    // Don't overwrite real snapshots
    if (realByDate.has(dateStr)) continue;

    // Only generate synthetic snapshots on event/trading days
    const hasEvent = snapsByDate.has(dateStr) || tradingDays.has(dateStr);
    if (!hasEvent) continue;

    const bal = finalBalances.get(dateStr);
    if (bal !== undefined && !isNaN(bal)) {
      toInsert.push({
        userId,
        accountId,
        snapshotDate: dateStr,
        balance: formatToCents(bal),
        isSynthetic: true,
        isImported: isAccountImported,
      });
    }
  }

  if (toInsert.length > 0) {
    const BATCH_SIZE = 100;
    const pool = getPool();
    for (let i = 0; i < toInsert.length; i += BATCH_SIZE) {
      const chunk = toInsert.slice(i, i + BATCH_SIZE);
      const params: any[] = [];
      const valuePlaceholders: string[] = [];
      let paramIdx = 1;

      for (const row of chunk) {
        const balanceEncrypted = dek ? await encryptField(row.balance, dek) : row.balance;
        params.push(row.userId, row.accountId, row.snapshotDate, balanceEncrypted, row.isSynthetic, row.isImported);
        valuePlaceholders.push(`($${paramIdx}, $${paramIdx + 1}, $${paramIdx + 2}, $${paramIdx + 3}, $${paramIdx + 4}, $${paramIdx + 5})`);
        paramIdx += 6;
      }

      const sqlText = `
        INSERT INTO "account_snapshots" ("user_id", "account_id", "snapshot_date", "balance", "is_synthetic", "is_imported")
        VALUES ${valuePlaceholders.join(', ')}
        ON CONFLICT ("user_id", "account_id", "snapshot_date") 
        DO UPDATE SET "balance" = EXCLUDED.balance, "is_synthetic" = EXCLUDED.is_synthetic, "is_imported" = EXCLUDED.is_imported
      `;

      try {
        await pool.query(sqlText, params);
      } catch (err) {
        logger.error(`${LOG_TAG} Investment market-based batch insert failed`, { error: err instanceof Error ? err.message : String(err) });
        return null;
      }
    }
  }

  logger.info(`${LOG_TAG} Generated ${toInsert.length} market-based synthetic snapshots for account ${accountId}`);
  return toInsert.length;
}

