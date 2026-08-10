'use client';

import React, { useState, useEffect, useCallback, useMemo, useRef, Fragment } from 'react';
import Link from 'next/link';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useBudgetPeriod } from './budget-period-selector';
import { BudgetFormDialog } from './budget-form-dialog';
import { AutoBudgetDialog } from './auto-budget-dialog';
import { BudgetItemTransactionsIcon, getPeriodDateRange } from './budget-transactions-tooltip';
import { formatCurrency } from '@/lib/utils/format';
import { Plus, Pencil, Trash2, RotateCcw, Landmark, ArrowUpCircle, TrendingDown, ChevronUp, ChevronDown, ChevronsUpDown, Sparkles, Settings, History, Layers } from 'lucide-react';
import { AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { ChartEmptyState } from '@/components/charts/chart-empty-state';
import { useUserSettings } from '@/components/user-settings-provider';
import { toast } from 'sonner';

type SortField = 'category' | 'budgeted' | 'actual' | 'variance' | 'progress' | 'account';
type SortDirection = 'asc' | 'desc';

interface BudgetData {
  id: string;
  categoryId: string;
  categoryName: string;
  categoryColor: string;
  periodType: string;
  periodKey?: string | null;
  yearMonth?: string | null;
  isRecurring: boolean;
  fundingAccountId: string | null;
  rollover: boolean;
  notes: string | null;
  monthlyAmount?: number;
  budgeted: number;
  actual: number;
  remaining: number;
  percentUsed: number;
  type: 'income' | 'expense';
  isDiscretionary?: boolean;
  isEverythingElse?: boolean;
  isCatchAll?: boolean;
  groupedBreakout?: Array<{ categoryId: string; categoryName: string; categoryColor?: string; actual: number }>;
}

interface Account {
  id: string;
  name: string;
  tags?: { id: string; name: string; color: string }[];
}

export function BudgetTable() {
  const queryClient = useQueryClient();
  const settingsContext = useUserSettings();
  const showBudgetTags = settingsContext?.settings?.accountTagVisibility?.budgets !== false;
  const { periodType, periodKey } = useBudgetPeriod();
  const { startDate, endDate } = useMemo(() => getPeriodDateRange(periodType, periodKey), [periodType, periodKey]);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  const { data: budgetData, isLoading: budgetsLoading, error: queryError } = useQuery({
    queryKey: ['budgets', periodType, periodKey],
    queryFn: async () => {
      const res = await fetch(`/api/budgets?periodType=${periodType}&periodKey=${periodKey}&includeCategories=true`, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to fetch budgets');
      return await res.json();
    },
  });

  const { data: accountsData, isLoading: accountsLoading } = useQuery({
    queryKey: ['accounts'],
    queryFn: async () => {
      const res = await fetch('/api/accounts', { credentials: 'include' });
      if (!res.ok) return [];
      return await res.json();
    },
  });

  const budgets = budgetData?.budgets ?? [];
  const categories = budgetData?.categories ?? [];
  const accounts = accountsData ?? [];
  const loading = budgetsLoading || accountsLoading;
  const error = queryError ? (queryError instanceof Error ? queryError.message : String(queryError)) : null;

  const [showForm, setShowForm] = useState(false);
  const [showAutoBudget, setShowAutoBudget] = useState(false);
  const [editBudget, setEditBudget] = useState<BudgetData | null>(null);
  const [deleteBudget, setDeleteBudget] = useState<BudgetData | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  // Default sort set to Budgeted Amount Descending
  const [sortField, setSortField] = useState<SortField>('budgeted');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');

  // Gear actions & popup menu state
  const [showGearMenu, setShowGearMenu] = useState(false);
  const [confirmResetOpen, setConfirmResetOpen] = useState(false);
  const [confirmPurgeHistoryOpen, setConfirmPurgeHistoryOpen] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);

  // Breakout dropdown state for "Everything Else" catch-all item
  const [expandedCatchAll, setExpandedCatchAll] = useState(false);
  const [convertingCatId, setConvertingCatId] = useState<string | null>(null);

  const gearMenuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (gearMenuRef.current && !gearMenuRef.current.contains(e.target as Node)) {
        setShowGearMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const fetchBudgets = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['budgets'] });
  }, [queryClient]);

  const handleDelete = async () => {
    if (!deleteBudget) return;
    setDeleteLoading(true);
    try {
      const res = await fetch(`/api/budgets/${deleteBudget.id}`, { method: 'DELETE', credentials: 'include' });
      if (!res.ok) throw new Error('Failed to delete budget');
      setDeleteBudget(null);
      queryClient.invalidateQueries({ queryKey: ['budgets'] });
      toast.success('Budget deleted successfully');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete budget');
    } finally {
      setDeleteLoading(false);
    }
  };

  const handleResetBudgets = async () => {
    setActionLoading(true);
    try {
      const res = await fetch('/api/budgets?action=reset', { method: 'DELETE', credentials: 'include' });
      if (!res.ok) throw new Error('Failed to reset budgets');
      toast.success('All budgets reset successfully');
      queryClient.invalidateQueries({ queryKey: ['budgets'] });
      setConfirmResetOpen(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to reset budgets');
    } finally {
      setActionLoading(false);
    }
  };

  const handlePurgeHistory = async () => {
    setActionLoading(true);
    try {
      const res = await fetch(`/api/budgets?action=purge_history&periodKey=${periodKey}`, { method: 'DELETE', credentials: 'include' });
      if (!res.ok) throw new Error('Failed to remove budget history');
      toast.success('Budget history prior to current period removed');
      queryClient.invalidateQueries({ queryKey: ['budgets'] });
      setConfirmPurgeHistoryOpen(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to remove budget history');
    } finally {
      setActionLoading(false);
    }
  };

  const handleConvertToBudget = async (item: { categoryId: string; categoryName: string; actual: number }) => {
    setConvertingCatId(item.categoryId);
    try {
      const amountToBudget = Math.max(1, Math.round(item.actual));
      const res = await fetch('/api/budgets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          categoryId: item.categoryId,
          periodType: periodType,
          periodKey: periodKey,
          amount: amountToBudget,
          isRecurring: true,
          isDiscretionary: true,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message || 'Failed to create budget');
      }

      toast.success(`Converted "${item.categoryName}" to standalone budget (${formatCurrency(amountToBudget)}/mo)`);
      queryClient.invalidateQueries({ queryKey: ['budgets'] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to convert category to budget item');
    } finally {
      setConvertingCatId(null);
    }
  };

  const getAccountName = (id: string | null) => accounts.find((a: Account) => a.id === id)?.name;

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDirection(field === 'category' || field === 'account' ? 'asc' : 'desc');
    }
  };

  const sortBudgets = useCallback(
    (items: BudgetData[]) => {
      return [...items].sort((a, b) => {
        let valA: any;
        let valB: any;

        switch (sortField) {
          case 'category':
            valA = a.categoryName.toLowerCase();
            valB = b.categoryName.toLowerCase();
            return sortDirection === 'asc' ? valA.localeCompare(valB) : valB.localeCompare(valA);
          case 'budgeted':
            valA = a.budgeted;
            valB = b.budgeted;
            break;
          case 'actual':
            valA = a.actual;
            valB = b.actual;
            break;
          case 'variance':
            valA = a.remaining;
            valB = b.remaining;
            break;
          case 'progress':
            valA = a.percentUsed ?? 0;
            valB = b.percentUsed ?? 0;
            break;
          case 'account': {
            const accA = (a.fundingAccountId ? accounts.find((acc: Account) => acc.id === a.fundingAccountId)?.name || '' : '').toLowerCase();
            const accB = (b.fundingAccountId ? accounts.find((acc: Account) => acc.id === b.fundingAccountId)?.name || '' : '').toLowerCase();
            return sortDirection === 'asc' ? accA.localeCompare(accB) : accB.localeCompare(accA);
          }
          default:
            return 0;
        }

        if (valA < valB) return sortDirection === 'asc' ? -1 : 1;
        if (valA > valB) return sortDirection === 'asc' ? 1 : -1;
        return 0;
      });
    },
    [sortField, sortDirection, accounts]
  );

  const incomeBudgets = useMemo(
    () => sortBudgets((budgets as BudgetData[]).filter((b) => b.type === 'income')),
    [budgets, sortBudgets]
  );

  // Expense budgets sorted, with special "Everything Else" item pinned at the end
  const expenseBudgets = useMemo(() => {
    const allExpense = (budgets as BudgetData[]).filter((b) => b.type === 'expense');
    const isCatchAllItem = (b: BudgetData) => b.isEverythingElse || b.isCatchAll || (b.categoryName || '').toLowerCase() === 'everything else';
    const regular = allExpense.filter((b) => !isCatchAllItem(b));
    const catchAlls = allExpense.filter((b) => isCatchAllItem(b));
    return [...sortBudgets(regular), ...catchAlls];
  }, [budgets, sortBudgets]);

  const hasAnyAccount = useMemo(
    () => (budgets as BudgetData[]).some((b) => !!b.fundingAccountId),
    [budgets]
  );

  const renderSortHeader = (field: SortField, label: string, align: 'left' | 'right' = 'left') => {
    const isActive = sortField === field;
    return (
      <button
        onClick={() => handleSort(field)}
        className={`group flex items-center gap-1 font-medium hover:text-foreground transition-colors focus:outline-none py-1 select-none ${
          align === 'right' ? 'ml-auto justify-end' : 'justify-start'
        }`}
      >
        <span>{label}</span>
        {isActive ? (
          sortDirection === 'asc' ? (
            <ChevronUp className="w-3.5 h-3.5 text-primary shrink-0" />
          ) : (
            <ChevronDown className="w-3.5 h-3.5 text-primary shrink-0" />
          )
        ) : (
          <ChevronsUpDown className="w-3.5 h-3.5 text-muted-foreground/30 group-hover:text-muted-foreground shrink-0" />
        )}
      </button>
    );
  };

  if (loading) {
    return (
      <div className="bg-card border border-border rounded-xl shadow-sm">
        <div className="p-3 sm:p-5 pb-2 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-foreground">Budget Items</h3>
        </div>
        <div className="p-3 sm:p-5 text-muted-foreground text-sm">Loading...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-card border border-border rounded-xl shadow-sm p-3 sm:p-5">
        <h3 className="text-sm font-semibold text-foreground mb-3">Budget Items</h3>
        <ChartEmptyState variant="error" error={error} />
      </div>
    );
  }

  return (
    <>
      <div className="bg-card border border-border rounded-xl shadow-sm">
        <div className="p-3 sm:p-5 pb-3 flex flex-wrap sm:flex-nowrap items-center justify-between gap-2.5">
          <h3 className="text-sm font-semibold text-foreground">Budget Items</h3>
          <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap shrink-0">
            {isMobile && budgets.length > 0 && (
              <select
                value={`${sortField}-${sortDirection}`}
                onChange={(e) => {
                  const [field, dir] = e.target.value.split('-') as [SortField, SortDirection];
                  setSortField(field);
                  setSortDirection(dir);
                }}
                className="text-xs bg-muted/50 border border-border rounded-lg px-2 py-1 text-foreground focus:outline-none focus:border-primary"
              >
                <option value="budgeted-desc">Budgeted (High-Low)</option>
                <option value="budgeted-asc">Budgeted (Low-High)</option>
                <option value="category-asc">Category (A-Z)</option>
                <option value="category-desc">Category (Z-A)</option>
                <option value="actual-desc">Actual (High-Low)</option>
                <option value="actual-asc">Actual (Low-High)</option>
                <option value="variance-desc">Variance (High-Low)</option>
                <option value="variance-asc">Variance (Low-High)</option>
                <option value="progress-desc">Progress (High-Low)</option>
                <option value="progress-asc">Progress (Low-High)</option>
              </select>
            )}
            <button
              onClick={() => setShowAutoBudget(true)}
              title="Automatically generate budget proposals based on historical spending"
              className="inline-flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 text-xs font-medium text-foreground bg-accent hover:bg-accent/80 border border-border/80 rounded-lg transition-all shrink-0"
            >
              <Sparkles className="w-3.5 h-3.5 text-primary shrink-0" />
              <span>Auto</span>
            </button>
            <button
              onClick={() => { setEditBudget(null); setShowForm(true); }}
              title="Manually create a new custom budget item"
              className="inline-flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 text-xs font-medium text-primary-foreground bg-primary rounded-lg hover:opacity-90 transition-all shrink-0"
            >
              <Plus className="w-3.5 h-3.5 shrink-0" />
              <span>Budget</span>
            </button>
          </div>
        </div>

        {budgets.length === 0 ? (
          <div className="h-[200px]">
            <ChartEmptyState variant="nodata" description="No budgets set for this period" />
          </div>
        ) : isMobile ? (
          <div className="divide-y divide-border">
            {incomeBudgets.length > 0 && (
              <div className="px-4 py-2 bg-accent/40 text-xs font-semibold text-foreground uppercase tracking-wider border-y border-border/50 flex items-center gap-1.5">
                <ArrowUpCircle className="w-3.5 h-3.5 text-primary" />
                <span>Income</span>
              </div>
            )}
            {incomeBudgets.map((b) => {
              const isTargetMet = b.remaining >= 0;
              return (
                <div key={b.id} className="px-4 py-3 space-y-2 group/row">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: b.categoryColor }} />
                      <Link
                        href={`/transactions?categoryId=${b.categoryId}&startDate=${startDate}&endDate=${endDate}`}
                        className="text-foreground font-medium text-sm truncate hover:text-primary hover:underline transition-colors"
                      >
                        {b.categoryName}
                      </Link>
                      <BudgetItemTransactionsIcon
                        categoryId={b.categoryId}
                        categoryName={b.categoryName}
                        periodType={periodType}
                        periodKey={periodKey}
                      />
                    </div>
                    <div className="flex items-center gap-0.5 flex-shrink-0">
                      <button onClick={() => { setEditBudget(b); setShowForm(true); }} className="p-1 rounded hover:bg-accent text-muted-foreground">
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={() => setDeleteBudget(b)} className="p-1 rounded hover:bg-accent text-muted-foreground hover:text-destructive">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                  <div className="flex items-center justify-between text-xs font-mono">
                    <span className="text-muted-foreground">Budget: <span className="text-foreground blur-number">{formatCurrency(b.budgeted)}</span></span>
                    <span className="text-muted-foreground">Actual: <span className="text-foreground blur-number font-medium">{formatCurrency(b.actual)}</span></span>
                  </div>
                </div>
              );
            })}

            {expenseBudgets.length > 0 && (
              <div className="px-4 py-2 bg-accent/40 text-xs font-semibold text-foreground uppercase tracking-wider border-y border-border/50 flex items-center gap-1.5">
                <TrendingDown className="w-3.5 h-3.5 text-primary" />
                <span>Expenses</span>
              </div>
            )}
            {expenseBudgets.map((b) => {
              const isOver = b.remaining < 0;
              const isEE = b.isEverythingElse || b.isCatchAll || b.categoryName.toLowerCase() === 'everything else';
              const progressColor = isOver ? 'bg-destructive' : b.percentUsed > 85 ? 'bg-amber-500' : 'bg-primary';
              return (
                <div key={b.id} className="px-4 py-3 space-y-2 group/row">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: b.categoryColor || '#64748b' }} />
                      <Link
                        href={
                          isEE && b.groupedBreakout && b.groupedBreakout.length > 0
                            ? `/transactions?categoryIds=${b.groupedBreakout.map((i) => i.categoryId).join(',')}&startDate=${startDate}&endDate=${endDate}`
                            : `/transactions?categoryId=${b.categoryId}&startDate=${startDate}&endDate=${endDate}`
                        }
                        className="text-foreground font-semibold text-sm truncate hover:text-primary hover:underline transition-colors"
                      >
                        {b.categoryName}
                      </Link>
                      <BudgetItemTransactionsIcon
                        categoryId={isEE ? undefined : b.categoryId}
                        categoryIds={isEE ? b.groupedBreakout?.map((i) => i.categoryId) : undefined}
                        categoryName={b.categoryName}
                        periodType={periodType}
                        periodKey={periodKey}
                      />
                      {isEE && (
                        <button
                          onClick={() => setExpandedCatchAll(!expandedCatchAll)}
                          className="px-2 py-0.5 text-[10px] font-semibold bg-accent border border-border rounded text-primary flex items-center gap-1 shrink-0"
                        >
                          <Layers className="w-3 h-3" />
                          <span>{b.groupedBreakout ? b.groupedBreakout.length : 0} items</span>
                          {expandedCatchAll ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                        </button>
                      )}
                    </div>
                    <div className="flex items-center gap-0.5 flex-shrink-0">
                      <button onClick={() => { setEditBudget(b); setShowForm(true); }} className="p-1 rounded hover:bg-accent text-muted-foreground">
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={() => setDeleteBudget(b)} className="p-1 rounded hover:bg-accent text-muted-foreground hover:text-destructive">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  <div className="flex items-center justify-between text-xs font-mono">
                    <span className="text-muted-foreground">Budget: <span className="text-foreground blur-number">{formatCurrency(b.budgeted)}</span></span>
                    <span className="text-muted-foreground">Actual: <span className="text-foreground blur-number">{formatCurrency(b.actual)}</span></span>
                  </div>

                  {/* Everything Else Mobile Breakout sub-card */}
                  {isEE && expandedCatchAll && b.groupedBreakout && (
                    <div className="mt-2 p-3 bg-muted/40 rounded-xl border border-border/60 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">Unbudgeted Category Breakout</span>
                        <span className="text-[10px] text-muted-foreground">{b.groupedBreakout.length} items</span>
                      </div>
                      {b.groupedBreakout.length === 0 ? (
                        <p className="text-xs text-muted-foreground italic py-1">No unbudgeted spending in this period.</p>
                      ) : (
                        b.groupedBreakout.map((item) => (
                          <div key={item.categoryId} className="flex items-center justify-between text-xs p-2 rounded-lg bg-background border border-border/40 gap-2 group/row">
                            <div className="flex items-center gap-2 min-w-0 flex-1">
                              <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: item.categoryColor || '#6366f1' }} />
                              <Link
                                href={`/transactions?categoryId=${item.categoryId}&startDate=${startDate}&endDate=${endDate}`}
                                className="font-medium text-foreground truncate hover:text-primary hover:underline transition-colors"
                              >
                                {item.categoryName}
                              </Link>
                              <BudgetItemTransactionsIcon
                                categoryId={item.categoryId}
                                categoryName={item.categoryName}
                                periodType={periodType}
                                periodKey={periodKey}
                              />
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              <span className="font-mono text-muted-foreground font-semibold">{formatCurrency(item.actual)}</span>
                              <button
                                onClick={() => handleConvertToBudget(item)}
                                disabled={convertingCatId === item.categoryId}
                                title={`Create standalone budget for ${item.categoryName}`}
                                className="px-2 py-1 text-[10px] font-semibold bg-primary text-primary-foreground hover:opacity-90 rounded flex items-center gap-1 transition-all disabled:opacity-50"
                              >
                                <Plus className="w-3 h-3" />
                                <span>{convertingCatId === item.categoryId ? '...' : 'Convert'}</span>
                              </button>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[650px] md:min-w-full">
              <thead>
                <tr className="border-t border-border">
                  <th className="text-left px-5 py-2.5 text-xs font-medium text-muted-foreground">{renderSortHeader('category', 'Category', 'left')}</th>
                  <th className="text-right px-4 py-2.5 text-xs font-medium text-muted-foreground">{renderSortHeader('budgeted', 'Budgeted', 'right')}</th>
                  <th className="text-right px-4 py-2.5 text-xs font-medium text-muted-foreground">{renderSortHeader('actual', 'Actual', 'right')}</th>
                  <th className="text-right px-4 py-2.5 text-xs font-medium text-muted-foreground">{renderSortHeader('variance', 'Variance', 'right')}</th>
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">{renderSortHeader('progress', 'Progress', 'left')}</th>
                  {hasAnyAccount && (
                    <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">{renderSortHeader('account', 'Account', 'left')}</th>
                  )}
                  <th className="text-right px-4 py-2.5 text-xs font-medium text-muted-foreground relative">
                    <div className="flex items-center justify-end gap-1.5">
                      <span>Actions</span>
                      <div className="relative inline-block text-left" ref={gearMenuRef}>
                        <button
                          onClick={() => setShowGearMenu(!showGearMenu)}
                          title="Budget actions & history settings"
                          className="p-1 rounded hover:bg-accent text-muted-foreground hover:text-foreground transition-colors focus:outline-none"
                        >
                          <Settings className="w-3.5 h-3.5" />
                        </button>
                        {showGearMenu && (
                          <div className="absolute right-0 mt-1 w-56 rounded-xl bg-popover border border-border shadow-lg z-50 py-1.5 text-left animate-in fade-in-50 zoom-in-95">
                            <button
                              onClick={() => { setShowGearMenu(false); setConfirmPurgeHistoryOpen(true); }}
                              title="Erase historical budgets prior to current period while keeping active recurring amounts"
                              className="w-full px-3 py-2 text-xs text-foreground hover:bg-accent flex items-center gap-2 transition-colors"
                            >
                              <History className="w-3.5 h-3.5 text-primary shrink-0" />
                              <span>Remove Budget History</span>
                            </button>
                            <button
                              onClick={() => { setShowGearMenu(false); setConfirmResetOpen(true); }}
                              title="Permanently erase all budget items"
                              className="w-full px-3 py-2 text-xs text-destructive hover:bg-destructive/10 flex items-center gap-2 transition-colors"
                            >
                              <Trash2 className="w-3.5 h-3.5 text-destructive shrink-0" />
                              <span>Reset All Budgets</span>
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  </th>
                </tr>
              </thead>
              <tbody className="border-t border-border">
                {incomeBudgets.length > 0 && (
                  <tr className="bg-accent/40 border-y border-border/50">
                    <td colSpan={hasAnyAccount ? 7 : 6} className="px-5 py-2 text-xs font-semibold text-foreground uppercase tracking-wider">
                      <div className="flex items-center gap-1.5">
                        <ArrowUpCircle className="w-3.5 h-3.5 text-primary" />
                        <span>Income</span>
                      </div>
                    </td>
                  </tr>
                )}
                {incomeBudgets.map((b) => {
                  const isTargetMet = b.remaining >= 0;
                  return (
                    <tr key={b.id} className="border-b border-border hover:bg-accent/20 transition-colors group/row">
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-2">
                          <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: b.categoryColor }} />
                          <Link
                            href={`/transactions?categoryId=${b.categoryId}&startDate=${startDate}&endDate=${endDate}`}
                            className="text-foreground font-medium hover:text-primary hover:underline transition-colors"
                          >
                            {b.categoryName}
                          </Link>
                          <BudgetItemTransactionsIcon
                            categoryId={b.categoryId}
                            categoryName={b.categoryName}
                            periodType={periodType}
                            periodKey={periodKey}
                          />
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-foreground blur-number">{formatCurrency(b.budgeted)}</td>
                      <td className="px-4 py-3 text-right font-mono text-foreground font-medium blur-number">{formatCurrency(b.actual)}</td>
                      <td className={`px-4 py-3 text-right font-mono blur-number font-medium ${isTargetMet ? 'text-constructive' : 'text-amber-500'}`}>
                        {b.remaining >= 0 ? '+' : ''}{formatCurrency(b.remaining)}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div className="w-20 h-1.5 bg-muted/80 rounded-full overflow-hidden">
                            <div className={`h-full ${isTargetMet ? 'bg-primary' : 'bg-amber-500'} rounded-full transition-all`} style={{ width: `${Math.min(Math.max(b.percentUsed || 0, 0), 100)}%` }} />
                          </div>
                          <span className={`text-[10px] font-mono ${isTargetMet ? 'text-primary font-medium' : 'text-muted-foreground'}`}>
                            {(b.percentUsed || 0).toFixed(0)}%
                          </span>
                        </div>
                      </td>
                      {hasAnyAccount && (
                        <td className="px-4 py-3">
                          <span className="text-xs text-muted-foreground/50">&mdash;</span>
                        </td>
                      )}
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button onClick={() => { setEditBudget(b); setShowForm(true); }} className="p-1.5 rounded hover:bg-accent text-muted-foreground">
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          <button onClick={() => setDeleteBudget(b)} className="p-1.5 rounded hover:bg-accent text-muted-foreground hover:text-destructive">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}

                {expenseBudgets.length > 0 && (
                  <tr className="bg-accent/40 border-y border-border/50">
                    <td colSpan={hasAnyAccount ? 7 : 6} className="px-5 py-2 text-xs font-semibold text-foreground uppercase tracking-wider">
                      <div className="flex items-center gap-1.5">
                        <TrendingDown className="w-3.5 h-3.5 text-primary" />
                        <span>Expenses</span>
                      </div>
                    </td>
                  </tr>
                )}
                {expenseBudgets.map((b) => {
                  const isOver = b.remaining < 0;
                  const isEE = b.isEverythingElse || b.isCatchAll || (b.categoryName || '').toLowerCase() === 'everything else';
                  const progressColor = isOver ? 'bg-destructive' : b.percentUsed > 85 ? 'bg-amber-500' : 'bg-primary';
                  return (
                    <Fragment key={b.id}>
                      <tr className={`border-b border-border hover:bg-accent/20 transition-colors group/row ${isEE ? 'bg-muted/10 font-semibold' : ''}`}>
                        <td className="px-5 py-3">
                          <div className="flex items-center gap-2">
                            <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: b.categoryColor || '#64748b' }} />
                            <div className="flex items-center gap-1.5 flex-wrap min-w-0">
                              <Link
                                href={
                                  isEE && b.groupedBreakout && b.groupedBreakout.length > 0
                                    ? `/transactions?categoryIds=${b.groupedBreakout.map((i) => i.categoryId).join(',')}&startDate=${startDate}&endDate=${endDate}`
                                    : `/transactions?categoryId=${b.categoryId}&startDate=${startDate}&endDate=${endDate}`
                                }
                                className="text-foreground font-semibold truncate hover:text-primary hover:underline transition-colors"
                              >
                                {b.categoryName}
                              </Link>
                              <BudgetItemTransactionsIcon
                                categoryId={isEE ? undefined : b.categoryId}
                                categoryIds={isEE ? b.groupedBreakout?.map((i) => i.categoryId) : undefined}
                                categoryName={b.categoryName}
                                periodType={periodType}
                                periodKey={periodKey}
                              />

                              {/* Redesigned compact Everything Else breakout dropdown pill */}
                              {isEE && (
                                <button
                                  onClick={() => setExpandedCatchAll(!expandedCatchAll)}
                                  title="Expand to see unbudgeted category spending in this bucket"
                                  className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-medium bg-accent hover:bg-accent/80 border border-border/80 rounded text-primary transition-all cursor-pointer shrink-0"
                                >
                                  <Layers className="w-3 h-3 text-primary shrink-0" />
                                  <span>{b.groupedBreakout ? b.groupedBreakout.length : 0} items</span>
                                  {expandedCatchAll ? <ChevronUp className="w-3 h-3 shrink-0" /> : <ChevronDown className="w-3 h-3 shrink-0" />}
                                </button>
                              )}
                            </div>
                          </div>
                          {b.notes && <div className="text-[10px] text-muted-foreground mt-0.5 ml-4.5">{b.notes}</div>}
                        </td>
                        <td className="px-4 py-3 text-right font-mono text-foreground blur-number">{formatCurrency(b.budgeted)}</td>
                        <td className="px-4 py-3 text-right font-mono text-foreground blur-number">{formatCurrency(b.actual)}</td>
                        <td className={`px-4 py-3 text-right font-mono blur-number font-medium ${isOver ? 'text-destructive' : b.remaining > 0 ? 'text-constructive' : 'text-muted-foreground'}`}>
                          {formatCurrency(b.remaining)}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <div className="w-20 h-1.5 bg-muted/80 rounded-full overflow-hidden">
                              <div className={`h-full ${progressColor} rounded-full transition-all`} style={{ width: `${Math.min(Math.max(b.percentUsed || 0, 0), 100)}%` }} />
                            </div>
                            <span className={`text-[10px] font-mono ${isOver ? 'text-destructive font-medium' : 'text-muted-foreground'}`}>
                              {(b.percentUsed || 0).toFixed(0)}%
                            </span>
                          </div>
                        </td>
                        {hasAnyAccount && (
                          <td className="px-4 py-3">
                            <span className="text-xs text-muted-foreground/50">&mdash;</span>
                          </td>
                        )}
                        <td className="px-4 py-3 text-right">
                          <div className="flex items-center justify-end gap-1">
                            <button onClick={() => { setEditBudget(b); setShowForm(true); }} className="p-1.5 rounded hover:bg-accent text-muted-foreground">
                              <Pencil className="w-3.5 h-3.5" />
                            </button>
                            <button onClick={() => setDeleteBudget(b)} className="p-1.5 rounded hover:bg-accent text-muted-foreground hover:text-destructive">
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>

                      {/* Everything Else Desktop Catch-All Breakout expandable sub-row */}
                      {isEE && expandedCatchAll && b.groupedBreakout && (
                        <tr className="bg-muted/30 border-b border-border/80">
                          <td colSpan={hasAnyAccount ? 7 : 6} className="px-6 py-3">
                            <div className="space-y-2.5">
                              <div className="flex items-center justify-between">
                                <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                                  <Layers className="w-3.5 h-3.5 text-primary" />
                                  Unbudgeted Categories in "Everything Else" ({b.groupedBreakout.length})
                                </span>
                                <span className="text-[10px] text-muted-foreground">
                                  Click "Convert to Budget Item" to promote any item to its own standalone budget
                                </span>
                              </div>
                              {b.groupedBreakout.length === 0 ? (
                                <div className="p-3 text-xs text-muted-foreground italic bg-background rounded-lg border border-border/50">
                                  No unbudgeted category spending in this period. All active spending is individually budgeted!
                                </div>
                              ) : (
                                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                                  {b.groupedBreakout.map((item) => (
                                    <div key={item.categoryId} className="flex items-center justify-between p-2.5 rounded-lg bg-background border border-border/60 text-xs gap-2 group/row">
                                      <div className="flex items-center gap-2 min-w-0 flex-1">
                                        <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: item.categoryColor || '#6366f1' }} />
                                        <Link
                                          href={`/transactions?categoryId=${item.categoryId}&startDate=${startDate}&endDate=${endDate}`}
                                          className="font-medium text-foreground truncate hover:text-primary hover:underline transition-colors"
                                        >
                                          {item.categoryName}
                                        </Link>
                                        <BudgetItemTransactionsIcon
                                          categoryId={item.categoryId}
                                          categoryName={item.categoryName}
                                          periodType={periodType}
                                          periodKey={periodKey}
                                        />
                                      </div>
                                      <div className="flex items-center gap-2 shrink-0">
                                        <span className="font-mono text-muted-foreground font-semibold">{formatCurrency(item.actual)}</span>
                                        <button
                                          onClick={() => handleConvertToBudget(item)}
                                          disabled={convertingCatId === item.categoryId}
                                          title={`Convert ${item.categoryName} to a standalone budget item`}
                                          className="px-2 py-1 text-[10px] font-semibold bg-primary text-primary-foreground hover:opacity-90 rounded flex items-center gap-1 transition-all disabled:opacity-50"
                                        >
                                          <Plus className="w-3 h-3" />
                                          <span>{convertingCatId === item.categoryId ? '...' : 'Convert'}</span>
                                        </button>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <BudgetFormDialog
        open={showForm}
        onClose={() => { setShowForm(false); setEditBudget(null); }}
        onSuccess={fetchBudgets}
        categories={categories}
        editBudget={editBudget ? {
          id: editBudget.id,
          categoryId: editBudget.categoryId,
          periodType: editBudget.periodType,
          periodKey: editBudget.periodKey || editBudget.yearMonth || null,
          amount: String(editBudget.budgeted),
          isRecurring: editBudget.isRecurring,
          fundingAccountId: editBudget.fundingAccountId,
          rollover: editBudget.rollover,
          notes: editBudget.notes,
        } : undefined}
      />

      <AutoBudgetDialog
        open={showAutoBudget}
        onClose={() => setShowAutoBudget(false)}
        periodType={periodType}
        periodKey={periodKey}
      />

      <AlertDialog open={!!deleteBudget} onOpenChange={(o) => { if (!o) setDeleteBudget(null); }}>
        <AlertDialogContent className="max-w-sm">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Budget</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete the budget for <strong>{deleteBudget?.categoryName}</strong>?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <button
              onClick={handleDelete}
              disabled={deleteLoading}
              className="inline-flex h-9 items-center justify-center rounded-lg bg-destructive px-4 py-2 text-sm font-semibold text-destructive-foreground hover:opacity-90 transition-opacity disabled:opacity-50"
            >
              {deleteLoading ? 'Deleting...' : 'Delete'}
            </button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={confirmResetOpen} onOpenChange={setConfirmResetOpen}>
        <AlertDialogContent className="max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-destructive flex items-center gap-2">
              <Trash2 className="w-5 h-5" />
              Reset All Budgets
            </AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to <strong>erase all budget items</strong>? This will permanently remove all recurring and period-specific budgets across all categories.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <button
              onClick={handleResetBudgets}
              disabled={actionLoading}
              className="inline-flex h-9 items-center justify-center rounded-lg bg-destructive px-4 py-2 text-sm font-semibold text-destructive-foreground hover:opacity-90 transition-opacity disabled:opacity-50"
            >
              {actionLoading ? 'Resetting...' : 'Reset All Budgets'}
            </button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={confirmPurgeHistoryOpen} onOpenChange={setConfirmPurgeHistoryOpen}>
        <AlertDialogContent className="max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <History className="w-5 h-5 text-primary" />
              Remove Prior Budget History
            </AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to <strong>remove historical budget data prior to {periodKey}</strong>? Active recurring budgets will remain in effect for the current period forward.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <button
              onClick={handlePurgeHistory}
              disabled={actionLoading}
              className="inline-flex h-9 items-center justify-center rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90 transition-opacity disabled:opacity-50"
            >
              {actionLoading ? 'Removing...' : 'Remove History'}
            </button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
