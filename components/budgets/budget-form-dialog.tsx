'use client';

import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { useBudgetPeriod, type PeriodType } from './budget-period-selector';

interface Category {
  id: string;
  name: string;
  color: string;
  isIncome?: boolean;
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
}

interface BudgetFormDialogProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
  editBudget?: {
    id: string;
    categoryId: string;
    periodType: string;
    amount: string;
    isRecurring: boolean;
    fundingAccountId: string | null;
    rollover: boolean;
    notes: string | null;
  };
}

export function BudgetFormDialog({ open, onClose, onSuccess, editBudget }: BudgetFormDialogProps) {
  const { periodKey } = useBudgetPeriod();
  const [categories, setCategories] = useState<Category[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [form, setForm] = useState<BudgetFormData>({
    categoryId: '',
    periodType: 'monthly',
    amount: '',
    isRecurring: true,
    periodKey,
    fundingAccountId: '',
    rollover: false,
    notes: '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    const fetchData = async () => {
      const [catRes, acctRes] = await Promise.all([
        fetch('/api/categories', { credentials: 'include' }),
        fetch('/api/accounts', { credentials: 'include' }),
      ]);
      if (catRes.ok) setCategories(await catRes.json());
      if (acctRes.ok) {
        const allAccts = await acctRes.json();
        setAccounts(allAccts.filter((a: Account) => ['checking', 'savings'].includes(a.type)));
      }
    };
    fetchData();

    if (editBudget) {
      setForm({
        categoryId: editBudget.categoryId,
        periodType: editBudget.periodType as PeriodType,
        amount: editBudget.amount,
        isRecurring: editBudget.isRecurring,
        periodKey,
        fundingAccountId: editBudget.fundingAccountId ?? '',
        rollover: editBudget.rollover,
        notes: editBudget.notes ?? '',
      });
    } else {
      setForm({
        categoryId: '',
        periodType: 'monthly',
        amount: '',
        isRecurring: true,
        periodKey,
        fundingAccountId: '',
        rollover: false,
        notes: '',
      });
    }
    setError('');
  }, [open, editBudget, periodKey]);

  const handleSave = async () => {
    if (!form.categoryId || !form.amount) {
      setError('Category and amount are required');
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
        periodKey: form.isRecurring ? null : form.periodKey,
        fundingAccountId: form.fundingAccountId || null,
        rollover: form.rollover,
        notes: form.notes || null,
      };

      const url = editBudget ? `/api/budgets?id=${editBudget.id}` : '/api/budgets';
      const res = await fetch(url, {
        method: editBudget ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message || 'Failed to save budget');
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
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{editBudget ? 'Edit Budget' : 'Add Budget'}</DialogTitle>
          <DialogDescription>
            {editBudget ? 'Update the budget details.' : 'Create a new budget for a category.'}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          {error && (
            <div className="p-3 bg-destructive/20 border border-destructive/30 rounded-lg">
              <p className="text-destructive text-sm">{error}</p>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-foreground mb-1">Category</label>
            <select
              value={form.categoryId}
              onChange={(e) => setForm((f) => ({ ...f, categoryId: e.target.value }))}
              className="w-full px-3 py-2 bg-background border border-input rounded-lg text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            >
              <option value="">Select a category</option>
              {categories.map((cat) => (
                <option key={cat.id} value={cat.id}>
                  {cat.name} {cat.isIncome ? '(Income)' : '(Expense)'}
                </option>
              ))}
            </select>
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
                step="0.01"
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
