import { getDb } from "@/lib/db";
import {
  accounts,
  accountSnapshots,
  netWorthSnapshots,
  userSettings,
} from "@/lib/db/schema";
import { eq, and, sql, lt, desc } from "drizzle-orm";
import { decryptRows, encryptRow, encryptField, decryptField } from "@/lib/crypto";
import { isLiabilityAccount, computeNetWorthTotals, computeCategoryBreakdown } from "@/lib/utils/account-scope";
import { convertCurrency } from "@/lib/constants/currency-rates";
import { roundToCents, formatToCents } from "@/lib/utils/format";
import { logger } from "@/lib/logger";

const LOG_TAG = "[sync]";

export async function createNetWorthSnapshot(
  userId: string,
  dek: Uint8Array,
  snapshotDate: string,
  options?: { skipNotifications?: boolean }
) {
  const db = getDb();
  
  const [settings] = await db
    .select({ currency: userSettings.currency, notifyNetWorthMilestones: userSettings.notifyNetWorthMilestones })
    .from(userSettings)
    .where(eq(userSettings.userId, userId))
    .limit(1);
  const baseCurrency = settings?.currency || 'USD';

  const userAccounts = await db
    .select()
    .from(accounts)
    .where(and(
      eq(accounts.userId, userId),
      eq(accounts.isHidden, false),
      eq(accounts.isExcludedFromNetWorth, false)
    ));

  const decrypted = await decryptRows('accounts', userAccounts, dek);

  // Canonical scoped calculation (reportable + active on the snapshot date,
  // currency-converted) — identical to the live dashboard and the full net
  // worth recalculation pipeline, so both writers produce the same rows.
  const { totalAssets, totalLiabilities, netWorth } = computeNetWorthTotals(
    decrypted,
    baseCurrency,
    snapshotDate
  );
  const breakdown = computeCategoryBreakdown(decrypted, baseCurrency, snapshotDate);

  const nwValues = {
    userId,
    snapshotDate,
    totalAssets: String(totalAssets),
    totalLiabilities: String(totalLiabilities),
    netWorth: String(netWorth),
    breakdown: typeof breakdown === 'string' ? breakdown : JSON.stringify(breakdown),
  };
  const encryptedNw = await encryptRow('net_worth_snapshots', nwValues, dek);

  // R7: fetch the most recent *previous* snapshot before the upsert so we can
  // detect the liabilities >0 → 0 transition (debt-free milestone).
  let prevTotalLiabilities: number | null = null;
  try {
    const [prevSnapshot] = await db
      .select({
        snapshotDate: netWorthSnapshots.snapshotDate,
        totalLiabilities: netWorthSnapshots.totalLiabilities,
      })
      .from(netWorthSnapshots)
      .where(and(eq(netWorthSnapshots.userId, userId), lt(netWorthSnapshots.snapshotDate, snapshotDate)))
      .orderBy(desc(netWorthSnapshots.snapshotDate))
      .limit(1);
    if (prevSnapshot) {
      prevTotalLiabilities = parseFloat(await decryptField(prevSnapshot.totalLiabilities, dek));
    }
  } catch (prevErr) {
    logger.debug(`${LOG_TAG} Could not fetch previous snapshot for debt-free check (non-fatal):`, prevErr);
  }

  await getDb()
    .insert(netWorthSnapshots)
    .values(encryptedNw)
    .onConflictDoUpdate({
      target: [netWorthSnapshots.userId, netWorthSnapshots.snapshotDate],
      set: {
        totalAssets: sql`excluded.total_assets`,
        totalLiabilities: sql`excluded.total_liabilities`,
        netWorth: sql`excluded.net_worth`,
        breakdown: sql`excluded.breakdown`,
      },
    });

  if (!options?.skipNotifications) {
    // Call milestone checker dynamically to avoid circular imports
    const { checkNetWorthMilestonesAndNotify, sendPushNotification } = await import('@/lib/services/notifications');
    checkNetWorthMilestonesAndNotify(userId, dek).catch((err) => {
      logger.error(`${LOG_TAG} Failed to run net worth milestones check:`, err);
    });

    // R7: debt-free celebration milestone — fires exactly once, when tracked
    // liabilities transition from a positive amount to zero.
    if (
      settings?.notifyNetWorthMilestones &&
      prevTotalLiabilities !== null && !isNaN(prevTotalLiabilities)
    ) {
      if (prevTotalLiabilities > 0 && totalLiabilities === 0) {
        const formatted = new Intl.NumberFormat('en-US', {
          style: 'currency',
          currency: baseCurrency,
          maximumFractionDigits: 0,
        }).format(prevTotalLiabilities);
        sendPushNotification(
          userId,
          `You're Debt Free! 🎉`,
          `Congratulations — your tracked liabilities are at $0 (down from ${formatted}). Enjoy the freedom!`,
          '/',
          'debt_free',
          `debt_free:${userId}`
        ).catch((err) => {
          logger.error(`${LOG_TAG} Failed to send debt-free milestone notification:`, err);
        });
      }
    }
  }
}

export async function createAccountSnapshots(userId: string, dek: Uint8Array, snapshotDate: string) {
  // Fetch ALL accounts regardless of hidden/excluded status — hidden and excluded
  // accounts still need a today-snapshot as the anchor for the backward-pass
  // balance reconstruction used by account history charts.
  const userAccounts = await getDb()
    .select()
    .from(accounts)
    .where(eq(accounts.userId, userId));

  const decrypted = await decryptRows('accounts', userAccounts, dek);

  for (const acc of decrypted) {
    if (acc.type === 'mortgage') {
      try {
        const meta = acc.metadata ? (typeof acc.metadata === 'string' ? JSON.parse(acc.metadata) : acc.metadata) : {};
        const status = meta.mortgageStatus;
        const endEventDateStr = status === 'paid_off' ? meta.payoffDate : (status === 'refinanced' ? meta.refinanceDate : undefined);
        if (endEventDateStr && snapshotDate >= endEventDateStr) {
          continue;
        }
      } catch (e) {
        // Ignore json parse error
      }
    }
    const balanceVal = parseFloat(acc.balance) || 0;
    const encryptedBalance = await encryptField(formatToCents(balanceVal), dek);
    await getDb()
      .insert(accountSnapshots)
      .values({
        userId,
        accountId: acc.id,
        snapshotDate,
        balance: encryptedBalance,
        isSynthetic: false,
      })
      .onConflictDoUpdate({
        target: [accountSnapshots.userId, accountSnapshots.accountId, accountSnapshots.snapshotDate],
        set: {
          balance: encryptedBalance,
          isSynthetic: false,
        },
      });
  }
}

const userRebuildQueues = new Map<string, NodeJS.Timeout>();
const userRebuildChains = new Map<string, Promise<void>>();
