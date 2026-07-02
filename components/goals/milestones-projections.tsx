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
import { TrendingUp, Minus, Plus, Calendar, Target, CheckCircle2, AlertCircle, PiggyBank, Loader2, Check } from 'lucide-react';
import { formatChartYAxisCurrency, formatChartXAxisDate, getChartXTicksUnified } from '@/lib/utils/chart-format';
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
  return formatChartXAxisDate(dateStr + '-01', 'all', { isMonthly: true });
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
  // Per-account pending inflow inputs: accountId -> string (raw input)
  const [pendingInputs, setPendingInputs] = useState<Record<string, string>>({});
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768);
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);
  const { savedInflows, setSavedInflow } = useGoalInflow();
  const hasLoadedOnce = useRef(false);
  const debounceTimers = useRef<Record<string, any>>({});

  useEffect(() => {
    return () => {
      for (const t of Object.values(debounceTimers.current)) {
        clearTimeout(t);
      }
    };
  }, []);

  const fetchProjections = useCallback(async (inflows: Record<string, number> | undefined) => {
    try {
      setLoading(true);
      setError(null);
      const params = new URLSearchParams();
      if (inflows && Object.keys(inflows).length > 0) {
        params.set('accountInflows', JSON.stringify(inflows));
      }
      params.set('projectionMonths', '120');

      const res = await fetch(`/api/goals/projections?${params.toString()}`, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to load projections');
      const result: ProjectionsResult = await res.json();
      setData(result);

      // On first load, pre-fill inputs from savedInflows or calculated defaults
      if (!hasLoadedOnce.current) {
        hasLoadedOnce.current = true;
        const inputs: Record<string, string> = {};
        for (const acct of result.accounts) {
          const saved = savedInflows?.[acct.accountId];
          inputs[acct.accountId] = String(saved !== undefined ? saved : acct.monthlyInflow);
        }
        setPendingInputs(inputs);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, [savedInflows]);

  useEffect(() => {
    if (savedInflows === undefined) return;
    fetchProjections(savedInflows);
  }, [savedInflows, fetchProjections]);

  const adjustInflowForAccount = (accountId: string, delta: number) => {
    const current = parseFloat(pendingInputs[accountId] ?? '0') || 0;
    const newVal = Math.max(0, Math.round((current + delta) * 100) / 100);
    setPendingInputs((prev) => ({ ...prev, [accountId]: String(newVal) }));
    setSavedInflow(accountId, newVal);
  };

  const resetInflowForAccount = (accountId: string) => {
    if (!data) return;
    const acct = data.accounts.find((a) => a.accountId === accountId);
    if (!acct) return;
    setSavedInflow(accountId, null);
    setPendingInputs((prev) => ({ ...prev, [accountId]: String(acct.monthlyInflow) }));
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

  const xAxisTicks = useMemo(() => {
    if (!chartData || chartData.length === 0) return [];
    return getChartXTicksUnified(chartData, 'all', isMobile, 'date');
  }, [chartData, isMobile]);

  const yDomainMax = useMemo(() => {
    if (!chartData || chartData.length === 0) return 0;
    let max = 0;
    for (const row of chartData) {
      for (const key of Object.keys(row)) {
        if (key.startsWith('acct_') && typeof row[key] === 'number') {
          max = Math.max(max, row[key]);
        }
      }
    }
    return max;
  }, [chartData]);

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
          <CardContent className="p-6">
            <div className="flex flex-col items-center text-center gap-3 py-4">
              <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center">
                <TrendingUp className="w-5 h-5 text-muted-foreground" />
              </div>
              <div>
                <p className="text-sm font-semibold text-foreground mb-1">No projections yet</p>
                <p className="text-xs text-muted-foreground max-w-xs">
                  Link a savings account to one of your goals to see funding timelines, balance projections, and milestone tracking here.
                </p>
              </div>
            </div>
          </CardContent>
        )}
      </Card>
    );
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

          {/* Monthly Inflow — per account */}
          <div className="bg-muted/20 rounded-lg border border-border/50 p-3 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-foreground">Monthly Inflow</span>
              {loading && (
                <span className="flex items-center gap-1 text-[10px] text-muted-foreground animate-pulse">
                  <Loader2 className="w-3 h-3 animate-spin" />
                  Updating...
                </span>
              )}
            </div>
            {data.accounts.map((acct) => {
              const acctInputVal = pendingInputs[acct.accountId] ?? String(acct.monthlyInflow);
              const isSaved = savedInflows?.[acct.accountId] !== undefined;
              return (
                <div key={acct.accountId} className="flex flex-row items-center gap-2">
                  <div className="flex items-center gap-1.5 min-w-0 flex-1">
                    <span className="text-xs text-muted-foreground truncate" title={acct.accountName}>
                      {acct.accountName}
                    </span>
                    <span className="text-[10px] text-muted-foreground/60 shrink-0 tabular-nums">
                      {formatCurrency(acct.accountBalance)}
                    </span>
                    <button
                      onClick={() => resetInflowForAccount(acct.accountId)}
                      className="text-[10px] text-muted-foreground hover:text-primary underline underline-offset-2 transition-colors shrink-0"
                      title="Reset to calculated default"
                    >
                      reset
                    </button>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => adjustInflowForAccount(acct.accountId, -500)}
                      className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors border border-border/50"
                      title="Decrease by $500"
                    >
                      <Minus className="w-3.5 h-3.5" />
                    </button>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={acctInputVal}
                      onChange={(e) => {
                        const raw = e.target.value;
                        setPendingInputs((prev) => ({ ...prev, [acct.accountId]: raw }));
                        const parsed = parseFloat(raw);
                        if (!isNaN(parsed) && parsed >= 0) {
                          if (debounceTimers.current[acct.accountId]) {
                            clearTimeout(debounceTimers.current[acct.accountId]);
                          }
                          debounceTimers.current[acct.accountId] = setTimeout(() => {
                            setSavedInflow(acct.accountId, parsed);
                          }, 500);
                        }
                      }}
                      className="w-28 px-2.5 py-1.5 rounded-lg border border-border bg-background text-foreground text-sm font-semibold text-center tabular-nums"
                    />
                    <button
                      onClick={() => adjustInflowForAccount(acct.accountId, 500)}
                      className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors border border-border/50"
                      title="Increase by $500"
                    >
                      <Plus className="w-3.5 h-3.5" />
                    </button>
                    {isSaved && (
                      <span className="flex items-center gap-0.5 text-[10px] text-emerald-600 dark:text-emerald-500 ml-1">
                        <Check className="w-3 h-3" />
                        Saved
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
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
                    ticks={xAxisTicks}
                    tickFormatter={formatDateLabel}
                    minTickGap={30}
                  />

                  <YAxis
                    tickLine={false}
                    axisLine={false}
                    tick={{ fill: 'var(--color-muted-foreground)', fontSize: 10 }}
                    width={55}
                    tickFormatter={(v: number) => formatChartYAxisCurrency(v, 0, yDomainMax)}
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
