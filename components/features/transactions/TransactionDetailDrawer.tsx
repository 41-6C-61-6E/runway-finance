'use client';

import { useState, useEffect, useCallback } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Switch } from '@/components/ui/switch';
import { Search, Sparkles, Plus } from 'lucide-react';

type Transaction = {
  id: string;
  date: string;
  postedDate: string | null;
  description: string;
  payee: string | null;
  memo: string | null;
  amount: string;
  categoryId: string | null;
  categoryName: string | null;
  categoryColor: string | null;
  accountName: string | null;
  accountId?: string;
  accountTags?: { id: string; name: string; color: string }[];
  notes: string | null;
  reviewed: boolean | null;
  ignored: boolean | null;
  pending: boolean;
  categorizedByAi: boolean;
  source?: string;
  tags?: { id: string; name: string; color: string }[];
  splits?: {
    id: string;
    amount: string;
    categoryId: string | null;
    categoryName: string | null;
    categoryColor: string | null;
    notes: string | null;
    tags?: { id: string; name: string; color: string }[];
  }[];
};

type TagItem = {
  id: string;
  name: string;
  color: string;
};

type Category = {
  id: string;
  parentId: string | null;
  name: string;
  color: string;
  isIncome: boolean;
};

type AccountItem = {
  id: string;
  name: string;
  connectionId: string | null;
  type: string;
};

interface TransactionDetailDrawerProps {
  transaction?: Transaction;
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
  mode: 'create' | 'edit';
}

import { useUserSettings } from '@/components/user-settings-provider';

