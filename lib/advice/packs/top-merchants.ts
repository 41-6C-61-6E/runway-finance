import { z } from 'zod';
import { getDb } from '@/lib/db';
import { transactions, categories } from '@/lib/db/schema';
import { eq, and, gte, lte } from 'drizzle-orm';
import { decryptRows } from '@/lib/crypto';
import { normalizeMerchantName } from '@/lib/utils/recurring';
import { toCashFlowAmount } from '@/lib/utils/account-scope';
import { formatDollar } from '../redact';
import type { FinanceContext } from '@/lib/finance/context';
import type { AskPack } from './index';

export const TopMerchantsParams = z
  .object({
    months: z.number().int().min(1).max(24).default(3),
    startMonth: z.string().regex(/^\d{4}-\d{2}$/).optional(),
    endMonth: z.string().regex(/^\d{4}-\d{2}$/).optional(),
    limit: z.number().int().min(3).max(20).default(10),
  })
  .default({ months: 3, limit: 10 });

export type TopMerchantsParams = z.infer<typeof TopMerchantsParams>;

function cleanMerchant(raw: string): string {
  if (!raw || typeof raw !== 'string') return 'Unknown';
  let s = raw.trim();

  // Normalize common Amazon transaction descriptors to 'Amazon'
  if (/^(amzn|amazon)(\.com)?(\b|_|\*|\s|$)/i.test(s)) {
    return 'Amazon';
  }

  // Standard recurring/merchant normalization
  s = normalizeMerchantName(s);

  // If trailing digits remained directly affixed (e.g. Store1234)
  s = s.replace(/\d+$/, '').trim();

  return s || 'Unknown';
}

export const topMerchantsPack: AskPack<TopMerchantsParams> = {
  id: 'top_merchants',
  label: 'Top Merchants',
  href: () => '/spending',
  paramsSchema: TopMerchantsParams,
  describe:
    'Top merchants and payees by total spending and transaction count (privacy-preserving aggregates only, no individual transaction details)',
  maxTokens: 500,
  async build(ctx: FinanceContext, params: TopMerchantsParams) {
    const db = getDb();
    const now = ctx.now;
    const months = params.months ?? 3;
    const limit = params.limit ?? 10;

    const endMonth =
      params.endMonth || `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    let startMonth = params.startMonth;
    if (!startMonth) {
      const d = new Date(now.getFullYear(), now.getMonth() - months + 1, 1);
      startMonth = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    }

    const startDateStr = `${startMonth}-01`;
    const [endY, endM] = endMonth.split('-').map(Number);
    const lastDay = new Date(endY, endM, 0).getDate();
    const endDateStr = `${endMonth}-${String(lastDay).padStart(2, '0')}`;

    const [rawTxs, allCats, accountsList] = await Promise.all([
      db
        .select({
          id: transactions.id,
          accountId: transactions.accountId,
          amount: transactions.amount,
          payee: transactions.payee,
          description: transactions.description,
          categoryId: transactions.categoryId,
        })
        .from(transactions)
        .where(
          and(
            eq(transactions.userId, ctx.dataUserId),
            eq(transactions.deleted, false),
            eq(transactions.ignored, false),
            gte(transactions.date, startDateStr),
            lte(transactions.date, endDateStr)
          )
        ),
      db.select().from(categories).where(eq(categories.userId, ctx.dataUserId)),
      ctx.getAccounts(),
    ]);

    const decCats = await decryptRows('categories', allCats, ctx.dek);
    const catMap = new Map(decCats.map((c) => [c.id, c]));
    const accountTypeMap = new Map(accountsList.map((a) => [a.id, a.type]));

    const decTxs = await decryptRows('transactions', rawTxs, ctx.dek);

    // Group by normalized merchant name
    const merchantMap = new Map<string, { totalSpent: number; count: number }>();
    let totalAllMerchants = 0;

    for (const tx of decTxs) {
      if (tx.accountId && ctx.hiddenAccountIds.has(tx.accountId)) continue;

      const cat = tx.categoryId ? catMap.get(tx.categoryId) : undefined;
      if (cat?.excludeFromReports || cat?.categoryType === 'transfer') continue;

      const rawAmount = parseFloat(tx.amount) || 0;
      const accType = accountTypeMap.get(tx.accountId);
      const cfAmount = toCashFlowAmount(rawAmount, accType);

      // Only aggregate outflows / expenses (cfAmount < 0)
      if (cfAmount >= 0) continue;

      const spent = Math.abs(cfAmount);
      const rawName = tx.payee?.trim() || tx.description?.trim() || 'Unknown';
      const cleanName = cleanMerchant(rawName);

      const existing = merchantMap.get(cleanName) || { totalSpent: 0, count: 0 };
      existing.totalSpent += spent;
      existing.count += 1;
      merchantMap.set(cleanName, existing);
      totalAllMerchants += spent;
    }

    const periodStr = `${startMonth}..${endMonth}`;
    if (merchantMap.size === 0) {
      return {
        text: `No merchant spending recorded between ${startMonth} and ${endMonth}.`,
        period: periodStr,
      };
    }

    const sorted = Array.from(merchantMap.entries()).sort(
      (a, b) => b[1].totalSpent - a[1].totalSpent
    );

    const topItems = sorted.slice(0, limit);
    const remainingItems = sorted.slice(limit);
    const otherSpent = remainingItems.reduce((sum, [, m]) => sum + m.totalSpent, 0);
    const otherCount = remainingItems.reduce((sum, [, m]) => sum + m.count, 0);

    const lines: string[] = [];
    lines.push(`### Top Merchants & Payees (${periodStr})`);
    lines.push('| Merchant | Total Spent | Transactions | % of Total |');
    lines.push('|---|---|---|---|');

    for (const [name, stats] of topItems) {
      const pct =
        totalAllMerchants > 0 ? ((stats.totalSpent / totalAllMerchants) * 100).toFixed(1) : '0.0';
      lines.push(`| ${name} | ${formatDollar(stats.totalSpent)} | ${stats.count} | ${pct}% |`);
    }

    if (otherSpent > 0) {
      const otherPct =
        totalAllMerchants > 0 ? ((otherSpent / totalAllMerchants) * 100).toFixed(1) : '0.0';
      lines.push(
        `| Other (${remainingItems.length} merchants) | ${formatDollar(otherSpent)} | ${otherCount} | ${otherPct}% |`
      );
    }

    const totalTxCount = sorted.reduce((sum, [, m]) => sum + m.count, 0);
    lines.push(
      `| **Total** | **${formatDollar(totalAllMerchants)}** | **${totalTxCount}** | **100.0%** |`
    );

    return { text: lines.join('\n'), period: periodStr };
  },
};
