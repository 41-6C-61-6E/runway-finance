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
  { key: 'financial_goals', label: 'Financial Goals', group: 'Budgets' },
  { key: 'fire_scenarios', label: 'FIRE Scenarios', group: 'FIRE' },
  { key: 'retirement_projections', label: 'Retirement Projections', group: 'FIRE' },
  { key: 'sync_logs', label: 'Sync Logs', group: 'System' },
  { key: 'simplefin_connections', label: 'SimpleFIN Connections', group: 'System' },
  { key: 'user_settings', label: 'User Settings', group: 'System' },
];

export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'unauthenticated', message: 'Authentication required' }, { status: 401 });
  }

  return NextResponse.json(TABLE_METADATA);
}
