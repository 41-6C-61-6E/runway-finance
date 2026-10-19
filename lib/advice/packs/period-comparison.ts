import { z } from 'zod';
import { getMonthlyCashFlow } from '@/lib/finance/cash-flow';
import { getCategorySpending } from '@/lib/finance/categories';
import { formatDollar, formatPercent } from '../redact';
import type { FinanceContext } from '@/lib/finance/context';
import type { AskPack } from './index';

export const PeriodComparisonParams = z
  .object({
    type: z.enum(['month_over_month', 'year_over_year', 'custom']).default('month_over_month'),
    period1: z
      .object({
        startMonth: z.string().regex(/^\d{4}-\d{2}$/),
        endMonth: z.string().regex(/^\d{4}-\d{2}$/),
        label: z.string().optional(),
      })
      .optional(),
    period2: z
      .object({
        startMonth: z.string().regex(/^\d{4}-\d{2}$/),
        endMonth: z.string().regex(/^\d{4}-\d{2}$/),
        label: z.string().optional(),
      })
      .optional(),
  })
  .default({ type: 'month_over_month' });

export type PeriodComparisonParams = z.infer<typeof PeriodComparisonParams>;

export const periodComparisonPack: AskPack<PeriodComparisonParams> = {
  id: 'period_comparison',
  label: 'Period Comparison',
  href: () => '/spending',
  paramsSchema: PeriodComparisonParams,
  describe:
    'Side-by-side comparison of cash flow and category spending between two timeframes (MoM, YoY, or custom periods)',
  maxTokens: 700,
  async build(ctx: FinanceContext, params: PeriodComparisonParams) {
    const now = ctx.now;

    let p1: { startMonth: string; endMonth: string; label: string };
    let p2: { startMonth: string; endMonth: string; label: string };

    if (params.period1 && params.period2) {
      p1 = {
        startMonth: params.period1.startMonth,
        endMonth: params.period1.endMonth,
        label: params.period1.label || `${params.period1.startMonth}..${params.period1.endMonth}`,
      };
      p2 = {
        startMonth: params.period2.startMonth,
        endMonth: params.period2.endMonth,
        label: params.period2.label || `${params.period2.startMonth}..${params.period2.endMonth}`,
      };
    } else if (params.type === 'year_over_year') {
      // Last completed month vs same month last year
      const lastMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const lastYearDate = new Date(now.getFullYear() - 1, now.getMonth() - 1, 1);
      const p1Ym = `${lastMonthDate.getFullYear()}-${String(lastMonthDate.getMonth() + 1).padStart(2, '0')}`;
      const p2Ym = `${lastYearDate.getFullYear()}-${String(lastYearDate.getMonth() + 1).padStart(2, '0')}`;
      p1 = { startMonth: p1Ym, endMonth: p1Ym, label: p1Ym };
      p2 = { startMonth: p2Ym, endMonth: p2Ym, label: p2Ym };
    } else {
      // Month-over-month (default): Last completed month vs month prior
      const lastMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const prevMonthDate = new Date(now.getFullYear(), now.getMonth() - 2, 1);
      const p1Ym = `${lastMonthDate.getFullYear()}-${String(lastMonthDate.getMonth() + 1).padStart(2, '0')}`;
      const p2Ym = `${prevMonthDate.getFullYear()}-${String(prevMonthDate.getMonth() + 1).padStart(2, '0')}`;
      p1 = { startMonth: p1Ym, endMonth: p1Ym, label: p1Ym };
      p2 = { startMonth: p2Ym, endMonth: p2Ym, label: p2Ym };
    }

    // Fetch monthly flows (up to 24 months) and category spending for both periods
    const [allFlows, spendingP1, spendingP2] = await Promise.all([
      getMonthlyCashFlow(ctx, 24),
      getCategorySpending(ctx, { startMonth: p1.startMonth, endMonth: p1.endMonth, groupBy: 'total' }),
      getCategorySpending(ctx, { startMonth: p2.startMonth, endMonth: p2.endMonth, groupBy: 'total' }),
    ]);

    const getFlowMetrics = (start: string, end: string) => {
      const inRange = allFlows.filter((f) => f.yearMonth >= start && f.yearMonth <= end);
      const income = inRange.reduce((sum, f) => sum + f.income, 0);
      const expenses = inRange.reduce((sum, f) => sum + f.expenses, 0);
      const net = inRange.reduce((sum, f) => sum + f.netCashFlow, 0);
      const savingsRate = income > 0 ? (Math.max(0, net) / income) * 100 : 0;
      return { income, expenses, net, savingsRate };
    };

    const m1 = getFlowMetrics(p1.startMonth, p1.endMonth);
    const m2 = getFlowMetrics(p2.startMonth, p2.endMonth);

    const incDiff = m1.income - m2.income;
    const incDiffPct = m2.income > 0 ? (incDiff / m2.income) * 100 : 0;

    const expDiff = m1.expenses - m2.expenses;
    const expDiffPct = m2.expenses > 0 ? (expDiff / m2.expenses) * 100 : 0;

    const netDiff = m1.net - m2.net;
    const netDiffPct = m2.net !== 0 ? (netDiff / Math.abs(m2.net)) * 100 : 0;

    const lines: string[] = [];
    lines.push(`### Financial Period Comparison (${p1.label} vs ${p2.label})`);
    lines.push('\n**Cash Flow Overview:**');
    lines.push(`| Metric | ${p1.label} (Current) | ${p2.label} (Prior) | Difference ($) | Difference (%) |`);
    lines.push('|---|---|---|---|---|');
    lines.push(
      `| Total Income | ${formatDollar(m1.income)} | ${formatDollar(m2.income)} | ${incDiff >= 0 ? '+' : ''}${formatDollar(incDiff)} | ${incDiffPct >= 0 ? '+' : ''}${incDiffPct.toFixed(1)}% |`
    );
    lines.push(
      `| Total Expenses | ${formatDollar(m1.expenses)} | ${formatDollar(m2.expenses)} | ${expDiff >= 0 ? '+' : ''}${formatDollar(expDiff)} | ${expDiffPct >= 0 ? '+' : ''}${expDiffPct.toFixed(1)}% |`
    );
    lines.push(
      `| Net Cash Flow | ${formatDollar(m1.net)} | ${formatDollar(m2.net)} | ${netDiff >= 0 ? '+' : ''}${formatDollar(netDiff)} | ${netDiffPct >= 0 ? '+' : ''}${netDiffPct.toFixed(1)}% |`
    );
    const sRateDelta = m1.savingsRate - m2.savingsRate;
    lines.push(
      `| Savings Rate | ${formatPercent(m1.savingsRate)} | ${formatPercent(m2.savingsRate)} | ${sRateDelta >= 0 ? '+' : ''}${sRateDelta.toFixed(1)}% pts | - |`
    );

    // Category comparison
    const catMap2 = new Map(spendingP2.map((c) => [c.categoryId, c]));
    const allCatIds = new Set([
      ...spendingP1.map((c) => c.categoryId),
      ...spendingP2.map((c) => c.categoryId),
    ]);

    const catDiffs: Array<{ name: string; amt1: number; amt2: number; delta: number }> = [];
    for (const catId of allCatIds) {
      const c1 = spendingP1.find((c) => c.categoryId === catId);
      const c2 = catMap2.get(catId);
      const name = c1?.name || c2?.name || 'Unknown';
      const amt1 = c1?.amount || 0;
      const amt2 = c2?.amount || 0;
      const delta = amt1 - amt2;
      catDiffs.push({ name, amt1, amt2, delta });
    }

    // Sort by largest absolute shift
    catDiffs.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
    const topCatDiffs = catDiffs.slice(0, 8);

    if (topCatDiffs.length > 0) {
      lines.push('\n**Top Category Shifts:**');
      lines.push(`| Category | ${p1.label} | ${p2.label} | Shift |`);
      lines.push('|---|---|---|---|');
      for (const c of topCatDiffs) {
        const deltaSign = c.delta >= 0 ? '+' : '';
        const pctStr = c.amt2 > 0 ? ` (${deltaSign}${((c.delta / c.amt2) * 100).toFixed(1)}%)` : '';
        lines.push(
          `| ${c.name} | ${formatDollar(c.amt1)} | ${formatDollar(c.amt2)} | ${deltaSign}${formatDollar(c.delta)}${pctStr} |`
        );
      }
    }

    return { text: lines.join('\n'), period: `${p1.label} vs ${p2.label}` };
  },
};
