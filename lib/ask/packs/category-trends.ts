import { z } from 'zod';
import { getCategorySpending } from '@/lib/finance/categories';
import { formatDollar } from '../redact';
import type { FinanceContext } from '@/lib/finance/context';
import type { AskPack } from './index';

export const CategoryTrendsParams = z.object({}).default({});
export type CategoryTrendsParams = z.infer<typeof CategoryTrendsParams>;

export const categoryTrendsPack: AskPack<CategoryTrendsParams> = {
  id: 'category_trends',
  label: 'Category Spending Trends',
  href: () => '/spending',
  paramsSchema: CategoryTrendsParams,
  describe: 'Biggest spending rises and falls comparing recent 3-month to 12-month averages',
  maxTokens: 500,
  async build(ctx: FinanceContext) {
    const now = ctx.now;
    const endLastDate = new Date(now.getFullYear(), now.getMonth(), 0);
    const start12Date = new Date(now.getFullYear(), now.getMonth() - 12, 1);
    const start3Date = new Date(now.getFullYear(), now.getMonth() - 3, 1);

    const endLastStr = `${endLastDate.getFullYear()}-${String(endLastDate.getMonth() + 1).padStart(2, '0')}`;
    const start12Str = `${start12Date.getFullYear()}-${String(start12Date.getMonth() + 1).padStart(2, '0')}`;
    const start3Str = `${start3Date.getFullYear()}-${String(start3Date.getMonth() + 1).padStart(2, '0')}`;

    const [spending12m, spending3m] = await Promise.all([
      getCategorySpending(ctx, { startMonth: start12Str, endMonth: endLastStr, groupBy: 'total' }),
      getCategorySpending(ctx, { startMonth: start3Str, endMonth: endLastStr, groupBy: 'total' }),
    ]);

    if (spending12m.length === 0) {
      return { text: 'No category spending history available for trend analysis.', period: 'Last 12 months' };
    }

    const spending3mMap = new Map(spending3m.map((c) => [c.categoryId, c.amount / 3]));

    const trends = spending12m.map((c) => {
      const avg12m = c.amount / 12;
      const avg3m = spending3mMap.get(c.categoryId) ?? 0;
      const delta = avg3m - avg12m;
      const pctChange = avg12m > 0 ? (delta / avg12m) * 100 : 0;
      return {
        name: c.name,
        avg12m,
        avg3m,
        delta,
        pctChange,
      };
    });

    // Rises (positive delta, sorted descending)
    const rises = [...trends].filter((t) => t.delta > 20).sort((a, b) => b.delta - a.delta).slice(0, 5);
    // Falls (negative delta, sorted ascending)
    const falls = [...trends].filter((t) => t.delta < -20).sort((a, b) => a.delta - b.delta).slice(0, 5);

    const lines: string[] = [];
    lines.push('### Category Spending Trends (Trailing 3-Mo vs 12-Mo Monthly Averages)');

    if (rises.length > 0) {
      lines.push('\n**Biggest Spending Increases (Recent Spikes):**');
      lines.push('| Category | 12-Mo Avg | Recent 3-Mo Avg | Change | % Change |');
      lines.push('|---|---|---|---|---|');
      for (const r of rises) {
        lines.push(
          `| ${r.name} | ${formatDollar(r.avg12m)}/mo | ${formatDollar(r.avg3m)}/mo | +${formatDollar(r.delta)}/mo | +${r.pctChange.toFixed(1)}% |`
        );
      }
    }

    if (falls.length > 0) {
      lines.push('\n**Biggest Spending Decreases (Recent Reductions):**');
      lines.push('| Category | 12-Mo Avg | Recent 3-Mo Avg | Change | % Change |');
      lines.push('|---|---|---|---|---|');
      for (const f of falls) {
        lines.push(
          `| ${f.name} | ${formatDollar(f.avg12m)}/mo | ${formatDollar(f.avg3m)}/mo | ${formatDollar(f.delta)}/mo | ${f.pctChange.toFixed(1)}% |`
        );
      }
    }

    if (rises.length === 0 && falls.length === 0) {
      lines.push('\nSpending across categories has remained relatively stable (no categories shifted by >$20/mo).');
    }

    return { text: lines.join('\n'), period: `${start12Str}..${endLastStr}` };
  },
};
