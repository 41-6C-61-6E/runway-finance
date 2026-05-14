'use client';

import { useState, useEffect, useCallback } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Switch } from '@/components/ui/switch';
import { Search } from 'lucide-react';

type Transaction = {
  id: string;
  date: string;
  postedDate: string | null;
  description: string;
  payee: string | null;
  amount: string;
  categoryId: string | null;
  categoryName: string | null;
  categoryColor: string | null;
  accountName: string | null;
  notes: string | null;
  reviewed: boolean | null;
  ignored: boolean | null;
  pending: boolean;
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
  const [notes, setNotes] = useState(transaction.notes ?? '');
  const [categoryId, setCategoryId] = useState(transaction.categoryId);
  const [categories, setCategories] = useState<Category[]>([]);
  const [categoriesLoading, setCategoriesLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setPayee(transaction.payee ?? '');
    setNotes(transaction.notes ?? '');
    setCategoryId(transaction.categoryId);
  }, [transaction]);

  useEffect(() => {
    if (open && categories.length === 0 && !categoriesLoading) {
      setCategoriesLoading(true);
      fetch('/api/categories', { credentials: 'include' })
        .then((res) => res.json())
        .then((data) => setCategories(Array.isArray(data) ? data : []))
        .catch(() => setCategories([]))
        .finally(() => setCategoriesLoading(false));
    }
  }, [open, categories.length, categoriesLoading]);

  const handleSave = useCallback(async () => {
    setSaving(true);
    try {
      const res = await fetch(`/api/transactions/${transaction.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ payee, notes, categoryId }),
      });
      if (res.ok) {
        onSuccess();
        onClose();
      }
    } finally {
      setSaving(false);
    }
  }, [transaction.id, payee, notes, categoryId, onSuccess, onClose]);

  const toggleField = async (field: 'reviewed' | 'ignored') => {
    await fetch(`/api/transactions/${transaction.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ [field]: !transaction[field] }),
    });
    onSuccess();
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
      <SheetContent side="right" className="w-[420px] sm:w-[500px]">
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
            <div className="relative">
              <button
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
                              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-muted-foreground hover:bg-muted transition-colors"
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
                                  <div className="flex items-center gap-2 px-3 py-2 text-xs font-medium text-muted-foreground bg-muted/30">
                                    <div className="w-2 h-2 rounded-full" style={{ backgroundColor: parent.color }} />
                                    {parent.name}
                                  </div>
                                  {childList.map((child) => (
                                    <button
                                      key={child.id}
                                      onClick={() => { setCategoryId(child.id); setShowCategoryDropdown(false); setCategorySearch(''); }}
                                      className={`w-full flex items-center gap-2 px-6 py-2 text-sm transition-colors ${
                                        categoryId === child.id
                                          ? 'text-primary bg-primary/10'
                                          : 'text-foreground/80 hover:bg-muted'
                                      }`}
                                    >
                                      <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: child.color }} />
                                      {child.name}
                                    </button>
                                  ))}
                                  {childList.length === 0 && !filter && (
                                    <button
                                      onClick={() => { setCategoryId(parent.id); setShowCategoryDropdown(false); setCategorySearch(''); }}
                                      className={`w-full flex items-center gap-2 px-6 py-2 text-sm transition-colors ${
                                        categoryId === parent.id
                                          ? 'text-primary bg-primary/10'
                                          : 'text-foreground/80 hover:bg-muted'
                                      }`}
                                    >
                                      <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: parent.color }} />
                                      {parent.name}
                                    </button>
                                  )}
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
              <Switch
                checked={!!transaction.reviewed}
                onCheckedChange={() => toggleField('reviewed')}
              />
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-foreground/80">Ignored</span>
              <Switch
                checked={!!transaction.ignored}
                onCheckedChange={() => toggleField('ignored')}
              />
            </div>
            {transaction.pending && (
              <span className="text-xs text-chart-3">Pending transaction</span>
            )}
          </div>

          {/* Save */}
          <button
            onClick={handleSave}
            disabled={saving}
            className="w-full px-4 py-2.5 text-sm font-semibold text-primary-foreground bg-primary rounded-lg hover:opacity-90 disabled:opacity-50 transition-all"
          >
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
