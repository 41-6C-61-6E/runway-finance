'use client';

import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { AlertTriangle } from 'lucide-react';

interface GoalFormData {
  name: string;
  description: string;
  type: string;
  targetAmount: string;
  currentAmount: string;
  targetDate: string;
  category: string;
  status: string;
  linkedAccountId: string;
  percentage: string;
  reserve: string;
  sortOrder: number;
}

interface GoalFormDialogProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
  editGoal?: {
    id: string;
    name: string;
    description: string | null;
    type: string;
    targetAmount: string;
    currentAmount: string;
    targetDate: string | null;
    category: string | null;
    status: string;
    linkedAccountId: string | null;
    percentage: string;
    reserve: string;
    sortOrder: number;
  };
}

interface Account {
  id: string;
  name: string;
  type: string;
  balance: string;
}

const goalTypes = [
  { value: 'savings', label: 'Savings' },
  { value: 'payoff', label: 'Payoff' },
  { value: 'investment', label: 'Investment' },
  { value: 'other', label: 'Other' },
];

const statuses = [
  { value: 'active', label: 'Active' },
  { value: 'paused', label: 'Paused' },
  { value: 'completed', label: 'Completed' },
];

export function GoalFormDialog({ open, onClose, onSuccess, editGoal }: GoalFormDialogProps) {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [form, setForm] = useState<GoalFormData>({
    name: '',
    description: '',
    type: 'savings',
    targetAmount: '',
    currentAmount: '0',
    targetDate: '',
    category: '',
    status: 'active',
    linkedAccountId: '',
    percentage: '100',
    reserve: '0',
    sortOrder: 0,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [sharedAccountWarning, setSharedAccountWarning] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;

    const fetchAccounts = async () => {
      try {
        const res = await fetch('/api/accounts', { credentials: 'include' });
        if (res.ok) {
          const data = await res.json();
          setAccounts(data.filter((a: Account) => a.type !== 'credit'));
        }
      } catch {}
    };

    fetchAccounts();

    if (editGoal) {
      setForm({
        name: editGoal.name,
        description: editGoal.description || '',
        type: editGoal.type,
        targetAmount: editGoal.targetAmount,
        currentAmount: editGoal.currentAmount,
        targetDate: editGoal.targetDate || '',
        category: editGoal.category || '',
        status: editGoal.status,
        linkedAccountId: editGoal.linkedAccountId || '',
        percentage: editGoal.percentage || '100',
        reserve: editGoal.reserve || '0',
        sortOrder: editGoal.sortOrder ?? 0,
      });
    } else {
      setForm({
        name: '',
        description: '',
        type: 'savings',
        targetAmount: '',
        currentAmount: '0',
        targetDate: '',
        category: '',
        status: 'active',
        linkedAccountId: '',
        percentage: '100',
        reserve: '0',
        sortOrder: 0,
      });
    }
    setError('');
    setSharedAccountWarning(null);
  }, [open, editGoal]);

  // Check for shared account when linked account changes
  useEffect(() => {
    if (!form.linkedAccountId || !open) {
      setSharedAccountWarning(null);
      return;
    }

    const checkSharedAccount = async () => {
      try {
        const res = await fetch('/api/goals/allocation', { credentials: 'include' });
        if (res.ok) {
          const data = await res.json();
          const shared = data.sharedAccounts?.find(
            (s: { accountId: string }) => s.accountId === form.linkedAccountId
          );
          if (shared) {
            setSharedAccountWarning(
              `This account is linked to ${shared.goalCount} active goals. Funds will be allocated by order.`
            );
          } else {
            setSharedAccountWarning(null);
          }
        }
      } catch {
        // ignore
      }
    };

    checkSharedAccount();
  }, [form.linkedAccountId, open]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name || !form.targetAmount) {
      setError('Name and target amount are required');
      return;
    }

    setSaving(true);
    setError('');

    try {
      const url = editGoal
        ? `/api/financial-goals?id=${editGoal.id}`
        : '/api/financial-goals';

      const method = editGoal ? 'PATCH' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          id: editGoal?.id,
          ...form,
          targetAmount: parseFloat(form.targetAmount),
          currentAmount: parseFloat(form.currentAmount) || 0,
          sortOrder: Number(form.sortOrder),
          targetDate: form.targetDate || null,
          linkedAccountId: form.linkedAccountId || null,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to save goal');
      }

      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save goal');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{editGoal ? 'Edit Goal' : 'Create New Goal'}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Name */}
          <div className="space-y-1.5">
            <Label htmlFor="goal-name">Goal Name</Label>
            <Input
              id="goal-name"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="e.g., Emergency Fund"
              required
            />
          </div>

          {/* Description */}
          <div className="space-y-1.5">
            <Label htmlFor="goal-desc">Description</Label>
            <Input
              id="goal-desc"
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder="Why are you saving for this?"
            />
          </div>

          {/* Type */}
          <div className="space-y-1.5">
            <Label htmlFor="goal-type">Type</Label>
            <select
              id="goal-type"
              value={form.type}
              onChange={(e) => setForm({ ...form, type: e.target.value })}
              className="w-full px-3 py-2 rounded-lg border border-border bg-background text-foreground text-sm"
            >
              {goalTypes.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </div>

          {/* Target Amount */}
          <div className="space-y-1.5">
            <Label htmlFor="goal-target">Target Amount</Label>
            <Input
              id="goal-target"
              type="number"
              step="0.01"
              min="0"
              value={form.targetAmount}
              onChange={(e) => setForm({ ...form, targetAmount: e.target.value })}
              placeholder="0"
              required
            />
          </div>

          {/* Current Amount (manual entry, shown when no linked account) */}
          {!form.linkedAccountId && (
            <div className="space-y-1.5">
              <Label htmlFor="goal-current">Current Amount</Label>
              <Input
                id="goal-current"
                type="number"
                step="0.01"
                min="0"
                value={form.currentAmount}
                onChange={(e) => setForm({ ...form, currentAmount: e.target.value })}
                placeholder="0"
              />
            </div>
          )}

          {/* Target Date */}
          <div className="space-y-1.5">
            <Label htmlFor="goal-date">Target Date</Label>
            <Input
              id="goal-date"
              type="date"
              value={form.targetDate}
              onChange={(e) => setForm({ ...form, targetDate: e.target.value })}
            />
          </div>

          {/* Category */}
          <div className="space-y-1.5">
            <Label htmlFor="goal-category">Category</Label>
            <Input
              id="goal-category"
              value={form.category}
              onChange={(e) => setForm({ ...form, category: e.target.value })}
              placeholder="e.g., Retirement, House, Car"
            />
          </div>

          {/* Status */}
          <div className="space-y-1.5">
            <Label htmlFor="goal-status">Status</Label>
            <select
              id="goal-status"
              value={form.status}
              onChange={(e) => setForm({ ...form, status: e.target.value })}
              className="w-full px-3 py-2 rounded-lg border border-border bg-background text-foreground text-sm"
            >
              {statuses.map((s) => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </select>
          </div>

          {/* Linked Account */}
          <div className="space-y-1.5">
            <Label htmlFor="goal-account">Linked Account (optional)</Label>
            <select
              id="goal-account"
              value={form.linkedAccountId}
              onChange={(e) => setForm({ ...form, linkedAccountId: e.target.value })}
              className="w-full px-3 py-2 rounded-lg border border-border bg-background text-foreground text-sm"
            >
              <option value="">None</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name} ({a.type}) — {parseFloat(a.balance).toLocaleString('en-US', { style: 'currency', currency: 'USD' })}
                </option>
              ))}
            </select>
          </div>

          {/* Shared Account Warning */}
          {form.linkedAccountId && sharedAccountWarning && (
            <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
              <div className="flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" />
                <p className="text-xs text-amber-500">{sharedAccountWarning}</p>
              </div>
            </div>
          )}

          {/* Sort Order (shown when linked account selected) */}
          {form.linkedAccountId && (
            <div className="space-y-1.5">
              <Label htmlFor="goal-order">Allocation Order</Label>
              <Input
                id="goal-order"
                type="number"
                step="1"
                min="0"
                value={form.sortOrder}
                onChange={(e) => setForm({ ...form, sortOrder: parseInt(e.target.value) || 0 })}
                placeholder="0"
                className="w-24"
              />
              <p className="text-[10px] text-muted-foreground">
                Determines allocation order among goals on the same account. Lower numbers are funded first.
              </p>
            </div>
          )}

          {/* Percentage of Account (shown when linked account selected) */}
          {form.linkedAccountId && (
            <div className="space-y-1.5">
              <Label htmlFor="goal-percentage">Percentage of Account</Label>
              <div className="relative">
                <Input
                  id="goal-percentage"
                  type="number"
                  step="1"
                  min="0"
                  max="100"
                  value={form.percentage}
                  onChange={(e) => setForm({ ...form, percentage: e.target.value })}
                  placeholder="100"
                  className="pr-8"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm pointer-events-none">%</span>
              </div>
              <p className="text-[10px] text-muted-foreground">
                What % of the account balance to allocate toward this goal
              </p>
            </div>
          )}

          {/* Account Reserve (shown when linked account selected) */}
          {form.linkedAccountId && (
            <div className="space-y-1.5">
              <Label htmlFor="goal-reserve">Account Reserve</Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm pointer-events-none">$</span>
                <Input
                  id="goal-reserve"
                  type="number"
                  step="0.01"
                  min="0"
                  value={form.reserve}
                  onChange={(e) => setForm({ ...form, reserve: e.target.value })}
                  placeholder="0"
                  className="pl-7"
                />
              </div>
              <p className="text-[10px] text-muted-foreground">
                Amount to keep in the account as a safety reserve. This amount will not be counted toward your goal.
              </p>
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/20">
              <p className="text-sm text-destructive">{error}</p>
            </div>
          )}

          {/* Footer */}
          <DialogFooter>
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm text-foreground bg-muted hover:bg-accent rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 text-sm font-semibold text-primary-foreground bg-primary rounded-lg hover:opacity-90 disabled:opacity-50 transition-all"
            >
              {saving ? 'Saving...' : editGoal ? 'Save Changes' : 'Create Goal'}
            </button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
