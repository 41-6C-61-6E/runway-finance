'use client';

import { useState, useMemo, useEffect } from 'react';
import { formatCurrency } from '@/lib/utils/format';
import { runRetirementSimulation, EnginePlan } from '@/lib/services/retirement-engine';
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

  // Real-time dynamic retirement simulation reacting instantly to Retirement Age & Return Rate sliders
  const simulation = useMemo(() => {
    if (!plan) return null;

    const planAccountsList = Array.isArray(plan.accounts) ? plan.accounts : [];
    const planEventsList = Array.isArray(plan.events) ? plan.events : [];
    const planFlowsList = Array.isArray(plan.flows) ? plan.flows : [];

    const activeAccounts = planAccountsList.filter((a: any) => a.isIncluded !== false);

    const enginePlan: EnginePlan = {
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
      events: planEventsList.map((e: any) => ({
        id: e.id,
        name: e.name,
        category: e.category as any,
        type: e.type,
        owner: e.owner || 'primary',
        amount: parseFloat(e.amount) || 0,
        frequency: e.frequency as any,
        growthRate: parseFloat(e.growthRate) || 0,
        adjustForInflation: e.adjustForInflation !== false,
        startTriggerType: e.startTriggerType || 'now',
        startTriggerValue: e.startTriggerValue,
        endTriggerType: e.endTriggerType || 'retirement',
        endTriggerValue: e.endTriggerValue,
      })),
      flows: planFlowsList.map((f: any) => ({
        id: f.id,
        name: f.name,
        type: f.type as any,
        rank: f.rank || 1,
        targetAccountId: f.targetAccountId,
        ruleType: f.ruleType as any,
        ruleValue: f.ruleValue ? parseFloat(f.ruleValue) : undefined,
      })),
      settings: {
        fixedInflationRate: parseFloat(plan.settings?.fixedInflationRate || '3.0'),
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

    return runRetirementSimulation(enginePlan);
  }, [plan, localRetirementAge, localReturnRate]);

  const yearlySimResults = useMemo(() => simulation?.yearlyResults || [], [simulation]);

  // Rich Milestone Callouts Data (with stroke colors for chart markers)
  const milestoneCallouts = useMemo(() => {
    const list = [
      {
        age: 50,
        title: 'Catch-up Limits',
        year: birthYear + 50,
        icon: Award,
        color: 'text-blue-500',
        borderColor: 'border-blue-500/30',
        bgColor: 'bg-blue-500/10',
        stroke: '#3b82f6',
        note: 'IRA +$1k & 401(k) +$7.5k annual catch-up limits unlocked',
      },
      {
        age: 55,
        title: 'Rule of 55 Access',
        year: birthYear + 55,
        icon: Clock,
        color: 'text-amber-500',
        borderColor: 'border-amber-500/30',
        bgColor: 'bg-amber-500/10',
        stroke: '#f59e0b',
        note: 'Penalty-free 401(k) separations allowed if separated from service',
      },
      {
        age: localRetirementAge,
        title: 'Retirement Transition',
        year: birthYear + localRetirementAge,
        icon: Palmtree,
        color: 'text-emerald-500',
        borderColor: 'border-emerald-500/30',
        bgColor: 'bg-emerald-500/10',
        stroke: '#10b981',
        note: 'Primary career end • Distribution phase begins',
      },
      {
        age: 65,
        title: 'Medicare Eligibility',
        year: birthYear + 65,
        icon: ShieldCheck,
        color: 'text-purple-500',
        borderColor: 'border-purple-500/30',
        bgColor: 'bg-purple-500/10',
        stroke: '#a855f7',
        note: 'Transition to Medicare Part B/D • ACA subsidies end',
      },
      {
        age: 67,
        title: 'Full Social Security',
        year: birthYear + 67,
        icon: Landmark,
        color: 'text-cyan-500',
        borderColor: 'border-cyan-500/30',
        bgColor: 'bg-cyan-500/10',
        stroke: '#06b6d4',
        note: '100% Full Retirement Age SS benefit payout',
      },
      {
        age: 73,
        title: 'RMD Mandatory Start',
        year: birthYear + 73,
        icon: Flag,
        color: 'text-rose-500',
        borderColor: 'border-rose-500/30',
        bgColor: 'bg-rose-500/10',
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

  // Chart data series mapped dynamically
  const chartData = useMemo(() => {
    if (yearlySimResults.length > 0) {
      return yearlySimResults.map((y: any) => ({
        year: y.year,
        age: y.primaryAge,
        spouseAge: y.spouseAge,
        label: `${y.year}`,
        netWorth: Math.round(y.netWorth),
        income: Math.round(y.grossIncome),
        expenses: y.primaryAge >= localRetirementAge ? Math.round(y.totalExpenses) : null,
        isRetired: y.primaryAge >= localRetirementAge,
        salaryIncome: Math.round(y.salaryIncome || 0),
        ssIncome: Math.round(y.ssIncome || 0),
        pensionIncome: Math.round(y.pensionIncome || 0),
        otherIncome: Math.round(y.otherIncome || 0),
        cashDrawdown: Math.round(y.drawdownsByType?.cash || 0),
        taxableDrawdown: Math.round(y.drawdownsByType?.taxable || 0),
        traditionalDrawdown: Math.round(y.drawdownsByType?.traditional || 0),
        rothDrawdown: Math.round(y.drawdownsByType?.roth || 0),
        hsaDrawdown: Math.round(y.drawdownsByType?.hsa || 0),
        totalDrawdown: Math.round(y.deficitWithdrawn || 0),
        rothConversionAmount: Math.round(y.rothConversionAmount || 0),
        magi: Math.round(y.magi || 0),
        irmaaSurchargeAnnual: Math.round(y.irmaaSurchargeAnnual || 0),
        accountDrawdowns: y.accountDrawdowns || [],
        milestone: milestoneMap[y.primaryAge],
      }));
    }
    return [];
  }, [yearlySimResults, localRetirementAge, milestoneMap]);

  // Key metrics
  const retirementDataPoint = chartData.find((d) => d.age === localRetirementAge);
  const netWorthAtRetirement = retirementDataPoint?.netWorth || 0;
  const annualExpensesFromPlan = plan?.events?.find((e: any) => e.category === 'expense')?.amount || 42500;
  const fireNumber = parseFloat(String(annualExpensesFromPlan)) * 25;
  const fireProgress = fireNumber > 0 ? Math.min(100, (currentNetWorth / fireNumber) * 100) : 0;
  const yearsToFire = chartData.findIndex((d) => d.netWorth >= fireNumber);
  const yearsToFireDisplay = yearsToFire >= 0 ? yearsToFire : '—';

  // Strategy description tag
  const activeStrategyLabel = useMemo(() => {
    const method = plan?.settings?.withdrawalMethod || plan?.withdrawalMethod || 'textbook';
    if (method === 'tax_optimized') return 'Tax-Bracket Shielding (Fill 12% Bracket First)';
    if (method === 'proportional') return 'Proportional Drawdown Across Portfolio';
    if (method === 'custom_order') return 'Custom Priority Order';
    return 'Textbook Waterfall (Cash → Taxable → Traditional → Roth)';
  }, [plan]);

  return (
    <div className="space-y-6 max-w-5xl">
      {/* Top Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-card border border-border rounded-xl p-4 shadow-sm space-y-1">
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <DollarSign className="w-3.5 h-3.5" />
            <span className="text-[11px] font-semibold uppercase tracking-wider">Current Net Worth</span>
          </div>
          <p className="text-xl font-extrabold text-foreground font-mono">{formatCurrency(currentNetWorth)}</p>
        </div>

        <div className="bg-card border border-border rounded-xl p-4 shadow-sm space-y-1">
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <Palmtree className="w-3.5 h-3.5" />
            <span className="text-[11px] font-semibold uppercase tracking-wider">At Retirement (Age {localRetirementAge})</span>
          </div>
          <p className="text-xl font-extrabold text-emerald-500 font-mono">{formatCurrency(netWorthAtRetirement)}</p>
        </div>

        <div className="bg-card border border-border rounded-xl p-4 shadow-sm space-y-1">
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <Target className="w-3.5 h-3.5" />
            <span className="text-[11px] font-semibold uppercase tracking-wider">FIRE Target (25×)</span>
          </div>
          <p className="text-xl font-extrabold text-primary font-mono">{formatCurrency(fireNumber)}</p>
          <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden">
            <div
              className="h-full bg-primary rounded-full transition-all duration-500"
              style={{ width: `${Math.min(100, fireProgress)}%` }}
            />
          </div>
          <p className="text-[10px] text-muted-foreground font-medium">{fireProgress.toFixed(0)}% achieved</p>
        </div>

        <div className="bg-card border border-border rounded-xl p-4 shadow-sm space-y-1">
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <Clock className="w-3.5 h-3.5" />
            <span className="text-[11px] font-semibold uppercase tracking-wider">Years to FIRE</span>
          </div>
          <p className="text-xl font-extrabold text-foreground font-mono">{yearsToFireDisplay}</p>
          {simulation?.success !== undefined && (
            <div
              className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                simulation.success
                  ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20'
                  : 'bg-rose-500/10 text-rose-500 border-rose-500/20'
              }`}
            >
              <ShieldCheck className="w-3 h-3" />
              {simulation.success ? 'Plan Succeeds' : `Depletes at Age ${simulation.depletionAge || '?'}`}
            </div>
          )}
        </div>
      </div>

      {/* Main Projection Chart Container */}
      <div className="bg-card border border-border rounded-xl p-5 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-bold text-foreground flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-primary" />
              FIRE Portfolio Net Worth Trajectory
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Age {currentAge} → {plan?.lifeExpectancyAge || 100} • {chartData.length} years projected
            </p>
          </div>
        </div>

        {/* Dynamic Chart Area with On-Graph Milestone Reference Markers */}
        <div className="h-80 w-full">
          <ResponsiveContainer width="100%" height="100%">
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
                label={{ value: 'Age', position: 'insideBottomRight', offset: -5, className: 'text-xs fill-muted-foreground' }}
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

              {/* Retirement Age Vertical Line Marker */}
              <ReferenceLine
                x={localRetirementAge}
                stroke="#10b981"
                strokeDasharray="4 4"
                strokeWidth={2}
                label={{
                  value: `🌴 Retirement (Age ${localRetirementAge})`,
                  position: 'top',
                  fill: '#10b981',
                  fontSize: 11,
                  fontWeight: 'bold',
                }}
              />

              {/* Milestone Icons on Graph Trajectory Curve */}
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
          </ResponsiveContainer>
        </div>
      </div>

      {/* Key Statutory & Retirement Milestones Grid */}
      <div className="bg-card border border-border rounded-xl p-5 shadow-sm space-y-3">
        <div className="flex items-center justify-between border-b border-border pb-2.5">
          <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
            <Award className="w-4 h-4 text-primary" />
            Key Statutory & Retirement Milestones
          </h3>
          <span className="text-[11px] text-muted-foreground font-medium">Automated Age & Statutory Triggers</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5 pt-1">
          {milestoneCallouts.map((m, idx) => {
            const Icon = m.icon;
            const pt = chartData.find((d) => d.age === m.age);
            return (
              <div
                key={idx}
                className={`bg-card border ${m.borderColor} rounded-xl p-3.5 space-y-2 hover:shadow-md transition-all`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className={`p-1.5 rounded-lg ${m.bgColor} ${m.color}`}>
                      <Icon className="w-4 h-4" />
                    </div>
                    <div>
                      <h4 className="text-xs font-bold text-foreground">{m.title}</h4>
                      <p className="text-[10px] text-muted-foreground">
                        Age {m.age} • Year {m.year}
                      </p>
                    </div>
                  </div>
                  {pt && (
                    <span className="text-xs font-mono font-bold text-foreground bg-muted/40 px-2 py-0.5 rounded">
                      {formatCurrency(pt.netWorth)}
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-muted-foreground leading-snug">{m.note}</p>
              </div>
            );
          })}
        </div>
      </div>

      {/* Retirement Income Streams & Account Drawdown Sources Chart */}
      <div className="bg-card border border-border rounded-xl p-5 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b border-border pb-3">
          <div>
            <div className="flex items-center gap-2">
              <Layers className="w-4 h-4 text-emerald-500" />
              <h3 className="text-sm font-bold text-foreground">Retirement Income Streams & Account Drawdown Sources</h3>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              Year-by-year income origins and account drawdown breakdown under strategy:{' '}
              <span className="font-semibold text-primary font-mono">{activeStrategyLabel}</span>
            </p>
          </div>
          <button
            onClick={() => setShowDrawdownDetails(!showDrawdownDetails)}
            className="text-xs font-semibold text-primary hover:underline flex items-center gap-1 cursor-pointer shrink-0"
          >
            {showDrawdownDetails ? 'Collapse Breakdown' : 'Expand Drawdown Breakdown'}
          </button>
        </div>

        {showDrawdownDetails && (
          <div className="space-y-5 animate-in fade-in">
            {/* Stacked Bar Chart for Income Streams & Drawdowns */}
            <div className="h-80 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={chartData} margin={{ top: 10, right: 10, left: 10, bottom: 0 }}>
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
                  <Tooltip content={<DrawdownTooltip />} />
                  <Legend content={<GroupedLegend />} wrapperStyle={{ fontSize: '11px', paddingTop: '8px' }} />

                  {/* Retirement Age Vertical Line */}
                  <ReferenceLine
                    x={localRetirementAge}
                    stroke="#10b981"
                    strokeDasharray="4 4"
                    strokeWidth={1.5}
                    label={{
                      value: `Retirement`,
                      position: 'top',
                      fill: '#10b981',
                      fontSize: 10,
                      fontWeight: 600,
                    }}
                  />

                  {/* Income Bars */}
                  <Bar dataKey="salaryIncome" name="Salary / Earned" stackId="income" fill="#10b981" />
                  <Bar dataKey="ssIncome" name="Social Security" stackId="income" fill="#06b6d4" />
                  <Bar dataKey="pensionIncome" name="Pension" stackId="income" fill="#3b82f6" />
                  <Bar dataKey="otherIncome" name="Other Income" stackId="income" fill="#8b5cf6" />

                  {/* Account Drawdown Bars */}
                  <Bar dataKey="cashDrawdown" name="Cash Drawdown" stackId="drawdown" fill="#64748b" />
                  <Bar dataKey="taxableDrawdown" name="Taxable Brokerage" stackId="drawdown" fill="#f59e0b" />
                  <Bar dataKey="traditionalDrawdown" name="Traditional IRA/401k" stackId="drawdown" fill="#a855f7" />
                  <Bar dataKey="rothDrawdown" name="Roth IRA/401k" stackId="drawdown" fill="#ec4899" />
                  <Bar dataKey="rothConversionAmount" name="Roth Conversion" stackId="drawdown" fill="#f97316" />
                  <Bar dataKey="hsaDrawdown" name="HSA Drawdown" stackId="drawdown" fill="#14b8a6" />

                  {/* Dynamic Expenses Line — follows inflation/growth per year */}
                  <Line
                    type="monotone"
                    dataKey="expenses"
                    name="Annual Expenses"
                    stroke="#f43f5e"
                    strokeWidth={2}
                    strokeDasharray="6 3"
                    dot={false}
                    activeDot={{ r: 4, fill: '#f43f5e', strokeWidth: 0 }}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}
      </div>

      {/* What-If Explorer Sliders */}
      <div className="bg-card border border-border rounded-xl p-5 shadow-sm space-y-4">
        <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
          <Flame className="w-4 h-4 text-primary" />
          What-If Explorer
          <span className="text-[10px] font-medium text-muted-foreground ml-1">
            Adjust parameters to see how they affect your projection
          </span>
        </h3>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          {/* Retirement Age Slider */}
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
              onChange={(e) => {
                const newAge = parseInt(e.target.value, 10);
                setLocalRetirementAge(newAge);
                onUpdatePlan({ retirementAge: newAge });
              }}
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
              <span className={`font-mono font-bold text-sm ${localReturnRate < 0 ? 'text-rose-500' : 'text-primary'}`}>
                {localReturnRate > 0 ? `+${localReturnRate}%` : `${localReturnRate}%`}
              </span>
            </div>
            <input
              type="range"
              min="-10"
              max="15"
              step="0.5"
              value={localReturnRate}
              onChange={(e) => setLocalReturnRate(parseFloat(e.target.value))}
              className="w-full accent-primary h-2 cursor-pointer"
            />
            <div className="flex justify-between text-[10px] text-muted-foreground font-mono">
              <span className="text-rose-500/80">-10%</span>
              <span>-5%</span>
              <span>0%</span>
              <span>7%</span>
              <span>15%</span>
            </div>
          </div>
        </div>
      </div>

      {/* Expandable Year-by-Year Table with Detailed Drawdowns */}
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
                  <th className="p-2.5">Cash Drawdown</th>
                  <th className="p-2.5">Taxable Drawdown</th>
                  <th className="p-2.5">Traditional Drawdown</th>
                  <th className="p-2.5">Roth Drawdown</th>
                  <th className="p-2.5">Roth Conversion</th>
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
                      <td className="p-2.5 text-slate-400">{formatCurrency(y.cashDrawdown)}</td>
                      <td className="p-2.5 text-amber-500">{formatCurrency(y.taxableDrawdown)}</td>
                      <td className="p-2.5 text-purple-500">{formatCurrency(y.traditionalDrawdown)}</td>
                      <td className="p-2.5 text-pink-500">{formatCurrency(y.rothDrawdown)}</td>
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
  const incomeGap = Math.max(0, (data.expenses || 0) - incomeTotal);
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
        {data.expenses != null && (
          <div className="border-t border-border/40 pt-1 space-y-1">
            <div className="flex justify-between text-rose-500">
              <span>Expenses:</span>
              <span>{formatCurrency(data.expenses)}</span>
            </div>
            {incomeGap > 0 && (
              <div className="flex justify-between font-bold text-amber-500">
                <span>Income Gap:</span>
                <span>{formatCurrency(incomeGap)}</span>
              </div>
            )}
            {incomeGap <= 0 && incomeTotal > 0 && (
              <div className="flex justify-between font-bold text-emerald-500">
                <span>Surplus:</span>
                <span>{formatCurrency(incomeTotal - (data.expenses || 0))}</span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
