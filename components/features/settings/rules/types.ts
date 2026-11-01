export type Condition = {
  id: string; // temp id for UI
  field: string;
  operator: string;
  value: string;
  caseSensitive: boolean;
};

export type Rule = {
  id: string;
  name: string;
  priority: number;
  isActive: boolean;
  isSystem: boolean;
  createdByAi: boolean;
  conditionField: string;
  conditionOperator: string;
  conditionValue: string;
  conditionCaseSensitive: boolean;
  conditions?: Condition[];
  setCategoryId: string | null;
  setPayee: string | null;
  setReviewed: boolean | null;
  setTagId: string | null;
  categoryName: string | null;
  categoryColor: string | null;
  overrideExisting: boolean;
};

export type Category = {
  id: string;
  name: string;
  color: string;
  parentId: string | null;
  isIncome: boolean;
};

export type TagItem = {
  id: string;
  name: string;
  color: string;
};

export const FIELD_OPTIONS = [
  { value: 'description', label: 'Description' },
  { value: 'payee', label: 'Payee' },
  { value: 'amount', label: 'Amount' },
  { value: 'memo', label: 'Memo' },
] as const;

export const OPERATOR_OPTIONS = [
  { value: 'contains', label: 'Contains' },
  { value: 'equals', label: 'Equals' },
  { value: 'starts_with', label: 'Starts with' },
  { value: 'ends_with', label: 'Ends with' },
  { value: 'regex', label: 'Regex' },
] as const;
