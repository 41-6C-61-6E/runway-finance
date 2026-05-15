'use client';

import { useShowMath } from '@/lib/hooks/use-show-math';
import { CARD_MATH } from '@/lib/constants/card-math-descriptions';
import { Calculator } from 'lucide-react';

export function MathDescription({ chartId }: { chartId: string }) {
  const { enabled, loading } = useShowMath();

  if (loading || !enabled) return null;

  const math = CARD_MATH[chartId];
  if (!math) return null;

  return (
    <div className="mt-2 px-4 py-2.5 rounded-lg bg-muted/20 border border-border/50">
      <div className="flex items-start gap-2">
        <Calculator className="w-3.5 h-3.5 text-muted-foreground mt-0.5 shrink-0" />
        <div className="min-w-0">
          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-0.5">
            How this is calculated
          </p>
          <p className="text-xs text-muted-foreground/80 leading-relaxed">
            {math.description}
          </p>
        </div>
      </div>
    </div>
  );
}
