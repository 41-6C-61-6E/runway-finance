'use client';

import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import type {
  RecurringStreamItem,
  RecurringStreamType,
  RecurringFrequency,
  Account,
} from '../account-types';

interface RecurringStreamDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  stream: RecurringStreamItem | null;
  accounts: Account[];
  onSave: (data: Partial<RecurringStreamItem>) => Promise<void>;
}

export function RecurringStreamDrawer({
  open,
  onOpenChange,
  stream,
  accounts,
  onSave,
}: RecurringStreamDrawerProps) {
  const isEditing = !!stream;

  const [name, setName] = useState('');
  const [payee, setPayee] = useState('');
  const [amount, setAmount] = useState('');
  const [type, setType] = useState<RecurringStreamType>('subscription');
  const [frequency, setFrequency] = useState<RecurringFrequency>('monthly');
  const [nextExpectedDate, setNextExpectedDate] = useState('');
  const [accountId, setAccountId] = useState<string>('');
  const [isActive, setIsActive] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (stream) {
      setName(stream.name || '');
      setPayee(stream.payee || stream.name || '');
      setAmount(String(stream.amount || ''));
      setType(stream.type || 'subscription');
      setFrequency(stream.frequency || 'monthly');
      setNextExpectedDate(stream.nextExpectedDate || '');
      setAccountId(stream.accountId || '');
      setIsActive(stream.isActive ?? true);
    } else {
      setName('');
      setPayee('');
      setAmount('');
      setType('subscription');
      setFrequency('monthly');
      setNextExpectedDate(new Date().toISOString().split('T')[0]);
      setAccountId(accounts[0]?.id || '');
      setIsActive(true);
    }
    setError('');
  }, [stream, open, accounts]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('Name is required');
      return;
    }
    const numAmt = parseFloat(amount);
    if (isNaN(numAmt) || numAmt <= 0) {
      setError('Please enter a valid positive amount');
      return;
    }
    if (!nextExpectedDate) {
      setError('Next expected date is required');
      return;
    }

    setIsSaving(true);
    setError('');

    try {
      await onSave({
        id: stream?.id,
        name: name.trim(),
        payee: payee.trim() || name.trim(),
        amount: numAmt,
        type,
        frequency,
        nextExpectedDate,
        anchorDate: nextExpectedDate,
        accountId: accountId || null,
        isActive,
      });
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save recurring stream');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>{isEditing ? 'Edit Recurring Stream' : 'Add Recurring Stream'}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 py-2">
          {error && (
            <div className="p-3 text-xs text-destructive bg-destructive/10 rounded-lg font-medium">
              {error}
            </div>
          )}

          {/* Name & Payee */}
          <div className="space-y-1.5">
            <Label htmlFor="stream-name" className="text-xs font-medium">
              Stream Name
            </Label>
            <Input
              id="stream-name"
              placeholder="e.g. Netflix, Payroll, Electric Utility"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="text-sm"
              required
            />
          </div>

          {/* Amount & Type */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="stream-amount" className="text-xs font-medium">
                Amount ($)
              </Label>
              <Input
                id="stream-amount"
                type="number"
                step="0.01"
                placeholder="0.00"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="text-sm"
                required
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="stream-type" className="text-xs font-medium">
                Category Type
              </Label>
              <select
                id="stream-type"
                value={type}
                onChange={(e) => setType(e.target.value as RecurringStreamType)}
                className="w-full h-9 rounded-md border border-input bg-background px-3 py-1 text-xs shadow-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                <option value="income">Salary / Income</option>
                <option value="subscription">Subscription</option>
                <option value="bill">Bill & Utility</option>
                <option value="loan">Loan / Mortgage</option>
                <option value="transfer">Transfer</option>
                <option value="other">Other</option>
              </select>
            </div>
          </div>

          {/* Frequency & Next Due Date */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="stream-frequency" className="text-xs font-medium">
                Cadence / Frequency
              </Label>
              <select
                id="stream-frequency"
                value={frequency}
                onChange={(e) => setFrequency(e.target.value as RecurringFrequency)}
                className="w-full h-9 rounded-md border border-input bg-background px-3 py-1 text-xs shadow-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                <option value="weekly">Weekly (every 7 days)</option>
                <option value="biweekly">Bi-weekly (every 14 days)</option>
                <option value="semimonthly">Semi-monthly (twice a month)</option>
                <option value="monthly">Monthly</option>
                <option value="quarterly">Quarterly</option>
                <option value="yearly">Yearly</option>
              </select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="stream-date" className="text-xs font-medium">
                Next Expected Date
              </Label>
              <Input
                id="stream-date"
                type="date"
                value={nextExpectedDate}
                onChange={(e) => setNextExpectedDate(e.target.value)}
                className="text-sm"
                required
              />
            </div>
          </div>

          {/* Linked Funding Account */}
          <div className="space-y-1.5">
            <Label htmlFor="stream-account" className="text-xs font-medium">
              Linked Account (Optional)
            </Label>
            <select
              id="stream-account"
              value={accountId}
              onChange={(e) => setAccountId(e.target.value)}
              className="w-full h-9 rounded-md border border-input bg-background px-3 py-1 text-xs shadow-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            >
              <option value="">Any Liquid Account</option>
              {accounts.map((acc) => (
                <option key={acc.id} value={acc.id}>
                  {acc.name} ({acc.type})
                </option>
              ))}
            </select>
          </div>

          {/* Active Switch */}
          <div className="flex items-center justify-between p-3 rounded-lg border border-border/40 bg-muted/30">
            <div className="space-y-0.5">
              <Label htmlFor="stream-active" className="text-xs font-medium cursor-pointer">
                Active in Runway Forecast
              </Label>
              <p className="text-[11px] text-muted-foreground">
                Toggling off pauses the stream from impacting your balance forecast.
              </p>
            </div>
            <Switch id="stream-active" checked={isActive} onCheckedChange={setIsActive} />
          </div>

          <DialogFooter className="pt-2 gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={isSaving}>
              {isSaving ? 'Saving...' : isEditing ? 'Save Changes' : 'Create Stream'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
