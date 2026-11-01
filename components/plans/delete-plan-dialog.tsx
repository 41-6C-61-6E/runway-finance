'use client';

import React, { useState } from 'react';
import { AlertTriangle, Trash2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';

export interface DeletePlanDialogProps {
  isOpen: boolean;
  planName: string;
  isDefault?: boolean;
  onClose: () => void;
  onConfirmDelete: () => Promise<void>;
}

export function DeletePlanDialog({
  isOpen,
  planName,
  isDefault,
  onClose,
  onConfirmDelete,
}: DeletePlanDialogProps) {
  const [deleting, setDeleting] = useState(false);

  const handleDelete = async () => {
    if (deleting) return;
    setDeleting(true);
    try {
      await onConfirmDelete();
      onClose();
    } catch (err) {
      console.error('Failed to delete plan', err);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-md p-6 space-y-4">
        <DialogHeader className="flex flex-row items-start gap-3 space-y-0 text-left">
          <div className="p-2.5 rounded-xl bg-rose-500/10 text-rose-500 shrink-0">
            <AlertTriangle className="w-6 h-6" />
          </div>
          <div>
            <DialogTitle className="text-base font-bold text-foreground">Confirm Plan Deletion</DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground mt-0.5">
              This action cannot be undone.
            </DialogDescription>
          </div>
        </DialogHeader>

        <div className="space-y-2 text-xs text-muted-foreground bg-muted/20 border border-border rounded-xl p-3.5">
          <p>
            Are you sure you want to permanently delete <strong className="text-foreground">{planName}</strong>?
          </p>
          {isDefault && (
            <p className="text-amber-500 font-semibold pt-1">
              Note: This is currently your Default Plan. If deleted, another plan will be designated as default, or a fresh default plan will be initialized.
            </p>
          )}
        </div>

        <div className="pt-2 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={deleting}
            className="px-4 py-2 text-xs font-bold text-muted-foreground hover:text-foreground rounded-xl transition-colors cursor-pointer disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleDelete}
            disabled={deleting}
            className="flex items-center gap-1.5 bg-rose-600 hover:bg-rose-700 text-white px-5 py-2 rounded-xl text-xs font-bold shadow-md transition-all disabled:opacity-50 cursor-pointer"
          >
            {deleting ? (
              <>
                <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                <span>Deleting...</span>
              </>
            ) : (
              <>
                <Trash2 className="w-3.5 h-3.5" />
                <span>Delete Plan</span>
              </>
            )}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
