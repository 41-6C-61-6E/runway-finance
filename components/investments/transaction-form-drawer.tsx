'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetClose } from '@/components/ui/sheet';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Search, Loader2 } from 'lucide-react';

interface TransactionFormDrawerProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
  accountId: string;
  editTransaction: {
    id: string;
    accountId?: string;
    ticker: string;
    type: 'buy' | 'sell' | 'dividend' | 'split';
    shares: number | string;
    pricePerShare: number | string;
    commission?: number | string;
    transactionDate: string;
    notes?: string | null;
  } | null;
}

interface TickerResult {
  ticker: string;
  name: string;
}

const transactionTypes = [
  { value: 'buy', label: 'Buy Stock' },
  { value: 'sell', label: 'Sell Stock' },
  { value: 'dividend', label: 'Reinvested Dividend' },
  { value: 'split', label: 'Stock Split' },
];

export function TransactionFormDrawer({
  open,
  onClose,
  onSuccess,
  accountId,
  editTransaction,
}: TransactionFormDrawerProps) {
  const [type, setType] = useState<'buy' | 'sell' | 'dividend' | 'split'>('buy');
  const [ticker, setTicker] = useState('');
  const [name, setName] = useState('');
  const [shares, setShares] = useState('');
  const [pricePerShare, setPricePerShare] = useState('');
  const [commission, setCommission] = useState('0');
  const [transactionDate, setTransactionDate] = useState('');
  const [notes, setNotes] = useState('');

  const [searchResults, setSearchResults] = useState<TickerResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const dropdownRef = useRef<HTMLDivElement>(null);

  // Debounced search logic for tickers
  useEffect(() => {
    if (editTransaction) return; // Do not autocomplete ticker if we're editing
    if (ticker.trim().length < 1) {
      setSearchResults([]);
      return;
    }

    const delayDebounce = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await fetch(`/api/investments/tickers/search?q=${encodeURIComponent(ticker)}`, {
          credentials: 'include',
        });
        if (res.ok) {
          const data = await res.json();
          setSearchResults(data);
          setShowDropdown(data.length > 0);
        }
      } catch (err) {
        console.error('Failed to search ticker', err);
      } finally {
        setSearching(false);
      }
    }, 350);

    return () => clearTimeout(delayDebounce);
  }, [ticker, editTransaction]);

  // Load values on open/change
  useEffect(() => {
    if (!open) return;

    if (editTransaction) {
      setType(editTransaction.type);
      setTicker(editTransaction.ticker);
      setShares(String(Math.abs(Number(editTransaction.shares))));
      setPricePerShare(String(editTransaction.pricePerShare));
      setCommission(String(editTransaction.commission || 0));
      setTransactionDate(editTransaction.transactionDate.split('T')[0]);
      setNotes(editTransaction.notes || '');
      setName('');
    } else {
      setType('buy');
      setTicker('');
      setName('');
      setShares('');
      setPricePerShare('');
      setCommission('0');
      setTransactionDate(new Date().toISOString().split('T')[0]);
      setNotes('');
    }
    setError('');
    setSearchResults([]);
    setShowDropdown(false);
  }, [open, editTransaction]);

  // Close dropdown on click outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowDropdown(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ticker || !shares || (type !== 'split' && !pricePerShare) || !transactionDate) {
      setError('Please fill in all required fields');
      return;
    }

    setSaving(true);
    setError('');

    try {
      const payload = {
        accountId,
        ticker: ticker.trim().toUpperCase(),
        type,
        shares: parseFloat(shares),
        pricePerShare: type === 'split' ? 0 : parseFloat(pricePerShare),
        commission: type === 'split' ? 0 : parseFloat(commission || '0'),
        transactionDate,
        notes: notes || null,
      };

      const url = editTransaction 
        ? `/api/investments/transactions/${editTransaction.id}` 
        : `/api/investments/transactions`;

      const method = editTransaction ? 'PATCH' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to save transaction');
      }

      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred while saving transaction');
    } finally {
      setSaving(false);
    }
  };

  const handleSelectTicker = (item: TickerResult) => {
    setTicker(item.ticker);
    setName(item.name);
    setShowDropdown(false);
  };

  return (
    <Sheet open={open} onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="right" className="w-[420px] sm:w-[500px] overflow-y-auto bg-card/95 backdrop-blur-lg border-l border-border/40">
        <SheetHeader className="pb-4 border-b border-border/20">
          <SheetTitle className="text-lg font-bold text-foreground">
            {editTransaction ? 'Edit Transaction' : 'Log Transaction'}
          </SheetTitle>
        </SheetHeader>

        <form onSubmit={handleSubmit} className="space-y-4 pt-5">
          {/* Transaction Type */}
          <div className="space-y-1.5">
            <Label htmlFor="txn-type" className="text-xs font-semibold">Transaction Type *</Label>
            <select
              id="txn-type"
              value={type}
              onChange={(e) => setType(e.target.value as any)}
              className="w-full px-3 py-2 rounded-xl border border-border/40 bg-muted/40 text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 cursor-pointer"
            >
              {transactionTypes.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </div>

          {/* Ticker Search / Autocomplete */}
          <div className="space-y-1.5 relative" ref={dropdownRef}>
            <Label htmlFor="txn-ticker" className="text-xs font-semibold">Ticker Symbol *</Label>
            <div className="relative">
              <Input
                id="txn-ticker"
                value={ticker}
                onChange={(e) => setTicker(e.target.value)}
                placeholder="e.g. AAPL, MSFT, TSLA"
                disabled={!!editTransaction}
                required
                className="pr-10"
                autoComplete="off"
              />
              <div className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                {searching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
              </div>
            </div>

            {name && (
              <p className="text-[10px] text-emerald-500 font-semibold mt-0.5">
                Selected: {name}
              </p>
            )}

            {/* Autocomplete Dropdown */}
            {showDropdown && searchResults.length > 0 && (
              <div className="absolute z-50 left-0 right-0 mt-1 bg-card border border-border/60 rounded-xl shadow-xl max-h-56 overflow-y-auto divide-y divide-border/20">
                {searchResults.map((item) => (
                  <button
                    key={item.ticker}
                    type="button"
                    onClick={() => handleSelectTicker(item)}
                    className="w-full px-4 py-2.5 text-left text-xs transition-colors hover:bg-muted/50 flex flex-col gap-0.5"
                  >
                    <span className="font-bold text-foreground">{item.ticker}</span>
                    <span className="text-[10px] text-muted-foreground truncate">{item.name}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Date */}
          <div className="space-y-1.5">
            <Label htmlFor="txn-date" className="text-xs font-semibold">Transaction Date *</Label>
            <Input
              id="txn-date"
              type="date"
              value={transactionDate}
              onChange={(e) => setTransactionDate(e.target.value)}
              required
            />
          </div>

          {/* Shares / Split Ratio */}
          <div className="space-y-1.5">
            <Label htmlFor="txn-shares" className="text-xs font-semibold">
              {type === 'split' ? 'Split Ratio (e.g. 2 for 2-for-1)' : 'Number of Shares *'}
            </Label>
            <Input
              id="txn-shares"
              type="number"
              step="0.000001"
              min="0.000001"
              value={shares}
              onChange={(e) => setShares(e.target.value)}
              placeholder={type === 'split' ? 'e.g. 2' : 'e.g. 10'}
              required
            />
          </div>

          {/* Price per Share (shown if type != split) */}
          {type !== 'split' && (
            <div className="space-y-1.5">
              <Label htmlFor="txn-price" className="text-xs font-semibold">Price per Share *</Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-xs">$</span>
                <Input
                  id="txn-price"
                  type="number"
                  step="0.0001"
                  min="0"
                  value={pricePerShare}
                  onChange={(e) => setPricePerShare(e.target.value)}
                  placeholder="0.00"
                  className="pl-7"
                  required
                />
              </div>
            </div>
          )}

          {/* Commission (shown if type != split) */}
          {type !== 'split' && (
            <div className="space-y-1.5">
              <Label htmlFor="txn-commission" className="text-xs font-semibold">Commission (optional)</Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-xs">$</span>
                <Input
                  id="txn-commission"
                  type="number"
                  step="0.01"
                  min="0"
                  value={commission}
                  onChange={(e) => setCommission(e.target.value)}
                  placeholder="0.00"
                  className="pl-7"
                />
              </div>
            </div>
          )}

          {/* Notes */}
          <div className="space-y-1.5">
            <Label htmlFor="txn-notes" className="text-xs font-semibold">Notes (optional)</Label>
            <textarea
              id="txn-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. Dividend reinvestment, portfolio transfer"
              className="w-full min-h-[70px] px-3 py-2 rounded-lg border border-border/40 bg-background text-foreground text-xs focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>

          {/* Error Message */}
          {error && (
            <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-500 text-xs">
              {error}
            </div>
          )}

          {/* Footer actions */}
          <div className="flex justify-end gap-3 pt-4 border-t border-border/20">
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
              {saving ? 'Saving...' : editTransaction ? 'Update Transaction' : 'Log Transaction'}
            </button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  );
}
