'use client';

import { useState, useEffect, useCallback } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetClose } from '@/components/ui/sheet';
import { Switch } from '@/components/ui/switch';

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
  metadata?: Record<string, unknown> | null;
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
    };
  };

  const { text } = formatBalance(account.balance, account.currency);

  return (
    <Sheet open={open} onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="right" className="w-[420px] sm:w-[500px]">
        <SheetHeader className="mb-6">
          <SheetTitle>Account Details</SheetTitle>
        </SheetHeader>

        <div className="space-y-5">
          {/* Balance display */}
          <div className="p-4 bg-card border border-border rounded-xl">
            <div className="text-xs text-muted-foreground">Current Balance</div>
            <div className={`font-mono text-2xl font-bold mt-1 text-foreground financial-value`}>{text}</div>
            <div className="text-xs text-muted-foreground mt-1">{account.currency}</div>
          </div>

          {/* Editable fields */}
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">Name</label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-3 py-2 bg-background border border-input rounded-lg text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-foreground mb-1">Type</label>
              <select
                value={type}
                onChange={(e) => setType(e.target.value)}
                className="w-full px-3 py-2 bg-background border border-input rounded-lg text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="checking">Checking</option>
                <option value="savings">Savings</option>
                <option value="credit">Credit Card</option>
                <option value="investment">Investment</option>
                <option value="loan">Loan</option>
                <option value="mortgage">Mortgage</option>
                <option value="realestate">Real Estate</option>
                <option value="vehicle">Vehicle</option>
                <option value="crypto">Bitcoin / Crypto</option>
                <option value="metals">Metals</option>
                <option value="otherAsset">Other Asset</option>
                <option value="other">Other</option>
              </select>
            </div>

            {/* Info fields (read-only) */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <div className="text-xs text-muted-foreground">Institution</div>
                <div className="text-sm text-foreground mt-0.5">{account.institution || '—'}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Balance Date</div>
                <div className="text-sm text-foreground mt-0.5">
                  {account.balanceDate ? new Date(account.balanceDate).toLocaleDateString() : '—'}
                </div>
              </div>
            </div>

            {/* Metadata display for manual accounts */}
            {account.metadata && Object.keys(account.metadata).length > 0 && (
              <div className="p-3 bg-muted/30 border border-border rounded-lg">
                <div className="text-xs text-muted-foreground mb-1">Asset Details</div>
                {Object.entries(account.metadata).map(([key, value]) => (
                  <div key={key} className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground capitalize">{key.replace(/([A-Z])/g, ' $1').trim()}</span>
                    <span className="text-foreground font-mono text-xs">{String(value)}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Toggles */}
            <div className="space-y-3 pt-1">
              <div className="flex items-center justify-between">
                <span className="text-sm text-foreground/80">Hide from list</span>
                <Switch
                  checked={isHidden}
                  onCheckedChange={setIsHidden}
                />
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-foreground/80">Exclude from net worth</span>
                <Switch
                  checked={isExcludedFromNetWorth}
                  onCheckedChange={setIsExcludedFromNetWorth}
                />
              </div>
            </div>
          </div>

          {/* Save button */}
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
