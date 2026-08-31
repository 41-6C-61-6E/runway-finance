'use client';

import { useState, useMemo, Fragment } from 'react';
import { runRetirementSimulation, EnginePlan } from '@/lib/services/retirement-engine';
import { DEFAULT_2026_RULES } from '@/lib/constants/retirement-defaults';
import { buildEnginePlan } from '@/lib/utils/build-engine-plan';
import { formatCurrency } from '@/lib/utils/format';
import { formatCompactCurrency } from '@/lib/utils/format';
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
  AlertTriangle,
} from 'lucide-react';
import { CollapsibleCardHeader } from '@/components/ui/collapsible-card-header';
import { useCardCollapsed } from '@/lib/hooks/use-card-collapsed';
import { AppTabs } from '@/components/ui/app-tabs';
import { SocialSecurityTab } from '@/components/plans/social-security-tab';
import { RothConversionTab } from '@/components/plans/roth-conversion-tab';
import { IrmaaTab } from '@/components/plans/irmaa-tab';

import { ProjectionOptionsPopover } from './projection-options-popover';
import { MobileTabSwipeContainer } from '@/components/ui/mobile-view-switcher';
import { TableScroll } from '@/components/ui/table-scroll';

interface ScenariosTabProps {
  plan: any;
  allPlans?: any[];
  onUpdatePlan?: (updates: any) => void;
  dollarMode?: 'real' | 'nominal';
  onToggleDollarMode?: (mode: 'real' | 'nominal') => void;
  viewMode?: 'deterministic' | 'monte_carlo';
  onToggleViewMode?: (mode: 'deterministic' | 'monte_carlo') => void;
  desktopHeader?: React.ReactNode;
  subHeader?: React.ReactNode;
}

