'use client';

interface GoalTypeIconProps {
  type: string;
  className?: string;
}

const typeConfig: Record<string, { icon: string; label: string; color: string }> = {
  savings: { icon: '💰', label: 'Savings', color: 'bg-emerald-500/10 text-emerald-400' },
  payoff: { icon: '💳', label: 'Payoff', color: 'bg-red-500/10 text-red-400' },
  investment: { icon: '📈', label: 'Investment', color: 'bg-blue-500/10 text-blue-400' },
  other: { icon: '🎯', label: 'Other', color: 'bg-purple-500/10 text-purple-400' },
};

export function GoalTypeIcon({ type, className = '' }: GoalTypeIconProps) {
  const config = typeConfig[type] || typeConfig.other;

  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${config.color} ${className}`}>
      <span>{config.icon}</span>
      <span>{config.label}</span>
    </span>
  );
}
