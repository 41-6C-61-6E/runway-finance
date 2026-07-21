'use client';

import { useState, useMemo, useCallback, useEffect } from 'react';
import { formatCurrency } from '@/lib/utils/format';
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer,
  ReferenceLine, ReferenceDot, CartesianGrid,
} from 'recharts';
import {
  TrendingUp, Flame, Target, Calendar, Clock, Palmtree,
  ShieldCheck, ChevronDown, ChevronUp, DollarSign, Award,
  Landmark, Flag, Activity,
} from 'lucide-react';

interface ProjectionTabProps {
  plan: any;
  accounts: any[];
  onUpdatePlan: (updates: any) => void;
}

export function ProjectionTab({ plan, accounts, onUpdatePlan }: ProjectionTabProps) {
  const [showYearlyTable, setShowYearlyTable] = useState(false);
  const [localRetirementAge, setLocalRetirementAge] = useState(Number(plan?.retirementAge) || 60);
  const [localReturnRate, setLocalReturnRate] = useState(7);

  // Sync local retirement age state when plan changes
  useEffect(() => {
    if (plan?.retirementAge) {
      setLocalRetirementAge(Number(plan.retirementAge));
    }
  }, [plan?.retirementAge]);

  const simulation = plan?.simulation;
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

  // Real-time dynamic chart projection reacting instantly to slider changes
  const chartData = useMemo(() => {
    const data = [];
    const startNw = currentNetWorth || 100000;
    let nw = startNw;
    const growthRate = localReturnRate / 100;
    const retAge = localRetirementAge;
    const endAge = Number(plan?.lifeExpectancyAge) || 100;

    // Extract income streams and living expenses from plan
    const salaryEvent = plan?.events?.find((e: any) => e.category === 'income' && e.type === 'salary');
    const ssEvent = plan?.events?.find((e: any) => e.category === 'income' && e.type === 'social_security');
    const otherIncomeEvents = plan?.events?.filter((e: any) => e.category === 'income' && !['salary', 'social_security'].includes(e.type)) || [];
    const expenseEvents = plan?.events?.filter((e: any) => e.category === 'expense') || [];

    const annualSalary = parseFloat(salaryEvent?.amount || '85000');
    const annualSS = parseFloat(ssEvent?.amount || '32000');
    const annualOtherIncome = otherIncomeEvents.reduce((s: number, e: any) => s + (parseFloat(e.amount) || 0), 0);
    const annualExpenses = expenseEvents.reduce((s: number, e: any) => s + (parseFloat(e.amount) || 0), 0) || 42500;

    for (let age = currentAge; age <= endAge; age++) {
      const year = currentYear + (age - currentAge);
      const isRetired = age >= retAge;

      let income = 0;
      if (!isRetired) {
        income += annualSalary;
      }
      if (age >= 67) {
        income += annualSS;
      }
      income += annualOtherIncome;

      data.push({
        year,
        age,
        label: `${year}`,
        netWorth: Math.round(nw),
        income: Math.round(income),
        expenses: Math.round(annualExpenses),
        isRetired,
      });

      // Compound net worth for next year
      const netCashFlow = income - annualExpenses;
      const investmentGrowth = nw * growthRate;
      nw = nw + investmentGrowth + netCashFlow;
      if (nw < 0) nw = 0; // Depletion floor
    }

    return data;
  }, [currentNetWorth, plan, localRetirementAge, localReturnRate, currentAge, currentYear]);

  // Key metrics
  const retirementDataPoint = chartData.find((d) => d.age === localRetirementAge);
  const netWorthAtRetirement = retirementDataPoint?.netWorth || 0;
  const annualExpensesFromPlan = plan?.events?.find((e: any) => e.category === 'expense')?.amount || 42500;
  const fireNumber = parseFloat(String(annualExpensesFromPlan)) * 25;
  const fireProgress = fireNumber > 0 ? Math.min(100, (currentNetWorth / fireNumber) * 100) : 0;
  const yearsToFire = chartData.findIndex((d) => d.netWorth >= fireNumber);
  const yearsToFireDisplay = yearsToFire >= 0 ? yearsToFire : '—';

  // Rich Milestone Callouts Data (Monocolor Vector Icons Only)
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
        title: 'Mandatory RMD Start',
        year: birthYear + 73,
        icon: Flag,
        color: 'text-orange-500',
        borderColor: 'border-orange-500/30',
        bgColor: 'bg-orange-500/10',
        stroke: '#f97316',
        note: 'IRS Table III required minimum traditional distributions',
      },
    ];

    return list
      .filter((m) => m.age >= currentAge)
      .map((m) => {
        const point = chartData.find((d) => d.age === m.age);
        return {
          ...m,
          projectedNW: point?.netWorth || 0,
        };
      });
  }, [birthYear, localRetirementAge, currentAge, chartData]);

  // Fully Opaque, High-Contrast Custom Tooltip
  const CustomTooltip = ({ active, payload }: any) => {
    if (!active || !payload?.length) return null;
    const data = payload[0]?.payload;
    const activeMilestone = milestoneCallouts.find((m) => m.age === data?.age);

    return (
      <div className="!bg-slate-900 !text-slate-100 border-2 border-slate-700/80 rounded-xl p-3.5 shadow-2xl text-xs space-y-2 min-w-[210px] z-50">
        <div className="flex items-center justify-between font-bold text-slate-100">
          <span className="text-sm">Age {data?.age}</span>
          <span className="text-slate-400 font-mono">{data?.year}</span>
        </div>

        <div className="border-t border-slate-800 pt-2 space-y-1">
          <div className="flex justify-between">
            <span className="text-slate-400">Projected Net Worth</span>
            <span className="font-mono font-bold text-emerald-400">{formatCurrency(data?.netWorth || 0)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-400">Gross Income</span>
            <span className="font-mono text-slate-200">{formatCurrency(data?.income || 0)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-400">Total Outflows</span>
            <span className="font-mono text-rose-400">{formatCurrency(data?.expenses || 0)}</span>
          </div>
        </div>

        {activeMilestone && (
          <div className={`mt-1 p-2 rounded-lg ${activeMilestone.bgColor} border ${activeMilestone.borderColor} space-y-0.5`}>
            <div className="flex items-center gap-1.5 font-bold text-slate-100">
              <activeMilestone.icon className={`w-3.5 h-3.5 ${activeMilestone.color}`} />
              <span>{activeMilestone.title}</span>
            </div>
            <p className="text-[10px] text-slate-300 leading-tight">{activeMilestone.note}</p>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {/* Key Metrics Row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
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
            <div className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full border ${
              simulation.success
                ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20'
                : 'bg-rose-500/10 text-rose-500 border-rose-500/20'
            }`}>
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
              FIRE Projection Trajectory
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Age {currentAge} → {plan?.lifeExpectancyAge || 100} • {chartData.length} years projected
            </p>
          </div>
        </div>

        {/* Clean Chart Area */}
        <div className="h-80 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData} margin={{ top: 20, right: 20, left: 10, bottom: 0 }}>
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
                tickFormatter={(val) => val >= 1000000 ? `$${(val / 1000000).toFixed(1)}M` : `$${(val / 1000).toFixed(0)}k`}
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

              {/* Milestone Monocolor Lucide Vector Icons rendered RIGHT ON THE TIMELINE CURVE */}
              {milestoneCallouts.map((m) => {
                if (!m.projectedNW) return null;
                const Icon = m.icon;
                return (
                  <ReferenceDot
                    key={`${m.title}-${m.age}`}
                    x={m.age}
                    y={m.projectedNW}
                    shape={(props: any) => {
                      const { cx, cy } = props;
                      if (!cx || !cy) return null;
                      return (
                        <g transform={`translate(${cx},${cy})`} className="cursor-pointer">
                          <circle r="14" fill={m.stroke} fillOpacity="0.25" />
                          <circle r="11" fill="var(--color-card)" stroke={m.stroke} strokeWidth="2" />
                          <foreignObject x={-6.5} y={-6.5} width={13} height={13}>
                            <div className="w-full h-full flex items-center justify-center">
                              <Icon className={`w-3.5 h-3.5 ${m.color}`} />
                            </div>
                          </foreignObject>
                        </g>
                      );
                    }}
                  />
                );
              })}

              {/* Subtle Horizontal FIRE Goal Line */}
              <ReferenceLine
                y={fireNumber}
                stroke="var(--color-primary)"
                strokeDasharray="4 4"
                strokeWidth={1}
                strokeOpacity={0.7}
                label={{
                  value: `FIRE Goal (${formatCurrency(fireNumber)})`,
                  position: 'right',
                  fill: 'var(--color-primary)',
                  fontSize: 10,
                  fontWeight: 'bold',
                }}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Milestone Callout Cards Grid (Monocolor Vector Icons) */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
            <Activity className="w-4 h-4 text-primary" />
            Timeline Milestone Callouts & Impact Gates
          </h3>
          <span className="text-xs text-muted-foreground">US Tax, Medicare, SS, and RMD Gates</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {milestoneCallouts.map((m) => {
            const Icon = m.icon;
            const isRetirement = m.age === localRetirementAge;
            return (
              <div
                key={`${m.title}-${m.age}`}
                className={`bg-card border rounded-xl p-4 shadow-sm space-y-2 transition-all hover:border-primary/50 ${
                  isRetirement ? 'border-emerald-500/40 bg-emerald-500/5' : 'border-border'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className={`p-1.5 rounded-lg ${m.bgColor}`}>
                      <Icon className={`w-4 h-4 ${m.color}`} />
                    </div>
                    <div>
                      <h4 className="text-xs font-bold text-foreground">{m.title}</h4>
                      <p className="text-[10px] text-muted-foreground font-mono">Age {m.age} • {m.year}</p>
                    </div>
                  </div>
                  <span className="text-xs font-mono font-extrabold text-foreground">
                    {formatCurrency(m.projectedNW)}
                  </span>
                </div>

                <p className="text-[11px] text-muted-foreground leading-snug border-t border-border/50 pt-2">
                  {m.note}
                </p>
              </div>
            );
          })}
        </div>
      </div>

      {/* What-If Sliders */}
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
            <div className="flex justify-between text-[10px] text-muted-foreground">
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

      {/* Expandable Year-by-Year Table */}
      <div className="bg-card border border-border rounded-xl shadow-sm overflow-hidden">
        <button
          onClick={() => setShowYearlyTable(!showYearlyTable)}
          className="w-full flex items-center justify-between p-4 text-sm font-bold text-foreground hover:bg-muted/20 transition-colors"
        >
          <span className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-primary" />
            Year-by-Year Projection Data
          </span>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span>{chartData.length} years</span>
            {showYearlyTable ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </div>
        </button>

        {showYearlyTable && (
          <div className="border-t border-border overflow-x-auto max-h-[500px] overflow-y-auto">
            <table className="w-full text-xs text-left">
              <thead className="bg-muted/40 text-muted-foreground font-semibold sticky top-0">
                <tr>
                  <th className="p-2.5">Year</th>
                  <th className="p-2.5">Age</th>
                  <th className="p-2.5">Net Worth</th>
                  <th className="p-2.5">Income</th>
                  <th className="p-2.5">Expenses</th>
                  <th className="p-2.5">Cash Flow</th>
                  <th className="p-2.5">Phase</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {chartData.map((y: any) => {
                  const isRetired = y.isRetired;
                  const isRetirementYear = y.age === localRetirementAge;
                  const cashFlow = y.income - y.expenses;
                  return (
                    <tr
                      key={y.year}
                      className={`hover:bg-muted/20 ${isRetirementYear ? 'bg-emerald-500/5 border-l-2 border-l-emerald-500' : ''}`}
                    >
                      <td className="p-2.5 font-medium">{y.year}</td>
                      <td className="p-2.5">{y.age}</td>
                      <td className="p-2.5 font-mono font-bold text-foreground">
                        {formatCurrency(y.netWorth)}
                      </td>
                      <td className="p-2.5 font-mono text-emerald-500">
                        {formatCurrency(y.income)}
                      </td>
                      <td className="p-2.5 font-mono text-rose-500">
                        {formatCurrency(y.expenses)}
                      </td>
                      <td className={`p-2.5 font-mono font-bold ${cashFlow >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                        {formatCurrency(cashFlow)}
                      </td>
                      <td className="p-2.5">
                        <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full ${
                          isRetired
                            ? 'bg-amber-500/10 text-amber-500'
                            : 'bg-emerald-500/10 text-emerald-500'
                        }`}>
                          {isRetired ? '🌴 Distribution' : '📈 Accumulation'}
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
