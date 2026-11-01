export interface GoalBase {
  id: string;
  name: string;
  description?: string | null;
  type: string;
  targetAmount: string;
  currentAmount: string;
  targetDate?: string | null;
  initialAmount?: string;
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
  percentage?: string;
  reserve?: string;
}

export interface Goal extends GoalBase {
  status: string;
  linkedAccountId: string | null;
  percentage: string;
  reserve: string;
  userId?: string;
  createdAt?: string | Date;
  updatedAt?: string | Date;
}
