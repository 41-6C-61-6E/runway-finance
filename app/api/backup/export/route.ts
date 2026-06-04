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
  aiProposals,
  importLog,
  userSettings,
} from '@/lib/db/schema';

const USER_TABLES: { table: any; dbName: string }[] = [
  { table: simplifinConnections, dbName: 'simplefin_connections' },
  { table: categories, dbName: 'categories' },
  { table: accounts, dbName: 'accounts' },
  { table: transactions, dbName: 'transactions' },
  { table: categoryRules, dbName: 'category_rules' },
  { table: budgets, dbName: 'budgets' },
  { table: financialGoals, dbName: 'financial_goals' },
  { table: netWorthSnapshots, dbName: 'net_worth_snapshots' },
  { table: accountSnapshots, dbName: 'account_snapshots' },
  { table: monthlyCashFlow, dbName: 'monthly_cash_flow' },
  { table: categorySpendingSummary, dbName: 'category_spending_summary' },
  { table: categoryIncomeSummary, dbName: 'category_income_summary' },

  { table: aiProviders, dbName: 'ai_providers' },
  { table: aiProposals, dbName: 'ai_proposals' },
  { table: importLog, dbName: 'import_log' },
];

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const userId = session.user.id;
  const db = getDb();
  const dek = await getSessionDEK();

  const data: Record<string, unknown[]> = {};

  for (const { table, dbName } of USER_TABLES) {
    const rows = await db.select().from(table).where(eq(table.userId, userId));
    const decrypted = await Promise.all(
      rows.map((row) => decryptRow(dbName, row as Record<string, unknown>, dek)),
    );
    data[dbName] = decrypted;
  }

  const [settings] = await db
    .select()
    .from(userSettings)
    .where(eq(userSettings.userId, userId))
    .limit(1);

  if (settings) {
    const decryptedSettings = await decryptRow('user_settings', settings as Record<string, unknown>, dek);
    data.user_settings = [decryptedSettings];
  }

  const backup = {
    version: 1,
    exportedAt: new Date().toISOString(),
    data,
  };

  const json = JSON.stringify(backup, null, 2);
  const filename = `personal-finance-backup-${new Date().toISOString().split('T')[0]}.json`;

  return new NextResponse(json, {
    headers: {
      'Content-Type': 'application/json',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  });
}
