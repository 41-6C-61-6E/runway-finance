import { z } from 'zod';
import { getDb } from '@/lib/db';
import { budgets, categories } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { decryptRows, decryptField } from '@/lib/crypto';
import { getCategorySpending } from '@/lib/finance/categories';
import { formatDollar, formatPercent } from '../redact';
import type { FinanceContext } from '@/lib/finance/context';
import type { AskPack } from './index';

export const BudgetsParams = z.object({
  month: z.string().regex(/^\d{4}-\d{2}$/).optional(),
}).default({});

export type BudgetsParams = z.infer<typeof BudgetsParams>;

export const budgetsPack: AskPack<BudgetsParams> = {
  id: 'budgets',
  label: 'Category Budgets',
  href: (p) => (p.month ? `/budgets?month=${p.month}` : '/budgets'),
  paramsSchema: BudgetsParams,
  describe: 'Category budget limits vs actual spending and variance for a month',
  maxTokens: 600,
  async build(ctx: FinanceContext, params: BudgetsParams) {
    const db = getDb();
    const now = ctx.now;
    const targetMonth = params.month || `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

    const [budgetList, allCats, actualSpending] = await Promise.all([
      db.select().from(budgets).where(eq(budgets.userId, ctx.dataUserId)),
      db.select().from(categories).where(eq(categories.userId, ctx.dataUserId)),
      getCategorySpending(ctx, { startMonth: targetMonth, endMonth: targetMonth, groupBy: 'total' }),
    ]);

    const decCats = await decryptRows('categories', allCats, ctx.dek);
    const catMap = new Map(decCats.map((c) => [c.id, c.name]));
    const actualMap = new Map(actualSpending.map((s) => [s.categoryId, s.amount]));

    if (budgetList.length === 0) {
      return { text: 'No category budgets have been configured.', period: targetMonth };
    }

    // Filter relevant budgets for the month (either recurring or matching yearMonth)
    const activeBudgets: Array<{ categoryName: string; budgeted: number; actual: number; variance: number }> = [];
    let totalBudgeted = 0;
    let totalActual = 0;

    for (const b of budgetList) {
      if (b.yearMonth && b.yearMonth !== targetMonth && !b.isRecurring) continue;
      const amtStr = await decryptField(b.amount, ctx.dek).catch(() => '0');
      const budgeted = parseFloat(amtStr) || 0;
      const actual = actualMap.get(b.categoryId) || 0;
      const variance = budgeted - actual; // positive = under budget, negative = over budget
      const categoryName = catMap.get(b.categoryId) || 'Uncategorized';

      totalBudgeted += budgeted;
      totalActual += actual;

      activeBudgets.push({
        categoryName,
        budgeted,
        actual,
        variance,
      });
    }

    const lines: string[] = [];
    lines.push(`### Category Budgets vs Actual Spending (${targetMonth})`);
    lines.push(
      `- Total Budget: **${formatDollar(totalBudgeted)}** | Actual Spent: **${formatDollar(totalActual)}** | Remaining: **${formatDollar(totalBudgeted - totalActual)}**`
    );

    lines.push('\n| Category | Budgeted | Actual | Variance | Status |');
    lines.push('|---|---|---|---|---|');

    // Sort by largest over-budget first
    activeBudgets.sort((a, b) => a.variance - b.variance);

    for (const b of activeBudgets) {
      const status = b.variance < 0 ? 'Over Budget ⚠️' : 'On Track';
      const varStr = b.variance < 0 ? `-${formatDollar(Math.abs(b.variance))}` : `+${formatDollar(b.variance)}`;
      lines.push(
        `| ${b.categoryName} | ${formatDollar(b.budgeted)} | ${formatDollar(b.actual)} | ${varStr} | ${status} |`
      );
    }

    return { text: lines.join('\n'), period: targetMonth };
  },
};
