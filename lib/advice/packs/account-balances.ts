import { z } from 'zod';
import { buildAccountLabel, formatDollar } from '../redact';
import type { FinanceContext } from '@/lib/finance/context';
import type { AdvicePack } from './index';

export const AccountBalancesParams = z.object({}).default({});
export type AccountBalancesParams = z.infer<typeof AccountBalancesParams>;

export const accountBalancesPack: AdvicePack<AccountBalancesParams> = {
  id: 'account_balances',
  label: 'Account Balances',
  href: () => '/',
  paramsSchema: AccountBalancesParams,
  describe: 'Balances and asset/liability classifications for all active accounts',
  maxTokens: 600,
  async build(ctx: FinanceContext) {
    const accounts = await ctx.getAccounts();
    const includeNames = Boolean(
      (ctx.settings as any)?.aiAdviceIncludeAccountNames ||
      (ctx.settings as any)?.aiAskIncludeAccountNames
    );

    if (accounts.length === 0) {
      return { text: 'No active accounts found.' };
    }

    const typeIndexMap = new Map<string, number>();
    const lines: string[] = [];
    lines.push('### Account Balances');
    lines.push('| Account Label | Type | Balance |');
    lines.push('|---|---|---|');

    let totalAssets = 0;
    let totalLiabilities = 0;

    for (const acc of accounts) {
      const label = buildAccountLabel(acc, includeNames, typeIndexMap);
      const bal = typeof acc.balance === 'string' ? parseFloat(acc.balance) : acc.balance;
      const validBal = isNaN(bal) ? 0 : bal;

      if (validBal >= 0) {
        totalAssets += validBal;
      } else {
        totalLiabilities += Math.abs(validBal);
      }

      lines.push(`| ${label} | ${acc.type} | ${formatDollar(validBal)} |`);
    }

    lines.push(`| **Total Assets** | | **${formatDollar(totalAssets)}** |`);
    lines.push(`| **Total Liabilities** | | **${formatDollar(totalLiabilities)}** |`);
    lines.push(`| **Net Total** | | **${formatDollar(totalAssets - totalLiabilities)}** |`);

    return { text: lines.join('\n') };
  },
};
