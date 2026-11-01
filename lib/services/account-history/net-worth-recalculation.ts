import { getDb } from "@/lib/db";
import { accounts, accountSnapshots, netWorthSnapshots, userSettings } from "@/lib/db/schema";
import { eq, inArray, asc, sql } from "drizzle-orm";
import { decryptRows, decryptField, encryptRow } from "@/lib/crypto";
import { isLiabilityAccount, computeNetWorthTotals, computeCategoryBreakdown } from "@/lib/utils/account-scope";
import { convertCurrency } from "@/lib/constants/currency-rates";
import { roundToCents, formatToCents } from "@/lib/utils/format";
import { logger } from "@/lib/logger";

const LOG_TAG = "[account-history]";

export async function recalculateNetWorthSnapshots(userId: string, dek?: Uint8Array) {
  const db = getDb();

  const [settings] = await db
    .select({ currency: userSettings.currency })
    .from(userSettings)
    .where(eq(userSettings.userId, userId))
    .limit(1);
  const baseCurrency = settings?.currency || 'USD';

  // 1. Get all accounts
  const userAccounts = await db
    .select()
    .from(accounts)
    .where(eq(accounts.userId, userId));

  if (userAccounts.length === 0) {
    await db.delete(netWorthSnapshots).where(eq(netWorthSnapshots.userId, userId));
    return;
  }

  // 2. Get all snapshots for this user
  const snaps = await db
    .select({
      accountId: accountSnapshots.accountId,
      snapshotDate: accountSnapshots.snapshotDate,
      balance: accountSnapshots.balance,
      isSynthetic: accountSnapshots.isSynthetic,
      isImported: accountSnapshots.isImported,
    })
    .from(accountSnapshots)
    .where(eq(accountSnapshots.userId, userId))
    .orderBy(asc(accountSnapshots.snapshotDate));

  if (snaps.length === 0) {
    await db.delete(netWorthSnapshots).where(eq(netWorthSnapshots.userId, userId));
    return;
  }

  // Decrypt snapshot balances
  const decryptedSnaps = await Promise.all(
    snaps.map(async (s) => {
      let balance = 0;
      if (dek) {
        try {
          const decrypted = await decryptField(s.balance, dek);
          balance = parseFloat(decrypted);
          if (isNaN(balance)) balance = 0;
        } catch (err) {
          balance = 0;
          logger.warn(`${LOG_TAG} Failed to decrypt snapshot balance for net worth recalculation`, {
            accountId: s.accountId,
            userId,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      } else {
        balance = parseFloat(s.balance);
        if (isNaN(balance)) balance = 0;
      }
      return { ...s, balance };
    })
  );

  // Group snapshots by date
  const snapsByDate = new Map<string, Array<{ accountId: string; balance: number }>>();
  for (const s of decryptedSnaps) {
    const d = s.snapshotDate;
    if (!snapsByDate.has(d)) {
      snapsByDate.set(d, []);
    }
    snapsByDate.get(d)!.push({ accountId: s.accountId, balance: s.balance });
  }

  // Get all unique dates in sorted order
  const sortedDates = Array.from(snapsByDate.keys()).sort((a, b) => a.localeCompare(b));

  // Decrypt account details to check types
  const decryptedAccounts = dek ? await decryptRows('accounts', userAccounts, dek) : userAccounts;

  const latestByAccount = new Map<string, number>();

  // Iterate dates and calculate net worth values
  const allNwValues: any[] = [];
  for (const dateStr of sortedDates) {
    // Update latest balances for the day
    for (const snap of snapsByDate.get(dateStr)!) {
      latestByAccount.set(snap.accountId, snap.balance);
    }

    // Canonical totals (hidden/excluded + inactive accounts skipped, currency-converted)
    const { totalAssets, totalLiabilities, netWorth } = computeNetWorthTotals(
      decryptedAccounts.map((acc) => ({
        type: acc.type,
        balance: latestByAccount.get(acc.id) ?? 0,
        isHidden: acc.isHidden,
        isExcludedFromNetWorth: acc.isExcludedFromNetWorth,
        currency: acc.currency,
        metadata: acc.metadata,
      })),
      baseCurrency,
      dateStr
    );

    // Canonical per-type breakdown (identical scope to the totals above)
    const breakdown = computeCategoryBreakdown(
      decryptedAccounts.map((acc) => ({
        type: acc.type,
        balance: latestByAccount.get(acc.id) ?? 0,
        isHidden: acc.isHidden,
        isExcludedFromNetWorth: acc.isExcludedFromNetWorth,
        currency: acc.currency,
        metadata: acc.metadata,
      })),
      baseCurrency,
      dateStr
    );

    allNwValues.push({
      userId,
      snapshotDate: dateStr,
      totalAssets: formatToCents(totalAssets),
      totalLiabilities: formatToCents(totalLiabilities),
      netWorth: formatToCents(netWorth),
      breakdown: breakdown as any,
    });
  }

  // Batch encrypt snapshot rows in chunks of 100
  const encryptedNwRows: any[] = [];
  const chunkSize = 100;
  for (let i = 0; i < allNwValues.length; i += chunkSize) {
    const chunk = allNwValues.slice(i, i + chunkSize);
    const encryptedChunk = dek
      ? await Promise.all(chunk.map((row) => encryptRow('net_worth_snapshots', row, dek)))
      : chunk;
    encryptedNwRows.push(...encryptedChunk);
  }

  // Atomically delete and batch-insert snapshots in a single database transaction
  const runTransaction = typeof db.transaction === 'function'
    ? (cb: (tx: any) => Promise<void>) => db.transaction(cb)
    : (cb: (tx: any) => Promise<void>) => cb(db);

  await runTransaction(async (tx) => {
    await tx.delete(netWorthSnapshots).where(eq(netWorthSnapshots.userId, userId));
    for (let i = 0; i < encryptedNwRows.length; i += chunkSize) {
      const batch = encryptedNwRows.slice(i, i + chunkSize);
      await tx.insert(netWorthSnapshots).values(batch).onConflictDoUpdate({
        target: [netWorthSnapshots.userId, netWorthSnapshots.snapshotDate],
        set: {
          totalAssets: sql`excluded.total_assets`,
          totalLiabilities: sql`excluded.total_liabilities`,
          netWorth: sql`excluded.net_worth`,
          breakdown: sql`excluded.breakdown`,
        },
      });
    }
  });
}

function toDateString(d: Date | string): string {
  if (d instanceof Date) {
    return d.toISOString().split('T')[0];
  }
  if (typeof d === 'string') {
    return d.split('T')[0];
  }
  return String(d);
}

