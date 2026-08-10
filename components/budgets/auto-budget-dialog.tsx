'use client';

import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { formatCurrency } from '@/lib/utils/format';
import {
  Sparkles,
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  Layers,
  Sliders,
  Check,
  RotateCcw,
  Info,
  ArrowUpCircle,
  TrendingDown,
  Wand2,
  RefreshCw,
  Eye,
  Receipt,
} from 'lucide-react';
import { toast } from 'sonner';

interface ProposalItem {
  categoryId: string;
  categoryName: string;
  categoryColor: string;
  isIncome: boolean;
  isDiscretionary: boolean;
  historicalAverage: number;
  historicalMedian: number;
  historicalMax: number;
  proposedAmount: number;
  existingAmount: number | null;
  isSmallCategory: boolean;
  isSelected: boolean;
  sampleTransactions?: Array<{ id: string; date: string; description: string; amount: number; source: string }>;
  groupedCategories?: Array<{
    categoryId: string;
    categoryName: string;
    historicalAverage: number;
    proposedAmount: number;
  }>;
}

interface ProposalMeta {
  oldestTransactionDate: string | null;
  requestedLookbackMonths: number;
  actualMonthsAvailable: number;
  totalTransactionsAnalyzed: number;
  isInsufficientHistory: boolean;
  warningMessage: string | null;
}

interface AutoBudgetDialogProps {
  open: boolean;
  onClose: () => void;
  periodType: string;
  periodKey: string;
}

