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
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { IconTip } from '@/components/ui/icon-tip';
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
    <>
      <Popover open={showMenu} onOpenChange={setShowMenu}>
        <PopoverTrigger asChild>
          <button
            type="button"
            aria-label="Recurring settings & options"
            className="inline-flex items-center justify-center h-8 w-8 text-xs font-medium text-foreground bg-card hover:bg-accent border border-border rounded-xl transition-all shrink-0 cursor-pointer focus:outline-none shadow-2xs"
          >
            {scanning || actionLoading ? (
              <Loader2 className="w-4 h-4 animate-spin text-primary" />
            ) : (
              <Settings className="w-4 h-4 shrink-0 text-muted-foreground hover:text-foreground" />
            )}
          </button>
        </PopoverTrigger>

        <PopoverContent align="end" className="w-64 p-1.5 z-50">
          <button
            type="button"
            onClick={() => {
              setShowMenu(false);
              setShowExclusionsDialog(true);
            }}
            className="w-full px-3 py-2 text-xs text-foreground hover:bg-accent rounded-lg flex items-center gap-2 transition-colors cursor-pointer text-left"
          >
            <IconTip content="Configure accounts, categories, and merchant patterns to ignore">
              <SlidersHorizontal className="w-3.5 h-3.5 text-primary shrink-0" />
            </IconTip>
            <span>Recurring Exclusions</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setShowMenu(false);
              onScan();
            }}
            disabled={scanning}
            className="w-full px-3 py-2 text-xs text-foreground hover:bg-accent rounded-lg flex items-center gap-2 transition-colors cursor-pointer text-left"
          >
            <IconTip content="Run a fresh scan over your transaction history">
              <RefreshCw className="w-3.5 h-3.5 text-primary shrink-0" />
            </IconTip>
            <span>Re-scan Transactions</span>
          </button>

          <div className="h-px bg-border/40 my-1" />

          <button
            type="button"
            onClick={() => {
              setShowMenu(false);
              setDismissAllConfirmOpen(true);
            }}
            className="w-full px-3 py-2 text-xs text-muted-foreground hover:text-foreground hover:bg-accent rounded-lg flex items-center gap-2 transition-colors cursor-pointer text-left"
          >
            <IconTip content="Dismiss all unconfirmed recurring suggestions">
              <EyeOff className="w-3.5 h-3.5 shrink-0" />
            </IconTip>
            <span>Dismiss All Pending Review</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setShowMenu(false);
              setResetConfirmOpen(true);
            }}
            className="w-full px-3 py-2 text-xs text-destructive hover:bg-destructive/10 rounded-lg flex items-center gap-2 transition-colors cursor-pointer text-left"
          >
            <IconTip content="Permanently remove unconfirmed suggestions to start clean">
              <Trash2 className="w-3.5 h-3.5 text-destructive shrink-0" />
            </IconTip>
            <span>Clear Unconfirmed Items</span>
          </button>
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
    </>
  );
}
