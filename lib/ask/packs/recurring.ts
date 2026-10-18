import { z } from 'zod';
import { getRecurringSummary, getUpcomingBills, getRecurringTransactions } from '@/lib/services/recurring-detection';
import { getDb } from '@/lib/db';
import { categories } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { decryptRows } from '@/lib/crypto';
import { formatDollar } from '../redact';
import type { FinanceContext } from '@/lib/finance/context';
import type { AskPack } from './index';

export const RecurringParams = z.object({}).default({});
export type RecurringParams = z.infer<typeof RecurringParams>;

export const recurringPack: AskPack<RecurringParams> = {
  id: 'recurring',
  label: 'Recurring Obligations',
  href: () => '/spending',
  paramsSchema: RecurringParams,
  describe: 'Recurring subscriptions, fixed bills, upcoming payments, and frequency breakdown',
  maxTokens: 400,
  async build(ctx: FinanceContext) {
    const [summary, upcoming, rawItems, dbCats] = await Promise.all([
      getRecurringSummary(ctx.dataUserId, ctx.dek).catch(() => null),
      getUpcomingBills(ctx.dataUserId, ctx.dek, 30).catch(() => null),
      getRecurringTransactions(ctx.dataUserId, ctx.dek, { status: 'active', flowType: 'expense' }).catch(() => []),
      getDb().select().from(categories).where(eq(categories.userId, ctx.dataUserId)),
    ]);

    const decCats = await decryptRows('categories', dbCats, ctx.dek);
    const catMap = new Map(decCats.map((c) => [c.id, c.name]));

    const items = rawItems as any[];
    if (!summary || items.length === 0) {
      return { text: 'No active recurring expenses or subscriptions detected.' };
    }

    // Totals by frequency
    const byFreq = new Map<string, { total: number; count: number }>();
    // Totals by category
    const byCat = new Map<string, number>();

    for (const it of items) {
      const amt = Math.abs(it.monthlyAmount || 0);
      const freq = it.frequency || 'monthly';
      const catName = it.categoryId ? catMap.get(it.categoryId) || 'Uncategorized' : 'Uncategorized';

      const freqStat = byFreq.get(freq) || { total: 0, count: 0 };
      freqStat.total += amt;
      freqStat.count += 1;
      byFreq.set(freq, freqStat);

      byCat.set(catName, (byCat.get(catName) || 0) + amt);
    }

    const lines: string[] = [];
    lines.push('### Recurring Expenses & Subscriptions Summary');
    lines.push(
      `- Total Recurring Outflow: **${formatDollar(summary.monthlyExpenses)}/mo** (${formatDollar(summary.annualExpenses)}/yr) across ${summary.expenseCount} items`
    );
    lines.push(`- Fixed Bills: ${formatDollar(summary.monthlyFixed)}/mo (${summary.fixedCount} items)`);
    lines.push(`- Discretionary Subscriptions: ${formatDollar(summary.monthlySubscriptions)}/mo (${summary.subscriptionCount} items)`);

    if (upcoming && upcoming.count > 0) {
      lines.push(`\n**Upcoming in Next 30 Days:**`);
      lines.push(`- Due this week: ${formatDollar(upcoming.stats.dueThisWeek)}`);
      lines.push(`- Due this month: ${formatDollar(upcoming.stats.dueThisMonth)} (${upcoming.count} payments scheduled)`);
    }

    lines.push('\n**Totals by Frequency (Monthly Equivalent):**');
    lines.push('| Frequency | Monthly Equivalent | Count |');
    lines.push('|---|---|---|');
    for (const [freq, data] of byFreq.entries()) {
      lines.push(`| ${freq} | ${formatDollar(data.total)}/mo | ${data.count} |`);
    }

    lines.push('\n**Top Categories for Recurring Charges:**');
    lines.push('| Category | Monthly Total |');
    lines.push('|---|---|');
    const sortedCats = Array.from(byCat.entries()).sort((a, b) => b[1] - a[1]).slice(0, 5);
    for (const [cat, amt] of sortedCats) {
      lines.push(`| ${cat} | ${formatDollar(amt)}/mo |`);
    }

    return { text: lines.join('\n') };
  },
};
