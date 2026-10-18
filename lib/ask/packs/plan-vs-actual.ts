import { z } from 'zod';
import { loadEnginePlan } from '@/lib/services/retirement-plans';
import { runRetirementSimulation } from '@/lib/services/retirement-engine';
import { getMonthlyCashFlow } from '@/lib/finance/cash-flow';
import { getSavingsRate } from '@/lib/finance/savings-rate';
import { formatDollar, formatPercent } from '../redact';
import type { FinanceContext } from '@/lib/finance/context';
import type { AskPack } from './index';

export const PlanVsActualParams = z.object({
  planId: z.string().optional(),
}).default({});

export type PlanVsActualParams = z.infer<typeof PlanVsActualParams>;

export const planVsActualPack: AskPack<PlanVsActualParams> = {
  id: 'plan_vs_actual',
  label: 'Plan vs Actuals',
  href: (p) => (p.planId ? `/plans?planId=${p.planId}` : '/plans'),
  paramsSchema: PlanVsActualParams,
  describe: 'Comparison of retirement plan spending, savings, and income assumptions against trailing 12-month actuals',
  maxTokens: 500,
  async build(ctx: FinanceContext, params: PlanVsActualParams) {
    const loaded = await loadEnginePlan(ctx, params?.planId, { persistMigration: false });
    if (!loaded?.enginePlan) {
      return { text: 'No retirement plan found to compare against actual financial data.' };
    }

    const { enginePlan } = loaded;
    const sim = runRetirementSimulation(enginePlan);
    const year1Result = sim.yearlyResults[0];

    const plannedExpenses =
      year1Result ? year1Result.livingExpenses : 60000;
    const plannedSalary =
      (enginePlan.primarySalary || 0) + (enginePlan.spouseSalary || 0);
    const plannedSavings = year1Result ? year1Result.surplusSaved : 0;

    // Actuals from trailing 12 months
    const [monthlyFlows, savingsRateResult] = await Promise.all([
      getMonthlyCashFlow(ctx, 12),
      getSavingsRate(ctx, { months: 12 }),
    ]);

    const actualIncome = monthlyFlows.reduce((sum, f) => sum + f.income, 0);
    const actualExpenses = monthlyFlows.reduce((sum, f) => sum + f.expenses, 0);
    const actualSavings = savingsRateResult.reduce((sum, pt) => sum + pt.netCashFlow, 0);

    const expenseGap = actualExpenses - plannedExpenses;
    const incomeGap = actualIncome - plannedSalary;
    const savingsGap = actualSavings - plannedSavings;

    const lines: string[] = [];
    lines.push('### Plan Assumptions vs Trailing 12-Month Actuals');
    lines.push('| Metric | Planned (Year 1) | Actual (Last 12 Mo) | Gap ($) | Gap (%) |');
    lines.push('|---|---|---|---|---|');

    const expGapPct = plannedExpenses > 0 ? (expenseGap / plannedExpenses) * 100 : 0;
    lines.push(
      `| Annual Expenses | ${formatDollar(plannedExpenses)} | ${formatDollar(actualExpenses)} | ${expenseGap >= 0 ? '+' : ''}${formatDollar(expenseGap)} | ${formatPercent(expGapPct)} |`
    );

    const incGapPct = plannedSalary > 0 ? (incomeGap / plannedSalary) * 100 : 0;
    lines.push(
      `| Annual Income | ${formatDollar(plannedSalary)} | ${formatDollar(actualIncome)} | ${incomeGap >= 0 ? '+' : ''}${formatDollar(incomeGap)} | ${formatPercent(incGapPct)} |`
    );

    const savGapPct = plannedSavings > 0 ? (savingsGap / plannedSavings) * 100 : 0;
    lines.push(
      `| Annual Savings | ${formatDollar(plannedSavings)} | ${formatDollar(actualSavings)} | ${savingsGap >= 0 ? '+' : ''}${formatDollar(savingsGap)} | ${formatPercent(savGapPct)} |`
    );

    lines.push('\n**Key Observations:**');
    if (expenseGap > 1000) {
      lines.push(
        `- ⚠️ **Spending Underestimated:** Your actual spending is ${formatDollar(expenseGap)} higher than your plan assumes. This may reduce your eventual retirement runway.`
      );
    } else if (expenseGap < -1000) {
      lines.push(
        `- **Spending Buffer:** You spent ${formatDollar(Math.abs(expenseGap))} less than your plan assumes, giving you extra financial safety.`
      );
    } else {
      lines.push('- **Spending on Target:** Actual living expenses are closely aligned with your plan.');
    }

    if (savingsGap < -1000) {
      lines.push(
        `- ⚠️ **Savings Gap:** You saved ${formatDollar(Math.abs(savingsGap))} less than the plan projected this year.`
      );
    }

    return { text: lines.join('\n') };
  },
};