export default function TransactionDetailDrawer({ transaction, open, onClose, onSuccess, mode }: TransactionDetailDrawerProps) {
  const settingsContext = useUserSettings();
  const showAccountTags = settingsContext?.settings?.accountTagVisibility?.transactions !== false;

  const [payee, setPayee] = useState(transaction?.payee ?? '');
  const [memo, setMemo] = useState(transaction?.memo ?? '');
  const [notes, setNotes] = useState(transaction?.notes ?? '');
  const [reviewed, setReviewed] = useState(!!transaction?.reviewed);
  const [categoryId, setCategoryId] = useState(transaction?.categoryId ?? null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [categoriesLoading, setCategoriesLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [tagIds, setTagIds] = useState<string[]>(transaction?.tags?.map((t) => t.id) ?? []);
  const [allTags, setAllTags] = useState<TagItem[]>([]);
  const [tagSearch, setTagSearch] = useState('');
  const [showTagDropdown, setShowTagDropdown] = useState(false);

  const [isCreatingCategory, setIsCreatingCategory] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [newCategoryParentId, setNewCategoryParentId] = useState<string | null>(null);
  const [newCategoryColor, setNewCategoryColor] = useState('#6366f1');
  const [newCategoryIsIncome, setNewCategoryIsIncome] = useState(false);
  const [creatingCategoryLoading, setCreatingCategoryLoading] = useState(false);

  // New editable fields
  const [description, setDescription] = useState(transaction?.description ?? '');
  const [amount, setAmount] = useState(transaction?.amount != null ? String(transaction.amount) : '');
  const [date, setDate] = useState(transaction?.date ?? new Date().toISOString().split('T')[0]);
  const [postedDate, setPostedDate] = useState(transaction?.postedDate ?? '');
  const [pending, setPending] = useState(transaction?.pending ?? false);

  // Create mode fields
  const [accounts, setAccounts] = useState<AccountItem[]>([]);
  const [accountId, setAccountId] = useState(transaction?.accountId ?? '');
  const [accountsLoading, setAccountsLoading] = useState(false);

  // Split transaction states
  const [isSplitting, setIsSplitting] = useState(false);
  const [splitRows, setSplitRows] = useState<{
    amount: string;
    categoryId: string | null;
    description: string;
    notes: string;
    tagIds: string[];
  }[]>([
    { amount: '', categoryId: null, description: '', notes: '', tagIds: [] },
    { amount: '', categoryId: null, description: '', notes: '', tagIds: [] },
  ]);
  const [splitSaving, setSplitSaving] = useState(false);
  const [splitError, setSplitError] = useState<string | null>(null);

  const handleRevertSplit = async () => {
    if (!transaction) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/transactions/${transaction.id}/revert-split`, {
        method: 'POST',
        credentials: 'include',
      });
      if (res.ok) {
        onSuccess();
        onClose();
      } else {
        const errData = await res.json();
        alert(errData.message || 'Failed to revert split');
      }
    } catch (err) {
      console.error(err);
      alert('An error occurred');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveSplits = async () => {
    if (!transaction) return;
    setSplitSaving(true);
    setSplitError(null);
    try {
      const payload = {
        splits: splitRows.map((r) => ({
          amount: r.amount.replace(/[^\d.-]/g, ''),
          categoryId: r.categoryId,
          description: r.description.trim() || undefined,
          notes: r.notes.trim() || undefined,
          tagIds: r.tagIds.length > 0 ? r.tagIds : undefined,
        })),
      };

      const res = await fetch(`/api/transactions/${transaction.id}/split`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        onSuccess();
        onClose();
      } else {
        const errData = await res.json();
        setSplitError(errData.message || 'Failed to split transaction');
      }
    } catch (err) {
      console.error(err);
      setSplitError('An error occurred');
    } finally {
      setSplitSaving(false);
    }
  };

  const addSplitRow = () => {
    setSplitRows([
      ...splitRows,
      { amount: '', categoryId: null, description: '', notes: '', tagIds: [] },
    ]);
  };

  const removeSplitRow = (index: number) => {
    setSplitRows(splitRows.filter((_, idx) => idx !== index));
  };

  const updateSplitRow = (index: number, key: string, value: any) => {
    setSplitRows(
      splitRows.map((r, idx) => (idx === index ? { ...r, [key]: value } : r))
    );
  };

  useEffect(() => {
    setPayee(transaction?.payee ?? '');
    setMemo(transaction?.memo ?? '');
    setNotes(transaction?.notes ?? '');
    setReviewed(!!transaction?.reviewed);
    setCategoryId(transaction?.categoryId ?? null);
    setTagIds(transaction?.tags?.map((t) => t.id) ?? []);
    setDescription(transaction?.description ?? '');
    setAmount(transaction?.amount != null ? String(transaction.amount) : '');
    setDate(transaction?.date ?? new Date().toISOString().split('T')[0]);
    setPostedDate(transaction?.postedDate ?? '');
    setPending(transaction?.pending ?? false);
    setAccountId(transaction?.accountId ?? '');
    setIsCreatingCategory(false);
    setConfirmDelete(false);
    setIsSplitting(false);
    setSplitRows([
      { amount: '', categoryId: null, description: '', notes: '', tagIds: [] },
      { amount: '', categoryId: null, description: '', notes: '', tagIds: [] },
    ]);
    setSplitError(null);
  }, [transaction]);

  const fetchCategories = useCallback(async () => {
    setCategoriesLoading(true);
    try {
      const res = await fetch('/api/categories', { credentials: 'include' });
      const data = await res.json();
      const catList = Array.isArray(data) ? data : [];
      setCategories(catList);
      return catList;
    } catch {
      setCategories([]);
      return [];
    } finally {
      setCategoriesLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open && categories.length === 0 && !categoriesLoading) {
      fetchCategories();
    }
  }, [open, categories.length, categoriesLoading, fetchCategories]);

  useEffect(() => {
    if (open && allTags.length === 0) {
      fetch('/api/tags', { credentials: 'include' })
        .then((res) => res.json())
        .then((data) => setAllTags(Array.isArray(data) ? data : []))
        .catch(() => setAllTags([]));
    }
  }, [open, allTags.length]);

  // Fetch accounts for create mode
  useEffect(() => {
    if (open && mode === 'create' && accounts.length === 0 && !accountsLoading) {
      setAccountsLoading(true);
      fetch('/api/accounts', { credentials: 'include' })
        .then((res) => res.json())
        .then((data) => setAccounts(Array.isArray(data) ? data : []))
        .catch(() => setAccounts([]))
        .finally(() => setAccountsLoading(false));
    }
  }, [open, mode, accounts.length, accountsLoading]);

  const handleCreateCategory = async () => {
    if (!newCategoryName.trim()) return;
    setCreatingCategoryLoading(true);
    try {
      const res = await fetch('/api/categories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          name: newCategoryName.trim(),
          parentId: newCategoryParentId || null,
          color: newCategoryColor,
          isIncome: newCategoryIsIncome,
        }),
      });

      if (res.ok) {
        const createdData = await res.json();
        const updatedCats = await fetchCategories();
        const matchingCat = updatedCats.find(
          (c) => c.name.toLowerCase() === newCategoryName.trim().toLowerCase()
        ) || updatedCats.find((c) => c.id === createdData.id);

        if (matchingCat) {
          setCategoryId(matchingCat.id);
        } else {
          setCategoryId(createdData.id);
        }
        setIsCreatingCategory(false);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setCreatingCategoryLoading(false);
    }
  };

  const handleSave = useCallback(async () => {
    setSaving(true);
    const cleanAmount = String(amount || '').replace(/[^\d.-]/g, '');
    try {
      if (mode === 'create') {
        const res = await fetch('/api/transactions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            accountId,
            date,
            amount: cleanAmount,
            description,
            payee: payee || undefined,
            memo: memo || undefined,
            notes: notes || undefined,
            categoryId: categoryId || undefined,
            tagIds: tagIds.length > 0 ? tagIds : undefined,
            pending,
          }),
        });
        if (res.ok) {
          onSuccess();
          onClose();
        }
      } else if (transaction) {
        const res = await fetch(`/api/transactions/${transaction.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            payee: payee || undefined,
            memo: memo || undefined,
            notes: notes || undefined,
            categoryId,
            reviewed,
            tagIds,
            description: description || undefined,
            amount: cleanAmount || undefined,
            date: date || undefined,
            postedDate: postedDate || null,
            pending,
          }),
        });
        if (res.ok) {
          onSuccess();
          onClose();
        }
      }
    } finally {
      setSaving(false);
    }
  }, [mode, transaction, accountId, date, amount, description, payee, memo, notes, categoryId, tagIds, pending, reviewed, postedDate, onSuccess, onClose]);

  const handleDelete = useCallback(async () => {
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    setDeleting(true);
    try {
      if (transaction) {
        const res = await fetch(`/api/transactions/${transaction.id}`, {
          method: 'DELETE',
          credentials: 'include',
        });
        if (res.ok) {
          onSuccess();
          onClose();
        }
      }
    } catch (err) {
      console.error(err);
    } finally {
      setDeleting(false);
    }
  }, [transaction?.id, confirmDelete, onSuccess, onClose]);

  const toggleReviewed = async () => {
    setReviewed(!reviewed);
  };

  const formatAmount = (amount: string) => {
    const num = parseFloat(amount);
    return {
      text: new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        minimumFractionDigits: 2,
      }).format(Math.abs(num)),
    };
  };

  const { text } = transaction ? formatAmount(transaction.amount) : { text: '' };

  const parents = categories.filter((c) => !c.parentId);
  const getChildren = (parentId: string) => categories.filter((c) => c.parentId === parentId);

  const selectedCat = categoryId ? categories.find((c) => c.id === categoryId) : null;
  const [showCategoryDropdown, setShowCategoryDropdown] = useState(false);
  const [categorySearch, setCategorySearch] = useState('');

  const isSynced = transaction?.source === 'bank';
  const isLinkedToSynced = mode === 'create' && accounts.find((a) => a.id === accountId)?.connectionId != null;

  const parentAbs = Math.abs(parseFloat(String(transaction?.amount || '').replace(/[^\d.-]/g, '')) || 0);
  const splitsSum = splitRows.reduce((sum, r) => {
    const amt = parseFloat(r.amount.replace(/[^\d.-]/g, '')) || 0;
    return sum + Math.abs(amt);
  }, 0);
  const remainingAmount = parentAbs - splitsSum;

  return (
    <Sheet open={open} onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="right" className="overflow-y-auto">
        <SheetHeader className="mb-6">
          <SheetTitle>{mode === 'create' ? 'Add Transaction' : 'Transaction Details'}</SheetTitle>
        </SheetHeader>

        <div className="space-y-5">
          {/* Warning Banners */}
          {mode === 'edit' && isSynced && (
            <div className="p-3 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg">
              <p className="text-xs font-medium text-amber-800 dark:text-amber-300">Synced Transaction</p>
              <p className="text-xs text-amber-700 dark:text-amber-400 mt-1">
                This transaction was synced from SimpleFIN. Changes to <strong>amount</strong>, <strong>description</strong>, <strong>posted date</strong>, or <strong>pending</strong> status will be overwritten on the next sync. Consider using payee, memo, notes, and tags for annotations instead.
              </p>
            </div>
          )}
          {mode === 'create' && isLinkedToSynced && (
            <div className="p-3 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg">
              <p className="text-xs font-medium text-amber-800 dark:text-amber-300">SimpleFIN Account</p>
              <p className="text-xs text-amber-700 dark:text-amber-400 mt-1">
                This account is linked to SimpleFIN. This manual transaction won&apos;t sync to your bank and the account balance shown here may differ from your actual bank balance.
              </p>
            </div>
          )}

          {/* Account selector (create mode) */}
          {mode === 'create' && (
            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">Account</label>
              <select
                value={accountId}
                onChange={(e) => setAccountId(e.target.value)}
                className="w-full px-3 py-2 bg-background border border-input rounded-lg text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="">Select an account</option>
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>{a.name}</option>
                ))}
              </select>
            </div>
          )}

          {/* Conditional Layout for Splits */}
          {mode === 'edit' && transaction?.splits && transaction.splits.length > 0 ? (
            <div className="space-y-4">
              {/* Summary Card */}
              <div className="p-4 bg-muted/10 border border-border rounded-xl space-y-3">
                <div className="flex justify-between items-baseline">
                  <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Original Amount</span>
                  <span className="font-mono text-xl font-bold text-foreground">{text}</span>
                </div>
                <div className="flex justify-between items-baseline">
                  <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Date</span>
                  <span className="text-sm text-foreground">{new Date(date).toLocaleDateString()}</span>
                </div>
                <div className="flex justify-between gap-x-4 items-start">
                  <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider shrink-0">Description</span>
                  <span className="text-sm text-foreground font-medium text-right break-words">{description}</span>
                </div>
              </div>

              {/* Splits List */}
              <div className="p-4 bg-muted/20 border border-border rounded-xl space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-foreground">Transaction Splits</span>
                  <button
                    type="button"
                    onClick={handleRevertSplit}
                    disabled={saving || deleting}
                    className="text-xs font-semibold text-destructive hover:underline disabled:opacity-50"
                  >
                    Revert Split
                  </button>
                </div>
                <div className="space-y-2">
                  {transaction.splits.map((split: any, idx: number) => {
                    const cat = categories.find((c) => c.id === split.categoryId);
                    return (
                      <div key={split.id || idx} className="flex items-center justify-between text-xs p-2.5 bg-background border border-border/50 rounded-lg">
                        <div className="min-w-0 flex-1">
                          <div className="font-medium text-foreground truncate">{split.description || transaction.description}</div>
                          <div className="text-[10px] text-muted-foreground mt-0.5 flex items-center gap-1.5">
                            <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: cat?.color || '#a1a1aa' }} />
                            {cat?.name || 'Uncategorized'}
                            {split.notes && <span className="truncate max-w-[120px] text-muted-foreground/60">• {split.notes}</span>}
                          </div>
                        </div>
                        <div className="font-semibold text-foreground text-right pl-3">
                          {new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(parseFloat(split.amount) || 0)}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Parent Metadata Editor */}
              <div className="space-y-4 pt-2 border-t border-border">
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">Payee</label>
                  <input
                    value={payee}
                    onChange={(e) => setPayee(e.target.value)}
                    className="w-full px-3 py-2 bg-background border border-input rounded-lg text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring placeholder-muted-foreground"
                    placeholder="Enter payee"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">Memo</label>
                  <input
                    value={memo}
                    onChange={(e) => setMemo(e.target.value)}
                    className="w-full px-3 py-2 bg-background border border-input rounded-lg text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring placeholder-muted-foreground"
                    placeholder="Enter memo"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">Notes</label>
                  <textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    rows={3}
                    className="w-full px-3 py-2 bg-background border border-input rounded-lg text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring placeholder-muted-foreground resize-none"
                    placeholder="Add notes"
                  />
                </div>

                <div className="space-y-4 pt-1">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-foreground/80">Reviewed</span>
                    <div className="text-right">
                      <Switch checked={reviewed} onCheckedChange={toggleReviewed} />
                      <div className="text-[10px] text-muted-foreground mt-0.5">
                        {reviewed ? 'Marked as reviewed' : 'Needs review'}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-foreground/80">Pending</span>
                    <div className="text-right">
                      <Switch checked={pending} onCheckedChange={(v) => setPending(v)} />
                      <div className="text-[10px] text-muted-foreground mt-0.5">
                        {pending ? 'Marked as pending' : 'Cleared'}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="pt-2">
                  <button
                    onClick={handleSave}
                    disabled={saving || deleting}
                    className="w-full px-4 py-2.5 text-sm font-semibold text-primary-foreground bg-primary rounded-lg hover:opacity-90 disabled:opacity-50 transition-all"
                  >
                    {saving ? 'Saving...' : 'Save Changes'}
                  </button>
                </div>
              </div>
            </div>
          ) : isSplitting ? (
            /* Split Creation Form */
            <div className="space-y-4">
              <div className="p-3 bg-primary/5 border border-primary/20 rounded-lg">
                <div className="flex justify-between items-center text-xs font-semibold text-primary uppercase tracking-wider">
                  <span>Splitting Transaction</span>
                  <span>{new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(parentAbs)}</span>
                </div>
              </div>

              {splitError && (
                <div className="p-2.5 bg-destructive/15 border border-destructive/20 rounded-lg text-xs font-medium text-destructive">
                  {splitError}
                </div>
              )}

              <div className="space-y-3.5 max-h-[360px] overflow-y-auto pr-1">
                {splitRows.map((row, idx) => (
                  <div key={idx} className="p-3 bg-muted/10 border border-border/50 rounded-xl space-y-2.5 relative">
                    <div className="flex justify-between items-center">
                      <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Split #{idx + 1}</span>
                      {splitRows.length > 2 && (
                        <button
                          type="button"
                          onClick={() => removeSplitRow(idx)}
                          className="text-[10px] font-semibold text-destructive hover:underline"
                        >
                          Remove
                        </button>
                      )}
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-[10px] font-medium text-muted-foreground mb-0.5">Amount</label>
                        <input
                          type="text"
                          value={row.amount}
                          onChange={(e) => updateSplitRow(idx, 'amount', e.target.value)}
                          placeholder="0.00"
                          className="w-full px-2.5 py-1.5 bg-background border border-input rounded text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring font-mono"
                          required
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-medium text-muted-foreground mb-0.5">Category</label>
                        <select
                          value={row.categoryId || ''}
                          onChange={(e) => updateSplitRow(idx, 'categoryId', e.target.value || null)}
                          className="w-full px-2 py-1.5 bg-background border border-input rounded text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                        >
                          <option value="">Uncategorized</option>
                          {parents.map((p) => (
                            <optgroup key={p.id} label={p.name}>
                              <option value={p.id}>{p.name}</option>
                              {getChildren(p.id).map((c) => (
                                <option key={c.id} value={c.id}>
                                  &nbsp;&nbsp;{c.name}
                                </option>
                              ))}
                            </optgroup>
                          ))}
                        </select>
                      </div>
                    </div>

                    <div>
                      <label className="block text-[10px] font-medium text-muted-foreground mb-0.5">Description (Optional)</label>
                      <input
                        type="text"
                        value={row.description}
                        onChange={(e) => updateSplitRow(idx, 'description', e.target.value)}
                        placeholder={description || 'Inherit description'}
                        className="w-full px-2.5 py-1.5 bg-background border border-input rounded text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                      />
                    </div>
                  </div>
                ))}
              </div>

              <button
                type="button"
                onClick={addSplitRow}
                className="w-full py-2 bg-transparent text-primary hover:bg-primary/5 text-xs font-semibold rounded-lg border border-dashed border-primary/30 transition-all"
              >
                + Add Split Part
              </button>

              {/* Status bar */}
              <div className="p-3 bg-muted/30 border border-border rounded-lg text-xs space-y-1.5 font-medium">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Total Allocated:</span>
                  <span className="text-foreground">{new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(splitsSum)}</span>
                </div>
                <div className="flex justify-between items-center border-t border-border/50 pt-1.5">
                  <span className="text-muted-foreground">Remaining:</span>
                  {Math.abs(remainingAmount) < 0.01 ? (
                    <span className="px-1.5 py-0.5 bg-green-500/20 text-green-600 dark:text-green-400 font-bold rounded text-[10px] uppercase tracking-wider">Balanced</span>
                  ) : (
                    <span className={`font-semibold ${remainingAmount < 0 ? 'text-destructive' : 'text-foreground'}`}>
                      {new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(remainingAmount)}
                    </span>
                  )}
                </div>
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsSplitting(false)}
                  className="flex-1 px-4 py-2 text-sm font-semibold border border-input text-foreground bg-background rounded-lg hover:bg-muted transition-all"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSaveSplits}
                  disabled={splitSaving || Math.abs(remainingAmount) >= 0.01}
                  className="flex-1 px-4 py-2 text-sm font-semibold text-primary-foreground bg-primary rounded-lg hover:opacity-90 disabled:opacity-50 transition-all"
                >
                  {splitSaving ? 'Saving...' : 'Save Splits'}
                </button>
              </div>
            </div>
          ) : (
            /* Standard Edit / Create Form */
            <>
          {/* Amount */}
          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">Amount</label>
            <input
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="w-full px-3 py-2 bg-background border border-input rounded-lg text-foreground font-mono text-2xl font-bold focus:outline-none focus:ring-2 focus:ring-ring placeholder-muted-foreground"
              placeholder="0.00"
            />
          </div>

          {/* Info */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-muted-foreground mb-1">Date</label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full px-2 py-1.5 bg-background border border-input rounded-lg text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <div>
              <label className="block text-xs text-muted-foreground mb-1">Posted Date</label>
              <input
                type="date"
                value={postedDate}
                onChange={(e) => setPostedDate(e.target.value)}
                className="w-full px-2 py-1.5 bg-background border border-input rounded-lg text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            {mode === 'edit' && transaction && (
              <div>
                <div className="text-xs text-muted-foreground">Account</div>
                <div className="flex flex-wrap items-center gap-1.5 mt-0.5">
                  <span className="text-sm text-foreground">{transaction.accountName || '—'}</span>
                  {showAccountTags && transaction.accountTags && transaction.accountTags.length > 0 && (
                    <div className="flex items-center gap-1 flex-shrink-0 flex-wrap">
                      {transaction.accountTags.map((tag) => (
                        <span
                          key={tag.id}
                          className="tag-pill px-1.5 py-0.2 rounded-full text-[8px] font-medium"
                          style={{
                            '--tag-color': tag.color
                          } as React.CSSProperties}
                        >
                          #{tag.name}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">Description</label>
            <input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full px-3 py-2 bg-background border border-input rounded-lg text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring placeholder-muted-foreground"
              placeholder="Enter description"
            />
          </div>

          {/* Category Selector */}
          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">Category</label>
            {isCreatingCategory ? (
              <div className="space-y-3 p-3 bg-muted/20 border border-border rounded-lg">
                <div className="text-xs font-semibold text-foreground uppercase tracking-wider mb-1">New Category</div>

                <div>
                  <label className="block text-[10px] font-medium text-muted-foreground mb-0.5">Name</label>
                  <input
                    value={newCategoryName}
                    onChange={(e) => setNewCategoryName(e.target.value)}
                    placeholder="Category name"
                    className="w-full px-2 py-1 bg-background border border-input rounded text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                    autoFocus
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-medium text-muted-foreground mb-0.5">Parent Category</label>
                  <select
                    value={newCategoryParentId || ''}
                    onChange={(e) => setNewCategoryParentId(e.target.value || null)}
                    className="w-full px-2 py-1 bg-background border border-input rounded text-xs text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  >
                    <option value="">None (top-level)</option>
                    {categories.filter((c) => !c.parentId).map((p) => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[10px] font-medium text-muted-foreground mb-0.5">Color</label>
                    <div className="flex items-center gap-1.5">
                      <input
                        type="color"
                        value={newCategoryColor}
                        onChange={(e) => setNewCategoryColor(e.target.value)}
                        className="w-6 h-6 rounded cursor-pointer border border-input"
                      />
                      <span className="text-[10px] font-mono text-muted-foreground">{newCategoryColor}</span>
                    </div>
                  </div>

                  <div className="flex flex-col justify-end">
                    <div className="flex items-center gap-1.5 h-6">
                      <input
                        type="checkbox"
                        id="new-category-income"
                        checked={newCategoryIsIncome}
                        onChange={(e) => setNewCategoryIsIncome(e.target.checked)}
                        className="rounded border-border text-primary focus:ring-ring"
                      />
                      <label htmlFor="new-category-income" className="text-[10px] font-medium text-muted-foreground">Income category</label>
                    </div>
                  </div>
                </div>

                <div className="flex gap-2 pt-1 border-t border-border/50">
                  <button
                    onClick={() => setIsCreatingCategory(false)}
                    className="flex-1 py-1 text-xs text-foreground bg-muted hover:bg-accent rounded transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleCreateCategory}
                    disabled={creatingCategoryLoading || !newCategoryName.trim()}
                    className="flex-1 py-1 text-xs font-semibold text-primary-foreground bg-primary rounded hover:opacity-90 disabled:opacity-50 transition-all"
                  >
                    {creatingCategoryLoading ? 'Saving...' : 'Create'}
                  </button>
                </div>
              </div>
            ) : (
              <div className="relative">
                <button
                  onClick={() => setShowCategoryDropdown(!showCategoryDropdown)}
                  className="w-full flex items-center gap-2 px-3 py-2 bg-background border border-input rounded-lg text-sm text-foreground hover:bg-muted transition-colors text-left"
                >
                  {selectedCat ? (
                    <>
                      <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: selectedCat.color }} />
                      <span>{selectedCat.name}</span>
                      {mode === 'edit' && transaction?.categorizedByAi && <Sparkles className="h-3 w-3 flex-shrink-0 opacity-60 ml-auto" />}
                    </>
                  ) : (
                    <span className="text-muted-foreground">Uncategorized</span>
                  )}
                  <span className="ml-auto text-muted-foreground">▼</span>
                </button>

                {showCategoryDropdown && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => { setShowCategoryDropdown(false); setCategorySearch(''); }} />
                    <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-card border border-border rounded-lg shadow-xl max-h-80 flex flex-col">
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
                                onClick={() => { setCategoryId(null); setShowCategoryDropdown(false); setCategorySearch(''); }}
                                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-muted-foreground hover:bg-muted transition-colors text-left"
                              >
                                None (uncategorized)
                              </button>
                              <button
                                onClick={() => {
                                  setIsCreatingCategory(true);
                                  setShowCategoryDropdown(false);
                                  setCategorySearch('');
                                  setNewCategoryName('');
                                  setNewCategoryParentId(null);
                                  setNewCategoryColor('#6366f1');
                                  setNewCategoryIsIncome(false);
                                }}
                                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-primary hover:bg-muted font-medium border-b border-border/50 transition-colors text-left"
                              >
                                + Create new category
                              </button>
                              {filteredParents.map((parent) => {
                                const childList = filter
                                  ? getChildren(parent.id).filter((c) => c.name.toLowerCase().includes(filter))
                                  : getChildren(parent.id);
                                if (filter && childList.length === 0 && !parent.name.toLowerCase().includes(filter)) return null;
                                return (
                                  <div key={parent.id}>
                                    <div className="flex items-center gap-2 px-3 py-2 text-xs font-medium text-muted-foreground bg-muted/30">
                                      <div className="w-2 h-2 rounded-full" style={{ backgroundColor: parent.color }} />
                                      {parent.name}
                                    </div>
                                    <button
                                      onClick={() => { setCategoryId(parent.id); setShowCategoryDropdown(false); setCategorySearch(''); }}
                                      className={`w-full flex items-center gap-2 px-6 py-2 text-sm transition-colors text-left ${
                                        categoryId === parent.id
                                          ? 'text-primary bg-primary/10'
                                          : 'text-foreground/80 hover:bg-muted'
                                      }`}
                                    >
                                      <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: parent.color }} />
                                      {parent.name}
                                    </button>
                                    {childList.map((child) => (
                                      <button
                                        key={child.id}
                                        onClick={() => { setCategoryId(child.id); setShowCategoryDropdown(false); setCategorySearch(''); }}
                                        className={`w-full flex items-center gap-2 px-6 py-2 text-sm transition-colors text-left ${
                                          categoryId === child.id
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
                  </>
                )}
              </div>
            )}
          </div>

          {/* Tags Picker */}
          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">Tags</label>
            <div className="relative">
              <div className="min-h-[38px] w-full flex flex-wrap gap-1 px-3 py-1.5 bg-background border border-input rounded-lg cursor-pointer" onClick={() => setShowTagDropdown(!showTagDropdown)}>
                {tagIds.length === 0 && (
                  <span className="text-sm text-muted-foreground self-center">No tags selected</span>
                )}
                {tagIds.map((tagId) => {
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
                        onClick={(e) => { e.stopPropagation(); setTagIds(tagIds.filter((id) => id !== tagId)); }}
                        className="ml-0.5 text-current opacity-60 hover:opacity-100"
                      >×</button>
                    </span>
                  );
                })}
                <span className="ml-auto self-center text-muted-foreground text-xs">▼</span>
              </div>

              {showTagDropdown && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => { setShowTagDropdown(false); setTagSearch(''); }} />
                  <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-card border border-border rounded-lg shadow-xl max-h-56 flex flex-col">
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
                            key={tag.id}
                            onClick={(e) => {
                              e.stopPropagation();
                              if (tagIds.includes(tag.id)) {
                                setTagIds(tagIds.filter((id) => id !== tag.id));
                              } else {
                                setTagIds([...tagIds, tag.id]);
                              }
                            }}
                            className={`w-full flex items-center gap-2 px-3 py-2 text-sm transition-colors text-left ${
                              tagIds.includes(tag.id) ? 'bg-primary/10 text-primary' : 'text-foreground/80 hover:bg-muted'
                            }`}
                          >
                            <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: tag.color }} />
                            {tag.name}
                            {tagIds.includes(tag.id) && <span className="ml-auto text-xs">✓</span>}
                          </button>
                        ))}
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Editable */}
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">Payee</label>
              <input
                value={payee}
                onChange={(e) => setPayee(e.target.value)}
                className="w-full px-3 py-2 bg-background border border-input rounded-lg text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring placeholder-muted-foreground"
                placeholder="Enter payee"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-foreground mb-1">Memo</label>
              <input
                value={memo}
                onChange={(e) => setMemo(e.target.value)}
                className="w-full px-3 py-2 bg-background border border-input rounded-lg text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring placeholder-muted-foreground"
                placeholder="Enter memo"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-foreground mb-1">Notes</label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
                className="w-full px-3 py-2 bg-background border border-input rounded-lg text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring placeholder-muted-foreground resize-none"
                placeholder="Add notes"
              />
            </div>
          </div>

          {/* Toggles */}
          <div className="space-y-4 pt-1">
            {mode === 'edit' && (
              <div className="flex items-center justify-between">
                <span className="text-sm text-foreground/80">Reviewed</span>
                <div className="text-right">
                  <Switch
                    checked={reviewed}
                    onCheckedChange={toggleReviewed}
                  />
                  <div className="text-[10px] text-muted-foreground mt-0.5">
                    {reviewed ? 'Marked as reviewed' : 'Needs review'}
                  </div>
                </div>
              </div>
            )}
            <div className="flex items-center justify-between">
              <span className="text-sm text-foreground/80">Pending</span>
              <div className="text-right">
                <Switch
                  checked={pending}
                  onCheckedChange={(v) => setPending(v)}
                />
                <div className="text-[10px] text-muted-foreground mt-0.5">
                  {pending ? 'Marked as pending' : 'Cleared'}
                </div>
              </div>
            </div>
          </div>

          {/* Split Transaction */}
          {mode === 'edit' && !pending && (
            <div className="pt-1">
              <button
                type="button"
                onClick={() => setIsSplitting(true)}
                className="w-full py-2 bg-primary/10 text-primary hover:bg-primary/20 text-xs font-semibold rounded-lg transition-all border border-primary/20"
              >
                Split Transaction
              </button>
            </div>
          )}

          {/* Action Buttons */}
          <div className="space-y-2 pt-2">
            <button
              onClick={handleSave}
              disabled={
                saving ||
                deleting ||
                !String(amount || '').replace(/[^\d.-]/g, '') ||
                !description.trim() ||
                !date ||
                (mode === 'create' && !accountId)
              }
              className="w-full px-4 py-2.5 text-sm font-semibold text-primary-foreground bg-primary rounded-lg hover:opacity-90 disabled:opacity-50 transition-all"
            >
              {saving ? 'Saving...' : mode === 'create' ? 'Add Transaction' : 'Save Changes'}
            </button>

            {mode === 'edit' && (
              <button
                onClick={handleDelete}
                disabled={saving || deleting}
                className={`w-full px-4 py-2.5 text-sm font-semibold rounded-lg transition-all border ${
                  confirmDelete
                    ? 'bg-destructive text-destructive-foreground border-destructive hover:bg-destructive/90'
                    : 'bg-transparent text-destructive border-destructive/30 hover:bg-destructive/10'
                } disabled:opacity-50`}
              >
                {deleting ? 'Deleting...' : confirmDelete ? 'Are you sure? Click to confirm delete' : 'Delete Transaction'}
              </button>
            )}
          </div>
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
