'use client';

import { useState, useEffect, useCallback } from 'react';
import { GoalCard } from './goal-card';
import { GoalFormDrawer } from './goal-form-drawer';
import { formatCurrency, calcGoalProgress } from '@/lib/utils/goals';

interface Goal {
  id: string;
  name: string;
  description: string | null;
  type: string;
  targetAmount: string;
  currentAmount: string;
  targetDate: string | null;
  category: string | null;
  priority: number;
  status: string;
  linkedAccountId: string | null;
  percentage: string;
  reserve: string;
  createdAt: string;
  updatedAt: string;
}

type FilterStatus = 'all' | 'active' | 'completed' | 'paused';
type SortBy = 'priority' | 'targetDate' | 'name' | 'progress';

export function GoalsList() {
  const [goals, setGoals] = useState<Goal[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterStatus>('all');
  const [sortBy, setSortBy] = useState<SortBy>('priority');
  const [showForm, setShowForm] = useState(false);
  const [editingGoal, setEditingGoal] = useState<Goal | undefined>(undefined);
  const [syncingId, setSyncingId] = useState<string | null>(null);
  const [linkedBalances, setLinkedBalances] = useState<Record<string, number | null>>({});

  const fetchGoals = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch('/api/financial-goals', { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to fetch goals');
      const data = await res.json();
      setGoals(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchGoals();
  }, [fetchGoals]);

  // Fetch linked account balances
  useEffect(() => {
    const fetchBalances = async () => {
      const linkedGoalIds = goals
        .filter((g) => g.linkedAccountId)
        .map((g) => g.linkedAccountId!);

      if (linkedGoalIds.length === 0) return;

      try {
        const uniqueAccountIds = [...new Set(linkedGoalIds)];
        const balances: Record<string, number | null> = {};

        for (const accountId of uniqueAccountIds) {
          const acctRes = await fetch(`/api/accounts?includeHidden=false`, { credentials: 'include' });
          if (acctRes.ok) {
            const accounts: Array<{ id: string; balance: string }> = await acctRes.json();
            const acct = accounts.find((a) => a.id === accountId);
            if (acct) {
              balances[accountId] = parseFloat(acct.balance);
            }
          }
        }

        setLinkedBalances(balances);
      } catch {}
    };

    fetchBalances();
  }, [goals]);

  const handleSync = async (goalId: string) => {
    setSyncingId(goalId);
    try {
      const res = await fetch('/api/goals/progress', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ goalId }),
      });
      if (res.ok) {
        await fetchGoals();
      }
    } catch {
      // ignore sync errors
    } finally {
      setSyncingId(null);
    }
  };

  const handleDelete = async (goalId: string) => {
    try {
      const res = await fetch(`/api/financial-goals?id=${goalId}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      if (res.ok) {
        await fetchGoals();
      }
    } catch {
      // ignore delete errors
    }
  };

  const handleEdit = (goal: Goal) => {
    setEditingGoal(goal);
    setShowForm(true);
  };

  const handleCloseForm = () => {
    setShowForm(false);
    setEditingGoal(undefined);
  };

  const handleSuccess = () => {
    setShowForm(false);
    setEditingGoal(undefined);
    fetchGoals();
  };

  // Filter goals
  const filteredGoals = filter === 'all'
    ? goals
    : goals.filter((g) => g.status === filter);

  // Sort goals
  const sortedGoals = [...filteredGoals].sort((a, b) => {
    switch (sortBy) {
      case 'priority':
        return b.priority - a.priority;
      case 'targetDate':
        if (!a.targetDate && !b.targetDate) return 0;
        if (!a.targetDate) return 1;
        if (!b.targetDate) return -1;
        return new Date(a.targetDate).getTime() - new Date(b.targetDate).getTime();
      case 'name':
        return a.name.localeCompare(b.name);
      case 'progress': {
        const aProgress = parseFloat(a.targetAmount) > 0
          ? Math.min((parseFloat(a.currentAmount) / parseFloat(a.targetAmount)) * 100, 100)
          : 0;
        const bProgress = parseFloat(b.targetAmount) > 0
          ? Math.min((parseFloat(b.currentAmount) / parseFloat(b.targetAmount)) * 100, 100)
          : 0;
        return bProgress - aProgress;
      }
      default:
        return 0;
    }
  });

  const filters: { key: FilterStatus; label: string; count: number }[] = [
    { key: 'all', label: 'All', count: goals.length },
    { key: 'active', label: 'Active', count: goals.filter((g) => g.status === 'active').length },
    { key: 'completed', label: 'Completed', count: goals.filter((g) => g.status === 'completed').length },
    { key: 'paused', label: 'Paused', count: goals.filter((g) => g.status === 'paused').length },
  ];

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between mb-4">
          <div className="flex gap-1 bg-muted/50 rounded-lg p-0.5 w-fit">
            {filters.map((f) => (
              <div key={f.key} className="px-4 py-2 rounded-md bg-muted/50 animate-pulse" />
            ))}
          </div>
          <div className="h-9 w-24 bg-muted rounded-lg animate-pulse" />
        </div>
        {[1, 2, 3].map((i) => (
          <div key={i} className="bg-card border border-border rounded-xl p-5 shadow-sm animate-pulse">
            <div className="flex items-center gap-5 mb-4">
              <div className="w-18 h-18 bg-muted rounded-full" />
              <div className="flex-1 space-y-2">
                <div className="h-4 bg-muted rounded w-40" />
                <div className="h-3 bg-muted rounded w-24" />
              </div>
            </div>
            <div className="h-2.5 bg-muted rounded w-full" />
          </div>
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-card border border-border rounded-xl p-8 shadow-sm text-center">
        <div className="text-4xl mb-3">⚠️</div>
        <p className="text-lg font-semibold text-foreground mb-1">Error loading goals</p>
        <p className="text-sm text-muted-foreground">{error}</p>
        <button
          onClick={fetchGoals}
          className="mt-4 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors"
        >
          Retry
        </button>
      </div>
    );
  }

  if (goals.length === 0) {
    return (
      <>
        <div className="bg-card border border-border rounded-xl p-8 shadow-sm text-center">
          <div className="text-5xl mb-4">🎯</div>
          <p className="text-lg font-semibold text-foreground mb-1">No financial goals yet</p>
          <p className="text-sm text-muted-foreground mb-5 max-w-md mx-auto">
            Set financial goals to track your progress and stay motivated. Whether it&apos;s saving for a house, paying off debt, or building an emergency fund — start today!
          </p>
          <button
            onClick={() => setShowForm(true)}
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Create Your First Goal
          </button>
        </div>
        <GoalFormDrawer
          open={showForm}
          onClose={handleCloseForm}
          onSuccess={handleSuccess}
          editGoal={editingGoal}
        />
      </>
    );
  }

  return (
    <div>
      {/* Filters & Sort */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-5">
        <div className="flex gap-1 bg-muted/50 rounded-lg p-0.5 w-fit">
          {filters.map((f) => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                filter === f.key
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
              }`}
            >
              {f.label}
              <span className={`ml-1 ${filter === f.key ? 'text-primary-foreground/70' : 'text-muted-foreground/50'}`}>
                {f.count}
              </span>
            </button>
          ))}
        </div>

        <div className="flex items-center gap-3">
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as SortBy)}
            className="px-3 py-1.5 rounded-lg border border-border bg-background text-foreground text-xs font-medium"
          >
            <option value="priority">Sort: Priority</option>
            <option value="targetDate">Sort: Deadline</option>
            <option value="name">Sort: Name</option>
            <option value="progress">Sort: Progress</option>
          </select>

          <button
            onClick={() => setShowForm(true)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-primary text-primary-foreground rounded-lg text-xs font-medium hover:bg-primary/90 transition-colors"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Add Goal
          </button>
        </div>
      </div>

      {/* Goals Grid */}
      {sortedGoals.length === 0 ? (
        <div className="bg-card border border-border rounded-xl p-8 shadow-sm text-center">
          <p className="text-sm text-muted-foreground">No {filter !== 'all' ? filter : ''} goals to display.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {sortedGoals.map((goal) => (
            <GoalCard
              key={goal.id}
              goal={goal}
              onEdit={handleEdit}
              onDelete={handleDelete}
              onSync={handleSync}
              linkedAccountBalance={goal.linkedAccountId ? linkedBalances[goal.linkedAccountId] : null}              percentage={parseFloat(goal.percentage)}
              reserve={parseFloat(goal.reserve)}            />
          ))}
        </div>
      )}

      {/* Form Drawer */}
      <GoalFormDrawer
        open={showForm}
        onClose={handleCloseForm}
        onSuccess={handleSuccess}
        editGoal={editingGoal ? {
          id: editingGoal.id,
          name: editingGoal.name,
          description: editingGoal.description,
          type: editingGoal.type,
          targetAmount: editingGoal.targetAmount,
          currentAmount: editingGoal.currentAmount,
          targetDate: editingGoal.targetDate,
          category: editingGoal.category,
          priority: editingGoal.priority,
          status: editingGoal.status,
          linkedAccountId: editingGoal.linkedAccountId,
          percentage: editingGoal.percentage,
          reserve: editingGoal.reserve,
        } : undefined}
      />
    </div>
  );
}
