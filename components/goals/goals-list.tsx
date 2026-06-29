'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { GoalCard } from './goal-card';
import { GoalFormDialog } from './goal-form-drawer';
import { formatCurrency } from '@/lib/utils/goals';
import { useGoalInflow } from './goal-inflow-context';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

interface Goal {
  id: string;
  name: string;
  description: string | null;
  type: string;
  targetAmount: string;
  currentAmount: string;
  targetDate: string | null;
  category: { id: string; name: string; color: string } | null;
  tags?: Array<{ id: string; name: string; color: string }>;
  status: string;
  linkedAccountId: string | null;
  percentage: string;
  reserve: string;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

type FilterStatus = 'all' | 'active' | 'completed' | 'paused' | 'pending';

interface GoalProjection {
  goalId: string;
  goalName: string;
  projectedFundDate: string | null;
  monthsToFund: number | null;
  isFunded: boolean;
  willFund: boolean;
}

interface ProjectionsData {
  accounts: Array<{
    accountId: string;
    goals: GoalProjection[];
  }>;
}

export function GoalsList() {
  const [goals, setGoals] = useState<Goal[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterStatus>('all');
  const [showForm, setShowForm] = useState(false);
  const [editingGoal, setEditingGoal] = useState<Goal | undefined>(undefined);
  const [projections, setProjections] = useState<Map<string, GoalProjection>>(new Map());
  const { savedInflows } = useGoalInflow();

  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [canDrag, setCanDrag] = useState(false);
  const dragIndexRef = useRef<number | null>(null);
  dragIndexRef.current = dragIndex;


  const fetchGoals = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const projParams = new URLSearchParams();
      projParams.set('projectionMonths', '120');
      if (savedInflows && Object.keys(savedInflows).length > 0) {
        projParams.set('accountInflows', JSON.stringify(savedInflows));
      }
      const [goalsRes, projRes] = await Promise.all([
        fetch('/api/financial-goals', { credentials: 'include' }),
        fetch(`/api/goals/projections?${projParams.toString()}`, { credentials: 'include' }),
      ]);
      if (!goalsRes.ok) throw new Error('Failed to fetch goals');
      const goalsData = await goalsRes.json();
      setGoals(goalsData);

      if (projRes.ok) {
        const projData: ProjectionsData = await projRes.json();
        const projMap = new Map<string, GoalProjection>();
        for (const account of projData.accounts) {
          for (const gp of account.goals) {
            projMap.set(gp.goalId, gp);
          }
        }
        setProjections(projMap);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, [savedInflows]);

  useEffect(() => {
    fetchGoals();
  }, [fetchGoals]);

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

  // Sort goals by priority order
  const sorter = (a: Goal, b: Goal) => a.sortOrder - b.sortOrder;

  const sortedGoals = [...filteredGoals].sort(sorter);
  const activeGoals = sortedGoals.filter((g) => g.status !== 'completed').sort(sorter);
  const completedGoals = sortedGoals.filter((g) => g.status === 'completed').sort(sorter);

  // Save order of active goals to backend
  const saveNewOrder = async (updatedActiveGoals: Goal[]) => {
    try {
      const updates = updatedActiveGoals.map((goal, index) => ({
        id: goal.id,
        sortOrder: index,
      }));

      const res = await fetch('/api/goals/bulk-reorder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ updates }),
      });

      if (!res.ok) throw new Error('Failed to update goal order');
      toast.success('Goal order updated');
    } catch (err) {
      toast.error('Failed to save goal order');
      console.error('Failed to save goal order:', err);
    }
  };

  // Reorder active goals locally and trigger save
  const handleReorderActive = (newActiveGoals: Goal[]) => {
    setGoals((prev) => {
      const activeIds = new Set(newActiveGoals.map(g => g.id));
      const nonActiveGoals = prev.filter(g => !activeIds.has(g.id));
      
      const combined = [...newActiveGoals.map((g, idx) => ({ ...g, sortOrder: idx })), ...nonActiveGoals];
      saveNewOrder(newActiveGoals);
      return combined;
    });
  };

  const handleDragStart = (index: number) => {
    setDragIndex(index);
    dragIndexRef.current = index;
  };

  const handleDragOver = (e: React.DragEvent, newIndex: number) => {
    e.preventDefault();
    const currentDragIndex = dragIndexRef.current;
    if (currentDragIndex === null || currentDragIndex === newIndex) return;

    const activeOrdered = [...goals]
      .filter((g) => g.status !== 'completed')
      .sort((a, b) => a.sortOrder - b.sortOrder);
    
    if (currentDragIndex >= activeOrdered.length || newIndex >= activeOrdered.length) return;

    const [draggedItem] = activeOrdered.splice(currentDragIndex, 1);
    activeOrdered.splice(newIndex, 0, draggedItem);

    const activeIds = new Set(activeOrdered.map(g => g.id));
    const nonActiveGoals = goals.filter(g => !activeIds.has(g.id));
    
    const updatedGoals = [...activeOrdered.map((g, idx) => ({ ...g, sortOrder: idx })), ...nonActiveGoals];
    setGoals(updatedGoals);
    
    dragIndexRef.current = newIndex;
    setDragIndex(newIndex);
  };

  const handleDragEnd = () => {
    setDragIndex(null);
    dragIndexRef.current = null;
    const activeOrdered = [...goals]
      .filter((g) => g.status !== 'completed')
      .sort((a, b) => a.sortOrder - b.sortOrder);
    saveNewOrder(activeOrdered);
  };

  const moveActiveUp = (index: number) => {
    const activeOrdered = [...goals]
      .filter((g) => g.status !== 'completed')
      .sort((a, b) => a.sortOrder - b.sortOrder);
    if (index <= 0 || index >= activeOrdered.length) return;
    const newActive = [...activeOrdered];
    [newActive[index - 1], newActive[index]] = [newActive[index], newActive[index - 1]];
    handleReorderActive(newActive);
  };

  const moveActiveDown = (index: number) => {
    const activeOrdered = [...goals]
      .filter((g) => g.status !== 'completed')
      .sort((a, b) => a.sortOrder - b.sortOrder);
    if (index < 0 || index >= activeOrdered.length - 1) return;
    const newActive = [...activeOrdered];
    [newActive[index], newActive[index + 1]] = [newActive[index + 1], newActive[index]];
    handleReorderActive(newActive);
  };

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
          <div key={i} className="bg-muted border border-border rounded-xl p-5 shadow-sm animate-pulse">
            <div className="flex items-center gap-5 mb-4">
              <div className="w-18 h-18 bg-muted/60 rounded-full" />
              <div className="flex-1 space-y-2">
                <div className="h-4 bg-muted/60 rounded w-40" />
                <div className="h-3 bg-muted/60 rounded w-24" />
              </div>
            </div>
            <div className="h-2.5 bg-muted/60 rounded w-full" />
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
        <GoalFormDialog
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
      {/* Filters & Actions */}
      <div className="flex flex-row items-center justify-between flex-wrap gap-4 mb-5">
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

        <button
          onClick={() => setShowForm(true)}
          className="ml-auto inline-flex items-center gap-1.5 px-3 py-1.5 bg-primary text-primary-foreground rounded-lg text-xs font-medium hover:bg-primary/90 transition-colors"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Add Goal
        </button>
      </div>

      {/* Active Goals Grid */}
      {activeGoals.length > 0 && (
        <>
          {filter !== 'completed' && (
            <div className="flex flex-col gap-4">
              {activeGoals.map((goal, index) => (
                <div
                  key={goal.id}
                  draggable={canDrag}
                  onDragStart={() => handleDragStart(index)}
                  onDragOver={(e) => handleDragOver(e, index)}
                  onDragEnd={handleDragEnd}
                  className={cn(
                    "transition-all duration-200 rounded-xl",
                    dragIndex === index ? 'opacity-40 border border-dashed border-primary/50 bg-primary/5' : 'opacity-100'
                  )}
                >
                  <GoalCard
                    goal={goal}
                    onEdit={handleEdit}
                    onDelete={handleDelete}
                    percentage={parseFloat(goal.percentage)}
                    reserve={parseFloat(goal.reserve)}
                    projection={projections.get(goal.id) || null}
                    showReorderControls={true}
                    isFirst={index === 0}
                    isLast={index === activeGoals.length - 1}
                    onMoveUp={() => moveActiveUp(index)}
                    onMoveDown={() => moveActiveDown(index)}
                    onDragHandleActive={setCanDrag}
                    priorityIndex={index + 1}
                  />
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* Completed Goals Section */}
      {completedGoals.length > 0 && (
        <div className={activeGoals.length > 0 && filter !== 'completed' ? 'mt-10' : ''}>
          {filter !== 'completed' && (
            <div className="flex items-center gap-3 mb-4">
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">History</h3>
              <div className="h-px flex-1 bg-border/50" />
            </div>
          )}

          {/* History Summary */}
          {completedGoals.length >= 2 && (
            <div className="flex items-center gap-6 mb-4 px-1">
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">Completed</span>
                <span className="text-sm font-semibold text-foreground">{completedGoals.length}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">Total saved</span>
                <span className="text-sm font-semibold text-status-positive blur-number">
                  {formatCurrency(completedGoals.reduce((sum, g) => sum + parseFloat(g.targetAmount), 0))}
                </span>
              </div>
            </div>
          )}

          <div className="flex flex-col gap-4">
            {completedGoals.map((goal) => (
              <GoalCard
                key={goal.id}
                goal={goal}
                onEdit={handleEdit}
                onDelete={handleDelete}
                percentage={parseFloat(goal.percentage)}
                reserve={parseFloat(goal.reserve)}
                projection={projections.get(goal.id) || null}
              />
            ))}
          </div>
        </div>
      )}

      {sortedGoals.length === 0 && (
        <div className="bg-card border border-border rounded-xl p-8 shadow-sm text-center">
          <p className="text-sm text-muted-foreground">No {filter !== 'all' ? filter : ''} goals to display.</p>
        </div>
      )}

      {/* Goal Reorder has been consolidated directly into the main list above */}

      {/* Form Dialog */}
      <GoalFormDialog
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
          status: editingGoal.status,
          linkedAccountId: editingGoal.linkedAccountId,
          percentage: editingGoal.percentage,
          reserve: editingGoal.reserve,
          sortOrder: editingGoal.sortOrder,
          tags: editingGoal.tags,
        } : undefined}
      />
    </div>
  );
}
