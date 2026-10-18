import { z } from 'zod';
import { getMonthlyCashFlow } from '@/lib/finance/cash-flow';
import { formatDollar } from '../redact';
import type { FinanceContext } from '@/lib/finance/context';
import type { AskPack } from './index';

export const CashFlowMonthlyParams = z.object({
  months: z.number().int().min(1).max(24).default(12),
}).default({ months: 12 });

export type CashFlowMonthlyParams = z.infer<typeof CashFlowMonthlyParams>;

export const cashFlowMonthlyPack: AskPack<CashFlowMonthlyParams> = {
  id: 'cash_flow_monthly',
  label: 'Monthly Cash Flow',
  href: () => '/flows',
  paramsSchema: CashFlowMonthlyParams,
  describe: 'Monthly income, expenses, and net savings for the last N months',
  maxTokens: 700,
  async build(ctx: FinanceContext, params: CashFlowMonthlyParams) {
    const months = params?.months ?? 12;
    const flows = await getMonthlyCashFlow(ctx, months);

    if (flows.length === 0) {
      return { text: 'No monthly cash flow records found.', period: `Last ${months} months` };
    }

    const lines: string[] = [];
    lines.push(`### Monthly Cash Flow (Last ${flows.length} Months)`);
    lines.push('| Month | Income | Expenses | Net Cash Flow | Savings Rate |');
    lines.push('|---|---|---|---|---|');

    for (const f of flows) {
      const sRate = f.income > 0 ? `${((Math.max(0, f.netCashFlow) / f.income) * 100).toFixed(1)}%` : '0.0%';
      lines.push(
        `| ${f.yearMonth} | ${formatDollar(f.income)} | ${formatDollar(f.expenses)} | ${formatDollar(f.netCashFlow)} | ${sRate} |`
      );
    }

    const period = `${flows[0].yearMonth} to ${flows[flows.length - 1].yearMonth}`;
    return { text: lines.join('\n'), period };
  },
};
