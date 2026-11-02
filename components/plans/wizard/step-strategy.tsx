'use client';

import React from 'react';
import { ShieldAlert } from 'lucide-react';
import { Select } from '@/components/ui/select';

interface StepStrategyProps {
  withdrawalMethod: 'textbook' | 'tax_optimized' | 'proportional';
  setWithdrawalMethod: (val: 'textbook' | 'tax_optimized' | 'proportional') => void;
  allowPenaltyWithdrawals: boolean;
  setAllowPenaltyWithdrawals: (val: boolean) => void;
  fixedInflationRate: number | '';
  setFixedInflationRate: (val: number | '') => void;
  enableRothConversions: boolean;
  setEnableRothConversions: (val: boolean) => void;
  rothConversionTargetCeiling: 'top_of_10' | 'top_of_12' | 'top_of_22';
  setRothConversionTargetCeiling: (val: 'top_of_10' | 'top_of_12' | 'top_of_22') => void;
  avoidIrmaaCliffs: boolean;
  setAvoidIrmaaCliffs: (val: boolean) => void;
}

export function StepStrategy({
  withdrawalMethod,
  setWithdrawalMethod,
  allowPenaltyWithdrawals,
  setAllowPenaltyWithdrawals,
  fixedInflationRate,
  setFixedInflationRate,
  enableRothConversions,
  setEnableRothConversions,
  rothConversionTargetCeiling,
  setRothConversionTargetCeiling,
  avoidIrmaaCliffs,
  setAvoidIrmaaCliffs,
}: StepStrategyProps) {
  return (
    <div className="space-y-4 animate-in fade-in duration-200">
      <div className="space-y-3">
        <label className="text-xs font-semibold text-muted-foreground">Drawdown Sequence Strategy</label>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
          {[
            { id: 'textbook' as const, title: 'Textbook Waterfall', desc: 'Cash → Taxable → Traditional → Roth → HSA' },
            { id: 'tax_optimized' as const, title: 'Tax-Optimized', desc: 'Fill lower tax brackets with Traditional first' },
            { id: 'proportional' as const, title: 'Proportional', desc: 'Draw evenly across portfolio' },
          ].map((strat) => (
            <button
              key={strat.id}
              type="button"
              onClick={() => setWithdrawalMethod(strat.id)}
              className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                withdrawalMethod === strat.id
                  ? 'bg-primary/10 border-primary shadow-xs'
                  : 'bg-muted/20 border-border hover:bg-muted/40'
              }`}
            >
              <span className="text-xs font-bold text-foreground block">{strat.title}</span>
              <span className="text-[10px] text-muted-foreground block mt-1">{strat.desc}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
        <div className="space-y-1.5 flex items-center justify-between bg-muted/20 border border-border rounded-xl px-3.5 py-2.5">
          <div>
            <span className="text-xs font-semibold text-foreground flex items-center gap-1.5">
              <ShieldAlert className="w-3.5 h-3.5 text-amber-500" />
              Allow Penalty Withdrawals
            </span>
            <span className="text-[10px] text-muted-foreground block">
              Draw penalized accounts if safe funds run out
            </span>
          </div>
          <input
            type="checkbox"
            checked={allowPenaltyWithdrawals}
            onChange={(e) => setAllowPenaltyWithdrawals(e.target.checked)}
            className="w-4 h-4 accent-primary rounded cursor-pointer shrink-0"
          />
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-muted-foreground">Fixed Inflation Rate (%)</label>
          <input
            type="number"
            step={0.1}
            min={0}
            max={15}
            value={fixedInflationRate}
            onChange={(e) => setFixedInflationRate(e.target.value === '' ? '' : parseFloat(e.target.value))}
            className="w-full bg-muted/40 border border-border rounded-xl px-3 py-2 text-xs font-mono text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
          />
        </div>

        <div className="space-y-1.5 flex items-center justify-between bg-muted/20 border border-border rounded-xl px-3.5 py-2.5 sm:col-span-2">
          <div>
            <span className="text-xs font-semibold text-foreground block">Enable Early Roth Conversion Ladder</span>
            <span className="text-[10px] text-muted-foreground block">
              Convert Pre-Tax Traditional balance to Roth tax-free growth in early retirement
            </span>
          </div>
          <input
            type="checkbox"
            checked={enableRothConversions}
            onChange={(e) => setEnableRothConversions(e.target.checked)}
            className="w-4 h-4 accent-primary rounded cursor-pointer shrink-0"
          />
        </div>

        {enableRothConversions && (
          <>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-muted-foreground">Roth Conversion Target Ceiling</label>
              <Select
                value={rothConversionTargetCeiling}
                onChange={(e: React.ChangeEvent<HTMLSelectElement>) =>
                  setRothConversionTargetCeiling(e.target.value as StepStrategyProps['rothConversionTargetCeiling'])
                }
                className="rounded-xl bg-muted/40 text-xs font-bold"
              >
                <option value="top_of_10">Top of 10% Bracket</option>
                <option value="top_of_12">Top of 12% Bracket (Recommended)</option>
                <option value="top_of_22">Top of 22% Bracket</option>
              </Select>
            </div>

            <div className="space-y-1.5 flex items-center justify-between bg-muted/20 border border-border rounded-xl px-3.5 py-2">
              <div>
                <span className="text-xs font-semibold text-foreground block">Avoid Medicare IRMAA Cliffs</span>
                <span className="text-[10px] text-muted-foreground">Cap conversions to avoid Medicare surcharges</span>
              </div>
              <input
                type="checkbox"
                checked={avoidIrmaaCliffs}
                onChange={(e) => setAvoidIrmaaCliffs(e.target.checked)}
                className="w-4 h-4 accent-primary rounded cursor-pointer shrink-0"
              />
            </div>
          </>
        )}
      </div>
    </div>
  );
}

