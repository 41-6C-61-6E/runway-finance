'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import {
  Repeat,
  Sparkles,
  Calendar,
  Layers,
  Building2,
  DollarSign,
  Info,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
  ArrowRight,
} from 'lucide-react';
import { formatCurrency } from '@/lib/utils/format';
import { toast } from 'sonner';
import { normalizeMerchantName, type FrequencyType } from '@/lib/utils/recurring';
import { Select } from '@/components/ui/select';

export interface MarkAsRecurringModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  transaction?: any | null;
  transactions?: any[];
  initialRecurringItem?: any | null;
  onSuccess?: (createdItem: any) => void;
}

const FREQUENCY_OPTIONS: { value: FrequencyType; label: string; intervalDesc: string }[] = [
  { value: 'weekly', label: 'Weekly', intervalDesc: 'Every 7 days' },
  { value: 'biweekly', label: 'Bi-weekly', intervalDesc: 'Every 14 days' },
  { value: 'semi_monthly', label: 'Semi-monthly', intervalDesc: '1st & 15th of the month' },
  { value: 'monthly', label: 'Monthly', intervalDesc: 'Once a month' },
  { value: 'quarterly', label: 'Quarterly', intervalDesc: 'Every 3 months' },
  { value: 'semi_annual', label: 'Semi-annual', intervalDesc: 'Every 6 months' },
  { value: 'annual', label: 'Annual', intervalDesc: 'Once a year' },
];

