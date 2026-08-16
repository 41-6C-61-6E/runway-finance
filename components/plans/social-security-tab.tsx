'use client';

import { useState, useEffect, useMemo } from 'react';
import { runRetirementSimulation, EnginePlan } from '@/lib/services/retirement-engine';
import { DEFAULT_2026_RULES } from '@/lib/constants/retirement-defaults';
import { buildEnginePlan } from '@/lib/utils/build-engine-plan';
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
  ReferenceLine,
} from 'recharts';
import {
  HeartHandshake,
  CheckCircle2,
  Calendar,
  DollarSign,
  TrendingUp,
  Sparkles,
  ShieldCheck,
  Zap,
} from 'lucide-react';
import { CollapsibleCardHeader } from '@/components/ui/collapsible-card-header';
import { Slider } from '@/components/ui/slider';
import { useCardCollapsed } from '@/lib/hooks/use-card-collapsed';

import { ProjectionOptionsPopover } from './projection-options-popover';

interface SocialSecurityTabProps {
  plan: any;
  onUpdatePlan?: (updates: any) => void;
  dollarMode?: 'real' | 'nominal';
  onToggleDollarMode?: (mode: 'real' | 'nominal') => void;
  viewMode?: 'deterministic' | 'monte_carlo';
  onToggleViewMode?: (mode: 'deterministic' | 'monte_carlo') => void;
}

