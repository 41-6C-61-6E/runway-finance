import type { ReactNode } from 'react';

interface ChartTooltipProps {
  children: ReactNode;
}

export function ChartTooltip({ children }: ChartTooltipProps) {
  return (
    <div
      style={{
        background: 'var(--color-card)',
        border: '1px solid var(--color-border)',
        borderRadius: '0.5rem',
        boxShadow: '0 4px 16px rgba(0,0,0,0.35)',
        color: 'var(--color-foreground)',
        fontSize: '10px',
        padding: '8px 12px',
        lineHeight: 1.5,
        maxWidth: 220,
      }}
    >
      {children}
    </div>
  );
}

interface TooltipRowProps {
  label: string;
  value: string;
  color?: string;
}

export function TooltipRow({ label, value, color }: TooltipRowProps) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap' }}>
      {color && (
        <span
          style={{
            display: 'inline-block',
            width: 8,
            height: 8,
            borderRadius: '50%',
            background: color,
            flexShrink: 0,
          }}
        />
      )}
      <span style={{ color: 'var(--color-muted-foreground)' }}>{label}:</span>
      <span style={{ fontWeight: 600 }}>{value}</span>
    </div>
  );
}

interface TooltipHeaderProps {
  children: ReactNode;
}

export function TooltipHeader({ children }: TooltipHeaderProps) {
  return (
    <div style={{ fontWeight: 700, marginBottom: 4, fontSize: 11 }}>
      {children}
    </div>
  );
}
