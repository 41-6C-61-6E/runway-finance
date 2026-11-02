'use client';

import React from 'react';
import { Trash2, History } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import type { BudgetData } from './types';

interface BudgetConfirmDialogsProps {
  deleteBudget: { categoryName?: string } | null;
  setDeleteBudget: (b: BudgetData | null) => void;
  deleteLoading: boolean;
  handleDelete: () => void;
  confirmResetOpen: boolean;
  setConfirmResetOpen: (o: boolean) => void;
  confirmPurgeHistoryOpen: boolean;
  setConfirmPurgeHistoryOpen: (o: boolean) => void;
  actionLoading: boolean;
  periodKey: string;
  handleResetBudgets: () => void;
  handlePurgeHistory: () => void;
}

export function BudgetConfirmDialogs({
  deleteBudget,
  setDeleteBudget,
  deleteLoading,
  handleDelete,
  confirmResetOpen,
  setConfirmResetOpen,
  confirmPurgeHistoryOpen,
  setConfirmPurgeHistoryOpen,
  actionLoading,
  periodKey,
  handleResetBudgets,
  handlePurgeHistory,
}: BudgetConfirmDialogsProps) {
  return (
    <>
      <AlertDialog open={!!deleteBudget} onOpenChange={(o) => { if (!o) setDeleteBudget(null); }}>
        <AlertDialogContent className="max-w-sm">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Budget</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete the budget for <strong>{deleteBudget?.categoryName}</strong>?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <button
              type="button"
              onClick={handleDelete}
              disabled={deleteLoading}
              className="inline-flex h-9 items-center justify-center rounded-lg bg-destructive px-4 py-2 text-sm font-semibold text-destructive-foreground hover:opacity-90 transition-opacity disabled:opacity-50"
            >
              {deleteLoading ? 'Deleting...' : 'Delete'}
            </button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={confirmResetOpen} onOpenChange={setConfirmResetOpen}>
        <AlertDialogContent className="max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-destructive flex items-center gap-2">
              <Trash2 className="w-5 h-5" />
              Reset All Budgets
            </AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to <strong>erase all budget items</strong>? This will permanently remove all recurring and period-specific budgets across all categories.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <button
              type="button"
              onClick={handleResetBudgets}
              disabled={actionLoading}
              className="inline-flex h-9 items-center justify-center rounded-lg bg-destructive px-4 py-2 text-sm font-semibold text-destructive-foreground hover:opacity-90 transition-opacity disabled:opacity-50"
            >
              {actionLoading ? 'Resetting...' : 'Reset All Budgets'}
            </button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={confirmPurgeHistoryOpen} onOpenChange={setConfirmPurgeHistoryOpen}>
        <AlertDialogContent className="max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <History className="w-5 h-5 text-primary" />
              Remove Prior Budget History
            </AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to <strong>remove historical budget data prior to {periodKey}</strong>? Active recurring budgets will remain in effect for the current period forward.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <button
              type="button"
              onClick={handlePurgeHistory}
              disabled={actionLoading}
              className="inline-flex h-9 items-center justify-center rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90 transition-opacity disabled:opacity-50"
            >
              {actionLoading ? 'Removing...' : 'Remove History'}
            </button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
