'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  Repeat,
  Sparkles,
  Search,
  Filter,
  Plus,
  CheckCheck,
  EyeOff,
  AlertCircle,
  Clock,
  ArrowUpDown,
  RefreshCw,
  SlidersHorizontal,
  TrendingDown,
  TrendingUp,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { AppTabs } from '@/components/ui/app-tabs';
import { CollapsibleFilterPanel } from '@/components/ui/collapsible-filter-panel';
import { MobileViewSwitcher } from '@/components/ui/mobile-view-switcher';
import RecurringCard, { RecurringItem } from './RecurringCard';
import RecurringSidePanel from './RecurringSidePanel';
import RecurringDetailDrawer from './RecurringDetailDrawer';
import { RecurringSettingsMenu } from './RecurringSettingsMenu';
import { RecurringBulkActionsToolbar } from './RecurringBulkActionsToolbar';
import { MergeRecurringModal } from './MergeRecurringModal';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { formatCurrency } from '@/lib/utils/format';
import { toast } from 'sonner';

interface RecurringViewProps {
  onSelectTransaction?: (txId: string) => void;
}

const STATUS_LABELS: Record<string, string> = {
  active: 'Active',
  needs_review: 'Review',
  paused: 'Paused',
  dismissed: 'Dismissed',
};

const SORT_LABELS: Record<string, string> = {
  amount: 'Highest Amount',
  name: 'Name',
  nextDate: 'Next Due',
};

