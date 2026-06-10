'use client';

interface GoalTypeIconProps {
  type: string;
  className?: string;
}

const typeConfig: Record<string, { icon: string; label: string; colorVar: string }> = {
  savings: { icon: '💰', label: 'Savings', colorVar: 'var(--chart-1)' },
  payoff: { icon: '💳', label: 'Payoff', colorVar: 'var(--chart-5)' },
  investment: { icon: '📈', label: 'Investment', colorVar: 'var(--chart-3)' },
  other: { icon: '🎯', label: 'Other', colorVar: 'var(--chart-4)' },
};

export function GoalTypeIcon({ type, className = '' }: GoalTypeIconProps) {
  const config = typeConfig[type] || typeConfig.other;

  return (
    <span 
      className={`goal-pill inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${className}`}
      style={{ '--goal-color': config.colorVar } as React.CSSProperties}
    >
      <span>{config.icon}</span>
      <span>{config.label}</span>
    </span>
  );
}
