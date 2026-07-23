import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { getSessionDEK } from '@/lib/crypto-context';
import { decryptRow } from '@/lib/crypto';
import { eq } from 'drizzle-orm';
import {
  accounts,
  categories,
  transactions,
  categoryRules,
  budgets,
  financialGoals,
  netWorthSnapshots,
  accountSnapshots,
  monthlyCashFlow,
  categorySpendingSummary,
  categoryIncomeSummary,

  simplifinConnections,
  aiProviders,
  tags,
  importLog,
  paystubs,
} from '@/lib/db/schema';
import { ZipArchive } from 'archiver';

const CSV_TABLES: { table: any; dbName: string; label: string }[] = [
  { table: accounts, dbName: 'accounts', label: 'accounts' },
  { table: categories, dbName: 'categories', label: 'categories' },
  { table: transactions, dbName: 'transactions', label: 'transactions' },
  { table: categoryRules, dbName: 'category_rules', label: 'category_rules' },
  { table: budgets, dbName: 'budgets', label: 'budgets' },
  { table: financialGoals, dbName: 'financial_goals', label: 'financial_goals' },
  { table: netWorthSnapshots, dbName: 'net_worth_snapshots', label: 'net_worth_snapshots' },
  { table: accountSnapshots, dbName: 'account_snapshots', label: 'account_snapshots' },
  { table: monthlyCashFlow, dbName: 'monthly_cash_flow', label: 'monthly_cash_flow' },
  { table: categorySpendingSummary, dbName: 'category_spending_summary', label: 'category_spending_summary' },
  { table: categoryIncomeSummary, dbName: 'category_income_summary', label: 'category_income_summary' },

  { table: simplifinConnections, dbName: 'simplefin_connections', label: 'simplefin_connections' },
  { table: aiProviders, dbName: 'ai_providers', label: 'ai_providers' },
];

