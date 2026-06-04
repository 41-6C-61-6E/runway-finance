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
} from '@/lib/db/schema';
import archiver from 'archiver';

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
  const db = getDb();
  const dek = await getSessionDEK();

  const archive = archiver('zip', { zlib: { level: 6 } });
  const chunks: Buffer[] = [];

  archive.on('data', (chunk: Buffer) => chunks.push(chunk));

  const streamPromise = new Promise<void>((resolve, reject) => {
    archive.on('end', resolve);
    archive.on('error', reject);
  });

  for (const { table, dbName, label } of CSV_TABLES) {
    const rows = await db.select().from(table).where(eq(table.userId, userId));
    const decrypted = await Promise.all(
      rows.map((row) => decryptRow(dbName, row as Record<string, unknown>, dek)),
    );
    const csv = toCsv(decrypted);
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
