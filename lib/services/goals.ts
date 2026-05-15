import { getDb } from '@/lib/db';
import { financialGoals } from '@/lib/db/schema';
import { eq, and, desc, asc, gte, lte, sql } from 'drizzle-orm';
import { accounts } from '@/lib/db/schema';

export interface GoalProgress {
  goal: typeof financialGoals.$inferSelect;
  progress: number;
  remaining: number;
  daysRemaining: number | null;
  isOverdue: boolean;
  isCompleted: boolean;
  linkedAccountBalance: number | null;
}

export async function getGoalProgress(goalId: string): Promise<GoalProgress | null> {
  const db = getDb();
  const goal = await db
    .select()
    .from(financialGoals)
    .where(eq(financialGoals.id, goalId))
    .limit(1);

  if (!goal[0]) return null;

  const g = goal[0];
  const target = parseFloat(g.targetAmount);
  const current = parseFloat(g.currentAmount);
  const progress = target > 0 ? Math.min((current / target) * 100, 100) : 0;
  const remaining = Math.max(target - current, 0);

  let daysRemaining: number | null = null;
  let isOverdue = false;
  if (g.targetDate) {
    const target = new Date(g.targetDate);
    const today = new Date();
    const diff = Math.ceil((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    daysRemaining = diff;
    isOverdue = diff < 0 && g.status === 'active';
  }

  let linkedAccountBalance: number | null = null;
  if (g.linkedAccountId) {
    const acct = await db
      .select({ balance: accounts.balance })
      .from(accounts)
      .where(and(eq(accounts.id, g.linkedAccountId), eq(accounts.userId, g.userId)))
      .limit(1);
    if (acct[0]) {
      linkedAccountBalance = parseFloat(acct[0].balance);
    }
  }

  return {
    goal: g,
    progress,
    remaining,
    daysRemaining,
    isOverdue,
    isCompleted: progress >= 100,
    linkedAccountBalance,
  };
}

export async function syncGoalProgress(goalId: string): Promise<GoalProgress | null> {
  const db = getDb();
  const progress = await getGoalProgress(goalId);
  if (!progress || !progress.goal.linkedAccountId) return progress;

  const target = parseFloat(progress.goal.targetAmount);
  const current = parseFloat(progress.goal.currentAmount);
  const progress2 = target > 0 ? Math.min((current / target) * 100, 100) : 0;

  await db
    .update(financialGoals)
    .set({ currentAmount: String(current), updatedAt: new Date() })
    .where(and(eq(financialGoals.id, goalId), eq(financialGoals.userId, progress.goal.userId)));

  return progress;
}

export async function getGoalsByStatus(userId: string, status: string) {
  const db = getDb();
  return db
    .select()
    .from(financialGoals)
    .where(and(eq(financialGoals.userId, userId), eq(financialGoals.status, status)))
    .orderBy(desc(financialGoals.priority), asc(financialGoals.targetDate));
}

export async function getGoalsByType(userId: string, type: string) {
  const db = getDb();
  return db
    .select()
    .from(financialGoals)
    .where(and(eq(financialGoals.userId, userId), eq(financialGoals.type, type)));
}

export async function getOverdueGoals(userId: string) {
  const db = getDb();
  const today = new Date();
  const todayStr = today.toISOString().split('T')[0];
  return db
    .select()
    .from(financialGoals)
    .where(and(
      eq(financialGoals.userId, userId),
      eq(financialGoals.status, 'active'),
      lte(financialGoals.targetDate, todayStr)
    ))
    .orderBy(desc(financialGoals.priority));
}

export function getMilestones(goal: typeof financialGoals.$inferSelect): Array<{ percentage: number; label: string; achieved: boolean }> {
  const target = parseFloat(goal.targetAmount);
  const current = parseFloat(goal.currentAmount);
  const progress = target > 0 ? Math.min((current / target) * 100, 100) : 0;

  const milestones = [
    { percentage: 25, label: '25%' },
    { percentage: 50, label: '50%' },
    { percentage: 75, label: '75%' },
    { percentage: 100, label: '100%' },
  ];

  return milestones.map(m => ({
    ...m,
    achieved: progress >= m.percentage,
  }));
}

export function getGoalTypeIcon(type: string): string {
  switch (type) {
    case 'savings': return '💰';
    case 'payoff': return '💳';
    case 'investment': return '📈';
    case 'other': return '🎯';
    default: return '🎯';
  }
}

export function getGoalProgressColor(progress: number): string {
  if (progress >= 75) return 'text-chart-1';
  if (progress >= 50) return 'text-chart-3';
  if (progress >= 25) return 'text-yellow-500';
  return 'text-destructive';
}

export function getGoalProgressBg(progress: number): string {
  if (progress >= 75) return 'bg-chart-1';
  if (progress >= 50) return 'bg-chart-3';
  if (progress >= 25) return 'bg-yellow-500';
  return 'bg-destructive';
}

export function formatCurrency(amount: number | string): string {
  const num = typeof amount === 'string' ? parseFloat(amount) : amount;
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(num);
}

export function formatPercent(value: number, decimals = 1): string {
  return `${value.toFixed(decimals)}%`;
}

export function formatDate(date: string | null): string {
  if (!date) return 'No deadline';
  const d = new Date(date);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export function getDaysRemaining(date: string | null): number | null {
  if (!date) return null;
  const target = new Date(date);
  const today = new Date();
  return Math.ceil((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}
