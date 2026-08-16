'use client';

import { useState, useMemo } from 'react';
import { runRetirementSimulation } from '@/lib/services/retirement-engine';
import { DEFAULT_2026_RULES } from '@/lib/constants/retirement-defaults';
import { buildEnginePlan } from '@/lib/utils/build-engine-plan';
import { formatCurrency } from '@/lib/utils/format';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  CartesianGrid,
  Legend,
  ReferenceArea,
} from 'recharts';
import {
  ShieldCheck,
  Calendar,
  DollarSign,
  TrendingUp,
  AlertTriangle,
  Sparkles,
  Info,
} from 'lucide-react';
import { CollapsibleCardHeader } from '@/components/ui/collapsible-card-header';
import { Slider } from '@/components/ui/slider';
import { useCardCollapsed } from '@/lib/hooks/use-card-collapsed';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { ProjectionOptionsPopover } from './projection-options-popover';

interface IrmaaTabProps {
  plan: any;
  onUpdatePlan?: (updates: any) => void;
  dollarMode?: 'real' | 'nominal';
  onToggleDollarMode?: (mode: 'real' | 'nominal') => void;
  viewMode?: 'deterministic' | 'monte_carlo';
  onToggleViewMode?: (mode: 'deterministic' | 'monte_carlo') => void;
}

