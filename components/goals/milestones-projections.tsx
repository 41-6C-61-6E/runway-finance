'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { CollapsibleCardHeader } from '@/components/ui/collapsible-card-header';
import { useCardCollapsed } from '@/lib/hooks/use-card-collapsed';
import {
  AreaChart,
  Area,
  Line,
  ComposedChart,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  ReferenceLine,
  Label,
} from 'recharts';
import { ChartTooltip, TooltipRow, TooltipHeader } from '@/components/charts/chart-tooltip';
import { TrendingUp, Minus, Plus, Calendar, Target, CheckCircle2, AlertCircle, Save } from 'lucide-react';
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

const CHART_COLORS = [
  'var(--color-chart-1)',
  'var(--color-chart-2)',
  'var(--color-chart-3)',
  'var(--color-chart-4)',
  'var(--color-chart-5)',
];

function formatDateLabel(dateStr: string): string {
  const d = new Date(dateStr + '-01');
  return d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
}

function formatMonthYear(dateStr: string): string {
  const d = new Date(dateStr + '-01');
  return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

function getGoalColor(index: number): string {
  return CHART_COLORS[index % CHART_COLORS.length];
}

function ProjectionChartTooltip({ active, payload }: any) {
  if (!active || !payload || !payload.length) return null;

  const point = payload[0]?.payload as ProjectionPoint | undefined;
  if (!point) return null;

  return (
    <ChartTooltip>
      <TooltipHeader>{formatMonthYear(point.date)}</TooltipHeader>
      <TooltipRow label="Raw Balance" value={formatCurrency(point.accountBalance)} color="var(--color-chart-1)" />
      <TooltipRow label="Committed to Goals" value={formatCurrency(point.totalAllocated)} color="var(--color-chart-4)" />
      <TooltipRow label="Available After Goals" value={formatCurrency(point.availableAfterFunding)} color="var(--color-chart-2)" />
      {point.goalFunding.length > 0 && (
        <div className="mt-1.5 pt-1.5 border-t border-border/50">
          <div className="text-[10px] font-semibold text-status-positive mb-0.5">Funding Milestone</div>
          {point.goalFunding.map((name, i) => (
            <TooltipRow key={i} label={name} value="Fully Funded!" color="var(--color-status-positive)" />
          ))}
        </div>
      )}
    </ChartTooltip>
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

  const activeInflow = savedInflow !== null ? savedInflow : pendingInflow;

  const fetchProjections = useCallback(async (inflow: number | null) => {
    try {
      setLoading(true);
      setError(null);
      const params = new URLSearchParams();
      if (inflow !== null && inflow >= 0) params.set('monthlyInflow', String(inflow));
      params.set('projectionMonths', '60');

      const res = await fetch(`/api/goals/projections?${params.toString()}`, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to load projections');
      const result: ProjectionsResult = await res.json();
      setData(result);

      if (!hasLoadedOnce.current) {
        hasLoadedOnce.current = true;
        // Use saved value if available, otherwise calculated default
        if (savedInflow !== null) {
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
    fetchProjections(activeInflow);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const adjustInflow = (delta: number) => {
    const current = pendingInflow ?? 0;
    const newVal = Math.max(0, Math.round((current + delta) * 100) / 100);
    setPendingInflow(newVal);
    setInputValue(String(newVal));
  };

  const handleSaveInflow = () => {
    if (pendingInflow !== null) {
      setSavedInflow(pendingInflow);
      fetchProjections(pendingInflow);
    }
  };

  const resetInflowToDefault = () => {
    if (!data) return;
    setSavedInflow(null);
    setPendingInflow(data.totalMonthlyInflow);
    setInputValue(String(data.totalMonthlyInflow));
    fetchProjections(null);
  };

  const isDirty = savedInflow === null
    ? false
    : pendingInflow !== null && Math.abs(pendingInflow - savedInflow) > 0.01;

  // Determine which account to show
  const accountData = useMemo(() => {
    if (!data) return null;
    if (selectedAccountId === 'all') {
      const allGoals: GoalProjection[] = [];
      const allPoints = new Map<number, ProjectionPoint>();
      let totalInflow = 0;
      let totalBalance = 0;

      for (const acct of data.accounts) {
        totalInflow += acct.monthlyInflow;
        totalBalance += acct.accountBalance;
        allGoals.push(...acct.goals);

        for (const pt of acct.points) {
          const existing = allPoints.get(pt.month);
          if (existing) {
            existing.accountBalance += pt.accountBalance;
            existing.totalAllocated += pt.totalAllocated;
            existing.availableAfterFunding += pt.availableAfterFunding;
            existing.goalFunding.push(...pt.goalFunding);
            for (const [gid, alloc] of Object.entries(pt.goalAllocations)) {
              existing.goalAllocations[gid] = (existing.goalAllocations[gid] || 0) + alloc;
            }
          } else {
            allPoints.set(pt.month, {
              ...pt,
              goalAllocations: { ...pt.goalAllocations },
              goalFunding: [...pt.goalFunding],
            });
          }
        }
      }

      const sortedPoints = Array.from(allPoints.values()).sort((a, b) => a.month - b.month);
      const allFundedBy = allGoals.every(g => g.willFund)
        ? allGoals.reduce((latest, g) => {
            if (!g.projectedFundDate) return latest;
            if (!latest) return g.projectedFundDate;
            return g.projectedFundDate > latest ? g.projectedFundDate : latest;
          }, '' as string | null)
        : null;

      return {
        accountId: 'all',
        accountName: 'All Linked Accounts',
        accountBalance: totalBalance,
        monthlyInflow: totalInflow,
        goals: allGoals,
        points: sortedPoints,
        allFundedBy,
        totalTarget: allGoals.reduce((s, g) => s + g.targetAmount, 0),
        totalCurrent: allGoals.reduce((s, g) => s + g.allocatedAmount, 0),
      };
    }

    return data.accounts.find(a => a.accountId === selectedAccountId) || null;
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

  const chartData = accountData?.points || [];
  const goals = accountData?.goals || [];
  const chartGoals = goals.filter(g => g.targetAmount > 0);

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

          {accountData && (
            <>
              {/* Current State Summary */}
              <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-xs">
                <div className="flex items-center gap-1.5">
                  <span className="text-muted-foreground">Balance:</span>
                  <span className="font-semibold text-foreground blur-number">{formatCurrency(accountData.accountBalance)}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-muted-foreground">Target:</span>
                  <span className="font-semibold text-foreground blur-number">{formatCurrency(accountData.totalTarget)}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-muted-foreground">Funded:</span>
                  <span className="font-semibold text-chart-1 blur-number">{formatCurrency(accountData.totalCurrent)}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-muted-foreground">Goals:</span>
                  <span className="font-semibold text-foreground">{goals.length} ({goals.filter(g => g.isFunded).length} funded)</span>
                </div>
              </div>

              {/* Monthly Inflow Input */}
              <div className="bg-muted/20 rounded-lg border border-border/50 p-3">
                <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-xs font-medium text-foreground">Monthly Inflow (90-day avg)</span>
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

                  <div className="ml-auto">
                    <button
                      onClick={handleSaveInflow}
                      disabled={!isDirty}
                      className={cn(
                        'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all',
                        isDirty
                          ? 'bg-primary text-primary-foreground hover:opacity-90 shadow-sm'
                          : 'bg-muted text-muted-foreground cursor-not-allowed'
                      )}
                    >
                      <Save className="w-3.5 h-3.5" />
                      Save
                    </button>
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
              <div className="flex items-center gap-4 text-[10px] text-muted-foreground">
                <div className="flex items-center gap-1.5">
                  <div className="w-3 h-0.5 rounded" style={{ background: 'var(--color-chart-1)' }} />
                  <span>Raw Balance</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="w-3 h-0.5 rounded" style={{ background: 'var(--color-chart-2)' }} />
                  <span>Available After Funding</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="w-3 h-0.5 rounded border border-dashed" style={{ borderColor: 'var(--color-chart-4)' }} />
                  <span>Committed to Goals</span>
                </div>
                {chartGoals.filter(g => g.monthsToFund !== null && g.monthsToFund !== undefined).map((goal, idx) => (
                  <div key={goal.goalId} className="flex items-center gap-1.5">
                    <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: getGoalColor(idx) }} />
                    <span>{goal.goalName}</span>
                  </div>
                ))}
              </div>

              {/* Projection Chart */}
              <div className="h-[200px] sm:h-[300px] w-full">
                {chartData.length > 0 && (
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={chartData} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
                      <defs>
                        <linearGradient id="projBalanceGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="var(--color-chart-1)" stopOpacity={0.25} />
                          <stop offset="100%" stopColor="var(--color-chart-1)" stopOpacity={0.03} />
                        </linearGradient>
                        <linearGradient id="projAvailableGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="var(--color-chart-2)" stopOpacity={0.2} />
                          <stop offset="100%" stopColor="var(--color-chart-2)" stopOpacity={0} />
                        </linearGradient>
                      </defs>

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

                      <RechartsTooltip content={<ProjectionChartTooltip />} cursor={{ stroke: 'var(--color-chart-1)', strokeWidth: 1, strokeDasharray: '2 2', opacity: 0.4 }} />

                      {/* Raw Balance area (goes up with inflow) */}
                      <Area
                        type="monotone"
                        dataKey="accountBalance"
                        stroke="var(--color-chart-1)"
                        strokeWidth={2}
                        fill="url(#projBalanceGrad)"
                        dot={false}
                        activeDot={{ r: 3, fill: 'var(--color-chart-1)', stroke: 'var(--color-chart-1)' }}
                      />

                      {/* Available after funding area — drops when goals are funded */}
                      <Area
                        type="monotone"
                        dataKey="availableAfterFunding"
                        stroke="var(--color-chart-2)"
                        strokeWidth={2}
                        fill="url(#projAvailableGrad)"
                        dot={false}
                        activeDot={{ r: 3, fill: 'var(--color-chart-2)', stroke: 'var(--color-chart-2)' }}
                      />

                      {/* Committed to goals line */}
                      <Line
                        type="monotone"
                        dataKey="totalAllocated"
                        stroke="var(--color-chart-4)"
                        strokeWidth={1.5}
                        strokeDasharray="4 3"
                        dot={false}
                        activeDot={{ r: 2, fill: 'var(--color-chart-4)', stroke: 'var(--color-chart-4)' }}
                      />

                      {/* Goal funding reference lines as simple vertical lines — no overlapping labels */}
                      {chartGoals.filter(g => g.monthsToFund !== null && g.monthsToFund !== undefined).map((goal) => {
                        const point = chartData[goal.monthsToFund!];
                        if (!point) return null;
                        const goalIdx = chartGoals.indexOf(goal);
                        return (
                          <ReferenceLine
                            key={goal.goalId}
                            x={point.date}
                            stroke={getGoalColor(goalIdx)}
                            strokeWidth={1.5}
                            strokeDasharray="6 3"
                          />
                        );
                      })}
                    </ComposedChart>
                  </ResponsiveContainer>
                )}
              </div>

              {/* Goal Funding Timeline */}
              {chartGoals.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Calendar className="w-3.5 h-3.5 text-primary shrink-0" />
                    <span className="text-xs font-semibold text-foreground">Goal Funding Timeline</span>
                  </div>

                  <div className="space-y-1.5">
                    {chartGoals.map((goal, idx) => {
                      const isFunded = goal.isFunded;
                      const willFund = goal.willFund;
                      const months = goal.monthsToFund;
                      const color = getGoalColor(idx);

                      return (
                        <div
                          key={goal.goalId}
                          className="flex items-center gap-3 p-2.5 rounded-lg bg-muted/15 border border-border/30"
                        >
                          <div
                            className="w-2 h-2 rounded-full shrink-0"
                            style={{ backgroundColor: color }}
                          />

                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-medium text-foreground truncate">{goal.goalName}</span>
                              <span className="text-[10px] text-muted-foreground blur-number">
                                {formatCurrency(goal.targetAmount)}
                              </span>
                            </div>
                            <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                              <span className="blur-number">{formatCurrency(goal.allocatedAmount)}</span>
                              <span>·</span>
                              <span>{goal.percentage}% allocated</span>
                            </div>
                          </div>

                          <div className="text-right shrink-0">
                            {isFunded ? (
                              <div className="flex items-center gap-1 text-status-positive">
                                <CheckCircle2 className="w-3.5 h-3.5" />
                                <span className="text-[10px] font-semibold">
                                  {goal.projectedFundDate ? formatMonthYear(goal.projectedFundDate) : 'Funded'}
                                </span>
                              </div>
                            ) : willFund && goal.projectedFundDate ? (
                              <div className="flex items-center gap-1 text-foreground">
                                <Target className="w-3 h-3 text-chart-2" />
                                <span className="text-[10px] font-semibold">
                                  {formatMonthYear(goal.projectedFundDate)}
                                </span>
                              </div>
                            ) : (
                              <div className="flex items-center gap-1 text-muted-foreground">
                                <AlertCircle className="w-3 h-3" />
                                <span className="text-[10px]">5+ years</span>
                              </div>
                            )}
                          </div>

                          {months !== null && months !== undefined && (
                            <div className="w-16 text-right shrink-0">
                              <span className="text-[10px] font-medium text-muted-foreground">
                                {months === 0 ? 'Now' : `${months}mo`}
                              </span>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  {accountData.allFundedBy && (
                    <div className="flex items-center gap-2 p-2.5 rounded-lg bg-chart-1/10 border border-chart-1/20">
                      <CheckCircle2 className="w-4 h-4 text-chart-1 shrink-0" />
                      <span className="text-xs text-chart-1 font-medium">
                        All goals projected to be funded by {formatMonthYear(accountData.allFundedBy)} at this savings rate
                      </span>
                    </div>
                  )}

                  {!accountData.allFundedBy && chartGoals.some(g => !g.willFund) && (
                    <div className="flex items-center gap-2 p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/20">
                      <AlertCircle className="w-4 h-4 text-amber-500 shrink-0" />
                      <span className="text-xs text-amber-500 font-medium">
                        Some goals may not be fully funded within 5 years at the current savings rate
                      </span>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </CardContent>
      )}
    </Card>
  );
}
