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

const USER_TABLES: { table: any; dbName: string }[] = [
  { table: simplifinConnections, dbName: 'simplefin_connections' },
  { table: plaidConnections, dbName: 'plaid_connections' },
  { table: categories, dbName: 'categories' },
  { table: accounts, dbName: 'accounts' },
  { table: tags, dbName: 'tags' },
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
  { table: holdings, dbName: 'holdings' },
  { table: holdingSnapshots, dbName: 'holding_snapshots' },
  { table: goalAllocationHistory, dbName: 'goal_allocation_history' },
  { table: paystubs, dbName: 'paystubs' },
  { table: paystubLineItems, dbName: 'paystub_line_items' },
  { table: paystubFieldMappings, dbName: 'paystub_field_mappings' },
  { table: paystubAutoGenerateSettings, dbName: 'paystub_auto_generate_settings' },
];

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const userId = session.user.id;
  const dataUserId = (session.user as any).dataUserId ?? session.user.id;
  const db = getDb();
  const dek = await getSessionDEK();

  const data: Record<string, unknown[]> = {};

  for (const { table, dbName } of USER_TABLES) {
    const targetUserId = dbName === 'ai_providers' ? userId : dataUserId;
    const rows = await db.select().from(table).where(eq(table.userId, targetUserId));
    const decrypted = await Promise.all(
      rows.map((row) => decryptRow(dbName, row as Record<string, unknown>, dek)),
    );
    data[dbName] = decrypted;
  }

  // Export tag join tables by joining with user's tags
  const transactionTagsExport = await db
    .select({
      transactionId: transactionTags.transactionId,
      tagId: transactionTags.tagId,
    })
    .from(transactionTags)
    .innerJoin(tags, eq(transactionTags.tagId, tags.id))
    .where(eq(tags.userId, dataUserId));
  data.transaction_tags = transactionTagsExport;

  const accountTagsExport = await db
    .select({
      accountId: accountTags.accountId,
      tagId: accountTags.tagId,
    })
    .from(accountTags)
    .innerJoin(tags, eq(accountTags.tagId, tags.id))
    .where(eq(tags.userId, dataUserId));
  data.account_tags = accountTagsExport;

  const budgetTagsExport = await db
    .select({
      budgetId: budgetTags.budgetId,
      tagId: budgetTags.tagId,
    })
    .from(budgetTags)
    .innerJoin(tags, eq(budgetTags.tagId, tags.id))
    .where(eq(tags.userId, dataUserId));
  data.budget_tags = budgetTagsExport;

  const goalTagsExport = await db
    .select({
      goalId: goalTags.goalId,
      tagId: goalTags.tagId,
    })
    .from(goalTags)
    .innerJoin(tags, eq(goalTags.tagId, tags.id))
    .where(eq(tags.userId, dataUserId));
  data.goal_tags = goalTagsExport;

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
