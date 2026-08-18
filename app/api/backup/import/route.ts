import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { getSessionDEK } from '@/lib/crypto-context';
import { encryptRow } from '@/lib/crypto';
import { eq } from 'drizzle-orm';
import { randomUUID } from 'crypto';
import { invalidateUserSearchCache } from '@/lib/services/search-cache';
import { apiUnauthorized, apiForbidden, apiBadRequest, apiTooManyRequests, handleApiError } from '@/lib/api/response';
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

  plans,
  planAccounts,
  planEvents,
  planFlows,
  planSettings,
  planLiabilities,
  retirementRules,
  recurringTransactions,
  issues,
  customAlertRules,
  userNotifications,
  sentNotifications,
  pushSubscriptions,
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
  // FIRE tables: delete sub-tables before parent (plans)
  { table: planFlows, dbName: 'plan_flows' },
  { table: planLiabilities, dbName: 'plan_liabilities' },
  { table: planEvents, dbName: 'plan_events' },
  { table: planAccounts, dbName: 'plan_accounts' },
  { table: planSettings, dbName: 'plan_settings' },
  { table: plans, dbName: 'plans' },
  { table: retirementRules, dbName: 'retirement_rules' },
  { table: recurringTransactions, dbName: 'recurring_transactions' },
  { table: issues, dbName: 'issues' },
  { table: customAlertRules, dbName: 'custom_alert_rules' },
  { table: userNotifications, dbName: 'user_notifications' },
  { table: sentNotifications, dbName: 'sent_notifications' },
  { table: pushSubscriptions, dbName: 'push_subscriptions' },
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
  // FIRE tables: insert parent (plans) before sub-tables
  { table: retirementRules, dbName: 'retirement_rules' },
  { table: plans, dbName: 'plans' },
  { table: planAccounts, dbName: 'plan_accounts' },
  { table: planEvents, dbName: 'plan_events' },
  { table: planFlows, dbName: 'plan_flows' },
  { table: planSettings, dbName: 'plan_settings' },
  { table: planLiabilities, dbName: 'plan_liabilities' },
  // Recurring transactions reference accounts + categories, so insert after them.
  { table: recurringTransactions, dbName: 'recurring_transactions' },
  // Sync logs reference the connection tables, so insert after them.
  { table: syncLogs, dbName: 'sync_logs' },
  // Notification / alert tables have no FK dependencies.
  { table: issues, dbName: 'issues' },
  { table: customAlertRules, dbName: 'custom_alert_rules' },
  { table: userNotifications, dbName: 'user_notifications' },
  { table: sentNotifications, dbName: 'sent_notifications' },
  { table: pushSubscriptions, dbName: 'push_subscriptions' },
];

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return apiUnauthorized();
  }

  const userId = session.user.id;
  const dataUserId = (session.user as any).dataUserId ?? session.user.id;
  const isMember = dataUserId !== userId;

  if (isMember) {
    return apiForbidden('Sharing members cannot import backups over household financial data');
  }

  const { checkRateLimit } = await import('@/lib/rate-limit');
  if (!(await checkRateLimit(`backup-import:${userId}`, 5, 60_000))) {
    return apiTooManyRequests('Too many backup import requests. Please wait a moment.');
  }

  const db = getDb();
  const dek = await getSessionDEK();

  let rawBody: any;
  try {
    rawBody = await request.json();
  } catch {
    return apiBadRequest('Invalid JSON payload');
  }

  // Encrypted backup container: { magic, version: 2, kdf, iterations, salt, iv, ct }.
  // Decrypt it (with the supplied passphrase) into the plaintext version-1 shape
  // before proceeding. The crypto helpers are loaded dynamically so that unit
  // tests which mock only decryptRow/encryptRow are unaffected.
  let backup: any;
  if (rawBody && rawBody.magic === 'runway-encrypted-backup') {
    const passphrase = rawBody.passphrase;
    if (!passphrase) {
      return apiBadRequest('A passphrase is required to decrypt this backup');
    }
    try {
      const { decryptBackupJson } = await import('@/lib/crypto');
      const jsonStr = await decryptBackupJson(rawBody, passphrase);
      backup = JSON.parse(jsonStr);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('wrong passphrase') || msg.includes('decryption failed')) {
        return apiBadRequest('Backup decryption failed. Please check your passphrase and try again.');
      }
      return handleApiError(err, 'Failed to decrypt backup');
    }
  } else {
    backup = rawBody;
  }

  if (!backup.version || !backup.data || typeof backup.data !== 'object') {
    return apiBadRequest('Invalid backup format');
  }

  if (backup.version !== 1 && backup.version !== 2) {
    return apiBadRequest(`Unsupported backup version: ${backup.version}`);
  }

  try {
    await db.transaction(async (tx) => {
      // Delete existing data
      for (const { table, dbName } of DELETE_ORDER) {
        const isPersonalTable = dbName === 'ai_providers' || dbName === 'simplefin_connections' || dbName === 'plaid_connections';
        const targetUserId = isPersonalTable ? userId : dataUserId;
        await tx.delete(table).where(eq(table.userId, targetUserId));
      }

      // Parse user_settings from backup
      const settingsRows = backup.data.user_settings as Record<string, unknown>[] | undefined;
      if (settingsRows && settingsRows.length > 0 && settingsRows[0] && typeof settingsRows[0] === 'object') {
        const rawSettings = { ...settingsRows[0] };
        delete rawSettings.id;
        delete rawSettings.userId;
        delete rawSettings.createdAt;
        delete rawSettings.updatedAt;

        const encryptedSettings = await encryptRow('user_settings', rawSettings, dek);
        const now = new Date();
        // Upsert so a restore works even when no user_settings row exists yet
        // (e.g. a fresh account) instead of silently doing nothing.
        await tx
          .insert(userSettings)
          .values({ ...encryptedSettings, userId, updatedAt: now })
          .onConflictDoUpdate({
            target: userSettings.userId,
            set: { ...encryptedSettings, updatedAt: now },
          });
      }

      // Insert data in dependency order
      for (const { table, dbName } of INSERT_ORDER) {
        let rows = backup.data[dbName] as Record<string, unknown>[] | undefined;
        if (!rows || !Array.isArray(rows) || rows.length === 0) continue;

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
        if (!rows || !Array.isArray(rows) || rows.length === 0) continue;

        for (let i = 0; i < rows.length; i += 50) {
          const batch = rows.slice(i, i + 50);
          await tx.insert(table).values(batch as any).onConflictDoNothing();
        }
      }

      // Audit log: record the restore in import_log so there is a durable
      // trail of when household data was replaced by a backup. We do not store
      // the (potentially huge) backup payload in fileContent — that column is
      // intended for CSV imports.
      const totalRestored = Object.values(backup.data).reduce<number>(
        (sum, rows) => sum + (Array.isArray(rows) ? rows.length : 0),
        0
      );
      await tx.insert(importLog).values({
        id: randomUUID(),
        userId: dataUserId,
        fileName: 'backup-restore',
        importType: 'restore',
        status: 'completed',
        recordsImported: totalRestored,
        recordsSkipped: 0,
        recordsErrored: 0,
      });
    });

    // Invalidate the search cache so restored data is immediately searchable.
    invalidateUserSearchCache(dataUserId);

    return NextResponse.json({
      success: true,
      message: 'Backup restored successfully. You may want to refresh the page to see updated data.',
    });
  } catch (err) {
    return handleApiError(err, 'Failed to restore backup');
  }
}

function sortCategories(categories: Record<string, any>[]) {
  if (!Array.isArray(categories)) return [];
  const sorted: Record<string, any>[] = [];
  const inserted = new Set<string>();
  let remaining = categories.filter((c) => c && typeof c === 'object');

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
  if (!row || typeof row !== 'object') return row;
  const result = { ...row } as Record<string, any>;
  for (const key of Object.keys(result)) {
    if (TIMESTAMP_KEYS.has(key) && typeof result[key] === 'string' && result[key] !== '') {
      result[key] = new Date(result[key]);
    }
  }
  return result as T;
}
