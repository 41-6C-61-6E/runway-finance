'use client';

import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { AlertTriangle, Search, Sparkles } from 'lucide-react';

interface GoalFormData {
  name: string;
  description: string;
  type: string;
  targetAmount: string;
  currentAmount: string;
  targetDate: string;
  categoryId: string;
  tagIds: string[];
  status: string;
  linkedAccountId: string;
  percentage: string;
  reserve: string;
  sortOrder: number;
}

interface Category {
  id: string;
  parentId: string | null;
  name: string;
  color: string;
  isIncome: boolean;
}

interface TagItem {
  id: string;
  name: string;
  color: string;
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
    category: any;
    status: string;
    linkedAccountId: string | null;
    percentage: string;
    reserve: string;
    sortOrder: number;
    tags?: Array<{ id: string; name: string; color: string }>;
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
  { value: 'pending', label: 'Pending' },
  { value: 'completed', label: 'Completed' },
];

export function GoalFormDialog({ open, onClose, onSuccess, editGoal }: GoalFormDialogProps) {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [allTags, setAllTags] = useState<TagItem[]>([]);
  const [tagSearch, setTagSearch] = useState('');
  const [showTagDropdown, setShowTagDropdown] = useState(false);
  const [showCategoryDropdown, setShowCategoryDropdown] = useState(false);
  const [categorySearch, setCategorySearch] = useState('');

  const [form, setForm] = useState<GoalFormData>({
    name: '',
    description: '',
    type: 'savings',
    targetAmount: '',
    currentAmount: '0',
    targetDate: '',
    categoryId: '',
    tagIds: [],
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

    const fetchCategories = async () => {
      try {
        const res = await fetch('/api/categories', { credentials: 'include' });
        if (res.ok) {
          const data = await res.json();
          setCategories(data);
        }
      } catch {}
    };

    const fetchTags = async () => {
      try {
        const res = await fetch('/api/tags', { credentials: 'include' });
        if (res.ok) {
          const data = await res.json();
          setAllTags(data);
        }
      } catch {}
    };

    fetchAccounts();
    fetchCategories();
    fetchTags();

    if (editGoal) {
      const catId = typeof editGoal.category === 'object' && editGoal.category ? editGoal.category.id : '';
      const tagIdsList = editGoal.tags ? editGoal.tags.map((t) => t.id) : [];
      setForm({
        name: editGoal.name,
        description: editGoal.description || '',
        type: editGoal.type,
        targetAmount: editGoal.targetAmount,
        currentAmount: editGoal.currentAmount,
        targetDate: editGoal.targetDate || '',
        categoryId: catId,
        tagIds: tagIdsList,
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
        categoryId: '',
        tagIds: [],
        status: 'active',
        linkedAccountId: '',
        percentage: '100',
        reserve: '0',
        sortOrder: 0,
      });
    }
    setError('');
    setSharedAccountWarning(null);
    setCategorySearch('');
    setTagSearch('');
    setShowCategoryDropdown(false);
    setShowTagDropdown(false);
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

          {/* Category Selector */}
          <div className="space-y-1.5 relative">
            <Label htmlFor="goal-category">Category</Label>
            <div className="relative">
              {(() => {
                const selectedCat = form.categoryId ? categories.find((c) => c.id === form.categoryId) : null;
                const parents = categories.filter((c) => !c.parentId);
                const getChildren = (parentId: string) => categories.filter((c) => c.parentId === parentId);

                return (
                  <>
                    <button
                      type="button"
                      onClick={() => setShowCategoryDropdown(!showCategoryDropdown)}
                      className="w-full flex items-center gap-2 px-3 py-2 bg-background border border-input rounded-lg text-sm text-foreground hover:bg-muted transition-colors text-left"
                    >
                      {selectedCat ? (
                        <>
                          <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: selectedCat.color }} />
                          <span>{selectedCat.name}</span>
                        </>
                      ) : (
                        <span className="text-muted-foreground">Uncategorized</span>
                      )}
                      <span className="ml-auto text-muted-foreground">▼</span>
                    </button>

                    {showCategoryDropdown && (
                      <>
                        <div className="fixed inset-0 z-40" onClick={() => { setShowCategoryDropdown(false); setCategorySearch(''); }} />
                        <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-card border border-border rounded-lg shadow-xl max-h-80 flex flex-col overflow-hidden">
                          <div className="relative p-2 border-b border-border">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
                            <input
                              value={categorySearch}
                              onChange={(e) => setCategorySearch(e.target.value)}
                              placeholder="Search categories..."
                              className="w-full pl-7 pr-2 py-1.5 text-xs bg-background border border-input rounded-md text-foreground placeholder-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                              autoFocus
                              onClick={(e) => e.stopPropagation()}
                            />
                          </div>
                          <div className="flex-1 overflow-y-auto max-h-56">
                            {(() => {
                              const filter = categorySearch.toLowerCase();
                              const filteredParents = filter
                                ? parents.filter((p) =>
                                    p.name.toLowerCase().includes(filter) ||
                                    getChildren(p.id).some((c) => c.name.toLowerCase().includes(filter))
                                  )
                                : parents;
                              const noResults = filteredParents.length === 0;
                              return (
                                <>
                                  <button
                                    type="button"
                                    onClick={() => { setForm({ ...form, categoryId: '' }); setShowCategoryDropdown(false); setCategorySearch(''); }}
                                    className="w-full flex items-center gap-2 px-3 py-2 text-sm text-muted-foreground hover:bg-muted transition-colors text-left"
                                  >
                                    None (uncategorized)
                                  </button>
                                  {filteredParents.map((parent) => {
                                    const childList = filter
                                      ? getChildren(parent.id).filter((c) => c.name.toLowerCase().includes(filter))
                                      : getChildren(parent.id);
                                    if (filter && childList.length === 0 && !parent.name.toLowerCase().includes(filter)) return null;
                                    return (
                                      <div key={parent.id}>
                                        <div className="flex items-center gap-2 px-3 py-1 text-[10px] font-semibold text-muted-foreground bg-muted/30">
                                          <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: parent.color }} />
                                          {parent.name}
                                        </div>
                                        <button
                                          type="button"
                                          onClick={() => { setForm({ ...form, categoryId: parent.id }); setShowCategoryDropdown(false); setCategorySearch(''); }}
                                          className={`w-full flex items-center gap-2 px-6 py-2 text-sm transition-colors text-left ${
                                            form.categoryId === parent.id
                                              ? 'text-primary bg-primary/10'
                                              : 'text-foreground/80 hover:bg-muted'
                                          }`}
                                        >
                                          <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: parent.color }} />
                                          {parent.name}
                                        </button>
                                        {childList.map((child) => (
                                          <button
                                            type="button"
                                            key={child.id}
                                            onClick={() => { setForm({ ...form, categoryId: child.id }); setShowCategoryDropdown(false); setCategorySearch(''); }}
                                            className={`w-full flex items-center gap-2 px-6 py-2 text-sm transition-colors text-left ${
                                              form.categoryId === child.id
                                                ? 'text-primary bg-primary/10'
                                                : 'text-foreground/80 hover:bg-muted'
                                            }`}
                                          >
                                            <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: child.color }} />
                                            {child.name}
                                          </button>
                                        ))}
                                      </div>
                                    );
                                  })}
                                  {noResults && (
                                    <div className="px-3 py-4 text-xs text-muted-foreground text-center">
                                      No categories found
                                    </div>
                                  )}
                                </>
                              );
                            })()}
                          </div>
                        </div>
                      </>)}
                  </>
                );
              })()}
            </div>
          </div>

          {/* Tags Picker */}
          <div className="space-y-1.5 relative">
            <Label>Tags</Label>
            <div className="relative">
              <div
                className="min-h-[38px] w-full flex flex-wrap gap-1 px-3 py-1.5 bg-background border border-input rounded-lg cursor-pointer"
                onClick={() => setShowTagDropdown(!showTagDropdown)}
              >
                {form.tagIds.length === 0 && (
                  <span className="text-sm text-muted-foreground self-center">No tags selected</span>
                )}
                {form.tagIds.map((tagId) => {
                  const tag = allTags.find((t) => t.id === tagId);
                  if (!tag) return null;
                  return (
                    <span
                      key={tagId}
                      className="tag-pill inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium"
                      style={{ '--tag-color': tag.color } as React.CSSProperties}
                    >
                      #{tag.name}
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); setForm({ ...form, tagIds: form.tagIds.filter((id) => id !== tagId) }); }}
                        className="ml-0.5 text-current opacity-60 hover:opacity-100 font-bold"
                      >×</button>
                    </span>
                  );
                })}
                <span className="ml-auto self-center text-muted-foreground text-xs">▼</span>
              </div>

              {showTagDropdown && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => { setShowTagDropdown(false); setTagSearch(''); }} />
                  <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-card border border-border rounded-lg shadow-xl max-h-56 flex flex-col overflow-hidden">
                    <div className="relative p-2 border-b border-border">
                      <input
                        value={tagSearch}
                        onChange={(e) => setTagSearch(e.target.value)}
                        placeholder="Search tags..."
                        className="w-full px-3 py-1.5 text-xs bg-background border border-input rounded-md text-foreground placeholder-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                        autoFocus
                        onClick={(e) => e.stopPropagation()}
                      />
                    </div>
                    <div className="flex-1 overflow-y-auto">
                      {allTags.length === 0 && (
                        <div className="px-3 py-4 text-xs text-muted-foreground text-center">No tags — create them in Settings → Tags</div>
                      )}
                      {allTags
                        .filter((t) => !tagSearch || t.name.toLowerCase().includes(tagSearch.toLowerCase()))
                        .map((tag) => (
                          <button
                            type="button"
                            key={tag.id}
                            onClick={(e) => {
                              e.stopPropagation();
                              if (form.tagIds.includes(tag.id)) {
                                setForm({ ...form, tagIds: form.tagIds.filter((id) => id !== tag.id) });
                              } else {
                                setForm({ ...form, tagIds: [...form.tagIds, tag.id] });
                              }
                            }}
                            className={`w-full flex items-center gap-2 px-3 py-2 text-sm transition-colors text-left ${
                              form.tagIds.includes(tag.id) ? 'bg-primary/10 text-primary' : 'text-foreground/80 hover:bg-muted'
                            }`}
                          >
                            <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: tag.color }} />
                            {tag.name}
                            {form.tagIds.includes(tag.id) && <span className="ml-auto text-xs">✓</span>}
                          </button>
                        ))}
                    </div>
                  </div>
                </>
              )}
            </div>
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