export function SocialSecurityTab({
  plan,
  onUpdatePlan,
  dollarMode = 'real',
  onToggleDollarMode = () => {},
  viewMode = 'deterministic',
  onToggleViewMode = () => {},
}: SocialSecurityTabProps) {
  const [primaryAge, setPrimaryAge] = useState<number>(Number(plan?.primarySsStartAge) || 67);
  const [spouseAge, setSpouseAge] = useState<number>(Number(plan?.spouseSsStartAge) || 67);
  const [enableSpousal, setEnableSpousal] = useState<boolean>(plan?.enableSpousalSsBenefit !== false);

  // Editable Base Monthly Benefit (PIA at FRA) State
  const [primaryMonthlyPIAInput, setPrimaryMonthlyPIAInput] = useState<string>(
    plan?.primarySsMonthlyAmount !== undefined && plan?.primarySsMonthlyAmount !== null ? String(plan.primarySsMonthlyAmount) : '2500'
  );
  const [spouseMonthlyPIAInput, setSpouseMonthlyPIAInput] = useState<string>(
    plan?.spouseSsMonthlyAmount !== undefined && plan?.spouseSsMonthlyAmount !== null ? String(plan.spouseSsMonthlyAmount) : '2000'
  );

  useEffect(() => {
    if (plan) {
      setPrimaryAge(Number(plan.primarySsStartAge) || 67);
      setSpouseAge(Number(plan.spouseSsStartAge) || 67);
      setEnableSpousal(plan.enableSpousalSsBenefit !== false);
      setPrimaryMonthlyPIAInput(
        plan.primarySsMonthlyAmount !== undefined && plan.primarySsMonthlyAmount !== null ? String(plan.primarySsMonthlyAmount) : '2500'
      );
      setSpouseMonthlyPIAInput(
        plan.spouseSsMonthlyAmount !== undefined && plan.spouseSsMonthlyAmount !== null ? String(plan.spouseSsMonthlyAmount) : '2000'
      );
    }
  }, [plan]);

  const [isOverviewCollapsed, setIsOverviewCollapsed] = useCardCollapsed('ss_overview');
  const [isTrajectoryCollapsed, setIsTrajectoryCollapsed] = useCardCollapsed('ss_trajectory');
  const [isTaxabilityCollapsed, setIsTaxabilityCollapsed] = useCardCollapsed('ss_taxability');

  const primaryMonthlyPIA = parseFloat(primaryMonthlyPIAInput) || 0;
  const spouseMonthlyPIA = parseFloat(spouseMonthlyPIAInput) || 0;
  const isMfj = plan?.filingStatus === 'married_joint' || Boolean(plan?.hasSpouse);

  // Helper to convert DB plan to EnginePlan object
  const buildEnginePlanHelper = (customPrimaryAge: number, customSpouseAge: number) => {
    return buildEnginePlan(plan, {
      primarySsStartAge: customPrimaryAge,
      spouseSsStartAge: customSpouseAge,
      primarySsMonthlyAmount: primaryMonthlyPIA,
      spouseSsMonthlyAmount: spouseMonthlyPIA,
      enableSpousalSsBenefit: enableSpousal,
    });
  };

  // SS Claiming Multipliers
  const getSsMult = (claimingAge: number) => {
    if (claimingAge <= 62) return 0.70;
    if (claimingAge === 63) return 0.75;
    if (claimingAge === 64) return 0.80;
    if (claimingAge === 65) return 0.867;
    if (claimingAge === 66) return 0.933;
    if (claimingAge === 67) return 1.0;
    if (claimingAge === 68) return 1.08;
    if (claimingAge === 69) return 1.16;
    return 1.24; // 70+
  };

  const primaryMonthlyAmount = primaryMonthlyPIA * getSsMult(primaryAge);
  const effectiveSpousePIA = (enableSpousal && isMfj && primaryMonthlyPIA > 0)
    ? Math.max(primaryMonthlyPIA * 0.5, spouseMonthlyPIA)
    : spouseMonthlyPIA;
  const spouseMonthlyAmount = effectiveSpousePIA * getSsMult(spouseAge);
  const totalAnnualHouseholdSS = (primaryMonthlyAmount + (isMfj ? spouseMonthlyAmount : 0)) * 12;

  // Run simulations for trajectories
  const simSelected = useMemo(() => runRetirementSimulation(buildEnginePlanHelper(primaryAge, spouseAge)), [primaryAge, spouseAge, enableSpousal, primaryMonthlyPIA, spouseMonthlyPIA, plan]);
  const sim62 = useMemo(() => runRetirementSimulation(buildEnginePlanHelper(62, 62)), [primaryMonthlyPIA, spouseMonthlyPIA, enableSpousal, plan]);
  const sim67 = useMemo(() => runRetirementSimulation(buildEnginePlanHelper(67, 67)), [primaryMonthlyPIA, spouseMonthlyPIA, enableSpousal, plan]);
  const sim70 = useMemo(() => runRetirementSimulation(buildEnginePlanHelper(70, 70)), [primaryMonthlyPIA, spouseMonthlyPIA, enableSpousal, plan]);

  const chartData = useMemo(() => {
    const inflationRate = (plan?.settings?.fixedInflationRate ?? 3.0) / 100;
    const years62 = sim62.yearlyResults;
    const years67 = sim67.yearlyResults;
    const years70 = sim70.yearlyResults;
    const yearsSelected = simSelected.yearlyResults;

    let cum62 = 0;
    let cum67 = 0;
    let cum70 = 0;
    let cumSel = 0;

    return yearsSelected.map((y, idx) => {
      const discountFactor = dollarMode === 'real' ? Math.pow(1 + inflationRate, idx) : 1;
      cum62 += (years62[idx]?.ssIncome || 0) / discountFactor;
      cum67 += (years67[idx]?.ssIncome || 0) / discountFactor;
      cum70 += (years70[idx]?.ssIncome || 0) / discountFactor;
      cumSel += (y.ssIncome || 0) / discountFactor;

      return {
        age: y.primaryAge,
        claim62: Math.round(cum62),
        claim67: Math.round(cum67),
        claim70: Math.round(cum70),
        selected: Math.round(cumSel),
      };
    });
  }, [sim62, sim67, sim70, simSelected, dollarMode, plan]);

  const updatePlanParameters = (overrides?: Partial<{
    primarySsMonthlyAmount: string;
    spouseSsMonthlyAmount: string;
    primarySsStartAge: number;
    spouseSsStartAge: number;
    enableSpousalSsBenefit: boolean;
  }>) => {
    if (!onUpdatePlan) return;
    onUpdatePlan({
      primarySsMonthlyAmount: overrides?.primarySsMonthlyAmount ?? primaryMonthlyPIAInput,
      spouseSsMonthlyAmount: overrides?.spouseSsMonthlyAmount ?? spouseMonthlyPIAInput,
      primarySsStartAge: overrides?.primarySsStartAge ?? primaryAge,
      spouseSsStartAge: overrides?.spouseSsStartAge ?? spouseAge,
      enableSpousalSsBenefit: overrides?.enableSpousalSsBenefit ?? enableSpousal,
    });
  };

  return (
    <div className="space-y-6">
      {/* Header KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-card border border-border p-4 rounded-2xl shadow-sm space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold text-muted-foreground">Primary Claiming Age</span>
            <Calendar className="w-4 h-4 text-primary" />
          </div>
          <div className="text-xl font-bold font-mono text-foreground flex items-baseline gap-2">
            Age {primaryAge}
          </div>
          <span className="text-[10px] text-muted-foreground block">
            {(getSsMult(primaryAge) * 100).toFixed(0)}% of Full Benefit (PIA)
          </span>
        </div>

        <div className="bg-card border border-border p-4 rounded-2xl shadow-sm space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold text-muted-foreground">Primary Monthly Benefit</span>
            <DollarSign className="w-4 h-4 text-emerald-500" />
          </div>
          <div className="text-xl font-bold font-mono text-emerald-500">
            {formatCurrency(primaryMonthlyAmount)}/mo
          </div>
          <span className="text-[10px] text-muted-foreground block">
            Base PIA at Age 67: {formatCurrency(primaryMonthlyPIA)}/mo
          </span>
        </div>

        {isMfj && (
          <div className="bg-card border border-border p-4 rounded-2xl shadow-sm space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold text-muted-foreground">Spouse Monthly Benefit</span>
              <HeartHandshake className="w-4 h-4 text-purple-500" />
            </div>
            <div className="text-xl font-bold font-mono text-purple-500">
              {formatCurrency(spouseMonthlyAmount)}/mo
            </div>
            <span className="text-[10px] text-muted-foreground block">
              Claiming at Age {spouseAge} ({(getSsMult(spouseAge) * 100).toFixed(0)}% PIA)
            </span>
          </div>
        )}

        <div className="bg-card border border-border p-4 rounded-2xl shadow-sm space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold text-muted-foreground">Annual Household Benefit</span>
            <TrendingUp className="w-4 h-4 text-indigo-500" />
          </div>
          <div className="text-xl font-bold font-mono text-foreground">
            {formatCurrency(totalAnnualHouseholdSS)}/yr
          </div>
          <span className="text-[10px] text-muted-foreground block">
            Adjusts for inflation annually
          </span>
        </div>
      </div>

      {/* SECTION 1: INTERACTIVE CLAIMING AGE & BASE BENEFIT CONTROLS */}
      <div className="bg-card border border-border rounded-2xl shadow-sm overflow-hidden">
        <CollapsibleCardHeader
          title="Social Security Monthly Base & Claiming Strategy"
          description="Configure base monthly PIA benefit estimates at Full Retirement Age (67) and optimize claiming ages (62 to 70)"
          icon={HeartHandshake}
          isCollapsed={isOverviewCollapsed}
          onToggle={() => setIsOverviewCollapsed(!isOverviewCollapsed)}
        />

        {!isOverviewCollapsed && (
          <div className="p-5 space-y-6">
            {/* Base PIA Inputs */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-card border border-border p-4 rounded-xl shadow-xs">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5">
                  <DollarSign className="w-3.5 h-3.5 text-emerald-500" />
                  Primary Estimated Monthly Benefit at FRA (Age 67)
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-2.5 text-xs text-muted-foreground">$</span>
                  <input
                    type="number"
                    value={primaryMonthlyPIAInput}
                    onChange={(e) => {
                      setPrimaryMonthlyPIAInput(e.target.value);
                      updatePlanParameters({ primarySsMonthlyAmount: e.target.value });
                    }}
                    className="w-full bg-background border border-border rounded-lg pl-7 pr-3 py-2 text-xs font-mono font-bold text-foreground focus:ring-1 focus:ring-primary"
                    placeholder="2500"
                  />
                </div>
                <span className="text-[10px] text-muted-foreground block">
                  Check ssa.gov statement for estimated Primary Insurance Amount (PIA)
                </span>
              </div>

              {isMfj ? (
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5">
                    <HeartHandshake className="w-3.5 h-3.5 text-purple-500" />
                    Spouse Estimated Monthly Benefit at FRA (Age 67)
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-2.5 text-xs text-muted-foreground">$</span>
                    <input
                      type="number"
                      value={spouseMonthlyPIAInput}
                      onChange={(e) => {
                        setSpouseMonthlyPIAInput(e.target.value);
                        updatePlanParameters({ spouseSsMonthlyAmount: e.target.value });
                      }}
                      className="w-full bg-background border border-border rounded-lg pl-7 pr-3 py-2 text-xs font-mono font-bold text-foreground focus:ring-1 focus:ring-purple-500"
                      placeholder="2000"
                    />
                  </div>
                  <span className="text-[10px] text-muted-foreground block">
                    Spouse's own earned PIA at Full Retirement Age (Age 67)
                  </span>
                </div>
              ) : (
                <div className="flex items-center p-3 bg-muted/20 border border-border rounded-lg text-xs text-muted-foreground">
                  Filing status is Single. Change status under Settings -&gt; Profile to enable spouse benefit inputs.
                </div>
              )}
            </div>

            {/* Claiming Age Sliders */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 bg-muted/20 p-4 rounded-xl border border-border">
              {/* Primary Claiming Age Slider */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-foreground flex items-center gap-1.5">
                    Primary Claiming Age: <span className="font-mono text-primary text-sm">{primaryAge}</span>
                  </label>
                  <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-primary/10 text-primary">
                    {primaryAge === 67 ? 'Full Retirement Age (100%)' : primaryAge < 67 ? `Early Claim (${(getSsMult(primaryAge) * 100).toFixed(0)}%)` : `Delayed Credit (${(getSsMult(primaryAge) * 100).toFixed(0)}%)`}
                  </span>
                </div>
                <Slider
                  min={62}
                  max={70}
                  step={1}
                  value={primaryAge}
                  ticks={[
                    { value: 62, label: '62 (70%)' },
                    { value: 67, label: '67 (FRA)' },
                    { value: 70, label: '70 (124%)' },
                  ]}
                  onChange={(val) => {
                    const newAge = Math.round(val);
                    setPrimaryAge(newAge);
                    updatePlanParameters({ primarySsStartAge: newAge });
                  }}
                  ariaLabel="Primary Claiming Age"
                />
              </div>

              {/* Spouse Claiming Age Slider (if MFJ) */}
              {isMfj ? (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-foreground flex items-center gap-1.5">
                      Spouse Claiming Age: <span className="font-mono text-purple-500 text-sm">{spouseAge}</span>
                    </label>
                    <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-purple-500/10 text-purple-500">
                      {spouseAge === 67 ? 'Full Retirement Age (100%)' : spouseAge < 67 ? `Early Claim (${(getSsMult(spouseAge) * 100).toFixed(0)}%)` : `Delayed Credit (${(getSsMult(spouseAge) * 100).toFixed(0)}%)`}
                    </span>
                  </div>
                  <Slider
                    min={62}
                    max={70}
                    step={1}
                    value={spouseAge}
                    ticks={[
                      { value: 62, label: '62 (70%)' },
                      { value: 67, label: '67 (FRA)' },
                      { value: 70, label: '70 (124%)' },
                    ]}
                    onChange={(val) => {
                      const newAge = Math.round(val);
                      setSpouseAge(newAge);
                      updatePlanParameters({ spouseSsStartAge: newAge });
                    }}
                    accentClass="accent-purple-500"
                    ariaLabel="Spouse Claiming Age"
                  />
                </div>
              ) : (
                <div className="flex items-center justify-center p-4 bg-card rounded-lg border border-border text-xs text-muted-foreground">
                  Filing status is Single. Enable spouse under Settings -&gt; Profile for spousal benefits.
                </div>
              )}
            </div>

            {/* Action & Active Status Bar */}
            <div className="flex items-center justify-between pt-2">
              <div className="text-xs text-muted-foreground">
                Plan Ending Net Worth: <strong className="text-foreground font-mono">{formatCurrency(simSelected.endingNetWorth)}</strong>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* SECTION 2: CUMULATIVE LIFETIME PAYOUT TRAJECTORY CHART */}
      <div className="bg-card border border-border rounded-2xl shadow-sm overflow-hidden">
        <CollapsibleCardHeader
          title="Cumulative Lifetime Payout Trajectory & Break-Even Analysis"
          description="Compare total lifetime Social Security cash flows between claiming early at 62, at FRA 67, or delayed at 70"
          icon={TrendingUp}
          isCollapsed={isTrajectoryCollapsed}
          onToggle={() => setIsTrajectoryCollapsed(!isTrajectoryCollapsed)}
          actions={
            <ProjectionOptionsPopover
              dollarMode={dollarMode}
              onToggleDollarMode={onToggleDollarMode}
              viewMode={viewMode}
              onToggleViewMode={onToggleViewMode}
            />
          }
        />

        {!isTrajectoryCollapsed && (
          <div className="p-5 space-y-6">
            <div className="h-72 w-full pt-2">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
                  <XAxis dataKey="age" stroke="#888888" fontSize={11} tickLine={false} />
                  <YAxis
                    stroke="#888888"
                    fontSize={10}
                    tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`}
                    tickLine={false}
                  />
                  <Tooltip content={<SocialSecurityTooltip />} wrapperStyle={{ zIndex: 100, opacity: 1 }} />
                  <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '8px' }} />
                  <ReferenceLine
                    x={78}
                    stroke="#3b82f6"
                    strokeDasharray="3 3"
                    label={{
                      value: '62 vs 67 (78.6)',
                      position: 'insideTopLeft',
                      fontSize: 10,
                      fill: '#3b82f6',
                    }}
                  />
                  <ReferenceLine
                    x={80}
                    stroke="#10b981"
                    strokeDasharray="3 3"
                    label={{
                      value: '67 vs 70 (80.4)',
                      position: 'insideTopRight',
                      fontSize: 10,
                      fill: '#10b981',
                    }}
                  />
                  <Line type="monotone" dataKey="claim62" name="Claim at Age 62" stroke="#f59e0b" strokeWidth={1.5} dot={false} />
                  <Line type="monotone" dataKey="claim67" name="Claim at Age 67 (FRA)" stroke="#3b82f6" strokeWidth={1.5} dot={false} />
                  <Line type="monotone" dataKey="claim70" name="Claim at Age 70 (Delayed)" stroke="#10b981" strokeWidth={1.5} dot={false} />
                  <Line type="monotone" dataKey="selected" name={`Selected (Age ${primaryAge})`} stroke="#ec4899" strokeWidth={3} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>

            {/* Break-Even Insights Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
              <div className="bg-card p-4 rounded-xl border border-border space-y-1">
                <span className="font-bold text-foreground block">Age 62 vs Age 67 Break-Even</span>
                <p className="text-[11px] text-muted-foreground">
                  Delaying from 62 to 67 breaks even at <strong>Age 78.6</strong>. If you live past 78.6, age 67 yields higher total cash.
                </p>
              </div>

              <div className="bg-card p-4 rounded-xl border border-border space-y-1">
                <span className="font-bold text-foreground block">Age 67 vs Age 70 Break-Even</span>
                <p className="text-[11px] text-muted-foreground">
                  Delaying from 67 to 70 breaks even at <strong>Age 80.4</strong>. Past age 80.4, the 24% delayed credit dominates.
                </p>
              </div>

              <div className="bg-card p-4 rounded-xl border border-border space-y-1">
                <span className="font-bold text-foreground block">Portfolio Preservation Impact</span>
                <p className="text-[11px] text-muted-foreground">
                  Delaying Social Security acts as an inflation-indexed longevity annuity, reducing portfolio withdrawal drag after age 70.
                </p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* SECTION 3: IRS SOCIAL SECURITY TAXABILITY & PROVISIONAL INCOME */}
      <div className="bg-card border border-border rounded-2xl shadow-sm overflow-hidden">
        <CollapsibleCardHeader
          title="IRS Provisional Income & Social Security Taxability"
          description="Understand how traditional 401(k) withdrawals, pensions, and interest push Social Security into 0%, 50%, or 85% taxable tiers"
          icon={ShieldCheck}
          isCollapsed={isTaxabilityCollapsed}
          onToggle={() => setIsTaxabilityCollapsed(!isTaxabilityCollapsed)}
        />

        {!isTaxabilityCollapsed && (
          <div className="p-5 space-y-4 text-xs">
            <p className="text-muted-foreground leading-relaxed">
              Under IRS Publication 915, Social Security benefits are taxed based on your <strong>Provisional Income</strong> (AGI + Non-taxable Interest + 50% of Social Security).
            </p>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-card p-4 rounded-xl border border-border space-y-1">
                <div className="font-bold text-emerald-500">Tier 1: 0% Taxable</div>
                <div className="text-[11px] text-muted-foreground">
                  Provisional Income under {isMfj ? '$32,000 (MFJ)' : '$25,000 (Single)'}. 100% of Social Security is tax-free.
                </div>
              </div>

              <div className="bg-card p-4 rounded-xl border border-border space-y-1">
                <div className="font-bold text-amber-500">Tier 2: Up to 50% Taxable</div>
                <div className="text-[11px] text-muted-foreground">
                  Provisional Income between {isMfj ? '$32k–$44k' : '$25k–$34k'}. Up to 50% of benefits are subject to federal income tax.
                </div>
              </div>

              <div className="bg-card p-4 rounded-xl border border-border space-y-1">
                <div className="font-bold text-rose-500">Tier 3: Up to 85% Taxable</div>
                <div className="text-[11px] text-muted-foreground">
                  Provisional Income above {isMfj ? '$44,000' : '$34,000'}. Up to 85% of Social Security benefits are taxed as ordinary income.
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function SocialSecurityTooltip({ active, payload }: any) {
  if (!active || !payload || !payload.length) return null;
  const data = payload[0].payload;
  const age = data.age;

  return (
    <div className="bg-background/95 backdrop-blur-md border border-border rounded-xl p-3.5 shadow-xl text-xs space-y-2.5 min-w-[260px] max-w-[320px] z-50">
      <div className="flex items-center justify-between border-b border-border pb-1.5 font-bold">
        <span className="text-foreground font-mono">Age {age}</span>
        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full border border-cyan-500/20 bg-cyan-500/10 text-cyan-500 font-sans">
          Social Security
        </span>
      </div>

      <div className="space-y-1.5 font-mono">
        <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider font-sans pb-0.5 border-b border-border/50">
          Cumulative Payout
        </div>
        <div className="space-y-1 text-[11px] font-sans">
          {payload.map((entry: any) => {
            const isSelected = entry.dataKey === 'selected';
            return (
              <div
                key={entry.dataKey}
                className={`flex justify-between items-center py-0.5 rounded px-1 -mx-1 ${
                  isSelected ? 'bg-pink-500/10 font-medium' : ''
                }`}
              >
                <span className="flex items-center gap-1.5 truncate max-w-[170px]" style={{ color: entry.color }}>
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
      </div>
    </div>
  );
}
