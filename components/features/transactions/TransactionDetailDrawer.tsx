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
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setPayee(transaction.payee ?? '');
    setNotes(transaction.notes ?? '');
    setCategoryId(transaction.categoryId);
  }, [transaction]);

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
              <div className="text-sm text-gray-500">Category</div>
              <div className="mt-0.5">
                {transaction.categoryName ? (
                  <span
                    className="px-2 py-0.5 text-xs rounded-full font-medium"
                    style={{
                      backgroundColor: `${transaction.categoryColor}33`,
                      color: transaction.categoryColor || '#6366f1',
                    }}
                  >
                    {transaction.categoryName}
                  </span>
                ) : (
                  <span className="text-xs text-gray-500">Uncategorized</span>
                )}
              </div>
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
