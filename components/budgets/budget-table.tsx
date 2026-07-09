'use client';

import { useState, useEffect, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useBudgetPeriod } from './budget-period-selector';
import { BudgetFormDialog } from './budget-form-dialog';
import { formatCurrency } from '@/lib/utils/format';
import { Plus, Pencil, Trash2, RotateCcw, Landmark, ArrowUpCircle } from 'lucide-react';
import { AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { ChartEmptyState } from '@/components/charts/chart-empty-state';
import { useUserSettings } from '@/components/user-settings-provider';

interface BudgetData {
  id: string;
  categoryId: string;
  categoryName: string;
  categoryColor: string;
  periodType: string;
  isRecurring: boolean;
  fundingAccountId: string | null;
  rollover: boolean;
  notes: string | null;
  budgeted: number;
  actual: number;
  remaining: number;
  percentUsed: number;
  type: 'income' | 'expense';
}

interface Account {
  id: string;
  name: string;
  tags?: { id: string; name: string; color: string }[];
}

interface Category {
  id: string;
  name: string;
  isIncome?: boolean;
  color?: string;
  parentId?: string | null;
}

export function BudgetTable() {
  const queryClient = useQueryClient();
  const settingsContext = useUserSettings();
  const showBudgetTags = settingsContext?.settings?.accountTagVisibility?.budgets !== false;
  const { periodType, periodKey } = useBudgetPeriod();
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  const { data, isLoading: loading, error: queryError, refetch } = useQuery({
    queryKey: ['budgets', periodType, periodKey],
    queryFn: async () => {
      const [budgetRes, acctRes] = await Promise.all([
        fetch(`/api/budgets?periodType=${periodType}&periodKey=${periodKey}&includeCategories=true`, { credentials: 'include' }),
        fetch('/api/accounts', { credentials: 'include' }),
      ]);
      if (!budgetRes.ok) throw new Error('Failed to fetch budgets');
      const resData = await budgetRes.json();
      const accountsData = acctRes.ok ? await acctRes.json() : [];
      return {
        budgets: resData.budgets ?? [],
        categories: resData.categories ?? [],
        accounts: accountsData,
      };
    },
  });

  const budgets = data?.budgets ?? [];
  const categories = data?.categories ?? [];
  const accounts = data?.accounts ?? [];
  const error = queryError ? (queryError instanceof Error ? queryError.message : String(queryError)) : null;

  const [showForm, setShowForm] = useState(false);
  const [editBudget, setEditBudget] = useState<BudgetData | null>(null);
  const [deleteBudget, setDeleteBudget] = useState<BudgetData | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  const fetchBudgets = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['budgets'] });
  }, [queryClient]);

  const handleDelete = async () => {
    if (!deleteBudget) return;
    setDeleteLoading(true);
    try {
      await fetch(`/api/budgets/${deleteBudget.id}`, { method: 'DELETE', credentials: 'include' });
      setDeleteBudget(null);
      queryClient.invalidateQueries({ queryKey: ['budgets'] });
    } catch {} finally {
      setDeleteLoading(false);
    }
  };

  const getAccountName = (id: string | null) => accounts.find((a) => a.id === id)?.name;

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

  const incomeBudgets = budgets.filter((b) => b.type === 'income').sort((a, b) => a.categoryName.localeCompare(b.categoryName));
  const expenseBudgets = budgets.filter((b) => b.type === 'expense').sort((a, b) => a.percentUsed - b.percentUsed);

  return (
    <>
      <div className="bg-card border border-border rounded-xl shadow-sm">
        <div className="p-3 sm:p-5 pb-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-foreground">Budget Items</h3>
          <button
            onClick={() => { setEditBudget(null); setShowForm(true); }}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-primary-foreground bg-primary rounded-lg hover:opacity-90 transition-all"
          >
            <Plus className="w-3.5 h-3.5" />
            Add Budget
          </button>
        </div>

        {budgets.length === 0 ? (
          <div className="h-[200px]">
            <ChartEmptyState variant="nodata" description="No budgets set for this period" />
          </div>
        ) : isMobile ? (
          <div className="divide-y divide-border">
            {incomeBudgets.length > 0 && (
              <div className="px-4 py-2 bg-chart-2/5 text-xs font-semibold text-chart-2 uppercase tracking-wider">Income</div>
            )}
            {incomeBudgets.map((b) => {
              const isOver = b.remaining < 0;
              return (
                <div key={b.id} className="px-4 py-3 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      <div className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ backgroundColor: b.categoryColor }} />
                      <span className="text-foreground font-medium text-sm truncate">{b.categoryName}</span>
                      <ArrowUpCircle className="w-3 h-3 text-chart-2 flex-shrink-0" />
                    </div>
                    <div className="flex items-center gap-0.5 flex-shrink-0">
                      <button
                        onClick={() => { setEditBudget(b); setShowForm(true); }}
                        className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => setDeleteBudget(b)}
                        className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-destructive transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                  {b.notes && <div className="text-[10px] text-muted-foreground">{b.notes}</div>}
                  <div className="flex items-center justify-between text-xs font-mono">
                    <span className="text-muted-foreground">Budget: <span className="text-foreground blur-number">{formatCurrency(b.budgeted)}</span></span>
                    <span className="text-muted-foreground">Actual: <span className="text-chart-2 blur-number">{formatCurrency(b.actual)}</span></span>
                    <span className={`blur-number ${isOver ? 'text-destructive' : 'text-chart-2'}`}>
                      {b.remaining >= 0 ? '+' : ''}{formatCurrency(b.remaining)}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 pt-0.5">
                    <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                      <div className={`h-full ${isOver ? 'bg-chart-2' : 'bg-chart-3'} rounded-full transition-all`} style={{ width: `${Math.min(Math.max(b.percentUsed || 0, 0), 100)}%` }} />
                    </div>
                    <span className={`text-[10px] font-mono flex-shrink-0 ${isOver ? 'text-chart-2' : 'text-muted-foreground'}`}>
                      {(b.percentUsed || 0).toFixed(0)}%
                    </span>
                    {b.fundingAccountId ? (() => {
                      const account = accounts.find((a) => a.id === b.fundingAccountId);
                      return account ? (
                        <div className="flex items-center gap-1 text-xs text-muted-foreground flex-shrink-0">
                          <Landmark className="w-3 h-3" />
                          <span className="truncate max-w-[80px]" title={account.name}>{account.name}</span>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1 text-xs text-muted-foreground flex-shrink-0">
                          <Landmark className="w-3 h-3" />
                          {getAccountName(b.fundingAccountId)}
                        </div>
                      );
                    })() : null}
                  </div>
                </div>
              );
            })}
            {expenseBudgets.length > 0 && (
              <div className="px-4 py-2 bg-destructive/5 text-xs font-semibold text-destructive uppercase tracking-wider">Expenses</div>
            )}
            {expenseBudgets.map((b) => {
              const isOver = b.remaining < 0;
              const progressColor = isOver ? 'bg-destructive' : b.percentUsed > 80 ? 'bg-chart-3' : 'bg-chart-2';
              return (
                <div key={b.id} className="px-4 py-3 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      <div className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ backgroundColor: b.categoryColor }} />
                      <span className="text-foreground font-medium text-sm truncate">{b.categoryName}</span>
                      {b.rollover && <RotateCcw className="w-3 h-3 text-muted-foreground/50 flex-shrink-0" />}
                    </div>
                    <div className="flex items-center gap-0.5 flex-shrink-0">
                      <button
                        onClick={() => { setEditBudget(b); setShowForm(true); }}
                        className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => setDeleteBudget(b)}
                        className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-destructive transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                  {b.notes && <div className="text-[10px] text-muted-foreground">{b.notes}</div>}
                  <div className="flex items-center justify-between text-xs font-mono">
                    <span className="text-muted-foreground">Budget: <span className="text-foreground blur-number">{formatCurrency(b.budgeted)}</span></span>
                    <span className="text-muted-foreground">Actual: <span className="text-foreground blur-number">{formatCurrency(b.actual)}</span></span>
                    <span className={`blur-number ${isOver ? 'text-destructive' : b.remaining > 0 ? 'text-chart-2' : 'text-muted-foreground'}`}>
                      {formatCurrency(b.remaining)}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 pt-0.5">
                    <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                      <div className={`h-full ${progressColor} rounded-full transition-all`} style={{ width: `${Math.min(Math.max(b.percentUsed || 0, 0), 100)}%` }} />
                    </div>
                    <span className={`text-[10px] font-mono flex-shrink-0 ${isOver ? 'text-destructive' : 'text-muted-foreground'}`}>
                      {(b.percentUsed || 0).toFixed(0)}%
                    </span>
                    {b.fundingAccountId ? (() => {
                      const account = accounts.find((a) => a.id === b.fundingAccountId);
                      return account ? (
                        <div className="flex items-center gap-1 text-xs text-muted-foreground flex-shrink-0">
                          <Landmark className="w-3 h-3" />
                          <span className="truncate max-w-[80px]" title={account.name}>{account.name}</span>
                          {showBudgetTags && account.tags && account.tags.length > 0 && (
                            <div className="flex items-center gap-1">
                              {account.tags.map((tag) => (
                                <span
                                  key={tag.id}
                                  className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                                  style={{ backgroundColor: tag.color }}
                                  title={tag.name}
                                />
                              ))}
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className="flex items-center gap-1 text-xs text-muted-foreground flex-shrink-0">
                          <Landmark className="w-3 h-3" />
                          {getAccountName(b.fundingAccountId)}
                        </div>
                      );
                    })() : null}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[650px] md:min-w-full">
              <thead>
                <tr className="border-t border-border">
                  <th className="text-left px-5 py-2.5 text-xs font-medium text-muted-foreground">Category</th>
                  <th className="text-right px-4 py-2.5 text-xs font-medium text-muted-foreground">Budgeted</th>
                  <th className="text-right px-4 py-2.5 text-xs font-medium text-muted-foreground">{'Actual'}</th>
                  <th className="text-right px-4 py-2.5 text-xs font-medium text-muted-foreground">Variance</th>
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">Progress</th>
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">Account</th>
                  <th className="text-right px-4 py-2.5 text-xs font-medium text-muted-foreground">Actions</th>
                </tr>
              </thead>
              <tbody className="border-t border-border">
                {incomeBudgets.length > 0 && (
                  <tr className="bg-chart-2/5">
                    <td colSpan={7} className="px-5 py-2 text-xs font-semibold text-chart-2 uppercase tracking-wider">Income</td>
                  </tr>
                )}
                {incomeBudgets.map((b) => {
                  const isOver = b.remaining < 0;
                  return (
                    <tr key={b.id} className="border-b border-border hover:bg-muted/30 transition-colors">
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-2">
                          <div className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ backgroundColor: b.categoryColor }} />
                          <span className="text-foreground font-medium">{b.categoryName}</span>
                          <ArrowUpCircle className="w-3 h-3 text-chart-2" />
                        </div>
                        {b.notes && <div className="text-[10px] text-muted-foreground mt-0.5 ml-4">{b.notes}</div>}
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-foreground blur-number">{formatCurrency(b.budgeted)}</td>
                      <td className="px-4 py-3 text-right font-mono text-chart-2 blur-number">{formatCurrency(b.actual)}</td>
                      <td className={`px-4 py-3 text-right font-mono blur-number ${isOver ? 'text-destructive' : 'text-chart-2'}`}>
                        {b.remaining >= 0 ? '+' : ''}{formatCurrency(b.remaining)}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div className="w-20 h-1.5 bg-muted rounded-full overflow-hidden">
                            <div className={`h-full ${isOver ? 'bg-chart-2' : 'bg-chart-3'} rounded-full transition-all`} style={{ width: `${Math.min(Math.max(b.percentUsed || 0, 0), 100)}%` }} />
                          </div>
                          <span className={`text-[10px] font-mono ${isOver ? 'text-chart-2' : 'text-muted-foreground'}`}>
                            {(b.percentUsed || 0).toFixed(0)}%
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        {b.fundingAccountId ? (() => {
                          const account = accounts.find((a) => a.id === b.fundingAccountId);
                          return account ? (
                            <div className="flex items-center gap-1 text-xs text-muted-foreground">
                              <Landmark className="w-3 h-3 flex-shrink-0" />
                              <span className="truncate" title={account.name}>{account.name}</span>
                              {showBudgetTags && account.tags && account.tags.length > 0 && (
                                <div className="flex items-center gap-1 flex-shrink-0">
                                  {account.tags.map((tag) => (
                                    <span
                                      key={tag.id}
                                      className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                                      style={{ backgroundColor: tag.color }}
                                      title={tag.name}
                                    />
                                  ))}
                                </div>
                              )}
                            </div>
                          ) : (
                            <div className="flex items-center gap-1 text-xs text-muted-foreground">
                              <Landmark className="w-3 h-3" />
                              {getAccountName(b.fundingAccountId)}
                            </div>
                          );
                        })() : (
                          <span className="text-xs text-muted-foreground/50">&mdash;</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => { setEditBudget(b); setShowForm(true); }}
                            className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => setDeleteBudget(b)}
                            className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-destructive transition-colors"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {expenseBudgets.length > 0 && (
                  <tr className="bg-destructive/5">
                    <td colSpan={7} className="px-5 py-2 text-xs font-semibold text-destructive uppercase tracking-wider">Expenses</td>
                  </tr>
                )}
                {expenseBudgets.map((b) => {
                  const isOver = b.remaining < 0;
                  const progressColor = isOver ? 'bg-destructive' : b.percentUsed > 80 ? 'bg-chart-3' : 'bg-chart-2';
                  return (
                    <tr key={b.id} className="border-b border-border hover:bg-muted/30 transition-colors">
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-2">
                          <div className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ backgroundColor: b.categoryColor }} />
                          <span className="text-foreground font-medium">{b.categoryName}</span>
                          {b.rollover && <RotateCcw className="w-3 h-3 text-muted-foreground/50" />}
                        </div>
                        {b.notes && <div className="text-[10px] text-muted-foreground mt-0.5 ml-4">{b.notes}</div>}
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-foreground blur-number">{formatCurrency(b.budgeted)}</td>
                      <td className="px-4 py-3 text-right font-mono text-foreground blur-number">{formatCurrency(b.actual)}</td>
                      <td className={`px-4 py-3 text-right font-mono blur-number ${isOver ? 'text-destructive' : b.remaining > 0 ? 'text-chart-2' : 'text-muted-foreground'}`}>
                        {formatCurrency(b.remaining)}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div className="w-20 h-1.5 bg-muted rounded-full overflow-hidden">
                            <div className={`h-full ${progressColor} rounded-full transition-all`} style={{ width: `${Math.min(Math.max(b.percentUsed || 0, 0), 100)}%` }} />
                          </div>
                          <span className={`text-[10px] font-mono ${isOver ? 'text-destructive' : 'text-muted-foreground'}`}>
                            {(b.percentUsed || 0).toFixed(0)}%
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        {b.fundingAccountId ? (() => {
                          const account = accounts.find((a) => a.id === b.fundingAccountId);
                          return account ? (
                            <div className="flex items-center gap-1 text-xs text-muted-foreground">
                              <Landmark className="w-3 h-3 flex-shrink-0" />
                              <span className="truncate" title={account.name}>{account.name}</span>
                              {showBudgetTags && account.tags && account.tags.length > 0 && (
                                <div className="flex items-center gap-1 flex-shrink-0">
                                  {account.tags.map((tag) => (
                                    <span
                                      key={tag.id}
                                      className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                                      style={{ backgroundColor: tag.color }}
                                      title={tag.name}
                                    />
                                  ))}
                                </div>
                              )}
                            </div>
                          ) : (
                            <div className="flex items-center gap-1 text-xs text-muted-foreground">
                              <Landmark className="w-3 h-3" />
                              {getAccountName(b.fundingAccountId)}
                            </div>
                          );
                        })() : (
                          <span className="text-xs text-muted-foreground/50">&mdash;</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => { setEditBudget(b); setShowForm(true); }}
                            className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => setDeleteBudget(b)}
                            className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-destructive transition-colors"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
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
          amount: String(editBudget.budgeted),
          isRecurring: editBudget.isRecurring,
          fundingAccountId: editBudget.fundingAccountId,
          rollover: editBudget.rollover,
          notes: editBudget.notes,
        } : undefined}
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
    </>
  );
}
