'use client';

import React, { useState } from 'react';
import { Info } from 'lucide-react';
import { IRS_UNIFORM_LIFETIME_TABLE } from '@/lib/constants/retirement-defaults';

export function RmdTablePreview() {
  const [showRmdTable, setShowRmdTable] = useState(false);

  return (
    <div className="pt-2">
      <button
        type="button"
        onClick={() => setShowRmdTable(!showRmdTable)}
        className="text-xs font-semibold text-primary hover:underline flex items-center gap-1 cursor-pointer"
      >
        <Info className="w-3.5 h-3.5" />
        {showRmdTable ? 'Hide IRS Uniform Lifetime RMD Table III' : 'View IRS Uniform Lifetime RMD Table III Divisors'}
      </button>

      {showRmdTable && (
        <div className="mt-3 p-3 bg-muted/20 border border-border rounded-xl space-y-2 animate-in fade-in">
          <p className="text-[11px] text-muted-foreground">
            IRS Publication 590-B Uniform Lifetime Table III divisors used by the engine to compute mandatory annual distributions:
          </p>
          <div className="grid grid-cols-4 sm:grid-cols-8 gap-2 text-[11px] font-mono">
            {Object.entries(IRS_UNIFORM_LIFETIME_TABLE)
              .slice(0, 24)
              .map(([age, divisor]) => (
                <div key={age} className="bg-background border border-border rounded p-1.5 text-center">
                  <span className="text-muted-foreground text-[10px] block">Age {age}</span>
                  <span className="font-bold text-foreground">{String(divisor)}</span>
                </div>
              ))}
          </div>
        </div>
      )}
    </div>
  );
}
