export interface AccountBase {
  id: string;
  name: string;
  type: string;
  balance: number | string;
  currency?: string;
  institution?: string | null;
  institutionName?: string | null;
  isHidden?: boolean | null;
  isExcludedFromNetWorth?: boolean | null;
  balanceDate?: string | null;
  createdAt?: string | Date;
  updatedAt?: string | Date;
  metadata?: Record<string, any> | string | null;
}

export interface SettingsAccount extends AccountBase {
  isExcludedFromCashFlow?: boolean | null;
  isManual?: boolean;
  connectionId?: string | null;
  syncFrequency?: string;
  lastSyncAt?: string | null;
  syncError?: string | null;
  color?: string | null;
  tags?: Array<{ id: string; name: string; color?: string }>;
}

export interface AccountFormData {
  name: string;
  type: string;
  balance: string | number;
  currency: string;
  institution?: string;
  syncFrequency?: string;
  isHidden?: boolean;
  isExcludedFromNetWorth?: boolean;
}
