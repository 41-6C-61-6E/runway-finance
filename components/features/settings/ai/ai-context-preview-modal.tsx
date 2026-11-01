'use client';

import React from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Spinner } from '@/components/ui/loading-spinner';

interface AiContextPreviewModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  loading: boolean;
  text: string | null;
}

export function AiContextPreviewModal({
  open,
  onOpenChange,
  loading,
  text,
}: AiContextPreviewModalProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="text-sm font-semibold">
            Financial Context Sent to AI
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
            This preview shows the exact financial snapshot and category rollups generated for Advice prompts.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto rounded-lg bg-muted/40 border border-border p-3 text-xs font-mono text-muted-foreground whitespace-pre-wrap leading-relaxed">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Spinner size="md" className="text-primary" />
            </div>
          ) : (
            text || 'No preview text available.'
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
