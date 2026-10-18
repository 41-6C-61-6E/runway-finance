import { z } from 'zod';
import type { FinanceContext } from '@/lib/finance/context';
import { cashFlowMonthlyPack } from './cash-flow-monthly';
import { categorySpendingPack } from './category-spending';
import { categoryTrendsPack } from './category-trends';
import { incomeBreakdownPack } from './income-breakdown';
import { netWorthHistoryPack } from './net-worth-history';
import { accountBalancesPack } from './account-balances';
import { investmentsPack } from './investments';
import { recurringPack } from './recurring';
import { budgetsPack } from './budgets';
import { goalsPack } from './goals';
import { firePlanPack } from './fire-plan';
import { fireScenarioPack } from './fire-scenario';
import { fireMonteCarloPack } from './fire-monte-carlo';
import { planVsActualPack } from './plan-vs-actual';
import { metricDefinitionsPack } from './metric-definitions';

export type PackId =
  | 'cash_flow_monthly'
  | 'category_spending'
  | 'category_trends'
  | 'income_breakdown'
  | 'net_worth_history'
  | 'account_balances'
  | 'investments'
  | 'recurring'
  | 'budgets'
  | 'goals'
  | 'fire_plan'
  | 'fire_scenario'
  | 'fire_monte_carlo'
  | 'plan_vs_actual'
  | 'metric_definitions';

export interface AskPack<P = any> {
  id: PackId;
  label: string;
  href: (p: P) => string;
  paramsSchema: z.ZodType<P>;
  describe: string;
  maxTokens: number;
  build(ctx: FinanceContext, params: P): Promise<{ text: string; period?: string }>;
}

export const ALL_PACKS: Record<PackId, AskPack<any>> = {
  cash_flow_monthly: cashFlowMonthlyPack,
  category_spending: categorySpendingPack,
  category_trends: categoryTrendsPack,
  income_breakdown: incomeBreakdownPack,
  net_worth_history: netWorthHistoryPack,
  account_balances: accountBalancesPack,
  investments: investmentsPack,
  recurring: recurringPack,
  budgets: budgetsPack,
  goals: goalsPack,
  fire_plan: firePlanPack,
  fire_scenario: fireScenarioPack,
  fire_monte_carlo: fireMonteCarloPack,
  plan_vs_actual: planVsActualPack,
  metric_definitions: metricDefinitionsPack,
};

export function getPack(id: string): AskPack | undefined {
  return ALL_PACKS[id as PackId];
}

/**
 * Compact catalog for inclusion in the system prompt / follow-up requests.
 */
export function getPackCatalogText(): string {
  const lines: string[] = ['<pack_catalog>'];
  for (const pack of Object.values(ALL_PACKS)) {
    lines.push(`- id="${pack.id}": ${pack.describe}`);
  }
  lines.push('</pack_catalog>');
  return lines.join('\n');
}
