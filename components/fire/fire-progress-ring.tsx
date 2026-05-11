'use client';

import { useState, useEffect } from 'react';
import { formatCurrency } from '@/lib/utils/format';

function getColor(pct: number): string {
  if (pct >= 75) return 'var(--color-chart-1)';
  if (pct >= 50) return 'var(--color-chart-3)';
  return 'var(--color-destructive)';
}

export function FireProgressRing({
  current,
  target,
}: {
  current: number;
  target: number;
}) {
  const [animatedPct, setAnimatedPct] = useState(0);
  const pct = target > 0 ? Math.min((current / target) * 100, 100) : 0;
  const color = getColor(pct);

  useEffect(() => {
    const timer = setTimeout(() => setAnimatedPct(pct), 100);
    return () => clearTimeout(timer);
  }, [pct]);

  const displayPct = target > 0 ? pct : 0;
  const conic = `conic-gradient(${color} 0% ${animatedPct}%, var(--color-muted) ${animatedPct}% 100%)`;

  return (
    <div className="bg-card border border-border rounded-xl shadow-sm p-5 flex flex-col items-center justify-center h-full min-h-[280px]">
      <div
        className="relative w-[180px] h-[180px] rounded-full flex items-center justify-center"
        style={{ background: conic }}
      >
        <div className="w-[140px] h-[140px] rounded-full bg-card flex items-center justify-center">
          <div className="text-center">
            <p className="text-3xl font-bold text-foreground">
              {displayPct.toFixed(0)}%
            </p>
          </div>
        </div>
      </div>
      <p className="text-xs text-muted-foreground mt-3 text-center">of your FIRE number</p>
      <p className="text-sm font-medium text-foreground mt-1 financial-value">
        {formatCurrency(current)} / {formatCurrency(target)}
      </p>
    </div>
  );
}
