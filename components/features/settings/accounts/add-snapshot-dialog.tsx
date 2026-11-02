'use client';

import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';

interface AddSnapshotDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  isMetalsAdjust: boolean;
  adjustValue: string;
  setAdjustValue: (val: string) => void;
  adjustDate: string;
  setAdjustDate: (val: string) => void;
  adjustNote: string;
  setAdjustNote: (val: string) => void;
  adjustLoading: boolean;
  handleAdjust: () => void;
  onCancel: () => void;
}

export function AddSnapshotDialog({
  open,
  onOpenChange,
  isMetalsAdjust,
  adjustValue,
  setAdjustValue,
  adjustDate,
  setAdjustDate,
  adjustNote,
  setAdjustNote,
  adjustLoading,
  handleAdjust,
  onCancel,
}: AddSnapshotDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Add Balance Snapshot</DialogTitle>
          <DialogDescription>
            {isMetalsAdjust
              ? 'Record the gold/silver ounces you held at a specific point in time. The dollar value will be calculated using the spot price.'
              : 'A snapshot logs your account balance at a specific point in time. Adding historical snapshots helps build a timeline of your balances to plot your net worth history.'}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">
              {isMetalsAdjust ? 'Amount (oz)' : 'Snapshot Balance'}
            </label>
            <Input
              type="number"
              step="0.01"
              value={adjustValue}
              onChange={(e) => setAdjustValue(e.target.value)}
              placeholder={isMetalsAdjust ? 'e.g., 10.5' : 'Enter balance amount'}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">Snapshot Date</label>
            <Input
              type="date"
              value={adjustDate}
              onChange={(e) => setAdjustDate(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">Note (optional)</label>
            <Input
              value={adjustNote}
              onChange={(e) => setAdjustNote(e.target.value)}
              placeholder="e.g., Year-end statement balance"
            />
          </div>
        </div>
        <DialogFooter>
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 text-sm text-foreground bg-muted hover:bg-accent rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleAdjust}
            disabled={adjustLoading}
            className="px-4 py-2 text-sm font-semibold text-primary-foreground bg-primary rounded-lg hover:opacity-90 disabled:opacity-50 transition-all"
          >
            {adjustLoading ? 'Saving...' : 'Save'}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
