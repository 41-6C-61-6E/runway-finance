export interface TransactionBase {
  id: string;
  accountId: string;
  accountName?: string;
  categoryId?: string | null;
  categoryName?: string | null;
  amount: number | string;
  date: string;
  description: string;
  payee?: string | null;
  notes?: string | null;
  pending?: boolean;
  ignored?: boolean;
  isExcludedFromCashFlow?: boolean;
  isExcludedFromBudget?: boolean;
  parentId?: string | null;
  source?: string | null;
  tags?: Array<{ id: string; name: string; color?: string }>;
  createdAt?: string | Date;
  updatedAt?: string | Date;
}

export interface TransactionPreset {
  id: string;
  name: string;
  filters: Record<string, any>;
  isDefault?: boolean;
}
