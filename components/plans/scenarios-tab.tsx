'use client';

import { useState, useMemo } from 'react';
import { runRetirementSimulation, EnginePlan } from '@/lib/services/retirement-engine';
import { DEFAULT_2026_RULES } from '@/lib/constants/retirement-defaults';
import { formatCurrency } from '@/lib/utils/format';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Legend,
} from 'recharts';
import {
  ShieldCheck,
  Check,
  CheckCircle2,
  Sparkles,
  Layers,
  HeartHandshake,
  Calendar,
  Zap,
  Flame,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { CollapsibleCardHeader } from '@/components/ui/collapsible-card-header';
import { useCardCollapsed } from '@/lib/hooks/use-card-collapsed';

interface ScenariosTabProps {
  plan: any;
  allPlans?: any[];
  onUpdatePlan?: (updates: any) => void;
}

export function ScenariosTab({ plan, onUpdatePlan }: ScenariosTabProps) {
  const [activeSection, setActiveSection] = useState<'strategies' | 'tactics'>('strategies');
  const [expandedStrategyId, setExpandedStrategyId] = useState<string | null>(null);

  // Collapsible card states
  const [isStrategiesCollapsed, setIsStrategiesCollapsed] = useCardCollapsed('scenarios_strategies');
  const [isTacticsCollapsed, setIsTacticsCollapsed] = useCardCollapsed('scenarios_tactics');

  // Applied Toast Feedback
  const [appliedMsg, setAppliedMsg] = useState<string>('');

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
      primarySalary: parseFloat(targetPlan?.primarySalary) || 0,
      spouseSalary: parseFloat(targetPlan?.spouseSalary) || 0,
      primarySalaryYear: Number(targetPlan?.primarySalaryYear) || new Date().getFullYear(),
      primarySalaryRaisePct: parseFloat(targetPlan?.primarySalaryRaisePct) || 0,
      primarySalaryOverrides: targetPlan?.primarySalaryOverrides && typeof targetPlan?.primarySalaryOverrides === 'object' ? targetPlan.primarySalaryOverrides : undefined,
      spouseSalaryYear: Number(targetPlan?.spouseSalaryYear) || new Date().getFullYear(),
      spouseSalaryRaisePct: parseFloat(targetPlan?.spouseSalaryRaisePct) || 0,
      spouseSalaryOverrides: targetPlan?.spouseSalaryOverrides && typeof targetPlan?.spouseSalaryOverrides === 'object' ? targetPlan.spouseSalaryOverrides : undefined,
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
        contributionMode: (a.contributionMode as any) || 'none',
        contributionValue: a.contributionValue ? parseFloat(a.contributionValue) : undefined,
        contributionSalarySource: a.contributionSalarySource || undefined,
        companyMatchRate: a.companyMatchRate ? parseFloat(a.companyMatchRate) : undefined,
        companyMatchLimit: a.companyMatchLimit ? parseFloat(a.companyMatchLimit) : undefined,
        isSurplusDestination: Boolean(a.isSurplusDestination),
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
        rothConversionTargetCeiling: (targetPlan?.settings?.rothConversionTargetCeiling as any) || 'top_of_12',
        avoidIrmaaCliffs: Boolean(targetPlan?.settings?.avoidIrmaaCliffs),
        allowPenaltyWithdrawals: targetPlan?.settings?.allowPenaltyWithdrawals !== false,
      },
      rules: targetPlan?.rules || DEFAULT_2026_RULES,
    };
  };

  const primaryEnginePlan = useMemo(() => buildEnginePlan(plan), [plan]);

  // ── SECTION 1: WITHDRAWAL STRATEGY COMPARISON ENGINE ──
  const strategiesList = useMemo(() => {
    const baseline = primaryEnginePlan;

    // 1. Textbook / Taxable First
    const stratTextbook = { ...baseline, withdrawalMethod: 'textbook' as const };
    // 2. Proportional / Pro-Rata
    const stratProportional = { ...baseline, withdrawalMethod: 'proportional' as const };
    // 3. Tax-Deferred First / Waterfall
    const stratTaxDeferred = { ...baseline, withdrawalMethod: 'tax_deferred_first' as const };
    // 4. Tax-Optimized Bracket Filling
    const stratTaxOptimized = { ...baseline, withdrawalMethod: 'tax_optimized' as const };
    // 5. Roth Conversion Ladder Strategy
    const stratRothLadder = {
      ...baseline,
      withdrawalMethod: 'textbook' as const,
      settings: {
        ...baseline.settings,
        enableRothConversions: true,
        rothConversionTargetCeiling: 'top_of_12' as const,
        avoidIrmaaCliffs: true,
      },
    };

    const simTextbook = runRetirementSimulation(stratTextbook);
    const simProportional = runRetirementSimulation(stratProportional);
    const simTaxDeferred = runRetirementSimulation(stratTaxDeferred);
    const simTaxOptimized = runRetirementSimulation(stratTaxOptimized);
    const simRothLadder = runRetirementSimulation(stratRothLadder);

    const getSimSummary = (sim: any) => {
      const lastYr = sim.yearlyResults[sim.yearlyResults.length - 1];
      const endNW = lastYr?.netWorth || 0;
      const totalTaxes = sim.yearlyResults.reduce((sum: number, y: any) => sum + (y.taxesPaid || 0), 0);
      const maxRmd = Math.max(...sim.yearlyResults.map((y: any) => y.rmdAmount || 0));
      const ranOutOfMoney = sim.yearlyResults.some((y: any) => y.netWorth <= 0);
      return { endNW, totalTaxes, maxRmd, ranOutOfMoney, yearlyResults: sim.yearlyResults };
    };

    const textSum = getSimSummary(simTextbook);
    const propSum = getSimSummary(simProportional);
    const defSum = getSimSummary(simTaxDeferred);
    const optSum = getSimSummary(simTaxOptimized);
    const rothSum = getSimSummary(simRothLadder);

    return [
      {
        id: 'textbook',
        name: 'Taxable First (Textbook)',
        description: 'Spend taxable accounts first, preserving tax-free Roth growth until last.',
        method: 'textbook',
        enableRoth: false,
        summary: textSum,
        color: '#3b82f6', // blue
        drawdownOrder: ['Cash Reserves', 'Taxable Brokerage', 'Pre-Tax 401(k)/IRA', 'Roth IRA/401(k)'],
        phases: {
          early: 'Spends cash reserves and taxable brokerage assets first. Avoids 10% early withdrawal penalties on pre-tax accounts.',
          preRmd: 'Taxable accounts continue paying capital gains tax on dividends and sales, while traditional pre-tax accounts compound tax-deferred.',
          rmd: 'Large mandatory RMDs begin at age 75+, pushing income into higher federal ordinary tax brackets.',
        },
      },
      {
        id: 'proportional',
        name: 'Proportional (Pro-Rata)',
        description: 'Withdraw proportionally from taxable, pre-tax, and Roth buckets each year.',
        method: 'proportional',
        enableRoth: false,
        summary: propSum,
        color: '#8b5cf6', // purple
        drawdownOrder: ['Pro-Rata Cash', 'Pro-Rata Taxable', 'Pro-Rata Pre-Tax', 'Pro-Rata Roth'],
        phases: {
          early: 'Pulls a proportional percentage across all non-penalized account buckets each year.',
          preRmd: 'Balances all three tax buckets equally, smoothing tax bracket spikes before age 75.',
          rmd: 'Moderate RMDs at age 75 due to partial spenddown of pre-tax assets during early retirement years.',
        },
      },
      {
        id: 'tax_deferred_first',
        name: 'Tax-Deferred First (Waterfall)',
        description: 'Spend traditional 401(k)/IRA balances early to minimize mandatory RMD tax drag.',
        method: 'tax_deferred_first',
        enableRoth: false,
        summary: defSum,
        color: '#f59e0b', // amber
        drawdownOrder: ['Cash Reserves', 'Pre-Tax 401(k)/IRA', 'Taxable Brokerage', 'Roth IRA/401(k)'],
        phases: {
          early: 'Withdraws from traditional pre-tax accounts first to drain traditional balances.',
          preRmd: 'Aggressively drains pre-tax accounts to collapse future RMD tax liabilities before age 75.',
          rmd: 'RMD tax drag is minimized at age 75+, leaving remaining wealth in tax-free Roth accounts.',
        },
      },
      {
        id: 'tax_optimized',
        name: 'Tax Bracket Filling',
        description: 'Draw tax-deferred funds up to low bracket limit, then pull remainder from Roth.',
        method: 'tax_optimized',
        enableRoth: false,
        summary: optSum,
        color: '#10b981', // emerald
        drawdownOrder: ['Cash Reserves', 'Pre-Tax (Up to 12% Bracket)', 'Taxable Brokerage', 'Roth IRA/401(k)'],
        phases: {
          early: 'Fills low 10% and 12% ordinary tax brackets with pre-tax IRA withdrawals, drawing remainder from Roth.',
          preRmd: 'Maintains low marginal tax rates every year while systematically shrinking pre-tax balances.',
          rmd: 'Prevents RMD tax bombs by keeping pre-tax balances moderate, delivering high tax efficiency.',
        },
      },
      {
        id: 'roth_ladder',
        name: 'Roth Conversion Ladder',
        description: 'Execute annual pre-tax conversions to Roth up to top of 12% bracket while avoiding IRMAA cliffs.',
        method: 'textbook',
        enableRoth: true,
        summary: rothSum,
        color: '#ec4899', // pink
        drawdownOrder: ['Cash Reserves', 'Taxable Brokerage', 'Roth Conversion Headroom', 'Roth IRA/401(k)'],
        phases: {
          early: 'Executes annual pre-tax conversions to Roth up to top of 12% tax bracket ($96.9k MFJ / $48.4k Single).',
          preRmd: 'Converts pre-tax assets into tax-free Roth growth while avoiding Medicare IRMAA cliff surcharges.',
          rmd: 'Pre-tax accounts are fully converted or minimized, producing zero taxable RMDs at age 75+.',
        },
      },
    ];
  }, [primaryEnginePlan]);

  // Combined Chart Data for all 5 strategies
  const strategyChartData = useMemo(() => {
    const textRes = strategiesList.find((s) => s.id === 'textbook')?.summary.yearlyResults || [];
    const propRes = strategiesList.find((s) => s.id === 'proportional')?.summary.yearlyResults || [];
    const defRes = strategiesList.find((s) => s.id === 'tax_deferred_first')?.summary.yearlyResults || [];
    const optRes = strategiesList.find((s) => s.id === 'tax_optimized')?.summary.yearlyResults || [];
    const rothRes = strategiesList.find((s) => s.id === 'roth_ladder')?.summary.yearlyResults || [];

    return textRes.map((y: any, idx: number) => ({
      age: y.age,
      textbook: Math.round(y.netWorth),
      proportional: Math.round(propRes[idx]?.netWorth || 0),
      tax_deferred_first: Math.round(defRes[idx]?.netWorth || 0),
      tax_optimized: Math.round(optRes[idx]?.netWorth || 0),
      roth_ladder: Math.round(rothRes[idx]?.netWorth || 0),
    }));
  }, [strategiesList]);

  // ── SECTION 2: TACTICS MATRIX ENGINE ──
  const ssMatrix = useMemo(() => {
    const plan62 = { ...primaryEnginePlan, primarySsStartAge: 62 };
    const plan67 = { ...primaryEnginePlan, primarySsStartAge: 67 };
    const plan70 = { ...primaryEnginePlan, primarySsStartAge: 70 };

    const sim62 = runRetirementSimulation(plan62);
    const sim67 = runRetirementSimulation(plan67);
    const sim70 = runRetirementSimulation(plan70);

    const getSsSummary = (sim: any, startAge: number) => {
      const endNW = sim.yearlyResults[sim.yearlyResults.length - 1]?.netWorth || 0;
      const annualBenefit = (primaryEnginePlan.primarySsMonthlyAmount || 2500) * 12 * (startAge === 62 ? 0.70 : startAge === 70 ? 1.24 : 1.0);
      const lifetimeBenefit = sim.yearlyResults.reduce((sum: number, y: any) => sum + (y.ssIncome || 0), 0);
      return { endNW, annualBenefit, lifetimeBenefit };
    };

    return {
      age62: getSsSummary(sim62, 62),
      age67: getSsSummary(sim67, 67),
      age70: getSsSummary(sim70, 70),
    };
  }, [primaryEnginePlan]);

  const rothMatrix = useMemo(() => {
    const noRothPlan = {
      ...primaryEnginePlan,
      settings: { ...primaryEnginePlan.settings, enableRothConversions: false },
    };
    const top12Plan = {
      ...primaryEnginePlan,
      settings: {
        ...primaryEnginePlan.settings,
        enableRothConversions: true,
        rothConversionTargetCeiling: 'top_of_12' as const,
        avoidIrmaaCliffs: true,
      },
    };

    const simNoRoth = runRetirementSimulation(noRothPlan);
    const simTop12 = runRetirementSimulation(top12Plan);

    return {
      noRoth: {
        endNW: simNoRoth.yearlyResults[simNoRoth.yearlyResults.length - 1]?.netWorth || 0,
        maxRmd: Math.max(...simNoRoth.yearlyResults.map((y: any) => y.rmdAmount || 0)),
      },
      top12: {
        endNW: simTop12.yearlyResults[simTop12.yearlyResults.length - 1]?.netWorth || 0,
        maxRmd: Math.max(...simTop12.yearlyResults.map((y: any) => y.rmdAmount || 0)),
      },
    };
  }, [primaryEnginePlan]);

  const handleApplyStrategy = (strat: any) => {
    if (!onUpdatePlan) return;
    if (strat.enableRoth) {
      onUpdatePlan({
        withdrawalMethod: strat.method,
        settings: {
          enableRothConversions: true,
          rothConversionTargetCeiling: 'top_of_12',
          avoidIrmaaCliffs: true,
        },
      });
    } else {
      onUpdatePlan({
        withdrawalMethod: strat.method,
        settings: {
          enableRothConversions: false,
        },
      });
    }

    setAppliedMsg(`Applied ${strat.name} strategy to active plan!`);
    setTimeout(() => setAppliedMsg(''), 4000);
  };

  const handleApplySsAge = (age: number) => {
    if (!onUpdatePlan) return;
    onUpdatePlan({ primarySsStartAge: age });
    setAppliedMsg(`Set Primary Social Security claiming age to ${age}!`);
    setTimeout(() => setAppliedMsg(''), 4000);
  };

  return (
    <div className="space-y-6">
      {/* Toast Notification Banner */}
      {appliedMsg && (
        <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-3.5 text-xs text-emerald-600 dark:text-emerald-400 font-bold flex items-center justify-between animate-in fade-in">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-500" />
            <span>{appliedMsg}</span>
          </div>
        </div>
      )}

      {/* Scenarios Section Header Navigation */}
      <div className="flex flex-wrap items-center justify-between gap-4 bg-card border border-border rounded-2xl p-3 shadow-sm">
        <div className="flex items-center gap-1.5 overflow-x-auto">
          <button
            onClick={() => setActiveSection('strategies')}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer ${
              activeSection === 'strategies'
                ? 'bg-primary text-primary-foreground shadow-md'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
            }`}
          >
            <Layers className="w-4 h-4" />
            Withdrawal Strategy Lab
          </button>
          <button
            onClick={() => setActiveSection('tactics')}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer ${
              activeSection === 'tactics'
                ? 'bg-primary text-primary-foreground shadow-md'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
            }`}
          >
            <Zap className="w-4 h-4" />
            Retirement Tactics Matrix
          </button>
        </div>
      </div>

      {/* SECTION 1: WITHDRAWAL STRATEGY COMPARISON LAB */}
      {activeSection === 'strategies' && (
        <div className="space-y-6">
          <div className="bg-card border border-border rounded-2xl shadow-sm overflow-hidden">
            <CollapsibleCardHeader
              title="Withdrawal Sequencing Strategy Laboratory"
              description="Simulate and compare 5 distinct withdrawal ordering methods directly on your plan. Click any strategy row to expand its full sequencing breakdown."
              icon={Layers}
              isCollapsed={isStrategiesCollapsed}
              onToggle={() => setIsStrategiesCollapsed(!isStrategiesCollapsed)}
            />

            {!isStrategiesCollapsed && (
              <div className="p-5 space-y-6">
                {/* Visual Trajectory Multi-Line Chart */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-bold text-foreground">Net Worth Trajectory by Strategy</h4>
                    <span className="text-[11px] text-muted-foreground">Projections to Age {primaryEnginePlan.lifeExpectancyAge}</span>
                  </div>
                  <div className="h-72 w-full pt-2">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={strategyChartData}>
                        <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
                        <XAxis dataKey="age" stroke="#888888" fontSize={11} tickLine={false} />
                        <YAxis
                          stroke="#888888"
                          fontSize={10}
                          tickFormatter={(v) => `$${(v / 1000000).toFixed(1)}M`}
                          tickLine={false}
                        />
                        <Tooltip
                          formatter={(value: any) => [formatCurrency(Number(value)), 'Net Worth']}
                          labelFormatter={(label) => `Age ${label}`}
                          contentStyle={{ backgroundColor: 'rgba(15, 23, 42, 0.95)', borderColor: '#334155', borderRadius: '12px', fontSize: '11px', color: '#fff' }}
                        />
                        <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '8px' }} />
                        {strategiesList.map((strat) => (
                          <Line
                            key={strat.id}
                            type="monotone"
                            dataKey={strat.id}
                            name={strat.name}
                            stroke={strat.color}
                            strokeWidth={plan?.withdrawalMethod === strat.method ? 3 : 1.5}
                            dot={false}
                          />
                        ))}
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                {/* Strategy Metrics Comparison Table */}
                <div className="border border-border rounded-xl overflow-hidden shadow-sm">
                  <table className="w-full text-xs text-left">
                    <thead className="bg-muted/60 text-muted-foreground font-semibold">
                      <tr>
                        <th className="px-4 py-3">Strategy Name</th>
                        <th className="px-3 py-3 text-right">Ending Net Worth</th>
                        <th className="px-3 py-3 text-right">Lifetime Taxes</th>
                        <th className="px-3 py-3 text-right">Max Age 75 RMD</th>
                        <th className="px-3 py-3 text-center">Status</th>
                        <th className="px-4 py-3 text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/60">
                      {strategiesList.map((strat) => {
                        const isCurrentActive = plan?.withdrawalMethod === strat.method && (!strat.enableRoth || Boolean(plan?.settings?.enableRothConversions));
                        const isHighestNW = strat.summary.endNW === Math.max(...strategiesList.map((s) => s.summary.endNW));
                        const isExpanded = expandedStrategyId === strat.id;

                        return (
                          <tr key={strat.id} className="group">
                            <td colSpan={6} className="p-0">
                              {/* Main Strategy Header Row */}
                              <div
                                onClick={() => setExpandedStrategyId(isExpanded ? null : strat.id)}
                                className={`flex flex-wrap items-center justify-between px-4 py-3 cursor-pointer transition-colors ${
                                  isCurrentActive ? 'bg-primary/5 font-medium' : 'hover:bg-muted/30'
                                }`}
                              >
                                <div className="flex items-center gap-3 w-full sm:w-auto">
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setExpandedStrategyId(isExpanded ? null : strat.id);
                                    }}
                                    className="text-muted-foreground hover:text-foreground transition-transform"
                                  >
                                    {isExpanded ? <ChevronUp className="w-4 h-4 text-primary" /> : <ChevronDown className="w-4 h-4" />}
                                  </button>
                                  <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: strat.color }} />
                                  <div>
                                    <span className="font-bold text-foreground block flex items-center gap-2">
                                      {strat.name}
                                    </span>
                                    <span className="text-[10px] text-muted-foreground">{strat.description}</span>
                                  </div>
                                </div>

                                <div className="flex items-center gap-6 mt-2 sm:mt-0 ml-auto">
                                  <div className="text-right">
                                    <span className="text-[10px] text-muted-foreground block sm:hidden">Ending NW</span>
                                    <span className={`font-mono font-bold ${isHighestNW ? 'text-emerald-500' : 'text-foreground'}`}>
                                      {formatCurrency(strat.summary.endNW)}
                                    </span>
                                  </div>

                                  <div className="text-right hidden sm:block">
                                    <span className="font-mono text-muted-foreground">{formatCurrency(strat.summary.totalTaxes)}</span>
                                  </div>

                                  <div className="text-right hidden md:block">
                                    <span className="font-mono text-amber-500 font-semibold">{formatCurrency(strat.summary.maxRmd)}</span>
                                  </div>

                                  <div className="text-center min-w-[90px]">
                                    {isCurrentActive ? (
                                      <span className="inline-flex items-center gap-1 bg-primary/10 text-primary text-[10px] font-bold px-2 py-0.5 rounded-full">
                                        <Check className="w-3 h-3" /> Active
                                      </span>
                                    ) : isHighestNW ? (
                                      <span className="inline-flex items-center gap-1 bg-emerald-500/10 text-emerald-500 text-[10px] font-bold px-2 py-0.5 rounded-full">
                                        <Sparkles className="w-3 h-3" /> Highest Value
                                      </span>
                                    ) : (
                                      <span className="text-muted-foreground text-[10px]">Alternative</span>
                                    )}
                                  </div>

                                  <div>
                                    {!isCurrentActive && onUpdatePlan && (
                                      <button
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          handleApplyStrategy(strat);
                                        }}
                                        className="bg-primary/10 hover:bg-primary text-primary hover:text-primary-foreground text-[11px] font-bold px-3 py-1.5 rounded-lg transition-all cursor-pointer"
                                      >
                                        Apply
                                      </button>
                                    )}
                                  </div>
                                </div>
                              </div>

                              {/* Expanded Strategy Sequencing Breakdown Panel */}
                              {isExpanded && (
                                <div className="bg-muted/20 p-5 border-t border-border space-y-5 animate-in fade-in duration-200">
                                  {/* 1. Account Drawdown Priority Sequence Badges */}
                                  <div className="flex flex-wrap items-center gap-2 bg-card p-3.5 rounded-xl border border-border">
                                    <span className="font-bold text-foreground text-xs shrink-0">Drawdown Priority Order:</span>
                                    <div className="flex flex-wrap items-center gap-2">
                                      {strat.drawdownOrder.map((step, idx) => (
                                        <div key={idx} className="flex items-center gap-2">
                                          <span className="bg-primary/10 text-primary font-mono text-[11px] font-bold px-2.5 py-1 rounded-lg border border-primary/20">
                                            {idx + 1}. {step}
                                          </span>
                                          {idx < strat.drawdownOrder.length - 1 && (
                                            <span className="text-muted-foreground text-xs">→</span>
                                          )}
                                        </div>
                                      ))}
                                    </div>
                                  </div>

                                  {/* 2. Execution Steps Across Retirement Phases */}
                                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                    <div className="bg-card p-4 rounded-xl border border-border space-y-1.5 shadow-sm">
                                      <h5 className="font-bold text-primary flex items-center gap-1.5 text-xs">
                                        <Calendar className="w-3.5 h-3.5 text-primary" /> Phase 1: Early Retirement (Pre-59.5)
                                      </h5>
                                      <p className="text-[11px] text-muted-foreground leading-relaxed">
                                        {strat.phases.early}
                                      </p>
                                    </div>
                                    <div className="bg-card p-4 rounded-xl border border-border space-y-1.5 shadow-sm">
                                      <h5 className="font-bold text-indigo-500 flex items-center gap-1.5 text-xs">
                                        <Zap className="w-3.5 h-3.5 text-indigo-500" /> Phase 2: Pre-RMD Window (Ages 59.5 - 74)
                                      </h5>
                                      <p className="text-[11px] text-muted-foreground leading-relaxed">
                                        {strat.phases.preRmd}
                                      </p>
                                    </div>
                                    <div className="bg-card p-4 rounded-xl border border-border space-y-1.5 shadow-sm">
                                      <h5 className="font-bold text-amber-500 flex items-center gap-1.5 text-xs">
                                        <ShieldCheck className="w-3.5 h-3.5 text-amber-500" /> Phase 3: RMD & Legacy (Age 75+)
                                      </h5>
                                      <p className="text-[11px] text-muted-foreground leading-relaxed">
                                        {strat.phases.rmd}
                                      </p>
                                    </div>
                                  </div>

                                  {/* 3. Interactive Annual Drawdown & Tax Breakdown Log */}
                                  <div className="space-y-2">
                                    <div className="flex items-center justify-between">
                                      <h5 className="font-bold text-foreground text-xs">Annual Drawdown & Tax Breakdown Log</h5>
                                      <span className="text-[10px] text-muted-foreground">Retirement Phase Projections</span>
                                    </div>
                                    <div className="max-h-56 overflow-y-auto border border-border rounded-xl bg-card shadow-inner">
                                      <table className="w-full text-[11px] text-left">
                                        <thead className="bg-muted/80 text-muted-foreground font-semibold sticky top-0 backdrop-blur-sm">
                                          <tr>
                                            <th className="px-3 py-2">Age</th>
                                            <th className="px-3 py-2 text-right">Cash Draw</th>
                                            <th className="px-3 py-2 text-right">Taxable Draw</th>
                                            <th className="px-3 py-2 text-right">Pre-Tax Draw</th>
                                            <th className="px-3 py-2 text-right">Roth Draw</th>
                                            <th className="px-3 py-2 text-right">Taxes Paid</th>
                                            <th className="px-3 py-2 text-right">Ending Net Worth</th>
                                          </tr>
                                        </thead>
                                        <tbody className="divide-y divide-border/40">
                                          {strat.summary.yearlyResults
                                            .filter((y: any) => y.age >= (primaryEnginePlan.retirementAge || 60))
                                            .map((y: any) => (
                                              <tr key={y.year} className="hover:bg-muted/40 font-mono">
                                                <td className="px-3 py-1.5 font-bold text-foreground font-sans">Age {y.age}</td>
                                                <td className="px-3 py-1.5 text-right">{formatCurrency(y.drawdownsByType?.cash || 0)}</td>
                                                <td className="px-3 py-1.5 text-right">{formatCurrency(y.drawdownsByType?.taxable || 0)}</td>
                                                <td className="px-3 py-1.5 text-right text-amber-500 font-medium">{formatCurrency(y.drawdownsByType?.traditional || 0)}</td>
                                                <td className="px-3 py-1.5 text-right text-purple-500 font-medium">{formatCurrency(y.drawdownsByType?.roth || 0)}</td>
                                                <td className="px-3 py-1.5 text-right text-rose-400 font-medium">{formatCurrency(y.taxesPaid || 0)}</td>
                                                <td className="px-3 py-1.5 text-right font-bold text-foreground">{formatCurrency(y.netWorth || 0)}</td>
                                              </tr>
                                            ))}
                                        </tbody>
                                      </table>
                                    </div>
                                  </div>
                                </div>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* SECTION 2: RETIREMENT TACTICS & TAX MATRIX */}
      {activeSection === 'tactics' && (
        <div className="space-y-6">
          <div className="bg-card border border-border rounded-2xl shadow-sm overflow-hidden">
            <CollapsibleCardHeader
              title="Retirement Tactics & Tax Optimization Matrix"
              description="Calculate outcomes for Social Security timing, Roth conversion ceilings, and IRMAA cliffs"
              icon={Zap}
              isCollapsed={isTacticsCollapsed}
              onToggle={() => setIsTacticsCollapsed(!isTacticsCollapsed)}
            />

            {!isTacticsCollapsed && (
              <div className="p-5 space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* TACTIC 1: Social Security Claiming Strategy */}
                  <div className="bg-card border border-border rounded-xl p-5 space-y-4 shadow-sm">
                    <div className="flex items-center justify-between border-b border-border pb-3">
                      <h4 className="text-sm font-bold text-foreground flex items-center gap-2">
                        <HeartHandshake className="w-4 h-4 text-emerald-500" />
                        Social Security Claiming Strategy
                      </h4>
                      <span className="text-[10px] font-bold text-primary bg-primary/10 px-2 py-0.5 rounded">
                        Current: Age {primaryEnginePlan.primarySsStartAge}
                      </span>
                    </div>

                    <p className="text-xs text-muted-foreground">
                      Compare lifetime benefits and portfolio preservation across claiming ages 62, 67, and 70.
                    </p>

                    <div className="grid grid-cols-3 gap-2 text-center text-xs">
                      {/* Age 62 */}
                      <div className={`p-3 rounded-xl border transition-all ${primaryEnginePlan.primarySsStartAge === 62 ? 'border-primary bg-primary/5' : 'border-border bg-muted/20'}`}>
                        <span className="text-[10px] font-bold text-muted-foreground block">Age 62 (Early)</span>
                        <span className="text-xs font-bold font-mono text-foreground block mt-1">{formatCurrency(ssMatrix.age62.annualBenefit)}/yr</span>
                        <span className="text-[10px] font-mono text-muted-foreground block mt-0.5">Total: {formatCurrency(ssMatrix.age62.lifetimeBenefit)}</span>
                        {onUpdatePlan && (
                          <button
                            onClick={() => handleApplySsAge(62)}
                            className="mt-2 text-[10px] font-bold text-primary hover:underline cursor-pointer"
                          >
                            Set Age 62
                          </button>
                        )}
                      </div>

                      {/* Age 67 */}
                      <div className={`p-3 rounded-xl border transition-all ${primaryEnginePlan.primarySsStartAge === 67 ? 'border-primary bg-primary/5' : 'border-border bg-muted/20'}`}>
                        <span className="text-[10px] font-bold text-muted-foreground block">Age 67 (FRA)</span>
                        <span className="text-xs font-bold font-mono text-foreground block mt-1">{formatCurrency(ssMatrix.age67.annualBenefit)}/yr</span>
                        <span className="text-[10px] font-mono text-muted-foreground block mt-0.5">Total: {formatCurrency(ssMatrix.age67.lifetimeBenefit)}</span>
                        {onUpdatePlan && (
                          <button
                            onClick={() => handleApplySsAge(67)}
                            className="mt-2 text-[10px] font-bold text-primary hover:underline cursor-pointer"
                          >
                            Set Age 67
                          </button>
                        )}
                      </div>

                      {/* Age 70 */}
                      <div className={`p-3 rounded-xl border transition-all ${primaryEnginePlan.primarySsStartAge === 70 ? 'border-primary bg-primary/5' : 'border-border bg-muted/20'}`}>
                        <span className="text-[10px] font-bold text-muted-foreground block">Age 70 (Delayed)</span>
                        <span className="text-xs font-bold font-mono text-emerald-500 block mt-1">{formatCurrency(ssMatrix.age70.annualBenefit)}/yr</span>
                        <span className="text-[10px] font-mono text-muted-foreground block mt-0.5">Total: {formatCurrency(ssMatrix.age70.lifetimeBenefit)}</span>
                        {onUpdatePlan && (
                          <button
                            onClick={() => handleApplySsAge(70)}
                            className="mt-2 text-[10px] font-bold text-primary hover:underline cursor-pointer"
                          >
                            Set Age 70
                          </button>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* TACTIC 2: Roth Conversions & IRMAA Protection */}
                  <div className="bg-card border border-border rounded-xl p-5 space-y-4 shadow-sm">
                    <div className="flex items-center justify-between border-b border-border pb-3">
                      <h4 className="text-sm font-bold text-foreground flex items-center gap-2">
                        <Flame className="w-4 h-4 text-rose-500" />
                        Roth Conversion & IRMAA Strategy
                      </h4>
                      <span className="text-[10px] font-bold text-emerald-600 bg-emerald-500/10 px-2 py-0.5 rounded">
                        IRMAA Safe
                      </span>
                    </div>

                    <p className="text-xs text-muted-foreground">
                      Proactively convert traditional IRA/401(k) funds to tax-free Roth during early retirement to eliminate future RMD tax spikes.
                    </p>

                    <div className="space-y-2 text-xs">
                      <div className="flex items-center justify-between p-2.5 rounded-lg bg-muted/30 border border-border">
                        <div>
                          <span className="font-bold text-foreground block">No Conversions</span>
                          <span className="text-[10px] text-muted-foreground">Standard RMD trajectory</span>
                        </div>
                        <div className="text-right font-mono">
                          <span className="font-bold text-foreground block">{formatCurrency(rothMatrix.noRoth.endNW)}</span>
                          <span className="text-[10px] text-muted-foreground">Max RMD: {formatCurrency(rothMatrix.noRoth.maxRmd)}</span>
                        </div>
                      </div>

                      <div className="flex items-center justify-between p-2.5 rounded-lg bg-emerald-500/5 border border-emerald-500/20">
                        <div>
                          <span className="font-bold text-emerald-500 block">Top of 12% Bracket + IRMAA Safe</span>
                          <span className="text-[10px] text-muted-foreground">Optimal tax-bracket filling</span>
                        </div>
                        <div className="text-right font-mono">
                          <span className="font-bold text-emerald-500 block">{formatCurrency(rothMatrix.top12.endNW)}</span>
                          <span className="text-[10px] text-muted-foreground">Max RMD: {formatCurrency(rothMatrix.top12.maxRmd)}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
