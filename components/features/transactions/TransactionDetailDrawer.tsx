'use client';

import { useState, useEffect, useCallback } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';

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
      await fetch(`/api/transactions/${transaction.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ payee: payee || null, notes: notes || null, categoryId }),
      });
      onSuccess();
    } finally {
      setSaving(false);
    }
  }, [transaction.id, payee, notes, categoryId, onSuccess]);

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
      color: 'text-gray-400',
    };
  };

  const { text, color } = formatAmount(transaction.amount);

  const parents = categories.filter((c) => !c.parentId);
  const getChildren = (parentId: string) => categories.filter((c) => c.parentId === parentId);

  const selectedCat = categoryId ? categories.find((c) => c.id === categoryId) : null;
  const [showCategoryDropdown, setShowCategoryDropdown] = useState(false);

  return (
    <Sheet open={open} onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="right" className="w-[420px] sm:w-[500px] bg-gray-950/95 border-white/10">
        <SheetHeader className="mb-6">
          <SheetTitle className="text-white">Transaction Details</SheetTitle>
        </SheetHeader>

        <div className="space-y-6">
          {/* Amount */}
          <div className="p-4 bg-white/5 rounded-xl border border-white/10">
            <div className="text-sm text-gray-400">Amount</div>
            <div className={`font-mono text-2xl font-bold mt-1 ${color}`}>{text}</div>
          </div>

          {/* Info */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <div className="text-sm text-gray-500">Date</div>
              <div className="text-sm text-white mt-0.5">{new Date(transaction.date).toLocaleDateString()}</div>
            </div>
            <div>
              <div className="text-sm text-gray-500">Posted</div>
              <div className="text-sm text-white mt-0.5">
                {transaction.postedDate ? new Date(transaction.postedDate).toLocaleDateString() : '—'}
              </div>
            </div>
            <div>
              <div className="text-sm text-gray-500">Account</div>
              <div className="text-sm text-white mt-0.5">{transaction.accountName || '—'}</div>
            </div>
            <div>
              <div className="text-sm text-gray-500">Description</div>
              <div className="text-sm text-white mt-0.5 truncate">{transaction.description}</div>
            </div>
          </div>

          {/* Category Selector */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1.5">Category</label>
            <div className="relative">
              <button
                onClick={() => setShowCategoryDropdown(!showCategoryDropdown)}
                className="w-full flex items-center gap-2 px-3 py-2 bg-white/10 border border-white/20 rounded-lg text-sm text-white hover:bg-white/15 transition-colors text-left"
              >
                {selectedCat ? (
                  <>
                    <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: selectedCat.color }} />
                    <span>{selectedCat.name}</span>
                  </>
                ) : (
                  <span className="text-gray-400">Uncategorized</span>
                )}
                <span className="ml-auto text-gray-500">▼</span>
              </button>

              {showCategoryDropdown && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setShowCategoryDropdown(false)} />
                  <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-gray-900 border border-white/10 rounded-lg shadow-xl max-h-64 overflow-y-auto">
                    <button
                      onClick={() => { setCategoryId(null); setShowCategoryDropdown(false); }}
                      className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-400 hover:bg-white/5 transition-colors"
                    >
                      None (uncategorized)
                    </button>
                    {parents.map((parent) => (
                      <div key={parent.id}>
                        <div className="flex items-center gap-2 px-3 py-2 text-xs font-medium text-gray-500 bg-white/[0.02]">
                          <div className="w-2 h-2 rounded-full" style={{ backgroundColor: parent.color }} />
                          {parent.name}
                        </div>
                        {getChildren(parent.id).map((child) => (
                          <button
                            key={child.id}
                            onClick={() => { setCategoryId(child.id); setShowCategoryDropdown(false); }}
                            className={`w-full flex items-center gap-2 px-6 py-2 text-sm transition-colors ${
                              categoryId === child.id
                                ? 'text-white bg-blue-600/20'
                                : 'text-gray-300 hover:bg-white/5'
                            }`}
                          >
                            <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: child.color }} />
                            {child.name}
                          </button>
                        ))}
                        {getChildren(parent.id).length === 0 && (
                          <button
                            key={parent.id}
                            onClick={() => { setCategoryId(parent.id); setShowCategoryDropdown(false); }}
                            className={`w-full flex items-center gap-2 px-6 py-2 text-sm transition-colors ${
                              categoryId === parent.id
                                ? 'text-white bg-blue-600/20'
                                : 'text-gray-300 hover:bg-white/5'
                            }`}
                          >
                            <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: parent.color }} />
                            {parent.name}
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Editable */}
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">Payee</label>
              <input
                value={payee}
                onChange={(e) => setPayee(e.target.value)}
                onBlur={handleSave}
                className="w-full px-3 py-2 bg-white/10 border border-white/20 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Enter payee"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">Notes</label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                onBlur={handleSave}
                rows={3}
                className="w-full px-3 py-2 bg-white/10 border border-white/20 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                placeholder="Add notes"
              />
            </div>
          </div>

          {/* Toggles */}
          <div className="space-y-3 pt-2">
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-300">Reviewed</span>
              <button
                onClick={() => toggleField('reviewed')}
                className={`relative w-11 h-6 rounded-full transition-colors ${transaction.reviewed ? 'bg-blue-600' : 'bg-gray-600'}`}
              >
                <span
                  className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${transaction.reviewed ? 'translate-x-5' : 'translate-x-0'}`}
                />
              </button>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-300">Ignored</span>
              <button
                onClick={() => toggleField('ignored')}
                className={`relative w-11 h-6 rounded-full transition-colors ${transaction.ignored ? 'bg-blue-600' : 'bg-gray-600'}`}
              >
                <span
                  className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${transaction.ignored ? 'translate-x-5' : 'translate-x-0'}`}
                />
              </button>
            </div>
            {transaction.pending && (
              <span className="text-xs text-amber-400">Pending transaction</span>
            )}
          </div>

          {/* Save */}
          <button
            onClick={handleSave}
            disabled={saving}
            className="w-full px-4 py-2.5 text-sm font-semibold text-white bg-gradient-to-r from-blue-600 to-purple-600 rounded-lg hover:from-blue-700 hover:to-purple-700 disabled:opacity-50 transition-all"
          >
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
