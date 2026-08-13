'use client';

import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { useBudgetPeriod, type PeriodType } from './budget-period-selector';
import { CategoryCombobox } from './category-combobox';

interface Category {
  id: string;
  name: string;
  color?: string;
  isIncome?: boolean;
  parentId?: string | null;
  isDiscretionary?: boolean;
}

interface Account {
  id: string;
  name: string;
  type: string;
}

interface BudgetFormData {
  categoryId: string;
  periodType: PeriodType;
  amount: string;
  isRecurring: boolean;
  periodKey: string;
  fundingAccountId: string;
  rollover: boolean;
  notes: string;
  isDiscretionary: boolean;
  applyMode: 'future' | 'all';
}

interface BudgetFormDialogProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
  categories: Category[];
  editBudget?: {
    id: string;
    categoryId: string;
    periodType: string;
    periodKey?: string | null;
    amount: string;
    isRecurring: boolean;
    fundingAccountId: string | null;
    rollover: boolean;
    notes: string | null;
    isDiscretionary?: boolean;
  };
}

export function BudgetFormDialog({ open, onClose, onSuccess, categories, editBudget }: BudgetFormDialogProps) {
  const { periodType: activePeriodType, periodKey } = useBudgetPeriod();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [form, setForm] = useState<BudgetFormData>({
    categoryId: '',
    periodType: activePeriodType || 'monthly',
    amount: '',
    isRecurring: true,
    periodKey,
    fundingAccountId: '',
    rollover: false,
    notes: '',
    isDiscretionary: true,
    applyMode: 'future',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    const fetchData = async () => {
      const res = await fetch('/api/accounts', { credentials: 'include' });
      if (res.ok) {
        const allAccts = await res.json();
        setAccounts(allAccts.filter((a: Account) => ['checking', 'savings'].includes(a.type)));
      }
    };
    fetchData();

    if (editBudget) {
      const cat = categories.find((c) => c.id === editBudget.categoryId);
      setForm({
        categoryId: editBudget.categoryId,
        periodType: editBudget.periodType as PeriodType,
        amount: editBudget.amount,
        isRecurring: editBudget.isRecurring,
        periodKey: editBudget.periodKey ?? periodKey,
        fundingAccountId: editBudget.fundingAccountId ?? '',
        rollover: editBudget.rollover,
        notes: editBudget.notes ?? '',
        isDiscretionary: editBudget.isDiscretionary ?? cat?.isDiscretionary ?? true,
        applyMode: 'future',
      });
    } else {
      setForm({
        categoryId: '',
        periodType: activePeriodType || 'monthly',
        amount: '',
        isRecurring: true,
        periodKey,
        fundingAccountId: '',
        rollover: false,
        notes: '',
        isDiscretionary: true,
        applyMode: 'future',
      });
    }
    setError('');
  }, [open, editBudget, periodKey, activePeriodType, categories]);

  const handleSave = async () => {
    if (!form.categoryId || !form.amount) {
      setError('Category and amount are required');
      return;
    }
    const numAmount = parseFloat(form.amount);
    if (isNaN(numAmount) || numAmount <= 0) {
      setError('Amount must be a positive number');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const body = {
        categoryId: form.categoryId,
        periodType: form.periodType,
        amount: parseFloat(form.amount),
        isRecurring: form.isRecurring,
        periodKey: periodKey,
        fundingAccountId: form.fundingAccountId || null,
        rollover: form.rollover,
        notes: form.notes || null,
        isDiscretionary: form.isDiscretionary,
        applyMode: form.applyMode,
      };

      const url = editBudget ? `/api/budgets/${editBudget.id}` : '/api/budgets';
      const res = await fetch(url, {
        method: editBudget ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        let errorMessage = 'Failed to save budget';
        try {
          const data = await res.json();
          if (data.message || data.error) errorMessage = data.message || data.error;
        } catch {
          errorMessage = `Failed to save budget (${res.status} ${res.statusText})`;
        }
        throw new Error(errorMessage);
      }
      onSuccess();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-md max-h-[90dvh] sm:max-h-[85vh] flex flex-col">
        <DialogHeader className="shrink-0">
          <DialogTitle>{editBudget ? 'Edit Budget' : 'Add Budget'}</DialogTitle>
          <DialogDescription>
            {editBudget ? 'Update the budget details.' : 'Create a new budget for a category starting from the current period forward.'}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 flex-1 overflow-y-auto min-h-0 pr-1 pb-2">
          {error && (
            <div className="p-3 bg-destructive/20 border border-destructive/30 rounded-lg">
              <p className="text-destructive text-sm">{error}</p>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-foreground mb-1">Category</label>
            <CategoryCombobox
              categories={categories}
              value={form.categoryId}
              onSelect={(id) => {
                const cat = categories.find((c) => c.id === id);
                setForm((f) => ({
                  ...f,
                  categoryId: id,
                  isDiscretionary: cat?.isDiscretionary !== undefined ? cat.isDiscretionary : f.isDiscretionary,
                }));
              }}
              disabled={saving}
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Expense Type</label>
            <div className="grid grid-cols-2 gap-2 p-1 bg-muted/30 rounded-lg border border-border/60">
              <button
                type="button"
                onClick={() => setForm((f) => ({ ...f, isDiscretionary: false }))}
                className={`py-1.5 px-3 text-xs font-bold rounded-md transition-all ${
                  !form.isDiscretionary ? 'bg-primary text-primary-foreground shadow-xs' : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                Fixed (Essential)
              </button>
              <button
                type="button"
                onClick={() => setForm((f) => ({ ...f, isDiscretionary: true }))}
                className={`py-1.5 px-3 text-xs font-bold rounded-md transition-all ${
                  form.isDiscretionary ? 'bg-primary text-primary-foreground shadow-xs' : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                Discretionary
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">Period</label>
              <select
                value={form.periodType}
                onChange={(e) => setForm((f) => ({ ...f, periodType: e.target.value as PeriodType }))}
                className="w-full px-3 py-2 bg-background border border-input rounded-lg text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="monthly">Monthly</option>
                <option value="quarterly">Quarterly</option>
                <option value="yearly">Yearly</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">Amount</label>
              <Input
                type="number"
                step="1"
                value={form.amount}
                onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
                placeholder="e.g., 400"
              />
            </div>
          </div>

          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={form.isRecurring}
                onChange={(e) => setForm((f) => ({ ...f, isRecurring: e.target.checked }))}
                className="w-4 h-4 rounded border-border bg-background text-primary cursor-pointer"
              />
              <span className="text-sm text-foreground/80">Recurring</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={form.rollover}
                onChange={(e) => setForm((f) => ({ ...f, rollover: e.target.checked }))}
                className="w-4 h-4 rounded border-border bg-background text-primary cursor-pointer"
              />
              <span className="text-sm text-foreground/80">Rollover unused</span>
            </label>
          </div>

          {editBudget && form.isRecurring && (
            <div>
              <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Apply Changes Scope</label>
              <div className="space-y-1.5">
                <label className="flex items-center gap-2 cursor-pointer text-xs text-foreground">
                  <input
                    type="radio"
                    name="applyMode"
                    value="future"
                    checked={form.applyMode === 'future'}
                    onChange={() => setForm((f) => ({ ...f, applyMode: 'future' }))}
                    className="text-primary"
                  />
                  <span>Apply from {periodKey} forward (preserves historical period figures)</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer text-xs text-foreground">
                  <input
                    type="radio"
                    name="applyMode"
                    value="all"
                    checked={form.applyMode === 'all'}
                    onChange={() => setForm((f) => ({ ...f, applyMode: 'all' }))}
                    className="text-primary"
                  />
                  <span>Apply to all past and future periods</span>
                </label>
              </div>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-foreground mb-1">Funding Account (optional)</label>
            <select
              value={form.fundingAccountId}
              onChange={(e) => setForm((f) => ({ ...f, fundingAccountId: e.target.value }))}
              className="w-full px-3 py-2 bg-background border border-input rounded-lg text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            >
              <option value="">No specific account</option>
              {accounts.map((acct) => (
                <option key={acct.id} value={acct.id}>{acct.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-foreground mb-1">Notes (optional)</label>
            <Input
              value={form.notes}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              placeholder="e.g., Includes weekly takeout"
            />
          </div>
        </div>
        <DialogFooter>
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-foreground bg-muted hover:bg-accent rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-2 text-sm font-semibold text-primary-foreground bg-primary rounded-lg hover:opacity-90 disabled:opacity-50 transition-all"
          >
            {saving ? 'Saving...' : editBudget ? 'Save Changes' : 'Add Budget'}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
