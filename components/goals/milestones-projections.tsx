'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { CollapsibleCardHeader } from '@/components/ui/collapsible-card-header';
import { useCardCollapsed } from '@/lib/hooks/use-card-collapsed';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
} from 'recharts';
import { ChartTooltip, TooltipRow, TooltipHeader } from '@/components/charts/chart-tooltip';
import { TrendingUp, Minus, Plus, Calendar, Target, CheckCircle2, AlertCircle, Save, PiggyBank, Loader2, Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatCurrency } from '@/lib/utils/format';
import { useGoalInflow } from './goal-inflow-context';

interface GoalProjection {
  goalId: string;
  goalName: string;
  linkedAccountId: string;
  accountName: string;
  targetAmount: number;
  allocatedAmount: number;
  percentage: number;
  reserve: number;
  sortOrder: number;
  projectedFundDate: string | null;
  monthsToFund: number | null;
  isFunded: boolean;
  willFund: boolean;
}

interface ProjectionPoint {
  month: number;
  date: string;
  accountBalance: number;
  totalAllocated: number;
  goalAllocations: Record<string, number>;
  goalFunding: string[];
  availableAfterFunding: number;
}

interface AccountProjection {
  accountId: string;
  accountName: string;
  accountBalance: number;
  monthlyInflow: number;
  goals: GoalProjection[];
  points: ProjectionPoint[];
  allFundedBy: string | null;
  totalTarget: number;
  totalCurrent: number;
}

interface ProjectionsResult {
  accounts: AccountProjection[];
  totalMonthlyInflow: number;
  lookbackMonths: number;
  projectionMonths: number;
}

function formatDateLabel(dateStr: string): string {
  const d = new Date(dateStr + '-01');
  return d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
}

