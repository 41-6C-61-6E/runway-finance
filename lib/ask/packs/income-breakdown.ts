import { z } from 'zod';
import { getDb } from '@/lib/db';
import { categoryIncomeSummary, categories, paystubs } from '@/lib/db/schema';
import { eq, and, gte, lte } from 'drizzle-orm';
import { decryptRows, decryptField } from '@/lib/crypto';
import { formatDollar } from '../redact';
import type { FinanceContext } from '@/lib/finance/context';
import type { AskPack } from './index';

export const IncomeBreakdownParams = z.object({
  months: z.number().int().min(1).max(24).default(12),
}).default({ months: 12 });

export type IncomeBreakdownParams = z.infer<typeof IncomeBreakdownParams>;

export const incomeBreakdownPack: AskPack<IncomeBreakdownParams> = {
  id: 'income_breakdown',
  label: 'Income Breakdown',
  href: () => '/flows',
  paramsSchema: IncomeBreakdownParams,
  describe: 'Income sources by category and payroll deductions/taxes summary',
  maxTokens: 500,
  async build(ctx: FinanceContext, params: IncomeBreakdownParams) {
    const db = getDb();
    const months = params?.months ?? 12;
    const now = ctx.now;
    const startDate = new Date(now.getFullYear(), now.getMonth() - months + 1, 1);
    const startStr = `${startDate.getFullYear()}-${String(startDate.getMonth() + 1).padStart(2, '0')}`;
    const endStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

    // 1. Category income summaries
    const [allCats, incRows] = await Promise.all([
      db.select().from(categories).where(eq(categories.userId, ctx.dataUserId)),
      db
        .select()
        .from(categoryIncomeSummary)
        .where(
          and(
            eq(categoryIncomeSummary.userId, ctx.dataUserId),
            gte(categoryIncomeSummary.yearMonth, startStr),
            lte(categoryIncomeSummary.yearMonth, endStr)
          )
        ),
    ]);

    const decCats = await decryptRows('categories', allCats, ctx.dek);
    const catMap = new Map(decCats.map((c) => [c.id, c.name]));

    const catTotals = new Map<string, number>();
    for (const row of incRows) {
      if (row.accountId && ctx.hiddenAccountIds.has(row.accountId)) continue;
      const amtStr = await decryptField(row.amount, ctx.dek).catch(() => '0');
      const amt = parseFloat(amtStr) || 0;
      const catName = catMap.get(row.categoryId) || 'Other Income';
      catTotals.set(catName, (catTotals.get(catName) || 0) + amt);
    }

    // 2. Paystub totals (strictly no employer names or line item names)
    const startDateFull = `${startStr}-01`;
    const stubs = await db
      .select({
        gross: paystubs.grossCurrent,
        taxes: paystubs.taxesCurrent,
        deductions: paystubs.deductionsCurrent,
        net: paystubs.netCurrent,
      })
      .from(paystubs)
      .where(
        and(
          eq(paystubs.userId, ctx.dataUserId),
          gte(paystubs.checkDate, startDateFull)
        )
      );

    const decryptedStubs = await decryptRows('paystubs', stubs, ctx.dek);
    let totalGross = 0;
    let totalTaxes = 0;
    let totalDeductions = 0;
    let totalNet = 0;

    for (const stub of decryptedStubs) {
      totalGross += parseFloat(stub.gross) || 0;
      totalTaxes += parseFloat(stub.taxes) || 0;
      totalDeductions += parseFloat(stub.deductions) || 0;
      totalNet += parseFloat(stub.net) || 0;
    }

    const lines: string[] = [];
    lines.push(`### Income Breakdown (${startStr} to ${endStr})`);

    if (catTotals.size > 0) {
      lines.push('\n**Income by Category:**');
      lines.push('| Category | Total Amount | Monthly Average |');
      lines.push('|---|---|---|');
      const sorted = Array.from(catTotals.entries()).sort((a, b) => b[1] - a[1]);
      for (const [name, total] of sorted) {
        lines.push(`| ${name} | ${formatDollar(total)} | ${formatDollar(total / months)}/mo |`);
      }
    } else {
      lines.push('\nNo categorized income records found for this period.');
    }

    if (decryptedStubs.length > 0) {
      lines.push(`\n**Payroll Summary (${decryptedStubs.length} paystubs in period):**`);
      lines.push(`- Gross Pay: ${formatDollar(totalGross)} (${formatDollar(totalGross / months)}/mo)`);
      lines.push(`- Taxes Withheld: ${formatDollar(totalTaxes)} (${formatDollar(totalTaxes / months)}/mo)`);
      lines.push(`- Deductions: ${formatDollar(totalDeductions)} (${formatDollar(totalDeductions / months)}/mo)`);
      lines.push(`- Take-Home (Net): ${formatDollar(totalNet)} (${formatDollar(totalNet / months)}/mo)`);
    }

    return { text: lines.join('\n'), period: `${startStr}..${endStr}` };
  },
};
