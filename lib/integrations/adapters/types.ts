export interface NormalizedProviderAccount {
  externalId: string;
  name: string;
  type: string;
  balance: number | string;
  currency?: string;
  institutionName?: string;
}

export interface NormalizedProviderTransaction {
  externalId: string;
  accountId: string;
  amount: number | string;
  date: string;
  description: string;
  payee?: string;
  memo?: string;
  pending?: boolean;
}

export interface ProviderAdapter {
  readonly provider: 'simplefin' | 'plaid';
  fetchAccounts(credentials: unknown): Promise<NormalizedProviderAccount[]>;
  fetchTransactions(
    credentials: unknown,
    startDate: Date,
    endDate: Date
  ): Promise<NormalizedProviderTransaction[]>;
  mapProviderBalance?(account: NormalizedProviderAccount): number;
}

