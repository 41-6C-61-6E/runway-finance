import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getDb } from '@/lib/db';
import {
  accounts,
  accountSnapshots,
  transactions,
  categories,
  budgets,
  recurringStreams,
  userSettings,
} from '@/lib/db/schema';
import { eq, and, sql, inArray, desc, gte } from 'drizzle-orm';
import { logger } from '@/lib/logger';
import { getSessionDEK } from '@/lib/crypto-context';
import { decryptField, decryptRows } from '@/lib/crypto';
import { filterReportableAccounts } from '@/lib/utils/account-scope';
import {
  detectRecurringStreams,
  generateBalanceForecast,
  generateSubscriptionInsights,
  type DetectedRecurringStream,
  type RawTransactionInput,
} from '@/lib/services/recurring-engine';

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  }

  const userId = session.user.id;
  const dataUserId = (session.user as any).dataUserId ?? session.user.id;
  const dek = await getSessionDEK();
  const { searchParams } = new URL(request.url);

  const horizonParam = searchParams.get('horizon') || '90d';
  const horizonDays =
    horizonParam === '30d' ? 30 :
    horizonParam === '60d' ? 60 :
    horizonParam === '90d' ? 90 :
    horizonParam === '6m' ? 180 :
    horizonParam === '1y' ? 365 : 90;

  const accountIdsParam = searchParams.get('accountIds');

  const db = getDb();

  try {
    // 1. Fetch user accounts
    const userAccounts = await db
      .select()
      .from(accounts)
      .where(
        and(
          eq(accounts.userId, dataUserId),
          eq(accounts.isHidden, false),
          eq(accounts.isExcludedFromNetWorth, false)
        )
      );

    const decryptedAccounts = await decryptRows('accounts', userAccounts, dek);
    const reportableAccounts = filterReportableAccounts(decryptedAccounts);

    // Filter to liquid/banking/credit accounts for cash balance runway
    const LIQUID_TYPES = new Set([
      'checking', 'savings', 'cash', 'depository', 'credit', 'credit card', 'creditcard', 'hsachecking', 'money market'
    ]);

    let targetAccounts = reportableAccounts.filter((a: any) =>
      LIQUID_TYPES.has((a.type || '').toLowerCase())
    );

    if (accountIdsParam) {
      const allowedIds = new Set(accountIdsParam.split(',').filter(Boolean));
      targetAccounts = targetAccounts.filter((a: any) => allowedIds.has(a.id));
    }

    if (targetAccounts.length === 0) {
      targetAccounts = reportableAccounts.length > 0 ? reportableAccounts : decryptedAccounts;
    }

    const targetAccountIds = targetAccounts.map((a: any) => a.id);

    // 2. Fetch recent transactions (past 12 months) for recurring pattern detection
    const lookbackDate = new Date();
    lookbackDate.setMonth(lookbackDate.getMonth() - 12);
    const lookbackDateStr = lookbackDate.toISOString().split('T')[0];

    const catRows = await db
      .select()
      .from(categories)
      .where(eq(categories.userId, dataUserId));
    const catById = new Map(catRows.map((c) => [c.id.toString(), c]));

    const txConditions = [
      eq(transactions.userId, dataUserId),
      gte(transactions.date, lookbackDateStr),
      eq(transactions.pending, false),
      eq(transactions.deleted, false),
    ];

    if (targetAccountIds.length > 0) {
      txConditions.push(inArray(transactions.accountId, targetAccountIds));
    }

    const txRows = await db
      .select({
        id: transactions.id,
        accountId: transactions.accountId,
        amount: transactions.amount,
        description: transactions.description,
        payee: transactions.payee,
        date: transactions.date,
        categoryId: transactions.categoryId,
        pending: transactions.pending,
        deleted: transactions.deleted,
      })
      .from(transactions)
      .where(and(...txConditions))
      .orderBy(desc(transactions.date));

    // Decrypt transactions
    const rawTransactions: RawTransactionInput[] = [];
    for (const tx of txRows) {
      try {
        const decryptedAmtStr = await decryptField(tx.amount, dek);
        const amt = parseFloat(decryptedAmtStr);
        if (isNaN(amt)) continue;

        const cat = tx.categoryId ? catById.get(tx.categoryId.toString()) : undefined;
        if (cat?.excludeFromReports) continue;

        rawTransactions.push({
          id: tx.id,
          accountId: tx.accountId,
          amount: amt,
          description: tx.description || '',
          payee: tx.payee || tx.description || '',
          date: tx.date,
          categoryId: tx.categoryId,
          categoryName: cat?.name || null,
          isIncome: cat?.isIncome || amt > 0,
        });
      } catch (err) {
        logger.error('Failed to decrypt transaction in forecast', { id: tx.id, error: err });
      }
    }

    // 3. Auto-detect recurring streams from transactions
    const autoDetectedStreams = detectRecurringStreams(rawTransactions, { minOccurrences: 2 });

    // 4. Fetch stored user-confirmed or custom recurring streams from database (with self-healing fallback)
    let storedStreamRows: any[] = [];
    try {
      storedStreamRows = await db
        .select()
        .from(recurringStreams)
        .where(eq(recurringStreams.userId, dataUserId));
    } catch (err: any) {
      // If table doesn't exist yet, self-heal and create it
      if (err?.code === '42P01' || String(err?.message || '').includes('recurring_streams')) {
        logger.info('[forecast] Self-healing recurring_streams table');
        await db.execute(sql`
          CREATE TABLE IF NOT EXISTS recurring_streams (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            user_id TEXT NOT NULL,
            account_id UUID REFERENCES accounts(id) ON DELETE CASCADE,
            category_id UUID REFERENCES categories(id) ON DELETE SET NULL,
            name TEXT NOT NULL,
            payee TEXT,
            amount TEXT NOT NULL,
            currency TEXT NOT NULL DEFAULT 'USD',
            type TEXT NOT NULL DEFAULT 'subscription',
            frequency TEXT NOT NULL DEFAULT 'monthly',
            interval_days INTEGER,
            anchor_date DATE NOT NULL,
            next_expected_date DATE NOT NULL,
            is_auto_detected BOOLEAN NOT NULL DEFAULT true,
            is_confirmed BOOLEAN NOT NULL DEFAULT false,
            is_active BOOLEAN NOT NULL DEFAULT true,
            confidence INTEGER NOT NULL DEFAULT 100,
            is_variable_amount BOOLEAN NOT NULL DEFAULT false,
            average_amount TEXT,
            metadata JSONB DEFAULT '{}',
            created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
          );
          CREATE INDEX IF NOT EXISTS idx_recurring_streams_user_id ON recurring_streams (user_id);
        `);
        storedStreamRows = await db
          .select()
          .from(recurringStreams)
          .where(eq(recurringStreams.userId, dataUserId));
      } else {
        logger.error('[forecast] Error querying recurring_streams', { error: err });
      }
    }

    const decryptedStoredStreams = await decryptRows('recurring_streams', storedStreamRows, dek);

    // Merge stored streams with auto-detected streams
    const finalStreamsMap = new Map<string, DetectedRecurringStream>();

    // Add auto-detected first
    for (const stream of autoDetectedStreams) {
      finalStreamsMap.set(stream.normalizedName.toLowerCase(), stream);
    }

    // Overwrite or add stored streams (as user overrides take precedence)
    for (const row of decryptedStoredStreams) {
      const normKey = (row.payee || row.name || '').toLowerCase();
      const amt = parseFloat(row.amount || '0');
      const avgAmt = row.averageAmount ? parseFloat(row.averageAmount) : amt;

      finalStreamsMap.set(normKey, {
        id: row.id,
        name: row.name,
        payee: row.payee || row.name,
        normalizedName: row.payee || row.name,
        amount: amt,
        type: (row.type as any) || 'subscription',
        frequency: (row.frequency as any) || 'monthly',
        intervalDays: row.intervalDays || 30,
        anchorDate: row.anchorDate,
        nextExpectedDate: row.nextExpectedDate,
        accountId: row.accountId || null,
        categoryId: row.categoryId || null,
        isAutoDetected: row.isAutoDetected,
        isConfirmed: row.isConfirmed,
        isActive: row.isActive,
        confidence: row.confidence ?? 100,
        isVariableAmount: row.isVariableAmount ?? false,
        averageAmount: avgAmt,
        matchedTransactionIds: (row.metadata as any)?.matchedTransactionIds || [],
        lastOccurrenceDate: (row.metadata as any)?.lastOccurrenceDate || row.anchorDate,
        status: row.isActive ? 'active' : 'paused',
        priceHistory: (row.metadata as any)?.priceHistory || [],
      });
    }

    const mergedRecurringStreams = Array.from(finalStreamsMap.values());

    // 5. Fetch recurring budgets for discretionary burn
    const budgetRows = await db
      .select({
        id: budgets.id,
        amount: budgets.amount,
        periodType: budgets.periodType,
        isRecurring: budgets.isRecurring,
        fundingAccountId: budgets.fundingAccountId,
        categoryId: budgets.categoryId,
        isIncome: categories.isIncome,
        excludeFromReports: categories.excludeFromReports,
      })
      .from(budgets)
      .leftJoin(categories, eq(budgets.categoryId, categories.id))
      .where(
        and(
          eq(budgets.userId, dataUserId),
          eq(budgets.isRecurring, true)
        )
      );

    const activeBudgets = budgetRows.filter((b) => !b.excludeFromReports);

    const decryptedBudgets = await Promise.all(
      activeBudgets.map(async (b) => ({
        amount: parseFloat(await decryptField(b.amount, dek)) || 0,
        isIncome: b.isIncome ?? false,
        fundingAccountId: b.fundingAccountId,
        periodType: b.periodType,
      }))
    );

    // 6. Fetch recent historical account snapshots (last 30 days) for historical continuity line
    const snapStartDate = new Date();
    snapStartDate.setDate(snapStartDate.getDate() - 30);
    const snapStartStr = snapStartDate.toISOString().split('T')[0];

    const snapshotRows = await db
      .select({
        accountId: accountSnapshots.accountId,
        balance: accountSnapshots.balance,
        snapshotDate: accountSnapshots.snapshotDate,
      })
      .from(accountSnapshots)
      .where(
        and(
          eq(accountSnapshots.userId, dataUserId),
          gte(accountSnapshots.snapshotDate, snapStartStr),
          inArray(accountSnapshots.accountId, targetAccountIds.length > 0 ? targetAccountIds : ['00000000-0000-0000-0000-000000000000'])
        )
      )
      .orderBy(accountSnapshots.snapshotDate);

    const decryptedSnapshots = await Promise.all(
      snapshotRows.map(async (s) => ({
        accountId: s.accountId,
        balance: parseFloat(await decryptField(s.balance, dek)) || 0,
        snapshotDate: s.snapshotDate,
      }))
    );

    // Group historical snapshots by date
    const historicalByDate = new Map<string, { totalBalance: number; accounts: Record<string, number> }>();
    for (const snap of decryptedSnapshots) {
      if (!historicalByDate.has(snap.snapshotDate)) {
        historicalByDate.set(snap.snapshotDate, { totalBalance: 0, accounts: {} });
      }
      const dayData = historicalByDate.get(snap.snapshotDate)!;
      dayData.accounts[snap.accountId] = snap.balance;
      dayData.totalBalance += snap.balance;
    }

    const historicalSeries = Array.from(historicalByDate.entries())
      .map(([date, val]) => ({
        date,
        totalBalance: Math.round(val.totalBalance * 100) / 100,
        accounts: val.accounts,
      }))
      .sort((a, b) => a.date.localeCompare(b.date));

    // 7. Run Balance Forecast Generator
    const accountInputs = targetAccounts.map((a: any) => ({
      id: a.id,
      name: a.name,
      balance: parseFloat(a.balance || '0'),
      type: a.type,
      isLiquid: LIQUID_TYPES.has((a.type || '').toLowerCase()),
    }));

    const forecastResult = generateBalanceForecast({
      accounts: accountInputs,
      recurringStreams: mergedRecurringStreams,
      budgets: decryptedBudgets,
      horizonDays,
      includeBudgets: true,
      safeReserve: 1000,
    });

    // 8. Generate Subscription Insights
    const subscriptionInsights = generateSubscriptionInsights(mergedRecurringStreams);

    return NextResponse.json({
      projections: forecastResult.points,
      historical: historicalSeries,
      summary: forecastResult.summary,
      recurringStreams: mergedRecurringStreams,
      accounts: targetAccounts.map((a: any) => ({
        id: a.id,
        name: a.name,
        type: a.type,
        balance: parseFloat(a.balance || '0'),
      })),
      insights: subscriptionInsights,
      config: {
        horizon: horizonParam,
        horizonDays,
      },
    });
  } catch (error) {
    logger.error('Error generating account forecast', { error });
    return NextResponse.json(
      { error: 'internal_error', message: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
