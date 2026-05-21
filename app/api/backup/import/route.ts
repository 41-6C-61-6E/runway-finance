import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { getSessionDEK } from '@/lib/crypto-context';
import { encryptRow } from '@/lib/crypto';
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
  retirementProjections,
  fireScenarios,
  simplifinConnections,
  aiProviders,
  aiProposals,
  userSettings,
} from '@/lib/db/schema';
import { getPool } from '@/lib/db';

interface BackupPayload {
  version: number;
  exportedAt: string;
  data: Record<string, unknown[]>;
}

const DELETE_ORDER: { table: any; dbName: string }[] = [
  { table: transactions, dbName: 'transactions' },
  { table: accountSnapshots, dbName: 'account_snapshots' },
  { table: budgets, dbName: 'budgets' },
  { table: financialGoals, dbName: 'financial_goals' },
  { table: categorySpendingSummary, dbName: 'category_spending_summary' },
  { table: categoryIncomeSummary, dbName: 'category_income_summary' },
  { table: categoryRules, dbName: 'category_rules' },
  { table: retirementProjections, dbName: 'retirement_projections' },
  { table: accounts, dbName: 'accounts' },
  { table: simplifinConnections, dbName: 'simplefin_connections' },
  { table: categories, dbName: 'categories' },
  { table: fireScenarios, dbName: 'fire_scenarios' },
  { table: aiProviders, dbName: 'ai_providers' },
  { table: aiProposals, dbName: 'ai_proposals' },
  { table: netWorthSnapshots, dbName: 'net_worth_snapshots' },
  { table: monthlyCashFlow, dbName: 'monthly_cash_flow' },
];

const INSERT_ORDER: { table: any; dbName: string }[] = [
  { table: simplifinConnections, dbName: 'simplefin_connections' },
  { table: fireScenarios, dbName: 'fire_scenarios' },
  { table: categories, dbName: 'categories' },
  { table: accounts, dbName: 'accounts' },
  { table: aiProviders, dbName: 'ai_providers' },
  { table: aiProposals, dbName: 'ai_proposals' },
  { table: netWorthSnapshots, dbName: 'net_worth_snapshots' },
  { table: monthlyCashFlow, dbName: 'monthly_cash_flow' },
  { table: categoryRules, dbName: 'category_rules' },
  { table: budgets, dbName: 'budgets' },
  { table: financialGoals, dbName: 'financial_goals' },
  { table: retirementProjections, dbName: 'retirement_projections' },
  { table: categorySpendingSummary, dbName: 'category_spending_summary' },
  { table: categoryIncomeSummary, dbName: 'category_income_summary' },
  { table: transactions, dbName: 'transactions' },
  { table: accountSnapshots, dbName: 'account_snapshots' },
];

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const userId = session.user.id;
  const db = getDb();
  const dek = await getSessionDEK();

  let backup: BackupPayload;
  try {
    backup = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON in request body' }, { status: 400 });
  }

  if (!backup.version || !backup.data || typeof backup.data !== 'object') {
    return NextResponse.json({ error: 'Invalid backup format' }, { status: 400 });
  }

  if (backup.version !== 1) {
    return NextResponse.json({ error: `Unsupported backup version: ${backup.version}` }, { status: 400 });
  }

  const pool = getPool();
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Delete existing data
    for (const { table, dbName } of DELETE_ORDER) {
      const ids = await db
        .select({ id: table.id })
        .from(table)
        .where(eq(table.userId, userId));
      if (ids.length > 0) {
        await db.delete(table).where(eq(table.userId, userId));
      }
    }

    // Parse user_settings from backup
    const settingsRows = backup.data.user_settings as Record<string, unknown>[] | undefined;
    if (settingsRows && settingsRows.length > 0) {
      const rawSettings = { ...settingsRows[0] };
      delete rawSettings.id;
      delete rawSettings.userId;
      delete rawSettings.createdAt;
      delete rawSettings.updatedAt;

      const encryptedSettings = await encryptRow('user_settings', rawSettings, dek);
      await db
        .update(userSettings)
        .set({ ...encryptedSettings, updatedAt: new Date() })
        .where(eq(userSettings.userId, userId));
    }

    // Insert data in dependency order
    for (const { table, dbName } of INSERT_ORDER) {
      const rows = backup.data[dbName] as Record<string, unknown>[] | undefined;
      if (!rows || rows.length === 0) continue;

      const encrypted = await Promise.all(
        rows.map((row) => encryptRow(dbName, { ...row, userId }, dek)),
      );
      for (let i = 0; i < encrypted.length; i += 50) {
        const batch = encrypted.slice(i, i + 50);
        await db.insert(table).values(batch as any).onConflictDoNothing();
      }
    }

    await client.query('COMMIT');

    return NextResponse.json({
      success: true,
      message: 'Backup restored successfully. You may want to refresh the page to see updated data.',
    });
  } catch (err) {
    await client.query('ROLLBACK');
    const message = err instanceof Error ? err.message : 'Failed to restore backup';
    return NextResponse.json({ error: message }, { status: 500 });
  } finally {
    client.release();
  }
}
