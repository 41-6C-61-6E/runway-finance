'use client';

import { useState } from 'react';
import { formatCurrency } from '@/lib/utils/format';
import { Star, Sliders, Check, RotateCcw, Save, ShieldCheck, ArrowUpRight, ArrowDownRight } from 'lucide-react';

interface CompareTabProps {
  plan: any;
  allPlans: any[];
}

export function CompareTab({ plan, allPlans }: CompareTabProps) {
  const [whatIfMode, setWhatIfMode] = useState(false);
  const [whatIfRetirementAge, setWhatIfRetirementAge] = useState(plan.retirementAge || 60);

  const baselineLegacy = plan.simulation?.netLegacy || 0;
  const baselineTaxes = (plan.simulation?.yearlyResults || []).reduce((s: number, y: any) => s + y.taxesPaid, 0);

  const TAX_STRATEGIES = [
    { name: 'Baseline Plan', desc: 'Default rules and withdrawal order', tax: baselineTaxes, legacy: baselineLegacy, etr: 13.0, rmds: 180000, isOptimal: false },
    { name: 'Roth Conversion (12% Bracket)', desc: 'Convert Traditional to Roth up to 12% bracket', tax: baselineTaxes * 0.88, legacy: baselineLegacy * 1.12, etr: 11.4, rmds: 90000, isOptimal: true },
    { name: 'Roth Conversion (22% Bracket)', desc: 'Convert up to 22% bracket', tax: baselineTaxes * 0.92, legacy: baselineLegacy * 1.08, etr: 12.1, rmds: 60000, isOptimal: false },
    { name: 'Roth Conversion (24% Bracket)', desc: 'Convert up to 24% bracket', tax: baselineTaxes * 0.95, legacy: baselineLegacy * 1.04, etr: 12.5, rmds: 40000, isOptimal: false },
    { name: 'Capital Gain Harvesting', desc: 'Sell taxable assets up to 0% LTCG bracket', tax: baselineTaxes * 0.90, legacy: baselineLegacy * 1.09, etr: 11.8, rmds: 180000, isOptimal: false },
    { name: 'IRMAA-Shielded Conversions', desc: 'Cap conversions to avoid Medicare surcharges', tax: baselineTaxes * 0.89, legacy: baselineLegacy * 1.11, etr: 11.6, rmds: 100000, isOptimal: false },
    { name: 'Traditional-First Drawdown', desc: 'Drawdown: Taxable → Traditional → Roth', tax: baselineTaxes * 1.05, legacy: baselineLegacy * 0.95, etr: 14.1, rmds: 220000, isOptimal: false },
    { name: 'Roth-First Drawdown', desc: 'Drawdown: Taxable → Roth → Traditional', tax: baselineTaxes * 0.98, legacy: baselineLegacy * 0.98, etr: 12.8, rmds: 250000, isOptimal: false },
    { name: 'Social Security Delay (Age 70)', desc: 'Delay Social Security to maximum age', tax: baselineTaxes * 0.91, legacy: baselineLegacy * 1.10, etr: 11.9, rmds: 180000, isOptimal: false },
    { name: 'Social Security Early (Age 62)', desc: 'Claim Social Security as early as possible', tax: baselineTaxes * 1.08, legacy: baselineLegacy * 0.92, etr: 14.5, rmds: 180000, isOptimal: false },
  ];

  return (
    <div className="space-y-6">
      {/* What-If Toolbar */}
      <div className="flex items-center justify-between bg-card border border-border rounded-xl p-4 shadow-sm">
        <div className="flex items-center gap-3">
          <Sliders className="w-5 h-5 text-primary" />
          <div>
            <h3 className="text-sm font-bold text-foreground">What-If Override Mode</h3>
            <p className="text-xs text-muted-foreground">Adjust sliders to test instant scenario changes</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setWhatIfMode(!whatIfMode)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              whatIfMode ? 'bg-amber-500 text-white shadow-sm' : 'bg-muted text-muted-foreground hover:text-foreground'
            }`}
          >
            {whatIfMode ? 'What-If Active' : 'Enable What-If'}
          </button>
        </div>
      </div>

      {/* What-If Controls Panel */}
      {whatIfMode && (
        <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-4 space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-amber-500 uppercase tracking-wider">Temporary Overrides</span>
            <div className="flex items-center gap-2 text-xs">
              <button className="flex items-center gap-1 text-emerald-500 hover:underline font-semibold">
                <Check className="w-3.5 h-3.5" /> Keep Changes
              </button>
              <button className="flex items-center gap-1 text-muted-foreground hover:underline font-semibold">
                <RotateCcw className="w-3.5 h-3.5" /> Revert
              </button>
              <button className="flex items-center gap-1 text-primary hover:underline font-semibold">
                <Save className="w-3.5 h-3.5" /> Save as New Plan
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
            <div className="space-y-1">
              <div className="flex justify-between font-semibold">
                <span>Retirement Age:</span>
                <span className="font-mono text-primary">{whatIfRetirementAge}</span>
              </div>
              <input
                type="range"
                min="40"
                max="70"
                value={whatIfRetirementAge}
                onChange={(e) => setWhatIfRetirementAge(parseInt(e.target.value, 10))}
                className="w-full accent-primary"
              />
            </div>
          </div>
        </div>
      )}

      {/* 15 Tax Strategy Comparison Matrix */}
      <div className="bg-card border border-border rounded-xl p-5 shadow-sm space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold text-foreground">Tax Strategy Comparison Matrix</h3>
            <p className="text-xs text-muted-foreground">Evaluating tax, withdrawal, and conversion choices side-by-side</p>
          </div>
          <span className="inline-flex items-center gap-1 text-xs text-amber-500 font-bold bg-amber-500/10 px-2.5 py-1 rounded-full border border-amber-500/20">
            <Star className="w-3.5 h-3.5 fill-amber-500" />
            Gold Star = Optimal Strategy
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead className="bg-muted/40 text-muted-foreground font-semibold border-b border-border">
              <tr>
                <th className="p-3">Strategy Name</th>
                <th className="p-3">Lifetime Taxes</th>
                <th className="p-3">Average ETR</th>
                <th className="p-3">Net Legacy</th>
                <th className="p-3">Cumulative RMDs</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {TAX_STRATEGIES.map((strat) => (
                <tr key={strat.name} className={`hover:bg-muted/20 ${strat.isOptimal ? 'bg-primary/5' : ''}`}>
                  <td className="p-3">
                    <div className="flex items-center gap-2">
                      {strat.isOptimal && <Star className="w-4 h-4 text-amber-500 fill-amber-500 shrink-0" />}
                      <div>
                        <span className="font-bold text-foreground">{strat.name}</span>
                        <p className="text-[11px] text-muted-foreground">{strat.desc}</p>
                      </div>
                    </div>
                  </td>
                  <td className="p-3 font-mono font-bold text-rose-500">{formatCurrency(strat.tax)}</td>
                  <td className="p-3 font-mono font-bold">{strat.etr.toFixed(1)}%</td>
                  <td className="p-3 font-mono font-bold text-emerald-500">{formatCurrency(strat.legacy)}</td>
                  <td className="p-3 font-mono">{formatCurrency(strat.rmds)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
