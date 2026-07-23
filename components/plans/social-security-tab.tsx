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
import { useCardCollapsed } from '@/lib/hooks/use-card-collapsed';

interface SocialSecurityTabProps {
  plan: any;
  onUpdatePlan?: (updates: any) => void;
}

export function SocialSecurityTab({ plan, onUpdatePlan }: SocialSecurityTabProps) {
  const [primaryAge, setPrimaryAge] = useState<number>(Number(plan?.primarySsStartAge) || 67);
  const [spouseAge, setSpouseAge] = useState<number>(Number(plan?.spouseSsStartAge) || 67);
  const [enableSpousal, setEnableSpousal] = useState<boolean>(plan?.enableSpousalSsBenefit !== false);

  const [isOverviewCollapsed, setIsOverviewCollapsed] = useCardCollapsed('ss_overview');
  const [isTrajectoryCollapsed, setIsTrajectoryCollapsed] = useCardCollapsed('ss_trajectory');
  const [isTaxabilityCollapsed, setIsTaxabilityCollapsed] = useCardCollapsed('ss_taxability');

  const [appliedMsg, setAppliedMsg] = useState<string>('');

  const primaryMonthlyPIA = parseFloat(plan?.primarySsMonthlyAmount) || 2500;
  const spouseMonthlyPIA = parseFloat(plan?.spouseSsMonthlyAmount) || 2000;
  const isMfj = plan?.filingStatus === 'married_joint' || Boolean(plan?.hasSpouse);

  // Helper to convert DB plan to EnginePlan object
  const buildEnginePlan = (customPrimaryAge: number, customSpouseAge: number): EnginePlan => {
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
      primarySsMonthlyAmount: primaryMonthlyPIA,
      primarySsStartAge: customPrimaryAge,
      spouseSsMonthlyAmount: spouseMonthlyPIA,
      spouseSsStartAge: customSpouseAge,
      enableSpousalSsBenefit: enableSpousal,
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
        enableRothConversions: Boolean(plan?.settings?.enableRothConversions),
        withdrawalMethod: plan?.settings?.withdrawalMethod || plan?.withdrawalMethod || 'textbook',
      },
      rules: plan?.rules || DEFAULT_2026_RULES,
    };
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
  const spouseMonthlyAmount = spouseMonthlyPIA * getSsMult(spouseAge);
  const totalAnnualHouseholdSS = (primaryMonthlyAmount + (isMfj ? spouseMonthlyAmount : 0)) * 12;

  // Run simulations for trajectories
  const simSelected = useMemo(() => runRetirementSimulation(buildEnginePlan(primaryAge, spouseAge)), [primaryAge, spouseAge, enableSpousal]);
  const sim62 = useMemo(() => runRetirementSimulation(buildEnginePlan(62, 62)), []);
  const sim67 = useMemo(() => runRetirementSimulation(buildEnginePlan(67, 67)), []);
  const sim70 = useMemo(() => runRetirementSimulation(buildEnginePlan(70, 70)), []);

  const chartData = useMemo(() => {
    const years62 = sim62.yearlyResults;
    const years67 = sim67.yearlyResults;
    const years70 = sim70.yearlyResults;
    const yearsSelected = simSelected.yearlyResults;

    let cum62 = 0;
    let cum67 = 0;
    let cum70 = 0;
    let cumSel = 0;

    return yearsSelected.map((y, idx) => {
      cum62 += years62[idx]?.ssIncome || 0;
      cum67 += years67[idx]?.ssIncome || 0;
      cum70 += years70[idx]?.ssIncome || 0;
      cumSel += y.ssIncome || 0;

      return {
        age: y.primaryAge,
        claim62: Math.round(cum62),
        claim67: Math.round(cum67),
        claim70: Math.round(cum70),
        selected: Math.round(cumSel),
      };
    });
  }, [sim62, sim67, sim70, simSelected]);

  const handleSaveToPlan = () => {
    if (!onUpdatePlan) return;
    onUpdatePlan({
      primarySsStartAge: primaryAge,
      spouseSsStartAge: spouseAge,
      enableSpousalSsBenefit: enableSpousal,
    });
    setAppliedMsg(`Successfully saved Social Security claiming ages (Primary: Age ${primaryAge}${isMfj ? `, Spouse: Age ${spouseAge}` : ''}) to active plan!`);
    setTimeout(() => setAppliedMsg(''), 4000);
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

      {/* Header KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-card border border-border p-4 rounded-2xl shadow-sm space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold text-muted-foreground">Primary Claiming Age</span>
            <Calendar className="w-4 h-4 text-primary" />
          </div>
          <div className="text-xl font-bold font-mono text-primary">Age {primaryAge}</div>
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

      {/* SECTION 1: INTERACTIVE CLAIMING AGE CONTROLS */}
      <div className="bg-card border border-border rounded-2xl shadow-sm overflow-hidden">
        <CollapsibleCardHeader
          title="Social Security Claiming Age & Spousal Strategy"
          description="Adjust claiming ages from 62 (early penalty) to 70 (delayed credits +24%) to optimize portfolio longevity"
          icon={HeartHandshake}
          isCollapsed={isOverviewCollapsed}
          onToggle={() => setIsOverviewCollapsed(!isOverviewCollapsed)}
        />

        {!isOverviewCollapsed && (
          <div className="p-5 space-y-6">
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
                <input
                  type="range"
                  min={62}
                  max={70}
                  step={1}
                  value={primaryAge}
                  onChange={(e) => setPrimaryAge(parseInt(e.target.value, 10))}
                  className="w-full accent-primary cursor-pointer h-2 bg-muted rounded-lg"
                />
                <div className="flex justify-between text-[10px] text-muted-foreground font-mono">
                  <span>Age 62 (70%)</span>
                  <span>Age 67 (100% FRA)</span>
                  <span>Age 70 (124%)</span>
                </div>
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
                  <input
                    type="range"
                    min={62}
                    max={70}
                    step={1}
                    value={spouseAge}
                    onChange={(e) => setSpouseAge(parseInt(e.target.value, 10))}
                    className="w-full accent-purple-500 cursor-pointer h-2 bg-muted rounded-lg"
                  />
                  <div className="flex justify-between text-[10px] text-muted-foreground font-mono">
                    <span>Age 62 (70%)</span>
                    <span>Age 67 (100% FRA)</span>
                    <span>Age 70 (124%)</span>
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-center p-4 bg-card rounded-lg border border-border text-xs text-muted-foreground">
                  Filing status is Single. Enable spouse in Plan Details for spousal benefits.
                </div>
              )}
            </div>

            {/* Action Bar */}
            <div className="flex items-center justify-between pt-2">
              <div className="text-xs text-muted-foreground">
                Plan Ending Net Worth with selected SS ages: <strong className="text-foreground font-mono">{formatCurrency(simSelected.endingNetWorth)}</strong>
              </div>
              <button
                onClick={handleSaveToPlan}
                className="bg-primary hover:bg-primary/90 text-primary-foreground text-xs font-bold px-5 py-2.5 rounded-xl shadow-md transition-all cursor-pointer"
              >
                Apply Claiming Ages to Active Plan
              </button>
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
                  <Tooltip
                    formatter={(value: any) => [formatCurrency(Number(value)), 'Cumulative Payout']}
                    labelFormatter={(label) => `Age ${label}`}
                    contentStyle={{ backgroundColor: 'rgba(15, 23, 42, 0.95)', borderColor: '#334155', borderRadius: '12px', fontSize: '11px', color: '#fff' }}
                  />
                  <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '8px' }} />
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
