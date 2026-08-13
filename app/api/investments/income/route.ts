import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { accounts, transactions } from '@/lib/db/schema';
import { eq, and, desc, inArray } from 'drizzle-orm';
import { logger } from '@/lib/logger';
import { getSessionDEK } from '@/lib/crypto-context';
import { decryptRows } from '@/lib/crypto';
import { isInvestmentAccount } from '@/lib/utils/account-scope';

const LOG_TAG = '[api-investments-income]';

export type TransactionType = 'dividend' | 'interest' | 'buy' | 'sell' | 'fee' | 'deposit' | 'withdrawal' | 'reinvestment' | 'transfer' | 'other';

const KEYWORD_MAP: { keywords: string[]; type: TransactionType }[] = [
  { keywords: ['dividend', 'div ', 'div.', 'dividnd', 'qualified div', 'ordinary div', 'cap gain dst', 'capital gain distribution', 'short term cap gain', 'long term cap gain'], type: 'dividend' },
  { keywords: ['interest', 'int ', 'int.', 'accrued interest', 'yield', 'sec yield', 'fed mmkt div', 'interest payment', 'credit interest'], type: 'interest' },
  { keywords: ['reinvest', 'reinvestment', 'drip'], type: 'reinvestment' },
  { keywords: ['buy', 'bought', 'purchase', 'acquired', 'investment purchase', 'market buy', 'limit buy'], type: 'buy' },
  { keywords: ['sell', 'sold', 'sale', 'proceeds', 'redemption', 'market sell', 'limit sell'], type: 'sell' },
  { keywords: ['fee', 'commission', 'expense ratio', 'management fee', 'advisory fee', 'service charge', 'margin interest', 'wire fee', 'foreign transaction fee', 'sec fee'], type: 'fee' },
  { keywords: ['deposit', 'contribution', 'transfer in', 'funding', 'rollover in', 'journal entry in', 'direct deposit', 'ach deposit'], type: 'deposit' },
  { keywords: ['withdrawal', 'distribution', 'transfer out', 'journal entry out', 'rollover out', 'ach withdrawal'], type: 'withdrawal' },
  { keywords: ['transfer', 'journal', 'sweep'], type: 'transfer' },
];

export function classifyTransaction(description: string, payee: string | null, amount: number): TransactionType {
  const text = `${description} ${payee ?? ''}`.toLowerCase();
  for (const { keywords, type } of KEYWORD_MAP) {
    if (keywords.some((kw) => text.includes(kw))) {
      return type;
    }
  }
  // Fallback heuristics by amount sign
  return 'other';
}

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  }

  const dataUserId = (session.user as any).dataUserId ?? session.user.id;
  const dek = await getSessionDEK();

  // Fetch last 13 months of investment transactions
  const startDate = new Date();
  startDate.setMonth(startDate.getMonth() - 13);
  const startStr = startDate.toISOString().split('T')[0];

  try {
    const userAccounts = await getDb()
      .select()
      .from(accounts)
      .where(eq(accounts.userId, dataUserId));

    const decryptedAccounts = await decryptRows('accounts', userAccounts, dek);
    const investmentAccounts = decryptedAccounts.filter((acc) =>
      isInvestmentAccount(acc.type)
    );

    if (investmentAccounts.length === 0) {
      return NextResponse.json({ monthlyIncome: [], totalAnnual: 0, transactions: [] });
    }

    const accountIds = investmentAccounts.map((acc) => acc.id);

    const rawTxns = await getDb()
      .select({
        id: transactions.id,
        accountId: transactions.accountId,
        date: transactions.date,
        amount: transactions.amount,
        description: transactions.description,
        payee: transactions.payee,
        pending: transactions.pending,
      })
      .from(transactions)
      .where(
        and(
          eq(transactions.userId, dataUserId),
          eq(transactions.deleted, false),
          inArray(transactions.accountId, accountIds)
        )
      )
      .orderBy(desc(transactions.date));

    const decryptedTxns = await decryptRows('transactions', rawTxns, dek);

    // Filter to those within our date range and classify
    const classified = decryptedTxns
      .filter((tx) => tx.date >= startStr)
      .map((tx) => {
        const amount = typeof tx.amount === 'string' ? parseFloat(tx.amount) : tx.amount;
        const type = classifyTransaction(tx.description, tx.payee, amount);
        const acc = investmentAccounts.find((a) => a.id === tx.accountId);
        return {
          id: tx.id,
          date: tx.date,
          amount: amount || 0,
          description: tx.description,
          payee: tx.payee,
          pending: tx.pending,
          accountName: acc?.name ?? 'Investment Account',
          institutionName: acc?.institution ?? 'Brokerage',
          type,
        };
      });

    // Monthly income aggregation (dividends + interest + reinvestments)
    const incomeTypes: TransactionType[] = ['dividend', 'interest', 'reinvestment'];
    const monthlyMap: Record<string, number> = {};

    for (const tx of classified) {
      if (!incomeTypes.includes(tx.type)) continue;
      // Dividends come in as positive amounts in this app's convention
      const incomeAmount = tx.amount > 0 ? tx.amount : -tx.amount;
      const yearMonth = String(tx.date).slice(0, 7); // "YYYY-MM"
      monthlyMap[yearMonth] = (monthlyMap[yearMonth] ?? 0) + incomeAmount;
    }

    const monthlyIncome = Object.entries(monthlyMap)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, total]) => ({ month, total }));

    // Total annual income (last 12 full months or annualized if shorter history)
    const now = new Date();
    const twelveMonthsAgo = new Date();
    twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 12);
    const twelveMonthsAgoStr = twelveMonthsAgo.toISOString().slice(0, 7);
    
    const trailing12Months = monthlyIncome.filter(({ month }) => month >= twelveMonthsAgoStr);
    const rawTotal = trailing12Months.reduce((sum, { total }) => sum + total, 0);

    // If fewer than 12 months present, annualize based on available months (minimum 1 month)
    const activeMonthCount = trailing12Months.length;
    const totalAnnual = activeMonthCount > 0 && activeMonthCount < 12
      ? Number(((rawTotal / activeMonthCount) * 12).toFixed(2))
      : Number(rawTotal.toFixed(2));

    return NextResponse.json({
      monthlyIncome,
      totalAnnual,
      rawTotalAnnual: rawTotal,
      transactions: classified,
    });
  } catch (error) {
    logger.error(`${LOG_TAG} Error fetching investment income`, {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      { error: 'internal_error', message: 'Failed to fetch investment income' },
      { status: 500 }
    );
  }
}
