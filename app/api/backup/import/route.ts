import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { getSessionDEK } from '@/lib/crypto-context';
import { encryptRow } from '@/lib/crypto';
import { eq, sql } from 'drizzle-orm';
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
  syncLogs,

  plaidConnections,
  holdings,
  holdingSnapshots,
  tags,
  goalAllocationHistory,
  paystubs,
  paystubLineItems,
  paystubFieldMappings,
  paystubAutoGenerateSettings,
  transactionTags,
  accountTags,
  budgetTags,
  goalTags,
} from '@/lib/db/schema';

interface BackupPayload {
  version: number;
  exportedAt: string;
  data: Record<string, unknown[]>;
}

const DELETE_ORDER: { table: any; dbName: string }[] = [
  { table: syncLogs, dbName: 'sync_logs' },
  { table: paystubAutoGenerateSettings, dbName: 'paystub_auto_generate_settings' },
  { table: paystubLineItems, dbName: 'paystub_line_items' },
  { table: transactions, dbName: 'transactions' },
  { table: accountSnapshots, dbName: 'account_snapshots' },
  { table: importLog, dbName: 'import_log' },
  { table: categorySpendingSummary, dbName: 'category_spending_summary' },
  { table: categoryIncomeSummary, dbName: 'category_income_summary' },
  { table: holdings, dbName: 'holdings' },
  { table: holdingSnapshots, dbName: 'holding_snapshots' },
  { table: goalAllocationHistory, dbName: 'goal_allocation_history' },
  { table: paystubs, dbName: 'paystubs' },
  { table: paystubFieldMappings, dbName: 'paystub_field_mappings' },
  { table: budgets, dbName: 'budgets' },
  { table: financialGoals, dbName: 'financial_goals' },
  { table: categoryRules, dbName: 'category_rules' },
  { table: accounts, dbName: 'accounts' },
  { table: simplifinConnections, dbName: 'simplefin_connections' },
  { table: plaidConnections, dbName: 'plaid_connections' },
  { table: categories, dbName: 'categories' },
  { table: aiProviders, dbName: 'ai_providers' },
  { table: aiProposals, dbName: 'ai_proposals' },
  { table: netWorthSnapshots, dbName: 'net_worth_snapshots' },
  { table: monthlyCashFlow, dbName: 'monthly_cash_flow' },
  { table: tags, dbName: 'tags' },
];

