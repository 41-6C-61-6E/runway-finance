'use client';

import { useState, useMemo, useEffect } from 'react';
import { formatCurrency } from '@/lib/utils/format';
import { runRetirementSimulation, EnginePlan } from '@/lib/services/retirement-engine';
import { runMonteCarloSimulation } from '@/lib/services/monte-carlo';
import { DEFAULT_2026_RULES } from '@/lib/constants/retirement-defaults';
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  ComposedChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Legend,
  ReferenceLine,
  ReferenceDot,
} from 'recharts';
import {
  TrendingUp,
  Flame,
  Target,
  Calendar,
  Clock,
  Palmtree,
  ShieldCheck,
  ChevronDown,
  ChevronUp,
  DollarSign,
  Award,
  Landmark,
  Layers,
  Sparkles,
  ArrowDownCircle,
  HelpCircle,
  Flag,
  Activity,
  Percent,
  ShieldAlert,
  Scale,
} from 'lucide-react';

interface ProjectionTabProps {
  plan: any;
  accounts: any[];
  onUpdatePlan: (updates: any) => void;
}

export function ProjectionTab({ plan, accounts, onUpdatePlan }: ProjectionTabProps) {
  const [showYearlyTable, setShowYearlyTable] = useState(false);
  const [showDrawdownDetails, setShowDrawdownDetails] = useState(true);
  const [localRetirementAge, setLocalRetirementAge] = useState(Number(plan?.retirementAge) || 60);
  const [localReturnRate, setLocalReturnRate] = useState(7);
  const [localInflationRate, setLocalInflationRate] = useState(3.0);
  const [localExpenseModifier, setLocalExpenseModifier] = useState(0);

  // New Phase 3 UX toggles: Nominal vs Real dollars & Deterministic vs Monte Carlo
  const [dollarMode, setDollarMode] = useState<'nominal' | 'real'>('nominal');
  const [viewMode, setViewMode] = useState<'deterministic' | 'monte_carlo'>('deterministic');

  // Sync local retirement age state when plan changes
  useEffect(() => {
    if (plan?.retirementAge) {
      setLocalRetirementAge(Number(plan.retirementAge));
    }
  }, [plan?.retirementAge]);

  const birthYear = Number(plan?.primaryBirthYear) || 1985;
  const currentYear = new Date().getFullYear();
  const currentAge = currentYear - birthYear;

  // Compute current net worth from included plan accounts
  const currentNetWorth = useMemo(() => {
    if (Array.isArray(plan?.accounts) && plan.accounts.length > 0) {
      return plan.accounts
        .filter((acc: any) => acc.isIncluded !== false)
        .reduce((sum: number, acc: any) => sum + (parseFloat(acc.balance) || 0), 0);
    }
    let assets = 0;
    let liabilities = 0;
    for (const acc of accounts) {
      const bal = parseFloat(acc.balance) || 0;
      if (['credit_card', 'loan', 'mortgage', 'car_loan'].includes(acc.type) || bal < 0) {
        liabilities += Math.abs(bal);
      } else {
        assets += bal;
      }
    }
    return assets - liabilities;
  }, [plan, accounts]);

  // Construct EnginePlan object dynamically reacting to sliders
  const enginePlanObj = useMemo(() => {
    if (!plan) return null;

    const planAccountsList = Array.isArray(plan.accounts) ? plan.accounts : [];
    const planEventsList = Array.isArray(plan.events) ? plan.events : [];
    const planFlowsList = Array.isArray(plan.flows) ? plan.flows : [];

    const activeAccounts = planAccountsList.filter((a: any) => a.isIncluded !== false);

    const ep: EnginePlan = {
      id: plan.id || 'plan_dynamic',
      name: plan.name || 'FIRE Plan',
      hasSpouse: Boolean(plan.hasSpouse),
      primaryBirthYear: Number(plan.primaryBirthYear) || 1985,
      primaryBirthMonth: Number(plan.primaryBirthMonth) || 1,
      spouseBirthYear: plan.spouseBirthYear ? Number(plan.spouseBirthYear) : undefined,
      spouseBirthMonth: plan.spouseBirthMonth ? Number(plan.spouseBirthMonth) : undefined,
      spouseName: plan.spouseName || 'Spouse / Partner',
      spouseRetirementAge: plan.spouseRetirementAge ? Number(plan.spouseRetirementAge) : 60,
      spouseLifeExpectancyAge: plan.spouseLifeExpectancyAge ? Number(plan.spouseLifeExpectancyAge) : 100,
      primarySsMonthlyAmount: plan.primarySsMonthlyAmount ? parseFloat(plan.primarySsMonthlyAmount) : 2500,
      primarySsStartAge: plan.primarySsStartAge ? Number(plan.primarySsStartAge) : 67,
      spouseSsMonthlyAmount: plan.spouseSsMonthlyAmount ? parseFloat(plan.spouseSsMonthlyAmount) : 2000,
      spouseSsStartAge: plan.spouseSsStartAge ? Number(plan.spouseSsStartAge) : 67,
      enableSpousalSsBenefit: plan.enableSpousalSsBenefit !== false,
      filingStatus: plan.filingStatus || 'single',
      retirementAge: localRetirementAge, // Dynamic slider override
      lifeExpectancyAge: Number(plan.lifeExpectancyAge) || 100,
      withdrawalMethod: plan.settings?.withdrawalMethod || plan.withdrawalMethod || 'textbook',
      customWithdrawalOrder: Array.isArray(plan.customWithdrawalOrder) ? plan.customWithdrawalOrder : undefined,
      accounts: activeAccounts.map((a: any) => ({
        id: a.id,
        name: a.name,
        type: a.type,
        owner: a.owner || 'primary',
        balance: parseFloat(a.balance) || 0,
        costBasis: parseFloat(a.costBasis) || 0,
        expectedGrowthRate: localReturnRate, // Dynamic slider override
        dividendYield: parseFloat(a.dividendYield) || 2.0,
        reinvestDividends: a.reinvestDividends !== false,
        qualifiedDividendRatio: parseFloat(a.qualifiedDividendRatio) || 1.0,
        rothPercentage: a.rothPercentage,
      })),
      liabilities: [],
      events: planEventsList.map((e: any) => {
        let amt = parseFloat(e.amount) || 0;
        if (e.category === 'expense' && localExpenseModifier !== 0) {
          amt *= (1 + localExpenseModifier / 100);
        }
        return {
          id: e.id,
          name: e.name,
          category: e.category as any,
          type: e.type,
          owner: e.owner || 'primary',
          amount: amt,
          frequency: e.frequency as any,
          growthRate: parseFloat(e.growthRate) || 0,
          adjustForInflation: e.adjustForInflation !== false,
          startTriggerType: e.startTriggerType || 'now',
          startTriggerValue: e.startTriggerValue,
          endTriggerType: e.endTriggerType || 'retirement',
          endTriggerValue: e.endTriggerValue,
        };
      }),
      flows: planFlowsList.map((f: any) => ({
        id: f.id,
        name: f.name,
        type: f.type as any,
        rank: f.rank || 1,
        targetAccountId: f.targetAccountId,
        ruleType: f.ruleType as any,
        ruleValue: f.ruleValue ? parseFloat(f.ruleValue) : undefined,
        matchRate: f.matchRate ? parseFloat(f.matchRate) : undefined,
        matchLimit: f.matchLimit ? parseFloat(f.matchLimit) : undefined,
        matchAccountId: f.matchAccountId,
      })),
      settings: {
        fixedInflationRate: localInflationRate,
        withholdingDeferred: parseFloat(plan.settings?.withholdingDeferred || '20.0'),
        withholdingTaxable: parseFloat(plan.settings?.withholdingTaxable || '10.0'),
        incomeTaxModifier: parseFloat(plan.settings?.incomeTaxModifier || '0.0'),
        capGainsTaxModifier: parseFloat(plan.settings?.capGainsTaxModifier || '0.0'),
        heirFlatIncomeTaxRate: parseFloat(plan.settings?.heirFlatIncomeTaxRate || '25.0'),
        stepUpBasis: plan.settings?.stepUpBasis ?? true,
        realEstateLiquidationRate: parseFloat(plan.settings?.realEstateLiquidationRate || '6.0'),
        administrativeCostRate: parseFloat(plan.settings?.administrativeCostRate || '1.0'),
        charitableGiving: parseFloat(plan.settings?.charitableGiving || '0.0'),
        withdrawalMethod: plan.settings?.withdrawalMethod || plan.withdrawalMethod || 'textbook',
        enableRothConversions: Boolean(plan.settings?.enableRothConversions),
        rothConversionTargetCeiling: plan.settings?.rothConversionTargetCeiling || 'top_of_12',
        avoidIrmaaCliffs: Boolean(plan.settings?.avoidIrmaaCliffs),
      },
      rules: plan.rules || DEFAULT_2026_RULES,
    };

    return ep;
  }, [plan, localRetirementAge, localReturnRate, localInflationRate, localExpenseModifier]);

  const simulation = useMemo(() => {
    if (!enginePlanObj) return null;
    return runRetirementSimulation(enginePlanObj);
  }, [enginePlanObj]);

  // Monte Carlo output for probabilistic fan chart
  const monteCarloOutput = useMemo(() => {
    if (viewMode !== 'monte_carlo' || !enginePlanObj) return null;
    return runMonteCarloSimulation(enginePlanObj, {
      numberOfTrials: 250,
      model: 'historical_bootstrap',
      adjustForInflation: dollarMode === 'real',
      fixedInflationRate: localInflationRate,
    });
  }, [viewMode, enginePlanObj, dollarMode, localInflationRate]);

  const yearlySimResults = useMemo(() => simulation?.yearlyResults || [], [simulation]);

  // Rich Milestone Callouts Data
  const milestoneCallouts = useMemo(() => {
    const list = [
      {
        age: 50,
        title: 'Catch-up Limits',
        year: birthYear + 50,
        icon: Award,
        emoji: '💡',
        color: 'text-blue-500',
        stroke: '#3b82f6',
        note: 'IRA +$1k & 401(k) +$7.5k annual catch-up limits unlocked',
      },
      {
        age: 55,
        title: 'Rule of 55 Access',
        year: birthYear + 55,
        icon: Clock,
        emoji: '⏳',
        color: 'text-amber-500',
        stroke: '#f59e0b',
        note: 'Penalty-free 401(k) separations allowed if separated from service',
      },
      {
        age: localRetirementAge,
        title: 'Retirement Transition',
        year: birthYear + localRetirementAge,
        icon: Palmtree,
        emoji: '🌴',
        color: 'text-emerald-500',
        stroke: '#10b981',
        note: 'Primary career end • Distribution phase begins',
      },
      {
        age: 65,
        title: 'Medicare Eligibility',
        year: birthYear + 65,
        icon: ShieldCheck,
        emoji: '🛡️',
        color: 'text-purple-500',
        stroke: '#a855f7',
        note: 'Transition to Medicare Part B/D • ACA subsidies end',
      },
      {
        age: 67,
        title: 'Full Social Security',
        year: birthYear + 67,
        icon: Landmark,
        emoji: '🏛️',
        color: 'text-cyan-500',
        stroke: '#06b6d4',
        note: '100% Full Retirement Age SS benefit payout',
      },
      {
        age: 73,
        title: 'RMD Mandatory Start',
        year: birthYear + 73,
        icon: Flag,
        emoji: '🚩',
        color: 'text-rose-500',
        stroke: '#f43f5e',
        note: 'Required Minimum Distributions start for tax-deferred accounts',
      },
    ];
    return list.filter((m) => m.age >= currentAge && m.age <= (plan?.lifeExpectancyAge || 100));
  }, [birthYear, localRetirementAge, currentAge, plan?.lifeExpectancyAge]);

  const milestoneMap = useMemo(() => {
    const map: Record<number, any> = {};
    for (const m of milestoneCallouts) {
      map[m.age] = m;
    }
    return map;
  }, [milestoneCallouts]);

  // Strategy description tag
  const activeStrategyLabel = useMemo(() => {
    const method = plan?.settings?.withdrawalMethod || plan?.withdrawalMethod || 'textbook';
    if (method === 'tax_optimized') return 'Tax-Bracket Shielding (Fill 12% Bracket First)';
    if (method === 'proportional') return 'Proportional Drawdown Across Portfolio';
    if (method === 'custom_order') return 'Custom Priority Order';
    return 'Textbook Waterfall (Cash → Taxable → Traditional → Roth)';
  }, [plan]);

  // Chart data series mapped dynamically with Real vs. Nominal support & Expenses throughout timeline
  const chartData = useMemo(() => {
    if (yearlySimResults.length > 0) {
      return yearlySimResults.map((y: any, idx: number) => {
        const discountFactor = dollarMode === 'real' ? Math.pow(1 + (localInflationRate / 100), idx) : 1;

        const cashD = Math.round((y.drawdownsByType?.cash || 0) / discountFactor);
        const taxD = Math.round((y.drawdownsByType?.taxable || 0) / discountFactor);
        const tradD = Math.round((y.drawdownsByType?.traditional || 0) / discountFactor);
        const rothD = Math.round((y.drawdownsByType?.roth || 0) / discountFactor);
        const hsaD = Math.round((y.drawdownsByType?.hsa || 0) / discountFactor);
        const actualDrawdowns = cashD + taxD + tradD + rothD + hsaD;
        const nw = Math.round(y.netWorth / discountFactor);
        const withdrawRate = actualDrawdowns > 0 && (nw + actualDrawdowns) > 0
          ? (actualDrawdowns / (nw + actualDrawdowns)) * 100
          : 0;

        return {
          year: y.year,
          age: y.primaryAge,
          spouseAge: y.spouseAge,
          label: `${y.year}`,
          netWorth: nw,
          income: Math.round(y.grossIncome / discountFactor),
          expenses: y.primaryAge >= localRetirementAge ? Math.round(y.totalExpenses / discountFactor) : null,
          isRetired: y.primaryAge >= localRetirementAge,
          salaryIncome: Math.round((y.salaryIncome || 0) / discountFactor),
          ssIncome: Math.round((y.ssIncome || 0) / discountFactor),
          pensionIncome: Math.round((y.pensionIncome || 0) / discountFactor),
          otherIncome: Math.round((y.otherIncome || 0) / discountFactor),
          cashDrawdown: cashD,
          taxableDrawdown: taxD,
          traditionalDrawdown: tradD,
          rothDrawdown: rothD,
          hsaDrawdown: hsaD,
          actualDrawdowns,
          totalDrawdown: Math.round((y.deficitWithdrawn || 0) / discountFactor),
          withdrawalRate: Math.round(withdrawRate * 10) / 10,
          rothConversionAmount: Math.round((y.rothConversionAmount || 0) / discountFactor),
          magi: Math.round((y.magi || 0) / discountFactor),
          taxesPaid: Math.round((y.taxesPaid || 0) / discountFactor),
          effectiveTaxRate: y.effectiveTaxRate || 0,
          irmaaSurchargeAnnual: Math.round((y.irmaaSurchargeAnnual || 0) / discountFactor),
          accountDrawdowns: y.accountDrawdowns || [],
          milestone: milestoneMap[y.primaryAge],
        };
      });
    }
    return [];
  }, [yearlySimResults, localRetirementAge, milestoneMap, dollarMode, localInflationRate]);

  // Monte Carlo chart data format
  const monteCarloChartData = useMemo(() => {
    if (!monteCarloOutput) return [];
    const p = monteCarloOutput.percentiles;
    return p.years.map((year, idx) => ({
      year,
      age: currentAge + idx,
      p10: Math.round(p.p10[idx]),
      p25: Math.round(p.p25[idx]),
      p50: Math.round(p.p50[idx]),
      p75: Math.round(p.p75[idx]),
      p90: Math.round(p.p90[idx]),
    }));
  }, [monteCarloOutput, currentAge]);

  // Fix FIRE Target: Sum ALL expense events, not just the first one
  const totalAnnualExpensesFromPlan = useMemo(() => {
    if (!plan?.events || plan.events.length === 0) return 42500;
    const expenseEvents = plan.events.filter((e: any) => e.category === 'expense');
    if (expenseEvents.length === 0) return 42500;
    const rawSum = expenseEvents.reduce((sum: number, e: any) => sum + (parseFloat(e.amount) || 0), 0);
    return rawSum * (1 + localExpenseModifier / 100);
  }, [plan?.events, localExpenseModifier]);

  const fireNumber = totalAnnualExpensesFromPlan * (plan?.fiTargetMultiplier || 25);
  const fireProgress = fireNumber > 0 ? Math.min(100, (currentNetWorth / fireNumber) * 100) : 0;
  const yearsToFire = chartData.findIndex((d) => d.netWorth >= fireNumber);
  const yearsToFireDisplay = yearsToFire >= 0 ? yearsToFire : '—';
  const peakWithdrawalRate = Math.max(0, ...chartData.filter((d) => d.isRetired).map((d) => d.withdrawalRate));

  const retirementDataPoint = chartData.find((d) => d.age === localRetirementAge);
  const netWorthAtRetirement = retirementDataPoint?.netWorth || 0;

  // Plan Health Scorecard
  const planHealth = useMemo(() => {
    const depleted = simulation?.depletionAge !== undefined || !simulation?.success;
    if (depleted) {
      return {
        status: 'High Risk / Depletes',
        badge: 'bg-rose-500/10 text-rose-500 border-rose-500/20',
        desc: `Portfolio depletes at age ${simulation?.depletionAge || localRetirementAge}`,
        score: 'D',
      };
    }
    if (peakWithdrawalRate > 5.5) {
      return {
        status: 'Elevated Risk',
        badge: 'bg-amber-500/10 text-amber-500 border-amber-500/20',
        desc: `Peak withdrawal rate (${peakWithdrawalRate.toFixed(1)}%) exceeds 5.5% threshold`,
        score: 'C',
      };
    }
    if (peakWithdrawalRate > 3.8) {
      return {
        status: 'Sustainable Plan',
        badge: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20',
        desc: `Peak withdrawal rate (${peakWithdrawalRate.toFixed(1)}%) fits 4% FIRE safety guidelines`,
        score: 'B+',
      };
    }
    return {
      status: 'Optimal Health',
      badge: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
      desc: `Low withdrawal rate (${peakWithdrawalRate.toFixed(1)}%) with strong legacy growth buffer`,
      score: 'A+',
    };
  }, [simulation, peakWithdrawalRate, localRetirementAge]);

  return (
    <div className="space-y-6 max-w-5xl">
      {/* View Mode & Dollar Mode Toolbar Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-card border border-border rounded-xl p-3.5 shadow-sm">
        <div className="flex items-center gap-2">
          <div className="bg-primary/10 p-1.5 rounded-lg text-primary">
            <Activity className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-xs font-bold text-foreground">Projection Controls</h3>
            <p className="text-[10px] text-muted-foreground">Adjust valuation currency & model type</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs font-medium">
          {/* Nominal vs Real Dollars Toggle */}
          <div className="flex items-center bg-muted/50 rounded-lg p-0.5 border border-border">
            <button
              onClick={() => setDollarMode('nominal')}
              className={`px-2.5 py-1 rounded-md text-[11px] font-bold transition-all ${
                dollarMode === 'nominal' ? 'bg-card text-foreground shadow-xs' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              Nominal ($)
            </button>
            <button
              onClick={() => setDollarMode('real')}
              className={`px-2.5 py-1 rounded-md text-[11px] font-bold transition-all ${
                dollarMode === 'real' ? 'bg-card text-primary shadow-xs' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              Real (Today's $)
            </button>
          </div>

          {/* Deterministic vs Monte Carlo Toggle */}
          <div className="flex items-center bg-muted/50 rounded-lg p-0.5 border border-border">
            <button
              onClick={() => setViewMode('deterministic')}
              className={`px-2.5 py-1 rounded-md text-[11px] font-bold transition-all ${
                viewMode === 'deterministic' ? 'bg-card text-foreground shadow-xs' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              Deterministic
            </button>
            <button
              onClick={() => setViewMode('monte_carlo')}
              className={`px-2.5 py-1 rounded-md text-[11px] font-bold transition-all ${
                viewMode === 'monte_carlo' ? 'bg-card text-amber-500 shadow-xs' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              Monte Carlo (250 Trials)
            </button>
          </div>
        </div>
      </div>

      {/* Top Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
        <div className="bg-card border border-border rounded-xl p-3.5 shadow-sm space-y-1">
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <DollarSign className="w-3.5 h-3.5" />
            <span className="text-[11px] font-semibold uppercase tracking-wider">Current Net Worth</span>
          </div>
          <p className="text-lg font-extrabold text-foreground font-mono">{formatCurrency(currentNetWorth)}</p>
        </div>

        <div className="bg-card border border-border rounded-xl p-3.5 shadow-sm space-y-1">
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <Palmtree className="w-3.5 h-3.5" />
            <span className="text-[11px] font-semibold uppercase tracking-wider">At Retirement ({localRetirementAge})</span>
          </div>
          <p className="text-lg font-extrabold text-emerald-500 font-mono">{formatCurrency(netWorthAtRetirement)}</p>
          {peakWithdrawalRate > 0 && (
            <p className={`text-[10px] font-bold font-mono ${peakWithdrawalRate > 5 ? 'text-rose-500' : peakWithdrawalRate > 3.5 ? 'text-amber-500' : 'text-emerald-500'}`}>
              Peak Withdraw: {peakWithdrawalRate.toFixed(1)}%
            </p>
          )}
        </div>

        <div className="bg-card border border-border rounded-xl p-3.5 shadow-sm space-y-1">
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <Target className="w-3.5 h-3.5" />
            <span className="text-[11px] font-semibold uppercase tracking-wider">FIRE Target ({plan?.fiTargetMultiplier || 25}×)</span>
          </div>
          <p className="text-lg font-extrabold text-primary font-mono">{formatCurrency(fireNumber)}</p>
          <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden">
            <div
              className="h-full bg-primary rounded-full transition-all duration-500"
              style={{ width: `${Math.min(100, fireProgress)}%` }}
            />
          </div>
          <p className="text-[10px] text-muted-foreground font-medium">{fireProgress.toFixed(0)}% of target</p>
        </div>

        <div className="bg-card border border-border rounded-xl p-3.5 shadow-sm space-y-1">
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <Clock className="w-3.5 h-3.5" />
            <span className="text-[11px] font-semibold uppercase tracking-wider">Years to FIRE</span>
          </div>
          <p className="text-lg font-extrabold text-foreground font-mono">{yearsToFireDisplay}</p>
          {simulation?.success !== undefined && (
            <div
              className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                simulation.success
                  ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20'
                  : 'bg-rose-500/10 text-rose-500 border-rose-500/20'
              }`}
            >
              <ShieldCheck className="w-3 h-3" />
              {simulation.success ? 'Succeeds' : `Depletes Age ${simulation.depletionAge}`}
            </div>
          )}
        </div>

        {/* Plan Health Score Card */}
        <div className="bg-card border border-border rounded-xl p-3.5 shadow-sm space-y-1">
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <Scale className="w-3.5 h-3.5" />
            <span className="text-[11px] font-semibold uppercase tracking-wider">Plan Health</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-lg font-extrabold text-foreground font-mono">{planHealth.score}</span>
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${planHealth.badge}`}>
              {planHealth.status}
            </span>
          </div>
          <p className="text-[10px] text-muted-foreground leading-snug line-clamp-1">{planHealth.desc}</p>
        </div>
      </div>

      {/* Main Chart Area: Deterministic vs Monte Carlo Fan Chart */}
      <div className="bg-card border border-border rounded-xl p-5 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-bold text-foreground flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-primary" />
              {viewMode === 'monte_carlo' ? 'Monte Carlo Probabilistic Fan Chart (250 Historical Bootstrap Trials)' : 'FIRE Portfolio Net Worth Trajectory'}
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Age {currentAge} → {plan?.lifeExpectancyAge || 100} • {dollarMode === 'real' ? 'Real (Inflation-Adjusted Today\'s Dollars)' : 'Nominal Dollars'}
            </p>
          </div>

          {viewMode === 'monte_carlo' && monteCarloOutput && (
            <div className="flex items-center gap-3 bg-amber-500/10 border border-amber-500/20 px-3 py-1.5 rounded-lg text-xs font-mono">
              <span className="font-bold text-amber-500">Success Rate: {monteCarloOutput.successRate.toFixed(1)}%</span>
              <span className="text-muted-foreground">|</span>
              <span className="text-foreground">Median Legacy: {formatCurrency(monteCarloOutput.medianLegacy)}</span>
            </div>
          )}
        </div>

        {/* Dynamic Chart */}
        <div className="h-80 w-full">
          <ResponsiveContainer width="100%" height="100%">
            {viewMode === 'deterministic' ? (
              <AreaChart data={chartData} margin={{ top: 25, right: 25, left: 10, bottom: 0 }}>
                <defs>
                  <linearGradient id="accumulationGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.35} />
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0.0} />
                  </linearGradient>
                </defs>

                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" strokeOpacity={0.3} vertical={false} />

                <XAxis
                  dataKey="age"
                  stroke="currentColor"
                  className="text-xs text-muted-foreground"
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(age) => `${age}`}
                />
                <YAxis
                  stroke="currentColor"
                  className="text-xs text-muted-foreground"
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(val) => (val >= 1000000 ? `$${(val / 1000000).toFixed(1)}M` : `$${(val / 1000).toFixed(0)}k`)}
                />

                <Tooltip content={<CustomTooltip />} wrapperStyle={{ zIndex: 100, opacity: 1 }} />

                <Area
                  type="monotone"
                  dataKey="netWorth"
                  stroke="#10b981"
                  strokeWidth={2.5}
                  fillOpacity={1}
                  fill="url(#accumulationGrad)"
                />

                {milestoneCallouts.map((m, idx) => {
                  const pt = chartData.find((d) => d.age === m.age);
                  if (!pt) return null;
                  const IconComponent = m.icon;
                  return (
                    <ReferenceDot
                      key={idx}
                      x={m.age}
                      y={pt.netWorth}
                      shape={(dotProps: any) => {
                        const { cx, cy } = dotProps;
                        if (typeof cx !== 'number' || typeof cy !== 'number') return <g />;
                        return (
                          <g transform={`translate(${cx - 14}, ${cy - 14})`} className="cursor-pointer group">
                            <title>{`${m.title} (Age ${m.age}, Year ${m.year})\n${m.note}\nProjected Net Worth: ${formatCurrency(pt.netWorth)}`}</title>
                            <circle
                              cx={14}
                              cy={14}
                              r={13}
                              fill="var(--card, #ffffff)"
                              stroke={m.stroke || '#10b981'}
                              strokeWidth={2.5}
                              className="shadow-sm transition-transform group-hover:scale-125"
                            />
                            <g transform="translate(6, 6)">
                              <IconComponent size={16} color={m.stroke || '#10b981'} />
                            </g>
                          </g>
                        );
                      }}
                    />
                  );
                })}
              </AreaChart>
            ) : (
              <AreaChart data={monteCarloChartData} margin={{ top: 25, right: 25, left: 10, bottom: 0 }}>
                <defs>
                  <linearGradient id="mcBandGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#f59e0b" stopOpacity={0.05} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" strokeOpacity={0.3} vertical={false} />
                <XAxis dataKey="age" stroke="currentColor" className="text-xs text-muted-foreground" tickLine={false} />
                <YAxis stroke="currentColor" className="text-xs text-muted-foreground" tickLine={false} tickFormatter={(val) => (val >= 1000000 ? `$${(val / 1000000).toFixed(1)}M` : `$${(val / 1000).toFixed(0)}k`)} />
                <Tooltip />
                <Area type="monotone" dataKey="p90" stroke="#f59e0b" strokeWidth={1} fill="url(#mcBandGrad)" name="90th Percentile" />
                <Area type="monotone" dataKey="p75" stroke="#3b82f6" strokeWidth={1.5} fill="none" name="75th Percentile" />
                <Area type="monotone" dataKey="p50" stroke="#10b981" strokeWidth={2.5} fill="none" name="Median (P50)" />
                <Area type="monotone" dataKey="p25" stroke="#a855f7" strokeWidth={1.5} fill="none" name="25th Percentile" />
                <Area type="monotone" dataKey="p10" stroke="#f43f5e" strokeWidth={1.5} fill="none" name="10th Percentile (Worst Case)" />
              </AreaChart>
            )}
          </ResponsiveContainer>
        </div>
      </div>

      {/* Key Financial & Life Milestones Cards */}
      <div className="bg-card border border-border rounded-xl p-5 shadow-sm space-y-4">
        <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
          <Flag className="w-3.5 h-3.5 text-primary" />
          Key Financial & Life Milestones Timeline
        </h3>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          {milestoneCallouts.map((m) => {
            const Icon = m.icon;
            return (
              <div key={m.title} className="bg-muted/20 border border-border rounded-xl p-3 space-y-2 flex flex-col justify-between hover:border-primary/40 transition-all">
                <div className="flex items-center justify-between">
                  <span className={`p-1.5 rounded-lg bg-background border border-border ${m.color}`}>
                    <Icon className="w-4 h-4" />
                  </span>
                  <span className="font-mono font-extrabold text-[11px] text-foreground bg-background px-2 py-0.5 rounded border border-border">
                    Age {m.age} ({m.year})
                  </span>
                </div>
                <div>
                  <h4 className="text-xs font-bold text-foreground">{m.title}</h4>
                  <p className="text-[11px] text-muted-foreground mt-1 leading-snug">{m.note}</p>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Income vs. Drawdowns Composed Stacked Bar & Line Chart */}
      <div className="bg-card border border-border rounded-xl p-5 shadow-sm space-y-4">
        <div className="flex items-center justify-between border-b border-border pb-3">
          <div>
            <h2 className="text-sm font-bold text-foreground flex items-center gap-2">
              <Layers className="w-4 h-4 text-emerald-500" />
              Yearly Cash Flow Composition: Inflows vs. Portfolio Drawdowns
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Visualizes salary, pension, Social Security, and portfolio drawdown sequence against expenses
            </p>
          </div>
          <span className="text-[10px] font-bold px-2 py-1 rounded bg-primary/10 text-primary border border-primary/20">
            {activeStrategyLabel}
          </span>
        </div>

        <div className="h-80 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={chartData} maxBarSize={40} margin={{ top: 10, right: 5, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" strokeOpacity={0.3} vertical={false} />
              <XAxis dataKey="age" stroke="currentColor" className="text-xs text-muted-foreground" tickLine={false} />
              <YAxis stroke="currentColor" className="text-xs text-muted-foreground" tickLine={false} tickFormatter={(val) => `$${(val / 1000).toFixed(0)}k`} />
              <Tooltip content={<DrawdownTooltip />} wrapperStyle={{ zIndex: 100, opacity: 1 }} />
              <Legend content={<GroupedLegend />} />

              {(() => {
                const retPt = chartData.find((d) => d.age === localRetirementAge);
                if (!retPt) return null;
                const totalAtRet = (retPt.salaryIncome || 0) + (retPt.ssIncome || 0) + (retPt.pensionIncome || 0) + (retPt.otherIncome || 0)
                  + (retPt.cashDrawdown || 0) + (retPt.taxableDrawdown || 0) + (retPt.traditionalDrawdown || 0) + (retPt.rothDrawdown || 0) + (retPt.hsaDrawdown || 0);
                return (
                  <ReferenceDot
                    x={localRetirementAge}
                    y={totalAtRet}
                    shape={(dotProps: any) => {
                      const { cx, cy } = dotProps;
                      if (typeof cx !== 'number' || typeof cy !== 'number') return <g />;
                      return (
                        <g transform={`translate(${cx - 14}, ${cy - 14})`} className="cursor-pointer group">
                          <title>{`Retirement (Age ${localRetirementAge})`}</title>
                          <circle cx={14} cy={14} r={13} fill="var(--card, #ffffff)" stroke="#10b981" strokeWidth={2.5} className="shadow-sm transition-transform group-hover:scale-125" />
                          <g transform="translate(6, 6)">
                            <Palmtree size={16} color="#10b981" />
                          </g>
                        </g>
                      );
                    }}
                  />
                );
              })()}

              <Bar dataKey="salaryIncome" name="Salary / Earned" stackId="sources" fill="#10b981" />
              <Bar dataKey="ssIncome" name="Social Security" stackId="sources" fill="#06b6d4" />
              <Bar dataKey="pensionIncome" name="Pension" stackId="sources" fill="#3b82f6" />
              <Bar dataKey="otherIncome" name="Other Income" stackId="sources" fill="#8b5cf6" />

              <Bar dataKey="cashDrawdown" name="Cash Drawdown" stackId="sources" fill="#94a3b8" />
              <Bar dataKey="taxableDrawdown" name="Taxable Brokerage" stackId="sources" fill="#f59e0b" />
              <Bar dataKey="traditionalDrawdown" name="Traditional IRA/401k" stackId="sources" fill="#a855f7" />
              <Bar dataKey="rothDrawdown" name="Roth IRA/401k" stackId="sources" fill="#ec4899" />
              <Bar dataKey="hsaDrawdown" name="HSA Drawdown" stackId="sources" fill="#14b8a6" />

              <Line type="monotone" dataKey="expenses" name="Annual Expenses" stroke="#f43f5e" strokeWidth={2} strokeDasharray="4 4" dot={false} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Interactive What-If Scenario Explorer Sliders */}
      <div className="bg-card border border-border rounded-xl p-5 shadow-sm space-y-4">
        <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
          <Sparkles className="w-3.5 h-3.5 text-primary" />
          Interactive What-If Scenario Explorer
        </h3>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {/* Retirement Age Slider with Debounced Commit */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-muted-foreground">Retirement Age</span>
              <span className="font-mono font-bold text-primary text-sm">{localRetirementAge}</span>
            </div>
            <input
              type="range"
              min="40"
              max="75"
              step="1"
              value={localRetirementAge}
              onChange={(e) => setLocalRetirementAge(parseInt(e.target.value, 10))}
              onPointerUp={() => onUpdatePlan({ retirementAge: localRetirementAge })}
              className="w-full accent-primary h-2 cursor-pointer"
            />
            <div className="flex justify-between text-[10px] text-muted-foreground font-mono">
              <span>40</span>
              <span>55</span>
              <span>65</span>
              <span>75</span>
            </div>
          </div>

          {/* Expected Return Rate Slider */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-muted-foreground">Expected Annual Return</span>
              <span className="font-mono font-bold text-primary text-sm">{localReturnRate > 0 ? `+${localReturnRate}%` : `${localReturnRate}%`}</span>
            </div>
            <input
              type="range"
              min="1"
              max="12"
              step="0.5"
              value={localReturnRate}
              onChange={(e) => setLocalReturnRate(parseFloat(e.target.value))}
              className="w-full accent-primary h-2 cursor-pointer"
            />
            <div className="flex justify-between text-[10px] text-muted-foreground font-mono">
              <span>1%</span>
              <span>6%</span>
              <span>8%</span>
              <span>12%</span>
            </div>
          </div>

          {/* Inflation Rate Slider */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-muted-foreground">Inflation Rate</span>
              <span className="font-mono font-bold text-primary text-sm">{localInflationRate.toFixed(1)}%</span>
            </div>
            <input
              type="range"
              min="1.0"
              max="6.0"
              step="0.25"
              value={localInflationRate}
              onChange={(e) => setLocalInflationRate(parseFloat(e.target.value))}
              className="w-full accent-primary h-2 cursor-pointer"
            />
            <div className="flex justify-between text-[10px] text-muted-foreground font-mono">
              <span>1.0%</span>
              <span>3.0%</span>
              <span>6.0%</span>
            </div>
          </div>

          {/* Annual Expenses Modifier Slider */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-muted-foreground">Expense Adjustment</span>
              <span className="font-mono font-bold text-primary text-sm">{localExpenseModifier > 0 ? `+${localExpenseModifier}%` : `${localExpenseModifier}%`}</span>
            </div>
            <input
              type="range"
              min="-30"
              max="30"
              step="5"
              value={localExpenseModifier}
              onChange={(e) => setLocalExpenseModifier(parseInt(e.target.value, 10))}
              className="w-full accent-primary h-2 cursor-pointer"
            />
            <div className="flex justify-between text-[10px] text-muted-foreground font-mono">
              <span>-30%</span>
              <span>0%</span>
              <span>+30%</span>
            </div>
          </div>
        </div>
      </div>

      {/* Year-by-Year Simulation Table */}
      <div className="bg-card border border-border rounded-xl shadow-sm overflow-hidden">
        <button
          onClick={() => setShowYearlyTable(!showYearlyTable)}
          className="w-full flex items-center justify-between p-4 text-sm font-bold text-foreground hover:bg-muted/20 transition-colors cursor-pointer"
        >
          <span className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-primary" />
            Detailed Year-by-Year Account Drawdown & Tax Table
          </span>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span>{chartData.length} years</span>
            {showYearlyTable ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </div>
        </button>

        {showYearlyTable && (
          <div className="border-t border-border overflow-x-auto max-h-[550px] overflow-y-auto">
            <table className="w-full text-xs text-left">
              <thead className="bg-muted/40 text-muted-foreground font-semibold sticky top-0 bg-card">
                <tr>
                  <th className="p-2.5">Year</th>
                  <th className="p-2.5">Age</th>
                  <th className="p-2.5">Net Worth</th>
                  <th className="p-2.5">Gross Income</th>
                  <th className="p-2.5">Expenses</th>
                  <th className="p-2.5">Taxes Paid</th>
                  <th className="p-2.5">ETR %</th>
                  <th className="p-2.5">Taxable Draw</th>
                  <th className="p-2.5">Trad Draw</th>
                  <th className="p-2.5">Roth Draw</th>
                  <th className="p-2.5">Withdraw Rate</th>
                  <th className="p-2.5">Roth Conv</th>
                  <th className="p-2.5">MAGI</th>
                  <th className="p-2.5">Phase</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60 font-mono">
                {chartData.map((y: any) => {
                  const isRetired = y.isRetired;
                  const isRetirementYear = y.age === localRetirementAge;
                  return (
                    <tr
                      key={y.year}
                      className={`hover:bg-muted/20 ${isRetirementYear ? 'bg-emerald-500/5 border-l-2 border-l-emerald-500' : ''}`}
                    >
                      <td className="p-2.5 font-medium">{y.year}</td>
                      <td className="p-2.5">{y.age}</td>
                      <td className="p-2.5 font-bold text-foreground">{formatCurrency(y.netWorth)}</td>
                      <td className="p-2.5 text-emerald-500">{formatCurrency(y.income)}</td>
                      <td className="p-2.5 text-rose-500">{formatCurrency(y.expenses)}</td>
                      <td className="p-2.5 text-rose-400 font-bold">{formatCurrency(y.taxesPaid)}</td>
                      <td className="p-2.5 text-muted-foreground">{y.effectiveTaxRate ? `${y.effectiveTaxRate.toFixed(1)}%` : '0%'}</td>
                      <td className="p-2.5 text-amber-500">{formatCurrency(y.taxableDrawdown)}</td>
                      <td className="p-2.5 text-purple-500">{formatCurrency(y.traditionalDrawdown)}</td>
                      <td className="p-2.5 text-pink-500">{formatCurrency(y.rothDrawdown)}</td>
                      <td className="p-2.5 font-bold">
                        {y.withdrawalRate > 0 ? (
                          <span className={y.withdrawalRate > 5 ? 'text-rose-500' : y.withdrawalRate > 3.5 ? 'text-amber-500' : 'text-emerald-500'}>
                            {y.withdrawalRate.toFixed(1)}%
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="p-2.5 text-cyan-500">{formatCurrency(y.rothConversionAmount)}</td>
                      <td className="p-2.5 text-foreground">{formatCurrency(y.magi)}</td>
                      <td className="p-2.5">
                        <span
                          className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full font-sans ${
                            isRetired ? 'bg-amber-500/10 text-amber-500' : 'bg-emerald-500/10 text-emerald-500'
                          }`}
                        >
                          {isRetired ? '🌴 Drawdown' : '📈 Save'}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function CustomTooltip({ active, payload }: any) {
  if (!active || !payload || !payload.length) return null;
  const data = payload[0].payload;
  const MilestoneIcon = data.milestone?.icon;
  const incomeTotal = (data.income || 0);
  const incomeGap = Math.max(0, (data.expenses || 0) - incomeTotal);

  return (
    <div className="bg-background border border-border rounded-xl p-3.5 shadow-xl text-xs space-y-2 min-w-[210px] z-50">
      <div className="flex items-center justify-between border-b border-border pb-1.5 font-bold">
        <span>Year {data.year} (Age {data.age})</span>
        <span className={data.isRetired ? 'text-amber-500' : 'text-emerald-500'}>
          {data.isRetired ? 'Retired' : 'Working'}
        </span>
      </div>
      <div className="space-y-1 font-mono">
        <div className="flex justify-between">
          <span className="text-muted-foreground">Net Worth:</span>
          <span className="font-bold text-emerald-500">{formatCurrency(data.netWorth)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">Income:</span>
          <span className="text-foreground">{formatCurrency(data.income)}</span>
        </div>
        {data.expenses != null && (
          <div className="flex justify-between">
            <span className="text-muted-foreground">Expenses:</span>
            <span className="text-rose-500">{formatCurrency(data.expenses)}</span>
          </div>
        )}
        {incomeGap > 0 && (
          <div className="flex justify-between text-amber-500 font-bold">
            <span>Income Gap:</span>
            <span>{formatCurrency(incomeGap)}</span>
          </div>
        )}
        {data.totalDrawdown > 0 && (
          <div className="flex justify-between pt-1 border-t border-border/50 text-amber-500 font-bold">
            <span>Portfolio Drawdown:</span>
            <span>{formatCurrency(data.totalDrawdown)}</span>
          </div>
        )}
      </div>

      {data.milestone && (
        <div className="bg-primary/10 border border-primary/20 rounded-lg p-2.5 mt-2 space-y-1 text-left">
          <div className="flex items-center gap-1.5 font-bold text-primary text-[11px]">
            {MilestoneIcon && <MilestoneIcon className="w-3.5 h-3.5 shrink-0" />}
            <span>{data.milestone.title}</span>
          </div>
          <p className="text-[10px] text-muted-foreground leading-snug">{data.milestone.note}</p>
        </div>
      )}
    </div>
  );
}

function GroupedLegend({ payload }: any) {
  if (!payload) return null;
  const incomeItems = payload.filter((p: any) =>
    ['Salary / Earned', 'Social Security', 'Pension', 'Other Income'].includes(p.value)
  );
  const drawdownItems = payload.filter((p: any) =>
    ['Cash Drawdown', 'Taxable Brokerage', 'Traditional IRA/401k', 'Roth IRA/401k', 'Roth Conversion', 'HSA Drawdown'].includes(p.value)
  );
  const lineItems = payload.filter((p: any) => p.value === 'Annual Expenses');
  return (
    <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-[10px] pt-1">
      <div className="flex items-center gap-0.5 font-bold text-muted-foreground uppercase tracking-wider">
        Income:
      </div>
      {incomeItems.map((item: any, i: number) => (
        <div key={i} className="flex items-center gap-1">
          <span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: item.color }} />
          <span className="text-muted-foreground">{item.value}</span>
        </div>
      ))}
      <div className="flex items-center gap-0.5 font-bold text-muted-foreground uppercase tracking-wider ml-2">
        Drawdowns:
      </div>
      {drawdownItems.map((item: any, i: number) => (
        <div key={i} className="flex items-center gap-1">
          <span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: item.color }} />
          <span className="text-muted-foreground">{item.value}</span>
        </div>
      ))}
      {lineItems.length > 0 && (
        <>
          <div className="flex items-center gap-0.5 font-bold text-muted-foreground uppercase tracking-wider ml-2">
            Reference:
          </div>
          {lineItems.map((item: any, i: number) => (
            <div key={i} className="flex items-center gap-1">
              <span className="inline-block w-4 h-0 border-t-2 border-dashed" style={{ borderColor: item.color }} />
              <span className="text-muted-foreground">{item.value}</span>
            </div>
          ))}
        </>
      )}
    </div>
  );
}

function DrawdownTooltip({ active, payload }: any) {
  if (!active || !payload || !payload.length) return null;
  const data = payload[0].payload;
  const incomeTotal = (data.salaryIncome || 0) + (data.ssIncome || 0) + (data.pensionIncome || 0) + (data.otherIncome || 0);
  return (
    <div className="bg-background border border-border rounded-xl p-3.5 shadow-xl text-xs space-y-2 min-w-[240px]">
      <div className="flex items-center justify-between border-b border-border pb-1.5 font-bold">
        <span>Year {data.year} (Age {data.age})</span>
        <span className="text-primary">{data.isRetired ? 'Retirement Phase' : 'Accumulation'}</span>
      </div>
      <div className="space-y-1 font-mono">
        <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider pt-0.5">Income Sources</p>
        {data.salaryIncome > 0 && (
          <div className="flex justify-between text-emerald-500">
            <span>Salary:</span>
            <span>{formatCurrency(data.salaryIncome)}</span>
          </div>
        )}
        {data.ssIncome > 0 && (
          <div className="flex justify-between text-cyan-500">
            <span>Social Security:</span>
            <span>{formatCurrency(data.ssIncome)}</span>
          </div>
        )}
        {data.pensionIncome > 0 && (
          <div className="flex justify-between text-blue-500">
            <span>Pension:</span>
            <span>{formatCurrency(data.pensionIncome)}</span>
          </div>
        )}
        {data.otherIncome > 0 && (
          <div className="flex justify-between text-violet-500">
            <span>Other Income:</span>
            <span>{formatCurrency(data.otherIncome)}</span>
          </div>
        )}
        <div className="flex justify-between font-bold text-foreground border-t border-border/40 pt-1">
          <span>Total Income:</span>
          <span>{formatCurrency(incomeTotal)}</span>
        </div>
        <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider pt-1 border-t border-border/40">Portfolio Drawdowns</p>
        {data.cashDrawdown > 0 && (
          <div className="flex justify-between text-slate-400">
            <span>Cash:</span>
            <span>{formatCurrency(data.cashDrawdown)}</span>
          </div>
        )}
        {data.taxableDrawdown > 0 && (
          <div className="flex justify-between text-amber-500">
            <span>Taxable Brokerage:</span>
            <span>{formatCurrency(data.taxableDrawdown)}</span>
          </div>
        )}
        {data.traditionalDrawdown > 0 && (
          <div className="flex justify-between text-purple-500">
            <span>Traditional IRA/401k:</span>
            <span>{formatCurrency(data.traditionalDrawdown)}</span>
          </div>
        )}
        {data.rothDrawdown > 0 && (
          <div className="flex justify-between text-pink-500">
            <span>Roth IRA/401k:</span>
            <span>{formatCurrency(data.rothDrawdown)}</span>
          </div>
        )}
        {data.hsaDrawdown > 0 && (
          <div className="flex justify-between text-teal-500">
            <span>HSA:</span>
            <span>{formatCurrency(data.hsaDrawdown)}</span>
          </div>
        )}
        {data.rothConversionAmount > 0 && (
          <div className="flex justify-between text-orange-400 font-bold border-t border-border/40 pt-1">
            <span>Roth Conversion:</span>
            <span>{formatCurrency(data.rothConversionAmount)}</span>
          </div>
        )}
        {data.actualDrawdowns > 0 && (
          <div className="border-t border-border/40 pt-1 space-y-1">
            <div className="flex justify-between font-bold text-foreground">
              <span>Total Drawn:</span>
              <span>{formatCurrency(data.actualDrawdowns)}</span>
            </div>
            <div className="flex justify-between font-bold">
              <span>Withdraw Rate:</span>
              <span className={data.withdrawalRate > 5 ? 'text-rose-500' : data.withdrawalRate > 3.5 ? 'text-amber-500' : 'text-emerald-500'}>
                {data.withdrawalRate.toFixed(1)}%
              </span>
            </div>
          </div>
        )}
        {data.expenses != null && (
          <div className="border-t border-border/40 pt-1">
            <div className="flex justify-between text-rose-500">
              <span>Expenses:</span>
              <span>{formatCurrency(data.expenses)}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
