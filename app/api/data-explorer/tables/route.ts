import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';

const TABLE_METADATA = [
  { key: 'accounts', label: 'Accounts', group: 'Accounts' },
  { key: 'account_snapshots', label: 'Account Snapshots', group: 'Accounts' },
  { key: 'net_worth_snapshots', label: 'Net Worth Snapshots', group: 'Accounts' },
  { key: 'transactions', label: 'Transactions', group: 'Transactions' },
  { key: 'categories', label: 'Categories', group: 'Transactions' },
  { key: 'category_rules', label: 'Category Rules', group: 'Transactions' },
  { key: 'monthly_cash_flow', label: 'Monthly Cash Flow', group: 'Cash Flow' },
  { key: 'category_spending_summary', label: 'Category Spending', group: 'Cash Flow' },
  { key: 'category_income_summary', label: 'Category Income', group: 'Cash Flow' },
  { key: 'budgets', label: 'Budgets', group: 'Budgets' },
  { key: 'financial_goals', label: 'Goals', group: 'Budgets' },

  { key: 'sync_logs', label: 'Sync Logs', group: 'System' },
  { key: 'simplefin_connections', label: 'SimpleFIN Connections', group: 'System' },
  { key: 'user_settings', label: 'User Settings', group: 'System' },
];

// M-8 (2026-08-27 security review): Data Explorer is disabled by default and
// only available in non-production, or with DATA_EXPLORER=on.
function dataExplorerEnabled(): boolean {
  return process.env.NODE_ENV !== 'production' || process.env.DATA_EXPLORER === 'on';
}

export async function GET() {
  const session = await auth();
  if (!dataExplorerEnabled()) {
    return NextResponse.json(
      { error: 'disabled', message: 'Data Explorer is disabled on this deployment.' },
      { status: 404 }
    );
  }
  if (!session?.user) {
    return NextResponse.json({ error: 'unauthenticated', message: 'Authentication required' }, { status: 401 });
  }

  const userId = session.user.id;
  const dataUserId = (session.user as any).dataUserId ?? session.user.id;
  const isMember = dataUserId !== userId;

  const tables = isMember
    ? TABLE_METADATA.filter((t) => t.group !== 'System')
    : TABLE_METADATA;

  return NextResponse.json(tables);
}
