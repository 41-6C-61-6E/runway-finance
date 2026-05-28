'use client';

import { useState, useEffect, useCallback } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Switch } from '@/components/ui/switch';
import { Search, Sparkles } from 'lucide-react';

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
  notes: string | null;
  reviewed: boolean | null;
  ignored: boolean | null;
  pending: boolean;
  categorizedByAi: boolean;
  tags?: { id: string; name: string; color: string }[];
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

interface TransactionDetailDrawerProps {
  transaction: Transaction;
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export default function TransactionDetailDrawer({ transaction, open, onClose, onSuccess }: TransactionDetailDrawerProps) {
  const [payee, setPayee] = useState(transaction.payee ?? '');
  const [memo, setMemo] = useState(transaction.memo ?? '');
  const [notes, setNotes] = useState(transaction.notes ?? '');
  const [reviewed, setReviewed] = useState(!!transaction.reviewed);
  const [categoryId, setCategoryId] = useState(transaction.categoryId);
  const [categories, setCategories] = useState<Category[]>([]);
  const [categoriesLoading, setCategoriesLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [tagIds, setTagIds] = useState<string[]>(transaction.tags?.map((t) => t.id) ?? []);
  const [allTags, setAllTags] = useState<TagItem[]>([]);
  const [tagSearch, setTagSearch] = useState('');
  const [showTagDropdown, setShowTagDropdown] = useState(false);

  const [isCreatingCategory, setIsCreatingCategory] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [newCategoryParentId, setNewCategoryParentId] = useState<string | null>(null);
  const [newCategoryColor, setNewCategoryColor] = useState('#6366f1');
  const [newCategoryIsIncome, setNewCategoryIsIncome] = useState(false);
  const [creatingCategoryLoading, setCreatingCategoryLoading] = useState(false);

  useEffect(() => {
    setPayee(transaction.payee ?? '');
    setMemo(transaction.memo ?? '');
    setNotes(transaction.notes ?? '');
    setReviewed(!!transaction.reviewed);
    setCategoryId(transaction.categoryId);
    setTagIds(transaction.tags?.map((t) => t.id) ?? []);
    setIsCreatingCategory(false);
    setConfirmDelete(false);
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
    try {
      const res = await fetch(`/api/transactions/${transaction.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ payee, memo, notes, categoryId, reviewed, tagIds }),
      });
      if (res.ok) {
        onSuccess();
        onClose();
      }
    } finally {
      setSaving(false);
    }
  }, [transaction.id, payee, notes, memo, categoryId, tagIds, onSuccess, onClose]);

  const handleDelete = useCallback(async () => {
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    setDeleting(true);
    try {
      const res = await fetch(`/api/transactions/${transaction.id}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      if (res.ok) {
        onSuccess();
        onClose();
      }
    } catch (err) {
      console.error(err);
    } finally {
      setDeleting(false);
    }
  }, [transaction.id, confirmDelete, onSuccess, onClose]);

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

  const { text } = formatAmount(transaction.amount);

  const parents = categories.filter((c) => !c.parentId);
  const getChildren = (parentId: string) => categories.filter((c) => c.parentId === parentId);

  const selectedCat = categoryId ? categories.find((c) => c.id === categoryId) : null;
  const [showCategoryDropdown, setShowCategoryDropdown] = useState(false);
  const [categorySearch, setCategorySearch] = useState('');

  return (
    <Sheet open={open} onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="right" className="w-[420px] sm:w-[500px] overflow-y-auto">
        <SheetHeader className="mb-6">
          <SheetTitle>Transaction Details</SheetTitle>
        </SheetHeader>

        <div className="space-y-5">
          {/* Amount */}
          <div className="p-4 bg-card border border-border rounded-xl">
            <div className="text-xs text-muted-foreground">Amount</div>
            <div className={`font-mono text-2xl font-bold mt-1 text-foreground`}>{text}</div>
          </div>

          {/* Info */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <div className="text-xs text-muted-foreground">Date</div>
              <div className="text-sm text-foreground mt-0.5">{new Date(transaction.date).toLocaleDateString()}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Posted</div>
              <div className="text-sm text-foreground mt-0.5">
                {transaction.postedDate ? new Date(transaction.postedDate).toLocaleDateString() : '—'}
              </div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Account</div>
              <div className="text-sm text-foreground mt-0.5">{transaction.accountName || '—'}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Description</div>
              <div className="text-sm text-foreground mt-0.5 truncate">{transaction.description}</div>
            </div>
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
                      {transaction.categorizedByAi && <Sparkles className="h-3 w-3 flex-shrink-0 opacity-60 ml-auto" />}
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
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium"
                      style={{ backgroundColor: `${tag.color}22`, color: tag.color, border: `1px solid ${tag.color}44` }}
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
            {transaction.pending && (
              <span className="text-xs text-chart-3">Pending transaction</span>
            )}
          </div>

          {/* Action Buttons */}
          <div className="space-y-2 pt-2">
            <button
              onClick={handleSave}
              disabled={saving || deleting}
              className="w-full px-4 py-2.5 text-sm font-semibold text-primary-foreground bg-primary rounded-lg hover:opacity-90 disabled:opacity-50 transition-all"
            >
              {saving ? 'Saving...' : 'Save Changes'}
            </button>

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
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
