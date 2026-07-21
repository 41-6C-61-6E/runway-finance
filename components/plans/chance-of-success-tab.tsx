'use client';

import { useState, useMemo } from 'react';
import { runMonteCarloSimulation, MonteCarloOutput } from '@/lib/services/monte-carlo';
import { formatCurrency } from '@/lib/utils/format';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { ShieldCheck, Play, Settings, RefreshCw } from 'lucide-react';

interface ChanceOfSuccessTabProps {
  plan: any;
}

export function ChanceOfSuccessTab({ plan }: ChanceOfSuccessTabProps) {
  const [trialsCount, setTrialsCount] = useState(250);
  const [model, setModel] = useState<'historical_bootstrap' | 'normal_distribution'>('historical_bootstrap');

  const enginePlan = useMemo(() => {
    return {
      id: plan.id,
      name: plan.name,
      hasSpouse: plan.hasSpouse || false,
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
        owner: a.owner || 'primary',
        balance: parseFloat(a.balance) || 0,
        costBasis: parseFloat(a.costBasis) || 0,
        expectedGrowthRate: parseFloat(a.expectedGrowthRate) || 6.0,
        dividendYield: parseFloat(a.dividendYield) || 2.5,
        reinvestDividends: a.reinvestDividends ?? true,
        qualifiedDividendRatio: 1.0,
      })),
      liabilities: [],
      events: (plan.events || []).map((e: any) => ({
        id: e.id,
        name: e.name,
        category: e.category,
        type: e.type,
        owner: e.owner || 'primary',
        amount: parseFloat(e.amount) || 0,
        frequency: e.frequency || 'yearly',
        growthRate: parseFloat(e.growthRate) || 0,
        adjustForInflation: e.adjustForInflation ?? true,
        startTriggerType: e.startTriggerType || 'now',
        endTriggerType: e.endTriggerType || 'end_of_plan',
      })),
      flows: (plan.flows || []).map((f: any) => ({
        id: f.id,
        name: f.name,
        type: f.type || 'invest',
        rank: f.rank || 1,
        targetAccountId: f.targetAccountId,
        ruleType: f.ruleType || 'save_leftover',
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
  }, [plan]);

  const [mcResult, setMcResult] = useState<MonteCarloOutput>(() =>
    runMonteCarloSimulation(enginePlan as any, { numberOfTrials: trialsCount, model })
  );

  const handleRunSimulation = () => {
    const res = runMonteCarloSimulation(enginePlan as any, { numberOfTrials: trialsCount, model });
    setMcResult(res);
  };

  const chartData = useMemo(() => {
    return mcResult.percentiles.years.map((year, i) => ({
      year,
      p10: mcResult.percentiles.p10[i],
      p25: mcResult.percentiles.p25[i],
      p50: mcResult.percentiles.p50[i],
      p75: mcResult.percentiles.p75[i],
      p90: mcResult.percentiles.p90[i],
    }));
  }, [mcResult]);

  return (
    <div className="space-y-6">
      {/* Header Toolbar */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-card border border-border rounded-xl p-4 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center font-bold text-lg">
            {mcResult.successRate.toFixed(0)}%
          </div>
          <div>
            <h3 className="text-sm font-bold text-foreground">Monte Carlo Stress Test</h3>
            <p className="text-xs text-muted-foreground">
              Ran {mcResult.totalTrials} trials using {model.replace('_', ' ')}
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
            onClick={handleRunSimulation}
            className="flex items-center gap-1.5 bg-primary text-primary-foreground hover:bg-primary/90 px-4 py-1.5 rounded-lg text-xs font-semibold shadow-sm transition-all"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Run Test
          </button>
        </div>
      </div>

      {/* Summary Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-card border border-border rounded-xl p-4 shadow-sm space-y-1">
          <span className="text-xs font-semibold text-muted-foreground">Chance of Success</span>
          <p className="text-2xl font-extrabold text-emerald-500 font-mono">{mcResult.successRate.toFixed(1)}%</p>
        </div>
        <div className="bg-card border border-border rounded-xl p-4 shadow-sm space-y-1">
          <span className="text-xs font-semibold text-muted-foreground">Median Legacy (50th %)</span>
          <p className="text-2xl font-extrabold text-foreground font-mono">{formatCurrency(mcResult.medianLegacy)}</p>
        </div>
        <div className="bg-card border border-border rounded-xl p-4 shadow-sm space-y-1">
          <span className="text-xs font-semibold text-muted-foreground">Worst Case Legacy</span>
          <p className="text-2xl font-extrabold text-rose-500 font-mono">{formatCurrency(mcResult.worstCaseLegacy)}</p>
        </div>
        <div className="bg-card border border-border rounded-xl p-4 shadow-sm space-y-1">
          <span className="text-xs font-semibold text-muted-foreground">Best Case Legacy</span>
          <p className="text-2xl font-extrabold text-primary font-mono">{formatCurrency(mcResult.bestCaseLegacy)}</p>
        </div>
      </div>

      {/* Fan Chart Visualization */}
      <div className="bg-card border border-border rounded-xl p-5 shadow-sm space-y-4">
        <h3 className="text-sm font-bold text-foreground">Percentile Net Worth Trajectories</h3>
        <div className="h-72 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData}>
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
  );
}
