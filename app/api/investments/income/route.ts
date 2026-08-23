import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { accounts, transactions, accountSnapshots } from '@/lib/db/schema';
import { eq, and, desc, inArray, gte, lt, lte } from 'drizzle-orm';
import { logger } from '@/lib/logger';
import { getSessionDEK } from '@/lib/crypto-context';
import { decryptRows, decryptField } from '@/lib/crypto';
import { isInvestmentAccount, filterReportableAccounts } from '@/lib/utils/account-scope';
import {
  classifyTransaction,
  bucketCashFlow,
  yearMonthOf,
  addMonthsClamped,
  monthsBetween,
  buildMonthlyFlows,
} from '@/lib/utils/investment-flows';
import { timeframeToMonths } from '@/lib/utils/timeframe';

const LOG_TAG = '[api-investments-income]';

function round2(v: number): number {
  return Math.round(v * 100) / 100;
}

/** Start/end "YYYY-MM" bounds for a supported timeframe, relative to `now`. */
function timeframeMonthBounds(timeframe: string, now: Date): { startMonth: string; endMonth: string; count: number } {
  const endMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const count = timeframeToMonths(timeframe === '12m' ? '1y' : timeframe);
  let startMonth: string;
  if (timeframe === 'ytd') {
    startMonth = `${now.getFullYear()}-01`;
  } else if (timeframe === 'all') {
    // Cap the transaction window at 60 months to keep payloads bounded.
    startMonth = addMonthsClamped(endMonth, -59);
  } else {
    startMonth = addMonthsClamped(endMonth, -(count - 1));
  }
  return { startMonth, endMonth, count };
}

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'unauthenticated', message: 'Authentication required' }, { status: 401 });
  }

  const dataUserId = (session.user as any).dataUserId ?? session.user.id;
  const dek = await getSessionDEK();
  const { searchParams } = new URL(request.url);
  const timeframe = searchParams.get('timeframe') || '1y';

  const now = new Date();
  const { startMonth, endMonth } = timeframeMonthBounds(timeframe, now);
  const startStr = `${startMonth}-01`;
  const endStr = addMonthsClamped(endMonth, 1) + '-01'; // exclusive bound

  try {
    // 1. Reportable (non-hidden, non-excluded) investment accounts
    const userAccounts = await getDb()
      .select()
      .from(accounts)
      .where(eq(accounts.userId, dataUserId));

    const decryptedAccounts = await decryptRows('accounts', userAccounts, dek);
    const investmentAccounts = filterReportableAccounts(decryptedAccounts).filter((acc) =>
      isInvestmentAccount(acc.type)
    );

    if (investmentAccounts.length === 0) {
      return NextResponse.json({
        months: monthsBetween(startMonth, endMonth).map((m) => ({ month: m, contributions: 0, withdrawals: 0, income: 0, growth: 0, losses: 0, net: 0, delta: null })),
        start: startStr,
        end: endStr, // exclusive (1st of the month after the range)
        summary: {
          contributions: 0, withdrawals: 0, income: 0, growth: 0, losses: 0, net: 0,
          annualizedIncomePct: null,
          reinvested: 0,
          topIncomeSources: [],
          monthCount: monthsBetween(startMonth, endMonth).length,
          monthsWithSnapshots: 0,
        },
        transactions: [],
        hasSnapshots: false,
      });
    }

    const accountIds = investmentAccounts.map((acc) => acc.id);

    // 2. Classified transactions in range
    const rawTxns = await getDb()
      .select({
        id: transactions.id,
        accountId: transactions.accountId,
        date: transactions.date,
        amount: transactions.amount,
        description: transactions.description,
        payee: transactions.payee,
        pending: transactions.pending,
        externalId: transactions.externalId,
      })
      .from(transactions)
      .where(
        and(
          eq(transactions.userId, dataUserId),
          eq(transactions.deleted, false),
          eq(transactions.ignored, false),
          inArray(transactions.accountId, accountIds),
          gte(transactions.date, startStr),
          // endStr is the exclusive bound (1st of the month after the range):
          // use lt so a txn dated exactly on that day is not misattributed.
          lt(transactions.date, endStr)
        )
      )
      .orderBy(desc(transactions.date));

    const decryptedTxns = await decryptRows('transactions', rawTxns, dek);

    // 3. Balance snapshots (real + synthetic) up to the range end
    const snaps = await getDb()
      .select({
        snapshotDate: accountSnapshots.snapshotDate,
        accountId: accountSnapshots.accountId,
        balance: accountSnapshots.balance,
      })
      .from(accountSnapshots)
      .where(
        and(
          eq(accountSnapshots.userId, dataUserId),
          inArray(accountSnapshots.accountId, accountIds),
          lte(accountSnapshots.snapshotDate, endStr)
        )
      )
      .orderBy(accountSnapshots.snapshotDate);

    // Per-account running balance aggregated into a total, keyed by snapshot date
    const balanceByDate = new Map<string, number>();
    if (snaps.length > 0) {
      const running: Record<string, number> = {};
      for (const s of snaps) {
        let bal: number;
        try {
          const dec = await decryptField(s.balance, dek);
          bal = parseFloat(dec);
          if (isNaN(bal)) bal = 0;
        } catch {
          bal = 0;
        }
        running[s.accountId] = bal;
        let total = 0;
        for (const v of Object.values(running)) total += v;
        balanceByDate.set(s.snapshotDate, total);
      }
    }

    const sortedDates = [...balanceByDate.keys()].sort();
    /** Latest total balance on/before `dateStr`, or null if none. */
    const balanceAtOrBefore = (dateStr: string): number | null => {
      let lo = 0;
      let hi = sortedDates.length - 1;
      let found: string | null = null;
      while (lo <= hi) {
        const mid = (lo + hi) >> 1;
        if (sortedDates[mid] <= dateStr) {
          found = sortedDates[mid];
          lo = mid + 1;
        } else {
          hi = mid - 1;
        }
      }
      return found ? balanceByDate.get(found) ?? null : null;
    };

    const hasSnapshots = sortedDates.length > 0;

    // Month deltas: end-of-month balance − start-of-month balance.
    // A delta is only valid when both boundary balances exist AND at least
    // one snapshot was taken inside the month itself (so the end balance
    // reflects that month's market movement, not just the previous month's).
    const months = monthsBetween(startMonth, endMonth);
    const monthHasSnapshot: Record<string, boolean> = {};
    for (const d of sortedDates) {
      const ym = d.slice(0, 7);
      monthHasSnapshot[ym] = true;
    }

    const deltas: Record<string, number | null> = {};
    for (const m of months) {
      if (!monthHasSnapshot[m]) {
        deltas[m] = null;
        continue;
      }
      const startBal = balanceAtOrBefore(`${m}-01`);
      const nextFirst = `${addMonthsClamped(m, 1)}-01`;
      // Latest snapshot strictly before next month start
      let lo = 0;
      let hi = sortedDates.length - 1;
      let found: string | null = null;
      while (lo <= hi) {
        const mid = (lo + hi) >> 1;
        if (sortedDates[mid] < nextFirst) {
          found = sortedDates[mid];
          lo = mid + 1;
        } else {
          hi = mid - 1;
        }
      }
      const endBal = found ? balanceByDate.get(found) ?? null : null;
      if (startBal === null || endBal === null || found === null) {
        deltas[m] = null;
      } else {
        deltas[m] = endBal - startBal;
      }
    }

    // 4. Classify + bucket transactions
    const contributions: Record<string, number> = {};
    const withdrawals: Record<string, number> = {};
    const income: Record<string, number> = {};
    const cashFlows: Record<string, number> = {};

    const accById = new Map(investmentAccounts.map((a) => [a.id, a]));
    const classified = decryptedTxns
      .map((tx) => {
        const amount = typeof tx.amount === 'string' ? parseFloat(tx.amount) : Number(tx.amount);
        const amt = Number.isFinite(amount) ? amount : 0;
        const type = classifyTransaction(tx.description, tx.payee, amt);
        const acc = accById.get(tx.accountId);
        const rec = {
          id: tx.id,
          date: String(tx.date),
          amount: amt,
          description: tx.description,
          payee: tx.payee,
          pending: !!tx.pending,
            accountId: tx.accountId,
            externalId: tx.externalId,
          accountName: acc?.name ?? 'Investment Account',
          institutionName: acc?.institution ?? 'Brokerage',
          type,
        };

        const bucket = bucketCashFlow(type, amt);
        const ym = yearMonthOf(rec.date);
        if (bucket) {
          if (bucket.bucket === 'income') income[ym] = round2((income[ym] ?? 0) + amt);
          else if (bucket.bucket === 'contributions') contributions[ym] = round2((contributions[ym] ?? 0) + bucket.mag);
          else withdrawals[ym] = round2((withdrawals[ym] ?? 0) + bucket.mag);
          cashFlows[ym] = round2((cashFlows[ym] ?? 0) + amt);
        }
        return rec;
      });

    // 5. Assemble monthly series + summary
    const monthly = buildMonthlyFlows(months, { contributions, withdrawals, income, cashFlows, deltas });
    const withDeltas = monthly.filter((m) => m.delta !== null);

    const sum = (fn: (m: (typeof monthly)[number]) => number) => round2(monthly.reduce((s, m) => s + fn(m), 0));
    const contributionsTotal = sum((m) => m.contributions);
    const withdrawalsTotal = sum((m) => m.withdrawals);
    const incomeTotal = sum((m) => m.income);
    const growthTotal = sum((m) => m.growth);
    const lossesTotal = sum((m) => m.losses);
    const netTotal = round2(contributionsTotal - withdrawalsTotal + incomeTotal + growthTotal - lossesTotal);

    // Annualized income yield: mean monthly income × 12 / mean starting balance.
    let annualizedIncomePct: number | null = null;
    if (withDeltas.length > 0) {
      const meanIncome = incomeTotal / months.length;
      let startSum = 0;
      let startCount = 0;
      for (const m of withDeltas) {
        const sb = balanceAtOrBefore(`${m.month}-01`);
        if (sb !== null) {
          startSum += sb;
          startCount++;
        }
      }
      const meanStart = startCount > 0 ? startSum / startCount : 0;
      if (meanStart > 0) {
        annualizedIncomePct = round2((meanIncome * 12 / meanStart) * 100);
      }
    }

    const reinvested = round2(
      classified.filter((t) => t.type === 'reinvestment').reduce((s, t) => s + Math.abs(t.amount), 0)
    );

    // Top income sources (dividends + interest) payee by payee.
    const incomeByPayee = new Map<string, number>();
    for (const t of classified) {
      if ((t.type === 'dividend' || t.type === 'interest') && t.amount > 0) {
        const key = (t.payee ?? 'Unknown payee').trim();
        incomeByPayee.set(key, round2((incomeByPayee.get(key) ?? 0) + t.amount));
      }
    }
    const topIncomeSources = [...incomeByPayee.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([payee, total]) => ({ payee, total }));

    const summary = {
      contributions: contributionsTotal,
      withdrawals: withdrawalsTotal,
      income: incomeTotal,
      growth: growthTotal,
      losses: lossesTotal,
      net: netTotal,
      annualizedIncomePct,
      reinvested,
      topIncomeSources,
      monthCount: months.length,
      monthsWithSnapshots: withDeltas.length,
    };

    return NextResponse.json({
      months: monthly,
      summary,
      start: startStr,
      end: endStr, // exclusive (1st of the month after the range)
      transactions: classified,
      hasSnapshots,
    });
  } catch (error) {
    logger.error(`${LOG_TAG} Error fetching investment income`, {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      { error: 'internal_error', message: 'Failed to fetch investment income' },
      { status: 500 }
    );
  }
}