export function AutoBudgetDialog({ open, onClose, periodType, periodKey }: AutoBudgetDialogProps) {
  const queryClient = useQueryClient();
  const [step, setStep] = useState<1 | 2>(1);

  // Configuration settings
  const [lookbackMonths, setLookbackMonths] = useState<number>(3);
  const [calculationMethod, setCalculationMethod] = useState<'average' | 'median' | 'max'>('average');
  const [bufferPercentage, setBufferPercentage] = useState<number>(5);
  const [excludeOutliers, setExcludeOutliers] = useState<boolean>(true);
  const [excludeVirtualAccounts, setExcludeVirtualAccounts] = useState<boolean>(true);
  const [groupSmallCategories, setGroupSmallCategories] = useState<boolean>(true);
  const [smallCategoryThreshold, setSmallCategoryThreshold] = useState<number>(50);
  const [includeIncome, setIncludeIncome] = useState<boolean>(false);
  const [onlyUnbudgeted, setOnlyUnbudgeted] = useState<boolean>(false);
  const [overwriteExisting, setOverwriteExisting] = useState<boolean>(true);

  // Proposal state
  const [generating, setGenerating] = useState<boolean>(false);
  const [publishing, setPublishing] = useState<boolean>(false);
  const [error, setError] = useState<string>('');
  const [proposalItems, setProposalItems] = useState<ProposalItem[]>([]);
  const [meta, setMeta] = useState<ProposalMeta | null>(null);

  // UI state for proposal table
  const [expandedGroup, setExpandedGroup] = useState<boolean>(false);
  const [categoryFilter, setCategoryFilter] = useState<'all' | 'expense' | 'income'>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [inspectItem, setInspectItem] = useState<ProposalItem | null>(null);

  const periodLabel = periodType === 'quarterly' ? '/qtr' : periodType === 'yearly' ? '/yr' : '/mo';

  const handleGenerateProposal = async () => {
    setGenerating(true);
    setError('');
    try {
      const res = await fetch('/api/budgets/auto-budget/proposal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          lookbackMonths,
          calculationMethod,
          bufferPercentage,
          excludeOutliers,
          excludeVirtualAccounts,
          groupSmallCategories,
          smallCategoryThreshold,
          includeIncome,
          onlyUnbudgeted,
          periodType,
          periodKey,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message || data.error || 'Failed to generate proposal');
      }

      const data = await res.json();
      setProposalItems(data.proposal || []);
      setMeta(data.meta || null);
      setStep(2);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An unexpected error occurred');
    } finally {
      setGenerating(false);
    }
  };

  const handlePublish = async () => {
    const selectedItems = proposalItems.filter((item) => item.isSelected && item.proposedAmount > 0);
    if (selectedItems.length === 0) {
      setError('Please select at least one budget item with an amount > $0');
      return;
    }

    setPublishing(true);
    setError('');
    try {
      const payloadItems = selectedItems.map((item) => ({
        categoryId: item.categoryId,
        amount: item.proposedAmount,
        isDiscretionary: item.isDiscretionary,
        groupedCategories: item.groupedCategories,
      }));

      const res = await fetch('/api/budgets/auto-budget/apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          items: payloadItems,
          overwriteExisting,
          periodType,
          periodKey,
          isRecurring: true,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message || data.error || 'Failed to publish budgets');
      }

      const data = await res.json();
      queryClient.invalidateQueries({ queryKey: ['budgets'] });
      toast.success(`Successfully published ${data.count} budgets!`);
      onClose();
      resetForm();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to publish budgets');
    } finally {
      setPublishing(false);
    }
  };

  const resetForm = () => {
    setStep(1);
    setProposalItems([]);
    setMeta(null);
    setError('');
    setSearchQuery('');
    setInspectItem(null);
  };

  const toggleSelectAll = (select: boolean) => {
    setProposalItems((prev) => prev.map((item) => ({ ...item, isSelected: select })));
  };

  const updateProposedAmount = (categoryId: string, amount: number) => {
    setProposalItems((prev) =>
      prev.map((item) => (item.categoryId === categoryId ? { ...item, proposedAmount: Math.round(Math.max(0, amount)) } : item))
    );
  };

  const toggleSelectItem = (categoryId: string) => {
    setProposalItems((prev) =>
      prev.map((item) => (item.categoryId === categoryId ? { ...item, isSelected: !item.isSelected } : item))
    );
  };

  const toggleDiscretionary = (categoryId: string) => {
    setProposalItems((prev) =>
      prev.map((item) => (item.categoryId === categoryId ? { ...item, isDiscretionary: !item.isDiscretionary } : item))
    );
  };

  const ungroupCategory = (groupedCatId: string) => {
    setProposalItems((prev) => {
      const allOtherItem = prev.find((item) => item.isSmallCategory);
      if (!allOtherItem || !allOtherItem.groupedCategories) return prev;

      const catToExtract = allOtherItem.groupedCategories.find((gc) => gc.categoryId === groupedCatId);
      if (!catToExtract) return prev;

      const updatedGrouped = allOtherItem.groupedCategories.filter((gc) => gc.categoryId !== groupedCatId);
      const newGroupedProposed = updatedGrouped.reduce((s, gc) => s + gc.proposedAmount, 0);

      const newStandaloneItem: ProposalItem = {
        categoryId: catToExtract.categoryId,
        categoryName: catToExtract.categoryName,
        categoryColor: '#6366f1',
        isIncome: false,
        isDiscretionary: true,
        historicalAverage: catToExtract.historicalAverage,
        historicalMedian: catToExtract.historicalAverage,
        historicalMax: catToExtract.historicalAverage,
        proposedAmount: catToExtract.proposedAmount,
        existingAmount: null,
        isSmallCategory: false,
        isSelected: true,
      };

      let nextItems = prev.map((item) => {
        if (item.isSmallCategory) {
          return {
            ...item,
            proposedAmount: newGroupedProposed,
            groupedCategories: updatedGrouped,
          };
        }
        return item;
      });

      if (updatedGrouped.length === 0) {
        nextItems = nextItems.filter((i) => !i.isSmallCategory);
      }

      return [...nextItems, newStandaloneItem];
    });
  };

  // Aggregates for summary
  const selectedProposalItems = proposalItems.filter((i) => i.isSelected);
  const totalProposedExpenses = selectedProposalItems
    .filter((i) => !i.isIncome)
    .reduce((s, i) => s + i.proposedAmount, 0);
  const totalProposedIncome = selectedProposalItems
    .filter((i) => i.isIncome)
    .reduce((s, i) => s + i.proposedAmount, 0);

  const filteredProposalItems = proposalItems.filter((item) => {
    if (categoryFilter === 'expense' && item.isIncome) return false;
    if (categoryFilter === 'income' && !item.isIncome) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchName = item.categoryName.toLowerCase().includes(q);
      const matchGrouped = item.groupedCategories?.some((gc) => gc.categoryName.toLowerCase().includes(q));
      if (!matchName && !matchGrouped) return false;
    }
    return true;
  });

  return (
    <>
      <Dialog open={open} onOpenChange={(o) => { if (!o) { onClose(); resetForm(); } }}>
      <DialogContent className="max-w-3xl max-h-[90vh]">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-lg bg-primary/10 text-primary">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <DialogTitle className="text-lg">Automatic Budget Builder</DialogTitle>
              <DialogDescription>
                {step === 1
                  ? 'Configure lookback period and spending strategies to build a personalized budget proposal.'
                  : 'Review, modify, and fine-tune your calculated budget proposal before publishing.'}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {error && (
          <div className="p-3 bg-destructive/15 border border-destructive/30 rounded-lg flex items-center gap-2 text-destructive text-sm">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* STEP 1: CONFIGURATION */}
        {step === 1 && (
          <div className="space-y-5 py-2">
            {/* Lookback Period Selection */}
            <div>
              <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                Historical Lookback Period
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {[
                  { value: 1, label: '1 Month' },
                  { value: 3, label: '3 Months' },
                  { value: 6, label: '6 Months' },
                  { value: 12, label: '12 Months' },
                ].map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setLookbackMonths(option.value)}
                    className={`py-2.5 px-3 rounded-lg text-xs font-semibold border transition-all flex flex-col items-center justify-center gap-1 ${
                      lookbackMonths === option.value
                        ? 'bg-primary text-primary-foreground border-primary shadow-xs'
                        : 'bg-background hover:bg-muted text-foreground border-border'
                    }`}
                  >
                    <span>{option.label}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Calculation Method & Safety Buffer */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">
                  Calculation Strategy
                </label>
                <select
                  value={calculationMethod}
                  onChange={(e) => setCalculationMethod(e.target.value as any)}
                  className="w-full px-3 py-2 bg-background border border-input rounded-lg text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  <option value="average">Average Spending (Mean)</option>
                  <option value="median">Median Spending (Outlier resilient)</option>
                  <option value="max">Peak Spending (Conservative high)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">
                  Adjustment Buffer (%)
                </label>
                <div className="flex items-center gap-2">
                  <select
                    value={bufferPercentage}
                    onChange={(e) => setBufferPercentage(parseFloat(e.target.value))}
                    className="w-full px-3 py-2 bg-background border border-input rounded-lg text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  >
                    <option value={-15}>-15% Aggressive Reduction</option>
                    <option value={-10}>-10% Frugal Target</option>
                    <option value={-5}>-5% Savings Target</option>
                    <option value={0}>Exact (0% buffer)</option>
                    <option value={5}>+5% Safety Buffer</option>
                    <option value={10}>+10% Safety Buffer</option>
                    <option value={15}>+15% Safety Buffer</option>
                    <option value={20}>+20% Safety Buffer</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Small Category Grouping ("All Other") */}
            <div className="p-3.5 bg-muted/40 border border-border/70 rounded-xl space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Layers className="w-4 h-4 text-primary" />
                  <span className="text-xs font-semibold text-foreground uppercase tracking-wider">
                    Group Small Categories ("All Other")
                  </span>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={groupSmallCategories}
                    onChange={(e) => setGroupSmallCategories(e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-9 h-5 bg-muted-foreground/30 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-primary" />
                </label>
              </div>

              <p className="text-xs text-muted-foreground">
                Bundle small edge-case categories into a single catch-all <strong>"All Other"</strong> budget item to avoid table clutter.
              </p>

              {groupSmallCategories && (
                <div className="flex items-center gap-2 pt-1">
                  <span className="text-xs text-foreground">Group categories with average spending &le;</span>
                  <div className="relative w-28">
                    <span className="absolute left-2.5 top-1.5 text-xs text-muted-foreground">$</span>
                    <Input
                      type="number"
                      value={smallCategoryThreshold}
                      onChange={(e) => setSmallCategoryThreshold(Math.max(0, parseFloat(e.target.value) || 0))}
                      className="pl-6 text-xs h-8"
                    />
                  </div>
                  <span className="text-xs text-muted-foreground">{periodLabel}</span>
                </div>
              )}
            </div>

            {/* Advanced Filters & Rules */}
            <div className="space-y-2.5 pt-1">
              <label className="flex items-center gap-2 cursor-pointer text-xs text-foreground">
                <input
                  type="checkbox"
                  checked={excludeVirtualAccounts}
                  onChange={(e) => setExcludeVirtualAccounts(e.target.checked)}
                  className="w-4 h-4 rounded border-border bg-background text-primary cursor-pointer"
                />
                <span>Exclude transactions from virtual accounts (i.e. paystub)</span>
              </label>

              <label className="flex items-center gap-2 cursor-pointer text-xs text-foreground">
                <input
                  type="checkbox"
                  checked={excludeOutliers}
                  onChange={(e) => setExcludeOutliers(e.target.checked)}
                  className="w-4 h-4 rounded border-border bg-background text-primary cursor-pointer"
                />
                <span>Exclude rare large monthly spending spikes (outliers)</span>
              </label>

              <label className="flex items-center gap-2 cursor-pointer text-xs text-foreground">
                <input
                  type="checkbox"
                  checked={includeIncome}
                  onChange={(e) => setIncludeIncome(e.target.checked)}
                  className="w-4 h-4 rounded border-border bg-background text-primary cursor-pointer"
                />
                <span>Include Income categories in auto-budget proposal</span>
              </label>

              <label className="flex items-center gap-2 cursor-pointer text-xs text-foreground">
                <input
                  type="checkbox"
                  checked={onlyUnbudgeted}
                  onChange={(e) => setOnlyUnbudgeted(e.target.checked)}
                  className="w-4 h-4 rounded border-border bg-background text-primary cursor-pointer"
                />
                <span>Only generate proposals for categories that don't have a budget set</span>
              </label>
            </div>
          </div>
        )}

        {/* STEP 2: PROPOSAL REVIEW & EDITING */}
        {step === 2 && (
          <div className="space-y-4 py-2">
            {/* Warning Banner for Data Insufficiency */}
            {meta?.isInsufficientHistory && meta.warningMessage && (
              <div className="p-3 bg-amber-500/15 border border-amber-500/30 rounded-xl flex items-start gap-2.5 text-xs text-amber-600 dark:text-amber-400">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-amber-500" />
                <div className="space-y-1">
                  <span className="font-semibold block">Shorter History Available</span>
                  <p>{meta.warningMessage}</p>
                </div>
              </div>
            )}

            {/* Summary Cards */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <div className="p-3 bg-card border border-border rounded-xl">
                <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider block">
                  Proposed Expenses ({periodLabel.substring(1)})
                </span>
                <span className="text-base font-bold text-foreground font-mono mt-0.5 block">
                  {formatCurrency(totalProposedExpenses)}
                </span>
              </div>

              {includeIncome && (
                <div className="p-3 bg-card border border-border rounded-xl">
                  <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider block">
                    Proposed Income ({periodLabel.substring(1)})
                  </span>
                  <span className="text-base font-bold text-constructive font-mono mt-0.5 block">
                    {formatCurrency(totalProposedIncome)}
                  </span>
                </div>
              )}

              <div className="p-3 bg-card border border-border rounded-xl">
                <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider block">
                  Categories Included
                </span>
                <span className="text-base font-bold text-foreground font-mono mt-0.5 block">
                  {selectedProposalItems.length} of {proposalItems.length}
                </span>
              </div>
            </div>

            {/* Table Controls with Category Search */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-border pb-2">
              <div className="flex items-center gap-1.5 text-xs">
                <button
                  type="button"
                  onClick={() => toggleSelectAll(true)}
                  className="px-2 py-1 rounded bg-muted hover:bg-accent text-foreground font-medium transition-colors"
                >
                  Select All
                </button>
                <button
                  type="button"
                  onClick={() => toggleSelectAll(false)}
                  className="px-2 py-1 rounded bg-muted hover:bg-accent text-muted-foreground hover:text-foreground font-medium transition-colors"
                >
                  Deselect All
                </button>
              </div>

              <div className="flex items-center gap-2">
                <Input
                  type="text"
                  placeholder="Search categories..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="h-7 text-xs w-36 sm:w-44"
                />

                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setCategoryFilter('all')}
                    className={`px-2 py-1 rounded text-xs font-semibold transition-colors ${
                      categoryFilter === 'all' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    All
                  </button>
                  <button
                    type="button"
                    onClick={() => setCategoryFilter('expense')}
                    className={`px-2 py-1 rounded text-xs font-semibold transition-colors ${
                      categoryFilter === 'expense' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    Expenses
                  </button>
                  {includeIncome && (
                    <button
                      type="button"
                      onClick={() => setCategoryFilter('income')}
                      className={`px-2 py-1 rounded text-xs font-semibold transition-colors ${
                        categoryFilter === 'income' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      Income
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* Proposal Table */}
            <div className="overflow-x-auto overflow-y-auto max-h-[340px] max-w-full border border-border rounded-xl">
              <table className="w-full text-xs min-w-[480px]">
                <thead className="bg-muted border-b border-border sticky top-0 z-10 shadow-xs">
                  <tr>
                    <th className="w-8 px-3 py-2 text-center">#</th>
                    <th className="text-left px-3 py-2 font-medium text-muted-foreground">Category</th>
                    <th className="text-right px-3 py-2 font-medium text-muted-foreground">Hist. Avg</th>
                    <th className="text-right px-3 py-2 font-medium text-muted-foreground">Proposed ({periodLabel})</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border bg-card">
                  {filteredProposalItems.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="px-3 py-6 text-center text-muted-foreground text-xs">
                        No matching category proposals found.
                      </td>
                    </tr>
                  ) : (
                    filteredProposalItems.map((item) => {
                      const delta = item.existingAmount !== null ? item.proposedAmount - item.existingAmount : null;
                      return (
                        <tr key={item.categoryId} className={`hover:bg-accent/30 transition-colors ${!item.isSelected ? 'opacity-50' : ''}`}>
                          <td className="px-3 py-2.5 text-center">
                            <input
                              type="checkbox"
                              checked={item.isSelected}
                              onChange={() => toggleSelectItem(item.categoryId)}
                              className="w-3.5 h-3.5 rounded border-border bg-background text-primary cursor-pointer"
                            />
                          </td>
                          <td className="px-3 py-2.5">
                            <div className="space-y-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: item.categoryColor }} />
                                <span className="font-medium text-foreground">{item.categoryName}</span>
                                {item.isIncome ? (
                                  <span className="px-1.5 py-0.2 text-[9px] font-semibold bg-constructive/15 text-constructive rounded">
                                    Income
                                  </span>
                                ) : (
                                  <button
                                    type="button"
                                    onClick={() => toggleDiscretionary(item.categoryId)}
                                    title="Click to toggle Essential / Discretionary"
                                    className={`px-1.5 py-0.2 text-[9px] font-semibold rounded transition-colors ${
                                      item.isDiscretionary
                                        ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400 hover:bg-amber-500/25'
                                        : 'bg-primary/15 text-primary hover:bg-primary/25'
                                    }`}
                                  >
                                    {item.isDiscretionary ? 'Discretionary' : 'Essential'}
                                  </button>
                                )}

                                {item.sampleTransactions && item.sampleTransactions.length > 0 && (
                                  <button
                                    type="button"
                                    onClick={() => setInspectItem(item)}
                                    title="View transactions used in calculation"
                                    className="inline-flex items-center gap-1 text-[10px] text-muted-foreground hover:text-primary hover:bg-accent px-1.5 py-0.5 rounded transition-colors"
                                  >
                                    <Eye className="w-3 h-3" />
                                    <span>{item.sampleTransactions.length} txns</span>
                                  </button>
                                )}
                              </div>

                              {/* "All Other" Grouped Drawer */}
                              {item.isSmallCategory && item.groupedCategories && item.groupedCategories.length > 0 && (
                                <div className="mt-1 pl-4.5 space-y-1">
                                  <button
                                    type="button"
                                    onClick={() => setExpandedGroup(!expandedGroup)}
                                    className="inline-flex items-center gap-1 text-[11px] font-medium text-primary hover:underline"
                                  >
                                    {expandedGroup ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                                    <span>Includes {item.groupedCategories.length} small categories</span>
                                  </button>

                                  {expandedGroup && (
                                    <div className="p-2 bg-muted/50 border border-border/60 rounded-lg space-y-1 mt-1 text-[11px]">
                                      {item.groupedCategories.map((gc) => (
                                        <div key={gc.categoryId} className="flex items-center justify-between gap-2">
                                          <span className="text-foreground truncate">{gc.categoryName}</span>
                                          <div className="flex items-center gap-2 font-mono">
                                            <span className="text-muted-foreground">{formatCurrency(gc.proposedAmount)}{periodLabel}</span>
                                            <button
                                              type="button"
                                              onClick={() => ungroupCategory(gc.categoryId)}
                                              className="text-[10px] text-primary hover:underline px-1 rounded hover:bg-accent"
                                            >
                                              Un-group
                                            </button>
                                          </div>
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          </td>
                          <td className="px-3 py-2.5 text-right font-mono text-muted-foreground">
                            {formatCurrency(item.historicalAverage)}
                          </td>
                          <td className="px-3 py-2.5 text-right">
                            <div className="flex flex-col items-end gap-0.5">
                              <div className="flex items-center justify-end gap-1">
                                <span className="text-muted-foreground font-mono">$</span>
                                <Input
                                  type="number"
                                  step="1"
                                  value={item.proposedAmount}
                                  onChange={(e) => updateProposedAmount(item.categoryId, parseFloat(e.target.value) || 0)}
                                  className="w-24 text-right font-mono h-7 text-xs"
                                  disabled={!item.isSelected}
                                />
                              </div>
                              {item.existingAmount !== null && delta !== null && delta !== 0 && (
                                <div className="flex items-center gap-1 text-[10px] font-mono">
                                  <span className="text-muted-foreground">Was: {formatCurrency(item.existingAmount)}</span>
                                  <span className={`px-1 py-0.2 rounded font-semibold ${delta > 0 ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400' : 'bg-constructive/15 text-constructive'}`}>
                                    {delta > 0 ? `+${formatCurrency(delta)}` : formatCurrency(delta)}
                                  </span>
                                </div>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            <label className="flex items-center gap-2 cursor-pointer text-xs text-muted-foreground pt-1">
              <input
                type="checkbox"
                checked={overwriteExisting}
                onChange={(e) => setOverwriteExisting(e.target.checked)}
                className="w-3.5 h-3.5 rounded border-border bg-background text-primary cursor-pointer"
              />
              <span>Overwrite existing budgets for selected categories</span>
            </label>
          </div>
        )}

        <DialogFooter>
          {step === 1 ? (
            <>
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-xs font-medium text-foreground bg-muted hover:bg-accent rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleGenerateProposal}
                disabled={generating}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-primary-foreground bg-primary rounded-lg hover:opacity-90 disabled:opacity-50 transition-all shadow-xs"
              >
                {generating ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Analyzing Transactions...</span>
                  </>
                ) : (
                  <>
                    <Wand2 className="w-3.5 h-3.5" />
                    <span>Generate Proposal</span>
                  </>
                )}
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={() => setStep(1)}
                className="px-4 py-2 text-xs font-medium text-foreground bg-muted hover:bg-accent rounded-lg transition-colors"
              >
                Back to Settings
              </button>
              <button
                type="button"
                onClick={handlePublish}
                disabled={publishing || selectedProposalItems.length === 0}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-primary-foreground bg-primary rounded-lg hover:opacity-90 disabled:opacity-50 transition-all shadow-xs"
              >
                {publishing ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Publishing Budgets...</span>
                  </>
                ) : (
                  <>
                    <Check className="w-3.5 h-3.5" />
                    <span>Publish {selectedProposalItems.length} Budgets</span>
                  </>
                )}
              </button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>

    {/* Transaction Inspection Dialog */}
    <Dialog open={!!inspectItem} onOpenChange={(o) => { if (!o) setInspectItem(null); }}>
      <DialogContent className="max-w-lg max-h-[80vh]">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: inspectItem?.categoryColor }} />
            <DialogTitle className="text-base font-semibold">
              {inspectItem?.categoryName} &mdash; Transactions Analyzed
            </DialogTitle>
          </div>
          <DialogDescription className="text-xs">
            Showing transactions analyzed during historical lookback to calculate proposed budget.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-2">
          <div className="grid grid-cols-3 gap-2 text-xs">
            <div className="p-2 bg-muted/40 rounded-lg">
              <span className="text-[10px] text-muted-foreground block uppercase font-medium">Hist. Avg</span>
              <span className="font-mono font-bold text-foreground">{formatCurrency(inspectItem?.historicalAverage)}</span>
            </div>
            <div className="p-2 bg-muted/40 rounded-lg">
              <span className="text-[10px] text-muted-foreground block uppercase font-medium">Hist. Median</span>
              <span className="font-mono font-bold text-foreground">{formatCurrency(inspectItem?.historicalMedian)}</span>
            </div>
            <div className="p-2 bg-muted/40 rounded-lg">
              <span className="text-[10px] text-muted-foreground block uppercase font-medium">Hist. Max</span>
              <span className="font-mono font-bold text-foreground">{formatCurrency(inspectItem?.historicalMax)}</span>
            </div>
          </div>

          <div className="overflow-x-auto overflow-y-auto max-h-[280px] max-w-full border border-border rounded-lg">
            <table className="w-full text-xs min-w-[340px]">
              <thead className="bg-muted sticky top-0 border-b border-border text-muted-foreground font-medium">
                <tr>
                  <th className="text-left px-3 py-2">Date</th>
                  <th className="text-left px-3 py-2">Description / Payee</th>
                  <th className="text-right px-3 py-2">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {inspectItem?.sampleTransactions && inspectItem.sampleTransactions.length > 0 ? (
                  inspectItem.sampleTransactions.map((tx) => (
                    <tr key={tx.id} className="hover:bg-accent/30">
                      <td className="px-3 py-2 font-mono text-muted-foreground whitespace-nowrap">{tx.date}</td>
                      <td className="px-3 py-2 text-foreground font-medium truncate max-w-[200px]" title={tx.description}>
                        {tx.description}
                      </td>
                      <td className="px-3 py-2 text-right font-mono font-medium text-foreground whitespace-nowrap">
                        {formatCurrency(tx.amount)}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={3} className="px-3 py-4 text-center text-muted-foreground text-xs">
                      No sample transactions available for this category.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <DialogFooter>
          <button
            type="button"
            onClick={() => setInspectItem(null)}
            className="px-3 py-1.5 text-xs font-medium text-foreground bg-muted hover:bg-accent rounded-lg transition-colors"
          >
            Close
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    </>
  );
}
