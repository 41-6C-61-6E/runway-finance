import { z } from 'zod';
import { getDb } from '@/lib/db';
import { holdings } from '@/lib/db/schema';
import { inArray } from 'drizzle-orm';
import { decryptRows } from '@/lib/crypto';
import { isInvestmentAccount } from '@/lib/utils/account-scope';
import { formatDollar, formatPercent } from '../redact';
import type { FinanceContext } from '@/lib/finance/context';
import type { AskPack } from './index';

export const InvestmentsParams = z.object({}).default({});
export type InvestmentsParams = z.infer<typeof InvestmentsParams>;

export const investmentsPack: AskPack<InvestmentsParams> = {
  id: 'investments',
  label: 'Investment Portfolio',
  href: () => '/investments',
  paramsSchema: InvestmentsParams,
  describe: 'Portfolio asset allocation by account type and top ticker holdings with portfolio %',
  maxTokens: 600,
  async build(ctx: FinanceContext) {
    const allAccounts = await ctx.getAccounts();
    const invAccounts = allAccounts.filter((a) => isInvestmentAccount(a.type));

    if (invAccounts.length === 0) {
      return { text: 'No investment or retirement accounts found.' };
    }

    const accountIds = invAccounts.map((a) => a.id);
    const db = getDb();
    const rawHoldings = await db
      .select()
      .from(holdings)
      .where(inArray(holdings.accountId, accountIds));

    const decHoldings = await decryptRows('holdings', rawHoldings, ctx.dek);

    // Allocation by account type
    const allocByType = new Map<string, number>();
    let totalPortfolioVal = 0;

    for (const acc of invAccounts) {
      const bal = typeof acc.balance === 'string' ? parseFloat(acc.balance) : acc.balance;
      const validBal = isNaN(bal) ? 0 : bal;
      if (validBal > 0) {
        allocByType.set(acc.type, (allocByType.get(acc.type) || 0) + validBal);
        totalPortfolioVal += validBal;
      }
    }

    // Ticker breakdown
    const tickerVals = new Map<string, number>();
    for (const h of decHoldings) {
      const ticker = (h.tickerOverride || h.ticker || h.publicEquivalent || '').toUpperCase().trim();
      const val = parseFloat(h.value) || 0;
      if (ticker && val > 0) {
        tickerVals.set(ticker, (tickerVals.get(ticker) || 0) + val);
      }
    }

    const lines: string[] = [];
    lines.push('### Investment Portfolio Overview');
    lines.push(`- Total Investable Portfolio: **${formatDollar(totalPortfolioVal)}**`);

    lines.push('\n**Allocation by Account Type:**');
    lines.push('| Account Type | Balance | % of Portfolio |');
    lines.push('|---|---|---|');
    for (const [type, val] of allocByType.entries()) {
      const pct = totalPortfolioVal > 0 ? (val / totalPortfolioVal) * 100 : 0;
      lines.push(`| ${type} | ${formatDollar(val)} | ${formatPercent(pct)} |`);
    }

    if (tickerVals.size > 0) {
      const sortedTickers = Array.from(tickerVals.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10);

      lines.push('\n**Top Holdings (Tickers and % of Portfolio Only):**');
      lines.push('| Ticker | % of Portfolio |');
      lines.push('|---|---|');
      for (const [ticker, val] of sortedTickers) {
        const pct = totalPortfolioVal > 0 ? (val / totalPortfolioVal) * 100 : 0;
        lines.push(`| ${ticker} | ${formatPercent(pct)} |`);
      }
    } else {
      lines.push('\nNo individual security tickers synced.');
    }

    return { text: lines.join('\n') };
  },
};
