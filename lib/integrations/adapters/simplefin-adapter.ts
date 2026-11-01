import 'server-only';
import { fetchAccounts, SimpleFINAccount } from '@/lib/simplefin';
import type { ProviderAdapter, NormalizedProviderAccount, NormalizedProviderTransaction } from './types';

export class SimplefinAdapter implements ProviderAdapter {
  readonly provider = 'simplefin' as const;

  async fetchAccounts(credentials: unknown): Promise<NormalizedProviderAccount[]> {
    const accessUrl = String(credentials);
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const data = await fetchAccounts(accessUrl, thirtyDaysAgo, now);
    return (data.accounts || []).map((acc: SimpleFINAccount) => ({
      externalId: acc.id,
      name: acc.name,
      type: 'checking', // resolved later by account classifier
      balance: acc.balance,
      currency: acc.currency,
      institutionName: acc.org?.name,
    }));
  }

  async fetchTransactions(
    credentials: unknown,
    startDate: Date,
    endDate: Date
  ): Promise<NormalizedProviderTransaction[]> {
    const accessUrl = String(credentials);
    const data = await fetchAccounts(accessUrl, startDate, endDate);
    const transactions: NormalizedProviderTransaction[] = [];
    for (const acc of data.accounts || []) {
      for (const tx of acc.transactions || []) {
        const txDate = tx.posted ? new Date(tx.posted * 1000).toISOString().split('T')[0] : '';
        transactions.push({
          externalId: tx.id,
          accountId: acc.id,
          amount: tx.amount,
          date: txDate,
          description: tx.description,
          payee: tx.payee,
          memo: tx.memo,
          pending: tx.pending,
        });
      }
    }
    return transactions;
  }
}
