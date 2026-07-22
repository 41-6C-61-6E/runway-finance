'use client';

import React, { useState } from 'react';
import { AlertTriangle, Trash2, X } from 'lucide-react';

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

  if (!isOpen) return null;

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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 backdrop-blur-xs p-4">
      <div className="bg-card border border-border rounded-2xl p-6 shadow-2xl max-w-md w-full space-y-4 animate-in fade-in zoom-in-95 duration-200">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-rose-500/10 text-rose-500">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-base font-bold text-foreground">Confirm Plan Deletion</h3>
              <p className="text-xs text-muted-foreground">This action cannot be undone.</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground p-1 rounded-lg transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

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
      </div>
    </div>
  );
}
