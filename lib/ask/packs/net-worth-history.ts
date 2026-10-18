import { z } from 'zod';
import { getNetWorthSeries } from '@/lib/finance/net-worth';
import { formatDollar } from '../redact';
import type { FinanceContext } from '@/lib/finance/context';
import type { AskPack } from './index';

export const NetWorthHistoryParams = z.object({
  months: z.number().int().min(3).max(60).default(24),
}).default({ months: 24 });

export type NetWorthHistoryParams = z.infer<typeof NetWorthHistoryParams>;

export const netWorthHistoryPack: AskPack<NetWorthHistoryParams> = {
  id: 'net_worth_history',
  label: 'Net Worth History',
  href: () => '/',
  paramsSchema: NetWorthHistoryParams,
  describe: 'Historical net worth, total assets, and total liabilities by month',
  maxTokens: 600,
  async build(ctx: FinanceContext, params: NetWorthHistoryParams) {
    const months = params?.months ?? 24;
    const series = await getNetWorthSeries(ctx, { months });

    if (series.length === 0) {
      return { text: 'No historical net worth snapshots recorded.', period: `Last ${months} months` };
    }

    // Deduplicate to 1 point per month
    const monthlyMap = new Map<string, typeof series[0]>();
    for (const pt of series) {
      const ym = pt.date.substring(0, 7);
      monthlyMap.set(ym, pt);
    }

    const points = Array.from(monthlyMap.values());
    const lines: string[] = [];
    lines.push(`### Net Worth History (${points.length} Monthly Snapshots)`);
    lines.push('| Month | Net Worth | Assets | Liabilities | MoM Change |');
    lines.push('|---|---|---|---|---|');

    for (let i = 0; i < points.length; i++) {
      const cur = points[i];
      const prev = i > 0 ? points[i - 1] : null;
      const changeStr = prev
        ? `${cur.netWorth - prev.netWorth >= 0 ? '+' : ''}${formatDollar(cur.netWorth - prev.netWorth)}`
        : '-';
      lines.push(
        `| ${cur.date.substring(0, 7)} | ${formatDollar(cur.netWorth)} | ${formatDollar(cur.totalAssets)} | ${formatDollar(cur.totalLiabilities)} | ${changeStr} |`
      );
    }

    const period = `${points[0].date.substring(0, 7)} to ${points[points.length - 1].date.substring(0, 7)}`;
    return { text: lines.join('\n'), period };
  },
};
