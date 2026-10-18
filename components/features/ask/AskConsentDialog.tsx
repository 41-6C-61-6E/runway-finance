'use client';

import React, { useState } from 'react';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogAction,
  AlertDialogCancel,
} from '@/components/ui/alert-dialog';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ShieldCheck, Eye, Loader2 } from 'lucide-react';

interface AskConsentDialogProps {
  open: boolean;
  providerHost: string;
  model: string;
  isOpenRouter: boolean;
  isFreeModel: boolean;
  onAccept: () => Promise<void>;
  onCancel: () => void;
}

export function AskConsentDialog({
  open,
  providerHost,
  model,
  isOpenRouter,
  isFreeModel,
  onAccept,
  onCancel,
}: AskConsentDialogProps) {
  const [loading, setLoading] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewText, setPreviewText] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  const handleOpenPreview = async () => {
    setPreviewLoading(true);
    setPreviewOpen(true);
    try {
      const res = await fetch('/api/ai/ask/context-preview');
      if (res.ok) {
        const data = await res.json();
        setPreviewText(data.text);
      } else {
        setPreviewText('Failed to load context preview.');
      }
    } catch {
      setPreviewText('Failed to load context preview.');
    } finally {
      setPreviewLoading(false);
    }
  };

  const handleConfirm = async () => {
    setLoading(true);
    try {
      await onAccept();
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <AlertDialog open={open} onOpenChange={(val) => !val && onCancel()}>
        <AlertDialogContent className="max-w-md">
          <AlertDialogHeader>
            <div className="flex items-center gap-2 text-primary">
              <ShieldCheck className="w-5 h-5" />
              <AlertDialogTitle className="text-base font-semibold">
                AI Data Disclosure & Consent
              </AlertDialogTitle>
            </div>
            <AlertDialogDescription className="text-xs text-muted-foreground space-y-2.5 pt-2 text-left">
              <p>
                Ask sends <strong className="text-foreground">summarized</strong> financial data
                (totals, category spending, balances by account type, goal progress, and retirement projections)
                to your configured AI provider:
              </p>
              <div className="rounded-lg bg-muted/60 p-2 text-xs font-mono text-foreground border border-border">
                <div>Host: <span className="font-semibold">{providerHost || 'Unknown'}</span></div>
                <div>Model: <span className="font-semibold">{model || 'Default'}</span></div>
              </div>
              <p className="font-medium text-foreground">
                No individual transactions, merchant names, payees, account numbers, or institution names are ever sent.
              </p>
              {isOpenRouter && isFreeModel && (
                <p className="rounded-md bg-amber-500/10 text-amber-600 dark:text-amber-400 p-2 text-[11px] border border-amber-500/20">
                  Note: Free models may be served by providers that log or train on prompts. You can limit this in your OpenRouter privacy settings.
                </p>
              )}
              <p>
                Ask is <strong className="text-foreground">read-only</strong> and conversations are strictly stored in temporary browser memory.
              </p>
              <div className="pt-1">
                <Button
                  type="button"
                  variant="link"
                  size="sm"
                  onClick={handleOpenPreview}
                  className="p-0 h-auto text-xs text-primary flex items-center gap-1.5"
                >
                  <Eye className="w-3.5 h-3.5" />
                  <span>Review exactly what is shared</span>
                </Button>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>

          <AlertDialogFooter className="mt-2">
            <AlertDialogCancel onClick={onCancel} disabled={loading} className="text-xs h-8">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              id="ask-consent-accept"
              onClick={handleConfirm}
              disabled={loading}
              className="text-xs h-8 flex items-center gap-1.5"
            >
              {loading && <Loader2 className="w-3 h-3 animate-spin" />}
              <span>Agree & Continue</span>
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Context Preview Modal */}
      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-w-xl max-h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="text-sm font-semibold">
              Financial Context Sent to AI
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              This is the exact financial snapshot and category breakdown generated for your prompt.
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto rounded-lg bg-muted/40 border border-border p-3 text-xs font-mono text-muted-foreground whitespace-pre-wrap leading-relaxed">
            {previewLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-5 h-5 animate-spin text-primary" />
              </div>
            ) : (
              previewText || 'No preview text available.'
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
