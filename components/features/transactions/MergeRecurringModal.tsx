'use client';

import { useState, useEffect, useMemo } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Merge, Sparkles, Loader2, Check, Search, ArrowRight } from 'lucide-react';
import { formatCurrency } from '@/lib/utils/format';
import { toast } from 'sonner';
import type { RecurringItem } from './RecurringCard';
import { cn } from '@/lib/utils';

interface MergeRecurringModalProps {
  open: boolean;
  onClose: () => void;
  /** When merging 2+ selected items in bulk */
  selectedItems?: RecurringItem[];
  /** When merging a single source item into another target item */
  sourceItem?: RecurringItem | null;
  /** All available items to choose a target from when sourceItem is provided */
  allItems?: RecurringItem[];
  onSuccess: () => void;
}

export function MergeRecurringModal({
  open,
  onClose,
  selectedItems,
  sourceItem,
  allItems = [],
  onSuccess,
}: MergeRecurringModalProps) {
  const isSingleSourceMode = !!sourceItem;

  const [targetId, setTargetId] = useState<string>('');
  const [customName, setCustomName] = useState<string>('');
  const [searchTarget, setSearchTarget] = useState<string>('');
  const [merging, setMerging] = useState(false);

  // Available target candidates when in single source mode
  const singleModeCandidates = useMemo(() => {
    if (!sourceItem) return [];
    const others = allItems.filter((i) => i.id !== sourceItem.id && !i.isDismissed);
    if (!searchTarget.trim()) return others;
    const q = searchTarget.toLowerCase().trim();
    return others.filter(
      (i) =>
        i.displayName.toLowerCase().includes(q) ||
        i.merchantName.toLowerCase().includes(q)
    );
  }, [allItems, sourceItem, searchTarget]);

  useEffect(() => {
    if (open) {
      setSearchTarget('');
      if (isSingleSourceMode && sourceItem) {
        // Initial default: pick first other item if available
        const defaultOther = allItems.find((i) => i.id !== sourceItem.id && !i.isDismissed);
        setTargetId(defaultOther?.id || '');
        setCustomName(sourceItem.customName || sourceItem.merchantName || '');
      } else if (selectedItems && selectedItems.length > 0) {
        const defaultTarget = selectedItems.find((i) => i.isConfirmed) || selectedItems[0];
        setTargetId(defaultTarget.id);
        setCustomName(defaultTarget.customName || defaultTarget.merchantName || '');
      }
    }
  }, [open, isSingleSourceMode, sourceItem, selectedItems, allItems]);

  const targetItem = useMemo(() => {
    if (isSingleSourceMode) {
      return allItems.find((i) => i.id === targetId);
    }
    return selectedItems?.find((i) => i.id === targetId);
  }, [isSingleSourceMode, allItems, selectedItems, targetId]);

  const handleMerge = async () => {
    let finalTargetId = '';
    let finalSourceIds: string[] = [];

    if (isSingleSourceMode && sourceItem) {
      if (!targetId) {
        toast.error('Please select a destination subscription to merge with');
        return;
      }
      finalTargetId = targetId;
      finalSourceIds = [sourceItem.id];
    } else if (selectedItems && selectedItems.length >= 2) {
      if (!targetId) {
        toast.error('Please select a primary target subscription');
        return;
      }
      finalTargetId = targetId;
      finalSourceIds = selectedItems.filter((i) => i.id !== targetId).map((i) => i.id);
    } else {
      toast.error('Select items to merge');
      return;
    }

    setMerging(true);
    try {
      const res = await fetch('/api/recurring/merge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          targetId: finalTargetId,
          sourceIds: finalSourceIds,
          customName: customName.trim() || undefined,
        }),
      });

      if (res.ok) {
        toast.success(`Successfully merged subscriptions into "${customName || targetItem?.displayName}"`);
        onClose();
        onSuccess();
      } else {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error || 'Failed to merge items');
      }
    } catch {
      toast.error('Network error during merge');
    } finally {
      setMerging(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
              <Merge className="w-4 h-4" />
            </div>
            <div>
              <DialogTitle className="text-base font-bold text-foreground">
                Merge Recurring Subscriptions
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground">
                {isSingleSourceMode && sourceItem
                  ? `Merge "${sourceItem.displayName}" into another existing subscription rule.`
                  : `Combine ${selectedItems?.length || 0} selected subscriptions into a single unified rule.`}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-4 pt-2">
          {/* Case 1: Single Source Mode (Select 1 Destination Item) */}
          {isSingleSourceMode && sourceItem ? (
            <div className="space-y-3">
              {/* Source item preview */}
              <div className="p-3 rounded-xl bg-muted/40 border border-border/60 text-xs">
                <span className="text-[10px] uppercase font-bold text-muted-foreground block mb-1">
                  Source Item (will be combined)
                </span>
                <div className="flex items-center justify-between font-medium text-foreground">
                  <span>{sourceItem.displayName}</span>
                  <span className="font-mono font-bold">{formatCurrency(sourceItem.averageAmount)}/mo</span>
                </div>
              </div>

              {/* Destination selector search */}
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Select Destination Subscription
                </Label>
                <div className="relative">
                  <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={searchTarget}
                    onChange={(e) => setSearchTarget(e.target.value)}
                    placeholder="Search destination subscription..."
                    className="pl-8 text-xs h-8"
                  />
                </div>

                <div className="space-y-1.5 border border-border/60 rounded-xl p-2 bg-card max-h-[160px] overflow-y-auto divide-y divide-border/30">
                  {singleModeCandidates.length === 0 ? (
                    <div className="py-4 text-center text-xs text-muted-foreground">
                      No matching subscription found.
                    </div>
                  ) : (
                    singleModeCandidates.map((item) => {
                      const isSelected = item.id === targetId;

                      return (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => {
                            setTargetId(item.id);
                            setCustomName(item.customName || item.merchantName);
                          }}
                          className={cn(
                            'w-full p-2 rounded-lg text-left text-xs flex items-center justify-between transition-colors cursor-pointer',
                            isSelected
                              ? 'bg-primary/10 text-foreground font-semibold'
                              : 'hover:bg-muted/40 text-muted-foreground'
                          )}
                        >
                          <div className="min-w-0 truncate">
                            <div className="text-foreground font-medium truncate">
                              {item.displayName}
                            </div>
                            <div className="text-[10px] text-muted-foreground">
                              {formatCurrency(item.monthlyAmount)}/mo • {item.occurrenceCount} occurrences
                            </div>
                          </div>
                          {isSelected && <Check className="w-4 h-4 text-primary shrink-0 ml-2" />}
                        </button>
                      );
                    })
                  )}
                </div>
              </div>
            </div>
          ) : (
            /* Case 2: Multi-select Mode */
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Primary Subscription (Target)
              </Label>
              <div className="space-y-2 border border-border/60 rounded-xl p-2 bg-card max-h-[160px] overflow-y-auto divide-y divide-border/30">
                {selectedItems?.map((item) => {
                  const isSelected = item.id === targetId;

                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => {
                        setTargetId(item.id);
                        setCustomName(item.customName || item.merchantName);
                      }}
                      className={cn(
                        'w-full p-2 rounded-lg text-left text-xs flex items-center justify-between transition-colors cursor-pointer',
                        isSelected
                          ? 'bg-primary/10 text-foreground font-semibold'
                          : 'hover:bg-muted/40 text-muted-foreground'
                      )}
                    >
                      <div className="min-w-0 truncate">
                        <div className="text-foreground font-medium truncate">
                          {item.displayName}
                        </div>
                        <div className="text-[10px] text-muted-foreground">
                          {formatCurrency(item.monthlyAmount)}/mo • {item.occurrenceCount} occurrences
                        </div>
                      </div>
                      {isSelected && <Check className="w-4 h-4 text-primary shrink-0 ml-2" />}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Unified Custom Name */}
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Unified Display Name
            </Label>
            <Input
              value={customName}
              onChange={(e) => setCustomName(e.target.value)}
              placeholder="e.g. Netflix Standard Subscription"
              className="text-xs h-9"
            />
          </div>

          {/* Explanation */}
          <div className="p-3 rounded-xl bg-muted/30 border border-border/60 space-y-1 text-xs text-muted-foreground">
            <div className="font-semibold text-foreground flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-primary" />
              Pattern Combination
            </div>
            <p className="leading-relaxed text-[11px]">
              Transaction matcher patterns will be merged. Both merchant names will automatically map to this unified subscription.
            </p>
          </div>

          <p className="text-xs text-amber-600 dark:text-amber-400">
            Source items will be permanently deleted and their history will be kept on the target.
          </p>
        </div>

        <DialogFooter className="pt-3">
          <Button variant="ghost" size="sm" onClick={onClose} className="text-xs h-8">
            Cancel
          </Button>
          <Button
            size="sm"
            onClick={handleMerge}
            disabled={merging || !targetId}
            className="text-xs h-8 font-semibold"
          >
            {merging ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" /> : <Merge className="w-3.5 h-3.5 mr-1.5" />}
            Confirm Merge
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