function toCsv(rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return '';
  const headers = Object.keys(rows[0]);
  const lines = [headers.join(',')];
  for (const row of rows) {
    const vals = headers.map((h) => {
      const v = row[h];
      if (v === null || v === undefined) return '';
      const s = String(typeof v === 'object' ? JSON.stringify(v) : v);
      if (s.includes(',') || s.includes('"') || s.includes('\n') || s.includes('\r')) {
        return `"${s.replace(/"/g, '""')}"`;
      }
      return s;
    });
    lines.push(vals.join(','));
  }
  return lines.join('\n');
}

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const userId = session.user.id;
  const dataUserId = (session.user as any).dataUserId ?? session.user.id;
  const db = getDb();
  const dek = await getSessionDEK();

  // Load lookup tables to decode IDs
  const accountsRaw = await db.select().from(accounts).where(eq(accounts.userId, dataUserId));
  const decryptedAccounts = await Promise.all(
    accountsRaw.map((row) => decryptRow('accounts', row as Record<string, unknown>, dek)),
  );
  const accountMap = new Map<string, string>(
    decryptedAccounts.map((a) => [a.id as string, a.name as string]),
  );

  const categoriesRaw = await db.select().from(categories).where(eq(categories.userId, dataUserId));
  const decryptedCategories = await Promise.all(
    categoriesRaw.map((row) => decryptRow('categories', row as Record<string, unknown>, dek)),
  );
  const categoryMap = new Map<string, string>(
    decryptedCategories.map((c) => [c.id as string, c.name as string]),
  );

  const connectionsRaw = await db.select().from(simplifinConnections).where(eq(simplifinConnections.userId, dataUserId));
  const connectionMap = new Map<string, string>(
    connectionsRaw.map((c) => [c.id as string, c.label as string]),
  );

  const importsRaw = await db.select().from(importLog).where(eq(importLog.userId, dataUserId));
  const importMap = new Map<string, string>(
    importsRaw.map((i) => [i.id as string, i.fileName as string]),
  );

  const tagsRaw = await db.select().from(tags).where(eq(tags.userId, dataUserId));
  const decryptedTags = await Promise.all(
    tagsRaw.map((row) => decryptRow('tags', row as Record<string, unknown>, dek)),
  );
  const tagMap = new Map<string, string>(
    decryptedTags.map((t) => [t.id as string, t.name as string]),
  );

  const paystubsRaw = await db.select().from(paystubs).where(eq(paystubs.userId, dataUserId));
  const paystubMap = new Map<string, string>(
    paystubsRaw.map((p) => [p.id as string, `${p.employerName} (${p.checkDate})`]),
  );

  const ID_DECODERS: Record<string, Array<{ key: string; decodeKey: string; map: Map<string, string> }>> = {
    accounts: [
      { key: 'connectionId', decodeKey: 'connectionLabel', map: connectionMap },
    ],
    categories: [
      { key: 'parentId', decodeKey: 'parentCategoryName', map: categoryMap },
      { key: 'expenseParentId', decodeKey: 'expenseParentCategoryName', map: categoryMap },
    ],
    transactions: [
      { key: 'accountId', decodeKey: 'accountName', map: accountMap },
      { key: 'categoryId', decodeKey: 'categoryName', map: categoryMap },
      { key: 'importId', decodeKey: 'importFileName', map: importMap },
      { key: 'paystubId', decodeKey: 'paystubDescription', map: paystubMap },
    ],
    category_rules: [
      { key: 'setCategoryId', decodeKey: 'setCategoryName', map: categoryMap },
      { key: 'setTagId', decodeKey: 'setTagName', map: tagMap },
    ],
    budgets: [
      { key: 'categoryId', decodeKey: 'categoryName', map: categoryMap },
      { key: 'fundingAccountId', decodeKey: 'fundingAccountName', map: accountMap },
    ],
    financial_goals: [
      { key: 'linkedAccountId', decodeKey: 'linkedAccountName', map: accountMap },
    ],
    account_snapshots: [
      { key: 'accountId', decodeKey: 'accountName', map: accountMap },
      { key: 'importId', decodeKey: 'importFileName', map: importMap },
    ],
    category_spending_summary: [
      { key: 'categoryId', decodeKey: 'categoryName', map: categoryMap },
      { key: 'accountId', decodeKey: 'accountName', map: accountMap },
    ],
    category_income_summary: [
      { key: 'categoryId', decodeKey: 'categoryName', map: categoryMap },
      { key: 'accountId', decodeKey: 'accountName', map: accountMap },
    ],
  };

  const archive = new ZipArchive({ zlib: { level: 6 } });
  const chunks: Buffer[] = [];

  archive.on('data', (chunk: Buffer) => chunks.push(chunk));

  const streamPromise = new Promise<void>((resolve, reject) => {
    archive.on('end', resolve);
    archive.on('error', reject);
  });

  for (const { table, dbName, label } of CSV_TABLES) {
    const targetUserId = dbName === 'ai_providers' ? userId : dataUserId;
    const rows = await db.select().from(table).where(eq(table.userId, targetUserId));
    const decrypted = await Promise.all(
      rows.map((row) => decryptRow(dbName, row as Record<string, unknown>, dek)),
    );

    const decoders = ID_DECODERS[dbName] || [];
    const enriched = decrypted.map((row) => {
      const newRow: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(row)) {
        newRow[k] = v;
        const decoder = decoders.find((d) => d.key === k);
        if (decoder) {
          const idVal = String(v ?? '');
          newRow[decoder.decodeKey] = idVal ? (decoder.map.get(idVal) ?? '') : '';
        }
      }
      return newRow;
    });

    const csv = toCsv(enriched);
    if (csv) {
      archive.append(csv, { name: `${label}.csv` });
    }
  }

  await archive.finalize();
  await streamPromise;

  const buffer = Buffer.concat(chunks);
  const filename = `personal-finance-export-${new Date().toISOString().split('T')[0]}.zip`;

  return new NextResponse(buffer, {
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Content-Length': String(buffer.length),
    },
  });
}
