'use client';

import React from 'react';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';

export interface ProposedRule {
  payee: string;
  categoryId: string;
  categoryName: string;
}

interface ProposedRuleDialogProps {
  proposedRule: ProposedRule | null;
  setProposedRule: React.Dispatch<React.SetStateAction<ProposedRule | null>>;
  handleCreateRule: () => void;
  handleCreateAndRunRule: () => void;
}

export function ProposedRuleDialog({
  proposedRule,
  setProposedRule,
  handleCreateRule,
  handleCreateAndRunRule,
}: ProposedRuleDialogProps) {
  return (
    <AlertDialog
      open={!!proposedRule}
      onOpenChange={(open) => !open && setProposedRule(null)}
    >
      <AlertDialogContent className="max-w-md">
        <AlertDialogHeader>
          <AlertDialogTitle>Create Auto-Tag Rule?</AlertDialogTitle>
          <AlertDialogDescription>
            Automatically assign this category to future transactions with the
            same payee?
          </AlertDialogDescription>
        </AlertDialogHeader>
        {proposedRule && (
          <div className="space-y-3 py-2">
            <div className="p-3 bg-muted/30 border border-border rounded-lg space-y-3">
              <div className="space-y-1">
                <label className="block text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                  When payee contains
                </label>
                <input
                  value={proposedRule.payee}
                  onChange={(e) =>
                    setProposedRule((prev) =>
                      prev ? { ...prev, payee: e.target.value } : null,
                    )
                  }
                  className="w-full px-2.5 py-1.5 bg-background border border-input rounded-md text-foreground text-xs focus:outline-none focus:ring-1 focus:ring-ring font-mono"
                />
              </div>
              <div className="flex items-center justify-between text-xs pt-2.5 border-t border-border/50">
                <span className="text-muted-foreground">Set category to</span>
                <span className="text-foreground font-medium">
                  {proposedRule.categoryName}
                </span>
              </div>
            </div>
          </div>
        )}
        <AlertDialogFooter className="flex-col-reverse sm:flex-row gap-3 sm:justify-between sm:items-center">
          <AlertDialogCancel className="h-10 w-full sm:w-auto px-4 py-2 text-sm font-semibold rounded-lg">
            No thanks
          </AlertDialogCancel>
          <div className="flex flex-col-reverse sm:flex-row gap-3 w-full sm:w-auto">
            <Button
              variant="outline"
              onClick={handleCreateRule}
              className="h-10 w-full sm:w-auto rounded-lg font-semibold border-border hover:bg-muted"
            >
              Create Rule
            </Button>
            <Button
              onClick={handleCreateAndRunRule}
              className="h-10 w-full sm:w-auto rounded-lg font-semibold"
            >
              Create and Run Now
            </Button>
          </div>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

