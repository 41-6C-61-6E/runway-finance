'use client';

import { useState, useEffect } from 'react';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { ConfirmDeleteDialog } from '@/components/ui/confirm-delete-dialog';
import { formatCurrency } from '@/lib/utils/format';
import { usePrivacyMode } from '@/components/privacy-mode-provider';
import { cn } from '@/lib/utils';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from 'recharts';
import {
  Repeat,
  History,
  Trash2,
  Calendar,
  CreditCard,
  Tag,
  TrendingUp,
  Clock,
  Sparkles,
  Check,
  ShieldCheck,
  Pause,
  AlertCircle,
  Save,
  Loader2,
} from 'lucide-react';
import type { RecurringItem } from './RecurringCard';
import type { FrequencyType } from '@/lib/services/recurring-detection';
import { toast } from 'sonner';

interface HistoryTx {
  id: string;
  date: string;
  amount: number;
  description: string;
  payee: string | null;
  pending: boolean;
}

interface SparklinePoint {
  date: string;
  amount: number;
}

interface RecurringDetailDrawerProps {
  item: RecurringItem | null;
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
  categories: { id: string; name: string; color: string }[];
}

export default function RecurringDetailDrawer({
  item,
  open,
  onClose,
  onSuccess,
  categories,
}: RecurringDetailDrawerProps) {
  const { privacyMode } = usePrivacyMode();

  const [customName, setCustomName] = useState('');
  const [expectedAmount, setExpectedAmount] = useState<number | string>('');
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [frequency, setFrequency] = useState<FrequencyType>('monthly');
  const [isPaused, setIsPaused] = useState(false);
  const [isConfirmed, setIsConfirmed] = useState(false);
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

  const [history, setHistory] = useState<HistoryTx[]>([]);
  const [sparkline, setSparkline] = useState<SparklinePoint[]>([]);
  const [totalSpentLifetime, setTotalSpentLifetime] = useState(0);
  const [loadingDetail, setLoadingDetail] = useState(false);

  useEffect(() => {
    if (item && open) {
      setCustomName(item.customName || '');
      setExpectedAmount(item.averageAmount);
      setCategoryId(item.categoryId);
      setFrequency(item.frequency);
      setIsPaused(item.isPaused);
      setIsConfirmed(item.isConfirmed);
      setNotes(item.notes || '');

      // Fetch detail history
      setLoadingDetail(true);
      fetch(`/api/recurring/${item.id}`)
        .then((r) => (r.ok ? r.json() : null))
        .then((data) => {
          if (data) {
            setHistory(data.history || []);
            setSparkline(data.sparkline || []);
            setTotalSpentLifetime(data.totalSpentLifetime || 0);
          }
        })
        .catch((err) => {
          console.error('Failed to load recurring item detail:', err);
        })
        .finally(() => {
          setLoadingDetail(false);
        });
    }
  }, [item, open]);

  if (!item) return null;

  const handleSave = async (extraUpdates?: Partial<RecurringItem>) => {
    setSaving(true);
    try {
      const parsedAmount = typeof expectedAmount === 'string' ? parseFloat(expectedAmount) : expectedAmount;

      const payload = {
        customName: customName.trim() || null,
        categoryId: categoryId || null,
        frequency,
        isPaused,
        isConfirmed,
        notes: notes.trim() || null,
        averageAmount: !isNaN(parsedAmount) && parsedAmount > 0 ? parsedAmount : undefined,
        ...extraUpdates,
      };

      const res = await fetch(`/api/recurring/${item.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) throw new Error('Failed to update recurring transaction');

      toast.success('Subscription details saved');
      onSuccess();
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Update failed');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      const res = await fetch(`/api/recurring/${item.id}`, {
        method: 'DELETE',
      });

      if (!res.ok) throw new Error('Failed to delete recurring transaction');

      toast.success('Recurring rule deleted');
      onSuccess();
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Delete failed');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
      <SheetContent className="w-full sm:max-w-md md:max-w-lg p-0 flex flex-col h-full bg-background border-l">
        {/* Header */}
        <SheetHeader className="p-5 sm:p-6 border-b shrink-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5 min-w-0">
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 shadow-xs"
                style={{
                  backgroundColor: `${item.categoryColor || '#6366f1'}18`,
                  border: `1px solid ${item.categoryColor || '#6366f1'}35`,
                }}
              >
                <Repeat className="w-5 h-5" style={{ color: item.categoryColor || '#6366f1' }} />
              </div>
              <div className="min-w-0">
                <SheetTitle className="text-base sm:text-lg font-bold text-foreground truncate">
                  {item.displayName}
                </SheetTitle>
                <p className="text-xs text-muted-foreground truncate">
                  Pattern: {item.matchPattern || item.merchantName}
                </p>
              </div>
            </div>

            <div className="text-right shrink-0">
              <div
                className={cn(
                  'text-lg font-extrabold text-foreground font-mono',
                  privacyMode && 'blur-xs select-none'
                )}
              >
                {formatCurrency(item.lastAmount || item.averageAmount)}
              </div>
              <div className="text-[11px] text-muted-foreground">
                {item.frequency}
              </div>
            </div>
          </div>

          {/* Status Alert & Quick Toggle Banner */}
          <div className="mt-3 pt-3 border-t border-border/40 flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5">
              {isPaused ? (
                <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-muted text-muted-foreground border flex items-center gap-1">
                  <Pause className="w-3 h-3" /> Paused
                </span>
              ) : isConfirmed ? (
                <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 flex items-center gap-1">
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" /> Confirmed Subscription
                </span>
              ) : (
                <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20 flex items-center gap-1">
                  <Sparkles className="w-3.5 h-3.5 text-amber-500" /> Needs Review
                </span>
              )}
            </div>

            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                const nextConfirmed = !isConfirmed;
                setIsConfirmed(nextConfirmed);
                handleSave({ isConfirmed: nextConfirmed, isDismissed: false });
              }}
              disabled={saving}
              className="text-xs h-7 px-2.5"
            >
              {isConfirmed ? 'Mark as Needs Review' : 'Confirm Subscription'}
            </Button>
          </div>
        </SheetHeader>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-6">
          {/* ── Stats Summary Grid ── */}
          <div className="grid grid-cols-3 gap-2.5 p-3.5 rounded-2xl bg-muted/40 border border-border/50 text-center">
            <div>
              <div className="text-[10px] uppercase font-bold text-muted-foreground">Lifetime</div>
              <div className={cn('text-sm font-bold text-foreground mt-0.5 font-mono', privacyMode && 'blur-xs select-none')}>
                {formatCurrency(totalSpentLifetime || item.averageAmount * item.occurrenceCount)}
              </div>
            </div>
            <div className="border-x border-border/50">
              <div className="text-[10px] uppercase font-bold text-muted-foreground">Average</div>
              <div className={cn('text-sm font-bold text-foreground mt-0.5 font-mono', privacyMode && 'blur-xs select-none')}>
                {formatCurrency(item.averageAmount)}
              </div>
            </div>
            <div>
              <div className="text-[10px] uppercase font-bold text-muted-foreground">Count</div>
              <div className="text-sm font-bold text-foreground mt-0.5 font-mono">
                {item.occurrenceCount} txns
              </div>
            </div>
          </div>

          {/* ── Amount History Sparkline ── */}
          {sparkline.length > 1 && (
            <div className="p-4 rounded-2xl bg-card border shadow-xs space-y-2">
              <div className="flex items-center justify-between text-xs font-semibold text-foreground">
                <span className="flex items-center gap-1.5">
                  <TrendingUp className="w-3.5 h-3.5 text-primary" />
                  Amount History
                </span>
                <span className="text-[11px] text-muted-foreground">Last {sparkline.length} cycles</span>
              </div>
              <div className="h-28 w-full pt-2">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={sparkline} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.15} vertical={false} />
                    <XAxis
                      dataKey="date"
                      tickLine={false}
                      axisLine={false}
                      tick={{ fontSize: 10, fill: 'currentColor', opacity: 0.5 }}
                      tickFormatter={(d) => d.slice(5)}
                    />
                    <YAxis hide domain={['dataMin - 5', 'dataMax + 5']} />
                    <Tooltip
                      formatter={(val: any) => [privacyMode ? '••••' : `$${Number(val).toFixed(2)}`, 'Amount']}
                      labelFormatter={(l) => `Date: ${l}`}
                      contentStyle={{
                        backgroundColor: 'var(--card)',
                        borderColor: 'var(--border)',
                        borderRadius: '0.75rem',
                        fontSize: '12px',
                      }}
                    />
                    <Line
                      type="monotone"
                      dataKey="amount"
                      stroke="var(--primary)"
                      strokeWidth={2.5}
                      dot={{ r: 3, fill: 'var(--primary)' }}
                      activeDot={{ r: 5 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {/* ── Form Fields ── */}
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-foreground mb-1">
                Display Name Override
              </label>
              <input
                type="text"
                value={customName}
                onChange={(e) => setCustomName(e.target.value)}
                placeholder={item.merchantName}
                className="w-full px-3 py-2 bg-background border border-input rounded-xl text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
               <div>
                 <label className="block text-xs font-semibold text-foreground mb-1">
                   Expected Amount ($)
                 </label>
                 <p className="text-xs text-muted-foreground mb-1">
                   Average amount used for forecasts and price-change alerts.
                 </p>
                 <input
                  type="number"
                  step="0.01"
                  value={expectedAmount}
                  onChange={(e) => setExpectedAmount(e.target.value)}
                  className="w-full px-3 py-2 bg-background border border-input rounded-xl text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-foreground mb-1">
                  Frequency
                </label>
                <select
                  value={frequency}
                  onChange={(e) => setFrequency(e.target.value as FrequencyType)}
                  className="w-full px-3 py-2 bg-background border border-input rounded-xl text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  <option value="weekly">Weekly</option>
                  <option value="biweekly">Bi-weekly</option>
                  <option value="monthly">Monthly</option>
                  <option value="quarterly">Quarterly</option>
                  <option value="semi_annual">Semi-annual</option>
                  <option value="annual">Annual</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-foreground mb-1">
                Category
              </label>
              <select
                value={categoryId || ''}
                onChange={(e) => setCategoryId(e.target.value || null)}
                className="w-full px-3 py-2 bg-background border border-input rounded-xl text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="">Uncategorized</option>
                {categories.map((cat) => (
                  <option key={cat.id} value={cat.id}>
                    {cat.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-foreground mb-1">
                Notes
              </label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Add private notes (e.g. renewal link, tier info, cancellation deadline)..."
                rows={2}
                className="w-full px-3 py-2 bg-background border border-input rounded-xl text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-none"
              />
            </div>

            {/* Pause Tracking Switch */}
            <div className="flex items-center justify-between p-3 rounded-xl bg-card border">
              <div className="space-y-0.5">
                <span className="text-xs font-semibold text-foreground block">
                  Pause Tracking
                </span>
                <span className="text-[11px] text-muted-foreground block">
                  Exclude from upcoming projections and budget alerts
                </span>
              </div>
              <Switch checked={isPaused} onCheckedChange={setIsPaused} />
            </div>
          </div>

          {/* ── Transaction History Stream ── */}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between text-xs font-semibold text-foreground">
              <span className="flex items-center gap-1.5">
                <History className="w-3.5 h-3.5 text-primary" />
                Matched Transactions History
              </span>
              <span className="text-[11px] text-muted-foreground">{history.length} found</span>
            </div>

            {loadingDetail ? (
              <div className="py-6 text-center text-xs text-muted-foreground">
                <Loader2 className="w-4 h-4 animate-spin mx-auto mb-1" />
                Loading history...
              </div>
            ) : history.length === 0 ? (
              <div className="p-4 rounded-xl border border-dashed text-center text-xs text-muted-foreground">
                No past transactions linked yet.
              </div>
            ) : (
              <div className="divide-y border rounded-xl overflow-hidden bg-card">
                {history.map((tx) => (
                  <div key={tx.id} className="p-3 flex items-center justify-between gap-2 text-xs">
                    <div className="min-w-0">
                      <div className="font-medium text-foreground truncate">
                        {tx.payee || tx.description}
                      </div>
                      <div className="text-[10px] text-muted-foreground">{tx.date}</div>
                    </div>
                    <div className={cn('font-mono font-semibold', privacyMode && 'blur-xs select-none')}>
                      {formatCurrency(tx.amount)}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Footer Actions */}
        <div className="p-4 sm:p-5 border-t bg-muted/20 flex items-center justify-between gap-3 shrink-0">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setDeleteDialogOpen(true)}
            disabled={deleting}
            className="text-xs text-destructive hover:bg-destructive/10 h-9"
          >
            <Trash2 className="w-3.5 h-3.5 mr-1" />
            Delete
          </Button>

          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onClose}
              className="text-xs h-9"
            >
              Cancel
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={() => handleSave()}
              disabled={saving}
              className="text-xs h-9 font-semibold"
            >
              {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" /> : <Save className="w-3.5 h-3.5 mr-1.5" />}
              Save Changes
            </Button>
          </div>
        </div>

        <ConfirmDeleteDialog
          open={deleteDialogOpen}
          onOpenChange={setDeleteDialogOpen}
          title={`Delete ${item.displayName}?`}
          description="This cannot be undone."
          confirmText="Delete"
          busy={deleting}
          onConfirm={handleDelete}
        />
      </SheetContent>
    </Sheet>
  );
}
