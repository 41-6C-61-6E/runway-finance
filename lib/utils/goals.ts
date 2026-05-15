/**
 * Format a number as currency
 */
export function formatCurrency(
  amount: number | string,
  currency = 'USD',
  locale = 'en-US'
): string {
  const num = typeof amount === 'string' ? parseFloat(amount) : amount;
  
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(num);
}

/**
 * Format a number as a percentage
 */
export function formatPercent(
  value: number | string,
  decimals = 1,
): string {
  const num = typeof value === 'string' ? parseFloat(value) : value;
  return `${num.toFixed(decimals)}%`;
}

/**
 * Format date consistently
 */
export function formatDate(date: string | null): string {
  if (!date) return 'No deadline';
  const d = new Date(date);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

/**
 * Calculate days remaining until a date
 */
export function getDaysRemaining(date: string | null): number | null {
  if (!date) return null;
  const target = new Date(date);
  const today = new Date();
  return Math.ceil((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

/**
 * Get goal type icon and label
 */
export function getGoalTypeInfo(type: string): { icon: string; label: string; color: string } {
  const types: Record<string, { icon: string; label: string; color: string }> = {
    savings: { icon: '💰', label: 'Savings', color: 'bg-emerald-500/10 text-emerald-400' },
    payoff: { icon: '💳', label: 'Payoff', color: 'bg-red-500/10 text-red-400' },
    investment: { icon: '📈', label: 'Investment', color: 'bg-blue-500/10 text-blue-400' },
    other: { icon: '🎯', label: 'Other', color: 'bg-purple-500/10 text-purple-400' },
  };
  return types[type] || types.other;
}

/**
 * Get progress color class based on percentage
 */
export function getProgressColorClass(progress: number): string {
  if (progress >= 75) return 'text-chart-1';
  if (progress >= 50) return 'text-chart-3';
  if (progress >= 25) return 'text-yellow-500';
  return 'text-destructive';
}

/**
 * Get progress bar background color class based on percentage
 */
export function getProgressBgClass(progress: number): string {
  if (progress >= 75) return 'bg-chart-1';
  if (progress >= 50) return 'bg-chart-3';
  if (progress >= 25) return 'bg-yellow-500';
  return 'bg-destructive';
}

/**
 * Get progress ring stroke color based on percentage
 */
export function getProgressStrokeColor(progress: number): string {
  if (progress >= 75) return '#10b981';
  if (progress >= 50) return '#f59e0b';
  if (progress >= 25) return '#f97316';
  return '#ef4444';
}

/**
 * Calculate goal progress percentage
 */
export function calcGoalProgress(targetAmount: number | string, currentAmount: number | string): number {
  const target = typeof targetAmount === 'string' ? parseFloat(targetAmount) : targetAmount;
  const current = typeof currentAmount === 'string' ? parseFloat(currentAmount) : currentAmount;
  return target > 0 ? Math.min((current / target) * 100, 100) : 0;
}

/**
 * Calculate remaining amount
 */
export function calcRemaining(targetAmount: number | string, currentAmount: number | string): number {
  const target = typeof targetAmount === 'string' ? parseFloat(targetAmount) : targetAmount;
  const current = typeof currentAmount === 'string' ? parseFloat(currentAmount) : currentAmount;
  return Math.max(target - current, 0);
}

/**
 * Calculate monthly savings needed to meet goal
 * Returns null if no target date or remaining is 0
 */
export function calcMonthlySavings(remaining: number, daysRemaining: number | null): number | null {
  if (remaining <= 0 || daysRemaining === null || daysRemaining <= 0) return null;
  const months = daysRemaining / 30;
  if (months <= 0) return null;
  return Math.ceil((remaining / months) * 100) / 100;
}
