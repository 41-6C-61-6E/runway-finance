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
  CheckCircle2,
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
  dollarMode = 'real',
  onToggleDollarMode = () => {},
  viewMode = 'deterministic',
  onToggleViewMode = () => {},
}: IrmaaTabProps) {
  const [avoidIrmaa, setAvoidIrmaa] = useState<boolean>(plan?.settings?.avoidIrmaaCliffs !== false);
  const [customTestMagi, setCustomTestMagi] = useState<number>(120000);

  const [isOverviewCollapsed, setIsOverviewCollapsed] = useCardCollapsed('irmaa_overview');
  const [isTimelineCollapsed, setIsTimelineCollapsed] = useCardCollapsed('irmaa_timeline');
  const [isTableCollapsed, setIsTableCollapsed] = useCardCollapsed('irmaa_table');

  const [appliedMsg, setAppliedMsg] = useState<string>('');

  const isMfj = plan?.filingStatus === 'married_joint' || Boolean(plan?.hasSpouse);
  const rules = plan?.rules || DEFAULT_2026_RULES;
  const irmaaList = rules?.irmaaThresholds || [];
  const tier1Limit = irmaaList[0] ? (isMfj ? irmaaList[0].magiJoint : irmaaList[0].magiSingle) : 103000;

  // Helper to convert DB plan to EnginePlan object
  const buildEnginePlan = (irmaaGuard: boolean): EnginePlan => {
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
        enableRothConversions: Boolean(plan?.settings?.enableRothConversions),
        avoidIrmaaCliffs: irmaaGuard,
        withdrawalMethod: plan?.settings?.withdrawalMethod || plan?.withdrawalMethod || 'textbook',
      },
      rules: plan?.rules || DEFAULT_2026_RULES,
    };
  };

  const simNoGuard = useMemo(() => runRetirementSimulation(buildEnginePlan(false)), [plan]);
  const simGuard = useMemo(() => runRetirementSimulation(buildEnginePlan(true)), [plan]);

  const irmaaStats = useMemo(() => {
    const yearsNoGuard = simNoGuard.yearlyResults.filter((y) => y.primaryAge >= 65);
    const yearsGuard = simGuard.yearlyResults.filter((y) => y.primaryAge >= 65);

    const totalCostNoGuard = yearsNoGuard.reduce((sum, y) => sum + (y.irmaaSurchargeAnnual || 0), 0);
    const totalCostGuard = yearsGuard.reduce((sum, y) => sum + (y.irmaaSurchargeAnnual || 0), 0);
    const totalSaved = Math.max(0, totalCostNoGuard - totalCostGuard);

    const maxTierNoGuard = Math.max(0, ...yearsNoGuard.map((y) => y.irmaaTier || 0));
    const maxTierGuard = Math.max(0, ...yearsGuard.map((y) => y.irmaaTier || 0));

    return { totalCostNoGuard, totalCostGuard, totalSaved, maxTierNoGuard, maxTierGuard };
  }, [simNoGuard, simGuard]);

  const timelineChartData = useMemo(() => {
    const tier1Limit = irmaaList[0] ? (isMfj ? irmaaList[0].magiJoint : irmaaList[0].magiSingle) : 103000;
    const tier2Limit = irmaaList[1] ? (isMfj ? irmaaList[1].magiJoint : irmaaList[1].magiSingle) : 129000;

    return simGuard.yearlyResults.map((y) => ({
      age: y.primaryAge,
      magi: Math.round(y.magi || 0),
      surcharge: Math.round(y.irmaaSurchargeAnnual || 0),
      tier1Cliff: tier1Limit,
      tier2Cliff: tier2Limit,
    }));
  }, [simGuard, irmaaList, isMfj]);

  // Calculate surcharge for custom test MAGI
  const testMagiCalc = useMemo(() => {
    for (let idx = irmaaList.length - 1; idx >= 0; idx--) {
      const tierObj = irmaaList[idx];
      const limit = isMfj ? tierObj.magiJoint : tierObj.magiSingle;
      if (customTestMagi >= limit && limit > 0) {
        const monthlySurchargePerPerson = tierObj.partBMonthly + tierObj.partDMonthly;
        const annualHouseholdSurcharge = monthlySurchargePerPerson * 12 * (isMfj ? 2 : 1);
        return { tier: idx, monthlySurchargePerPerson, annualHouseholdSurcharge, limit };
      }
    }
    return { tier: 0, monthlySurchargePerPerson: 0, annualHouseholdSurcharge: 0, limit: irmaaList[0] ? (isMfj ? irmaaList[0].magiJoint : irmaaList[0].magiSingle) : 103000 };
  }, [customTestMagi, irmaaList, isMfj]);

  const updatePlanSettings = (avoidVal: boolean) => {
    if (!onUpdatePlan) return;
    onUpdatePlan({
      settings: {
        ...plan?.settings,
        avoidIrmaaCliffs: avoidVal,
      },
    });
  };

  return (
    <div className="space-y-6">
      {/* Header KPI Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-card border border-border p-4 rounded-2xl shadow-sm space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold text-muted-foreground">Medicare Age Status</span>
            <Calendar className="w-4 h-4 text-primary" />
          </div>
          <div className="text-xl font-bold font-mono text-foreground">
            Age {rules.medicareAge || 65}
          </div>
          <span className="text-[10px] text-muted-foreground block">
            Medicare Part B & D eligibility start
          </span>
        </div>

        <div className="bg-card border border-border p-4 rounded-2xl shadow-sm space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold text-muted-foreground">Lookback MAGI Start</span>
            <ShieldCheck className="w-4 h-4 text-indigo-500" />
          </div>
          <div className="text-xl font-bold font-mono text-indigo-500">
            Age {(rules.medicareAge || 65) - (rules.irmaaLookbackYears || 2)}
          </div>
          <span className="text-[10px] text-muted-foreground block">
            2-year tax return lookback rule applies
          </span>
        </div>

        <div className="bg-card border border-border p-4 rounded-2xl shadow-sm space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold text-muted-foreground">Tier 1 MAGI Threshold</span>
            <DollarSign className="w-4 h-4 text-emerald-500" />
          </div>
          <div className="text-xl font-bold font-mono text-foreground">
            {formatCurrency(tier1Limit)}
          </div>
          <span className="text-[10px] text-muted-foreground block">
            {isMfj ? 'Married Filing Jointly limit' : 'Single Filer limit'}
          </span>
        </div>

        <div className="bg-card border border-border p-4 rounded-2xl shadow-sm space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold text-muted-foreground">Lifetime Guardrail Savings</span>
            <Sparkles className="w-4 h-4 text-emerald-500" />
          </div>
          <div className="text-xl font-bold font-mono text-emerald-500">
            {formatCurrency(irmaaStats.totalSaved)}
          </div>
          <span className="text-[10px] text-muted-foreground block">
            Surcharges avoided via cliff guard
          </span>
        </div>
      </div>

      {/* SECTION 1: Medicare IRMAA GUARDRAIL CONTROLS */}
      <div className="bg-card border border-border rounded-2xl shadow-sm overflow-hidden">
        <CollapsibleCardHeader
          title="Medicare IRMAA Cliff Guardrail Controls"
          description="Protect your retirement income from triggering costly Medicare Part B & D surcharge cliffs"
          icon={ShieldCheck}
          isCollapsed={isOverviewCollapsed}
          onToggle={() => setIsOverviewCollapsed(!isOverviewCollapsed)}
        />

        {!isOverviewCollapsed && (
          <div className="p-5 space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 bg-muted/20 p-4 rounded-xl border border-border text-xs">
              {/* Avoid IRMAA Cliffs Toggle */}
              <div className="space-y-2">
                <label className="font-bold text-foreground block">Enable Medicare IRMAA Cliff Guardrail</label>
                <div className="flex items-center gap-3">
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
                  <label htmlFor="avoidIrmaaToggle" className="text-xs font-semibold text-muted-foreground cursor-pointer">
                    {avoidIrmaa ? 'Guardrail Active (Cap conversions $1,000 below Tier 1 cliff)' : 'No Guardrail (Risk cliff surcharges)'}
                  </label>
                </div>
              </div>

              {/* MAGI Surcharge Estimator Tool */}
              <div className="space-y-3 bg-card p-3.5 rounded-xl border border-border">
                <div className="flex items-center justify-between">
                  <label className="font-bold text-foreground">Interactive MAGI Surcharge Estimator</label>
                  <span className="font-mono text-primary font-bold">{formatCurrency(customTestMagi)}</span>
                </div>
                <Slider
                  min={80000}
                  max={400000}
                  step={5000}
                  value={customTestMagi}
                  ticks={[
                    { value: 80000, label: '$80k' },
                    { value: 200000, label: '$200k' },
                    { value: 400000, label: '$400k' },
                  ]}
                  onChange={(val) => setCustomTestMagi(Math.round(val))}
                  ariaLabel="MAGI Surcharge Estimator"
                />
                <div className="flex items-center justify-between text-[11px] font-mono">
                  <span className="text-muted-foreground">Result: <strong>Tier {testMagiCalc.tier}</strong></span>
                  <span className="text-rose-400 font-bold">
                    +{formatCurrency(testMagiCalc.monthlySurchargePerPerson)}/mo/person ({formatCurrency(testMagiCalc.annualHouseholdSurcharge)}/yr household)
                  </span>
                </div>
              </div>
            </div>

            {/* Active Status Bar */}
            <div className="flex items-center justify-between pt-2">
              <div className="text-xs text-muted-foreground">
                Lifetime Medicare Surcharges with active guardrail: <strong className="text-foreground font-mono">{formatCurrency(irmaaStats.totalCostGuard)}</strong>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* SECTION 2: MAGI VS IRMAA CLIFFS TIMELINE CHART */}
      <div className="bg-card border border-border rounded-2xl shadow-sm overflow-hidden">
        <CollapsibleCardHeader
          title="Retirement MAGI vs IRMAA Threshold Cliffs Timeline"
          description="Track projected MAGI from age 63+ against Tier 1 and Tier 2 IRMAA surcharge cliffs"
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
            <div className="h-72 w-full pt-2">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={timelineChartData}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
                  <XAxis dataKey="age" stroke="#888888" fontSize={11} tickLine={false} />
                  <YAxis
                    stroke="#888888"
                    fontSize={10}
                    tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`}
                    tickLine={false}
                  />
                  <Tooltip content={<IrmaaTooltip />} wrapperStyle={{ zIndex: 100, opacity: 1 }} />
                  <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '8px' }} />
                  <Line type="monotone" dataKey="magi" name="Projected MAGI" stroke="#3b82f6" strokeWidth={3} dot={false} />
                  <Line type="monotone" dataKey="tier1Cliff" name="IRMAA Tier 1 Cliff" stroke="#f59e0b" strokeWidth={1.5} strokeDasharray="4 4" dot={false} />
                  <Line type="monotone" dataKey="tier2Cliff" name="IRMAA Tier 2 Cliff" stroke="#ef4444" strokeWidth={1.5} strokeDasharray="4 4" dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}
      </div>

      {/* SECTION 3: 2026 MEDICARE IRMAA BRACKET REFERENCE TABLE */}
      <div className="bg-card border border-border rounded-2xl shadow-sm overflow-hidden">
        <CollapsibleCardHeader
          title="2026 Statutory Medicare Part B & Part D IRMAA Bracket Schedule"
          description="Official Medicare IRMAA surcharge rates by income bracket for Single and Married Filing Jointly tax filers"
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
                    <th className="px-3 py-2.5 text-right">Combined Annual (MFJ)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/40 font-mono">
                  {irmaaList.map((tier: any, idx: number) => {
                    const annualMfj = (tier.partBMonthly + tier.partDMonthly) * 12 * 2;
                    return (
                      <tr key={idx} className="hover:bg-muted/40">
                        <td className="px-3 py-2 font-bold text-foreground font-sans">Tier {idx}</td>
                        <td className="px-3 py-2 text-muted-foreground">
                          {tier.magiSingle === 0 ? 'Standard Rate' : `> ${formatCurrency(tier.magiSingle)}`}
                        </td>
                        <td className="px-3 py-2 text-muted-foreground">
                          {tier.magiJoint === 0 ? 'Standard Rate' : `> ${formatCurrency(tier.magiJoint)}`}
                        </td>
                        <td className="px-3 py-2 text-right text-rose-400">+{formatCurrency(tier.partBMonthly)}/mo</td>
                        <td className="px-3 py-2 text-right text-purple-400">+{formatCurrency(tier.partDMonthly)}/mo</td>
                        <td className="px-3 py-2 text-right font-bold text-rose-500">{formatCurrency(annualMfj)}/yr</td>
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

  const breachesTier1 = magi > tier1 && tier1 > 0;
  const breachesTier2 = magi > tier2 && tier2 > 0;

  return (
    <div className="bg-background/95 backdrop-blur-md border border-border rounded-xl p-3.5 shadow-xl text-xs space-y-2.5 min-w-[260px] max-w-[320px] z-50">
      <div className="flex items-center justify-between border-b border-border pb-1.5 font-bold">
        <span className="text-foreground font-mono">Age {age}</span>
        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border font-sans ${
          breachesTier2
            ? 'bg-rose-500/10 text-rose-500 border-rose-500/20'
            : breachesTier1
            ? 'bg-amber-500/10 text-amber-500 border-amber-500/20'
            : 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20'
        }`}>
          {breachesTier2 ? '⚠️ Tier 2 Cliff' : breachesTier1 ? '⚠️ Tier 1 Cliff' : '✅ Standard Premium'}
        </span>
      </div>

      <div className="space-y-1.5 font-mono">
        <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider font-sans pb-0.5 border-b border-border/50">
          MAGI & IRMAA Thresholds
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
                <span className="flex items-center gap-1.5 truncate max-w-[180px]" style={{ color: entry.color }}>
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

      {(breachesTier1 || breachesTier2) && (
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