export function MarkAsRecurringModal({
  open,
  onOpenChange,
  transaction,
  transactions: inputTransactions,
  initialRecurringItem,
  onSuccess,
}: MarkAsRecurringModalProps) {
  // Categories & Accounts
  const [categories, setCategories] = useState<{ id: string; name: string; color: string }[]>([]);
  const [accountsList, setAccountsList] = useState<{ id: string; name: string }[]>([]);

  // Form State
  const [merchantName, setMerchantName] = useState('');
  const [matchPattern, setMatchPattern] = useState('');
  const [showPatternEditor, setShowPatternEditor] = useState(false);
  const [amount, setAmount] = useState('');
  const [frequency, setFrequency] = useState<FrequencyType>('monthly');
  const [categoryId, setCategoryId] = useState('');
  const [accountId, setAccountId] = useState('');
  const [lastDate, setLastDate] = useState('');
  const [nextExpectedDate, setNextExpectedDate] = useState('');
  const [flowType, setFlowType] = useState<'expense' | 'income'>('expense');
  const [customName, setCustomName] = useState('');
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);

  // Preview & Existing Rule Collisions
  const [previewData, setPreviewData] = useState<{
    count: number;
    totalAmount: number;
    averageAmount: number;
    latestDate: string | null;
    suggestedFrequency: FrequencyType | null;
  } | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [existingRule, setExistingRule] = useState<any | null>(null);
  const [linkMode, setLinkMode] = useState<'create_new' | 'update_existing'>('create_new');

  // Fetch categories & accounts on mount
  useEffect(() => {
    if (!open) return;
    fetch('/api/categories', { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => {
        if (Array.isArray(data)) {
          setCategories(data.map((c: any) => ({ id: c.id, name: c.name, color: c.color || '#6366f1' })));
        }
      })
      .catch(() => {});

    fetch('/api/accounts', { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => {
        if (Array.isArray(data)) {
          setAccountsList(data.map((a: any) => ({ id: a.id, name: a.name })));
        }
      })
      .catch(() => {});
  }, [open]);

  // Derive initial values when opened
  useEffect(() => {
    if (!open) return;

    if (initialRecurringItem) {
      setMerchantName(initialRecurringItem.merchantName || '');
      setMatchPattern(initialRecurringItem.matchPattern || '');
      setAmount(String(initialRecurringItem.averageAmount || initialRecurringItem.lastAmount || ''));
      setFrequency(initialRecurringItem.frequency || 'monthly');
      setCategoryId(initialRecurringItem.categoryId || '');
      setAccountId(initialRecurringItem.accountId || '');
      setLastDate(initialRecurringItem.lastDate || new Date().toISOString().split('T')[0]);
      setNextExpectedDate(initialRecurringItem.nextExpectedDate || '');
      setFlowType(initialRecurringItem.flowType || 'expense');
      setCustomName(initialRecurringItem.customName || '');
      setNotes(initialRecurringItem.notes || '');
      return;
    }

    const txList = inputTransactions && inputTransactions.length > 0 ? inputTransactions : transaction ? [transaction] : [];

    if (txList.length > 0) {
      const primaryTx = txList[0];
      const rawDesc = primaryTx.payee || primaryTx.description || 'Recurring Item';
      const cleanName = normalizeMerchantName(rawDesc);

      // Combine patterns if multiple transactions selected
      const uniqueNames = Array.from(
        new Set(txList.map((t) => (t.payee || t.description || '').trim()).filter(Boolean))
      );
      const combinedPattern = uniqueNames
        .map((n) => normalizeMerchantName(n).toLowerCase())
        .filter(Boolean)
        .join('|') || cleanName.toLowerCase();

      // Compute total/avg amount
      const amounts = txList.map((t) => Math.abs(parseFloat(t.amount || '0') || 0));
      const avgAmt = amounts.reduce((sum, a) => sum + a, 0) / (amounts.length || 1);
      const rawAmt = parseFloat(primaryTx.amount || '0') || 0;
      const isIncome = rawAmt > 0;

      // Sort dates
      const dates = txList.map((t) => (typeof t.date === 'string' ? t.date.split('T')[0] : '')).filter(Boolean).sort();
      const latestTxDate = dates.length > 0 ? dates[dates.length - 1] : new Date().toISOString().split('T')[0];

      setMerchantName(cleanName);
      setMatchPattern(combinedPattern);
      setAmount(avgAmt > 0 ? avgAmt.toFixed(2) : '');
      setCategoryId(primaryTx.categoryId || '');
      setAccountId(primaryTx.accountId || '');
      setLastDate(latestTxDate);
      setFlowType(isIncome ? 'income' : 'expense');
      setCustomName('');
      setNotes('');
      setFrequency('monthly');
      setShowPatternEditor(uniqueNames.length > 1);
    } else {
      // Empty creation
      setMerchantName('');
      setMatchPattern('');
      setAmount('');
      setFrequency('monthly');
      setCategoryId('');
      setAccountId('');
      setLastDate(new Date().toISOString().split('T')[0]);
      setNextExpectedDate('');
      setFlowType('expense');
      setCustomName('');
      setNotes('');
      setShowPatternEditor(false);
    }
  }, [open, transaction, inputTransactions, initialRecurringItem]);

  // Recalculate next expected date when lastDate or frequency changes
  useEffect(() => {
    if (!lastDate || initialRecurringItem?.nextExpectedDate) return;
    try {
      const d = new Date(lastDate + 'T00:00:00Z');
      if (isNaN(d.getTime())) return;
      const year = d.getUTCFullYear();
      const month = d.getUTCMonth();
      const day = d.getUTCDate();

      let target: Date;
      if (frequency === 'weekly') {
        target = new Date(d.getTime() + 7 * 24 * 60 * 60 * 1000);
      } else if (frequency === 'biweekly') {
        target = new Date(d.getTime() + 14 * 24 * 60 * 60 * 1000);
      } else if (frequency === 'semi_monthly') {
        if (day < 15) {
          target = new Date(Date.UTC(year, month, 15));
        } else {
          target = new Date(Date.UTC(year, month + 1, 1));
        }
      } else if (frequency === 'monthly') {
        target = new Date(Date.UTC(year, month + 1, day));
      } else if (frequency === 'quarterly') {
        target = new Date(Date.UTC(year, month + 3, day));
      } else if (frequency === 'semi_annual') {
        target = new Date(Date.UTC(year, month + 6, day));
      } else {
        // annual
        target = new Date(Date.UTC(year + 1, month, day));
      }

      // Step forward to present/future if needed
      const todayStr = new Date().toISOString().split('T')[0];
      let projected = target.toISOString().split('T')[0];
      if (projected < todayStr) {
        let cur = target;
        let guard = 0;
        while (cur.toISOString().split('T')[0] < todayStr && guard < 50) {
          if (frequency === 'weekly') cur = new Date(cur.getTime() + 7 * 24 * 60 * 60 * 1000);
          else if (frequency === 'biweekly') cur = new Date(cur.getTime() + 14 * 24 * 60 * 60 * 1000);
          else if (frequency === 'monthly') cur = new Date(Date.UTC(cur.getUTCFullYear(), cur.getUTCMonth() + 1, day));
          else if (frequency === 'quarterly') cur = new Date(Date.UTC(cur.getUTCFullYear(), cur.getUTCMonth() + 3, day));
          else if (frequency === 'semi_annual') cur = new Date(Date.UTC(cur.getUTCFullYear(), cur.getUTCMonth() + 6, day));
          else cur = new Date(Date.UTC(cur.getUTCFullYear() + 1, cur.getUTCMonth(), day));
          guard++;
        }
        projected = cur.toISOString().split('T')[0];
      }
      setNextExpectedDate(projected);
    } catch {
      // ignore
    }
  }, [lastDate, frequency, initialRecurringItem]);

  // Live query for pattern preview & collision check
  const effectivePattern = useMemo(() => {
    return (matchPattern || normalizeMerchantName(merchantName)).trim().toLowerCase();
  }, [matchPattern, merchantName]);

  useEffect(() => {
    if (!open || !effectivePattern || effectivePattern.length < 2) {
      setPreviewData(null);
      setExistingRule(null);
      return;
    }

    const timer = setTimeout(async () => {
      setPreviewLoading(true);
      try {
        // 1. Check matching transactions preview
        const prevRes = await fetch(
          `/api/recurring/preview?pattern=${encodeURIComponent(effectivePattern)}${accountId ? `&accountId=${accountId}` : ''}`,
          { credentials: 'include' }
        );
        if (prevRes.ok) {
          const pData = await prevRes.json();
          setPreviewData(pData);
          if (pData.suggestedFrequency && !initialRecurringItem) {
            setFrequency(pData.suggestedFrequency);
          }
          if (pData.averageAmount > 0 && !amount && !initialRecurringItem) {
            setAmount(pData.averageAmount.toFixed(2));
          }
        }

        // 2. Check for existing recurring rule collisions (exact pattern check)
        const recRes = await fetch(`/api/recurring?status=all&includeDismissed=true`, { credentials: 'include' });
        if (recRes.ok) {
          const recData = await recRes.json();
          const items: any[] = recData.items || [];
          const matchedRule = items.find((i) => {
            if (initialRecurringItem && i.id === initialRecurringItem.id) return false;
            const p1 = (i.matchPattern || i.merchantName || '').toLowerCase();
            return (
              p1.split('|').some((part: string) => effectivePattern.includes(part.trim()) || part.trim() === effectivePattern) ||
              i.merchantName.toLowerCase() === merchantName.toLowerCase()
            );
          });
          setExistingRule(matchedRule || null);
          if (matchedRule) {
            setLinkMode('update_existing');
          }
        }
      } catch {
        // ignore
      } finally {
        setPreviewLoading(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [open, effectivePattern, accountId, initialRecurringItem, merchantName]);

  // Submit Handler
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!merchantName.trim()) {
      toast.error('Please enter a merchant name');
      return;
    }
    const parsedAmount = parseFloat(amount);
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      toast.error('Please enter a valid positive amount');
      return;
    }
    if (!lastDate) {
      toast.error('Please select a reference date');
      return;
    }

    setLoading(true);
    try {
      if (initialRecurringItem) {
        // Editing existing recurring rule
        const res = await fetch(`/api/recurring/${initialRecurringItem.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            merchantName: merchantName.trim(),
            matchPattern: effectivePattern,
            averageAmount: parsedAmount,
            frequency,
            categoryId: categoryId || null,
            accountId: accountId || null,
            lastDate,
            nextExpectedDate: nextExpectedDate || null,
            flowType,
            customName: customName.trim() || null,
            notes: notes.trim() || null,
            isConfirmed: true,
            isDismissed: false,
          }),
        });

        if (res.ok) {
          const updated = await res.json();
          toast.success('Recurring rule updated successfully');
          onSuccess?.(updated);
          onOpenChange(false);
        } else {
          const err = await res.json().catch(() => ({}));
          toast.error(err.error || 'Failed to update recurring rule');
        }
      } else if (existingRule && linkMode === 'update_existing') {
        // Link pattern as alias to existing recurring rule
        const existingPatterns = (existingRule.matchPattern || existingRule.merchantName || '')
          .split('|')
          .map((p: string) => p.trim().toLowerCase())
          .filter(Boolean);

        if (!existingPatterns.includes(effectivePattern)) {
          existingPatterns.push(effectivePattern);
        }
        const updatedPattern = existingPatterns.join('|');

        const res = await fetch(`/api/recurring/${existingRule.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            matchPattern: updatedPattern,
            isConfirmed: true,
            isDismissed: false,
            averageAmount: parsedAmount,
            lastAmount: parsedAmount,
            lastDate,
          }),
        });

        if (res.ok) {
          const updated = await res.json();
          toast.success(`Linked to existing rule "${existingRule.displayName}"`);
          onSuccess?.(updated);
          onOpenChange(false);
        } else {
          toast.error('Failed to link recurring rule');
        }
      } else {
        // Create new recurring rule
        const res = await fetch('/api/recurring', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            merchantName: merchantName.trim(),
            matchPattern: effectivePattern,
            amount: parsedAmount,
            frequency,
            categoryId: categoryId || null,
            accountId: accountId || null,
            lastDate,
            nextExpectedDate: nextExpectedDate || null,
            flowType,
            customName: customName.trim() || null,
            notes: notes.trim() || null,
            isConfirmed: true,
          }),
        });

        if (res.ok) {
          const created = await res.json();
          toast.success('Marked as recurring transaction');
          onSuccess?.(created);
          onOpenChange(false);
        } else {
          const err = await res.json().catch(() => ({}));
          toast.error(err.error || 'Failed to create recurring item');
        }
      }
    } catch {
      toast.error('Network error saving recurring rule');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl p-0 gap-0 overflow-hidden bg-card border-border shadow-2xl rounded-2xl">
        <DialogHeader className="p-5 sm:p-6 pb-4 border-b border-border/60 bg-muted/20">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
              <Repeat className="w-5 h-5" />
            </div>
            <div>
              <DialogTitle className="text-lg font-bold text-foreground">
                {initialRecurringItem ? 'Edit Recurring Rule' : 'Mark as Recurring'}
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground mt-0.5">
                Configure recurrence frequency, match pattern, and expected billing dates.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="p-5 sm:p-6 space-y-4 max-h-[75vh] overflow-y-auto">
          {/* Existing Rule Collision Banner */}
          {existingRule && !initialRecurringItem && (
            <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-xs space-y-2">
              <div className="flex items-center gap-2 text-amber-700 dark:text-amber-400 font-semibold">
                <AlertCircle className="w-4 h-4 shrink-0" />
                Matching rule already exists: &quot;{existingRule.displayName}&quot;
              </div>
              <p className="text-muted-foreground text-[11px] leading-relaxed">
                A recurring rule matching this merchant is already configured ({existingRule.frequency}, ~{formatCurrency(existingRule.averageAmount)}).
              </p>
              <div className="flex items-center gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setLinkMode('update_existing')}
                  className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors cursor-pointer ${
                    linkMode === 'update_existing'
                      ? 'bg-amber-500 text-white border-amber-600 shadow-xs'
                      : 'bg-background hover:bg-muted border-border text-foreground'
                  }`}
                >
                  Link & Update Existing Rule
                </button>
                <button
                  type="button"
                  onClick={() => setLinkMode('create_new')}
                  className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors cursor-pointer ${
                    linkMode === 'create_new'
                      ? 'bg-primary text-primary-foreground border-primary shadow-xs'
                      : 'bg-background hover:bg-muted border-border text-foreground'
                  }`}
                >
                  Create Separate Rule
                </button>
              </div>
            </div>
          )}

          {/* Row 1: Merchant & Pattern */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-foreground">
                Merchant / Payee Name <span className="text-destructive">*</span>
              </label>
              <button
                type="button"
                onClick={() => setShowPatternEditor((v) => !v)}
                className="text-[11px] text-primary hover:underline flex items-center gap-1 font-medium cursor-pointer"
              >
                {showPatternEditor ? 'Hide Match Pattern' : 'Edit Match Pattern'}
              </button>
            </div>
            <input
              type="text"
              value={merchantName}
              onChange={(e) => {
                setMerchantName(e.target.value);
                if (!showPatternEditor) {
                  setMatchPattern(normalizeMerchantName(e.target.value).toLowerCase());
                }
              }}
              placeholder="e.g. Netflix, Spotify, ConEd"
              required
              className="w-full h-9 px-3 bg-background border border-input rounded-xl text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>

          {/* Optional Match Pattern Field */}
          {showPatternEditor && (
            <div className="p-3 bg-muted/40 border border-border/60 rounded-xl space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-[11px] font-semibold text-foreground flex items-center gap-1">
                  Match Pattern (Pipe &apos;|&apos; separated aliases)
                </label>
                <span className="text-[10px] text-muted-foreground">Case-insensitive</span>
              </div>
              <input
                type="text"
                value={matchPattern}
                onChange={(e) => setMatchPattern(e.target.value)}
                placeholder="e.g. spotify|spotify usa|spotify streaming"
                className="w-full h-8 px-2.5 bg-background border border-input rounded-lg text-xs font-mono text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              />
              <p className="text-[10px] text-muted-foreground">
                Transactions matching any of these terms will automatically be linked to this recurring subscription.
              </p>
            </div>
          )}

          {/* Row 2: Amount & Flow Type */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground">
                Expected Amount <span className="text-destructive">*</span>
              </label>
              <div className="relative">
                <DollarSign className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="0.00"
                  required
                  className="w-full h-9 pl-9 pr-3 bg-background border border-input rounded-xl text-sm font-mono text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground">Flow Type</label>
              <div className="grid grid-cols-2 gap-1.5 p-0.5 bg-muted/60 rounded-xl border border-border/40">
                <button
                  type="button"
                  onClick={() => setFlowType('expense')}
                  className={`h-8 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                    flowType === 'expense'
                      ? 'bg-background text-rose-600 dark:text-rose-400 shadow-xs border border-border/50'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  Expense / Bill
                </button>
                <button
                  type="button"
                  onClick={() => setFlowType('income')}
                  className={`h-8 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                    flowType === 'income'
                      ? 'bg-background text-emerald-600 dark:text-emerald-400 shadow-xs border border-border/50'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  Income / Pay
                </button>
              </div>
            </div>
          </div>

          {/* Row 3: Frequency Selection */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-foreground">Recurrence Frequency</label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
              {FREQUENCY_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setFrequency(opt.value)}
                  className={`p-2 rounded-xl text-left border transition-all cursor-pointer ${
                    frequency === opt.value
                      ? 'bg-primary/10 border-primary text-primary font-bold shadow-xs'
                      : 'bg-background hover:bg-muted/50 border-input text-foreground font-medium'
                  }`}
                >
                  <div className="text-xs">{opt.label}</div>
                  <div className="text-[10px] text-muted-foreground truncate">{opt.intervalDesc}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Row 4: Dates (Last Paid & Next Due) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground">Last Occurrence Date</label>
              <input
                type="date"
                value={lastDate}
                onChange={(e) => setLastDate(e.target.value)}
                required
                className="w-full h-9 px-3 bg-background border border-input rounded-xl text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground">Next Expected Due Date</label>
              <input
                type="date"
                value={nextExpectedDate}
                onChange={(e) => setNextExpectedDate(e.target.value)}
                className="w-full h-9 px-3 bg-background border border-input rounded-xl text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
          </div>

          {/* Row 5: Category & Account */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground">Category</label>
              <Select
                className="h-9 rounded-xl text-xs px-2.5"
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value)}
              >
                <option value="">(No Category)</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground">Account Filter</label>
              <Select
                className="h-9 rounded-xl text-xs px-2.5"
                value={accountId}
                onChange={(e) => setAccountId(e.target.value)}
              >
                <option value="">Any Account</option>
                {accountsList.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </Select>
            </div>
          </div>

          {/* Row 6: Custom Name & Notes */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-foreground">Custom Display Name (Optional)</label>
            <input
              type="text"
              value={customName}
              onChange={(e) => setCustomName(e.target.value)}
              placeholder="e.g. Family Netflix Plan, Electric Bill"
              className="w-full h-9 px-3 bg-background border border-input rounded-xl text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>

          {/* Historical Match Preview Card */}
          {previewData && previewData.count > 0 && (
            <div className="p-3.5 rounded-xl bg-primary/[0.04] border border-primary/20 flex items-center justify-between text-xs">
              <div className="flex items-center gap-2.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                <div>
                  <div className="font-semibold text-foreground">
                    Matches {previewData.count} historical transaction{previewData.count === 1 ? '' : 's'}
                  </div>
                  <div className="text-[11px] text-muted-foreground">
                    Avg: {formatCurrency(previewData.averageAmount)} • Total: {formatCurrency(previewData.totalAmount)}
                    {previewData.suggestedFrequency && ` • Detected interval: ${previewData.suggestedFrequency}`}
                  </div>
                </div>
              </div>
            </div>
          )}

          <DialogFooter className="pt-3 border-t border-border/60 flex items-center justify-between sm:justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={loading}
              className="rounded-xl text-xs h-9 font-medium"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={loading}
              className="rounded-xl text-xs h-9 font-semibold px-4"
            >
              {loading ? (
                'Saving...'
              ) : initialRecurringItem ? (
                'Save Changes'
              ) : existingRule && linkMode === 'update_existing' ? (
                'Link to Existing Rule'
              ) : (
                'Save Recurring Rule'
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
