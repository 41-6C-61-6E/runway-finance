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
  TrendingUp,
  ShieldCheck,
  Check,
  CheckCircle2,
  Sparkles,
  Layers,
  HeartHandshake,
  DollarSign,
  Calendar,
  Zap,
  Sliders,
  AlertTriangle,
  Flame,
  ArrowUpRight,
  RefreshCw,
} from 'lucide-react';
import { CollapsibleCardHeader } from '@/components/ui/collapsible-card-header';
import { useCardCollapsed } from '@/lib/hooks/use-card-collapsed';

interface ScenariosTabProps {
  plan: any;
  allPlans?: any[];
  onUpdatePlan?: (updates: any) => void;
}

export function ScenariosTab({ plan, onUpdatePlan }: ScenariosTabProps) {
  const [activeSection, setActiveSection] = useState<'strategies' | 'whatif' | 'tactics'>('strategies');

  // Collapsible card states
  const [isStrategiesCollapsed, setIsStrategiesCollapsed] = useCardCollapsed('scenarios_strategies');
  const [isWhatIfCollapsed, setIsWhatIfCollapsed] = useCardCollapsed('scenarios_whatif');
  const [isTacticsCollapsed, setIsTacticsCollapsed] = useCardCollapsed('scenarios_tactics');

  // What-If Simulator State
  const [whatIfRetirementAge, setWhatIfRetirementAge] = useState<number>(plan?.retirementAge || 60);
  const [whatIfMarketScenario, setWhatIfMarketScenario] = useState<'baseline' | 'bull' | 'bear' | 'crash'>('baseline');
  const [whatIfInflationRate, setWhatIfInflationRate] = useState<number>(parseFloat(plan?.settings?.fixedInflationRate || '3.0'));
  const [whatIfExpenseModifier, setWhatIfExpenseModifier] = useState<number>(0); // % adjustment (-30% to +30%)

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
      },
      {
        id: 'proportional',
        name: 'Proportional (Pro-Rata)',
        description: 'Withdraw proportionally from taxable, pre-tax, and Roth buckets each year.',
        method: 'proportional',
        enableRoth: false,
        summary: propSum,
        color: '#8b5cf6', // purple
      },
      {
        id: 'tax_deferred_first',
        name: 'Tax-Deferred First (Waterfall)',
        description: 'Spend traditional 401(k)/IRA balances early to minimize mandatory RMD tax drag.',
        method: 'tax_deferred_first',
        enableRoth: false,
        summary: defSum,
        color: '#f59e0b', // amber
      },
      {
        id: 'tax_optimized',
        name: 'Tax Bracket Filling',
        description: 'Draw tax-deferred funds up to low bracket limit, then pull remainder from Roth.',
        method: 'tax_optimized',
        enableRoth: false,
        summary: optSum,
        color: '#10b981', // emerald
      },
      {
        id: 'roth_ladder',
        name: 'Roth Conversion Ladder',
        description: 'Execute annual pre-tax conversions to Roth up to top of 12% bracket while avoiding IRMAA cliffs.',
        method: 'textbook',
        enableRoth: true,
        summary: rothSum,
        color: '#ec4899', // pink
      },
    ];
  }, [primaryEnginePlan]);

  // Combined Chart Data for all 5 strategies
  const strategyChartData = useMemo(() => {
    const length = strategiesList[0]?.summary.yearlyResults.length || 0;
    const data = [];

    for (let i = 0; i < length; i++) {
      const yearObj: any = {
        year: strategiesList[0].summary.yearlyResults[i].year,
        age: strategiesList[0].summary.yearlyResults[i].primaryAge,
      };

      strategiesList.forEach((strat) => {
        const res = strat.summary.yearlyResults[i];
        yearObj[strat.id] = Math.round(res?.netWorth || 0);
      });

      data.push(yearObj);
    }
    return data;
  }, [strategiesList]);

  // ── SECTION 2: WHAT-IF STRESS TESTER ──
  const whatIfSim = useMemo(() => {
    const enginePlan: EnginePlan = JSON.parse(JSON.stringify(primaryEnginePlan));

    // Apply What-If Retirement Age
    enginePlan.retirementAge = whatIfRetirementAge;

    // Apply Inflation Rate
    if (enginePlan.settings) {
      enginePlan.settings.fixedInflationRate = whatIfInflationRate;
    }

    // Apply Expense Modifier
    if (whatIfExpenseModifier !== 0) {
      const mod = 1 + (whatIfExpenseModifier / 100);
      enginePlan.events.forEach((ev) => {
        if (ev.category === 'expense') {
          ev.amount = Math.round(ev.amount * mod);
        }
      });
    }

    // Apply Market Return / Crash Scenario
    if (whatIfMarketScenario === 'bull') {
      enginePlan.accounts.forEach((a) => {
        if (a.type !== 'cash') a.expectedGrowthRate = Math.min(15, a.expectedGrowthRate + 2.5);
      });
    } else if (whatIfMarketScenario === 'bear') {
      enginePlan.accounts.forEach((a) => {
        if (a.type !== 'cash') a.expectedGrowthRate = Math.max(1, a.expectedGrowthRate - 2.5);
      });
    } else if (whatIfMarketScenario === 'crash') {
      // Early retirement crash: -25% market return in first 2 years of retirement
      enginePlan.accounts.forEach((a) => {
        if (a.type !== 'cash') a.expectedGrowthRate = 6.0;
      });
    }

    const baselineSim = runRetirementSimulation(primaryEnginePlan);
    const modifiedSim = runRetirementSimulation(enginePlan);

    // If market crash scenario, simulate -25% hit at retirement year
    if (whatIfMarketScenario === 'crash') {
      const retYrIndex = modifiedSim.yearlyResults.findIndex((y) => y.primaryAge === whatIfRetirementAge);
      if (retYrIndex !== -1) {
        for (let i = retYrIndex; i < Math.min(retYrIndex + 2, modifiedSim.yearlyResults.length); i++) {
          modifiedSim.yearlyResults[i].netWorth *= 0.75;
        }
      }
    }

    const baseEndNW = baselineSim.yearlyResults[baselineSim.yearlyResults.length - 1]?.netWorth || 0;
    const modEndNW = modifiedSim.yearlyResults[modifiedSim.yearlyResults.length - 1]?.netWorth || 0;
    const deltaNW = modEndNW - baseEndNW;

    const baseTaxes = baselineSim.yearlyResults.reduce((s, y) => s + y.taxesPaid, 0);
    const modTaxes = modifiedSim.yearlyResults.reduce((s, y) => s + y.taxesPaid, 0);
    const deltaTaxes = modTaxes - baseTaxes;

    const chartData = baselineSim.yearlyResults.map((y, idx) => ({
      year: y.year,
      age: y.primaryAge,
      baselineNW: Math.round(y.netWorth),
      whatIfNW: Math.round(modifiedSim.yearlyResults[idx]?.netWorth || 0),
    }));

    return {
      baselineSim,
      modifiedSim,
      baseEndNW,
      modEndNW,
      deltaNW,
      baseTaxes,
      modTaxes,
      deltaTaxes,
      chartData,
    };
  }, [primaryEnginePlan, whatIfRetirementAge, whatIfMarketScenario, whatIfInflationRate, whatIfExpenseModifier]);

  // ── SECTION 3: RETIREMENT TACTICS & TAX MATRIX ──
  const ssMatrix = useMemo(() => {
    const plan62 = { ...primaryEnginePlan, primarySsStartAge: 62 };
    const plan67 = { ...primaryEnginePlan, primarySsStartAge: 67 };
    const plan70 = { ...primaryEnginePlan, primarySsStartAge: 70 };

    const sim62 = runRetirementSimulation(plan62);
    const sim67 = runRetirementSimulation(plan67);
    const sim70 = runRetirementSimulation(plan70);

    const getSsMetrics = (sim: any, age: number) => {
      const endNW = sim.yearlyResults[sim.yearlyResults.length - 1]?.netWorth || 0;
      const totalTaxes = sim.yearlyResults.reduce((s: number, y: any) => s + y.taxesPaid, 0);
      const monthly = (primaryEnginePlan.primarySsMonthlyAmount || 2500);
      const multiplier = age === 62 ? 0.70 : age === 67 ? 1.0 : 1.24;
      const annualBenefit = Math.round(monthly * 12 * multiplier);
      const yearsClaimed = Math.max(0, primaryEnginePlan.lifeExpectancyAge - age);
      const lifetimeBenefit = annualBenefit * yearsClaimed;
      return { age, annualBenefit, lifetimeBenefit, endNW, totalTaxes };
    };

    return {
      age62: getSsMetrics(sim62, 62),
      age67: getSsMetrics(sim67, 67),
      age70: getSsMetrics(sim70, 70),
    };
  }, [primaryEnginePlan]);

  const rothMatrix = useMemo(() => {
    const planNoRoth = {
      ...primaryEnginePlan,
      settings: { ...primaryEnginePlan.settings, enableRothConversions: false },
    };
    const plan12Pct = {
      ...primaryEnginePlan,
      settings: {
        ...primaryEnginePlan.settings,
        enableRothConversions: true,
        rothConversionTargetCeiling: 'top_of_12' as const,
        avoidIrmaaCliffs: true,
      },
    };
    const plan22Pct = {
      ...primaryEnginePlan,
      settings: {
        ...primaryEnginePlan.settings,
        enableRothConversions: true,
        rothConversionTargetCeiling: 'top_of_22' as const,
        avoidIrmaaCliffs: false,
      },
    };

    const simNoRoth = runRetirementSimulation(planNoRoth);
    const sim12 = runRetirementSimulation(plan12Pct);
    const sim22 = runRetirementSimulation(plan22Pct);

    const getRothSummary = (sim: any) => {
      const endNW = sim.yearlyResults[sim.yearlyResults.length - 1]?.netWorth || 0;
      const totalTaxes = sim.yearlyResults.reduce((s: number, y: any) => s + y.taxesPaid, 0);
      const maxRmd = Math.max(...sim.yearlyResults.map((y: any) => y.rmdAmount || 0));
      return { endNW, totalTaxes, maxRmd };
    };

    return {
      noRoth: getRothSummary(simNoRoth),
      top12: getRothSummary(sim12),
      top22: getRothSummary(sim22),
    };
  }, [primaryEnginePlan]);

  // Handle Strategy Apply CTA
  const handleApplyStrategy = (strat: any) => {
    if (!onUpdatePlan) return;

    if (strat.id === 'roth_ladder') {
      onUpdatePlan({
        withdrawalMethod: 'textbook',
        settings: {
          ...plan?.settings,
          withdrawalMethod: 'textbook',
          enableRothConversions: true,
          rothConversionTargetCeiling: 'top_of_12',
          avoidIrmaaCliffs: true,
        },
      });
    } else {
      onUpdatePlan({
        withdrawalMethod: strat.method,
        settings: {
          ...plan?.settings,
          withdrawalMethod: strat.method,
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
            onClick={() => setActiveSection('whatif')}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer ${
              activeSection === 'whatif'
                ? 'bg-primary text-primary-foreground shadow-md'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
            }`}
          >
            <Sliders className="w-4 h-4" />
            What-If Stress Tester
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
              description="Simulate and compare 5 distinct withdrawal ordering methods directly on your plan"
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

                        return (
                          <tr key={strat.id} className={`hover:bg-muted/30 transition-colors ${isCurrentActive ? 'bg-primary/5 font-medium' : ''}`}>
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-2">
                                <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: strat.color }} />
                                <div>
                                  <span className="font-bold text-foreground block">{strat.name}</span>
                                  <span className="text-[10px] text-muted-foreground">{strat.description}</span>
                                </div>
                              </div>
                            </td>
                            <td className={`px-3 py-3 text-right font-mono font-bold ${isHighestNW ? 'text-emerald-500' : 'text-foreground'}`}>
                              {formatCurrency(strat.summary.endNW)}
                            </td>
                            <td className="px-3 py-3 text-right font-mono text-muted-foreground">
                              {formatCurrency(strat.summary.totalTaxes)}
                            </td>
                            <td className="px-3 py-3 text-right font-mono text-amber-500 font-semibold">
                              {formatCurrency(strat.summary.maxRmd)}
                            </td>
                            <td className="px-3 py-3 text-center">
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
                            </td>
                            <td className="px-4 py-3 text-right">
                              {!isCurrentActive && onUpdatePlan && (
                                <button
                                  onClick={() => handleApplyStrategy(strat)}
                                  className="bg-primary/10 hover:bg-primary text-primary hover:text-primary-foreground text-[11px] font-bold px-3 py-1.5 rounded-lg transition-all cursor-pointer"
                                >
                                  Apply Strategy
                                </button>
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

      {/* SECTION 2: WHAT-IF INTERACTIVE STRESS TESTER */}
      {activeSection === 'whatif' && (
        <div className="space-y-6">
          <div className="bg-card border border-border rounded-2xl shadow-sm overflow-hidden">
            <CollapsibleCardHeader
              title="What-If Real-Time Stress Simulator"
              description="Test economic shocks, retirement age shifts, and expense changes on your plan"
              icon={Sliders}
              isCollapsed={isWhatIfCollapsed}
              onToggle={() => setIsWhatIfCollapsed(!isWhatIfCollapsed)}
            />

            {!isWhatIfCollapsed && (
              <div className="p-5 space-y-6">
                {/* Interactive Controls Bar */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 bg-muted/30 border border-border p-4 rounded-xl text-xs">
                  {/* Slider 1: Target Retirement Age */}
                  <div className="space-y-2">
                    <div className="flex justify-between items-center">
                      <label className="font-semibold text-muted-foreground">Target Retirement Age</label>
                      <span className="font-mono font-bold text-primary text-sm">{whatIfRetirementAge}</span>
                    </div>
                    <input
                      type="range"
                      min={45}
                      max={75}
                      step={1}
                      value={whatIfRetirementAge}
                      onChange={(e) => setWhatIfRetirementAge(parseInt(e.target.value, 10))}
                      className="w-full accent-primary cursor-pointer h-1.5 bg-muted rounded-lg"
                    />
                    <span className="text-[10px] text-muted-foreground block">Baseline: {primaryEnginePlan.retirementAge} yrs</span>
                  </div>

                  {/* Option 2: Market Scenario */}
                  <div className="space-y-2">
                    <label className="font-semibold text-muted-foreground block">Market Return Scenario</label>
                    <select
                      value={whatIfMarketScenario}
                      onChange={(e: any) => setWhatIfMarketScenario(e.target.value)}
                      className="w-full bg-background border border-border rounded-lg px-2.5 py-1.5 text-xs text-foreground font-medium focus:ring-1 focus:ring-primary"
                    >
                      <option value="baseline">Baseline Expected (7.0%)</option>
                      <option value="bull">Bull Market (+9.5%)</option>
                      <option value="bear">Bear Market (+4.5%)</option>
                      <option value="crash">Early Retirement Crash (-25% Shock)</option>
                    </select>
                    <span className="text-[10px] text-muted-foreground block">Simulates sequence of returns</span>
                  </div>

                  {/* Slider 3: Inflation Rate */}
                  <div className="space-y-2">
                    <div className="flex justify-between items-center">
                      <label className="font-semibold text-muted-foreground">Inflation Rate (%)</label>
                      <span className="font-mono font-bold text-primary text-sm">{whatIfInflationRate.toFixed(1)}%</span>
                    </div>
                    <input
                      type="range"
                      min={1.5}
                      max={6.5}
                      step={0.5}
                      value={whatIfInflationRate}
                      onChange={(e) => setWhatIfInflationRate(parseFloat(e.target.value))}
                      className="w-full accent-primary cursor-pointer h-1.5 bg-muted rounded-lg"
                    />
                    <span className="text-[10px] text-muted-foreground block">Baseline: 3.0%</span>
                  </div>

                  {/* Slider 4: Expense Shock */}
                  <div className="space-y-2">
                    <div className="flex justify-between items-center">
                      <label className="font-semibold text-muted-foreground">Expense Modifier</label>
                      <span className={`font-mono font-bold text-sm ${whatIfExpenseModifier > 0 ? 'text-rose-500' : whatIfExpenseModifier < 0 ? 'text-emerald-500' : 'text-primary'}`}>
                        {whatIfExpenseModifier > 0 ? `+${whatIfExpenseModifier}%` : `${whatIfExpenseModifier}%`}
                      </span>
                    </div>
                    <input
                      type="range"
                      min={-30}
                      max={30}
                      step={5}
                      value={whatIfExpenseModifier}
                      onChange={(e) => setWhatIfExpenseModifier(parseInt(e.target.value, 10))}
                      className="w-full accent-primary cursor-pointer h-1.5 bg-muted rounded-lg"
                    />
                    <span className="text-[10px] text-muted-foreground block">Adjusts living expenses</span>
                  </div>
                </div>

                {/* What-If Summary Impact Cards */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="bg-card border border-border p-4 rounded-xl space-y-1 shadow-sm">
                    <span className="text-[11px] font-semibold text-muted-foreground">Ending Net Worth (Age {primaryEnginePlan.lifeExpectancyAge})</span>
                    <div className="flex items-baseline gap-2">
                      <span className="text-lg font-bold font-mono text-foreground">{formatCurrency(whatIfSim.modEndNW)}</span>
                      <span className={`text-xs font-mono font-bold ${whatIfSim.deltaNW >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                        {whatIfSim.deltaNW >= 0 ? `+${formatCurrency(whatIfSim.deltaNW)}` : formatCurrency(whatIfSim.deltaNW)}
                      </span>
                    </div>
                  </div>

                  <div className="bg-card border border-border p-4 rounded-xl space-y-1 shadow-sm">
                    <span className="text-[11px] font-semibold text-muted-foreground">Lifetime Taxes Paid</span>
                    <div className="flex items-baseline gap-2">
                      <span className="text-lg font-bold font-mono text-foreground">{formatCurrency(whatIfSim.modTaxes)}</span>
                      <span className={`text-xs font-mono font-bold ${whatIfSim.deltaTaxes <= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                        {whatIfSim.deltaTaxes <= 0 ? formatCurrency(whatIfSim.deltaTaxes) : `+${formatCurrency(whatIfSim.deltaTaxes)}`}
                      </span>
                    </div>
                  </div>

                  <div className="bg-card border border-border p-4 rounded-xl space-y-1 shadow-sm flex items-center justify-between">
                    <div>
                      <span className="text-[11px] font-semibold text-muted-foreground block">Plan Longevity</span>
                      <span className={`text-base font-bold font-mono ${whatIfSim.modEndNW > 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                        {whatIfSim.modEndNW > 0 ? '100% Fully Funded' : 'Depletes Before Target'}
                      </span>
                    </div>
                    {whatIfSim.modEndNW <= 0 && <AlertTriangle className="w-5 h-5 text-rose-500 shrink-0" />}
                  </div>
                </div>

                {/* Trajectory Overlay Chart: Baseline vs What-If */}
                <div className="space-y-2">
                  <h4 className="text-xs font-bold text-foreground">Baseline vs What-If Trajectory</h4>
                  <div className="h-64 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={whatIfSim.chartData}>
                        <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
                        <XAxis dataKey="age" stroke="#888888" fontSize={11} tickLine={false} />
                        <YAxis stroke="#888888" fontSize={10} tickFormatter={(v) => `$${(v / 1000000).toFixed(1)}M`} tickLine={false} />
                        <Tooltip formatter={(value: any) => [formatCurrency(Number(value)), 'Net Worth']} labelFormatter={(l) => `Age ${l}`} />
                        <Legend wrapperStyle={{ fontSize: '11px' }} />
                        <Line type="monotone" dataKey="baselineNW" name="Baseline Plan" stroke="#94a3b8" strokeWidth={2} strokeDasharray="4 4" dot={false} />
                        <Line type="monotone" dataKey="whatIfNW" name="What-If Stress Scenario" stroke="#3b82f6" strokeWidth={3} dot={false} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* SECTION 3: RETIREMENT TACTICS & TAX MATRIX */}
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