export function IrmaaTab({
  plan,
  onUpdatePlan,
  dollarMode = 'nominal',
  onToggleDollarMode,
  viewMode = 'deterministic',
  onToggleViewMode,
}: IrmaaTabProps) {
  const [avoidIrmaa, setAvoidIrmaa] = useState<boolean>(plan?.settings?.avoidIrmaaCliffs !== false);
  const isMfj = plan?.filingStatus === 'married_joint' || Boolean(plan?.hasSpouse);
  const [customTestMagi, setCustomTestMagi] = useState<number>(isMfj ? 240000 : 120000);

  const [isOverviewCollapsed, setIsOverviewCollapsed] = useCardCollapsed('irmaa_overview');
  const [isTimelineCollapsed, setIsTimelineCollapsed] = useCardCollapsed('irmaa_timeline');
  const [isTableCollapsed, setIsTableCollapsed] = useCardCollapsed('irmaa_table');

  const rules = plan?.rules || DEFAULT_2026_RULES;
  const irmaaList = rules?.irmaaThresholds || DEFAULT_2026_RULES.irmaaThresholds;
  
  const tier1Limit = irmaaList[1]
    ? (isMfj ? irmaaList[1].magiJoint : irmaaList[1].magiSingle)
    : (isMfj ? 206000 : 103000);

  const buildEnginePlanHelper = (irmaaGuard: boolean) => {
    return buildEnginePlan(plan, {
      avoidIrmaaCliffs: irmaaGuard,
    });
  };

  const simNoGuard = useMemo(() => runRetirementSimulation(buildEnginePlanHelper(false)), [plan]);
  const simGuard = useMemo(() => runRetirementSimulation(buildEnginePlanHelper(true)), [plan]);

  const inflationRate = (plan?.settings?.fixedInflationRate ?? 3.0) / 100;

  const irmaaStats = useMemo(() => {
    const yearsNoGuard = simNoGuard.yearlyResults.filter((y) => y.primaryAge >= 65);
    const yearsGuard = simGuard.yearlyResults.filter((y) => y.primaryAge >= 65);

    const totalCostNoGuard = yearsNoGuard.reduce((sum, y) => sum + (y.irmaaSurchargeAnnual || 0), 0);
    const totalCostGuard = yearsGuard.reduce((sum, y) => sum + (y.irmaaSurchargeAnnual || 0), 0);
    const totalSaved = Math.max(0, totalCostNoGuard - totalCostGuard);

    return { totalCostNoGuard, totalCostGuard, totalSaved };
  }, [simNoGuard, simGuard]);

  const timelineChartData = useMemo(() => {
    const t1 = irmaaList[1] ? (isMfj ? irmaaList[1].magiJoint : irmaaList[1].magiSingle) : (isMfj ? 206000 : 103000);
    const t2 = irmaaList[2] ? (isMfj ? irmaaList[2].magiJoint : irmaaList[2].magiSingle) : (isMfj ? 258000 : 129000);
    const t3 = irmaaList[3] ? (isMfj ? irmaaList[3].magiJoint : irmaaList[3].magiSingle) : (isMfj ? 322000 : 161000);
    const t4 = irmaaList[4] ? (isMfj ? irmaaList[4].magiJoint : irmaaList[4].magiSingle) : (isMfj ? 386000 : 193000);

    return simGuard.yearlyResults.map((y, idx) => {
      const discountFactor = dollarMode === 'real' ? Math.pow(1 + inflationRate, idx) : 1;
      const unguardedMagi = simNoGuard.yearlyResults[idx]?.magi || 0;

      return {
        age: y.primaryAge,
        magi: Math.round((y.magi || 0) / discountFactor),
        magiUnguarded: Math.round(unguardedMagi / discountFactor),
        surcharge: Math.round((y.irmaaSurchargeAnnual || 0) / discountFactor),
        tier1Cliff: Math.round(t1 / discountFactor),
        tier2Cliff: Math.round(t2 / discountFactor),
        tier3Cliff: Math.round(t3 / discountFactor),
        tier4Cliff: Math.round(t4 / discountFactor),
      };
    });
  }, [simGuard, simNoGuard, irmaaList, isMfj, dollarMode, inflationRate]);

  const testMagiCalc = useMemo(() => {
    for (let idx = irmaaList.length - 1; idx >= 1; idx--) {
      const tierObj = irmaaList[idx];
      const limit = isMfj ? tierObj.magiJoint : tierObj.magiSingle;
      if (customTestMagi >= limit && limit > 0) {
        const monthlySurchargePerPerson = tierObj.partBMonthly + tierObj.partDMonthly;
        const annualHouseholdSurcharge = monthlySurchargePerPerson * 12 * (isMfj ? 2 : 1);
        return { tier: idx, monthlySurchargePerPerson, annualHouseholdSurcharge, limit };
      }
    }
    return {
      tier: 0,
      monthlySurchargePerPerson: 0,
      annualHouseholdSurcharge: 0,
      limit: tier1Limit,
    };
  }, [customTestMagi, irmaaList, isMfj, tier1Limit]);

  const updatePlanSettings = (avoidVal: boolean) => {
    if (!onUpdatePlan) return;
    onUpdatePlan({
      settings: {
        ...plan?.settings,
        avoidIrmaaCliffs: avoidVal,
      },
    });
  };

  const sliderMax = isMfj ? 750000 : 400000;
  const sliderMin = isMfj ? 150000 : 80000;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-card border border-border p-4 rounded-2xl shadow-sm space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold text-muted-foreground">Medicare Age</span>
            <Calendar className="w-4 h-4 text-primary" />
          </div>
          <div className="text-xl font-bold font-mono text-foreground">Age {rules.medicareAge || 65}</div>
        </div>
        <div className="bg-card border border-border p-4 rounded-2xl shadow-sm space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold text-muted-foreground">Lookback Period</span>
            <ShieldCheck className="w-4 h-4 text-indigo-500" />
          </div>
          <div className="text-xl font-bold font-mono text-indigo-500">
            {rules.irmaaLookbackYears || 2} Years (Age 63+)
          </div>
        </div>
        <div className="bg-card border border-border p-4 rounded-2xl shadow-sm space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold text-muted-foreground">Tier 1 Threshold</span>
            <DollarSign className="w-4 h-4 text-emerald-500" />
          </div>
          <div className="text-xl font-bold font-mono text-foreground">{formatCurrency(tier1Limit)}</div>
        </div>
        <div className="bg-card border border-border p-4 rounded-2xl shadow-sm space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold text-muted-foreground">Lifetime Savings</span>
            <Sparkles className="w-4 h-4 text-emerald-500" />
          </div>
          <div className="text-xl font-bold font-mono text-emerald-500">{formatCurrency(irmaaStats.totalSaved)}</div>
          <span className="text-[10px] text-muted-foreground block">Guardrail vs unguarded difference</span>
        </div>
      </div>

      <div className="bg-card border border-border rounded-2xl shadow-sm overflow-hidden">
        <CollapsibleCardHeader
          title="Medicare IRMAA Cliff Guardrail Controls"
          description="Protect retirement MAGI from Medicare Part B & D surcharge cliffs"
          icon={ShieldCheck}
          isCollapsed={isOverviewCollapsed}
          onToggle={() => setIsOverviewCollapsed(!isOverviewCollapsed)}
        />
        {!isOverviewCollapsed && (
          <div className="p-5 space-y-5">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-muted/20 p-4 rounded-xl border border-border text-xs">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="font-bold text-foreground flex items-center gap-1.5">
                    IRMAA Cliff Guardrail
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Info className="w-3.5 h-3.5 text-muted-foreground hover:text-foreground cursor-pointer" />
                      </TooltipTrigger>
                      <TooltipContent>
                        Automatically caps annual Roth conversions $1,000 below the nearest IRMAA threshold once you reach age 63 (the 2-year lookback for age 65 Medicare).
                      </TooltipContent>
                    </Tooltip>
                  </label>
                </div>
                <div className="flex items-center gap-2 pt-0.5">
                  <input
                    type="checkbox"
                    id="avoidIrmaaToggle"
                    checked={avoidIrmaa}
                    onChange={(e) => {
                      const val = e.target.checked;
                      setAvoidIrmaa(val);
                      updatePlanSettings(val);
                    }}
                    className="w-4 h-4 accent-primary rounded cursor-pointer"
                  />
                  <label htmlFor="avoidIrmaaToggle" className="text-xs font-semibold text-foreground cursor-pointer">
                    {avoidIrmaa
                      ? 'Guardrail Active (Cap conversions at age 63+)'
                      : 'No Guardrail'}
                  </label>
                </div>
              </div>

              <div className="space-y-2 bg-card p-3.5 rounded-xl border border-border">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-foreground">MAGI Surcharge Estimator</span>
                  <span className="font-mono text-primary font-bold">{formatCurrency(customTestMagi)}</span>
                </div>
                <Slider
                  min={sliderMin}
                  max={sliderMax}
                  step={5000}
                  value={customTestMagi}
                  ticks={
                    isMfj
                      ? [
                          { value: 150000, label: '$150k' },
                          { value: 450000, label: '$450k' },
                          { value: 750000, label: '$750k' },
                        ]
                      : [
                          { value: 80000, label: '$80k' },
                          { value: 240000, label: '$240k' },
                          { value: 400000, label: '$400k' },
                        ]
                  }
                  onChange={(val) => setCustomTestMagi(Math.round(val))}
                  ariaLabel="MAGI Surcharge Estimator"
                />
                <div className="flex items-center justify-between text-[11px] font-mono pt-0.5">
                  <span className="text-muted-foreground">
                    <strong className={testMagiCalc.tier > 0 ? 'text-amber-500' : 'text-emerald-500'}>
                      {testMagiCalc.tier > 0 ? `Tier ${testMagiCalc.tier}` : 'Standard (No Surcharge)'}
                    </strong>
                  </span>
                  <span className="text-rose-400 font-bold">
                    +{formatCurrency(testMagiCalc.monthlySurchargePerPerson)}/mo/person ({formatCurrency(testMagiCalc.annualHouseholdSurcharge)}/yr)
                  </span>
                </div>
              </div>
            </div>
            <div className="flex items-center justify-between pt-0.5">
              <div className="text-xs text-muted-foreground">
                Lifetime Medicare Surcharges: <strong className="text-foreground font-mono">{formatCurrency(irmaaStats.totalCostGuard)}</strong>
                {' '}(vs {formatCurrency(irmaaStats.totalCostNoGuard)} unguarded)
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="bg-card border border-border rounded-2xl shadow-sm overflow-hidden">
        <CollapsibleCardHeader
          title="Retirement MAGI vs IRMAA Cliffs Timeline"
          description="Track projected MAGI against statutory IRMAA cliffs, with 2-year lookback window (ages 63-64)"
          icon={TrendingUp}
          isCollapsed={isTimelineCollapsed}
          onToggle={() => setIsTimelineCollapsed(!isTimelineCollapsed)}
          actions={
            <ProjectionOptionsPopover
              dollarMode={dollarMode}
              onToggleDollarMode={onToggleDollarMode}
              viewMode={viewMode}
              onToggleViewMode={onToggleViewMode}
            />
          }
        />
        {!isTimelineCollapsed && (
          <div className="p-5 space-y-6">
            <div className="h-80 w-full pt-2">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={timelineChartData} margin={{ top: 10, right: 20, left: 10, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
                  <XAxis dataKey="age" stroke="#888888" fontSize={11} tickLine={false} />
                  <YAxis
                    stroke="#888888"
                    fontSize={10}
                    tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`}
                    tickLine={false}
                  />
                  <RechartsTooltip content={<IrmaaTooltip />} wrapperStyle={{ zIndex: 100, opacity: 1 }} />
                  <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '8px' }} />
                  <ReferenceArea
                    x1={63}
                    x2={65}
                    fill="#6366f1"
                    fillOpacity={0.08}
                    label={{
                      value: '2-Yr Lookback (63-64)',
                      position: 'insideTopLeft',
                      fill: '#818cf8',
                      fontSize: 10,
                    }}
                  />
                  <Line type="monotone" dataKey="magi" name="Projected MAGI (Guarded)" stroke="#3b82f6" strokeWidth={3} dot={false} />
                  <Line type="monotone" dataKey="magiUnguarded" name="Projected MAGI (Unguarded)" stroke="#94a3b8" strokeWidth={1.5} strokeDasharray="3 3" dot={false} />
                  <Line type="monotone" dataKey="tier1Cliff" name="IRMAA Tier 1 Cliff" stroke="#f59e0b" strokeWidth={1.5} strokeDasharray="4 4" dot={false} />
                  <Line type="monotone" dataKey="tier2Cliff" name="IRMAA Tier 2 Cliff" stroke="#f97316" strokeWidth={1.5} strokeDasharray="4 4" dot={false} />
                  <Line type="monotone" dataKey="tier3Cliff" name="IRMAA Tier 3 Cliff" stroke="#ef4444" strokeWidth={1.5} strokeDasharray="4 4" dot={false} />
                  <Line type="monotone" dataKey="tier4Cliff" name="IRMAA Tier 4 Cliff" stroke="#b91c1c" strokeWidth={1.5} strokeDasharray="4 4" dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}
      </div>

      <div className="bg-card border border-border rounded-2xl shadow-sm overflow-hidden">
        <CollapsibleCardHeader
          title="Modeled Medicare Part B & Part D IRMAA Surcharge Schedule"
          description="Medicare IRMAA surcharge rates by income bracket for Single and Married Filing Jointly tax filers (editable in Rules)"
          icon={Info}
          isCollapsed={isTableCollapsed}
          onToggle={() => setIsTableCollapsed(!isTableCollapsed)}
        />
        {!isTableCollapsed && (
          <div className="p-5">
            <div className="border border-border rounded-xl overflow-hidden shadow-sm">
              <table className="w-full text-xs text-left">
                <thead className="bg-muted/80 text-muted-foreground font-semibold">
                  <tr>
                    <th className="px-3 py-2.5">IRMAA Tier</th>
                    <th className="px-3 py-2.5">Single MAGI Threshold</th>
                    <th className="px-3 py-2.5">MFJ MAGI Threshold</th>
                    <th className="px-3 py-2.5 text-right">Part B Surcharge/mo</th>
                    <th className="px-3 py-2.5 text-right">Part D Surcharge/mo</th>
                    <th className="px-3 py-2.5 text-right">Combined Annual ({isMfj ? 'MFJ' : 'Single'})</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/40 font-mono">
                  {irmaaList.map((tier: any, idx: number) => {
                    const annualCost = (tier.partBMonthly + tier.partDMonthly) * 12 * (isMfj ? 2 : 1);
                    const isStandard = tier.magiSingle === 0 && tier.magiJoint === 0;
                    return (
                      <tr key={idx} className="hover:bg-muted/40">
                        <td className="px-3 py-2 font-bold text-foreground font-sans">
                          {isStandard ? 'Standard (Base)' : `Tier ${idx}`}
                        </td>
                        <td className="px-3 py-2 text-muted-foreground">
                          {isStandard ? '≤ $103,000' : `> ${formatCurrency(tier.magiSingle)}`}
                        </td>
                        <td className="px-3 py-2 text-muted-foreground">
                          {isStandard ? '≤ $206,000' : `> ${formatCurrency(tier.magiJoint)}`}
                        </td>
                        <td className="px-3 py-2 text-right text-rose-400">
                          {isStandard ? '$0.00/mo' : `+${formatCurrency(tier.partBMonthly)}/mo`}
                        </td>
                        <td className="px-3 py-2 text-right text-purple-400">
                          {isStandard ? '$0.00/mo' : `+${formatCurrency(tier.partDMonthly)}/mo`}
                        </td>
                        <td className={`px-3 py-2 text-right font-bold ${isStandard ? 'text-emerald-500' : 'text-rose-500'}`}>
                          {isStandard ? '$0/yr (No Surcharge)' : `+${formatCurrency(annualCost)}/yr`}
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

function IrmaaTooltip({ active, payload }: any) {
  if (!active || !payload || !payload.length) return null;
  const data = payload[0].payload;
  const age = data.age;
  const magi = Number(data.magi || 0);
  const tier1 = Number(data.tier1Cliff || 0);
  const tier2 = Number(data.tier2Cliff || 0);
  const tier3 = Number(data.tier3Cliff || 0);
  const tier4 = Number(data.tier4Cliff || 0);

  let badgeLabel = '✅ Standard Premium';
  let badgeColor = 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20';
  let hasBreach = false;

  if (tier4 > 0 && magi > tier4) {
    badgeLabel = '⚠️ Tier 4 Cliff';
    badgeColor = 'bg-red-500/10 text-red-500 border-red-500/20';
    hasBreach = true;
  } else if (tier3 > 0 && magi > tier3) {
    badgeLabel = '⚠️ Tier 3 Cliff';
    badgeColor = 'bg-rose-500/10 text-rose-500 border-rose-500/20';
    hasBreach = true;
  } else if (tier2 > 0 && magi > tier2) {
    badgeLabel = '⚠️ Tier 2 Cliff';
    badgeColor = 'bg-orange-500/10 text-orange-500 border-orange-500/20';
    hasBreach = true;
  } else if (tier1 > 0 && magi > tier1) {
    badgeLabel = '⚠️ Tier 1 Cliff';
    badgeColor = 'bg-amber-500/10 text-amber-500 border-amber-500/20';
    hasBreach = true;
  }

  return (
    <div className="bg-background/95 backdrop-blur-md border border-border rounded-xl p-3.5 shadow-xl text-xs space-y-2.5 min-w-[280px] max-w-[340px] z-50">
      <div className="flex items-center justify-between border-b border-border pb-1.5 font-bold">
        <span className="text-foreground font-mono">Age {age}</span>
        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border font-sans ${badgeColor}`}>
          {badgeLabel}
        </span>
      </div>

      <div className="space-y-1.5 font-mono">
        <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider font-sans pb-0.5 border-b border-border/50">
          MAGI & IRMAA Cliffs
        </div>
        <div className="space-y-1 text-[11px] font-sans">
          {payload.map((entry: any) => {
            const isMagi = entry.dataKey === 'magi';
            return (
              <div
                key={entry.dataKey}
                className={`flex justify-between items-center py-0.5 rounded px-1 -mx-1 ${
                  isMagi ? 'bg-blue-500/10 font-medium' : ''
                }`}
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
      </div>

      {hasBreach && (
        <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-2 space-y-0.5 font-sans">
          <div className="flex items-center gap-1.5 font-bold text-amber-500 text-[11px]">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
            <span>IRMAA Surcharge Warning</span>
          </div>
          <p className="text-[10px] text-muted-foreground">
            Projected MAGI exceeds Medicare Part B & Part D premium surcharge threshold.
          </p>
        </div>
      )}
    </div>
  );
}
