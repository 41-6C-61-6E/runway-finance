'use client';

import { useState, useEffect } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetClose } from '@/components/ui/sheet';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface GoalFormData {
  name: string;
  description: string;
  type: string;
  targetAmount: string;
  currentAmount: string;
  targetDate: string;
  category: string;
  priority: number;
  status: string;
  linkedAccountId: string;
  percentage: string;
  reserve: string;
}

interface GoalFormDrawerProps {
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
    priority: number;
    status: string;
    linkedAccountId: string | null;
    percentage: string;
    reserve: string;
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

const priorities = [
  { value: 0, label: 'Low' },
  { value: 1, label: 'Medium' },
  { value: 2, label: 'High' },
];

const statuses = [
  { value: 'active', label: 'Active' },
  { value: 'paused', label: 'Paused' },
  { value: 'completed', label: 'Completed' },
];

export function GoalFormDrawer({ open, onClose, onSuccess, editGoal }: GoalFormDrawerProps) {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [form, setForm] = useState<GoalFormData>({
    name: '',
    description: '',
    type: 'savings',
    targetAmount: '',
    currentAmount: '0',
    targetDate: '',
    category: '',
    priority: 0,
    status: 'active',
    linkedAccountId: '',
    percentage: '100',
    reserve: '0',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

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
        priority: editGoal.priority,
        status: editGoal.status,
        linkedAccountId: editGoal.linkedAccountId || '',
        percentage: editGoal.percentage || '100',
        reserve: editGoal.reserve || '0',
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
        priority: 0,
        status: 'active',
        linkedAccountId: '',
        percentage: '100',
        reserve: '0',
      });
    }
    setError('');
  }, [open, editGoal]);

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

      // Calculate currentAmount from linked account fields if applicable
      let currentAmount = parseFloat(form.currentAmount) || 0;
      if (form.linkedAccountId && form.percentage && form.reserve) {
        const account = accounts.find(a => a.id === form.linkedAccountId);
        if (account) {
          const balance = parseFloat(account.balance);
          const pct = parseFloat(form.percentage) / 100;
          const reserve = parseFloat(form.reserve) || 0;
          currentAmount = Math.max(0, balance * pct - reserve);
        }
      }

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          id: editGoal?.id,
          ...form,
          targetAmount: parseFloat(form.targetAmount),
          currentAmount,
          priority: Number(form.priority),
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
    <Sheet open={open} onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="right" className="w-[420px] sm:w-[500px] overflow-y-auto">
        <SheetHeader className="pb-4">
          <SheetTitle>{editGoal ? 'Edit Goal' : 'Create New Goal'}</SheetTitle>
        </SheetHeader>

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

          {/* Priority */}
          <div className="space-y-1.5">
            <Label htmlFor="goal-priority">Priority</Label>
            <select
              id="goal-priority"
              value={form.priority}
              onChange={(e) => setForm({ ...form, priority: Number(e.target.value) })}
              className="w-full px-3 py-2 rounded-lg border border-border bg-background text-foreground text-sm"
            >
              {priorities.map((p) => (
                <option key={p.value} value={p.value}>{p.label}</option>
              ))}
            </select>
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
          <div className="flex justify-end gap-2 pt-4">
            <SheetClose asChild>
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
              >
                Cancel
              </button>
            </SheetClose>
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 text-sm font-medium bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50"
            >
              {saving ? 'Saving...' : editGoal ? 'Update Goal' : 'Create Goal'}
            </button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  );
}