export function ScenariosTab({
  plan,
  onUpdatePlan,
  dollarMode = 'real',
  onToggleDollarMode = () => {},
  viewMode = 'deterministic',
  onToggleViewMode = () => {},
  desktopHeader,
  subHeader,
}: ScenariosTabProps) {
  const [activeSubTab, setActiveSubTab] = useState<'withdraw' | 'social-security' | 'roth-conversion' | 'irmaa'>('withdraw');
  const [expandedStrategyId, setExpandedStrategyId] = useState<string | null>(null);

  // Collapsible card states
  const [isStrategiesCollapsed, setIsStrategiesCollapsed] = useCardCollapsed('scenarios_strategies');

  // Applied Toast Feedback
  const [appliedMsg, setAppliedMsg] = useState<string>('');

  const primaryEnginePlan = useMemo(() => buildEnginePlan(plan), [plan]);

  // ── SECTION 1: WITHDRAWAL STRATEGY COMPARISON ENGINE ──
  const strategiesList = useMemo(() => {
    const baseline = primaryEnginePlan;

    // 1. Textbook / Taxable First
    const stratTextbook = {
      ...baseline,
      withdrawalMethod: 'textbook' as const,
      settings: { ...baseline.settings, withdrawalMethod: 'textbook' as const, enableRothConversions: false },
    };
    // 2. Proportional / Pro-Rata
    const stratProportional = {
      ...baseline,
      withdrawalMethod: 'proportional' as const,
      settings: { ...baseline.settings, withdrawalMethod: 'proportional' as const, enableRothConversions: false },
    };
    // 3. Tax-Deferred First / Waterfall
    const stratTaxDeferred = {
      ...baseline,
      withdrawalMethod: 'tax_deferred_first' as const,
      settings: { ...baseline.settings, withdrawalMethod: 'tax_deferred_first' as const, enableRothConversions: false },
    };
    // 4. Tax-Optimized Bracket Filling
    const stratTaxOptimized = {
      ...baseline,
      withdrawalMethod: 'tax_optimized' as const,
      settings: { ...baseline.settings, withdrawalMethod: 'tax_optimized' as const, enableRothConversions: false },
    };
    // 5. Roth Conversion Ladder Strategy
    const stratRothLadder = {
      ...baseline,
      withdrawalMethod: 'textbook' as const,
      settings: {
        ...baseline.settings,
        withdrawalMethod: 'textbook' as const,
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
      const totalRealizedIncome = sim.yearlyResults.reduce((sum: number, y: any) => {
        const drawdowns = (y.drawdownsByType?.traditional || 0) + (y.drawdownsByType?.taxable || 0) + (y.drawdownsByType?.roth || 0) + (y.drawdownsByType?.cash || 0);
        return sum + (y.grossIncome || 0) + drawdowns;
      }, 0);
      const effectiveTaxRate = totalRealizedIncome > 0 ? (totalTaxes / totalRealizedIncome) * 100 : 0;
      const maxRmd = Math.max(...sim.yearlyResults.map((y: any) => y.rmdMandatoryDrawdown || y.rmdAmount || 0));
      const ranOutOfMoney = sim.yearlyResults.some((y: any) => y.netWorth <= 0);
      const depletionYear = sim.yearlyResults.find((y: any) => y.netWorth <= 0);
      const depletionAge = sim.depletionAge || (depletionYear ? (depletionYear.primaryAge ?? depletionYear.age) : undefined);
      return {
        endNW,
        totalTaxes,
        effectiveTaxRate,
        maxRmd,
        ranOutOfMoney,
        depletionAge,
        yearlyResults: sim.yearlyResults,
      };
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
    const inflationRate = (plan?.settings?.fixedInflationRate ?? 3.0) / 100;
    const textRes = strategiesList.find((s) => s.id === 'textbook')?.summary.yearlyResults || [];
    const propRes = strategiesList.find((s) => s.id === 'proportional')?.summary.yearlyResults || [];
    const defRes = strategiesList.find((s) => s.id === 'tax_deferred_first')?.summary.yearlyResults || [];
    const optRes = strategiesList.find((s) => s.id === 'tax_optimized')?.summary.yearlyResults || [];
    const rothRes = strategiesList.find((s) => s.id === 'roth_ladder')?.summary.yearlyResults || [];

    return textRes.map((y: any, idx: number) => {
      const discountFactor = dollarMode === 'real' ? Math.pow(1 + inflationRate, idx) : 1;
      return {
        age: y.primaryAge ?? y.age,
        textbook: Math.round(y.netWorth / discountFactor),
        proportional: Math.round((propRes[idx]?.netWorth || 0) / discountFactor),
        tax_deferred_first: Math.round((defRes[idx]?.netWorth || 0) / discountFactor),
        tax_optimized: Math.round((optRes[idx]?.netWorth || 0) / discountFactor),
        roth_ladder: Math.round((rothRes[idx]?.netWorth || 0) / discountFactor),
      };
    });
  }, [strategiesList, dollarMode, plan]);

  const subTabs = [
    { id: 'withdraw' as const, label: 'Withdrawal', icon: Layers },
    { id: 'social-security' as const, label: 'SS', icon: HeartHandshake },
    { id: 'roth-conversion' as const, label: 'Roth', icon: Flame },
    { id: 'irmaa' as const, label: 'IRMAA', icon: ShieldCheck },
  ];

  const handleApplyStrategy = (strat: any) => {
    if (!onUpdatePlan) return;
    const wasRothEnabled = Boolean(plan?.settings?.enableRothConversions);

    if (strat.enableRoth) {
      onUpdatePlan({
        withdrawalMethod: strat.method,
        settings: {
          ...plan?.settings,
          withdrawalMethod: strat.method,
          enableRothConversions: true,
          rothConversionTargetCeiling: 'top_of_12',
          avoidIrmaaCliffs: true,
        },
      });
      setAppliedMsg(`Applied ${strat.name} (Textbook + 12% Bracket Roth Conversions)`);
    } else {
      onUpdatePlan({
        withdrawalMethod: strat.method,
        settings: {
          ...plan?.settings,
          withdrawalMethod: strat.method,
          enableRothConversions: wasRothEnabled && strat.method === plan?.withdrawalMethod ? true : false,
        },
      });
      setAppliedMsg(`Applied ${strat.name}`);
    }

    setTimeout(() => {
      setAppliedMsg('');
    }, 4000);
  };

  return (
    <MobileTabSwipeContainer
      desktopHeader={desktopHeader}
      tabs={subTabs}
      activeTabId={activeSubTab}
      onTabChange={(tabId) => setActiveSubTab(tabId as any)}
      priority={1}
    >
      {subHeader && <div className="lg:hidden">{subHeader}</div>}

      {/* Desktop Scenarios Sub-Tab Navigation Bar */}
      <div className="hidden lg:block">
        <AppTabs
          tabs={subTabs}
          activeTab={activeSubTab}
          onChange={(tabId) => setActiveSubTab(tabId as any)}
          variant="pills"
          size="sm"
          fullWidth
        />
      </div>

      {/* SUB-TAB 1: WITHDRAW STRATEGY */}
      {activeSubTab === 'withdraw' && (
        <div className="space-y-6">
          <div className="bg-card border border-border rounded-2xl shadow-sm">
            <CollapsibleCardHeader
              title="Withdrawal Sequencing Strategy Laboratory"
              description="Simulate and compare 5 distinct withdrawal ordering methods directly on your plan. Click any strategy row to expand its full sequencing breakdown."
              icon={Layers}
              isCollapsed={isStrategiesCollapsed}
              onToggle={() => setIsStrategiesCollapsed(!isStrategiesCollapsed)}
              actions={
                <ProjectionOptionsPopover
                  dollarMode={dollarMode}
                  onToggleDollarMode={onToggleDollarMode}
                  viewMode={viewMode}
                  onToggleViewMode={onToggleViewMode}
                />
              }
            />

            {!isStrategiesCollapsed && (
              <div className="p-5 space-y-6">
                {appliedMsg && (
                  <div className="bg-emerald-500/10 border border-emerald-500/30 text-emerald-600 dark:text-emerald-400 px-4 py-2.5 rounded-xl text-xs font-semibold flex items-center gap-2 animate-in fade-in duration-200">
                    <CheckCircle2 className="w-4 h-4 shrink-0" />
                    {appliedMsg}
                  </div>
                )}

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
                          tickFormatter={(v) => formatCompactCurrency(v)}
                          tickLine={false}
                        />
                        <Tooltip
                          content={
                            <ScenarioStrategyTooltip
                              activeMethod={plan?.withdrawalMethod}
                              activeRoth={Boolean(plan?.settings?.enableRothConversions)}
                            />
                          }
                          wrapperStyle={{ zIndex: 100, opacity: 1 }}
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
                <TableScroll className="border border-border rounded-xl shadow-sm">
                  <table className="w-full text-xs text-left min-w-[720px]">
                    <thead className="bg-muted/60 text-muted-foreground font-semibold border-b border-border">
                      <tr>
                        <th className="px-4 py-3">Strategy Name</th>
                        <th className="px-3 py-3 text-center">Longevity</th>
                        <th className="px-3 py-3 text-right">Ending Net Worth</th>
                        <th className="px-3 py-3 text-right">Lifetime Taxes</th>
                        <th className="px-3 py-3 text-right">Peak Age 75+ RMD</th>
                        <th className="px-4 py-3 text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/60">
                      {strategiesList.map((strat) => {
                        const isCurrentActive = plan?.withdrawalMethod === strat.method && (!strat.enableRoth || Boolean(plan?.settings?.enableRothConversions));
                        const isHighestNW = strat.summary.endNW === Math.max(...strategiesList.map((s) => s.summary.endNW));
                        const isLowestTax = strat.summary.totalTaxes === Math.min(...strategiesList.map((s) => s.summary.totalTaxes));
                        const isExpanded = expandedStrategyId === strat.id;

                        return (
                          <Fragment key={strat.id}>
                            <tr
                              onClick={() => setExpandedStrategyId(isExpanded ? null : strat.id)}
                              className={`cursor-pointer transition-colors ${
                                isCurrentActive ? 'bg-primary/10 font-medium' : 'hover:bg-muted/30'
                              }`}
                            >
                              <td className="px-4 py-3.5 align-middle">
                                <div className="flex items-center gap-3">
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setExpandedStrategyId(isExpanded ? null : strat.id);
                                    }}
                                    className="text-muted-foreground hover:text-foreground transition-transform shrink-0"
                                  >
                                    {isExpanded ? <ChevronUp className="w-4 h-4 text-primary" /> : <ChevronDown className="w-4 h-4" />}
                                  </button>
                                  <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: strat.color }} />
                                  <div>
                                    <span className="font-bold text-foreground block">
                                      {strat.name}
                                    </span>
                                    <span className="text-[10px] text-muted-foreground line-clamp-1">{strat.description}</span>
                                  </div>
                                </div>
                              </td>

                              <td className="px-3 py-3.5 text-center align-middle whitespace-nowrap">
                                {strat.summary.depletionAge ? (
                                  <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-md bg-rose-500/10 text-rose-500 border border-rose-500/20">
                                    <AlertTriangle className="w-3 h-3" /> Depleted Age {strat.summary.depletionAge}
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-md bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                                    <Check className="w-3 h-3" /> Age {plan?.lifeExpectancyAge || 90}+ (100%)
                                  </span>
                                )}
                              </td>

                              <td className="px-3 py-3.5 text-right align-middle whitespace-nowrap">
                                <span className={`font-mono font-bold text-xs ${isHighestNW ? 'text-emerald-500' : 'text-foreground'}`}>
                                  {formatCurrency(strat.summary.endNW)}
                                </span>
                              </td>

                              <td className="px-3 py-3.5 text-right align-middle whitespace-nowrap">
                                <div className={`font-mono font-semibold ${isLowestTax ? 'text-emerald-500' : 'text-muted-foreground'}`}>
                                  {formatCurrency(strat.summary.totalTaxes)}
                                </div>
                                <div className="text-[10px] text-muted-foreground/80 font-mono">
                                  {strat.summary.effectiveTaxRate.toFixed(1)}% eff. rate
                                </div>
                              </td>

                              <td className="px-3 py-3.5 text-right align-middle whitespace-nowrap">
                                <span className="font-mono text-amber-500 font-semibold">
                                  {strat.summary.maxRmd > 0 ? formatCurrency(strat.summary.maxRmd) : '$0'}
                                </span>
                              </td>

                              <td className="px-4 py-3.5 text-right align-middle whitespace-nowrap">
                                {isCurrentActive ? (
                                  <span className="inline-flex items-center gap-1 bg-primary text-primary-foreground text-[10px] font-bold px-2.5 py-1 rounded-full shadow-xs">
                                    <Check className="w-3.5 h-3.5" /> Active
                                  </span>
                                ) : (
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleApplyStrategy(strat);
                                    }}
                                    className="px-2.5 py-1 bg-primary/10 hover:bg-primary/20 text-primary border border-primary/30 rounded-lg text-[10px] font-bold transition-all cursor-pointer"
                                  >
                                    Apply Strategy
                                  </button>
                                )}
                              </td>
                            </tr>

                            {/* Expanded Strategy Sequencing Breakdown Panel */}
                            {isExpanded && (
                              <tr>
                                <td colSpan={6} className="p-0">
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
                                      <TableScroll maxHeight={224} className="border border-border rounded-xl bg-card shadow-inner">
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
                                              .filter((y: any) => (y.primaryAge ?? y.age) >= (primaryEnginePlan.retirementAge || 60))
                                              .map((y: any) => (
                                                <tr key={y.year} className="hover:bg-muted/40 font-mono">
                                                  <td className="px-3 py-1.5 font-bold text-foreground font-sans">Age {y.primaryAge ?? y.age}</td>
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
                                        </TableScroll>
                                    </div>
                                  </div>
                                </td>
                              </tr>
                            )}
                          </Fragment>
                        );
                      })}
                    </tbody>
                  </table>
                </TableScroll>
              </div>
            )}
          </div>
        </div>
      )}

      {/* SUB-TAB 2: SOCIAL SECURITY */}
      {activeSubTab === 'social-security' && (
        <SocialSecurityTab
          plan={plan}
          onUpdatePlan={onUpdatePlan}
          dollarMode={dollarMode}
          onToggleDollarMode={onToggleDollarMode}
          viewMode={viewMode}
          onToggleViewMode={onToggleViewMode}
        />
      )}

      {/* SUB-TAB 3: ROTH CONVERSIONS */}
      {activeSubTab === 'roth-conversion' && (
        <RothConversionTab
          plan={plan}
          onUpdatePlan={onUpdatePlan}
          dollarMode={dollarMode}
          onToggleDollarMode={onToggleDollarMode}
          viewMode={viewMode}
          onToggleViewMode={onToggleViewMode}
        />
      )}

      {/* SUB-TAB 4: IRMAA SURCHARGES */}
      {activeSubTab === 'irmaa' && (
        <IrmaaTab
          plan={plan}
          onUpdatePlan={onUpdatePlan}
          dollarMode={dollarMode}
          onToggleDollarMode={onToggleDollarMode}
          viewMode={viewMode}
          onToggleViewMode={onToggleViewMode}
        />
      )}
    </MobileTabSwipeContainer>
  );
}

