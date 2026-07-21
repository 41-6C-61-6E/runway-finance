'use client';

import { useState } from 'react';
import { runBeamSearchOptimization, OptimizationObjective, OptimizationIntensity, OptimizationOutput } from '@/lib/services/beam-search-optimizer';
import { formatCurrency } from '@/lib/utils/format';
import { Zap, Play, CheckCircle2, ArrowRight, ShieldCheck } from 'lucide-react';

interface OptimizeTabProps {
  plan: any;
}

export function OptimizeTab({ plan }: OptimizeTabProps) {
  const [objective, setObjective] = useState<OptimizationObjective>('legacy');
  const [intensity, setIntensity] = useState<OptimizationIntensity>('standard');
  const [loading, setLoading] = useState(false);

  const enginePlan = {
    id: plan.id,
    name: plan.name,
    hasSpouse: false,
    primaryBirthYear: plan.primaryBirthYear || 1985,
    primaryBirthMonth: 1,
    filingStatus: plan.filingStatus || 'single',
    retirementAge: plan.retirementAge || 60,
    lifeExpectancyAge: plan.lifeExpectancyAge || 100,
    withdrawalMethod: plan.withdrawalMethod || 'textbook',
    accounts: (plan.accounts || []).map((a: any) => ({
      id: a.id,
      name: a.name,
      type: a.type,
      owner: 'primary',
      balance: parseFloat(a.balance) || 0,
      costBasis: parseFloat(a.costBasis) || 0,
      expectedGrowthRate: 6.0,
      dividendYield: 2.5,
      reinvestDividends: true,
      qualifiedDividendRatio: 1.0,
    })),
    liabilities: [],
    events: (plan.events || []).map((e: any) => ({
      id: e.id,
      name: e.name,
      category: e.category,
      type: e.type,
      owner: 'primary',
      amount: parseFloat(e.amount) || 0,
      frequency: 'yearly',
      growthRate: 0,
      adjustForInflation: true,
      startTriggerType: 'now',
      endTriggerType: 'end_of_plan',
    })),
    flows: (plan.flows || []).map((f: any) => ({
      id: f.id,
      name: f.name,
      type: 'invest',
      rank: f.rank || 1,
      targetAccountId: f.targetAccountId,
      ruleType: 'save_leftover',
    })),
    settings: {
      fixedInflationRate: 3.0,
      withholdingDeferred: 20.0,
      withholdingTaxable: 10.0,
      incomeTaxModifier: 0.0,
      capGainsTaxModifier: 0.0,
      heirFlatIncomeTaxRate: 25.0,
      stepUpBasis: true,
      realEstateLiquidationRate: 6.0,
      administrativeCostRate: 1.0,
      charitableGiving: 0.0,
    },
  };

  const [optResult, setOptResult] = useState<OptimizationOutput>(() =>
    runBeamSearchOptimization(enginePlan as any, objective, intensity)
  );

  const handleRunOptimizer = () => {
    setLoading(true);
    setTimeout(() => {
      const res = runBeamSearchOptimization(enginePlan as any, objective, intensity);
      setOptResult(res);
      setLoading(false);
    }, 300);
  };

  return (
    <div className="space-y-6">
      {/* Controls & Configuration */}
      <div className="bg-card border border-border rounded-xl p-5 shadow-sm space-y-5">
        <div className="flex items-center gap-2 border-b border-border pb-3">
          <Zap className="w-5 h-5 text-primary" />
          <h3 className="text-sm font-bold text-foreground">Beam Search Optimization Objectives</h3>
        </div>

        {/* Objectives Selection Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 text-xs">
          {[
            { id: 'legacy', label: 'Higher Net Legacy', desc: 'Maximize estate passed to heirs' },
            { id: 'taxes', label: 'Lower Lifetime Taxes', desc: 'Minimize cumulative taxes paid' },
            { id: 'networth', label: 'Higher Net Worth', desc: 'Maximize final ending portfolio' },
            { id: 'etr', label: 'Lower Effective Tax Rate', desc: 'Minimize average annual ETR' },
            { id: 'rmds', label: 'Lower RMD Distributions', desc: 'Reduce mandatory traditional withdrawals' },
            { id: 'irmaa', label: 'Reduce IRMAA Surcharges', desc: 'Avoid Medicare Part B/D surcharges' },
          ].map((obj) => (
            <div
              key={obj.id}
              onClick={() => setObjective(obj.id as any)}
              className={`p-3.5 rounded-xl border cursor-pointer transition-all ${
                objective === obj.id
                  ? 'bg-primary/10 border-primary text-foreground shadow-sm'
                  : 'bg-muted/30 border-border text-muted-foreground hover:border-primary/40'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="font-bold">{obj.label}</span>
                {objective === obj.id && <CheckCircle2 className="w-4 h-4 text-primary shrink-0" />}
              </div>
              <p className="text-[11px] text-muted-foreground mt-1">{obj.desc}</p>
            </div>
          ))}
        </div>

        {/* Intensity & Action Bar */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pt-3 border-t border-border">
          <div className="flex items-center gap-2 text-xs">
            <span className="font-semibold text-muted-foreground">Search Intensity:</span>
            <div className="flex items-center gap-1 bg-muted/40 p-1 rounded-lg border border-border">
              {(['quick', 'standard', 'deep', 'extreme'] as const).map((lvl) => (
                <button
                  key={lvl}
                  onClick={() => setIntensity(lvl)}
                  className={`px-2.5 py-1 text-xs font-semibold capitalize rounded-md transition-all ${
                    intensity === lvl ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {lvl}
                </button>
              ))}
            </div>
          </div>

          <button
            onClick={handleRunOptimizer}
            disabled={loading}
            className="flex items-center gap-2 bg-primary text-primary-foreground hover:bg-primary/90 px-5 py-2 rounded-xl text-xs font-bold shadow-md transition-all disabled:opacity-50"
          >
            <Play className="w-4 h-4 fill-current" />
            {loading ? 'Optimizing...' : 'Run Optimization Algorithm'}
          </button>
        </div>
      </div>

      {/* Results Callout Banner */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="bg-card border border-border rounded-xl p-4 shadow-sm space-y-2">
          <span className="text-xs font-bold text-muted-foreground uppercase">Estimated Lifetime Tax Savings</span>
          <div className="flex items-baseline gap-2">
            <p className="text-2xl font-extrabold text-emerald-500 font-mono">{formatCurrency(optResult.savings.taxesSaved)}</p>
            <span className="text-xs text-muted-foreground font-semibold">saved</span>
          </div>
        </div>

        <div className="bg-card border border-border rounded-xl p-4 shadow-sm space-y-2">
          <span className="text-xs font-bold text-muted-foreground uppercase">Projected Legacy Increase</span>
          <div className="flex items-baseline gap-2">
            <p className="text-2xl font-extrabold text-primary font-mono">{formatCurrency(optResult.savings.legacyIncrease)}</p>
            <span className="text-xs text-muted-foreground font-semibold">gained</span>
          </div>
        </div>
      </div>

      {/* Recommendation Timeline Table */}
      <div className="bg-card border border-border rounded-xl p-5 shadow-sm space-y-4">
        <h3 className="text-sm font-bold text-foreground">Optimized Timeline Instructions</h3>

        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead className="bg-muted/40 text-muted-foreground font-semibold border-b border-border">
              <tr>
                <th className="p-3">Year</th>
                <th className="p-3">Age</th>
                <th className="p-3">Drawdown Strategy</th>
                <th className="p-3">Roth Conversion</th>
                <th className="p-3">Instruction / Notes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {optResult.recommendations.map((rec) => (
                <tr key={rec.year} className="hover:bg-muted/20">
                  <td className="p-3 font-medium">{rec.year}</td>
                  <td className="p-3">{rec.age}</td>
                  <td className="p-3 font-medium text-foreground">{rec.withdrawalOrder}</td>
                  <td className="p-3 font-mono font-bold text-primary">
                    {rec.rothConversionAmount > 0 ? formatCurrency(rec.rothConversionAmount) : '—'}
                  </td>
                  <td className="p-3 text-muted-foreground">{rec.notes}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
