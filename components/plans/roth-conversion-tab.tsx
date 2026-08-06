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
  ReferenceArea,
} from 'recharts';
import {
  Flame,
  CheckCircle2,
  Calendar,
  DollarSign,
  TrendingUp,
  Sparkles,
  ShieldCheck,
  Zap,
  Sliders,
  AlertTriangle,
  Layers,
  Filter,
  ArrowRight,
  Info,
} from 'lucide-react';
import { CollapsibleCardHeader } from '@/components/ui/collapsible-card-header';
import { useCardCollapsed } from '@/lib/hooks/use-card-collapsed';

import { ProjectionOptionsPopover } from './projection-options-popover';

interface RothConversionTabProps {
  plan: any;
  onUpdatePlan?: (updates: any) => void;
  dollarMode?: 'real' | 'nominal';
  onToggleDollarMode?: (mode: 'real' | 'nominal') => void;
  viewMode?: 'deterministic' | 'monte_carlo';
  onToggleViewMode?: (mode: 'deterministic' | 'monte_carlo') => void;
}

export function RothConversionTab({
  plan,
  onUpdatePlan,
  dollarMode = 'real',
  onToggleDollarMode = () => {},
  viewMode = 'deterministic',
  onToggleViewMode = () => {},
}: RothConversionTabProps) {
  const [enableRoth, setEnableRoth] = useState<boolean>(Boolean(plan?.settings?.enableRothConversions));
  const [targetCeiling, setTargetCeiling] = useState<'top_of_10' | 'top_of_12' | 'top_of_22' | 'top_of_24' | 'top_of_32'>(
    (plan?.settings?.rothConversionTargetCeiling as any) || 'top_of_12'
  );
  const [avoidIrmaa, setAvoidIrmaa] = useState<boolean>(plan?.settings?.avoidIrmaaCliffs !== false);

  const [chartView, setChartView] = useState<'net_worth' | 'account_balances'>('net_worth');
  const [scheduleFilter, setScheduleFilter] = useState<'conversion_window' | 'all'>('conversion_window');

  const [isOverviewCollapsed, setIsOverviewCollapsed] = useCardCollapsed('roth_overview');
  const [isComparisonCollapsed, setIsComparisonCollapsed] = useCardCollapsed('roth_comparison');
  const [isScheduleCollapsed, setIsScheduleCollapsed] = useCardCollapsed('roth_schedule');

  const [appliedMsg, setAppliedMsg] = useState<string>('');

  const retirementAge = Number(plan?.retirementAge) || 60;
  const primaryBirthYear = Number(plan?.primaryBirthYear) || 1985;
  const rmdStartAge = primaryBirthYear >= 1960 ? 75 : 73;

  // Helper to convert DB plan to EnginePlan object
  const buildEnginePlan = (enable: boolean, ceiling: string, irmaaGuard: boolean): EnginePlan => {
    const planAccountsList = Array.isArray(plan?.accounts) ? plan.accounts : [];
    const activeAccounts = planAccountsList.filter((a: any) => a.isIncluded !== false);

    return {
      id: plan?.id || 'plan_1',
      name: plan?.name || 'Primary Plan',
      hasSpouse: Boolean(plan?.hasSpouse),
      primaryBirthYear,
      primaryBirthMonth: Number(plan?.primaryBirthMonth) || 1,
      spouseBirthYear: plan?.spouseBirthYear ? Number(plan.spouseBirthYear) : undefined,
      spouseBirthMonth: plan?.spouseBirthMonth ? Number(plan.spouseBirthMonth) : undefined,
      spouseName: plan?.spouseName || 'Spouse / Partner',
      spouseRetirementAge: plan?.spouseRetirementAge ? Number(plan.spouseRetirementAge) : 60,
      spouseLifeExpectancyAge: plan?.spouseLifeExpectancyAge ? Number(plan.spouseLifeExpectancyAge) : 100,
      primarySsMonthlyAmount: plan?.primarySsMonthlyAmount ? parseFloat(plan.primarySsMonthlyAmount) : 2500,
      primarySsStartAge: plan?.primarySsStartAge ? Number(plan.primarySsStartAge) : 67,
      spouseSsMonthlyAmount: plan?.spouseSsMonthlyAmount ? parseFloat(plan.spouseSsMonthlyAmount) : 2000,
      spouseSsStartAge: plan?.spouseSsStartAge ? Number(plan.spouseSsStartAge) : 67,
      enableSpousalSsBenefit: plan?.enableSpousalSsBenefit !== false,
      filingStatus: plan?.filingStatus || 'single',
      retirementAge,
      lifeExpectancyAge: Number(plan?.lifeExpectancyAge) || 100,
      withdrawalMethod: plan?.settings?.withdrawalMethod || plan?.withdrawalMethod || 'textbook',
      primarySalary: parseFloat(plan?.primarySalary) || 0,
      spouseSalary: parseFloat(plan?.spouseSalary) || 0,
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
      events: (plan?.events || []).map((e: any) => ({
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
      flows: [],
      settings: {
        fixedInflationRate: parseFloat(plan?.settings?.fixedInflationRate || '3.0'),
        enableRothConversions: enable,
        rothConversionTargetCeiling: ceiling as any,
        avoidIrmaaCliffs: irmaaGuard,
        withdrawalMethod: plan?.settings?.withdrawalMethod || plan?.withdrawalMethod || 'textbook',
      },
      rules: plan?.rules || DEFAULT_2026_RULES,
    };
  };

  const simNoRoth = useMemo(() => runRetirementSimulation(buildEnginePlan(false, 'top_of_12', false)), [plan]);
  const simActive = useMemo(() => runRetirementSimulation(buildEnginePlan(enableRoth, targetCeiling, avoidIrmaa)), [plan, enableRoth, targetCeiling, avoidIrmaa]);

  const summaryNoRoth = useMemo(() => {
    const lastYr = simNoRoth.yearlyResults[simNoRoth.yearlyResults.length - 1];
    const endNW = lastYr?.netWorth || 0;
    const totalTaxes = simNoRoth.yearlyResults.reduce((s: number, y: any) => s + (y.taxesPaid || 0), 0);
    const maxRmd = Math.max(...simNoRoth.yearlyResults.map((y: any) => y.rmdMandatoryDrawdown || y.rmdAmount || 0));
    return { endNW, totalTaxes, maxRmd };
  }, [simNoRoth]);

  const summaryActive = useMemo(() => {
    const lastYr = simActive.yearlyResults[simActive.yearlyResults.length - 1];
    const endNW = lastYr?.netWorth || 0;
    const totalTaxes = simActive.yearlyResults.reduce((s: number, y: any) => s + (y.taxesPaid || 0), 0);
    const maxRmd = Math.max(...simActive.yearlyResults.map((y: any) => y.rmdMandatoryDrawdown || y.rmdAmount || 0));
    const totalConverted = simActive.yearlyResults.reduce((s: number, y: any) => s + (y.rothConversionAmount || 0), 0);
    const conversionWindowResults = simActive.yearlyResults.filter(
      (y: any) => (y.primaryAge ?? y.age) >= retirementAge && (y.primaryAge ?? y.age) < rmdStartAge
    );
    const conversionWindowTaxes = conversionWindowResults.reduce((s: number, y: any) => s + (y.taxesPaid || 0), 0);
    const conversionYearsCount = conversionWindowResults.filter((y: any) => (y.rothConversionAmount || 0) > 0).length;

    return { endNW, totalTaxes, maxRmd, totalConverted, conversionWindowTaxes, conversionYearsCount };
  }, [simActive, retirementAge, rmdStartAge]);

  const chartData = useMemo(() => {
    return simNoRoth.yearlyResults.map((y, idx) => {
      const activeY: any = simActive.yearlyResults[idx] || {};
      const age = y.primaryAge ?? (y as any).age;
      return {
        age,
        noRoth: Math.round(y.netWorth),
        withRoth: Math.round(activeY.netWorth || 0),
        preTaxNoRoth: Math.round(y.portfolioBreakdown?.taxDeferred || 0),
        rothNoRoth: Math.round(y.portfolioBreakdown?.taxFree || 0),
        preTaxActive: Math.round(activeY.portfolioBreakdown?.taxDeferred || 0),
        rothActive: Math.round(activeY.portfolioBreakdown?.taxFree || 0),
        conversionAmt: activeY.rothConversionAmount || 0,
        taxesPaidActive: activeY.taxesPaid || 0,
        taxesPaidNoRoth: y.taxesPaid || 0,
        headroom: activeY.rothBracketHeadroom || 0,
        rmdActive: activeY.rmdMandatoryDrawdown || activeY.rmdAmount || 0,
        rmdNoRoth: y.rmdMandatoryDrawdown || (y as any).rmdAmount || 0,
        retirementAge,
        rmdStartAge,
      };
    });
  }, [simNoRoth, simActive, retirementAge, rmdStartAge]);

  const accountTotals = useMemo(() => {
    const accs = Array.isArray(plan?.accounts) ? plan.accounts : [];
    let preTax = 0;
    let roth = 0;
    for (const a of accs) {
      if (a.isIncluded === false) continue;
      const bal = parseFloat(a.balance) || 0;
      const type = (a.type || '').toLowerCase();
      if (type.includes('traditional') || type === '401k' || type === 'ira') preTax += bal;
      else if (type.includes('roth')) roth += bal;
    }
    return { preTax, roth };
  }, [plan]);

  const updatePlanSettings = (overrides?: Partial<{
    enableRothConversions: boolean;
    rothConversionTargetCeiling: string;
    avoidIrmaaCliffs: boolean;
  }>) => {
    if (!onUpdatePlan) return;
    onUpdatePlan({
      settings: {
        ...plan?.settings,
        enableRothConversions: overrides?.enableRothConversions ?? enableRoth,
        rothConversionTargetCeiling: overrides?.rothConversionTargetCeiling ?? targetCeiling,
        avoidIrmaaCliffs: overrides?.avoidIrmaaCliffs ?? avoidIrmaa,
      },
    });
  };

  const getPhaseForAge = (age: number) => {
    if (age < retirementAge) return { name: 'Accumulation', color: 'bg-muted text-muted-foreground border-border' };
    if (age >= retirementAge && age < rmdStartAge) return { name: 'Conversion Window', color: 'bg-pink-500/10 text-pink-500 border-pink-500/30 font-bold' };
    return { name: 'RMD & Legacy', color: 'bg-amber-500/10 text-amber-500 border-amber-500/30 font-semibold' };
  };

  return (
    <div className="space-y-6">
      {/* Toast Notification */}
      {appliedMsg && (
        <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-3.5 text-xs text-emerald-600 dark:text-emerald-400 font-bold flex items-center justify-between animate-in fade-in">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-500" />
            <span>{appliedMsg}</span>
          </div>
        </div>
      )}

      {/* Header KPI Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-card border border-border p-4 rounded-2xl shadow-sm space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold text-muted-foreground">Pre-Tax Traditional Balance</span>
            <Layers className="w-4 h-4 text-amber-500" />
          </div>
          <div className="text-xl font-bold font-mono text-foreground">{formatCurrency(accountTotals.preTax)}</div>
          <span className="text-[10px] text-muted-foreground block">Subject to ordinary tax & mandatory RMDs</span>
        </div>

        <div className="bg-card border border-border p-4 rounded-2xl shadow-sm space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold text-muted-foreground">Tax-Free Roth Balance</span>
            <Flame className="w-4 h-4 text-rose-500" />
          </div>
          <div className="text-xl font-bold font-mono text-rose-500">{formatCurrency(accountTotals.roth)}</div>
          <span className="text-[10px] text-muted-foreground block">Grows and withdraws 100% tax-free</span>
        </div>

        <div className="bg-card border border-border p-4 rounded-2xl shadow-sm space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold text-muted-foreground">Max Age {rmdStartAge} RMD</span>
            <AlertTriangle className="w-4 h-4 text-rose-400" />
          </div>
          <div className="text-xl font-bold font-mono text-foreground">
            {enableRoth ? formatCurrency(summaryActive.maxRmd) : formatCurrency(summaryNoRoth.maxRmd)}
          </div>
          <span className="text-[10px] text-muted-foreground block">
            {enableRoth
              ? `Reduced from ${formatCurrency(summaryNoRoth.maxRmd)} baseline`
              : `Can be reduced to ${formatCurrency(summaryActive.maxRmd)} via ladder`}
          </span>
        </div>

        <div className="bg-card border border-border p-4 rounded-2xl shadow-sm space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold text-muted-foreground">Lifetime Net Worth Advantage</span>
            <Sparkles className="w-4 h-4 text-emerald-500" />
          </div>
          <div className={`text-xl font-bold font-mono ${summaryActive.endNW >= summaryNoRoth.endNW ? 'text-emerald-500' : 'text-rose-500'}`}>
            {summaryActive.endNW >= summaryNoRoth.endNW ? `+${formatCurrency(summaryActive.endNW - summaryNoRoth.endNW)}` : formatCurrency(summaryActive.endNW - summaryNoRoth.endNW)}
          </div>
          <span className="text-[10px] text-muted-foreground block">Net ending wealth gain from conversions</span>
        </div>
      </div>

      {/* SECTION 1: ROTH CONVERSION STRATEGY CONTROLS */}
      <div className="bg-card border border-border rounded-2xl shadow-sm overflow-hidden">
        <CollapsibleCardHeader
          title="Roth Conversion Ladder & Bracket Headroom Controls"
          description="Systematically convert pre-tax traditional IRA/401(k) assets to tax-free Roth during low-income retirement years"
          icon={Flame}
          isCollapsed={isOverviewCollapsed}
          onToggle={() => setIsOverviewCollapsed(!isOverviewCollapsed)}
        />

        {!isOverviewCollapsed && (
          <div className="p-5 space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 bg-muted/20 p-4 rounded-xl border border-border text-xs">
              {/* Toggle Enable Roth Conversions */}
              <div className="space-y-2">
                <label className="font-bold text-foreground block">Enable Roth Conversion Strategy</label>
                <div className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    id="enableRothCheck"
                    checked={enableRoth}
                    onChange={(e) => {
                      const val = e.target.checked;
                      setEnableRoth(val);
                      updatePlanSettings({ enableRothConversions: val });
                    }}
                    className="w-4 h-4 accent-primary rounded cursor-pointer"
                  />
                  <label htmlFor="enableRothCheck" className="text-xs font-semibold text-muted-foreground cursor-pointer">
                    {enableRoth ? 'Roth Conversions Active' : 'Disabled (No Conversions)'}
                  </label>
                </div>
                <span className="text-[10px] text-muted-foreground block">
                  Executes conversions between retirement (Age {retirementAge}) and RMD start (Age {rmdStartAge}).
                </span>
              </div>

              {/* Select Target Tax Bracket */}
              <div className="space-y-2">
                <label className="font-bold text-foreground block">Target Bracket Ceiling</label>
                <select
                  value={targetCeiling}
                  onChange={(e: any) => {
                    const val = e.target.value;
                    setTargetCeiling(val);
                    updatePlanSettings({ rothConversionTargetCeiling: val });
                  }}
                  disabled={!enableRoth}
                  className="w-full bg-background border border-border rounded-lg px-3 py-2 text-xs text-foreground font-medium focus:ring-1 focus:ring-primary disabled:opacity-50"
                >
                  <option value="top_of_10">Top of 10% Bracket ($23.8k MFJ / $11.9k Single)</option>
                  <option value="top_of_12">Top of 12% Bracket ($96.9k MFJ / $48.4k Single) [Recommended]</option>
                  <option value="top_of_22">Top of 22% Bracket ($206.7k MFJ / $103.3k Single)</option>
                  <option value="top_of_24">Top of 24% Bracket ($394.6k MFJ / $197.3k Single)</option>
                  <option value="top_of_32">Top of 32% Bracket ($501.0k MFJ / $250.5k Single)</option>
                </select>
                <span className="text-[10px] text-muted-foreground block">
                  Fills up to the chosen tax bracket headroom each year.
                </span>
              </div>

              {/* IRMAA Guardrail Checkbox */}
              <div className="space-y-2">
                <label className="font-bold text-foreground block">Medicare IRMAA Cliff Guard</label>
                <div className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    id="avoidIrmaaCheck"
                    checked={avoidIrmaa}
                    onChange={(e) => {
                      const val = e.target.checked;
                      setAvoidIrmaa(val);
                      updatePlanSettings({ avoidIrmaaCliffs: val });
                    }}
                    disabled={!enableRoth}
                    className="w-4 h-4 accent-primary rounded cursor-pointer disabled:opacity-50"
                  />
                  <label htmlFor="avoidIrmaaCheck" className="text-xs font-semibold text-muted-foreground cursor-pointer">
                    {avoidIrmaa ? 'Avoid IRMAA Cliffs (Headroom - $1,000)' : 'No IRMAA Cap'}
                  </label>
                </div>
                <span className="text-[10px] text-muted-foreground block">
                  Caps conversions $1,000 below Medicare Part B & D surcharges starting at age 63.
                </span>
              </div>
            </div>

            {/* Active Status Bar */}
            <div className="flex items-center justify-between pt-2">
              <div className="text-xs text-muted-foreground">
                Lifetime Taxes Paid with selected strategy: <strong className="text-foreground font-mono">{formatCurrency(summaryActive.totalTaxes)}</strong>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* SECTION 2: COMPARATIVE TRAJECTORY CHART */}
      <div className="bg-card border border-border rounded-2xl shadow-sm overflow-hidden">
        <CollapsibleCardHeader
          title="Comparative Trajectory: Baseline vs Optimized Roth Ladder"
          description="Visualize long-term net worth impact and account balance composition over your retirement lifetime"
          icon={TrendingUp}
          isCollapsed={isComparisonCollapsed}
          onToggle={() => setIsComparisonCollapsed(!isComparisonCollapsed)}
          actions={
            <div className="flex items-center gap-3">
              {/* Toggle Chart View */}
              <div className="bg-muted p-1 rounded-lg flex items-center gap-1 border border-border text-xs">
                <button
                  onClick={() => setChartView('net_worth')}
                  className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition-all ${
                    chartView === 'net_worth'
                      ? 'bg-background text-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  Net Worth Comparison
                </button>
                <button
                  onClick={() => setChartView('account_balances')}
                  className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition-all ${
                    chartView === 'account_balances'
                      ? 'bg-background text-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  Pre-Tax vs. Roth Balances
                </button>
              </div>

              <ProjectionOptionsPopover
                dollarMode={dollarMode}
                onToggleDollarMode={onToggleDollarMode}
                viewMode={viewMode}
                onToggleViewMode={onToggleViewMode}
              />
            </div>
          }
        />

        {!isComparisonCollapsed && (
          <div className="p-5 space-y-6">
            {/* Chart Legend Callout Banner */}
            <div className="flex items-center justify-between text-xs bg-muted/20 border border-border p-3 rounded-xl">
              <div className="flex items-center gap-2 text-muted-foreground">
                <Info className="w-4 h-4 text-primary shrink-0" />
                <span>
                  {chartView === 'net_worth'
                    ? 'Note: Upfront conversion taxes cause a temporary net worth dip during conversion years (shaded pink area), followed by long-term outperformance as RMD tax drag is avoided.'
                    : 'Shows how pre-tax balances decrease while Roth balances compound tax-free over time.'}
                </span>
              </div>
              <div className="flex items-center gap-4 text-[11px] font-medium shrink-0">
                <span className="flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded-xs bg-pink-500/20 border border-pink-500/50 inline-block" />
                  Conversion Window (Ages {retirementAge}–{rmdStartAge - 1})
                </span>
              </div>
            </div>

            <div className="h-80 w-full pt-2">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
                  <XAxis dataKey="age" stroke="#888888" fontSize={11} tickLine={false} />
                  <YAxis
                    stroke="#888888"
                    fontSize={10}
                    tickFormatter={(v) => `$${(v / 1000000).toFixed(1)}M`}
                    tickLine={false}
                  />
                  <Tooltip content={<RothConversionTooltip chartView={chartView} />} wrapperStyle={{ zIndex: 100, opacity: 1 }} />
                  <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '8px' }} />

                  {/* Shaded Conversion Ladder Window */}
                  <ReferenceArea
                    x1={retirementAge}
                    x2={rmdStartAge - 1}
                    fill="#ec4899"
                    fillOpacity={0.08}
                    stroke="#ec4899"
                    strokeDasharray="2 2"
                    strokeOpacity={0.25}
                    label={{
                      value: `Roth Conversion Window (Ages ${retirementAge}–${rmdStartAge - 1})`,
                      position: 'top',
                      fill: '#ec4899',
                      fontSize: 10,
                      fontWeight: 600,
                    }}
                  />

                  {chartView === 'net_worth' ? (
                    <>
                      <Line
                        type="monotone"
                        dataKey="noRoth"
                        name="No Conversions (Baseline)"
                        stroke="#94a3b8"
                        strokeWidth={2}
                        strokeDasharray="4 4"
                        dot={false}
                      />
                      <Line
                        type="monotone"
                        dataKey="withRoth"
                        name="With Roth Conversion Strategy"
                        stroke="#ec4899"
                        strokeWidth={3}
                        dot={false}
                      />
                    </>
                  ) : (
                    <>
                      <Line
                        type="monotone"
                        dataKey="preTaxNoRoth"
                        name="Traditional Pre-Tax (Baseline)"
                        stroke="#f59e0b"
                        strokeWidth={2}
                        strokeDasharray="4 4"
                        dot={false}
                      />
                      <Line
                        type="monotone"
                        dataKey="preTaxActive"
                        name="Traditional Pre-Tax (With Conversion)"
                        stroke="#d97706"
                        strokeWidth={3}
                        dot={false}
                      />
                      <Line
                        type="monotone"
                        dataKey="rothNoRoth"
                        name="Tax-Free Roth (Baseline)"
                        stroke="#38bdf8"
                        strokeWidth={2}
                        strokeDasharray="4 4"
                        dot={false}
                      />
                      <Line
                        type="monotone"
                        dataKey="rothActive"
                        name="Tax-Free Roth (With Conversion)"
                        stroke="#ec4899"
                        strokeWidth={3}
                        dot={false}
                      />
                    </>
                  )}
                </LineChart>
              </ResponsiveContainer>
            </div>

            {/* Metrics Comparison Table */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
              <div className="bg-card border border-border p-4 rounded-xl space-y-2">
                <h5 className="font-bold text-foreground flex items-center justify-between">
                  <span>Baseline (No Conversions)</span>
                  <span className="text-[10px] font-normal text-muted-foreground">Standard Drawdown</span>
                </h5>
                <ul className="space-y-1 text-[11px] text-muted-foreground font-mono">
                  <li>Ending Net Worth: <strong className="text-foreground">{formatCurrency(summaryNoRoth.endNW)}</strong></li>
                  <li>Lifetime Taxes Paid: <strong className="text-rose-400">{formatCurrency(summaryNoRoth.totalTaxes)}</strong></li>
                  <li>Max Annual RMD (Age {rmdStartAge}+): <strong className="text-amber-500">{formatCurrency(summaryNoRoth.maxRmd)}</strong></li>
                </ul>
              </div>

              <div className="bg-emerald-500/5 border border-emerald-500/20 p-4 rounded-xl space-y-2">
                <h5 className="font-bold text-emerald-500 flex items-center justify-between">
                  <span>Selected Conversion Strategy</span>
                  <span className="text-[10px] font-bold text-pink-500 bg-pink-500/10 px-2 py-0.5 rounded-md">Optimized</span>
                </h5>
                <ul className="space-y-1 text-[11px] text-muted-foreground font-mono">
                  <li>Ending Net Worth: <strong className="text-emerald-500">{formatCurrency(summaryActive.endNW)}</strong></li>
                  <li>Lifetime Taxes Paid: <strong className="text-foreground">{formatCurrency(summaryActive.totalTaxes)}</strong></li>
                  <li>Max Annual RMD (Age {rmdStartAge}+): <strong className="text-emerald-500">{formatCurrency(summaryActive.maxRmd)}</strong></li>
                </ul>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* SECTION 3: ANNUAL CONVERSION SCHEDULE TABLE & TIMELINE */}
      <div className="bg-card border border-border rounded-2xl shadow-sm overflow-hidden">
        <CollapsibleCardHeader
          title="Projected Annual Conversion & RMD Timeline"
          description="Track annual conversion headroom, taxes paid, mandatory RMDs, and account balances by retirement phase"
          icon={Calendar}
          isCollapsed={isScheduleCollapsed}
          onToggle={() => setIsScheduleCollapsed(!isScheduleCollapsed)}
          actions={
            <div className="flex items-center gap-2">
              <div className="bg-muted p-1 rounded-lg flex items-center gap-1 border border-border text-xs">
                <button
                  onClick={() => setScheduleFilter('conversion_window')}
                  className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition-all ${
                    scheduleFilter === 'conversion_window'
                      ? 'bg-background text-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  Conversion Window Only (Ages {retirementAge}–{rmdStartAge - 1})
                </button>
                <button
                  onClick={() => setScheduleFilter('all')}
                  className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition-all ${
                    scheduleFilter === 'all'
                      ? 'bg-background text-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  Full Retirement Timeline
                </button>
              </div>
            </div>
          }
        />

        {!isScheduleCollapsed && (
          <div className="p-5 space-y-5">
            {/* Conversion Summary Banner Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 bg-muted/20 p-4 rounded-xl border border-border text-xs">
              <div className="space-y-1">
                <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider block">Conversion Window</span>
                <div className="text-sm font-bold font-mono text-foreground flex items-center gap-1">
                  <span>Ages {retirementAge} to {rmdStartAge - 1}</span>
                  <span className="text-[11px] font-normal text-muted-foreground">({rmdStartAge - retirementAge} Yrs)</span>
                </div>
                <span className="text-[10px] text-muted-foreground block">Prime low-tax early retirement window</span>
              </div>

              <div className="space-y-1">
                <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider block">Total Amount Converted</span>
                <div className="text-sm font-bold font-mono text-pink-500">
                  {formatCurrency(summaryActive.totalConverted)}
                </div>
                <span className="text-[10px] text-muted-foreground block">Moved from pre-tax to tax-free Roth</span>
              </div>

              <div className="space-y-1">
                <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider block">Total Conversion Tax Paid</span>
                <div className="text-sm font-bold font-mono text-rose-400">
                  {formatCurrency(summaryActive.conversionWindowTaxes)}
                </div>
                <span className="text-[10px] text-muted-foreground block">Paid from cash/brokerage assets</span>
              </div>

              <div className="space-y-1">
                <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider block">Max Annual RMD Reduction</span>
                <div className="text-sm font-bold font-mono text-emerald-500">
                  -{formatCurrency(summaryNoRoth.maxRmd - summaryActive.maxRmd)}/yr
                </div>
                <span className="text-[10px] text-muted-foreground block">Annual taxable RMD saved at age {rmdStartAge}+</span>
              </div>
            </div>

            {/* Schedule Table */}
            <div className="max-h-80 overflow-y-auto border border-border rounded-xl">
              <table className="w-full text-xs text-left">
                <thead className="bg-muted/80 text-muted-foreground font-semibold sticky top-0 backdrop-blur-sm">
                  <tr>
                    <th className="px-3 py-2.5">Age</th>
                    <th className="px-3 py-2.5">Phase</th>
                    <th className="px-3 py-2.5 text-right">Target Headroom</th>
                    <th className="px-3 py-2.5 text-right">Roth Conversion</th>
                    <th className="px-3 py-2.5 text-right">Taxes Paid</th>
                    <th className="px-3 py-2.5 text-right">Mandatory RMD</th>
                    <th className="px-3 py-2.5 text-right">Pre-Tax Balance</th>
                    <th className="px-3 py-2.5 text-right">Roth Balance</th>
                    <th className="px-3 py-2.5 text-right">Ending Net Worth</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/40">
                  {simActive.yearlyResults
                    .filter((y: any) => {
                      const age = y.primaryAge ?? y.age;
                      if (scheduleFilter === 'conversion_window') {
                        return age >= retirementAge && age < rmdStartAge;
                      }
                      return age >= retirementAge;
                    })
                    .map((y: any) => {
                      const age = y.primaryAge ?? y.age;
                      const phase = getPhaseForAge(age);
                      const isConvYear = (y.rothConversionAmount || 0) > 0;
                      return (
                        <tr
                          key={y.year}
                          className={`hover:bg-muted/40 font-mono transition-colors ${
                            isConvYear ? 'bg-pink-500/5' : ''
                          }`}
                        >
                          <td className="px-3 py-2.5 font-bold text-foreground font-sans">Age {age}</td>
                          <td className="px-3 py-2.5 font-sans">
                            <span className={`inline-block text-[10px] px-2 py-0.5 rounded-full border ${phase.color}`}>
                              {phase.name}
                            </span>
                          </td>
                          <td className="px-3 py-2.5 text-right text-muted-foreground font-medium">
                            {y.rothBracketHeadroom ? formatCurrency(y.rothBracketHeadroom) : '—'}
                          </td>
                          <td className="px-3 py-2.5 text-right text-pink-500 font-bold">
                            {y.rothConversionAmount ? formatCurrency(y.rothConversionAmount) : '—'}
                          </td>
                          <td className="px-3 py-2.5 text-right text-rose-400">
                            {formatCurrency(y.taxesPaid || 0)}
                          </td>
                          <td className="px-3 py-2.5 text-right text-amber-500 font-medium">
                            {(y.rmdMandatoryDrawdown || y.rmdAmount) ? formatCurrency(y.rmdMandatoryDrawdown || y.rmdAmount) : '—'}
                          </td>
                          <td className="px-3 py-2.5 text-right text-amber-500/80 font-medium">
                            {formatCurrency(y.portfolioBreakdown?.taxDeferred || 0)}
                          </td>
                          <td className="px-3 py-2.5 text-right text-emerald-500 font-medium">
                            {formatCurrency(y.portfolioBreakdown?.taxFree || 0)}
                          </td>
                          <td className="px-3 py-2.5 text-right font-bold text-foreground">
                            {formatCurrency(y.netWorth || 0)}
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
  );
}

function RothConversionTooltip({ active, payload, chartView }: any) {
  if (!active || !payload || !payload.length) return null;
  const data = payload[0].payload;
  const age = data.age;
  const retirementAge = data.retirementAge || 60;
  const rmdStartAge = data.rmdStartAge || 75;

  const noRothVal = Number(data.noRoth || 0);
  const withRothVal = Number(data.withRoth || 0);
  const diff = withRothVal - noRothVal;
  const convAmt = Number(data.conversionAmt || 0);
  const taxesPaid = Number(data.taxesPaidActive || 0);

  const getPhaseName = (a: number) => {
    if (a < retirementAge) return 'Accumulation';
    if (a >= retirementAge && a < rmdStartAge) return 'Conversion Window';
    return 'RMD Phase';
  };

  return (
    <div className="bg-background/95 backdrop-blur-md border border-border rounded-xl p-3.5 shadow-xl text-xs space-y-2.5 min-w-[280px] max-w-[340px] z-50">
      <div className="flex items-center justify-between border-b border-border pb-1.5 font-bold">
        <span className="text-foreground font-mono">Age {age}</span>
        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full border border-pink-500/30 bg-pink-500/10 text-pink-500 font-sans">
          {getPhaseName(age)}
        </span>
      </div>

      <div className="space-y-1.5 font-mono">
        <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider font-sans pb-0.5 border-b border-border/50">
          {chartView === 'net_worth' ? 'Net Worth Comparison' : 'Account Balances'}
        </div>

        <div className="space-y-1 text-[11px] font-sans">
          {payload.map((entry: any) => {
            return (
              <div
                key={entry.dataKey}
                className="flex justify-between items-center py-0.5 rounded px-1 -mx-1 hover:bg-muted/30"
              >
                <span className="flex items-center gap-1.5 truncate max-w-[190px]" style={{ color: entry.color }}>
                  <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: entry.color }} />
                  <span className="truncate">{entry.name}</span>
                </span>
                <span className="font-bold text-foreground font-mono shrink-0">
                  {formatCurrency(Number(entry.value))}
                </span>
              </div>
            );
          })}
        </div>

        {chartView === 'net_worth' && diff !== 0 && (
          <div className="flex justify-between items-center pt-1.5 border-t border-border/50 text-[11px] font-sans">
            <span className="text-muted-foreground font-semibold">Net Strategy Advantage:</span>
            <span className={`font-mono font-bold ${diff >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
              {diff >= 0 ? '+' : ''}{formatCurrency(diff)}
            </span>
          </div>
        )}

        {convAmt > 0 && (
          <div className="pt-1.5 border-t border-border/50 space-y-1 text-[10px] font-sans">
            <div className="flex justify-between items-center text-pink-500 font-bold">
              <span>Roth Conversion Executed:</span>
              <span className="font-mono">{formatCurrency(convAmt)}</span>
            </div>
            <div className="flex justify-between items-center text-muted-foreground">
              <span>Taxes Incurred (Debited):</span>
              <span className="font-mono text-rose-400">{formatCurrency(taxesPaid)}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