function ScenarioStrategyTooltip({ active, payload, activeMethod, activeRoth }: any) {
  if (!active || !payload || !payload.length) return null;
  const data = payload[0].payload;
  const age = data.age;

  return (
    <div className="bg-background/95 backdrop-blur-md border border-border rounded-xl p-3.5 shadow-xl text-xs space-y-2.5 min-w-[260px] max-w-[320px] z-50">
      <div className="flex items-center justify-between border-b border-border pb-1.5 font-bold">
        <span className="text-foreground font-mono">Age {age}</span>
        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full border border-primary/20 bg-primary/10 text-primary font-sans">
          Strategy Comparison
        </span>
      </div>

      <div className="space-y-1.5 font-mono">
        <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider font-sans pb-0.5 border-b border-border/50">
          Projected Net Worth
        </div>
        <div className="space-y-1 text-[11px] font-sans">
          {payload.map((entry: any) => {
            const isCurrentActive =
              (entry.dataKey === 'roth_ladder' && activeRoth) ||
              (entry.dataKey !== 'roth_ladder' && !activeRoth && entry.dataKey === activeMethod) ||
              (entry.dataKey === 'textbook' && activeMethod === 'textbook' && !activeRoth);

            return (
              <div
                key={entry.dataKey}
                className={`flex justify-between items-center py-0.5 rounded px-1 -mx-1 ${
                  isCurrentActive ? 'bg-primary/10 font-medium' : ''
                }`}
              >
                <span className="flex items-center gap-1.5 truncate max-w-[170px]" style={{ color: entry.color }}>
                  <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: entry.color }} />
                  <span className="truncate">{entry.name}</span>
                  {isCurrentActive && (
                    <span className="text-[9px] px-1 py-0.2 rounded bg-primary text-primary-foreground font-sans font-bold uppercase shrink-0">
                      Active
                    </span>
                  )}
                </span>
                <span className="font-bold text-foreground font-mono shrink-0">
                  {formatCurrency(Number(entry.value))}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
