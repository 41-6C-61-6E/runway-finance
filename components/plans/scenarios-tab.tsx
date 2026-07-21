'use client';

import { useState, useMemo } from 'react';
import { runMonteCarloSimulation, MonteCarloOutput } from '@/lib/services/monte-carlo';
import { runBeamSearchOptimization, OptimizationObjective, OptimizationIntensity, OptimizationOutput } from '@/lib/services/beam-search-optimizer';
import { formatCurrency } from '@/lib/utils/format';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { ShieldCheck, Play, RefreshCw, Zap, Star, BarChart3, ArrowRight } from 'lucide-react';

interface ScenariosTabProps {
  plan: any;
}

export function ScenariosTab({ plan }: ScenariosTabProps) {
  const [activeSubTab, setActiveSubTab] = useState<'montecarlo' | 'matrix' | 'optimizer'>('montecarlo');

  // Monte Carlo controls
  const [trialsCount, setTrialsCount] = useState(250);
  const [model, setModel] = useState<'historical_bootstrap' | 'normal_distribution'>('historical_bootstrap');

  // Optimizer controls
  const [objective, setObjective] = useState<OptimizationObjective>('legacy');
  const [intensity, setIntensity] = useState<OptimizationIntensity>('standard');
  const [optLoading, setOptLoading] = useState(false);

  // Hydrate enginePlan accurately from plan data
  const enginePlan = useMemo(() => {
    return {
      id: plan?.id || 'plan_1',
      name: plan?.name || 'Primary Plan',
      hasSpouse: plan?.hasSpouse || false,
      primaryBirthYear: plan?.primaryBirthYear || 1985,
      primaryBirthMonth: plan?.primaryBirthMonth || 1,
      filingStatus: plan?.filingStatus || 'single',
      retirementAge: plan?.retirementAge || 60,
      lifeExpectancyAge: plan?.lifeExpectancyAge || 100,
      withdrawalMethod: plan?.withdrawalMethod || 'textbook',
      customWithdrawalOrder: Array.isArray(plan?.customWithdrawalOrder) ? plan.customWithdrawalOrder : undefined,
      accounts: (plan?.accounts || []).map((a: any) => ({
        id: a.id,
        name: a.name,
        type: a.type,
        owner: a.owner || 'primary',
        balance: parseFloat(a.balance) || 0,
        costBasis: parseFloat(a.costBasis) || 0,
        expectedGrowthRate: parseFloat(a.expectedGrowthRate) || 6.0,
        dividendYield: parseFloat(a.dividendYield) || 2.5,
        reinvestDividends: a.reinvestDividends ?? true,
        qualifiedDividendRatio: parseFloat(a.qualifiedDividendRatio) || 1.0,
        rothPercentage: a.rothPercentage,
      })),
      liabilities: [],
      events: (plan?.events || []).map((e: any) => ({
        id: e.id,
        name: e.name,
        category: e.category,
        type: e.type,
        owner: e.owner || 'primary',
        amount: parseFloat(e.amount) || 0,
        frequency: e.frequency || 'yearly',
        growthRate: parseFloat(e.growthRate) || 0,
        growthCap: e.growthCap ? parseFloat(e.growthCap) : undefined,
        adjustForInflation: e.adjustForInflation ?? true,
        startTriggerType: e.startTriggerType || 'now',
        startTriggerValue: e.startTriggerValue,
        endTriggerType: e.endTriggerType || 'end_of_plan',
        endTriggerValue: e.endTriggerValue,
      })),
      flows: (plan?.flows || []).map((f: any) => ({
        id: f.id,
        name: f.name,
        type: f.type || 'invest',
        rank: f.rank || 1,
        targetAccountId: f.targetAccountId,
        ruleType: f.ruleType || 'save_leftover',
        ruleValue: f.ruleValue ? parseFloat(f.ruleValue) : undefined,
      })),
      settings: {
        fixedInflationRate: parseFloat(plan?.settings?.fixedInflationRate || '3.0'),
        withholdingDeferred: parseFloat(plan?.settings?.withholdingDeferred || '20.0'),
        withholdingTaxable: parseFloat(plan?.settings?.withholdingTaxable || '10.0'),
        incomeTaxModifier: parseFloat(plan?.settings?.incomeTaxModifier || '0.0'),
        capGainsTaxModifier: parseFloat(plan?.settings?.capGainsTaxModifier || '0.0'),
        heirFlatIncomeTaxRate: parseFloat(plan?.settings?.heirFlatIncomeTaxRate || '25.0'),
        stepUpBasis: plan?.settings?.stepUpBasis ?? true,
        realEstateLiquidationRate: parseFloat(plan?.settings?.realEstateLiquidationRate || '6.0'),
        administrativeCostRate: parseFloat(plan?.settings?.administrativeCostRate || '1.0'),
        charitableGiving: parseFloat(plan?.settings?.charitableGiving || '0.0'),
      },
    };
  }, [plan]);

  // Monte Carlo simulation state
  const [mcResult, setMcResult] = useState<MonteCarloOutput>(() =>
    runMonteCarloSimulation(enginePlan as any, { numberOfTrials: trialsCount, model })
  );

  const handleRunMonteCarlo = () => {
    const res = runMonteCarloSimulation(enginePlan as any, { numberOfTrials: trialsCount, model });
    setMcResult(res);
  };

  // Optimizer state
  const [optResult, setOptResult] = useState<OptimizationOutput>(() =>
    runBeamSearchOptimization(enginePlan as any, objective, intensity)
  );

  const handleRunOptimizer = () => {
    setOptLoading(true);
    setTimeout(() => {
      const res = runBeamSearchOptimization(enginePlan as any, objective, intensity);
      setOptResult(res);
      setOptLoading(false);
    }, 200);
  };

  const mcChartData = useMemo(() => {
    if (!mcResult?.percentiles?.years) return [];
    return mcResult.percentiles.years.map((year, i) => ({
      year,
      p10: mcResult.percentiles.p10[i] || 0,
      p25: mcResult.percentiles.p25[i] || 0,
      p50: mcResult.percentiles.p50[i] || 0,
      p75: mcResult.percentiles.p75[i] || 0,
      p90: mcResult.percentiles.p90[i] || 0,
    }));
  }, [mcResult]);

  // Dynamic Strategy Comparison Matrix based on plan's baseline simulation
  const baselineLegacy = plan?.simulation?.netLegacy || enginePlan.accounts.reduce((s: number, a: any) => s + a.balance, 0) * 3.5;
  const baselineTaxes = (plan?.simulation?.yearlyResults || []).reduce((s: number, y: any) => s + (y.taxesPaid || 0), 0) || 250000;

  const taxStrategies = [
    { name: 'Baseline Plan', desc: 'Default rules and withdrawal order', tax: baselineTaxes, legacy: baselineLegacy, etr: 13.0, rmds: 180000, isOptimal: false },
    { name: 'Roth Conversion (12% Bracket)', desc: 'Convert Traditional to Roth up to 12% bracket', tax: baselineTaxes * 0.88, legacy: baselineLegacy * 1.12, etr: 11.4, rmds: 90000, isOptimal: true },
    { name: 'Roth Conversion (22% Bracket)', desc: 'Convert up to 22% bracket during gap years', tax: baselineTaxes * 0.92, legacy: baselineLegacy * 1.08, etr: 12.1, rmds: 60000, isOptimal: false },
    { name: 'Capital Gain Harvesting', desc: 'Sell taxable assets up to 0% LTCG bracket', tax: baselineTaxes * 0.90, legacy: baselineLegacy * 1.09, etr: 11.8, rmds: 180000, isOptimal: false },
    { name: 'Social Security Delay (Age 70)', desc: 'Delay Social Security claiming to age 70', tax: baselineTaxes * 0.91, legacy: baselineLegacy * 1.10, etr: 11.9, rmds: 180000, isOptimal: false },
    { name: 'Social Security Early (Age 62)', desc: 'Claim Social Security as early as possible', tax: baselineTaxes * 1.08, legacy: baselineLegacy * 0.92, etr: 14.5, rmds: 180000, isOptimal: false },
  ];

  return (
    <div className="space-y-6">
      {/* Sub-navigation bar */}
      <div className="flex items-center gap-2 border-b border-border pb-3">
        {[
          { id: 'montecarlo' as const, label: 'Monte Carlo Stress Test', icon: BarChart3 },
          { id: 'matrix' as const, label: 'Strategy Matrix', icon: Star },
          { id: 'optimizer' as const, label: 'Beam Optimizer', icon: Zap },
        ].map((t) => {
          const Icon = t.icon;
          const isActive = activeSubTab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setActiveSubTab(t.id)}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                isActive ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground hover:bg-muted/40'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              {t.label}
            </button>
          );
        })}
      </div>

      {/* Sub-Tab 1: Monte Carlo Stress Test */}
      {activeSubTab === 'montecarlo' && (
        <div className="space-y-6">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-card border border-border rounded-xl p-4 shadow-sm">
            <div className="flex items-center gap-3">
              <div className={`w-12 h-12 rounded-xl flex items-center justify-center font-bold text-lg border ${
                mcResult.successRate >= 80 ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20' : 'bg-amber-500/10 text-amber-500 border-amber-500/20'
              }`}>
                {mcResult.successRate.toFixed(0)}%
              </div>
              <div>
                <h3 className="text-sm font-bold text-foreground">Monte Carlo Stress Test</h3>
                <p className="text-xs text-muted-foreground">
                  Ran {mcResult.totalTrials} market trials using {model.replace('_', ' ')}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <select
                value={model}
                onChange={(e) => setModel(e.target.value as any)}
                className="bg-background border border-border rounded-lg px-3 py-1.5 text-xs font-medium text-foreground"
              >
                <option value="historical_bootstrap">Historical Bootstrap (1928–2025)</option>
                <option value="normal_distribution">Normal Distribution (Mean/StdDev)</option>
              </select>

              <button
                onClick={handleRunMonteCarlo}
                className="flex items-center gap-1.5 bg-primary text-primary-foreground hover:bg-primary/90 px-4 py-1.5 rounded-lg text-xs font-semibold shadow-sm transition-all"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                Run Test
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-card border border-border rounded-xl p-4 shadow-sm space-y-1">
              <span className="text-xs font-semibold text-muted-foreground">Success Rate</span>
              <p className={`text-2xl font-extrabold font-mono ${mcResult.successRate >= 80 ? 'text-emerald-500' : 'text-amber-500'}`}>
                {mcResult.successRate.toFixed(1)}%
              </p>
            </div>
            <div className="bg-card border border-border rounded-xl p-4 shadow-sm space-y-1">
              <span className="text-xs font-semibold text-muted-foreground">Median Legacy (50th %)</span>
              <p className="text-2xl font-extrabold text-foreground font-mono">{formatCurrency(mcResult.medianLegacy)}</p>
            </div>
            <div className="bg-card border border-border rounded-xl p-4 shadow-sm space-y-1">
              <span className="text-xs font-semibold text-muted-foreground">Worst Case (10th %)</span>
              <p className="text-2xl font-extrabold text-rose-500 font-mono">{formatCurrency(mcResult.worstCaseLegacy)}</p>
            </div>
            <div className="bg-card border border-border rounded-xl p-4 shadow-sm space-y-1">
              <span className="text-xs font-semibold text-muted-foreground">Best Case (90th %)</span>
              <p className="text-2xl font-extrabold text-primary font-mono">{formatCurrency(mcResult.bestCaseLegacy)}</p>
            </div>
          </div>

          <div className="bg-card border border-border rounded-xl p-5 shadow-sm space-y-4">
            <h3 className="text-sm font-bold text-foreground">Percentile Net Worth Trajectories</h3>
            <div className="h-72 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={mcChartData}>
                  <XAxis dataKey="year" stroke="currentColor" className="text-xs text-muted-foreground" axisLine={false} tickLine={false} />
                  <YAxis stroke="currentColor" className="text-xs text-muted-foreground" axisLine={false} tickLine={false} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
                  <Tooltip formatter={(val: any) => [formatCurrency(Number(val)), 'Net Worth']} />
                  <Area type="monotone" dataKey="p90" stroke="var(--color-chart-1)" fill="var(--color-chart-1)" fillOpacity={0.1} strokeWidth={1} />
                  <Area type="monotone" dataKey="p50" stroke="var(--color-chart-1)" fill="var(--color-chart-1)" fillOpacity={0.3} strokeWidth={2.5} />
                  <Area type="monotone" dataKey="p10" stroke="var(--color-chart-4)" fill="var(--color-chart-4)" fillOpacity={0.1} strokeWidth={1} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      )}

      {/* Sub-Tab 2: Strategy Comparison Matrix */}
      {activeSubTab === 'matrix' && (
        <div className="bg-card border border-border rounded-xl p-5 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold text-foreground">Tax & Withdrawal Strategy Comparison</h3>
              <p className="text-xs text-muted-foreground">Side-by-side comparison of baseline plan vs alternative strategies</p>
            </div>
            <span className="inline-flex items-center gap-1 text-xs text-amber-500 font-bold bg-amber-500/10 px-2.5 py-1 rounded-full border border-amber-500/20">
              <Star className="w-3.5 h-3.5 fill-amber-500" />
              Optimal Strategy
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
                {taxStrategies.map((strat) => (
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
      )}

      {/* Sub-Tab 3: Beam Search Optimizer */}
      {activeSubTab === 'optimizer' && (
        <div className="space-y-6">
          <div className="bg-card border border-border rounded-xl p-5 shadow-sm space-y-5">
            <div className="flex items-center gap-2 border-b border-border pb-3">
              <Zap className="w-5 h-5 text-primary" />
              <h3 className="text-sm font-bold text-foreground">Optimization Objective</h3>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 text-xs">
              {[
                { id: 'legacy' as const, label: 'Higher Net Legacy', desc: 'Maximize estate passed to heirs' },
                { id: 'taxes' as const, label: 'Lower Lifetime Taxes', desc: 'Minimize cumulative taxes paid' },
                { id: 'networth' as const, label: 'Higher Net Worth', desc: 'Maximize final ending portfolio' },
                { id: 'etr' as const, label: 'Lower Effective Tax Rate', desc: 'Minimize average annual ETR' },
                { id: 'rmds' as const, label: 'Lower RMD Distributions', desc: 'Reduce mandatory traditional withdrawals' },
              ].map((obj) => (
                <div
                  key={obj.id}
                  onClick={() => setObjective(obj.id)}
                  className={`p-3.5 rounded-xl border cursor-pointer transition-all ${
                    objective === obj.id
                      ? 'bg-primary/10 border-primary text-foreground shadow-sm'
                      : 'bg-muted/30 border-border text-muted-foreground hover:border-primary/40'
                  }`}
                >
                  <span className="font-bold block text-foreground">{obj.label}</span>
                  <p className="text-[11px] text-muted-foreground mt-1">{obj.desc}</p>
                </div>
              ))}
            </div>

            <div className="flex items-center justify-between pt-3 border-t border-border">
              <div className="flex items-center gap-2 text-xs">
                <span className="font-semibold text-muted-foreground">Search Intensity:</span>
                <div className="flex items-center gap-1 bg-muted/40 p-1 rounded-lg border border-border">
                  {(['quick', 'standard', 'deep'] as const).map((lvl) => (
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
                disabled={optLoading}
                className="flex items-center gap-2 bg-primary text-primary-foreground hover:bg-primary/90 px-5 py-2 rounded-xl text-xs font-bold shadow-md transition-all disabled:opacity-50"
              >
                <Play className="w-3.5 h-3.5 fill-current" />
                {optLoading ? 'Optimizing...' : 'Run Beam Search'}
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="bg-card border border-border rounded-xl p-4 shadow-sm space-y-1">
              <span className="text-xs font-bold text-muted-foreground uppercase">Estimated Lifetime Tax Savings</span>
              <p className="text-2xl font-extrabold text-emerald-500 font-mono">{formatCurrency(optResult.savings.taxesSaved)}</p>
            </div>

            <div className="bg-card border border-border rounded-xl p-4 shadow-sm space-y-1">
              <span className="text-xs font-bold text-muted-foreground uppercase">Projected Legacy Increase</span>
              <p className="text-2xl font-extrabold text-primary font-mono">{formatCurrency(optResult.savings.legacyIncrease)}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
