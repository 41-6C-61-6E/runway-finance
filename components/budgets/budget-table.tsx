'use client';

import React, { useState, useEffect, useCallback, useMemo, useRef, Fragment } from 'react';
import Link from 'next/link';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useBudgetPeriod } from './budget-period-selector';
import { BudgetFormDialog } from './budget-form-dialog';
import { AutoBudgetDialog } from './auto-budget-dialog';
import { BudgetExclusionsDialog } from './budget-exclusions-dialog';
import { BudgetItemTransactionsIcon, getPeriodDateRange } from './budget-transactions-tooltip';
import { formatCurrency } from '@/lib/utils/format';
import { Plus, Pencil, Trash2, RotateCcw, Landmark, ArrowUpCircle, TrendingDown, ChevronUp, ChevronDown, ChevronsUpDown, Settings, History, Layers, Filter, SlidersHorizontal, Loader2 } from 'lucide-react';
import { AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from '@/components/ui/tooltip';
import { ChartEmptyState } from '@/components/charts/chart-empty-state';
import { useUserSettings } from '@/components/user-settings-provider';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

type SortField = 'category' | 'budgeted' | 'actual' | 'variance' | 'progress' | 'account';
type SortDirection = 'asc' | 'desc';

interface BudgetData {
  id: string;
  categoryId: string;
  categoryName: string;
  categoryColor: string;
  periodType: string;
  nativePeriodType?: 'monthly' | 'quarterly' | 'yearly';
  nativeAmount?: number;
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
  coveredCategoryIds?: string[];
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
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState<number>(1000);
  const [showDirectOnly, setShowDirectOnly] = useState(false);

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  useEffect(() => {
    if (!containerRef.current) return;
    const target = containerRef.current.parentElement || containerRef.current;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        if (entry.contentRect.width > 0) {
          setContainerWidth(entry.contentRect.width);
        }
      }
    });
    observer.observe(target);
    return () => observer.disconnect();
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
  const [showExclusionsDialog, setShowExclusionsDialog] = useState(false);
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
      const res = await fetch('/api/budgets?action=purge_history&periodKey=${periodKey}', { method: 'DELETE', credentials: 'include' });
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

      const periodSuffix = periodType === 'yearly' ? '/yr' : periodType === 'quarterly' ? '/quarter' : '/mo';
      toast.success(`Converted "${item.categoryName}" to standalone budget (${formatCurrency(amountToBudget)}${periodSuffix})`);
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

  const filterDirect = useCallback(
    (items: BudgetData[]) => {
      if (!showDirectOnly) return items;
      return items.filter((b) => (b.nativePeriodType || b.periodType) === periodType || b.isEverythingElse);
    },
    [showDirectOnly, periodType]
  );

  const incomeBudgets = useMemo(
    () => sortBudgets(filterDirect((budgets as BudgetData[]).filter((b) => b.type === 'income'))),
    [budgets, sortBudgets, filterDirect]
  );

  // Expense budgets sorted, with special "Everything Else" item pinned at the end
  const expenseBudgets = useMemo(() => {
    const allExpense = filterDirect((budgets as BudgetData[]).filter((b) => b.type === 'expense'));
    const isCatchAllItem = (b: BudgetData) => b.isEverythingElse || b.isCatchAll || (b.categoryName || '').toLowerCase() === 'everything else';
    const regular = allExpense.filter((b) => !isCatchAllItem(b));
    const catchAlls = allExpense.filter((b) => isCatchAllItem(b));
    return [...sortBudgets(regular), ...catchAlls];
  }, [budgets, sortBudgets, filterDirect]);

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
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-foreground">Budget Items</h3>
            <TooltipProvider delayDuration={150}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    onClick={() => setShowDirectOnly(!showDirectOnly)}
                    aria-label="Toggle all timeframe budgets vs direct period only"
                    className={cn(
                      "inline-flex items-center justify-center h-6 w-6 rounded-md border transition-all cursor-pointer",
                      showDirectOnly
                        ? "bg-primary text-primary-foreground border-primary shadow-xs"
                        : "text-muted-foreground hover:text-foreground hover:bg-accent border-transparent"
                    )}
                  >
                    <Filter className="w-3 h-3" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="right" className="text-xs max-w-xs p-2.5">
                  <p className="font-semibold text-foreground mb-1">
                    {showDirectOnly ? 'Direct Period Only' : 'All Timeframe Budgets'}
                  </p>
                  <p className="text-muted-foreground text-[11px] leading-relaxed">
                    {showDirectOnly
                      ? 'Currently showing only budget items defined directly for this timeframe. Click to show all rolled-up and rolled-down items.'
                      : 'Currently showing all budget items (including monthly, quarterly, and yearly items rolled into this timeframe). Click to filter to direct items only.'}
                  </p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
          <div className="flex items-center gap-1.5 flex-wrap sm:flex-nowrap shrink-0">
            {isMobile && budgets.length > 0 && (
              <select
                value={`${sortField}-${sortDirection}`}
                onChange={(e) => {
                  const [field, dir] = e.target.value.split('-') as [SortField, SortDirection];
                  setSortField(field);
                  setSortDirection(dir);
                }}
                className="text-xs bg-muted/50 border border-border rounded-lg px-2 py-1 text-foreground focus:outline-none focus:border-primary h-8"
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
            <TooltipProvider delayDuration={150}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    onClick={() => setShowAutoBudget(true)}
                    aria-label="Auto Budget Wizard"
                    className="inline-flex items-center justify-center h-8 px-3 text-xs font-medium text-foreground bg-accent hover:bg-accent/80 border border-border/80 rounded-lg transition-all shrink-0 cursor-pointer"
                  >
                    <span>Auto</span>
                  </button>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="text-xs max-w-xs text-center">
                  Auto-generate budget proposals based on historical spending
                </TooltipContent>
              </Tooltip>

              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    onClick={() => { setEditBudget(null); setShowForm(true); }}
                    aria-label="Add Budget"
                    className="inline-flex items-center justify-center gap-1 h-8 px-2.5 sm:px-3 text-xs font-medium text-foreground bg-accent hover:bg-accent/80 border border-border/80 rounded-lg transition-all shrink-0 cursor-pointer"
                  >
                    <span>Add</span>
                    <Plus className="w-3.5 h-3.5 shrink-0" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="text-xs">
                  Create a custom budget item
                </TooltipContent>
              </Tooltip>

              <div className="relative inline-block text-left" ref={gearMenuRef}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      onClick={() => setShowGearMenu(!showGearMenu)}
                      aria-label="Budget settings & history settings"
                      className="inline-flex items-center justify-center h-8 w-8 text-xs font-medium text-foreground bg-accent hover:bg-accent/80 border border-border/80 rounded-lg transition-all shrink-0 cursor-pointer focus:outline-none"
                    >
                      <Settings className="w-4 h-4 shrink-0" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="text-xs">
                    Budget settings & history actions
                  </TooltipContent>
                </Tooltip>
                {showGearMenu && (
                  <div className="absolute right-0 mt-1.5 w-60 rounded-xl bg-popover border border-border shadow-lg z-50 py-1.5 text-left animate-in fade-in-50 zoom-in-95">
                    <button
                      onClick={() => { setShowGearMenu(false); setShowExclusionsDialog(true); }}
                      title="Configure custom categories and tags to ignore from budget tracking"
                      className="w-full px-3 py-2 text-xs text-foreground hover:bg-accent flex items-center gap-2 transition-colors cursor-pointer"
                    >
                      <SlidersHorizontal className="w-3.5 h-3.5 text-primary shrink-0" />
                      <span>Budget Exclusions</span>
                    </button>
                    <button
                      onClick={() => { setShowGearMenu(false); setConfirmPurgeHistoryOpen(true); }}
                      title="Erase historical budgets prior to current period while keeping active recurring amounts"
                      className="w-full px-3 py-2 text-xs text-foreground hover:bg-accent flex items-center gap-2 transition-colors cursor-pointer"
                    >
                      <History className="w-3.5 h-3.5 text-primary shrink-0" />
                      <span>Remove Budget History</span>
                    </button>
                    <button
                      onClick={() => { setShowGearMenu(false); setConfirmResetOpen(true); }}
                      title="Permanently erase all budget items"
                      className="w-full px-3 py-2 text-xs text-destructive hover:bg-destructive/10 flex items-center gap-2 transition-colors cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5 text-destructive shrink-0" />
                      <span>Reset All Budgets</span>
                    </button>
                  </div>
                )}
              </div>
            </TooltipProvider>
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
                        href={
                          b.coveredCategoryIds && b.coveredCategoryIds.length > 1
                            ? `/transactions?categoryIds=${b.coveredCategoryIds.join(',')}&startDate=${startDate}&endDate=${endDate}`
                            : `/transactions?categoryId=${b.categoryId}&startDate=${startDate}&endDate=${endDate}`
                        }
                        className="text-foreground font-medium text-sm truncate hover:text-primary hover:underline transition-colors"
                      >
                        {b.categoryName}
                      </Link>
                      <BudgetItemTransactionsIcon
                        categoryId={b.coveredCategoryIds && b.coveredCategoryIds.length > 1 ? undefined : b.categoryId}
                        categoryIds={b.coveredCategoryIds && b.coveredCategoryIds.length > 1 ? b.coveredCategoryIds : undefined}
                        categoryName={b.categoryName}
                        periodType={periodType}
                        periodKey={periodKey}
                      />
                      {b.nativePeriodType && b.nativePeriodType !== periodType && b.nativeAmount !== undefined && (
                        <span
                          title={`Rolled up from ${b.nativePeriodType} budget (${formatCurrency(b.nativeAmount)}/${b.nativePeriodType === 'monthly' ? 'mo' : b.nativePeriodType === 'quarterly' ? 'quarter' : 'yr'})`}
                          className="inline-flex items-center px-1.5 py-0.5 text-[10px] font-semibold bg-muted/60 text-muted-foreground border border-border/60 rounded shrink-0"
                        >
                          {formatCurrency(b.nativeAmount)}/{b.nativePeriodType === 'monthly' ? 'mo' : b.nativePeriodType === 'quarterly' ? 'quarter' : 'yr'}
                        </span>
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
                            : b.coveredCategoryIds && b.coveredCategoryIds.length > 1
                            ? `/transactions?categoryIds=${b.coveredCategoryIds.join(',')}&startDate=${startDate}&endDate=${endDate}`
                            : `/transactions?categoryId=${b.categoryId}&startDate=${startDate}&endDate=${endDate}`
                        }
                        className="text-foreground font-semibold text-sm truncate hover:text-primary hover:underline transition-colors"
                      >
                        {b.categoryName}
                      </Link>
                      <BudgetItemTransactionsIcon
                        categoryId={isEE || (b.coveredCategoryIds && b.coveredCategoryIds.length > 1) ? undefined : b.categoryId}
                        categoryIds={isEE ? b.groupedBreakout?.map((i) => i.categoryId) : (b.coveredCategoryIds && b.coveredCategoryIds.length > 1 ? b.coveredCategoryIds : undefined)}
                        categoryName={b.categoryName}
                        periodType={periodType}
                        periodKey={periodKey}
                      />
                      {!isEE && b.nativePeriodType && b.nativePeriodType !== periodType && b.nativeAmount !== undefined && (
                        <span
                          title={`Rolled up from ${b.nativePeriodType} budget (${formatCurrency(b.nativeAmount)}/${b.nativePeriodType === 'monthly' ? 'mo' : b.nativePeriodType === 'quarterly' ? 'quarter' : 'yr'})`}
                          className="inline-flex items-center px-1.5 py-0.5 text-[10px] font-semibold bg-muted/60 text-muted-foreground border border-border/60 rounded shrink-0"
                        >
                          {formatCurrency(b.nativeAmount)}/{b.nativePeriodType === 'monthly' ? 'mo' : b.nativePeriodType === 'quarterly' ? 'quarter' : 'yr'}
                        </span>
                      )}
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
                    <div className="mt-2.5 p-3 bg-muted/30 rounded-xl border border-border/60 space-y-2.5">
                      <div className="flex items-center justify-between px-0.5">
                        <span className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                          <Layers className="w-3.5 h-3.5 text-primary" />
                          Unbudgeted Categories
                          <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground">
                            {b.groupedBreakout.length}
                          </span>
                        </span>
                        <span className="text-xs font-mono font-medium text-muted-foreground">
                          Total: <span className="text-foreground blur-number">{formatCurrency(b.actual)}</span>
                        </span>
                      </div>
                      {b.groupedBreakout.length === 0 ? (
                        <p className="text-xs text-muted-foreground italic py-1 text-center bg-background/50 rounded-lg border border-border/40">
                          No unbudgeted spending in this period.
                        </p>
                      ) : (
                        <div className="space-y-2">
                          {b.groupedBreakout.map((item) => (
                            <div key={item.categoryId} className="group/cat flex items-center justify-between px-3 py-2.5 rounded-xl bg-card border border-border/60 gap-3 min-w-0 shadow-xs">
                              <div className="flex items-center gap-2.5 min-w-0 flex-1">
                                <div className="w-2.5 h-2.5 rounded-full shrink-0 shadow-xs" style={{ backgroundColor: item.categoryColor || '#6366f1' }} />
                                <Link
                                  href={`/transactions?categoryId=${item.categoryId}&startDate=${startDate}&endDate=${endDate}`}
                                  className="font-medium text-foreground text-sm truncate hover:text-primary hover:underline transition-colors min-w-0 block"
                                  title={item.categoryName}
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
                              <div className="flex items-center gap-2.5 shrink-0">
                                <span className="font-mono text-sm font-semibold text-foreground blur-number">{formatCurrency(item.actual)}</span>
                                <TooltipProvider delayDuration={150}>
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <button
                                        type="button"
                                        onClick={() => handleConvertToBudget(item)}
                                        disabled={convertingCatId === item.categoryId}
                                        aria-label={`Convert ${item.categoryName} to standalone budget`}
                                        className="inline-flex items-center justify-center w-7 h-7 rounded-lg bg-primary/10 hover:bg-primary text-primary hover:text-primary-foreground transition-all duration-150 active:scale-95 disabled:opacity-50 disabled:pointer-events-none cursor-pointer focus:outline-none focus:ring-1 focus:ring-primary shrink-0"
                                      >
                                        {convertingCatId === item.categoryId ? (
                                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                        ) : (
                                          <Plus className="w-4 h-4" />
                                        )}
                                      </button>
                                    </TooltipTrigger>
                                    <TooltipContent side="top" className="text-xs">
                                      Convert &ldquo;{item.categoryName}&rdquo; to standalone budget ({formatCurrency(Math.max(1, Math.round(item.actual)))}/mo)
                                    </TooltipContent>
                                  </Tooltip>
                                </TooltipProvider>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <div ref={containerRef} className="w-full overflow-x-auto min-w-0 border-collapse">
            {(() => {
              const showProgressCol = containerWidth >= 850;
              const showVarianceCol = containerWidth >= 650;
              const showAccountCol = containerWidth >= 1050 && hasAnyAccount;
              const activeColCount = 3 + (showVarianceCol ? 1 : 0) + (showProgressCol ? 1 : 0) + (showAccountCol ? 1 : 0) + 1;

              return (
                <table className="w-full text-xs sm:text-sm border-collapse min-w-[360px]">
                  <thead>
                    <tr className="border-t border-border">
                      <th className="text-left px-2.5 sm:px-3.5 py-2.5 text-xs font-medium text-muted-foreground">{renderSortHeader('category', 'Category', 'left')}</th>
                      <th className="text-right px-1.5 sm:px-2.5 py-2.5 text-xs font-medium text-muted-foreground whitespace-nowrap">{renderSortHeader('budgeted', 'Budgeted', 'right')}</th>
                      <th className="text-right px-1.5 sm:px-2.5 py-2.5 text-xs font-medium text-muted-foreground whitespace-nowrap">{renderSortHeader('actual', 'Actual', 'right')}</th>
                      {showVarianceCol && (
                        <th className="text-right px-1.5 sm:px-2.5 py-2.5 text-xs font-medium text-muted-foreground whitespace-nowrap">{renderSortHeader('variance', 'Variance', 'right')}</th>
                      )}
                      {showProgressCol && (
                        <th className="text-left px-1.5 sm:px-2.5 py-2.5 text-xs font-medium text-muted-foreground whitespace-nowrap">{renderSortHeader('progress', 'Progress', 'left')}</th>
                      )}
                      {showAccountCol && (
                        <th className="text-left px-1.5 sm:px-2.5 py-2.5 text-xs font-medium text-muted-foreground truncate">{renderSortHeader('account', 'Account', 'left')}</th>
                      )}
                      <th className="text-right px-1.5 sm:px-2 py-2.5 text-xs font-medium text-muted-foreground whitespace-nowrap">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="border-t border-border">
                    {incomeBudgets.length > 0 && (
                      <tr className="bg-accent/40 border-y border-border/50">
                        <td colSpan={activeColCount} className="px-3 sm:px-4 py-2 text-xs font-semibold text-foreground uppercase tracking-wider">
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
                          <td className="px-2.5 sm:px-3.5 py-2.5 min-w-0">
                            <div className="flex items-center gap-1.5 min-w-0 overflow-hidden">
                              <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: b.categoryColor }} />
                              <Link
                                href={
                                  b.coveredCategoryIds && b.coveredCategoryIds.length > 1
                                    ? `/transactions?categoryIds=${b.coveredCategoryIds.join(',')}&startDate=${startDate}&endDate=${endDate}`
                                    : `/transactions?categoryId=${b.categoryId}&startDate=${startDate}&endDate=${endDate}`
                                }
                                className="text-foreground font-medium truncate hover:text-primary hover:underline transition-colors shrink min-w-0 max-w-[120px] sm:max-w-[180px] md:max-w-[260px] inline-block align-middle"
                              >
                                {b.categoryName}
                              </Link>
                              <BudgetItemTransactionsIcon
                                categoryId={b.coveredCategoryIds && b.coveredCategoryIds.length > 1 ? undefined : b.categoryId}
                                categoryIds={b.coveredCategoryIds && b.coveredCategoryIds.length > 1 ? b.coveredCategoryIds : undefined}
                                categoryName={b.categoryName}
                                periodType={periodType}
                                periodKey={periodKey}
                              />
                              {b.nativePeriodType && b.nativePeriodType !== periodType && b.nativeAmount !== undefined && (
                                <span
                                  title={`Rolled up from ${b.nativePeriodType} budget (${formatCurrency(b.nativeAmount)}/${b.nativePeriodType === 'monthly' ? 'mo' : b.nativePeriodType === 'quarterly' ? 'quarter' : 'yr'})`}
                                  className="inline-flex items-center px-1.5 py-0.5 text-[10px] font-semibold bg-muted/60 text-muted-foreground border border-border/60 rounded shrink-0"
                                >
                                  {formatCurrency(b.nativeAmount)}/{b.nativePeriodType === 'monthly' ? 'mo' : b.nativePeriodType === 'quarterly' ? 'quarter' : 'yr'}
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="px-1.5 sm:px-2.5 py-2.5 text-right font-mono text-foreground blur-number whitespace-nowrap text-xs sm:text-sm">{formatCurrency(b.budgeted)}</td>
                          <td className="px-1.5 sm:px-2.5 py-2.5 text-right font-mono text-foreground font-medium blur-number whitespace-nowrap text-xs sm:text-sm">{formatCurrency(b.actual)}</td>
                          {showVarianceCol && (
                            <td className={`px-1.5 sm:px-2.5 py-2.5 text-right font-mono blur-number font-medium whitespace-nowrap text-xs sm:text-sm ${isTargetMet ? 'text-constructive' : 'text-amber-500'}`}>
                              {b.remaining >= 0 ? '+' : ''}{formatCurrency(b.remaining)}
                            </td>
                          )}
                          {showProgressCol && (
                            <td className="px-1.5 sm:px-2.5 py-2.5 whitespace-nowrap overflow-hidden">
                              <div className="flex items-center gap-1 sm:gap-1.5 min-w-0">
                                <div className="w-10 sm:w-14 h-1.5 bg-muted/80 rounded-full overflow-hidden shrink">
                                  <div className={`h-full ${isTargetMet ? 'bg-primary' : 'bg-amber-500'} rounded-full transition-all`} style={{ width: `${Math.min(Math.max(b.percentUsed || 0, 0), 100)}%` }} />
                                </div>
                                <span className={`text-[10px] font-mono shrink-0 ${isTargetMet ? 'text-primary font-medium' : 'text-muted-foreground'}`}>
                                  {(b.percentUsed || 0).toFixed(0)}%
                                </span>
                              </div>
                            </td>
                          )}
                          {showAccountCol && (
                            <td className="px-1.5 sm:px-2.5 py-2.5 text-xs text-muted-foreground/50 truncate">
                              &mdash;
                            </td>
                          )}
                          <td className="px-1.5 sm:px-2 py-2.5 text-right whitespace-nowrap">
                            <div className="flex items-center justify-end gap-0.5 sm:gap-1">
                              <button onClick={() => { setEditBudget(b); setShowForm(true); }} className="p-1 rounded hover:bg-accent text-muted-foreground">
                                <Pencil className="w-3.5 h-3.5" />
                              </button>
                              <button onClick={() => setDeleteBudget(b)} className="p-1 rounded hover:bg-accent text-muted-foreground hover:text-destructive">
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}

                    {expenseBudgets.length > 0 && (
                      <tr className="bg-accent/40 border-y border-border/50">
                        <td colSpan={activeColCount} className="px-3 sm:px-4 py-2 text-xs font-semibold text-foreground uppercase tracking-wider">
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
                            <td className="px-2.5 sm:px-3.5 py-2.5 min-w-0">
                              <div className="flex items-center gap-1.5 min-w-0 overflow-hidden flex-wrap">
                                <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: b.categoryColor || '#64748b' }} />
                                <Link
                                  href={
                                    isEE && b.groupedBreakout && b.groupedBreakout.length > 0
                                      ? `/transactions?categoryIds=${b.groupedBreakout.map((i) => i.categoryId).join(',')}&startDate=${startDate}&endDate=${endDate}`
                                      : b.coveredCategoryIds && b.coveredCategoryIds.length > 1
                                      ? `/transactions?categoryIds=${b.coveredCategoryIds.join(',')}&startDate=${startDate}&endDate=${endDate}`
                                      : `/transactions?categoryId=${b.categoryId}&startDate=${startDate}&endDate=${endDate}`
                                  }
                                  className="text-foreground font-semibold truncate hover:text-primary hover:underline transition-colors shrink min-w-0 max-w-[120px] sm:max-w-[180px] md:max-w-[260px] inline-block align-middle"
                                >
                                  {b.categoryName}
                                </Link>
                                <BudgetItemTransactionsIcon
                                  categoryId={isEE || (b.coveredCategoryIds && b.coveredCategoryIds.length > 1) ? undefined : b.categoryId}
                                  categoryIds={isEE ? b.groupedBreakout?.map((i) => i.categoryId) : (b.coveredCategoryIds && b.coveredCategoryIds.length > 1 ? b.coveredCategoryIds : undefined)}
                                  categoryName={b.categoryName}
                                  periodType={periodType}
                                  periodKey={periodKey}
                                />
                                {!isEE && b.nativePeriodType && b.nativePeriodType !== periodType && b.nativeAmount !== undefined && (
                                  <span
                                    title={`Rolled up from ${b.nativePeriodType} budget (${formatCurrency(b.nativeAmount)}/${b.nativePeriodType === 'monthly' ? 'mo' : b.nativePeriodType === 'quarterly' ? 'quarter' : 'yr'})`}
                                    className="inline-flex items-center px-1.5 py-0.5 text-[10px] font-semibold bg-muted/60 text-muted-foreground border border-border/60 rounded shrink-0"
                                  >
                                    {formatCurrency(b.nativeAmount)}/{b.nativePeriodType === 'monthly' ? 'mo' : b.nativePeriodType === 'quarterly' ? 'quarter' : 'yr'}
                                  </span>
                                )}

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
                              {b.notes && <div className="text-[10px] text-muted-foreground mt-0.5 ml-4 truncate">{b.notes}</div>}
                            </td>
                            <td className="px-1.5 sm:px-2.5 py-2.5 text-right font-mono text-foreground blur-number whitespace-nowrap text-xs sm:text-sm">{formatCurrency(b.budgeted)}</td>
                            <td className="px-1.5 sm:px-2.5 py-2.5 text-right font-mono text-foreground blur-number whitespace-nowrap text-xs sm:text-sm">{formatCurrency(b.actual)}</td>
                            {showVarianceCol && (
                              <td className={`px-1.5 sm:px-2.5 py-2.5 text-right font-mono blur-number font-medium whitespace-nowrap text-xs sm:text-sm ${isOver ? 'text-destructive' : b.remaining > 0 ? 'text-constructive' : 'text-muted-foreground'}`}>
                                {formatCurrency(b.remaining)}
                              </td>
                            )}
                            {showProgressCol && (
                              <td className="px-1.5 sm:px-2.5 py-2.5 whitespace-nowrap overflow-hidden">
                                <div className="flex items-center gap-1 sm:gap-1.5 min-w-0">
                                  <div className="w-10 sm:w-14 h-1.5 bg-muted/80 rounded-full overflow-hidden shrink">
                                    <div className={`h-full ${progressColor} rounded-full transition-all`} style={{ width: `${Math.min(Math.max(b.percentUsed || 0, 0), 100)}%` }} />
                                  </div>
                                  <span className={`text-[10px] font-mono shrink-0 ${isOver ? 'text-destructive font-medium' : 'text-muted-foreground'}`}>
                                    {(b.percentUsed || 0).toFixed(0)}%
                                  </span>
                                </div>
                              </td>
                            )}
                            {showAccountCol && (
                              <td className="px-1.5 sm:px-2.5 py-2.5 text-xs text-muted-foreground/50 truncate">
                                &mdash;
                              </td>
                            )}
                            <td className="px-1.5 sm:px-2 py-2.5 text-right whitespace-nowrap">
                              <div className="flex items-center justify-end gap-0.5 sm:gap-1">
                                <button onClick={() => { setEditBudget(b); setShowForm(true); }} className="p-1 rounded hover:bg-accent text-muted-foreground">
                                  <Pencil className="w-3.5 h-3.5" />
                                </button>
                                <button onClick={() => setDeleteBudget(b)} className="p-1 rounded hover:bg-accent text-muted-foreground hover:text-destructive">
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </td>
                          </tr>

                          {/* Everything Else Desktop Catch-All Breakout expandable sub-row */}
                          {isEE && expandedCatchAll && b.groupedBreakout && (
                            <tr className="bg-muted/15 border-b border-border/80">
                              <td colSpan={activeColCount} className="px-4 sm:px-6 py-3.5">
                                <div className="rounded-xl bg-muted/30 border border-border/60 p-3 sm:p-4 space-y-3">
                                  <div className="flex items-center justify-between px-0.5">
                                    <span className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                                      <Layers className="w-3.5 h-3.5 text-primary" />
                                      Unbudgeted Categories
                                      <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-muted/80 text-muted-foreground">
                                        {b.groupedBreakout.length}
                                      </span>
                                    </span>
                                    <span className="text-xs font-mono font-medium text-muted-foreground">
                                      Total: <span className="text-foreground blur-number font-semibold">{formatCurrency(b.actual)}</span>
                                    </span>
                                  </div>
                                  {b.groupedBreakout.length === 0 ? (
                                    <div className="p-3 text-xs text-muted-foreground italic bg-background/60 rounded-lg border border-border/40 text-center">
                                      No unbudgeted category spending in this period.
                                    </div>
                                  ) : (
                                    <div className="grid grid-cols-[repeat(auto-fit,minmax(280px,1fr))] gap-2.5">
                                      {b.groupedBreakout.map((item) => (
                                        <div
                                          key={item.categoryId}
                                          className="group/cat flex items-center justify-between px-3.5 py-2.5 rounded-xl bg-card border border-border/70 hover:border-border hover:shadow-xs transition-all text-xs gap-3 min-w-0"
                                        >
                                          <div className="flex items-center gap-2.5 min-w-0 flex-1">
                                            <div
                                              className="w-2.5 h-2.5 rounded-full shrink-0 shadow-xs"
                                              style={{ backgroundColor: item.categoryColor || '#6366f1' }}
                                            />
                                            <Link
                                              href={`/transactions?categoryId=${item.categoryId}&startDate=${startDate}&endDate=${endDate}`}
                                              className="font-medium text-foreground text-sm truncate hover:text-primary hover:underline transition-colors min-w-0 block"
                                              title={item.categoryName}
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
                                          <div className="flex items-center gap-2.5 shrink-0">
                                            <span className="font-mono text-sm font-semibold text-foreground blur-number">
                                              {formatCurrency(item.actual)}
                                            </span>
                                            <TooltipProvider delayDuration={150}>
                                              <Tooltip>
                                                <TooltipTrigger asChild>
                                                  <button
                                                    type="button"
                                                    onClick={() => handleConvertToBudget(item)}
                                                    disabled={convertingCatId === item.categoryId}
                                                    aria-label={`Convert ${item.categoryName} to standalone budget`}
                                                    className="inline-flex items-center justify-center w-7 h-7 rounded-lg bg-primary/10 hover:bg-primary text-primary hover:text-primary-foreground transition-all duration-150 active:scale-95 disabled:opacity-50 disabled:pointer-events-none cursor-pointer focus:outline-none focus:ring-1 focus:ring-primary shrink-0"
                                                  >
                                                    {convertingCatId === item.categoryId ? (
                                                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                                    ) : (
                                                      <Plus className="w-4 h-4" />
                                                    )}
                                                  </button>
                                                </TooltipTrigger>
                                                <TooltipContent side="top" className="text-xs">
                                                  Convert &ldquo;{item.categoryName}&rdquo; to standalone budget ({formatCurrency(Math.max(1, Math.round(item.actual)))}/mo)
                                                </TooltipContent>
                                              </Tooltip>
                                            </TooltipProvider>
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
          );
        })()}
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
          periodType: editBudget.nativePeriodType || editBudget.periodType,
          periodKey: editBudget.periodKey || editBudget.yearMonth || null,
          amount: String(editBudget.nativeAmount !== undefined ? editBudget.nativeAmount : (editBudget.monthlyAmount ?? editBudget.budgeted)),
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

      <BudgetExclusionsDialog
        open={showExclusionsDialog}
        onClose={() => setShowExclusionsDialog(false)}
      />
    </>
  );
}
