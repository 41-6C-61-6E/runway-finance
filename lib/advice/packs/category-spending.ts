import { z } from 'zod';
import { getCategorySpending } from '@/lib/finance/categories';
import { formatDollar } from '../redact';
import type { FinanceContext } from '@/lib/finance/context';
import type { AskPack } from './index';

export const CategorySpendingParams = z.object({
  startMonth: z.string().regex(/^\d{4}-\d{2}$/).optional(),
  endMonth: z.string().regex(/^\d{4}-\d{2}$/).optional(),
  category: z.string().optional(),
  groupBy: z.enum(['total', 'month']).default('total'),
}).default({ groupBy: 'total' });

export type CategorySpendingParams = z.infer<typeof CategorySpendingParams>;

export const categorySpendingPack: AskPack<CategorySpendingParams> = {
  id: 'category_spending',
  label: 'Category Spending',
  href: (p) => (p.startMonth ? `/spending?month=${p.startMonth}` : '/spending'),
  paramsSchema: CategorySpendingParams,
  describe: 'Spending by category over a date range (top categories + totals)',
  maxTokens: 900,
  async build(ctx: FinanceContext, params: CategorySpendingParams) {
    const now = ctx.now;
    const endMonth = params.endMonth || `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    let startMonth = params.startMonth;
    if (!startMonth) {
      const d = new Date(now.getFullYear(), now.getMonth() - 5, 1);
      startMonth = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    }

    const items = await getCategorySpending(ctx, {
      startMonth,
      endMonth,
      groupBy: params.groupBy,
      category: params.category,
    });

    if (items.length === 0) {
      return {
        text: `No category spending found between ${startMonth} and ${endMonth}.`,
        period: `${startMonth}..${endMonth}`,
      };
    }

    const lines: string[] = [];
    const period = `${startMonth}..${endMonth}`;

    if (params.groupBy === 'month') {
      lines.push(`### Category Spending by Month (${period})`);
      lines.push('| Month | Category | Amount | Tx Count |');
      lines.push('|---|---|---|---|');
      // Limit to 30 rows to prevent blowing token budget
      const displayItems = items.slice(0, 30);
      for (const it of displayItems) {
        lines.push(`| ${it.yearMonth || ''} | ${it.name} | ${formatDollar(it.amount)} | ${it.transactionCount} |`);
      }
      if (items.length > 30) {
        lines.push(`| ... | (+${items.length - 30} more rows) | | |`);
      }
    } else {
      lines.push(`### Category Spending Summary (${period})`);
      lines.push('| Category | Total Spending | Transactions | % of Total |');
      lines.push('|---|---|---|---|');

      const totalSpent = items.reduce((sum, it) => sum + it.amount, 0);
      const topItems = items.slice(0, 15);
      const remainingItems = items.slice(15);
      const otherTotal = remainingItems.reduce((sum, it) => sum + it.amount, 0);
      const otherCount = remainingItems.reduce((sum, it) => sum + it.transactionCount, 0);

      for (const it of topItems) {
        const pct = totalSpent > 0 ? `${((it.amount / totalSpent) * 100).toFixed(1)}%` : '0.0%';
        lines.push(`| ${it.name} | ${formatDollar(it.amount)} | ${it.transactionCount} | ${pct} |`);
      }

      if (otherTotal > 0) {
        const pct = totalSpent > 0 ? `${((otherTotal / totalSpent) * 100).toFixed(1)}%` : '0.0%';
        lines.push(`| Other (${remainingItems.length} categories) | ${formatDollar(otherTotal)} | ${otherCount} | ${pct} |`);
      }

      lines.push(`| **Total** | **${formatDollar(totalSpent)}** | | 100.0% |`);
    }

    return { text: lines.join('\n'), period };
  },
};
