'use client';

import { useState, useMemo, useCallback } from 'react';
import { formatCurrency } from '@/lib/utils/format';
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer,
  ReferenceLine, CartesianGrid, ComposedChart, Bar,
} from 'recharts';
import {
  TrendingUp, Flame, Target, Calendar, Clock, Palmtree,
  ShieldCheck, ChevronDown, ChevronUp, DollarSign,
} from 'lucide-react';

interface ProjectionTabProps {
  plan: any;
  accounts: any[];
  onUpdatePlan: (updates: any) => void;
}

export function ProjectionTab({ plan, accounts, onUpdatePlan }: ProjectionTabProps) {
  const [showYearlyTable, setShowYearlyTable] = useState(false);
  const [localRetirementAge, setLocalRetirementAge] = useState(plan?.retirementAge || 60);
  const [localReturnRate, setLocalReturnRate] = useState(7);
  const [sliderDirty, setSliderDirty] = useState(false);

  const simulation = plan?.simulation;
  const yearlyResults = simulation?.yearlyResults || [];
  const birthYear = plan?.primaryBirthYear || 1985;
  const currentYear = new Date().getFullYear();
  const currentAge = currentYear - birthYear;

  // Compute current net worth from actual accounts
  const currentNetWorth = useMemo(() => {
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
  }, [accounts]);

  // Chart data from simulation
  const chartData = useMemo(() => {
    if (yearlyResults.length > 0) {
      return yearlyResults.map((y: any) => ({
        year: y.year,
        age: y.primaryAge,
        label: `${y.year}`,
        netWorth: Math.round(y.netWorth),
        income: Math.round(y.grossIncome),
        expenses: Math.round(y.totalExpenses + y.taxesPaid),
        isRetired: y.primaryAge >= localRetirementAge,
      }));
    }

    // Fallback: generate projection from current data
    const data = [];
    let nw = Math.max(50000, currentNetWorth || 100000);
    const annualIncome = plan?.events?.find((e: any) => e.category === 'income' && e.type === 'salary')?.amount || 85000;
    const annualExpenses = plan?.events?.find((e: any) => e.category === 'expense')?.amount || 42500;
    const savingsRate = Math.max(0, parseFloat(String(annualIncome)) - parseFloat(String(annualExpenses)));
    const growthRate = localReturnRate / 100;
    const retAge = localRetirementAge;
    const endAge = plan?.lifeExpectancyAge || 100;

    for (let age = currentAge; age <= endAge; age++) {
      const year = currentYear + (age - currentAge);
      data.push({
        year,
        age,
        label: `${year}`,
        netWorth: Math.round(nw),
        income: age < retAge ? Math.round(parseFloat(String(annualIncome))) : 32000,
        expenses: Math.round(parseFloat(String(annualExpenses))),
        isRetired: age >= retAge,
      });

      if (age < retAge) {
        nw = nw * (1 + growthRate) + savingsRate;
      } else {
        const ss = age >= 67 ? 32000 : 0;
        nw = nw * (1 + growthRate * 0.7) - (parseFloat(String(annualExpenses)) - ss);
      }
    }
    return data;
  }, [yearlyResults, currentNetWorth, plan, localRetirementAge, localReturnRate, currentAge, currentYear]);

  // Key metrics
  const retirementDataPoint = chartData.find((d) => d.age === localRetirementAge);
  const netWorthAtRetirement = retirementDataPoint?.netWorth || 0;
  const annualExpensesFromPlan = plan?.events?.find((e: any) => e.category === 'expense')?.amount || 42500;
  const fireNumber = parseFloat(String(annualExpensesFromPlan)) * 25;
  const fireProgress = fireNumber > 0 ? Math.min(100, (currentNetWorth / fireNumber) * 100) : 0;
  const yearsToFire = chartData.findIndex((d) => d.netWorth >= fireNumber);
  const yearsToFireDisplay = yearsToFire >= 0 ? yearsToFire : '—';

  // Milestones (computed from birth year)
  const milestones = useMemo(() => [
    { age: 50, label: 'Catch-up Limits', color: '#3b82f6' },
    { age: 55, label: 'Rule of 55', color: '#f59e0b' },
    { age: localRetirementAge, label: 'Retirement', color: '#10b981' },
    { age: 65, label: 'Medicare', color: '#6366f1' },
    { age: 67, label: 'Full SS', color: '#14b8a6' },
    { age: 73, label: 'RMD Start', color: '#f97316' },
  ].filter((m) => m.age >= currentAge), [currentAge, localRetirementAge]);

  const handleRetirementAgeCommit = useCallback(() => {
    if (sliderDirty) {
      onUpdatePlan({ retirementAge: localRetirementAge });
      setSliderDirty(false);
    }
  }, [localRetirementAge, sliderDirty, onUpdatePlan]);

  // Custom tooltip
  const CustomTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null;
    const data = payload[0]?.payload;
    return (
      <div className="bg-card border border-border rounded-xl p-3 shadow-xl text-xs space-y-1.5 min-w-[180px]">
        <div className="flex items-center justify-between font-bold text-foreground">
          <span>Age {data?.age}</span>
          <span className="text-muted-foreground">{data?.year}</span>
        </div>
        <div className="border-t border-border pt-1.5 space-y-1">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Net Worth</span>
            <span className="font-mono font-bold text-foreground">{formatCurrency(data?.netWorth || 0)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Income</span>
            <span className="font-mono text-emerald-500">{formatCurrency(data?.income || 0)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Expenses + Tax</span>
            <span className="font-mono text-rose-500">{formatCurrency(data?.expenses || 0)}</span>
          </div>
        </div>
        {data?.isRetired && (
          <div className="flex items-center gap-1 text-amber-500 font-semibold border-t border-border pt-1.5">
            <Palmtree className="w-3 h-3" />
            <span>Retirement Phase</span>
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
            <span className="text-[11px] font-semibold uppercase tracking-wider">FIRE Number (25×)</span>
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

      {/* Main Projection Chart */}
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

          {/* Milestone Legend */}
          <div className="flex items-center gap-3 flex-wrap">
            {milestones.filter((m) => [localRetirementAge, 65, 73].includes(m.age)).map((m) => (
              <div key={m.age} className="flex items-center gap-1 text-[10px] font-semibold" style={{ color: m.color }}>
                <div className="w-2 h-2 rounded-full" style={{ backgroundColor: m.color }} />
                {m.label} ({m.age})
              </div>
            ))}
          </div>
        </div>

        {/* Chart */}
        <div className="h-80 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData} margin={{ top: 10, right: 20, left: 10, bottom: 0 }}>
              <defs>
                <linearGradient id="accumulationGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#10b981" stopOpacity={0.0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" strokeOpacity={0.4} />
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
              <Tooltip content={<CustomTooltip />} />

              <Area
                type="monotone"
                dataKey="netWorth"
                stroke="#10b981"
                strokeWidth={2.5}
                fillOpacity={1}
                fill="url(#accumulationGrad)"
              />

              {/* Retirement Reference Line */}
              <ReferenceLine
                x={localRetirementAge}
                stroke="#10b981"
                strokeDasharray="6 4"
                strokeWidth={2}
                label={{
                  value: `🌴 Retire ${localRetirementAge}`,
                  position: 'top',
                  fill: '#10b981',
                  fontSize: 11,
                  fontWeight: 'bold',
                }}
              />

              {/* FIRE Number Reference Line */}
              <ReferenceLine
                y={fireNumber}
                stroke="var(--color-primary)"
                strokeDasharray="4 4"
                strokeWidth={1}
                label={{
                  value: `FIRE: ${formatCurrency(fireNumber)}`,
                  position: 'right',
                  fill: 'var(--color-primary)',
                  fontSize: 10,
                  fontWeight: 'bold',
                }}
              />

              {/* Medicare & RMD markers */}
              {milestones.filter((m) => m.age !== localRetirementAge && m.age >= currentAge + 5).map((m) => (
                <ReferenceLine
                  key={m.age}
                  x={m.age}
                  stroke={m.color}
                  strokeDasharray="3 3"
                  strokeWidth={1}
                  strokeOpacity={0.5}
                />
              ))}
            </AreaChart>
          </ResponsiveContainer>
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
                setLocalRetirementAge(parseInt(e.target.value, 10));
                setSliderDirty(true);
              }}
              onMouseUp={handleRetirementAgeCommit}
              onTouchEnd={handleRetirementAgeCommit}
              className="w-full accent-primary h-2"
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
              <span className="font-mono font-bold text-primary text-sm">{localReturnRate}%</span>
            </div>
            <input
              type="range"
              min="2"
              max="12"
              step="0.5"
              value={localReturnRate}
              onChange={(e) => setLocalReturnRate(parseFloat(e.target.value))}
              className="w-full accent-primary h-2"
            />
            <div className="flex justify-between text-[10px] text-muted-foreground">
              <span>2%</span>
              <span>5%</span>
              <span>8%</span>
              <span>12%</span>
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
                  <th className="p-2.5">Taxes</th>
                  <th className="p-2.5">Cash Flow</th>
                  <th className="p-2.5">Phase</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {(yearlyResults.length > 0 ? yearlyResults : chartData).map((y: any) => {
                  const age = y.primaryAge || y.age;
                  const isRetired = age >= localRetirementAge;
                  const isRetirementYear = age === localRetirementAge;
                  return (
                    <tr
                      key={y.year}
                      className={`hover:bg-muted/20 ${isRetirementYear ? 'bg-emerald-500/5 border-l-2 border-l-emerald-500' : ''}`}
                    >
                      <td className="p-2.5 font-medium">{y.year}</td>
                      <td className="p-2.5">{age}</td>
                      <td className="p-2.5 font-mono font-bold text-foreground">
                        {formatCurrency(y.netWorth)}
                      </td>
                      <td className="p-2.5 font-mono text-emerald-500">
                        {formatCurrency(y.grossIncome || y.income || 0)}
                      </td>
                      <td className="p-2.5 font-mono text-rose-500">
                        {formatCurrency(y.totalExpenses || y.expenses || 0)}
                      </td>
                      <td className="p-2.5 font-mono text-rose-400">
                        {formatCurrency(y.taxesPaid || 0)}
                      </td>
                      <td className={`p-2.5 font-mono font-bold ${(y.netCashFlow || 0) >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                        {formatCurrency(y.netCashFlow || 0)}
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
