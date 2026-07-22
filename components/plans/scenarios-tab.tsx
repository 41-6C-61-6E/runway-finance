'use client';

import { useState, useMemo } from 'react';
import { runBeamSearchOptimization, OptimizationObjective, OptimizationIntensity, OptimizationOutput } from '@/lib/services/beam-search-optimizer';
import { runRetirementSimulation, EnginePlan } from '@/lib/services/retirement-engine';
import { DEFAULT_2026_RULES } from '@/lib/constants/retirement-defaults';
import { formatCurrency } from '@/lib/utils/format';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from 'recharts';
import { Play, Zap, Star, GitCompare, Sparkles, CheckCircle2, ShieldAlert, ArrowRight, Layers, Award } from 'lucide-react';
import { CollapsibleCardHeader } from '@/components/ui/collapsible-card-header';
import { useCardCollapsed } from '@/lib/hooks/use-card-collapsed';

interface ScenariosTabProps {
  plan: any;
  allPlans?: any[];
  onUpdatePlan?: (updates: any) => void;
}

export function ScenariosTab({ plan, allPlans = [], onUpdatePlan }: ScenariosTabProps) {
  const [activeSubTab, setActiveSubTab] = useState<'compare' | 'matrix' | 'optimizer'>('compare');

  // Collapsible card states
  const [isCompareCardCollapsed, setIsCompareCardCollapsed] = useCardCollapsed('scenarios_compare_card');
  const [isTrajectoryChartCollapsed, setIsTrajectoryChartCollapsed] = useCardCollapsed('scenarios_trajectory_chart');
  const [isMatrixCollapsed, setIsMatrixCollapsed] = useCardCollapsed('scenarios_matrix');
  const [isOptimizerCollapsed, setIsOptimizerCollapsed] = useCardCollapsed('scenarios_optimizer');

  // Scenario Comparison mode: 'saved_plans' vs 'custom_params'
  const [compareMode, setCompareMode] = useState<'saved_plans' | 'custom_params'>('saved_plans');
  const [selectedPlanBId, setSelectedPlanBId] = useState<string>(() => {
    const secondary = allPlans.find((p) => p.id !== plan?.id);
    return secondary?.id || plan?.id || '';
  });

  // Custom hypothetical scenario parameters
  const [scenarioBRetirementAge, setScenarioBRetirementAge] = useState(55);
  const [scenarioBReturnRate, setScenarioBReturnRate] = useState(8.0);
  const [scenarioBStateTaxRate, setScenarioBStateTaxRate] = useState(0.0);

  // Optimizer controls
  const [objective, setObjective] = useState<OptimizationObjective>('legacy');
  const [intensity, setIntensity] = useState<OptimizationIntensity>('standard');
  const [optLoading, setOptLoading] = useState(false);

  // Helper to convert DB plan to EnginePlan object
  const buildEnginePlan = (targetPlan: any): EnginePlan => {
    const planAccountsList = Array.isArray(targetPlan?.accounts) ? targetPlan.accounts : [];
    const activeAccounts = planAccountsList.filter((a: any) => a.isIncluded !== false);

    return {
      id: targetPlan?.id || 'plan_1',
      name: targetPlan?.name || 'Primary Plan',
      hasSpouse: Boolean(targetPlan?.hasSpouse),
      primaryBirthYear: Number(targetPlan?.primaryBirthYear) || 1985,
      primaryBirthMonth: Number(targetPlan?.primaryBirthMonth) || 1,
      spouseBirthYear: targetPlan?.spouseBirthYear ? Number(targetPlan.spouseBirthYear) : undefined,
      spouseBirthMonth: targetPlan?.spouseBirthMonth ? Number(targetPlan.spouseBirthMonth) : undefined,
      spouseName: targetPlan?.spouseName || 'Spouse / Partner',
      spouseRetirementAge: targetPlan?.spouseRetirementAge ? Number(targetPlan.spouseRetirementAge) : 60,
      spouseLifeExpectancyAge: targetPlan?.spouseLifeExpectancyAge ? Number(targetPlan.spouseLifeExpectancyAge) : 100,
      primarySsMonthlyAmount: targetPlan?.primarySsMonthlyAmount ? parseFloat(targetPlan.primarySsMonthlyAmount) : 2500,
      primarySsStartAge: targetPlan?.primarySsStartAge ? Number(targetPlan.primarySsStartAge) : 67,
      spouseSsMonthlyAmount: targetPlan?.spouseSsMonthlyAmount ? parseFloat(targetPlan.spouseSsMonthlyAmount) : 2000,
      spouseSsStartAge: targetPlan?.spouseSsStartAge ? Number(targetPlan.spouseSsStartAge) : 67,
      enableSpousalSsBenefit: targetPlan?.enableSpousalSsBenefit !== false,
      filingStatus: targetPlan?.filingStatus || 'single',
      retirementAge: Number(targetPlan?.retirementAge) || 60,
      lifeExpectancyAge: Number(targetPlan?.lifeExpectancyAge) || 100,
      withdrawalMethod: targetPlan?.settings?.withdrawalMethod || targetPlan?.withdrawalMethod || 'textbook',
      customWithdrawalOrder: Array.isArray(targetPlan?.customWithdrawalOrder) ? targetPlan.customWithdrawalOrder : undefined,
      accounts: activeAccounts.map((a: any) => ({
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
      events: (targetPlan?.events || []).map((e: any) => ({
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
      flows: (targetPlan?.flows || []).map((f: any) => ({
        id: f.id,
        name: f.name,
        type: f.type || 'invest',
        rank: f.rank || 1,
        targetAccountId: f.targetAccountId,
        ruleType: f.ruleType || 'save_leftover',
        ruleValue: f.ruleValue ? parseFloat(f.ruleValue) : undefined,
        matchRate: f.matchRate ? parseFloat(f.matchRate) : undefined,
        matchLimit: f.matchLimit ? parseFloat(f.matchLimit) : undefined,
        matchAccountId: f.matchAccountId,
      })),
      settings: {
        fixedInflationRate: parseFloat(targetPlan?.settings?.fixedInflationRate || '3.0'),
        withholdingDeferred: parseFloat(targetPlan?.settings?.withholdingDeferred || '20.0'),
        withholdingTaxable: parseFloat(targetPlan?.settings?.withholdingTaxable || '10.0'),
        incomeTaxModifier: parseFloat(targetPlan?.settings?.incomeTaxModifier || '0.0'),
        capGainsTaxModifier: parseFloat(targetPlan?.settings?.capGainsTaxModifier || '0.0'),
        heirFlatIncomeTaxRate: parseFloat(targetPlan?.settings?.heirFlatIncomeTaxRate || '25.0'),
        stepUpBasis: targetPlan?.settings?.stepUpBasis ?? true,
        realEstateLiquidationRate: parseFloat(targetPlan?.settings?.realEstateLiquidationRate || '6.0'),
        administrativeCostRate: parseFloat(targetPlan?.settings?.administrativeCostRate || '1.0'),
        charitableGiving: parseFloat(targetPlan?.settings?.charitableGiving || '0.0'),
        withdrawalMethod: targetPlan?.settings?.withdrawalMethod || targetPlan?.withdrawalMethod || 'textbook',
        enableRothConversions: Boolean(targetPlan?.settings?.enableRothConversions),
        rothConversionTargetCeiling: targetPlan?.settings?.rothConversionTargetCeiling || 'top_of_12',
        avoidIrmaaCliffs: Boolean(targetPlan?.settings?.avoidIrmaaCliffs),
      },
      rules: targetPlan?.rules || DEFAULT_2026_RULES,
    };
  };

  const primaryEnginePlan = useMemo(() => buildEnginePlan(plan), [plan]);

  // Selected Plan B from saved plans
  const planBTarget = useMemo(() => {
    return allPlans.find((p) => p.id === selectedPlanBId) || plan;
  }, [allPlans, selectedPlanBId, plan]);

  // Comparison simulations
  const comparisonSims = useMemo(() => {
    const planA = primaryEnginePlan;
    let planB: EnginePlan;

    if (compareMode === 'saved_plans') {
      planB = buildEnginePlan(planBTarget);
    } else {
      planB = JSON.parse(JSON.stringify(primaryEnginePlan));
      planB.retirementAge = scenarioBRetirementAge;
      planB.accounts.forEach((acc) => {
        acc.expectedGrowthRate = scenarioBReturnRate;
      });
      if (!planB.settings) planB.settings = { fixedInflationRate: 3.0 };
      planB.settings.incomeTaxModifier = scenarioBStateTaxRate;
    }

    const simA = runRetirementSimulation(planA);
    const simB = runRetirementSimulation(planB);

    const taxesA = simA.yearlyResults.reduce((s, y) => s + y.taxesPaid, 0);
    const taxesB = simB.yearlyResults.reduce((s, y) => s + y.taxesPaid, 0);

    const etrA = simA.yearlyResults.length > 0 ? simA.yearlyResults.reduce((s, y) => s + y.effectiveTaxRate, 0) / simA.yearlyResults.length : 0;
    const etrB = simB.yearlyResults.length > 0 ? simB.yearlyResults.reduce((s, y) => s + y.effectiveTaxRate, 0) / simB.yearlyResults.length : 0;

    const chartComparison = simA.yearlyResults.map((yA, i) => {
      const yB = simB.yearlyResults[i];
      return {
        year: yA.year,
        age: yA.primaryAge,
        netWorthA: Math.round(yA.netWorth),
        netWorthB: Math.round(yB?.netWorth || 0),
      };
    });

    return { simA, simB, planBName: planB.name, taxesA, taxesB, etrA, etrB, chartComparison };
  }, [primaryEnginePlan, compareMode, planBTarget, scenarioBRetirementAge, scenarioBReturnRate, scenarioBStateTaxRate]);

  // Live Dynamic Strategy Matrix (runs 6 real simulations using engine)
  const realStrategyMatrix = useMemo(() => {
    const base = primaryEnginePlan;

    // 1. Baseline
    const sim1 = runRetirementSimulation(base);

    // 2. Roth Conversion 12% Bracket
    const plan2: EnginePlan = JSON.parse(JSON.stringify(base));
    plan2.settings.enableRothConversions = true;
    plan2.settings.rothConversionTargetCeiling = 'top_of_12';
    const sim2 = runRetirementSimulation(plan2);

    // 3. Roth Conversion 22% Bracket
    const plan3: EnginePlan = JSON.parse(JSON.stringify(base));
    plan3.settings.enableRothConversions = true;
    plan3.settings.rothConversionTargetCeiling = 'top_of_22';
    const sim3 = runRetirementSimulation(plan3);

    // 4. Tax Optimized Drawdown
    const plan4: EnginePlan = JSON.parse(JSON.stringify(base));
    plan4.settings.withdrawalMethod = 'tax_optimized';
    const sim4 = runRetirementSimulation(plan4);

    // 5. Social Security Delay (Age 70)
    const plan5: EnginePlan = JSON.parse(JSON.stringify(base));
    plan5.primarySsStartAge = 70;
    plan5.spouseSsStartAge = 70;
    const sim5 = runRetirementSimulation(plan5);

    // 6. Social Security Early (Age 62)
    const plan6: EnginePlan = JSON.parse(JSON.stringify(base));
    plan6.primarySsStartAge = 62;
    plan6.spouseSsStartAge = 62;
    const sim6 = runRetirementSimulation(plan6);

    const calcStats = (sim: any, name: string, desc: string, updateSettings: any) => {
      const taxes = sim.yearlyResults.reduce((s: number, y: any) => s + y.taxesPaid, 0);
      const etr = sim.yearlyResults.length > 0 ? sim.yearlyResults.reduce((s: number, y: any) => s + y.effectiveTaxRate, 0) / sim.yearlyResults.length : 0;
      const rmds = sim.yearlyResults.reduce((s: number, y: any) => s + (y.drawdownsByType?.traditional || 0), 0);
      const peakWithdrawal = Math.max(0, ...sim.yearlyResults.filter((y: any) => y.primaryAge >= base.retirementAge).map((y: any) => {
        const cashD = y.drawdownsByType?.cash || 0;
        const taxD = y.drawdownsByType?.taxable || 0;
        const tradD = y.drawdownsByType?.traditional || 0;
        const rothD = y.drawdownsByType?.roth || 0;
        const hsaD = y.drawdownsByType?.hsa || 0;
        const totalD = cashD + taxD + tradD + rothD + hsaD;
        return (totalD > 0 && y.netWorth + totalD > 0) ? (totalD / (y.netWorth + totalD)) * 100 : 0;
      }));

      return {
        name,
        desc,
        tax: taxes,
        legacy: sim.netLegacy,
        etr,
        rmds,
        peakWithdrawal,
        success: sim.success,
        updateSettings,
      };
    };

    const strats = [
      calcStats(sim1, 'Baseline Plan', 'Current plan rules and settings', {}),
      calcStats(sim2, 'Roth Conversion (Top of 12% Bracket)', 'Converts Traditional to Roth filling up to 12% tax bracket', { enableRothConversions: true, rothConversionTargetCeiling: 'top_of_12' }),
      calcStats(sim3, 'Roth Conversion (Top of 22% Bracket)', 'Converts Traditional to Roth filling up to 22% tax bracket', { enableRothConversions: true, rothConversionTargetCeiling: 'top_of_22' }),
      calcStats(sim4, 'Tax-Optimized Bracket Shielding', 'Draws from taxable accounts first, then traditional up to 12% bracket', { withdrawalMethod: 'tax_optimized' }),
      calcStats(sim5, 'Social Security Delay (Age 70)', 'Delays Social Security claiming to age 70 for +24-32% benefit increase', { primarySsStartAge: 70, spouseSsStartAge: 70 }),
      calcStats(sim6, 'Social Security Early (Age 62)', 'Claims Social Security at earliest eligibility (Age 62)', { primarySsStartAge: 62, spouseSsStartAge: 62 }),
    ];

    // Mark highest legacy with 100% success as optimal
    let maxLegacy = -Infinity;
    let optIdx = 0;
    strats.forEach((s, idx) => {
      if (s.success && s.legacy > maxLegacy) {
        maxLegacy = s.legacy;
        optIdx = idx;
      }
    });

    return strats.map((s, idx) => ({ ...s, isOptimal: idx === optIdx }));
  }, [primaryEnginePlan]);

  // Beam Search Optimizer
  const [optResult, setOptResult] = useState<OptimizationOutput>(() =>
    runBeamSearchOptimization(primaryEnginePlan, objective, intensity)
  );

  const handleRunOptimizer = () => {
    setOptLoading(true);
    setTimeout(() => {
      const res = runBeamSearchOptimization(primaryEnginePlan, objective, intensity);
      setOptResult(res);
      setOptLoading(false);
    }, 200);
  };

  return (
    <div className="space-y-6">
      {/* Sub-navigation bar */}
      <div className="flex items-center gap-2 border-b border-border pb-3">
        {[
          { id: 'compare' as const, label: 'Scenario Comparison', icon: GitCompare },
          { id: 'matrix' as const, label: 'Live Strategy Matrix', icon: Star },
          { id: 'optimizer' as const, label: 'Beam Optimizer', icon: Zap },
        ].map((t) => {
          const Icon = t.icon;
          const isActive = activeSubTab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setActiveSubTab(t.id)}
              className={`flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
                isActive ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground hover:bg-muted/40'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              {t.label}
            </button>
          );
        })}
      </div>

      {/* Sub-Tab 1: Saved Plan & Custom Scenario Comparison */}
      {activeSubTab === 'compare' && (
        <div className="space-y-6">
          {/* Controls to pick mode & select plans */}
          <div className="bg-card border border-border rounded-xl shadow-sm overflow-hidden space-y-0">
            <CollapsibleCardHeader
              isCollapsed={isCompareCardCollapsed}
              onToggle={setIsCompareCardCollapsed}
              title={
                <div className="flex items-center gap-2">
                  <GitCompare className="w-5 h-5 text-primary" />
                  <div>
                    <h3 className="text-sm font-bold text-foreground">Scenario Comparison Engine</h3>
                    <p className="text-xs text-muted-foreground">Compare saved FIRE plans side-by-side or model custom hypotheses</p>
                  </div>
                </div>
              }
              actions={
                <div className="flex items-center bg-muted/50 rounded-lg p-0.5 border border-border text-xs">
                  <button
                    onClick={() => setCompareMode('saved_plans')}
                    className={`px-3 py-1.5 rounded-md font-bold transition-all cursor-pointer ${
                      compareMode === 'saved_plans' ? 'bg-card text-primary shadow-xs' : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    Compare Saved Plans ({allPlans.length})
                  </button>
                  <button
                    onClick={() => setCompareMode('custom_params')}
                    className={`px-3 py-1.5 rounded-md font-bold transition-all cursor-pointer ${
                      compareMode === 'custom_params' ? 'bg-card text-primary shadow-xs' : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    Custom What-If Parameters
                  </button>
                </div>
              }
            />

            {!isCompareCardCollapsed && (
              <div className="p-5 space-y-4">
                {compareMode === 'saved_plans' ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                    <div className="space-y-1.5 bg-muted/20 p-3 rounded-xl border border-border">
                      <span className="font-bold text-emerald-500 uppercase tracking-wider text-[10px]">Plan A (Active Plan)</span>
                      <p className="text-sm font-extrabold text-foreground font-mono">{plan?.name || 'Primary Plan'}</p>
                      <p className="text-[11px] text-muted-foreground">Retirement Age {plan?.retirementAge || 60} • {plan?.filingStatus === 'married_joint' ? 'Married Filing Jointly' : 'Single'}</p>
                    </div>

                    <div className="space-y-1.5 bg-muted/20 p-3 rounded-xl border border-border">
                      <label className="font-bold text-amber-500 uppercase tracking-wider text-[10px] block">Select Plan B to Compare</label>
                      <select
                        value={selectedPlanBId}
                        onChange={(e) => setSelectedPlanBId(e.target.value)}
                        className="w-full bg-background border border-border rounded-lg px-3 py-2 text-xs font-semibold text-foreground focus:outline-none"
                      >
                        {allPlans.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name} {p.id === plan?.id ? '(Current Active)' : ''}
                          </option>
                        ))}
                      </select>
                      <p className="text-[11px] text-muted-foreground">Choose any saved plan to compare trajectories</p>
                    </div>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
                    <div className="space-y-1.5">
                      <label className="font-bold text-foreground block">Scenario B Retirement Age</label>
                      <input
                        type="number"
                        min="40"
                        max="75"
                        value={scenarioBRetirementAge}
                        onChange={(e) => setScenarioBRetirementAge(Number(e.target.value))}
                        className="w-full bg-background border border-border rounded-xl px-3 py-2 text-xs font-mono text-foreground focus:outline-none"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <label className="font-bold text-foreground block">Scenario B Annual Return (%)</label>
                      <input
                        type="number"
                        step="0.5"
                        value={scenarioBReturnRate}
                        onChange={(e) => setScenarioBReturnRate(Number(e.target.value))}
                        className="w-full bg-background border border-border rounded-xl px-3 py-2 text-xs font-mono text-foreground focus:outline-none"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <label className="font-bold text-foreground block">Scenario B State Tax Rate (%)</label>
                      <input
                        type="number"
                        step="0.5"
                        value={scenarioBStateTaxRate}
                        onChange={(e) => setScenarioBStateTaxRate(Number(e.target.value))}
                        className="w-full bg-background border border-border rounded-xl px-3 py-2 text-xs font-mono text-foreground focus:outline-none"
                      />
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Metric Comparison Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-card border border-border rounded-xl p-4 shadow-sm space-y-1">
              <span className="text-xs font-bold text-emerald-500 uppercase">Plan A ({plan?.name}) Portfolio</span>
              <p className="text-xl font-extrabold text-emerald-500 font-mono">{formatCurrency(comparisonSims.simA.endingNetWorth)}</p>
              <p className="text-[11px] font-mono text-muted-foreground">Taxes: {formatCurrency(comparisonSims.taxesA)} | ETR: {comparisonSims.etrA.toFixed(1)}%</p>
            </div>

            <div className="bg-card border border-border rounded-xl p-4 shadow-sm space-y-1">
              <span className="text-xs font-bold text-amber-500 uppercase">Plan B ({comparisonSims.planBName}) Portfolio</span>
              <p className="text-xl font-extrabold text-amber-500 font-mono">{formatCurrency(comparisonSims.simB.endingNetWorth)}</p>
              <p className="text-[11px] font-mono text-muted-foreground">Taxes: {formatCurrency(comparisonSims.taxesB)} | ETR: {comparisonSims.etrB.toFixed(1)}%</p>
            </div>

            <div className="bg-card border border-border rounded-xl p-4 shadow-sm space-y-1">
              <span className="text-xs font-bold text-muted-foreground uppercase">Portfolio Delta</span>
              <p className={`text-xl font-extrabold font-mono ${comparisonSims.simB.endingNetWorth >= comparisonSims.simA.endingNetWorth ? 'text-emerald-500' : 'text-rose-500'}`}>
                {comparisonSims.simB.endingNetWorth >= comparisonSims.simA.endingNetWorth ? '+' : ''}{formatCurrency(comparisonSims.simB.endingNetWorth - comparisonSims.simA.endingNetWorth)}
              </p>
              <p className="text-[11px] text-muted-foreground">Ending legacy buffer difference</p>
            </div>

            <div className="bg-card border border-border rounded-xl p-4 shadow-sm space-y-1">
              <span className="text-xs font-bold text-muted-foreground uppercase">Lifetime Tax Delta</span>
              <p className={`text-xl font-extrabold font-mono ${comparisonSims.taxesB <= comparisonSims.taxesA ? 'text-emerald-500' : 'text-rose-500'}`}>
                {comparisonSims.taxesB <= comparisonSims.taxesA ? '-' : '+'}{formatCurrency(Math.abs(comparisonSims.taxesA - comparisonSims.taxesB))}
              </p>
              <p className="text-[11px] text-muted-foreground">{comparisonSims.taxesB <= comparisonSims.taxesA ? 'Plan B saves taxes' : 'Plan B owes higher taxes'}</p>
            </div>
          </div>

          {/* Overlaid Trajectory Chart */}
          <div className="bg-card border border-border rounded-xl shadow-sm overflow-hidden space-y-0">
            <CollapsibleCardHeader
              isCollapsed={isTrajectoryChartCollapsed}
              onToggle={setIsTrajectoryChartCollapsed}
              title={<h3 className="text-sm font-bold text-foreground">Overlaid Retirement Portfolio Trajectories</h3>}
            />

            {!isTrajectoryChartCollapsed && (
              <div className="p-5">
                <div className="h-72 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={comparisonSims.chartComparison}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" strokeOpacity={0.3} vertical={false} />
                      <XAxis dataKey="age" stroke="currentColor" className="text-xs text-muted-foreground" tickLine={false} />
                      <YAxis stroke="currentColor" className="text-xs text-muted-foreground" tickLine={false} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
                      <Tooltip formatter={(val: any) => [formatCurrency(Number(val)), 'Retirement Portfolio']} />
                      <Legend />
                      <Line type="monotone" dataKey="netWorthA" name={`Plan A: ${plan?.name}`} stroke="#10b981" strokeWidth={2.5} dot={false} />
                      <Line type="monotone" dataKey="netWorthB" name={`Plan B: ${comparisonSims.planBName}`} stroke="#f59e0b" strokeWidth={2.5} strokeDasharray="4 4" dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Sub-Tab 2: Live Dynamic Strategy Matrix */}
      {activeSubTab === 'matrix' && (
        <div className="bg-card border border-border rounded-xl shadow-sm overflow-hidden space-y-0">
          <CollapsibleCardHeader
            isCollapsed={isMatrixCollapsed}
            onToggle={setIsMatrixCollapsed}
            title={
              <div>
                <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
                  <Star className="w-4 h-4 text-amber-500 fill-amber-500" />
                  Live Engine Strategy Matrix
                </h3>
                <p className="text-xs text-muted-foreground mt-0.5">Real-time simulation results comparing tax & withdrawal strategies on your active plan</p>
              </div>
            }
            actions={
              <span className="inline-flex items-center gap-1 text-xs text-amber-500 font-bold bg-amber-500/10 px-2.5 py-1 rounded-full border border-amber-500/20">
                <Award className="w-3.5 h-3.5" />
                Engine Recommended
              </span>
            }
          />

          {!isMatrixCollapsed && (
            <div className="p-5">

          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="bg-muted/40 text-muted-foreground font-semibold border-b border-border">
                <tr>
                  <th className="p-3">Strategy Name</th>
                  <th className="p-3">Lifetime Taxes</th>
                  <th className="p-3">Average ETR</th>
                  <th className="p-3">Ending Portfolio</th>
                  <th className="p-3">Peak Draw %</th>
                  <th className="p-3">Plan Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {realStrategyMatrix.map((strat) => (
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
                    <td className="p-3 font-mono">
                      <span className={strat.peakWithdrawal > 5 ? 'text-rose-500 font-bold' : strat.peakWithdrawal > 3.5 ? 'text-amber-500' : 'text-emerald-500 font-bold'}>
                        {strat.peakWithdrawal.toFixed(1)}%
                      </span>
                    </td>
                    <td className="p-3">
                      <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                        strat.success ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20' : 'bg-rose-500/10 text-rose-500 border-rose-500/20'
                      }`}>
                        {strat.success ? 'Succeeds' : 'Depletes'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
            </div>
          )}
        </div>
      )}

      {/* Sub-Tab 3: Beam Search Optimizer */}
      {activeSubTab === 'optimizer' && (
        <div className="space-y-6">
          <div className="bg-card border border-border rounded-xl shadow-sm overflow-hidden space-y-0">
            <CollapsibleCardHeader
              isCollapsed={isOptimizerCollapsed}
              onToggle={setIsOptimizerCollapsed}
              title={
                <div className="flex items-center gap-2">
                  <Zap className="w-5 h-5 text-primary" />
                  <h3 className="text-sm font-bold text-foreground">Optimization Objective</h3>
                </div>
              }
            />

            {!isOptimizerCollapsed && (
              <div className="p-5 space-y-5">

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 text-xs">
              {[
                { id: 'legacy' as const, label: 'Higher Net Legacy', desc: 'Maximize estate passed to heirs' },
                { id: 'taxes' as const, label: 'Lower Lifetime Taxes', desc: 'Minimize cumulative taxes paid' },
                { id: 'networth' as const, label: 'Higher Portfolio Balance', desc: 'Maximize final ending portfolio' },
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
                      className={`px-2.5 py-1 text-xs font-semibold capitalize rounded-md transition-all cursor-pointer ${
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
                className="flex items-center gap-2 bg-primary text-primary-foreground hover:bg-primary/90 px-5 py-2 rounded-xl text-xs font-bold shadow-md transition-all disabled:opacity-50 cursor-pointer"
              >
                <Play className="w-3.5 h-3.5 fill-current" />
                {optLoading ? 'Optimizing...' : 'Run Beam Search'}
              </button>
            </div>
              </div>
            )}
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