const INSERT_ORDER: { table: any; dbName: string }[] = [
  { table: simplifinConnections, dbName: 'simplefin_connections' },
  { table: plaidConnections, dbName: 'plaid_connections' },
  { table: categories, dbName: 'categories' },
  { table: accounts, dbName: 'accounts' },
  { table: tags, dbName: 'tags' },
  { table: aiProviders, dbName: 'ai_providers' },
  { table: aiProposals, dbName: 'ai_proposals' },
  { table: netWorthSnapshots, dbName: 'net_worth_snapshots' },
  { table: monthlyCashFlow, dbName: 'monthly_cash_flow' },
  { table: categoryRules, dbName: 'category_rules' },
  { table: budgets, dbName: 'budgets' },
  { table: financialGoals, dbName: 'financial_goals' },
  { table: paystubFieldMappings, dbName: 'paystub_field_mappings' },
  { table: paystubs, dbName: 'paystubs' },
  { table: goalAllocationHistory, dbName: 'goal_allocation_history' },
  { table: holdings, dbName: 'holdings' },
  { table: holdingSnapshots, dbName: 'holding_snapshots' },

  { table: categorySpendingSummary, dbName: 'category_spending_summary' },
  { table: categoryIncomeSummary, dbName: 'category_income_summary' },
  { table: importLog, dbName: 'import_log' },
  { table: transactions, dbName: 'transactions' },
  { table: accountSnapshots, dbName: 'account_snapshots' },
  { table: paystubLineItems, dbName: 'paystub_line_items' },
  { table: paystubAutoGenerateSettings, dbName: 'paystub_auto_generate_settings' },
];

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const userId = session.user.id;
  const dataUserId = (session.user as any).dataUserId ?? session.user.id;
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

  try {
    await db.transaction(async (tx) => {
      // Defer FK constraints so we can insert categories in batches without
      // parent-before-child ordering being enforced per-statement.
      await tx.execute(sql`SET CONSTRAINTS ALL DEFERRED`);

      // Delete existing data
      for (const { table, dbName } of DELETE_ORDER) {
        const targetUserId = dbName === 'ai_providers' ? userId : dataUserId;
        const ids = await tx
          .select({ id: table.id })
          .from(table)
          .where(eq(table.userId, targetUserId));
        if (ids.length > 0) {
          await tx.delete(table).where(eq(table.userId, targetUserId));
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
        await tx
          .update(userSettings)
          .set({ ...encryptedSettings, updatedAt: new Date() })
          .where(eq(userSettings.userId, userId));
      }

      // Insert data in dependency order
      for (const { table, dbName } of INSERT_ORDER) {
        let rows = backup.data[dbName] as Record<string, unknown>[] | undefined;
        if (!rows || rows.length === 0) continue;

        if (dbName === 'categories') {
          rows = sortCategories(rows);
        }

        const restoredRows = rows.map((row) => restoreTimestamps(row));

        const targetUserId = dbName === 'ai_providers' ? userId : dataUserId;
        const encrypted = await Promise.all(
          restoredRows.map((row) => encryptRow(dbName, { ...row, userId: targetUserId }, dek)),
        );
        const batchSize = dbName === 'categories' ? encrypted.length : 50;
        for (let i = 0; i < encrypted.length; i += batchSize) {
          const batch = encrypted.slice(i, i + batchSize);
          await tx.insert(table).values(batch as any).onConflictDoNothing();
        }
      }

      // Insert tag join tables separately since they don't have userId
      const joinTables = [
        { table: transactionTags, dbName: 'transaction_tags' },
        { table: accountTags, dbName: 'account_tags' },
        { table: budgetTags, dbName: 'budget_tags' },
        { table: goalTags, dbName: 'goal_tags' },
      ];

      for (const { table, dbName } of joinTables) {
        const rows = backup.data[dbName] as Record<string, unknown>[] | undefined;
        if (!rows || rows.length === 0) continue;
        
        for (let i = 0; i < rows.length; i += 50) {
          const batch = rows.slice(i, i + 50);
          await tx.insert(table).values(batch as any).onConflictDoNothing();
        }
      }
    });

    return NextResponse.json({
      success: true,
      message: 'Backup restored successfully. You may want to refresh the page to see updated data.',
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to restore backup';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

function sortCategories(categories: Record<string, any>[]) {
  const sorted: Record<string, any>[] = [];
  const inserted = new Set<string>();
  let remaining = [...categories];

  let progress = true;
  while (remaining.length > 0 && progress) {
    progress = false;
    const nextRemaining: Record<string, any>[] = [];
    for (const cat of remaining) {
      const pId = cat.parentId ?? cat.parent_id;
      const epId = cat.expenseParentId ?? cat.expense_parent_id;
      const cId = cat.id;

      const pIdOk = !pId || inserted.has(String(pId));
      const epIdOk = !epId || inserted.has(String(epId));

      if (pIdOk && epIdOk) {
        sorted.push(cat);
        inserted.add(String(cId));
        progress = true;
      } else {
        nextRemaining.push(cat);
      }
    }
    remaining = nextRemaining;
  }
  // For categories whose parent is not in the backup (e.g. parent belongs to
  // another user and still exists in the DB), do a best-effort sub-sort so
  // that any parent→child relationships within this subset are still ordered
  // correctly before appending them.
  if (remaining.length > 0) {
    const remainingIds = new Set(remaining.map((c) => String(c.id)));
    const subSorted: Record<string, any>[] = [];
    const subInserted = new Set<string>(inserted);
    let subRemaining = [...remaining];
    let subProgress = true;
    while (subRemaining.length > 0 && subProgress) {
      subProgress = false;
      const nextSubRemaining: Record<string, any>[] = [];
      for (const cat of subRemaining) {
        const pId = cat.parentId ?? cat.parent_id;
        const epId = cat.expenseParentId ?? cat.expense_parent_id;
        const cId = cat.id;

        // Parent is not in this subset (already in DB) or already sub-sorted
        const pIdOk = !pId || !remainingIds.has(String(pId)) || subInserted.has(String(pId));
        const epIdOk = !epId || !remainingIds.has(String(epId)) || subInserted.has(String(epId));

        if (pIdOk && epIdOk) {
          subSorted.push(cat);
          subInserted.add(String(cId));
          subProgress = true;
        } else {
          nextSubRemaining.push(cat);
        }
      }
      subRemaining = nextSubRemaining;
    }
    // Append any truly circular/unresolvable categories last
    sorted.push(...subSorted, ...subRemaining);
  }
  return sorted;
}

const TIMESTAMP_KEYS = new Set([
  'createdAt',
  'updatedAt',
  'lastSyncAt',
  'balanceDate',
  'startedAt',
  'completedAt',
  'expiresAt',
  'emailVerified',
]);

function restoreTimestamps<T extends Record<string, any>>(row: T): T {
  const result = { ...row } as Record<string, any>;
  for (const key of Object.keys(result)) {
    if (TIMESTAMP_KEYS.has(key) && typeof result[key] === 'string' && result[key] !== '') {
      result[key] = new Date(result[key]);
    }
  }
  return result as T;
}
