'use client';

import React, { useState, useEffect } from 'react';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from '@/components/ui/alert-dialog';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/loading-spinner';


export interface ConfirmDeleteDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: React.ReactNode;
  expectedValue?: string;
  minLength?: number;
  inputPlaceholder?: string;
  confirmText?: string;
  cancelText?: string;
  busy?: boolean;
  onConfirm: () => Promise<void> | void;
}

export function ConfirmDeleteDialog({
  open,
  onOpenChange,
  title,
  description,
  expectedValue,
  minLength,
  inputPlaceholder,
  confirmText = 'Delete',
  cancelText = 'Cancel',
  busy = false,
  onConfirm,
}: ConfirmDeleteDialogProps) {
  const [inputValue, setInputValue] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (open) {
      setInputValue('');
      setLoading(false);
    }
  }, [open]);

  const requiresValidation = Boolean(expectedValue || minLength);
  const isValid = requiresValidation
    ? expectedValue
      ? inputValue.trim().toLowerCase() === expectedValue.trim().toLowerCase()
      : minLength
      ? inputValue.trim().length >= minLength
      : true
    : true;

  const isExecuting = busy || loading;

  const handleConfirm = async (e: React.MouseEvent) => {
    e.preventDefault();
    if (!isValid || isExecuting) return;

    setLoading(true);
    try {
      await onConfirm();
      onOpenChange(false);
    } catch (err) {
      console.error('Delete confirmation failed', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="max-w-md">
        <AlertDialogHeader>
          <AlertDialogTitle className="text-destructive font-bold">{title}</AlertDialogTitle>
          <AlertDialogDescription className="text-sm text-muted-foreground space-y-3">
            <div>{description}</div>
            {requiresValidation && (
              <div className="pt-2">
                {expectedValue && (
                  <p className="text-xs font-medium mb-1.5 text-foreground">
                    Type <span className="font-mono font-bold text-destructive">{expectedValue}</span> to confirm:
                  </p>
                )}
                <Input
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  placeholder={inputPlaceholder || (expectedValue ? `Type "${expectedValue}"` : '')}
                  disabled={isExecuting}
                  className="text-sm"
                  autoFocus
                />
              </div>
            )}
          </AlertDialogDescription>
        </AlertDialogHeader>

        <AlertDialogFooter>
          <AlertDialogCancel disabled={isExecuting}>{cancelText}</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleConfirm}
            disabled={!isValid || isExecuting}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90 transition-colors cursor-pointer disabled:opacity-50"
          >
            {isExecuting ? (
              <div className="flex items-center gap-2">
                <Spinner size="sm" />
                <span>Deleting...</span>
              </div>
            ) : (

              confirmText
            )}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
