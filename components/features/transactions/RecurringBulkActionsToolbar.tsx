'use client';

import { useState } from 'react';
import {
  Check,
  ShieldCheck,
  EyeOff,
  Pause,
  Play,
  Merge,
  Trash2,
  X,
  Loader2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ConfirmDeleteDialog } from '@/components/ui/confirm-delete-dialog';
import { toast } from 'sonner';
import type { RecurringItem } from './RecurringCard';
import { MergeRecurringModal } from './MergeRecurringModal';

interface RecurringBulkActionsToolbarProps {
  selectedIds: string[];
  items: RecurringItem[];
  onClearSelection: () => void;
  onSuccess: () => void;
}

export function RecurringBulkActionsToolbar({
  selectedIds,
  items,
  onClearSelection,
  onSuccess,
}: RecurringBulkActionsToolbarProps) {
  const [loadingAction, setLoadingAction] = useState<string | null>(null);
  const [mergeModalOpen, setMergeModalOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

  const count = selectedIds.length;
  if (count === 0) return null;

  const selectedItems = items.filter((i) => selectedIds.includes(i.id));
  const hasPausedSelected = selectedItems.some((i) => i.isPaused);

  const handleBulkAction = async (action: 'confirm' | 'dismiss' | 'pause' | 'resume' | 'delete') => {
    setLoadingAction(action);
    try {
      const res = await fetch('/api/recurring', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, ids: selectedIds }),
      });

      if (res.ok) {
        toast.success(`Updated ${count} items`);
        onClearSelection();
        onSuccess();
      } else {
        toast.error('Failed to perform bulk action');
      }
    } catch {
      toast.error('Network error during bulk action');
    } finally {
      setLoadingAction(null);
    }
  };

  return (
    <>
      <div className="sticky top-2 z-40 mb-4 animate-in fade-in-50 slide-in-from-top-2 duration-200">
        <div className="bg-popover text-popover-foreground border border-border shadow-xl rounded-2xl p-2.5 sm:p-3 flex flex-wrap items-center justify-between gap-2.5">
          {/* Left: Count Badge & Clear */}
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-1 rounded-lg bg-primary text-primary-foreground text-xs font-bold font-mono">
              {count} selected
            </span>
            <Button
              variant="ghost"
              size="sm"
              onClick={onClearSelection}
              className="text-xs h-7 px-2 text-muted-foreground hover:text-foreground"
            >
              <X className="w-3.5 h-3.5 mr-1" />
              Deselect
            </Button>
          </div>

          {/* Right: Actions */}
          <div className="flex items-center gap-1.5 flex-wrap">
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleBulkAction('confirm')}
              disabled={!!loadingAction}
              className="text-xs h-8 font-medium"
            >
              {loadingAction === 'confirm' ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" />
              ) : (
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-500 mr-1" />
              )}
              Confirm
            </Button>

            <Button
              variant="outline"
              size="sm"
              onClick={() => handleBulkAction('dismiss')}
              disabled={!!loadingAction}
              className="text-xs h-8 font-medium"
            >
              {loadingAction === 'dismiss' ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" />
              ) : (
                <EyeOff className="w-3.5 h-3.5 mr-1 text-muted-foreground" />
              )}
              Dismiss
            </Button>

            {count >= 2 && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setMergeModalOpen(true)}
                disabled={!!loadingAction}
                className="text-xs h-8 font-medium text-primary border-primary/30 hover:bg-primary/5"
              >
                <Merge className="w-3.5 h-3.5 mr-1" />
                Merge ({count})
              </Button>
            )}

            <Button
              variant="outline"
              size="sm"
              onClick={() => handleBulkAction('pause')}
              disabled={!!loadingAction}
              className="text-xs h-8 font-medium"
            >
              <Pause className="w-3.5 h-3.5 mr-1 text-muted-foreground" />
              Pause
            </Button>

            <Button
              variant="outline"
              size="sm"
              onClick={() => handleBulkAction('resume')}
              disabled={!!loadingAction || !hasPausedSelected}
              className="text-xs h-8 font-medium"
            >
              {loadingAction === 'resume' ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" />
              ) : (
                <Play className="w-3.5 h-3.5 mr-1 text-emerald-500" />
              )}
              Resume
            </Button>

            <Button
              variant="destructive"
              size="sm"
              onClick={() => setDeleteDialogOpen(true)}
              disabled={!!loadingAction}
              className="text-xs h-8 font-medium"
            >
              {loadingAction === 'delete' ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" />
              ) : (
                <Trash2 className="w-3.5 h-3.5 mr-1" />
              )}
              Delete
            </Button>
          </div>
        </div>
      </div>

      <MergeRecurringModal
        open={mergeModalOpen}
        onClose={() => setMergeModalOpen(false)}
        selectedItems={selectedItems}
        onSuccess={() => {
          onClearSelection();
          onSuccess();
        }}
      />

      <ConfirmDeleteDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        title={`Delete ${count} recurring items?`}
        description="This cannot be undone."
        confirmText="Delete"
        busy={loadingAction === 'delete'}
        onConfirm={() => handleBulkAction('delete')}
      />
    </>
  );
}
