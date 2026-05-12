export const nivoTheme = {
  background: 'transparent',
  text: { fill: 'var(--color-foreground)', fontSize: 10 },
  axis: {
    domain: { line: { stroke: 'var(--color-border)', strokeWidth: 1 } },
    ticks: { line: { stroke: 'var(--color-border)' }, text: { fill: 'var(--color-muted-foreground)', fontSize: 10 } },
  },
  grid: { line: { stroke: 'var(--color-border)', strokeDasharray: '3 3', strokeWidth: 1 } },
  crosshair: { line: { stroke: 'var(--color-ring)', strokeWidth: 1, strokeDasharray: '2 2' } },
  tooltip: {
    container: {
      background: 'var(--color-card)',
      border: '1px solid var(--color-border)',
      borderRadius: '0.5rem',
      boxShadow: '0 4px 16px rgba(0,0,0,0.35)',
      color: 'var(--color-foreground)',
      fontSize: '10px',
      padding: '8px 12px',
    },
  },
  legends: {
    text: { fill: 'var(--color-muted-foreground)', fontSize: 10 },
  },
  labels: {
    text: { fill: 'var(--color-foreground)', fontSize: 10 },
  },
};
