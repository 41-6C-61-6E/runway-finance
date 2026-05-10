'use client';

import { useState, useEffect, useCallback } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetClose } from '@/components/ui/sheet';

type Account = {
  id: string;
  name: string;
  type: string;
  balance: string;
  currency: string;
  institution: string | null;
  isHidden: boolean;
  isExcludedFromNetWorth: boolean;
  balanceDate: string | null;
};

interface AccountDetailDrawerProps {
  account: Account | null;
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export default function AccountDetailDrawer({ account, open, onClose, onSuccess }: AccountDetailDrawerProps) {
  if (!account) return null;

  const [name, setName] = useState(account.name);
  const [type, setType] = useState(account.type);
  const [isHidden, setIsHidden] = useState(account.isHidden);
  const [isExcludedFromNetWorth, setIsExcludedFromNetWorth] = useState(account.isExcludedFromNetWorth);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setName(account.name);
    setType(account.type);
    setIsHidden(account.isHidden);
    setIsExcludedFromNetWorth(account.isExcludedFromNetWorth);
  }, [account]);

  const handleSave = useCallback(async () => {
    setSaving(true);
    try {
      await fetch(`/api/accounts/${account.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ name, type, isHidden, isExcludedFromNetWorth }),
      });
      onSuccess();
    } finally {
      setSaving(false);
    }
  }, [account.id, name, type, isHidden, isExcludedFromNetWorth, onSuccess]);

  const formatBalance = (balance: string, currency: string) => {
    const num = parseFloat(balance);
    return {
      text: new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: currency || 'USD',
        minimumFractionDigits: 2,
      }).format(Math.abs(num)),
      color: 'text-gray-400',
    };
  };

  const { text, color } = formatBalance(account.balance, account.currency);

  return (
    <Sheet open={open} onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="right" className="w-[420px] sm:w-[500px] bg-gray-950/95 border-white/10">
        <SheetHeader className="mb-6">
          <SheetTitle className="text-white">Account Details</SheetTitle>
        </SheetHeader>

        <div className="space-y-6">
          {/* Balance display */}
          <div className="p-4 bg-white/5 rounded-xl border border-white/10">
            <div className="text-sm text-gray-400">Current Balance</div>
            <div className={`font-mono text-2xl font-bold mt-1 ${color} financial-value`}>{text}</div>
            <div className="text-xs text-gray-500 mt-1">{account.currency}</div>
          </div>

          {/* Editable fields */}
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">Name</label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-3 py-2 bg-white/10 border border-white/20 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">Type</label>
              <select
                value={type}
                onChange={(e) => setType(e.target.value)}
                className="w-full px-3 py-2 bg-white/10 border border-white/20 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="checking">Checking</option>
                <option value="savings">Savings</option>
                <option value="credit">Credit Card</option>
                <option value="investment">Investment</option>
                <option value="loan">Loan</option>
                <option value="other">Other</option>
              </select>
            </div>

            {/* Info fields (read-only) */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <div className="text-sm text-gray-500">Institution</div>
                <div className="text-sm text-white mt-0.5">{account.institution || '—'}</div>
              </div>
              <div>
                <div className="text-sm text-gray-500">Balance Date</div>
                <div className="text-sm text-white mt-0.5">
                  {account.balanceDate ? new Date(account.balanceDate).toLocaleDateString() : '—'}
                </div>
              </div>
            </div>

            {/* Toggles */}
            <div className="space-y-3 pt-2">
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-300">Hide from list</span>
                <button
                  onClick={() => setIsHidden(!isHidden)}
                  className={`relative w-11 h-6 rounded-full transition-colors ${isHidden ? 'bg-blue-600' : 'bg-gray-600'}`}
                >
                  <span
                    className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${isHidden ? 'translate-x-5' : 'translate-x-0'}`}
                  />
                </button>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-300">Exclude from net worth</span>
                <button
                  onClick={() => setIsExcludedFromNetWorth(!isExcludedFromNetWorth)}
                  className={`relative w-11 h-6 rounded-full transition-colors ${isExcludedFromNetWorth ? 'bg-blue-600' : 'bg-gray-600'}`}
                >
                  <span
                    className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${isExcludedFromNetWorth ? 'translate-x-5' : 'translate-x-0'}`}
                  />
                </button>
              </div>
            </div>
          </div>

          {/* Save button */}
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
