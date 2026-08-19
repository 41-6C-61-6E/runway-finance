'use client';

import { useState } from 'react';
import { SlidersHorizontal, RefreshCw, EyeOff, Trash2 } from 'lucide-react';
import { FeatureSettingsMenu } from '@/components/ui/feature-settings-menu';
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
      <FeatureSettingsMenu
        ariaLabel="Recurring settings & tools"
        title="Recurring settings & tools"
        busy={scanning || actionLoading}
        items={[
          {
            id: 'exclusions',
            icon: SlidersHorizontal,
            label: 'Recurring Exclusions',
            tip: 'Ignore accounts, categories, or payee keywords from detection.',
            variant: 'primary',
            onSelect: () => setShowExclusionsDialog(true),
          },
          {
            id: 'rescan',
            icon: RefreshCw,
            label: 'Re-scan Transactions',
            tip: 'Run detection across recent transactions to find new subscriptions.',
            variant: 'primary',
            disabled: scanning,
            onSelect: () => onScan(),
          },
          {
            id: 'dismiss-all',
            icon: EyeOff,
            label: 'Dismiss All Pending',
            tip: 'Mark all unconfirmed suggestions as dismissed.',
            dividerBelow: true,
            onSelect: () => setDismissAllConfirmOpen(true),
          },
          {
            id: 'clear-unconfirmed',
            icon: Trash2,
            label: 'Clear Unconfirmed Items',
            tip: 'Permanently delete suggestions to start fresh.',
            variant: 'danger',
            onSelect: () => setResetConfirmOpen(true),
          },
        ]}
      />

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
