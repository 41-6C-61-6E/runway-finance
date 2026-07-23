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
} from 'lucide-react';
import { CollapsibleCardHeader } from '@/components/ui/collapsible-card-header';
import { useCardCollapsed } from '@/lib/hooks/use-card-collapsed';

interface RothConversionTabProps {
  plan: any;
  onUpdatePlan?: (updates: any) => void;
}

export function RothConversionTab({ plan, onUpdatePlan }: RothConversionTabProps) {
  const [enableRoth, setEnableRoth] = useState<boolean>(Boolean(plan?.settings?.enableRothConversions));
  const [targetCeiling, setTargetCeiling] = useState<'top_of_10' | 'top_of_12' | 'top_of_22' | 'top_of_24' | 'top_of_32'>(
    (plan?.settings?.rothConversionTargetCeiling as any) || 'top_of_12'
  );
  const [avoidIrmaa, setAvoidIrmaa] = useState<boolean>(plan?.settings?.avoidIrmaaCliffs !== false);

  const [isOverviewCollapsed, setIsOverviewCollapsed] = useCardCollapsed('roth_overview');
  const [isComparisonCollapsed, setIsComparisonCollapsed] = useCardCollapsed('roth_comparison');
  const [isScheduleCollapsed, setIsScheduleCollapsed] = useCardCollapsed('roth_schedule');

  const [appliedMsg, setAppliedMsg] = useState<string>('');

  // Helper to convert DB plan to EnginePlan object
  const buildEnginePlan = (enable: boolean, ceiling: string, irmaaGuard: boolean): EnginePlan => {
    const planAccountsList = Array.isArray(plan?.accounts) ? plan.accounts : [];
    const activeAccounts = planAccountsList.filter((a: any) => a.isIncluded !== false);

    return {
      id: plan?.id || 'plan_1',
      name: plan?.name || 'Primary Plan',
      hasSpouse: Boolean(plan?.hasSpouse),
      primaryBirthYear: Number(plan?.primaryBirthYear) || 1985,
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
      retirementAge: Number(plan?.retirementAge) || 60,
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
    const maxRmd = Math.max(...simNoRoth.yearlyResults.map((y: any) => y.rmdAmount || 0));
    return { endNW, totalTaxes, maxRmd };
  }, [simNoRoth]);

  const summaryActive = useMemo(() => {
    const lastYr = simActive.yearlyResults[simActive.yearlyResults.length - 1];
    const endNW = lastYr?.netWorth || 0;
    const totalTaxes = simActive.yearlyResults.reduce((s: number, y: any) => s + (y.taxesPaid || 0), 0);
    const maxRmd = Math.max(...simActive.yearlyResults.map((y: any) => y.rmdAmount || 0));
    return { endNW, totalTaxes, maxRmd };
  }, [simActive]);

  const chartData = useMemo(() => {
    return simNoRoth.yearlyResults.map((y, idx) => ({
      age: y.primaryAge,
      noRoth: Math.round(y.netWorth),
      withRoth: Math.round(simActive.yearlyResults[idx]?.netWorth || 0),
    }));
  }, [simNoRoth, simActive]);

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

  const handleSaveToPlan = () => {
    if (!onUpdatePlan) return;
    onUpdatePlan({
      settings: {
        enableRothConversions: enableRoth,
        rothConversionTargetCeiling: targetCeiling,
        avoidIrmaaCliffs: avoidIrmaa,
      },
    });
    setAppliedMsg(`Successfully saved Roth Conversion settings (Active: ${enableRoth ? 'Yes' : 'No'}, Ceiling: ${targetCeiling}) to plan!`);
    setTimeout(() => setAppliedMsg(''), 4000);
  };

  return (
    <div className="space-y-6">
      {/* Toast Banner */}
      {appliedMsg && (
        <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-3.5 text-xs text-emerald-600 dark:text-emerald-400 font-bold flex items-center justify-between animate-in fade-in">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-500" />
            <span>{appliedMsg}</span>
          </div>
        </div>
      )}

      {/* Header Summary KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-card border border-border p-4 rounded-2xl shadow-sm space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold text-muted-foreground">Traditional Pre-Tax Balance</span>
            <DollarSign className="w-4 h-4 text-amber-500" />
          </div>
          <div className="text-xl font-bold font-mono text-amber-500">{formatCurrency(accountTotals.preTax)}</div>
          <span className="text-[10px] text-muted-foreground block">Subject to mandatory RMD tax drag at 75</span>
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
            <span className="text-[11px] font-semibold text-muted-foreground">Max Age 75 RMD (No Roth)</span>
            <AlertTriangle className="w-4 h-4 text-rose-400" />
          </div>
          <div className="text-xl font-bold font-mono text-foreground">{formatCurrency(summaryNoRoth.maxRmd)}</div>
          <span className="text-[10px] text-muted-foreground block">Reduced to {formatCurrency(summaryActive.maxRmd)} with conversions</span>
        </div>

        <div className="bg-card border border-border p-4 rounded-2xl shadow-sm space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold text-muted-foreground">Lifetime Net Worth Impact</span>
            <Sparkles className="w-4 h-4 text-emerald-500" />
          </div>
          <div className={`text-xl font-bold font-mono ${summaryActive.endNW >= summaryNoRoth.endNW ? 'text-emerald-500' : 'text-rose-500'}`}>
            {summaryActive.endNW >= summaryNoRoth.endNW ? `+${formatCurrency(summaryActive.endNW - summaryNoRoth.endNW)}` : formatCurrency(summaryActive.endNW - summaryNoRoth.endNW)}
          </div>
          <span className="text-[10px] text-muted-foreground block">Ending net worth difference</span>
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
                    onChange={(e) => setEnableRoth(e.target.checked)}
                    className="w-4 h-4 accent-primary rounded cursor-pointer"
                  />
                  <label htmlFor="enableRothCheck" className="text-xs font-semibold text-muted-foreground cursor-pointer">
                    {enableRoth ? 'Roth Conversions Active' : 'Disabled (No Conversions)'}
                  </label>
                </div>
                <span className="text-[10px] text-muted-foreground block">
                  Converts funds between retirement age and age 74.
                </span>
              </div>

              {/* Select Target Tax Bracket */}
              <div className="space-y-2">
                <label className="font-bold text-foreground block">Target Bracket Ceiling</label>
                <select
                  value={targetCeiling}
                  onChange={(e: any) => setTargetCeiling(e.target.value)}
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
                    onChange={(e) => setAvoidIrmaa(e.target.checked)}
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

            {/* Save Action Bar */}
            <div className="flex items-center justify-between pt-2">
              <div className="text-xs text-muted-foreground">
                Lifetime Taxes Paid with selected strategy: <strong className="text-foreground font-mono">{formatCurrency(summaryActive.totalTaxes)}</strong>
              </div>
              <button
                onClick={handleSaveToPlan}
                className="bg-primary hover:bg-primary/90 text-primary-foreground text-xs font-bold px-5 py-2.5 rounded-xl shadow-md transition-all cursor-pointer"
              >
                Apply Roth Conversion Settings to Active Plan
              </button>
            </div>
          </div>
        )}
      </div>

      {/* SECTION 2: COMPARATIVE TRAJECTORY CHART */}
      <div className="bg-card border border-border rounded-2xl shadow-sm overflow-hidden">
        <CollapsibleCardHeader
          title="Comparative Trajectory: No Conversions vs Optimized Roth Ladder"
          description="Visualize the long-term net worth impact of avoiding RMD tax drag versus taking no action"
          icon={TrendingUp}
          isCollapsed={isComparisonCollapsed}
          onToggle={() => setIsComparisonCollapsed(!isComparisonCollapsed)}
        />

        {!isComparisonCollapsed && (
          <div className="p-5 space-y-6">
            <div className="h-72 w-full pt-2">
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
                  <Tooltip
                    formatter={(value: any) => [formatCurrency(Number(value)), 'Net Worth']}
                    labelFormatter={(label) => `Age ${label}`}
                    contentStyle={{ backgroundColor: 'rgba(15, 23, 42, 0.95)', borderColor: '#334155', borderRadius: '12px', fontSize: '11px', color: '#fff' }}
                  />
                  <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '8px' }} />
                  <Line type="monotone" dataKey="noRoth" name="No Conversions (Default)" stroke="#94a3b8" strokeWidth={2} strokeDasharray="4 4" dot={false} />
                  <Line type="monotone" dataKey="withRoth" name="With Roth Conversion Strategy" stroke="#ec4899" strokeWidth={3} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>

            {/* Metrics Comparison Table */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
              <div className="bg-card border border-border p-4 rounded-xl space-y-2">
                <h5 className="font-bold text-foreground">No Conversions Strategy</h5>
                <ul className="space-y-1 text-[11px] text-muted-foreground font-mono">
                  <li>Ending Net Worth: <strong className="text-foreground">{formatCurrency(summaryNoRoth.endNW)}</strong></li>
                  <li>Lifetime Taxes Paid: <strong className="text-rose-400">{formatCurrency(summaryNoRoth.totalTaxes)}</strong></li>
                  <li>Max Age 75 RMD: <strong className="text-amber-500">{formatCurrency(summaryNoRoth.maxRmd)}</strong></li>
                </ul>
              </div>

              <div className="bg-emerald-500/5 border border-emerald-500/20 p-4 rounded-xl space-y-2">
                <h5 className="font-bold text-emerald-500">Selected Conversion Strategy</h5>
                <ul className="space-y-1 text-[11px] text-muted-foreground font-mono">
                  <li>Ending Net Worth: <strong className="text-emerald-500">{formatCurrency(summaryActive.endNW)}</strong></li>
                  <li>Lifetime Taxes Paid: <strong className="text-foreground">{formatCurrency(summaryActive.totalTaxes)}</strong></li>
                  <li>Max Age 75 RMD: <strong className="text-emerald-500">{formatCurrency(summaryActive.maxRmd)}</strong></li>
                </ul>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* SECTION 3: ANNUAL CONVERSION SCHEDULE TABLE */}
      <div className="bg-card border border-border rounded-2xl shadow-sm overflow-hidden">
        <CollapsibleCardHeader
          title="Projected Annual Conversion & RMD Timeline"
          description="View annual estimated conversion amounts, taxes incurred, and Roth balance growth"
          icon={Calendar}
          isCollapsed={isScheduleCollapsed}
          onToggle={() => setIsScheduleCollapsed(!isScheduleCollapsed)}
        />

        {!isScheduleCollapsed && (
          <div className="p-5">
            <div className="max-h-72 overflow-y-auto border border-border rounded-xl">
              <table className="w-full text-xs text-left">
                <thead className="bg-muted/80 text-muted-foreground font-semibold sticky top-0 backdrop-blur-sm">
                  <tr>
                    <th className="px-3 py-2">Age</th>
                    <th className="px-3 py-2 text-right">Roth Conversion</th>
                    <th className="px-3 py-2 text-right">Taxes Paid</th>
                    <th className="px-3 py-2 text-right">Mandatory RMD</th>
                    <th className="px-3 py-2 text-right">Pre-Tax Balance</th>
                    <th className="px-3 py-2 text-right">Roth Balance</th>
                    <th className="px-3 py-2 text-right">Ending Net Worth</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/40">
                  {simActive.yearlyResults
                    .filter((y: any) => y.age >= (plan?.retirementAge || 60))
                    .map((y: any) => (
                      <tr key={y.year} className="hover:bg-muted/40 font-mono">
                        <td className="px-3 py-2 font-bold text-foreground font-sans">Age {y.age}</td>
                        <td className="px-3 py-2 text-right text-rose-500 font-bold">{formatCurrency(y.rothConversionAmount || 0)}</td>
                        <td className="px-3 py-2 text-right text-rose-400">{formatCurrency(y.taxesPaid || 0)}</td>
                        <td className="px-3 py-2 text-right text-amber-500 font-medium">{formatCurrency(y.rmdAmount || 0)}</td>
                        <td className="px-3 py-2 text-right text-muted-foreground">{formatCurrency(y.portfolioBreakdown?.taxDeferred || 0)}</td>
                        <td className="px-3 py-2 text-right text-emerald-500 font-medium">{formatCurrency(y.portfolioBreakdown?.taxFree || 0)}</td>
                        <td className="px-3 py-2 text-right font-bold text-foreground">{formatCurrency(y.netWorth || 0)}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
