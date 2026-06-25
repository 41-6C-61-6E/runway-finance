'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { CollapsibleCardHeader } from '@/components/ui/collapsible-card-header';
import { useCardCollapsed } from '@/lib/hooks/use-card-collapsed';
import { TrendingUp, CheckCircle2, Calendar, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

interface GoalWaterfallItem {
  goalId: string;
  goalName: string;
  allocatedAmount: number;
  desiredAllocation: number;
  targetAmount: number;
  isUnderfunded: boolean;
  sortOrder: number;
  status: string;
  isReleased: boolean;
}

interface AccountWaterfall {
  accountId: string;
  accountName: string;
  accountBalance: number;
  goals: GoalWaterfallItem[];
  totalAllocated: number;
  remaining: number;
  isOverallocated: boolean;
  releasedFromCompleted: number;
}

interface GoalProjectionInfo {
  goalId: string;
  projectedFundDate: string | null;
  willFund: boolean;
}

interface WaterfallVisualizationProps {
  projections?: Map<string, GoalProjectionInfo>;
}

function formatProjDate(dateStr: string | null): string | null {
  if (!dateStr) return null;
  const d = new Date(dateStr + '-01');
  return d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
}

export function WaterfallVisualization({ projections }: WaterfallVisualizationProps) {
  const [collapsed, setCollapsed] = useCardCollapsed('waterfallVisualization');
  const [accounts, setAccounts] = useState<AccountWaterfall[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchWaterfall = async () => {
      try {
        const res = await fetch('/api/goals/allocation', { credentials: 'include' });
        if (res.ok) {
          const data = await res.json();
          setAccounts(data.allocations?.accounts || []);
        }
      } catch {
        // ignore
      } finally {
        setLoading(false);
      }
    };

    fetchWaterfall();
  }, []);

  if (loading) {
    return (
      <Card>
        <CardContent className="p-5">
          <div className="h-4 bg-muted rounded w-40 mb-6 animate-pulse" />
          <div className="space-y-4">
            {[1, 2].map((i) => (
              <div key={i} className="space-y-2">
                <div className="h-4 bg-muted rounded w-32 animate-pulse" />
                <div className="h-8 bg-muted rounded animate-pulse" />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (accounts.length === 0) {
    return null;
  }

  return (
    <Card>
      <CollapsibleCardHeader
        isCollapsed={collapsed}
        onToggle={setCollapsed}
        title={
          <div className="flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-primary shrink-0" />
            <span>Fund Allocation Waterfall</span>
          </div>
        }
      />
      {!collapsed && (
        <CardContent className="space-y-6">
          {accounts.map((account) => (
            <AccountWaterfallCard key={account.accountId} account={account} projections={projections} />
          ))}
        </CardContent>
      )}
    </Card>
  );
}

function AccountWaterfallCard({ account, projections }: { account: AccountWaterfall; projections?: Map<string, GoalProjectionInfo> }) {
  const [bannerDismissed, setBannerDismissed] = useState(false);

  const willAllFund = account.goals
    .filter(g => g.status === 'active')
    .every(g => projections?.get(g.goalId)?.willFund ?? false);

  const hasUnfundable = account.goals
    .filter(g => g.status === 'active')
    .some(g => !(projections?.get(g.goalId)?.willFund ?? true));

  return (
    <div className="space-y-3">
      {/* Account Header */}
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold text-foreground">{account.accountName}</h4>
        <div className="flex items-center gap-2 text-xs">
          <span className="text-muted-foreground">Balance:</span>
          <span className="font-medium blur-number">${account.accountBalance.toLocaleString()}</span>
        </div>
      </div>

      {/* Projection Summary Banner */}
      {projections && (willAllFund || hasUnfundable) && (
        <div className={cn(
          "flex items-center gap-2 p-2 rounded-lg border",
          willAllFund
            ? "bg-chart-1/10 border-chart-1/20"
            : "bg-amber-500/10 border-amber-500/20"
        )}>
          {willAllFund ? (
            <>
              <Calendar className="w-4 h-4 text-chart-1 shrink-0" />
              <span className="text-xs text-chart-1">
                All goals projected to fund at current savings rate
              </span>
            </>
          ) : hasUnfundable ? (
            <>
              <AlertCircle className="w-4 h-4 text-amber-500 shrink-0" />
              <span className="text-xs text-amber-500">
                Some goals may not fund within 5 years at current rate
              </span>
            </>
          ) : null}
        </div>
      )}

      {/* Released Funds Banner */}
      {account.releasedFromCompleted > 0 && !bannerDismissed && (
        <div className="flex items-center gap-2 p-2 rounded-lg bg-green-500/10 border border-green-500/20">
          <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0" />
          <span className="text-xs text-green-500 flex-1">
            ${account.releasedFromCompleted.toLocaleString()} released from completed goals
          </span>
          <button
            onClick={() => setBannerDismissed(true)}
            className="text-green-500/50 hover:text-green-500 transition-colors"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>
      )}

      {/* Waterfall Bars */}
      <div className="space-y-2">
        {account.goals.map((goal, index) => {
          const target = goal.targetAmount || 0;
          const allocated = goal.allocatedAmount || 0;
          const progressPercent = target > 0 ? Math.min((allocated / target) * 100, 100) : 0;
          const proj = projections?.get(goal.goalId);

          return (
            <div key={goal.goalId} className="space-y-1">
              <div className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground">#{index + 1}</span>
                  <span className="font-medium text-foreground">{goal.goalName}</span>
                  {goal.status === 'completed' && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-status-positive/20 text-status-positive">
                      Done
                    </span>
                  )}
                  {goal.isReleased && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                      Released
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2 text-xs">
                  {proj && proj.willFund && proj.projectedFundDate && (
                    <span className="text-chart-2 font-medium text-[10px] hidden sm:inline">
                      Est. {formatProjDate(proj.projectedFundDate)}
                    </span>
                  )}
                  {proj && !proj.willFund && (
                    <span className="text-amber-500 font-medium text-[10px] hidden sm:inline">
                      5+ yrs
                    </span>
                  )}
                  <span className="text-muted-foreground">
                    ${allocated.toLocaleString()} / ${target.toLocaleString()}
                  </span>
                  <span className="font-semibold text-foreground blur-number">
                    ({Math.round(progressPercent)}%)
                  </span>
                </div>
              </div>

              {/* Bar */}
              <div
                className={cn(
                  "relative h-6 rounded overflow-hidden",
                  goal.isReleased ? "bg-green-500/10" : "bg-chart-1/10"
                )}
              >
                <div
                  className={cn(
                    'h-full transition-all duration-500 ease-out',
                    goal.isReleased ? 'bg-green-500/40' : 'bg-chart-1/60'
                  )}
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>

      {/* Account Footer */}
      <div className="flex items-center justify-between pt-2 border-t border-border">
        <span className="text-xs text-muted-foreground">Remaining:</span>
        <span className="text-sm font-medium blur-number">${account.remaining.toLocaleString()}</span>
      </div>
    </div>
  );
}
