'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetClose } from '@/components/ui/sheet';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Search, Loader2 } from 'lucide-react';
import { HoldingPosition } from '@/lib/services/investments';

interface HoldingFormDrawerProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
  accountId: string;
  editHolding: {
    id: string;
    ticker: string;
    shares: number;
    costBasis: number;
    purchaseDate?: string | null;
    notes?: string | null;
  } | null;
}

interface TickerResult {
  ticker: string;
  name: string;
}

export function HoldingFormDrawer({
  open,
  onClose,
  onSuccess,
  accountId,
  editHolding,
}: HoldingFormDrawerProps) {
  const [ticker, setTicker] = useState('');
  const [name, setName] = useState('');
  const [shares, setShares] = useState('');
  const [costBasis, setCostBasis] = useState('');
  const [purchaseDate, setPurchaseDate] = useState('');
  const [notes, setNotes] = useState('');

  const [searchResults, setSearchResults] = useState<TickerResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const dropdownRef = useRef<HTMLDivElement>(null);

  // Debounced search logic for tickers
  useEffect(() => {
    if (editHolding) return; // Do not autocomplete ticker if we're editing
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
  }, [ticker, editHolding]);

  // Load values on open/change
  useEffect(() => {
    if (!open) return;

    if (editHolding) {
      setTicker(editHolding.ticker);
      setShares(String(editHolding.shares));
      setCostBasis(String(editHolding.costBasis));
      setPurchaseDate(editHolding.purchaseDate ? editHolding.purchaseDate.split('T')[0] : '');
      setNotes(editHolding.notes || '');
      setName('');
    } else {
      setTicker('');
      setName('');
      setShares('');
      setCostBasis('');
      setPurchaseDate('');
      setNotes('');
    }
    setError('');
    setSearchResults([]);
    setShowDropdown(false);
  }, [open, editHolding]);

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
    if (!ticker || !shares || !costBasis) {
      setError('Please fill in all required fields');
      return;
    }

    setSaving(true);
    setError('');

    try {
      const payload = {
        accountId,
        ticker: ticker.trim().toUpperCase(),
        shares: parseFloat(shares),
        costBasis: parseFloat(costBasis),
        purchaseDate: purchaseDate || null,
        notes: notes || null,
      };

      const url = editHolding 
        ? `/api/investments/holdings/${editHolding.id}` 
        : `/api/investments/holdings`;

      const method = editHolding ? 'PATCH' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to save holding');
      }

      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred while saving holding');
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
            {editHolding ? 'Edit Stock Position' : 'Add Stock Position'}
          </SheetTitle>
        </SheetHeader>

        <form onSubmit={handleSubmit} className="space-y-4 pt-5">
          {/* Ticker Search / Autocomplete */}
          <div className="space-y-1.5 relative" ref={dropdownRef}>
            <Label htmlFor="holding-ticker" className="text-xs font-semibold">Ticker Symbol *</Label>
            <div className="relative">
              <Input
                id="holding-ticker"
                value={ticker}
                onChange={(e) => setTicker(e.target.value)}
                placeholder="e.g. AAPL, MSFT, TSLA"
                disabled={!!editHolding}
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

          {/* Share Count */}
          <div className="space-y-1.5">
            <Label htmlFor="holding-shares" className="text-xs font-semibold">Number of Shares *</Label>
            <Input
              id="holding-shares"
              type="number"
              step="0.000001"
              min="0"
              value={shares}
              onChange={(e) => setShares(e.target.value)}
              placeholder="e.g. 10 or 1.25"
              required
            />
          </div>

          {/* Average Cost Basis */}
          <div className="space-y-1.5">
            <Label htmlFor="holding-cost" className="text-xs font-semibold">Average Cost Basis ($/share) *</Label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-xs">$</span>
              <Input
                id="holding-cost"
                type="number"
                step="0.0001"
                min="0"
                value={costBasis}
                onChange={(e) => setCostBasis(e.target.value)}
                placeholder="0.00"
                className="pl-7"
                required
              />
            </div>
          </div>

          {/* Purchase Date */}
          <div className="space-y-1.5">
            <Label htmlFor="holding-date" className="text-xs font-semibold">Purchase Date (optional)</Label>
            <Input
              id="holding-date"
              type="date"
              value={purchaseDate}
              onChange={(e) => setPurchaseDate(e.target.value)}
            />
          </div>

          {/* Notes */}
          <div className="space-y-1.5">
            <Label htmlFor="holding-notes" className="text-xs font-semibold">Notes (optional)</Label>
            <textarea
              id="holding-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Transaction notes or details"
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
              {saving ? 'Saving...' : editHolding ? 'Update Position' : 'Add Position'}
            </button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  );
}
