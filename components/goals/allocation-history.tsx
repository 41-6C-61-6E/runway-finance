'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { CollapsibleCardHeader } from '@/components/ui/collapsible-card-header';
import { useCardCollapsed } from '@/lib/hooks/use-card-collapsed';
import { History, TrendingDown, TrendingUp } from 'lucide-react';

interface AllocationHistoryEntry {
  id: string;
  goalId: string;
  accountId: string;
  snapshotDate: string;
  accountBalance: string;
  allocatedAmount: string;
  desiredAmount: string;
  percentage: string;
  sortOrder: number;
  isUnderfunded: boolean;
  remainingOnAccount: string;
}

interface AllocationHistoryProps {
  goalId: string;
  goalName: string;
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export function AllocationHistory({ goalId, goalName }: AllocationHistoryProps) {
  const [collapsed, setCollapsed] = useCardCollapsed('allocationHistory');
  const [history, setHistory] = useState<AllocationHistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchHistory = async () => {
      try {
        const res = await fetch(`/api/goals/history?goalId=${goalId}&limit=30`, {
          credentials: 'include',
        });
        if (res.ok) {
          const data = await res.json();
          setHistory(data.history || []);
        }
      } catch {
        // ignore
      } finally {
        setLoading(false);
      }
    };

    fetchHistory();
  }, [goalId]);

  if (history.length === 0) {
    return null;
  }

  return (
    <Card>
      <CollapsibleCardHeader
        isCollapsed={collapsed}
        onToggle={setCollapsed}
        title={
          <div className="flex items-center gap-2">
            <History className="w-4 h-4 text-primary shrink-0" />
            <span>Allocation History: {goalName}</span>
          </div>
        }
      />
      {!collapsed && (
        <CardContent>
          {loading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-16 bg-muted rounded animate-pulse" />
              ))}
            </div>
          ) : (
            <div className="space-y-3">
              {history.map((entry, index) => {
                const prevEntry = history[index + 1];
                const currentAlloc = parseFloat(entry.allocatedAmount) || 0;
                const prevAlloc = prevEntry ? parseFloat(prevEntry.allocatedAmount) || 0 : 0;
                const diff = currentAlloc - prevAlloc;

                return (
                  <div
                    key={entry.id}
                    className="p-3 rounded-lg border border-border bg-card"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs text-muted-foreground">
                        {formatDate(entry.snapshotDate)}
                      </span>
                      {diff !== 0 && (
                        <div className="flex items-center gap-1">
                          {diff > 0 ? (
                            <TrendingUp className="w-3 h-3 text-green-500" />
                          ) : (
                            <TrendingDown className="w-3 h-3 text-red-500" />
                          )}
                          <span
                            className={
                              diff > 0
                                ? 'text-xs text-green-500'
                                : 'text-xs text-red-500'
                            }
                          >
                            {diff > 0 ? '+' : ''}${diff.toLocaleString()}
                          </span>
                        </div>
                      )}
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div>
                        <span className="text-muted-foreground">Balance: </span>
                        <span className="blur-number">${parseFloat(entry.accountBalance).toLocaleString()}</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Allocated: </span>
                        <span className="blur-number">${currentAlloc.toLocaleString()}</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Desired: </span>
                        <span className="blur-number">${parseFloat(entry.desiredAmount).toLocaleString()}</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Remaining: </span>
                        <span className="blur-number">${parseFloat(entry.remainingOnAccount).toLocaleString()}</span>
                      </div>
                    </div>
                    {entry.isUnderfunded && (
                      <div className="mt-2 text-[10px] text-amber-400">
                        ⚠ Underfunded at this snapshot
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      )}
    </Card>
  );
}
