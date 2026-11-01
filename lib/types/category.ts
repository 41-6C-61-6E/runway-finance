export type CategoryType = 'standard' | 'compound' | 'transfer' | 'income' | 'expense';

export interface CategoryBase {
  id: string;
  name: string;
  color?: string;
  icon?: string | null;
  parentId?: string | null;
  parentName?: string | null;
  parentColor?: string | null;
  isIncome?: boolean;
  categoryType?: string;
  order?: number;
}

export interface Category extends CategoryBase {
  userId?: string;
  expenseParentId?: string | null;
  isSystem?: boolean;
  createdByAi?: boolean;
  excludeFromReports?: boolean;
  hideFromTransactions?: boolean;
  isDiscretionary?: boolean;
  displayOrder?: number;
  transactionCount?: number;
  subcategories?: Category[];
}

export interface CategoryTreeItem extends CategoryBase {
  children?: CategoryTreeItem[];
}
