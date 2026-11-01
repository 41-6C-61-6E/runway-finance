export interface GoalBase {
  id: string;
  name: string;
  description?: string | null;
  type: string;
  targetAmount: string | number;
  currentAmount: string | number;
  targetDate?: string | null;
  initialAmount?: string | number;
  allocatedAmount?: number;
  isUnderfunded?: boolean;
  accountBalance?: number | null;
  accountName?: string | null;
  remainingOnAccount?: number | null;
  sortOrder?: number;
  category?: { id: string; name: string; color: string } | string | null;
  tags?: Array<{ id: string; name: string; color: string }>;
  status?: string;
  linkedAccountId?: string | null;
}

export interface Goal extends GoalBase {
  userId?: string;
  createdAt?: string | Date;
  updatedAt?: string | Date;
}

