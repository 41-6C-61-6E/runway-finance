import 'server-only';
import type { ProviderAdapter, NormalizedProviderAccount, NormalizedProviderTransaction } from './types';

export interface PlaidAccountShape {
  account_id: string;
  name: string;
  type?: string;
  balances?: {
    current?: number | null;
    iso_currency_code?: string | null;
  };
  official_name?: string | null;
}

export interface PlaidTransactionShape {
  transaction_id: string;
  account_id: string;
  amount: number | string;
  date: string;
  name: string;
  merchant_name?: string | null;
  payment_channel?: string | null;
  pending?: boolean;
}

export interface PlaidClientShape {
  accountsGet(params: { access_token: string }): Promise<{ data?: { accounts?: PlaidAccountShape[] } }>;
  transactionsSync(params: { access_token: string }): Promise<{ data?: { added?: PlaidTransactionShape[] } }>;
}

export interface PlaidCredentials {
  client: PlaidClientShape;
  accessToken: string;
}

export class PlaidAdapter implements ProviderAdapter {
  readonly provider = 'plaid' as const;

  async fetchAccounts(credentials: unknown): Promise<NormalizedProviderAccount[]> {
    const { client, accessToken } = credentials as PlaidCredentials;
    const response = await client.accountsGet({ access_token: accessToken });
    const accounts = response.data?.accounts || [];
    return accounts.map((acc) => ({
      externalId: acc.account_id,
      name: acc.name,
      type: acc.type || 'depository',
      balance: acc.balances?.current ?? 0,
      currency: acc.balances?.iso_currency_code || 'USD',
      institutionName: acc.official_name || acc.name,
    }));
  }

  async fetchTransactions(
    credentials: unknown,
    _startDate: Date,
    _endDate: Date
  ): Promise<NormalizedProviderTransaction[]> {
    const { client, accessToken } = credentials as PlaidCredentials;
    const response = await client.transactionsSync({ access_token: accessToken });
    const added = response.data?.added || [];
    return added.map((tx) => ({
      externalId: tx.transaction_id,
      accountId: tx.account_id,
      amount: tx.amount,
      date: tx.date,
      description: tx.name,
      payee: tx.merchant_name || tx.name,
      memo: tx.payment_channel || undefined,
      pending: tx.pending,
    }));
  }
}
