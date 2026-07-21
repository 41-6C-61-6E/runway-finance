'use client';

import { useState } from 'react';
import { formatCurrency } from '@/lib/utils/format';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { Plus, TrendingUp, ShieldCheck, Landmark, Home as HomeIcon, CreditCard, ArrowUpRight, ArrowDownRight, Calendar, Heart, Palmtree } from 'lucide-react';

interface DashboardViewProps {
  accounts: any[];
  plans: any[];
  onSelectPlan: (planId: string) => void;
  onCreatePlan: () => void;
}

export function DashboardView({ accounts, plans, onSelectPlan, onCreatePlan }: DashboardViewProps) {
  const [timeframe, setTimeframe] = useState<'1M' | '3M' | '1Y' | '5Y' | '10Y' | 'ALL'>('ALL');

  // Compute Assets & Liabilities
  let totalAssets = 0;
  let totalLiabilities = 0;

  const assetList: any[] = [];
  const liabilityList: any[] = [];

  for (const acc of accounts) {
    const bal = parseFloat(acc.balance) || 0;
    if (['credit_card', 'loan', 'mortgage', 'car_loan'].includes(acc.type) || bal < 0) {
      const posBal = Math.abs(bal);
      totalLiabilities += posBal;
      liabilityList.push({ ...acc, balance: posBal });
    } else {
      totalAssets += bal;
      assetList.push({ ...acc, balance: bal });
    }
  }

  const netWorth = totalAssets - totalLiabilities;

  // Trend data sample
  const trendData = [
    { date: '2022', netWorth: Math.max(0, netWorth * 0.6) },
    { date: '2023', netWorth: Math.max(0, netWorth * 0.72) },
    { date: '2024', netWorth: Math.max(0, netWorth * 0.85) },
    { date: '2025', netWorth: Math.max(0, netWorth * 0.94) },
    { date: '2026', netWorth: netWorth },
  ];

  return (
    <div className="space-y-6">
      {/* Top Section: Net Worth Hero & Asset/Liability Lists */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left 60%: Net Worth Trend */}
        <div className="lg:col-span-7 bg-card border border-border rounded-xl p-5 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <span className="text-xs uppercase tracking-wider font-semibold text-muted-foreground">Net Worth</span>
              <div className="flex items-baseline gap-3 mt-1">
                <h1 className="text-3xl font-extrabold text-foreground tracking-tight">{formatCurrency(netWorth)}</h1>
                <span className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">
                  <ArrowUpRight className="w-3.5 h-3.5" />
                  +174.4%
                </span>
              </div>
            </div>

            {/* Timeframe Selectors */}
            <div className="flex items-center gap-1 bg-muted/40 p-1 rounded-lg border border-border">
              {(['1M', '3M', '1Y', '5Y', '10Y', 'ALL'] as const).map((tf) => (
                <button
                  key={tf}
                  onClick={() => setTimeframe(tf)}
                  className={`px-2.5 py-1 text-xs font-medium rounded-md transition-all ${
                    timeframe === tf ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {tf}
                </button>
              ))}
            </div>
          </div>

          {/* Area Chart */}
          <div className="h-64 w-full pt-4">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={trendData}>
                <defs>
                  <linearGradient id="netWorthGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="var(--color-chart-1)" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="var(--color-chart-1)" stopOpacity={0.0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="date" stroke="currentColor" className="text-xs text-muted-foreground" axisLine={false} tickLine={false} />
                <YAxis stroke="currentColor" className="text-xs text-muted-foreground" axisLine={false} tickLine={false} tickFormatter={(val) => `$${(val / 1000).toFixed(0)}k`} />
                <Tooltip
                  formatter={(val: any) => [formatCurrency(Number(val)), 'Net Worth']}
                  contentStyle={{ backgroundColor: 'var(--color-card)', borderColor: 'var(--color-border)', borderRadius: '8px' }}
                />
                <Area type="monotone" dataKey="netWorth" stroke="var(--color-chart-1)" strokeWidth={2.5} fillOpacity={1} fill="url(#netWorthGrad)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Right 40%: Asset & Liability Allocations */}
        <div className="lg:col-span-5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-1 gap-4">
          {/* Assets Box */}
          <div className="bg-card border border-border rounded-xl p-4 shadow-sm space-y-3">
            <div className="flex items-center justify-between border-b border-border/60 pb-2">
              <span className="text-xs font-bold uppercase text-muted-foreground tracking-wider">ASSETS</span>
              <span className="text-sm font-bold text-foreground">{formatCurrency(totalAssets)}</span>
            </div>
            <div className="space-y-2.5 max-h-36 overflow-y-auto pr-1">
              {assetList.length === 0 ? (
                <p className="text-xs text-muted-foreground italic">No linked asset accounts found.</p>
              ) : (
                assetList.slice(0, 5).map((acc) => (
                  <div key={acc.id} className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2 truncate">
                      <div className="w-6 h-6 rounded-md bg-emerald-500/10 text-emerald-500 flex items-center justify-center shrink-0">
                        <Landmark className="w-3.5 h-3.5" />
                      </div>
                      <span className="font-medium text-foreground truncate">{acc.name}</span>
                    </div>
                    <span className="font-mono font-bold text-foreground shrink-0">{formatCurrency(acc.balance)}</span>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Liabilities Box */}
          <div className="bg-card border border-border rounded-xl p-4 shadow-sm space-y-3">
            <div className="flex items-center justify-between border-b border-border/60 pb-2">
              <span className="text-xs font-bold uppercase text-muted-foreground tracking-wider">LIABILITIES</span>
              <span className="text-sm font-bold text-foreground">{formatCurrency(totalLiabilities)}</span>
            </div>
            <div className="space-y-2.5 max-h-36 overflow-y-auto pr-1">
              {liabilityList.length === 0 ? (
                <p className="text-xs text-muted-foreground italic">No liabilities or debt accounts.</p>
              ) : (
                liabilityList.slice(0, 5).map((acc) => (
                  <div key={acc.id} className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2 truncate">
                      <div className="w-6 h-6 rounded-md bg-rose-500/10 text-rose-500 flex items-center justify-center shrink-0">
                        <CreditCard className="w-3.5 h-3.5" />
                      </div>
                      <span className="font-medium text-foreground truncate">{acc.name}</span>
                    </div>
                    <span className="font-mono font-bold text-rose-500 shrink-0">{formatCurrency(acc.balance)}</span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Bottom Section: Plans for the Future Grid */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-foreground tracking-tight">Plans for the Future</h2>
          <span className="text-xs text-muted-foreground">Select a scenario to inspect timeline and strategies</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {/* Add Plan Card */}
          <button
            onClick={onCreatePlan}
            className="border-2 border-dashed border-border hover:border-primary/50 bg-card/40 hover:bg-card rounded-xl p-6 flex flex-col items-center justify-center text-center space-y-2 transition-all group min-h-[180px]"
          >
            <div className="w-12 h-12 rounded-full bg-primary/10 text-primary group-hover:scale-110 transition-transform flex items-center justify-center">
              <Plus className="w-6 h-6" />
            </div>
            <span className="text-sm font-semibold text-foreground">Add New Plan</span>
            <span className="text-xs text-muted-foreground">Simulate CoastFIRE, Roth Ladders, or Early Retirement</span>
          </button>

          {/* Active Plan Cards */}
          {plans.map((p) => (
            <div
              key={p.id}
              onClick={() => onSelectPlan(p.id)}
              className="bg-card border border-border hover:border-primary/40 rounded-xl p-5 shadow-sm hover:shadow-md cursor-pointer transition-all space-y-4 flex flex-col justify-between"
            >
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
                    <TrendingUp className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-foreground">{p.name}</h3>
                    <p className="text-[11px] text-muted-foreground flex items-center gap-1 mt-0.5">
                      <Calendar className="w-3 h-3" />
                      Retire at Age {p.retirementAge || 60}
                    </p>
                  </div>
                </div>
                {p.simulation?.success && (
                  <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">
                    <ShieldCheck className="w-3 h-3" />
                    Success
                  </span>
                )}
              </div>

              {/* Sparkline Chart */}
              <div className="h-20 w-full pt-1">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={p.simulation?.yearlyResults || []}>
                    <Area type="monotone" dataKey="netWorth" stroke="var(--color-chart-1)" fill="var(--color-chart-1)" fillOpacity={0.15} strokeWidth={2} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>

              {/* Milestones Footer */}
              <div className="flex items-center justify-between text-[11px] text-muted-foreground border-t border-border/60 pt-3">
                <span className="flex items-center gap-1">
                  <Palmtree className="w-3.5 h-3.5 text-emerald-500" />
                  Age {p.retirementAge || 60}
                </span>
                <span className="flex items-center gap-1">
                  <Heart className="w-3.5 h-3.5 text-rose-500" />
                  Age {p.lifeExpectancyAge || 100}
                </span>
                <span className="font-mono font-bold text-foreground">
                  {formatCurrency(p.simulation?.netLegacy || 0)} Legacy
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
