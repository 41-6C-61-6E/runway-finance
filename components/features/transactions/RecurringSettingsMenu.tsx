'use client';

import { useState } from 'react';
import {
  Settings,
  SlidersHorizontal,
  RefreshCw,
  EyeOff,
  Trash2,
  Loader2,
} from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { ConfirmDeleteDialog } from '@/components/ui/confirm-delete-dialog';
import { RecurringExclusionsDialog } from './RecurringExclusionsDialog';
import { toast } from 'sonner';

interface RecurringSettingsMenuProps {
  onScan: () => Promise<void>;
  onRefresh: () => void;
  scanning?: boolean;
}

export function RecurringSettingsMenu({
  onScan,
  onRefresh,
  scanning = false,
}: RecurringSettingsMenuProps) {
  const [showMenu, setShowMenu] = useState(false);
  const [showExclusionsDialog, setShowExclusionsDialog] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [dismissAllConfirmOpen, setDismissAllConfirmOpen] = useState(false);
  const [resetConfirmOpen, setResetConfirmOpen] = useState(false);

  const handleDismissAllPending = async () => {
    setActionLoading(true);
    try {
      const res = await fetch('/api/recurring', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'dismiss_all_pending' }),
      });
      if (res.ok) {
        toast.success('All pending suggestions dismissed');
        onRefresh();
      } else {
        toast.error('Failed to dismiss suggestions');
      }
    } catch {
      toast.error('Network error dismissing suggestions');
    } finally {
      setActionLoading(false);
    }
  };

  const handleResetUnconfirmed = async () => {
    setActionLoading(true);
    try {
      const res = await fetch('/api/recurring', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'reset_unconfirmed' }),
      });
      if (res.ok) {
        toast.success('Reset all unconfirmed recurring suggestions');
        onRefresh();
      } else {
        toast.error('Failed to reset unconfirmed items');
      }
    } catch {
      toast.error('Network error resetting items');
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <TooltipProvider delayDuration={150}>
      <Popover open={showMenu} onOpenChange={setShowMenu}>
        <Tooltip>
          <TooltipTrigger asChild>
            <PopoverTrigger asChild>
              <button
                type="button"
                aria-label="Recurring detection settings and tools"
                className="inline-flex items-center justify-center h-8 w-8 text-xs font-medium text-foreground bg-card hover:bg-accent border border-border rounded-xl transition-all shrink-0 cursor-pointer focus:outline-none shadow-2xs"
              >
                {scanning || actionLoading ? (
                  <Loader2 className="w-4 h-4 animate-spin text-primary" />
                ) : (
                  <Settings className="w-4 h-4 shrink-0 text-muted-foreground hover:text-foreground" />
                )}
              </button>
            </PopoverTrigger>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="text-xs">
            Recurring settings & tools
          </TooltipContent>
        </Tooltip>

        <PopoverContent align="end" className="w-72 p-1.5 z-50 space-y-1">
          {/* 1. Recurring Exclusions */}
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={() => {
                  setShowMenu(false);
                  setShowExclusionsDialog(true);
                }}
                className="w-full p-2 text-xs text-foreground hover:bg-accent rounded-lg flex items-start gap-2.5 transition-colors cursor-pointer text-left"
              >
                <SlidersHorizontal className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                <div className="min-w-0 flex-1">
                  <div className="font-semibold text-foreground">Recurring Exclusions</div>
                  <div className="text-[11px] text-muted-foreground leading-tight mt-0.5">
                    Ignore accounts, categories, or payee keywords from detection.
                  </div>
                </div>
              </button>
            </TooltipTrigger>
            <TooltipContent side="left" className="text-xs max-w-xs">
              Configure accounts, categories, or keywords (e.g. ATM, Venmo, Zelle) to skip during automatic scans.
            </TooltipContent>
          </Tooltip>

          {/* 2. Re-scan Transactions */}
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={() => {
                  setShowMenu(false);
                  onScan();
                }}
                disabled={scanning}
                className="w-full p-2 text-xs text-foreground hover:bg-accent rounded-lg flex items-start gap-2.5 transition-colors cursor-pointer text-left disabled:opacity-50"
              >
                <RefreshCw className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                <div className="min-w-0 flex-1">
                  <div className="font-semibold text-foreground">Re-scan Transactions</div>
                  <div className="text-[11px] text-muted-foreground leading-tight mt-0.5">
                    Run detection across recent transactions to find new subscriptions.
                  </div>
                </div>
              </button>
            </TooltipTrigger>
            <TooltipContent side="left" className="text-xs max-w-xs">
              Scans your historical charges with recency thresholds to detect repeating subscriptions and bills.
            </TooltipContent>
          </Tooltip>

          <div className="h-px bg-border/40 my-1" />

          {/* 3. Dismiss All Pending Review */}
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={() => {
                  setShowMenu(false);
                  setDismissAllConfirmOpen(true);
                }}
                className="w-full p-2 text-xs text-muted-foreground hover:text-foreground hover:bg-accent rounded-lg flex items-start gap-2.5 transition-colors cursor-pointer text-left"
              >
                <EyeOff className="w-4 h-4 shrink-0 mt-0.5" />
                <div className="min-w-0 flex-1">
                  <div className="font-medium text-foreground">Dismiss All Pending</div>
                  <div className="text-[11px] text-muted-foreground leading-tight mt-0.5">
                    Mark all unconfirmed suggestions as dismissed.
                  </div>
                </div>
              </button>
            </TooltipTrigger>
            <TooltipContent side="left" className="text-xs max-w-xs">
              Hides all review suggestions. They will not regenerate on future scans and remain accessible in the Dismissed tab.
            </TooltipContent>
          </Tooltip>

          {/* 4. Clear Unconfirmed Items */}
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={() => {
                  setShowMenu(false);
                  setResetConfirmOpen(true);
                }}
                className="w-full p-2 text-xs text-destructive hover:bg-destructive/10 rounded-lg flex items-start gap-2.5 transition-colors cursor-pointer text-left"
              >
                <Trash2 className="w-4 h-4 text-destructive shrink-0 mt-0.5" />
                <div className="min-w-0 flex-1">
                  <div className="font-medium text-destructive">Clear Unconfirmed Items</div>
                  <div className="text-[11px] text-muted-foreground leading-tight mt-0.5">
                    Permanently delete suggestions to start fresh.
                  </div>
                </div>
              </button>
            </TooltipTrigger>
            <TooltipContent side="left" className="text-xs max-w-xs">
              Permanently removes unconfirmed detected suggestions. Confirmed active subscriptions are never deleted.
            </TooltipContent>
          </Tooltip>
        </PopoverContent>
      </Popover>

      <RecurringExclusionsDialog
        open={showExclusionsDialog}
        onClose={() => setShowExclusionsDialog(false)}
        onSavedAndRescan={onScan}
      />

      <ConfirmDeleteDialog
        open={dismissAllConfirmOpen}
        onOpenChange={setDismissAllConfirmOpen}
        title="Dismiss all pending recurring items?"
        description="All unconfirmed suggestions will be marked as dismissed. You can review them later in the Dismissed tab."
        confirmText="Dismiss All"
        busy={actionLoading}
        onConfirm={handleDismissAllPending}
      />

      <ConfirmDeleteDialog
        open={resetConfirmOpen}
        onOpenChange={setResetConfirmOpen}
        title="Clear all unconfirmed items?"
        description="Unconfirmed suggestions will be permanently removed. Confirmed subscriptions will not be deleted."
        confirmText="Clear Items"
        busy={actionLoading}
        onConfirm={handleResetUnconfirmed}
      />
    </TooltipProvider>
  );
}
