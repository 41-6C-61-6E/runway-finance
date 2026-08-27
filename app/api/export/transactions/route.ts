import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { getSessionDEK } from '@/lib/crypto-context';
import { decryptRow } from '@/lib/crypto';
import { eq, and, gte, lte, notInArray } from 'drizzle-orm';
import { accounts, categories, transactions } from '@/lib/db/schema';
import { toCsv } from '@/lib/utils/export-formatter';
import { getHiddenAccountIdsForUser } from '@/lib/data-visibility';

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const searchParams = req.nextUrl.searchParams;
  const startDate = searchParams.get('startDate');
  const endDate = searchParams.get('endDate');
  const accountId = searchParams.get('accountId');
  const categoryId = searchParams.get('categoryId');

  const userId = session.user.id;
  const dataUserId = (session.user as any).dataUserId ?? userId;
  const db = getDb();
  const dek = await getSessionDEK();

  // M-1: sensitive accounts hidden from plain members stay out of exports.
  const hiddenAccountIds = await getHiddenAccountIdsForUser(userId, dataUserId);

  try {
    // 1. Fetch Accounts and Categories lookup maps
    // M-1: hidden accounts are not exported (and never enter the name map).
    const accountConditions = [eq(accounts.userId, dataUserId)];
    if (hiddenAccountIds.length > 0) {
      accountConditions.push(notInArray(accounts.id, hiddenAccountIds));
    }
    const accountsRaw = await db.select().from(accounts).where(and(...accountConditions));
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

    // 2. Build transactions query
    const conditions = [eq(transactions.userId, dataUserId), eq(transactions.deleted, false)];
    if (hiddenAccountIds.length > 0) {
      conditions.push(notInArray(transactions.accountId, hiddenAccountIds));
    }

    if (startDate) {
      conditions.push(gte(transactions.date, startDate));
    }
    if (endDate) {
      conditions.push(lte(transactions.date, endDate));
    }
    if (accountId && accountId !== 'all') {
      conditions.push(eq(transactions.accountId, accountId));
    }
    if (categoryId && categoryId !== 'all') {
      conditions.push(eq(transactions.categoryId, categoryId));
    }

    const txRowsRaw = await db
      .select()
      .from(transactions)
      .where(and(...conditions));

    const decryptedTxs = await Promise.all(
      txRowsRaw.map((r) => decryptRow('transactions', r as Record<string, unknown>, dek))
    );

    // Sort by date descending
    decryptedTxs.sort((a, b) => (b.date as string).localeCompare(a.date as string));

    // Map rows for CSV output
    const csvData = decryptedTxs.map((t) => {
      const amtNum = parseFloat(String(t.amount || '0'));
      return {
        Date: t.date || '',
        Account: accountMap.get(t.accountId as string) || t.accountId || '',
        Category: categoryMap.get(t.categoryId as string) || t.categoryId || 'Uncategorized',
        Payee: t.payee || '',
        Description: t.description || '',
        Amount: amtNum,
        Type: amtNum < 0 ? 'Debit' : 'Credit',
        Memo: t.memo || '',
        Notes: t.notes || '',
        Pending: t.pending ? 'Yes' : 'No',
        Status: t.reviewed ? 'Reviewed' : 'Unreviewed',
        Source: t.source || 'bank',
      };
    });

    const csvContent = toCsv(csvData);
    const dateStr = new Date().toISOString().split('T')[0];

    return new NextResponse(csvContent, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="transactions_export_${dateStr}.csv"`,
      },
    });
  } catch (err) {
    console.error('Error exporting transactions:', err);
    return NextResponse.json({ error: 'Failed to export transactions' }, { status: 500 });
  }
}
