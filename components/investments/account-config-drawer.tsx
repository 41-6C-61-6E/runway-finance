'use client';

import { useState, useEffect } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetClose } from '@/components/ui/sheet';
import { Label } from '@/components/ui/label';
import { InvestmentAccountDetails } from '@/lib/services/investments';

interface AccountConfigDrawerProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
  account: InvestmentAccountDetails | null;
}

export function AccountConfigDrawer({ open, onClose, onSuccess, account }: AccountConfigDrawerProps) {
  const [trackingMode, setTrackingMode] = useState<'balance_only' | 'positions' | 'transactions'>('balance_only');
  const [cashReconciliationMode, setCashReconciliationMode] = useState<'automated' | 'manual'>('automated');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open || !account) return;

    setTrackingMode(account.trackingMode);
    setCashReconciliationMode(account.cashReconciliationMode);
    setError('');
  }, [open, account]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!account) return;

    setSaving(true);
    setError('');

    try {
      // Fetch full account info to merge metadata
      const fetchRes = await fetch(`/api/accounts/${account.id}`, { credentials: 'include' });
      if (!fetchRes.ok) {
        throw new Error('Failed to load existing account details');
      }
      const existingAccount = await fetchRes.json();

      const oldMetadata = typeof existingAccount.metadata === 'string' 
        ? JSON.parse(existingAccount.metadata) 
        : (existingAccount.metadata || {});

      const updatedMetadata = {
        ...oldMetadata,
        trackingMode,
        cashReconciliationMode,
      };

      const res = await fetch(`/api/accounts/${account.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          metadata: updatedMetadata,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to save account settings');
      }

      // Sync the user investments snapshots/balances in background
      fetch('/api/investments/sync', { method: 'POST', credentials: 'include' }).catch(() => {});

      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save account settings');
    } finally {
      setSaving(false);
    }
  };

  if (!account) return null;

  return (
    <Sheet open={open} onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="right" className="w-[420px] sm:w-[500px] overflow-y-auto bg-card/95 backdrop-blur-lg border-l border-border/40">
        <SheetHeader className="pb-4 border-b border-border/20">
          <SheetTitle className="text-lg font-bold text-foreground">Configure Account</SheetTitle>
          <p className="text-xs text-muted-foreground">
            Configure how holdings and cash are reconciled for <span className="font-semibold text-foreground">{account.name}</span>
          </p>
        </SheetHeader>

        <form onSubmit={handleSubmit} className="space-y-6 pt-5">
          {/* Tracking Mode */}
          <div className="space-y-2">
            <Label htmlFor="tracking-mode" className="text-sm font-semibold">Tracking Mode</Label>
            <select
              id="tracking-mode"
              value={trackingMode}
              onChange={(e) => setTrackingMode(e.target.value as any)}
              className="w-full px-3 py-2 rounded-xl border border-border/40 bg-muted/40 text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 cursor-pointer"
            >
              <option value="balance_only">Balance Only (Legacy / Simple)</option>
              <option value="positions">Positions Mode (Static stock count & basis)</option>
              <option value="transactions">Transactions Mode (Buy/Sell Ledger rollups)</option>
            </select>
            <p className="text-[11px] text-muted-foreground leading-relaxed">
              {trackingMode === 'balance_only' && 'Only the total account balance synced from bank/manual is shown. Individual stocks are ignored.'}
              {trackingMode === 'positions' && 'Allows adding/editing the share count and average cost basis per stock. Good for quick manual tracking.'}
              {trackingMode === 'transactions' && 'Automatically computes positions and basis from a ledger of buys, sells, splits, and dividends.'}
            </p>
          </div>

          {/* Cash Reconciliation Mode */}
          {trackingMode !== 'balance_only' && (
            <div className="space-y-2">
              <Label htmlFor="cash-mode" className="text-sm font-semibold">Cash Sweep / Reconciliation</Label>
              <select
                id="cash-mode"
                value={cashReconciliationMode}
                onChange={(e) => setCashReconciliationMode(e.target.value as any)}
                className="w-full px-3 py-2 rounded-xl border border-border/40 bg-muted/40 text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 cursor-pointer"
              >
                <option value="automated">Automated Cash Sweep (Synced Balance - Stock Values)</option>
                <option value="manual">Manual Cash (Track cash as a manual holding)</option>
              </select>
              <p className="text-[11px] text-muted-foreground leading-relaxed">
                {cashReconciliationMode === 'automated' && 'Automatically calculates cash sweeps. If your total account balance is $10k and your stocks are worth $7k, $3k is swept to virtual cash.'}
                {cashReconciliationMode === 'manual' && 'Ignores the account balance for cash calculations. You must record cash balances manually.'}
              </p>
            </div>
          )}

          {/* Error Message */}
          {error && (
            <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-500 text-xs">
              {error}
            </div>
          )}

          {/* Footer Actions */}
          <div className="flex justify-end gap-3 pt-6 border-t border-border/20">
            <SheetClose asChild>
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-xs font-semibold rounded-xl bg-muted/40 hover:bg-muted text-muted-foreground hover:text-foreground transition-colors border border-border/30"
              >
                Cancel
              </button>
            </SheetClose>
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 text-xs font-semibold bg-primary text-primary-foreground rounded-xl hover:opacity-90 disabled:opacity-50 transition-all border border-primary/20"
            >
              {saving ? 'Saving...' : 'Save Settings'}
            </button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  );
}