export default function RecurringView({ onSelectTransaction }: RecurringViewProps) {
  const [items, setItems] = useState<RecurringItem[]>([]);
  const [summary, setSummary] = useState<any>(null);

  // Notification deep-linking: honor ?search=<name> from notification urlPath
  const searchParams = useSearchParams();
  const [categories, setCategories] = useState<{ id: string; name: string; color: string }[]>([]);
  const [accountsList, setAccountsList] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);

  // Filters & Search
  const [activeFilter, setActiveFilter] = useState<'all' | 'active' | 'needs_review' | 'paused' | 'dismissed'>('all');
  const [searchQuery, setSearchQuery] = useState(() => searchParams.get('search') || '');
  const [sortBy, setSortBy] = useState<'amount' | 'name' | 'nextDate'>('amount');
  const [showOptions, setShowOptions] = useState(false);

  // Multi-selection state
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [mergeModalItem, setMergeModalItem] = useState<RecurringItem | null>(null);

  // Selected item for drawer
  const [selectedItem, setSelectedItem] = useState<RecurringItem | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Manual create dialog
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [newMerchant, setNewMerchant] = useState('');
  const [newAmount, setNewAmount] = useState('');
  const [newFrequency, setNewFrequency] = useState('monthly');
  const [newCategoryId, setNewCategoryId] = useState('');
  const [newAccountId, setNewAccountId] = useState('');
  const [newLastDate, setNewLastDate] = useState(new Date().toISOString().split('T')[0]);
  const [newFlowType, setNewFlowType] = useState<'expense' | 'income'>('expense');
  const [creating, setCreating] = useState(false);

  // Fetch categories & accounts
  useEffect(() => {
    fetch('/api/categories')
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => {
        if (Array.isArray(data)) {
          setCategories(data.map((c: any) => ({ id: c.id, name: c.name, color: c.color || '#6366f1' })));
        }
      })
      .catch(() => {});

    fetch('/api/accounts')
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => {
        if (Array.isArray(data)) {
          setAccountsList(data.map((a: any) => ({ id: a.id, name: a.name })));
        }
      })
      .catch(() => {});
  }, []);

  // Fetch recurring list & summary
  // Silent refreshes (after saves/confirmations) skip the spinner so the
  // page doesn't flicker while the data updates in place.
  const fetchRecurring = useCallback(async (opts?: { silent?: boolean }) => {
    if (!opts?.silent) setLoading(true);
    try {
      const res = await fetch('/api/recurring?includeDismissed=true&status=all');
      if (res.ok) {
        const data = await res.json();
        setItems(data.items || []);
        setSummary(data.summary || null);
      }
    } catch (err) {
      console.error('Failed to load recurring data:', err);
    } finally {
      if (!opts?.silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchRecurring();
  }, [fetchRecurring]);

  // Sync search when the URL deep-link changes (e.g. clicking a notification
  // while already on the recurring view).
  useEffect(() => {
    const q = searchParams.get('search');
    if (q !== null) setSearchQuery(q);
  }, [searchParams]);

  // Trigger scan
  const handleScan = async () => {
    setScanning(true);
    try {
      const res = await fetch('/api/recurring/detect', { method: 'POST' });
      if (res.ok) {
        const data = await res.json();
        toast.success(`Scan complete: ${data.created} new detected, ${data.updated} updated`);
        await fetchRecurring();
      } else {
        toast.error('Detection scan failed');
      }
    } catch (err) {
      toast.error('Failed to run recurring scan');
    } finally {
      setScanning(false);
    }
  };

  // Silent refresh helper for post-mutation updates (no page-level spinner)
  const refreshRecurring = useCallback(() => fetchRecurring({ silent: true }), [fetchRecurring]);

  // Update single item
  const handleUpdate = async (id: string, updates: Partial<RecurringItem>) => {
    try {
      const res = await fetch(`/api/recurring/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });
      if (res.ok) {
        if (updates.isConfirmed) {
          toast.success('Subscription confirmed and moved to Active');
        } else if (updates.isDismissed) {
          toast.success('Item dismissed');
        } else {
          toast.success('Updated successfully');
        }
        await refreshRecurring();
      }
    } catch (err) {
      toast.error('Update failed');
    }
  };

  // Delete single item
  const handleDelete = async (id: string) => {
    try {
      const res = await fetch(`/api/recurring/${id}`, { method: 'DELETE' });
      if (res.ok) {
        toast.success('Deleted rule');
        await refreshRecurring();
      }
    } catch (err) {
      toast.error('Delete failed');
    }
  };

  // Create manual
  const handleCreateManual = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMerchant.trim() || !newAmount) {
      toast.error('Please provide merchant name and amount');
      return;
    }

    setCreating(true);
    try {
      const res = await fetch('/api/recurring', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          merchantName: newMerchant.trim(),
          amount: parseFloat(newAmount),
          frequency: newFrequency,
          categoryId: newCategoryId || null,
          accountId: newAccountId || null,
          lastDate: newLastDate,
          flowType: newFlowType,
          isConfirmed: true,
        }),
      });

      if (res.ok) {
        toast.success('Recurring subscription created');
        setCreateModalOpen(false);
        setNewMerchant('');
        setNewAmount('');
        await refreshRecurring();
      } else {
        const d = await res.json().catch(() => ({}));
        toast.error(d.error || 'Failed to create recurring item');
      }
    } catch {
      toast.error('Network error creating item');
    } finally {
      setCreating(false);
    }
  };

  // Multi-select handlers
  const handleToggleSelect = (id: string) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]));
  };

  const handleClearSelection = () => {
    setSelectedIds([]);
  };

  // Filter tab counts
  const tabCounts = useMemo(() => {
    const active = items.filter((i) => !i.isPaused && !i.isDismissed && i.isConfirmed).length;
    const needsReview = items.filter((i) => !i.isConfirmed && !i.isDismissed).length;
    const paused = items.filter((i) => i.isPaused && !i.isDismissed).length;
    const dismissed = items.filter((i) => i.isDismissed).length;
    return {
      all: items.filter((i) => !i.isDismissed).length,
      active,
      needsReview,
      paused,
      dismissed,
    };
  }, [items]);

  // Needs review items
  const needsReviewItems = useMemo(() => {
    return items.filter((i) => !i.isConfirmed && !i.isDismissed);
  }, [items]);

  // Filtered items
  const displayedItems = useMemo(() => {
    let list = items;

    // Filter by tab
    if (activeFilter === 'active') {
      list = list.filter((i) => !i.isPaused && !i.isDismissed && i.isConfirmed);
    } else if (activeFilter === 'needs_review') {
      list = list.filter((i) => !i.isConfirmed && !i.isDismissed);
    } else if (activeFilter === 'paused') {
      list = list.filter((i) => i.isPaused && !i.isDismissed);
    } else if (activeFilter === 'dismissed') {
      list = list.filter((i) => i.isDismissed);
    } else {
      // 'all'
      list = list.filter((i) => !i.isDismissed);
    }

    // Search query
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter(
        (i) =>
          i.displayName.toLowerCase().includes(q) ||
          i.merchantName.toLowerCase().includes(q) ||
          (i.categoryName && i.categoryName.toLowerCase().includes(q)) ||
          (i.accountName && i.accountName.toLowerCase().includes(q))
      );
    }

    return list;
  }, [items, activeFilter, searchQuery]);

  // Sorter helper (highest amount first by default)
  const sortComparator = useCallback(
    (a: RecurringItem, b: RecurringItem) => {
      if (sortBy === 'name') {
        return a.displayName.localeCompare(b.displayName);
      }
      if (sortBy === 'nextDate') {
        if (!a.nextExpectedDate) return 1;
        if (!b.nextExpectedDate) return -1;
        return a.nextExpectedDate.localeCompare(b.nextExpectedDate);
      }
      // default 'amount': highest amount first
      return b.averageAmount - a.averageAmount;
    },
    [sortBy]
  );

  // Split into Expense and Income columns (sorted by highest amount first)
  const expenseItems = useMemo(() => {
    return displayedItems.filter((i) => i.flowType === 'expense').sort(sortComparator);
  }, [displayedItems, sortComparator]);

  const incomeItems = useMemo(() => {
    return displayedItems.filter((i) => i.flowType === 'income').sort(sortComparator);
  }, [displayedItems, sortComparator]);

  const totalExpenseMonthly = useMemo(() => {
    return expenseItems.reduce((sum, i) => sum + i.monthlyAmount, 0);
  }, [expenseItems]);

  const totalIncomeMonthly = useMemo(() => {
    return incomeItems.reduce((sum, i) => sum + i.monthlyAmount, 0);
  }, [incomeItems]);

  // Bulk confirm all needs review
  const handleConfirmAllReview = async () => {
    if (needsReviewItems.length === 0) return;
    try {
      const res = await fetch('/api/recurring', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'confirm',
          ids: needsReviewItems.map((i) => i.id),
        }),
      });
      if (res.ok) {
        toast.success(`Confirmed all ${needsReviewItems.length} subscriptions`);
        await refreshRecurring();
      }
    } catch {
      toast.error('Bulk confirm failed');
    }
  };

  // Bulk dismiss all needs review
  const handleDismissAllReview = async () => {
    if (needsReviewItems.length === 0) return;
    try {
      const res = await fetch('/api/recurring', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'dismiss_all_pending',
        }),
      });
      if (res.ok) {
        toast.success('Dismissed all pending suggestions');
        await refreshRecurring();
      }
    } catch {
      toast.error('Bulk dismiss failed');
    }
  };

  const mainContent = (
    <div className="space-y-6">
      {/* ── Search & Filter Controls Bar ── */}
      <div className="bg-muted hover:bg-muted/85 border border-border rounded-xl transition-all duration-200 overflow-visible">
        <CollapsibleFilterPanel
          isOpen={showOptions}
          onToggle={() => setShowOptions((v) => !v)}
          activeFilterCount={
            (activeFilter !== 'all' ? 1 : 0) + (sortBy !== 'amount' ? 1 : 0)
          }
          feedbackItems={
            activeFilter !== 'all' || sortBy !== 'amount' ? [
              <div key="chips" className="flex items-center gap-2 flex-wrap">
                {activeFilter !== 'all' && (
                  <span className="bg-primary/10 text-primary border border-primary/20 px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider animate-in fade-in duration-150">
                    {STATUS_LABELS[activeFilter]}
                  </span>
                )}
                {sortBy !== 'amount' && (
                  <span className="bg-primary/10 text-primary border border-primary/20 px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider animate-in fade-in duration-150">
                    Sort: {SORT_LABELS[sortBy]}
                  </span>
                )}
              </div>,
            ] : undefined
          }
          actions={
            activeFilter !== 'all' || sortBy !== 'amount' ? (
              <div className="flex items-center gap-2 shrink-0">
                <span className="h-6 px-2 flex items-center rounded-md bg-primary/10 text-primary border border-primary/20 text-[10px] font-semibold uppercase tracking-wider">
                  Filtered
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setActiveFilter('all');
                    setSortBy('amount');
                  }}
                  className="h-6 px-2 flex items-center gap-1 rounded-md bg-background hover:bg-muted border border-border text-muted-foreground hover:text-foreground text-[10px] font-semibold uppercase tracking-wider transition-colors cursor-pointer"
                >
                  <X className="w-3 h-3" />
                  Clear
                </button>
              </div>
            ) : undefined
          }
          centerContent={
            <div className="relative w-full max-w-xs">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search subscriptions, bills, merchants..."
                className="h-8 w-full pl-8 pr-7 bg-background border border-border rounded-lg text-xs sm:text-sm text-foreground placeholder:text-muted-foreground/70 focus:outline-none focus:ring-1 focus:ring-ring transition-colors"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  aria-label="Clear search"
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors cursor-pointer p-0.5"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          }
          rightActions={
            <RecurringSettingsMenu
              onScan={handleScan}
              onRefresh={refreshRecurring}
              scanning={scanning}
            />
          }
          className="border-b-0 bg-transparent px-3 sm:px-4 py-2"
        >
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2 p-3 bg-muted/20 border border-border/20 rounded-xl">
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5 mr-1 select-none">
                <Filter className="w-3 h-3" />
                Status
              </span>
              <AppTabs
                tabs={[
                  { id: 'all', label: `All (${tabCounts.all})` },
                  { id: 'active', label: `Active (${tabCounts.active})` },
                  { id: 'needs_review', label: `Review (${tabCounts.needsReview})` },
                  { id: 'paused', label: `Paused (${tabCounts.paused})` },
                  { id: 'dismissed', label: `Dismissed (${tabCounts.dismissed})` },
                ]}
                activeTab={activeFilter}
                onChange={(tab) => setActiveFilter(tab as any)}
                variant="pills"
                size="sm"
              />
            </div>
            <div className="flex flex-wrap items-center gap-2 p-3 bg-muted/20 border border-border/20 rounded-xl">
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5 mr-1 select-none">
                <ArrowUpDown className="w-3 h-3" />
                Sort By
              </span>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as any)}
                className="px-2.5 py-1.5 bg-background border border-input rounded-xl text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              >
                <option value="amount">Highest Amount</option>
                <option value="nextDate">Next Due Date</option>
                <option value="name">Merchant Name</option>
              </select>
            </div>
          </div>
        </CollapsibleFilterPanel>
      </div>

      {/* ── Bulk Actions Toolbar ── */}
      <RecurringBulkActionsToolbar
        selectedIds={selectedIds}
        items={items}
        onClearSelection={handleClearSelection}
        onSuccess={refreshRecurring}
      />

      {/* ── Needs Review Quick Action Banner ── */}
      {needsReviewItems.length > 0 && activeFilter === 'needs_review' && (
        <div className="p-4 sm:p-5 rounded-2xl bg-amber-500/[0.04] border border-amber-500/25 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xs">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
              <AlertCircle className="w-4 h-4" />
            </div>
            <div>
              <h4 className="font-bold text-sm text-foreground">
                {needsReviewItems.length} Detected Recurring Transactions
              </h4>
              <p className="text-xs text-muted-foreground">
                Confirm detected subscriptions to add them to your active forecasts and upcoming bill alerts.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <Button
              variant="outline"
              size="sm"
              onClick={handleDismissAllReview}
              className="text-xs h-8 px-3"
            >
              <EyeOff className="w-3.5 h-3.5 mr-1 text-muted-foreground" />
              Dismiss All
            </Button>
            <Button
              size="sm"
              onClick={handleConfirmAllReview}
              className="text-xs h-8 px-3 font-semibold"
            >
              <CheckCheck className="w-3.5 h-3.5 mr-1" />
              Confirm All ({needsReviewItems.length})
            </Button>
          </div>
        </div>
      )}

      {/* ── Income & Expense Columns (Highest Amount First) ── */}
      {loading ? (
        <div className="py-16 text-center text-sm text-muted-foreground">
          <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-primary opacity-60" />
          Loading recurring subscriptions...
        </div>
      ) : displayedItems.length === 0 ? (
        <div className="py-16 text-center rounded-2xl border border-dashed border-border/80 p-8 space-y-3">
          <div className="w-12 h-12 rounded-2xl bg-primary/10 text-primary flex items-center justify-center mx-auto">
            <Repeat className="w-6 h-6" />
          </div>
          <h3 className="font-semibold text-base text-foreground">No recurring items found</h3>
          <p className="text-xs text-muted-foreground max-w-sm mx-auto">
            {searchQuery
              ? 'No recurring transactions match your search filter.'
              : 'Scan your past transactions or add your subscriptions and recurring bills manually.'}
          </p>
          <div className="flex items-center justify-center gap-3 pt-2">
            <Button onClick={() => setCreateModalOpen(true)} variant="outline" size="sm">
              <Plus className="w-4 h-4 mr-1.5" />
              Add Manually
            </Button>
            <Button onClick={handleScan} disabled={scanning} size="sm">
              <Sparkles className="w-4 h-4 mr-1.5" />
              Run Detection Scan
            </Button>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
          {/* ── Column 1: Expenses & Bills (Highest Amount First) ── */}
          <div className="space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-border/60">
              <div className="flex items-center gap-2">
                <div className="w-2.5 h-2.5 rounded-full bg-rose-500 shadow-xs" />
                <h3 className="font-bold text-xs sm:text-sm text-foreground uppercase tracking-wider">
                  Expenses ({expenseItems.length})
                </h3>
              </div>
              <span className="text-xs font-mono font-bold text-muted-foreground">
                -{formatCurrency(totalExpenseMonthly)}/mo
              </span>
            </div>

            {expenseItems.length === 0 ? (
              <div className="p-6 text-center rounded-xl border border-dashed border-border/60 text-xs text-muted-foreground">
                No recurring expenses in this filter.
              </div>
            ) : (
              <div className="space-y-3">
                {expenseItems.map((item) => (
                  <RecurringCard
                    key={item.id}
                    item={item}
                    selected={selectedIds.includes(item.id)}
                    onToggleSelect={handleToggleSelect}
                    onOpenDetail={(i) => {
                      setSelectedItem(i);
                      setDrawerOpen(true);
                    }}
                    onUpdate={handleUpdate}
                    onDelete={handleDelete}
                    onMergeRequest={(i) => setMergeModalItem(i)}
                  />
                ))}
              </div>
            )}
          </div>

          {/* ── Column 2: Recurring Income (Highest Amount First) ── */}
          <div className="space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-border/60">
              <div className="flex items-center gap-2">
                <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 shadow-xs" />
                <h3 className="font-bold text-xs sm:text-sm text-foreground uppercase tracking-wider">
                  Income ({incomeItems.length})
                </h3>
              </div>
              <span className="text-xs font-mono font-bold text-emerald-600 dark:text-emerald-400">
                +{formatCurrency(totalIncomeMonthly)}/mo
              </span>
            </div>

            {incomeItems.length === 0 ? (
              <div className="p-6 text-center rounded-xl border border-dashed border-border/60 text-xs text-muted-foreground">
                No recurring income in this filter.
              </div>
            ) : (
              <div className="space-y-3">
                {incomeItems.map((item) => (
                  <RecurringCard
                    key={item.id}
                    item={item}
                    selected={selectedIds.includes(item.id)}
                    onToggleSelect={handleToggleSelect}
                    onOpenDetail={(i) => {
                      setSelectedItem(i);
                      setDrawerOpen(true);
                    }}
                    onUpdate={handleUpdate}
                    onDelete={handleDelete}
                    onMergeRequest={(i) => setMergeModalItem(i)}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );

  const summaryContent = (
    <RecurringSidePanel summary={summary} />
  );

  return (
    <div className="w-full">
      {/* Responsive View Switcher */}
      <MobileViewSwitcher
        main={mainContent}
        summary={summaryContent}
        mainLabel="Subscriptions"
        summaryLabel="Overview"
        summaryCardId="recurringSummary"
      />

      {/* Detail & History Drawer */}
      <RecurringDetailDrawer
        item={selectedItem}
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        onSuccess={refreshRecurring}
        categories={categories}
      />

      {/* Single Item Merge Modal (triggered from card popover) */}
      {mergeModalItem && (
        <MergeRecurringModal
          open={!!mergeModalItem}
          onClose={() => setMergeModalItem(null)}
          sourceItem={mergeModalItem}
          allItems={items}
          onSuccess={refreshRecurring}
        />
      )}

      {/* Manual Create Modal */}
      <Dialog open={createModalOpen} onOpenChange={setCreateModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base font-bold">Add Recurring Item</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleCreateManual} className="space-y-3 pt-2">
            <div>
              <label className="block text-xs font-semibold text-foreground mb-1">
                Merchant / Subscription Name *
              </label>
              <input
                type="text"
                required
                value={newMerchant}
                onChange={(e) => setNewMerchant(e.target.value)}
                placeholder="e.g. Netflix, Spotify, Gym"
                className="w-full px-3 py-2 bg-background border border-input rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-foreground mb-1">
                  Expected Amount ($) *
                </label>
                <input
                  type="number"
                  step="0.01"
                  required
                  value={newAmount}
                  onChange={(e) => setNewAmount(e.target.value)}
                  placeholder="14.99"
                  className="w-full px-3 py-2 bg-background border border-input rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-ring font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-foreground mb-1">
                  Frequency *
                </label>
                <select
                  value={newFrequency}
                  onChange={(e) => setNewFrequency(e.target.value)}
                  className="w-full px-3 py-2 bg-background border border-input rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-ring"
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

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-foreground mb-1">Category</label>
                <select
                  value={newCategoryId}
                  onChange={(e) => setNewCategoryId(e.target.value)}
                  className="w-full px-3 py-2 bg-background border border-input rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  <option value="">Uncategorized</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-foreground mb-1">Account</label>
                <select
                  value={newAccountId}
                  onChange={(e) => setNewAccountId(e.target.value)}
                  className="w-full px-3 py-2 bg-background border border-input rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  <option value="">None / Any Account</option>
                  {accountsList.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-foreground mb-1">Last Date</label>
                <input
                  type="date"
                  value={newLastDate}
                  onChange={(e) => setNewLastDate(e.target.value)}
                  className="w-full px-3 py-2 bg-background border border-input rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-foreground mb-1">Flow Type</label>
                <select
                  value={newFlowType}
                  onChange={(e) => setNewFlowType(e.target.value as any)}
                  className="w-full px-3 py-2 bg-background border border-input rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  <option value="expense">Expense / Outflow</option>
                  <option value="income">Income / Inflow</option>
                </select>
              </div>
            </div>

            <DialogFooter className="pt-3">
              <Button type="button" variant="outline" onClick={() => setCreateModalOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={creating} className="font-semibold">
                {creating ? 'Creating...' : 'Create Subscription'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
