import { z } from 'zod';
import type { FinanceContext } from '@/lib/finance/context';
import type { AskPack } from './index';

export const MetricDefinitionsParams = z.object({
  metrics: z
    .array(
      z.enum([
        'netWorth',
        'savingsRate',
        'fire',
        'budget',
        'goals',
        'investments',
        'cashFlow',
      ])
    )
    .default(['netWorth', 'savingsRate', 'fire']),
}).default({ metrics: ['netWorth', 'savingsRate', 'fire'] });

export type MetricDefinitionsParams = z.infer<typeof MetricDefinitionsParams>;

const DEFINITIONS: Record<string, { title: string; formula: string; rules: string }> = {
  netWorth: {
    title: 'Net Worth',
    formula: 'Net Worth = Total Assets - Total Liabilities',
    rules:
      'Includes checking, savings, brokerage, retirement (401k/IRA/HSA), real estate, vehicles, and precious metals. Subtracts credit cards, mortgages, auto loans, student loans, and other debts. Excludes hidden accounts and accounts marked isExcludedFromNetWorth.',
  },
  savingsRate: {
    title: 'Savings Rate',
    formula: 'Savings Rate = (Net Cash Flow / Total Income) * 100',
    rules:
      'Measures the portion of take-home income retained after living expenses. Excludes internal transfers between owned accounts and credit card payoff transfers to prevent double counting.',
  },
  fire: {
    title: 'FI Number & FIRE Progress',
    formula: 'FI Number = Annual Living Expenses * FI Target Multiplier (typically 25x for the 4% rule)',
    rules:
      'Investable assets include cash, taxable brokerage, tax-deferred accounts (Traditional 401k/IRA), tax-free accounts (Roth IRA/401k), and HSA. Excludes primary home equity from liquid investable portfolio.',
  },
  cashFlow: {
    title: 'Cash Flow',
    formula: 'Net Cash Flow = Total Inflows - Total Outflows',
    rules:
      'Derived from monthly cash flow rollups. Deposits and paychecks count as positive cash flow; charges, bill payments, and merchant expenses count as negative cash flow.',
  },
  budget: {
    title: 'Budget Variance',
    formula: 'Variance = Budgeted Amount - Actual Category Spending',
    rules:
      'Positive variance means under budget (surplus). Negative variance indicates overspending in that category for the specified calendar month.',
  },
  goals: {
    title: 'Goal Funding',
    formula: 'Funded % = (Current Amount / Target Amount) * 100',
    rules:
      'Tracks accumulated balances against user-defined milestone amounts. Projections estimate completion date based on historical monthly account inflows.',
  },
  investments: {
    title: 'Portfolio Allocation',
    formula: 'Asset % = (Asset Group Value / Total Portfolio Value) * 100',
    rules:
      'Aggregates holdings and balances across all taxable brokerage and retirement accounts.',
  },
};

export const metricDefinitionsPack: AskPack<MetricDefinitionsParams> = {
  id: 'metric_definitions',
  label: 'Calculation Rules & Formulas',
  href: () => '/',
  paramsSchema: MetricDefinitionsParams,
  describe: 'Official calculation formulas, rules, and data sources for financial metrics',
  maxTokens: 500,
  async build(_ctx: FinanceContext, params: MetricDefinitionsParams) {
    const metrics = params?.metrics && params.metrics.length > 0
      ? params.metrics
      : ['netWorth', 'savingsRate', 'fire'];

    const lines: string[] = [];
    lines.push('### Metric Formulas & Calculation Definitions');

    for (const key of metrics) {
      const def = DEFINITIONS[key];
      if (!def) continue;
      lines.push(`\n**${def.title}:**`);
      lines.push(`- **Formula:** \`${def.formula}\``);
      lines.push(`- **Rules & Scoping:** ${def.rules}`);
    }

    return { text: lines.join('\n') };
  },
};
