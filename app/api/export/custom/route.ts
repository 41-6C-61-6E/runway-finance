import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { getSessionDEK } from '@/lib/crypto-context';
import { decryptRow } from '@/lib/crypto';
import { eq, and, gte, lte } from 'drizzle-orm';
import {
  accounts,
  categories,
  transactions,
  categoryRules,
  budgets,
  financialGoals,
  netWorthSnapshots,
  accountSnapshots,
  holdingSnapshots,
  paystubs,
  plans,
  planAccounts,
  planEvents,
  planFlows,
  planSettings,
} from '@/lib/db/schema';
import { ZipArchive } from 'archiver';
import { toCsv, formatFirePlanTxt } from '@/lib/utils/export-formatter';

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const userId = session.user.id;
  const dataUserId = (session.user as any).dataUserId ?? userId;
  const db = getDb();
  const dek = await getSessionDEK();

  try {
    const body = await req.json();
    const { datasets = [], format = 'zip', startDate, endDate } = body;

    if (!Array.isArray(datasets) || datasets.length === 0) {
      return NextResponse.json({ error: 'At least one dataset must be selected' }, { status: 400 });
    }

    const archive = new ZipArchive({ zlib: { level: 6 } });
    const chunks: Buffer[] = [];

    archive.on('data', (chunk: Buffer) => chunks.push(chunk));

    const streamPromise = new Promise<void>((resolve, reject) => {
      archive.on('end', resolve);
      archive.on('error', reject);
    });

    const accountsRaw = await db.select().from(accounts).where(eq(accounts.userId, dataUserId));
    const decryptedAccounts = await Promise.all(
      accountsRaw.map((r) => decryptRow('accounts', r as Record<string, unknown>, dek))
    );
    const accountMap = new Map<string, string>(
      decryptedAccounts.map((a) => [a.id as string, a.name as string])
    );

    const categoriesRaw = await db.select().from(categories).where(eq(categories.userId, dataUserId));
    const decryptedCategories = await Promise.all(
      categoriesRaw.map((r) => decryptRow('categories', r as Record<string, unknown>, dek))
    );
    const categoryMap = new Map<string, string>(
      decryptedCategories.map((c) => [c.id as string, c.name as string])
    );

    // 1. Transactions
    if (datasets.includes('transactions')) {
      const conds = [eq(transactions.userId, dataUserId), eq(transactions.deleted, false)];
      if (startDate) conds.push(gte(transactions.date, startDate));
      if (endDate) conds.push(lte(transactions.date, endDate));

      const txsRaw = await db.select().from(transactions).where(and(...conds));
      const decTxs = await Promise.all(
        txsRaw.map((r) => decryptRow('transactions', r as Record<string, unknown>, dek))
      );
      decTxs.sort((a, b) => (b.date as string).localeCompare(a.date as string));

      const mapped = decTxs.map((t) => ({
        Date: t.date || '',
        Account: accountMap.get(t.accountId as string) || t.accountId || '',
        Category: categoryMap.get(t.categoryId as string) || t.categoryId || 'Uncategorized',
        Payee: t.payee || '',
        Description: t.description || '',
        Amount: parseFloat(String(t.amount || '0')),
        Memo: t.memo || '',
        Notes: t.notes || '',
        Status: t.reviewed ? 'Reviewed' : 'Unreviewed',
      }));
      archive.append(toCsv(mapped), { name: 'transactions.csv' });
    }

    // 2. Accounts
    if (datasets.includes('accounts')) {
      const mappedAccs = decryptedAccounts.map((a) => ({
        Name: a.name || '',
        Type: a.type || '',
        Subtype: a.subtype || '',
        Balance: parseFloat(String(a.currentBalance || '0')),
        Currency: a.currency || 'USD',
        Institution: a.institutionName || '',
        IsActive: a.isClosed ? 'No' : 'Yes',
      }));
      archive.append(toCsv(mappedAccs), { name: 'accounts.csv' });
    }

    // 3. Categories
    if (datasets.includes('categories')) {
      const mappedCats = decryptedCategories.map((c) => ({
        Name: c.name || '',
        Type: c.isIncome ? 'Income' : 'Expense',
        Color: c.color || '',
        CategoryType: c.categoryType || 'standard',
      }));
      archive.append(toCsv(mappedCats), { name: 'categories.csv' });
    }

    // 4. Net Worth & Account Snapshots
    if (datasets.includes('snapshots')) {
      const nwRaw = await db.select().from(netWorthSnapshots).where(eq(netWorthSnapshots.userId, dataUserId));
      const decNw = await Promise.all(nwRaw.map((r) => decryptRow('net_worth_snapshots', r as Record<string, unknown>, dek)));
      decNw.sort((a, b) => (b.snapshotDate as string).localeCompare(a.snapshotDate as string));

      const mappedNw = decNw.map((s) => ({
        Date: s.snapshotDate || '',
        TotalNetWorth: parseFloat(String(s.totalNetWorth || '0')),
        TotalAssets: parseFloat(String(s.totalAssets || '0')),
        TotalLiabilities: parseFloat(String(s.totalLiabilities || '0')),
      }));
      archive.append(toCsv(mappedNw), { name: 'net_worth_snapshots.csv' });

      const accSnapRaw = await db.select().from(accountSnapshots).where(eq(accountSnapshots.userId, dataUserId));
      const decAccSnap = await Promise.all(accSnapRaw.map((r) => decryptRow('account_snapshots', r as Record<string, unknown>, dek)));
      const mappedAccSnap = decAccSnap.map((s) => ({
        Date: s.snapshotDate || '',
        Account: accountMap.get(s.accountId as string) || s.accountId || '',
        Balance: parseFloat(String(s.balance || '0')),
      }));
      archive.append(toCsv(mappedAccSnap), { name: 'account_snapshots.csv' });
    }

    // 5. Budgets
    if (datasets.includes('budgets')) {
      const bRaw = await db.select().from(budgets).where(eq(budgets.userId, dataUserId));
      const decBudgets = await Promise.all(bRaw.map((r) => decryptRow('budgets', r as Record<string, unknown>, dek)));
      const mappedBudgets = decBudgets.map((b) => ({
        Category: categoryMap.get(b.categoryId as string) || b.categoryId || 'Global',
        Amount: parseFloat(String(b.amount || '0')),
        Period: b.period || 'monthly',
        StartDate: b.startDate || '',
      }));
      archive.append(toCsv(mappedBudgets), { name: 'budgets.csv' });
    }

    // 6. FIRE Plans
    if (datasets.includes('fire_plans')) {
      const pRaw = await db.select().from(plans).where(eq(plans.userId, dataUserId));
      let txtAll = '';
      for (const pRow of pRaw) {
        const decPlan = await decryptRow('plans', pRow as Record<string, unknown>, dek);
        const [rawAccounts, rawEvents, rawFlows, rawSettings] = await Promise.all([
          db.select().from(planAccounts).where(eq(planAccounts.planId, pRow.id)),
          db.select().from(planEvents).where(eq(planEvents.planId, pRow.id)),
          db.select().from(planFlows).where(eq(planFlows.planId, pRow.id)),
          db.select().from(planSettings).where(eq(planSettings.planId, pRow.id)).limit(1),
        ]);
        const decAccounts = await Promise.all(rawAccounts.map((a) => decryptRow('plan_accounts', a as Record<string, unknown>, dek)));
        const decEvents = await Promise.all(rawEvents.map((e) => decryptRow('plan_events', e as Record<string, unknown>, dek)));
        const decFlows = await Promise.all(rawFlows.map((f) => decryptRow('plan_flows', f as Record<string, unknown>, dek)));
        const decSettings = rawSettings[0] ? await decryptRow('plan_settings', rawSettings[0] as Record<string, unknown>, dek) : null;

        txtAll += formatFirePlanTxt({
          details: decPlan,
          accounts: decAccounts,
          events: decEvents,
          flows: decFlows,
          settings: decSettings,
        }) + '\n\n';
      }
      if (txtAll) {
        archive.append(txtAll, { name: 'fire_plans_report.txt' });
      }
    }

    // 7. Paystubs
    if (datasets.includes('paystubs')) {
      const paystubsRaw = await db.select().from(paystubs).where(eq(paystubs.userId, dataUserId));
      const decPaystubs = await Promise.all(paystubsRaw.map((r) => decryptRow('paystubs', r as Record<string, unknown>, dek)));
      const mappedPaystubs = decPaystubs.map((p) => ({
        Employer: p.employerName || '',
        CheckDate: p.checkDate || '',
        GrossPay: parseFloat(String(p.grossPay || '0')),
        NetPay: parseFloat(String(p.netPay || '0')),
        PayPeriodStart: p.payPeriodStart || '',
        PayPeriodEnd: p.payPeriodEnd || '',
      }));
      archive.append(toCsv(mappedPaystubs), { name: 'paystubs.csv' });
    }

    await archive.finalize();
    await streamPromise;

    const buffer = Buffer.concat(chunks);
    const dateStr = new Date().toISOString().split('T')[0];

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="custom_finance_export_${dateStr}.zip"`,
        'Content-Length': String(buffer.length),
      },
    });
  } catch (err) {
    console.error('Error creating custom export zip:', err);
    return NextResponse.json({ error: 'Failed to create custom export package' }, { status: 500 });
  }
}