function formatMonthYear(dateStr: string): string {
  const d = new Date(dateStr + '-01');
  return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

const ACCOUNT_COLORS = [
  'var(--color-chart-1)',
  'var(--color-chart-2)',
  'var(--color-chart-3)',
  'var(--color-chart-4)',
  'var(--color-chart-5)',
];

function ProjectionChartTooltip({ active, payload, goals }: any) {
  if (!active || !payload || !payload.length) return null;

  const point = payload[0]?.payload as any;
  if (!point) return null;

  return (
    <ChartTooltip>
      <TooltipHeader>{formatMonthYear(point.date)}</TooltipHeader>
      {payload.map((entry: any, i: number) => {
        if (entry.dataKey === 'fundEvents') return null;
        if (typeof entry.value !== 'number') return null;
        return (
          <TooltipRow
            key={i}
            label={entry.name}
            value={formatCurrency(entry.value)}
            color={entry.color}
          />
        );
      })}
      {point.fundEvents && point.fundEvents.length > 0 && (
        <div className="mt-2 pt-2 border-t border-border/50 space-y-1.5">
          <div className="text-[10px] font-bold text-status-positive uppercase tracking-wider">
            🎉 Goal Funded
          </div>
          {point.fundEvents.map((e: { goal: string; account: string }, i: number) => {
            const goalDetail = goals?.find((g: any) => g.goalName === e.goal);
            return (
              <div key={i} className="text-[10px] space-y-0.5 bg-status-positive/5 p-1.5 rounded border border-status-positive/10">
                <div className="font-semibold text-foreground flex items-center gap-1">
                  <Target className="w-3 h-3 text-status-positive" />
                  {e.goal}
                </div>
                <div className="grid grid-cols-1 gap-y-0.5 text-muted-foreground">
                  <div>Account: <span className="font-medium text-foreground">{e.account}</span></div>
                  {goalDetail && (
                    <>
                      <div>Target: <span className="font-medium text-foreground">{formatCurrency(goalDetail.targetAmount)}</span></div>
                      <div>Time to Fund: <span className="font-medium text-foreground">{goalDetail.monthsToFund !== null ? `${goalDetail.monthsToFund}mo` : 'N/A'}</span></div>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </ChartTooltip>
  );
}

function FundEventDot({ cx, cy, payload, eventKey }: any) {
  if (!payload?.fundEvents?.length) return null;
  const matching = payload.fundEvents.filter((e: any) => e.accountKey === eventKey);
  if (!matching.length) return null;
  const text = matching[0].goal;
  const rectWidth = text.length * 5.2 + 6;
  return (
    <g>
      <circle cx={cx} cy={cy} r={5} fill="var(--color-status-positive)" stroke="white" strokeWidth={2} />
      <rect
        x={cx + 5}
        y={cy - 6.5}
        width={rectWidth}
        height={13}
        rx={3}
        fill="var(--color-card)"
        stroke="var(--color-status-positive)"
        strokeWidth={0.5}
        opacity={1}
      />
      <text x={cx + 8} y={cy + 1} fontSize={9} fontWeight={600} fill="var(--color-status-positive)" dominantBaseline="middle">
        {text}
      </text>
    </g>
  );
}

export function MilestonesProjections() {
  const [collapsed, setCollapsed] = useCardCollapsed('milestonesProjections');
  const [data, setData] = useState<ProjectionsResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedAccountId, setSelectedAccountId] = useState<string>('all');
  const [inputValue, setInputValue] = useState('');
  const [pendingInflow, setPendingInflow] = useState<number | null>(null);
  const { savedInflow, setSavedInflow } = useGoalInflow();
  const hasLoadedOnce = useRef(false);
  const debounceTimer = useRef<any>(null);

  useEffect(() => {
    return () => {
      if (debounceTimer.current) {
        clearTimeout(debounceTimer.current);
      }
    };
  }, []);

  const fetchProjections = useCallback(async (inflow: number | null) => {
    try {
      setLoading(true);
      setError(null);
      const params = new URLSearchParams();
      if (inflow !== null && inflow >= 0) params.set('monthlyInflow', String(inflow));
      params.set('projectionMonths', '120');

      const res = await fetch(`/api/goals/projections?${params.toString()}`, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to load projections');
      const result: ProjectionsResult = await res.json();
      setData(result);

      if (!hasLoadedOnce.current) {
        hasLoadedOnce.current = true;
        // Use saved value if available, otherwise calculated default
        if (savedInflow !== null && savedInflow !== undefined) {
          setInputValue(String(savedInflow));
          setPendingInflow(savedInflow);
        } else {
          setPendingInflow(result.totalMonthlyInflow);
          setInputValue(String(result.totalMonthlyInflow));
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, [savedInflow]);

  useEffect(() => {
    if (savedInflow === undefined) return;
    fetchProjections(savedInflow);
  }, [savedInflow, fetchProjections]);

  const adjustInflow = (delta: number) => {
    const current = pendingInflow ?? 0;
    const newVal = Math.max(0, Math.round((current + delta) * 100) / 100);
    setPendingInflow(newVal);
    setInputValue(String(newVal));
    setSavedInflow(newVal);
  };

  const resetInflowToDefault = () => {
    if (!data) return;
    setSavedInflow(null);
    setPendingInflow(data.totalMonthlyInflow);
    setInputValue(String(data.totalMonthlyInflow));
  };

  // Build chart data: either multi-series (all accounts) or single series
  const { chartData, chartAccounts } = useMemo(() => {
    if (!data) return { chartData: null as any[] | null, chartAccounts: [] as AccountProjection[] };

    if (selectedAccountId === 'all') {
      // Multi-series: each account is a dataKey
      const accounts = data.accounts;
      if (accounts.length === 0) return { chartData: [], chartAccounts: [] };

      const maxMonths = Math.max(...accounts.map(a => a.points.length));
      const result: any[] = [];

      for (let m = 0; m < maxMonths; m++) {
        const row: any = { month: m, fundEvents: [] as any[] };
        for (const acct of accounts) {
          const pt = acct.points[m];
          if (!pt) continue;
          row.date = pt.date;
          row[`acct_${acct.accountId}`] = pt.accountBalance;
          for (const f of pt.goalFunding) {
            row.fundEvents.push({ goal: f, account: acct.accountName, accountKey: `acct_${acct.accountId}` });
          }
        }
        result.push(row);
      }

      const allGoals: GoalProjection[] = [];
      for (const acct of accounts) allGoals.push(...acct.goals);
      const allFundedBy = allGoals.every(g => g.willFund)
        ? allGoals.reduce((latest, g) => {
            if (!g.projectedFundDate) return latest;
            if (!latest) return g.projectedFundDate;
            return g.projectedFundDate > latest ? g.projectedFundDate : latest;
          }, '' as string | null)
        : null;

      return {
        chartData: result,
        chartAccounts: accounts.map(a => ({
          ...a,
          dataKey: `acct_${a.accountId}`,
          allFundedBy,
        }) as any),
      };
    }

    // Single account
    const account = data.accounts.find(a => a.accountId === selectedAccountId);
    if (!account) return { chartData: [], chartAccounts: [] };

    const result = account.points.map(pt => ({
      month: pt.month,
      date: pt.date,
      [`acct_${account.accountId}`]: pt.accountBalance,
      fundEvents: pt.goalFunding.map(f => ({
        goal: f,
        account: account.accountName,
        accountKey: `acct_${account.accountId}`,
      })),
    }));

    return {
      chartData: result,
      chartAccounts: [{ ...account, dataKey: `acct_${account.accountId}` } as any],
    };
  }, [data, selectedAccountId]);

  if (loading && !data) {
    return (
      <Card>
        <CardContent className="p-5">
          <div className="h-4 bg-muted rounded w-44 mb-6 animate-pulse" />
          <div className="space-y-3">
            <div className="h-8 bg-muted rounded animate-pulse" />
            <div className="h-[200px] bg-muted rounded animate-pulse" />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardContent className="p-5 text-center">
          <div className="text-4xl mb-3">⚠️</div>
          <p className="text-sm font-semibold text-foreground mb-1">Error loading projections</p>
          <p className="text-xs text-muted-foreground">{error}</p>
        </CardContent>
      </Card>
    );
  }

  if (!data || data.accounts.length === 0) {
    return null;
  }

  // Collect all goals from chart accounts for the timeline
  const allGoals: GoalProjection[] = [];
  for (const acct of chartAccounts) allGoals.push(...(acct as any).goals || []);
  const chartGoals = allGoals.filter(g => g.targetAmount > 0);
  // Determine overall all-funded-by date across shown accounts
  const overallFundedBy = (() => {
    if (!chartAccounts.length) return null;
    const dates = chartAccounts.map((a: any) => a.allFundedBy).filter(Boolean);
    return dates.length ? dates.reduce((latest: string, d: string) => d > latest ? d : latest) : null;
  })();

  return (
    <Card>
      <CollapsibleCardHeader
        isCollapsed={collapsed}
        onToggle={setCollapsed}
        title={
          <div className="flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-primary shrink-0" />
            <span>Milestones &amp; Projections</span>
          </div>
        }
      />
      {!collapsed && (
        <CardContent className="space-y-5">
          {/* Account Selector */}
          {data.accounts.length > 1 && (
            <div className="flex items-center gap-3">
              <select
                value={selectedAccountId}
                onChange={(e) => setSelectedAccountId(e.target.value)}
                className="px-2.5 py-1.5 rounded-lg border border-border bg-background text-foreground text-xs font-medium"
              >
                <option value="all">All Linked Accounts</option>
                {data.accounts.map((a) => (
                  <option key={a.accountId} value={a.accountId}>{a.accountName}</option>
                ))}
              </select>
            </div>
          )}

          {/* Monthly Inflow Input */}
          <div className="bg-muted/20 rounded-lg border border-border/50 p-3">
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-xs font-medium text-foreground">Monthly Inflow</span>
                <button
                  onClick={resetInflowToDefault}
                  className="text-[10px] text-muted-foreground hover:text-primary underline underline-offset-2 transition-colors"
                  title="Reset to calculated default"
                >
                  reset
                </button>
              </div>

              <div className="flex items-center gap-1">
                <button
                  onClick={() => adjustInflow(-500)}
                  className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors border border-border/50"
                  title="Decrease by $500"
                >
                  <Minus className="w-3.5 h-3.5" />
                </button>
                <input
                  type="text"
                  inputMode="decimal"
                  value={inputValue}
                  onChange={(e) => {
                    const raw = e.target.value;
                    setInputValue(raw);
                    const parsed = parseFloat(raw);
                    if (!isNaN(parsed) && parsed >= 0) {
                      setPendingInflow(parsed);
                      if (debounceTimer.current) {
                        clearTimeout(debounceTimer.current);
                      }
                      debounceTimer.current = setTimeout(() => {
                        setSavedInflow(parsed);
                      }, 500);
                    }
                  }}
                  className="w-28 px-2.5 py-1.5 rounded-lg border border-border bg-background text-foreground text-sm font-semibold text-center tabular-nums"
                />
                <button
                  onClick={() => adjustInflow(500)}
                  className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors border border-border/50"
                  title="Increase by $500"
                >
                  <Plus className="w-3.5 h-3.5" />
                </button>
              </div>

              <div className="flex items-center gap-2">
                <div className="flex gap-1">
                  {[500, 1000, 2500, 5000].map((amount) => (
                    <button
                      key={amount}
                      onClick={() => {
                        setInputValue(String(amount));
                        setPendingInflow(amount);
                        setSavedInflow(amount);
                      }}
                      className={cn(
                        'px-2 py-1 rounded-md text-[10px] font-medium transition-all border',
                        pendingInflow === amount
                          ? 'bg-primary/10 text-primary border-primary/20'
                          : 'text-muted-foreground hover:text-foreground border-transparent hover:border-border/50'
                      )}
                    >
                      ${(amount / 1000).toFixed(amount >= 1000 ? 0 : 1)}k
                    </button>
                  ))}
                </div>
              </div>

              <div className="ml-auto flex items-center gap-1.5 text-xs text-muted-foreground font-medium h-8">
                {loading ? (
                  <span className="flex items-center gap-1 text-muted-foreground animate-pulse">
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    Saving...
                  </span>
                ) : savedInflow !== null ? (
                  <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-500">
                    <Check className="w-3.5 h-3.5" />
                    Auto-saved
                  </span>
                ) : (
                  <span className="text-[10px] text-muted-foreground">Using default</span>
                )}
              </div>
            </div>

            {savedInflow !== null && (
              <div className="mt-2 text-[10px] text-chart-2 flex items-center gap-1">
                <CheckCircle2 className="w-3 h-3" />
                Saved inflow: {formatCurrency(savedInflow)}/mo — used across all projections
              </div>
            )}
          </div>

          {/* Legend */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[10px] text-muted-foreground">
            {chartAccounts.map((acct: any, i: number) => (
              <div key={acct.accountId} className="flex items-center gap-1.5">
                <div className="w-3 h-0.5 rounded" style={{ background: ACCOUNT_COLORS[i % ACCOUNT_COLORS.length] }} />
                <span>{acct.accountName}</span>
              </div>
            ))}
            {chartGoals.filter(g => g.monthsToFund !== null).length > 0 && (
              <div className="flex items-center gap-1.5 ml-1">
                <PiggyBank className="w-3 h-3 text-status-positive" />
                <span className="font-medium text-status-positive">Funding event</span>
              </div>
            )}
          </div>

          {/* Projection Chart — single sawtooth line per account */}
          <div className="h-[200px] sm:h-[300px] w-full">
            {chartData && chartData.length > 0 && (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData} margin={{ top: 24, right: 8, left: -8, bottom: 0 }}>
                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke="var(--color-border)"
                    vertical={false}
                    opacity={0.25}
                  />

                  <XAxis
                    dataKey="date"
                    tickLine={false}
                    axisLine={{ stroke: 'var(--color-border)' }}
                    tick={{ fill: 'var(--color-muted-foreground)', fontSize: 10 }}
                    interval={Math.max(1, Math.floor(chartData.length / 8))}
                    tickFormatter={formatDateLabel}
                  />

                  <YAxis
                    tickLine={false}
                    axisLine={false}
                    tick={{ fill: 'var(--color-muted-foreground)', fontSize: 10 }}
                    width={55}
                    tickFormatter={(v: number) => {
                      if (v >= 1000000) return `$${(v / 1000000).toFixed(1)}M`;
                      if (v >= 1000) return `$${(v / 1000).toFixed(0)}K`;
                      return `$${v}`;
                    }}
                  />

                  <RechartsTooltip content={<ProjectionChartTooltip goals={allGoals} />} cursor={{ stroke: 'var(--color-chart-1)', strokeWidth: 1, strokeDasharray: '2 2', opacity: 0.4 }} />

                  {chartAccounts.map((acct: any, i: number) => {
                    const color = ACCOUNT_COLORS[i % ACCOUNT_COLORS.length];
                    return (
                      <Line
                        key={acct.accountId}
                        type="monotone"
                        dataKey={acct.dataKey}
                        name={acct.accountName}
                        stroke={color}
                        strokeWidth={2}
                        activeDot={{ r: 3, fill: color, stroke: color }}
                        dot={<FundEventDot eventKey={acct.dataKey} />}
                      />
                    );
                  })}
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>

          {/* Projections Summary Alerts */}
          {chartGoals.length > 0 && (
            <div className="space-y-2">
              {overallFundedBy && (
                <div className="flex items-center gap-2 p-2.5 rounded-lg bg-chart-1/10 border border-chart-1/20">
                  <CheckCircle2 className="w-4 h-4 text-chart-1 shrink-0" />
                  <span className="text-xs text-chart-1 font-medium">
                    All goals projected to be funded by {formatMonthYear(overallFundedBy)} at this savings rate
                  </span>
                </div>
              )}

              {!overallFundedBy && chartGoals.some(g => !g.willFund) && (
                <div className="flex items-center gap-2 p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/20">
                  <AlertCircle className="w-4 h-4 text-amber-500 shrink-0" />
                  <span className="text-xs text-amber-500 font-medium">
                    Some goals may not be fully funded within 10 years at the current savings rate
                  </span>
                </div>
              )}
            </div>
          )}
        </CardContent>
      )}
    </Card>
  );
}
