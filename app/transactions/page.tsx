'use client';

import { Suspense, useState, useEffect, useCallback, useRef } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { Sparkles, Receipt, LayoutList, Columns2, X } from 'lucide-react';
import TransactionTable from '@/components/features/transactions/TransactionTable';
import FilterBar from '@/components/features/transactions/FilterBar';
import BulkActionsToolbar from '@/components/features/transactions/BulkActionsToolbar';
import TransactionDetailDrawer from '@/components/features/transactions/TransactionDetailDrawer';
import AiSuggestionsModal from '@/components/features/ai/AiSuggestionsModal';
import PageContent from '@/components/page-content';
import { PageHeader } from '@/components/page-header';
import { usePersistentState } from '@/lib/hooks/use-persistent-state';

export type FilterState = {
  accountId: string | null;
  accountIds: string | null;
  accountTypes: string | null;
  categoryId: string | null;
  categoryIds: string | null;
  excludeCategoryIds: string | null;
  tagId: string | null;
  tagIds: string | null;
  accountTagIds: string | null;
  search: string | null;
  type: string | null;
  startDate: string | null;
  endDate: string | null;
  pending: string | null;
  reviewed: string | null;
  minAmount: string | null;
  maxAmount: string | null;
  categorizedByAi: string | null;
  sort: string;
  order: string;
};

export interface TransactionPreset {
  id: string;
  name: string;
  filters: Partial<FilterState>;
  isCustom?: boolean;
}

function TransactionsContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const searchParamsRef = useRef(searchParams);
  searchParamsRef.current = searchParams;

  const [filters, setFilters] = useState<FilterState>({
    accountId: searchParams.get('accountId') ?? null,
    accountIds: searchParams.get('accountIds') ?? null,
    accountTypes: searchParams.get('accountTypes') ?? null,
    categoryId: searchParams.get('categoryId') ?? null,
    categoryIds: searchParams.get('categoryIds') ?? null,
    excludeCategoryIds: searchParams.get('excludeCategoryIds') ?? null,
    tagId: searchParams.get('tagId') ?? null,
    tagIds: searchParams.get('tagIds') ?? null,
    accountTagIds: searchParams.get('accountTagIds') ?? null,
    search: searchParams.get('search') ?? null,
    type: searchParams.get('type') ?? null,
    startDate: searchParams.get('startDate') ?? null,
    endDate: searchParams.get('endDate') ?? null,
    pending: searchParams.get('pending') ?? null,
    reviewed: searchParams.get('reviewed') ?? null,
    minAmount: searchParams.get('minAmount') ?? null,
    maxAmount: searchParams.get('maxAmount') ?? null,
    categorizedByAi: searchParams.get('categorizedByAi') ?? null,
    sort: searchParams.get('sort') ?? 'date',
    order: searchParams.get('order') ?? 'desc',
  });

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [selectAllMatching, setSelectAllMatching] = useState(false);
  const [totalCount, setTotalCount] = useState(0);
  const [selectedTransaction, setSelectedTransaction] = useState<any>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerMode, setDrawerMode] = useState<'create' | 'edit'>('edit');
  const [refreshKey, setRefreshKey] = useState(0);
  const [aiModalOpen, setAiModalOpen] = useState(searchParams.get('aiSuggestions') === 'true');
  const [pendingAiCount, setPendingAiCount] = useState<number>(0);
  const [pendingAiIds, setPendingAiIds] = useState<string[]>([]);
  const [aiSuggestionsDismissed, setAiSuggestionsDismissed] = useState(false);
  const [dismissedSuggestionIds, setDismissedSuggestionIds] = usePersistentState<string[]>('finance:transactions:dismissedSuggestionIds', []);
  const [customPresets, setCustomPresets] = usePersistentState<TransactionPreset[]>('finance:transactions:customPresets', []);
  const [compactView, setCompactView] = usePersistentState<boolean>('finance:transactions:compactView', false);

  const fetchPendingAi = useCallback(() => {
    fetch('/api/ai/proposals?status=pending', { credentials: 'include' })
      .then(r => r.json())
      .then(data => {
        if (Array.isArray(data)) {
          setPendingAiCount(data.length);
          setPendingAiIds(data.map((p: any) => p.id));
        } else {
          setPendingAiCount(0);
          setPendingAiIds([]);
        }
      })
      .catch(() => {});
  }, []);

  const handleProposalsUpdated = useCallback(() => {
    setRefreshKey((k) => k + 1);
    fetchPendingAi();
  }, [fetchPendingAi]);

  const handleApplyPreset = useCallback((preset: TransactionPreset) => {
    setFilters({
      accountId: preset.filters.accountId ?? null,
      accountIds: preset.filters.accountIds ?? null,
      accountTypes: preset.filters.accountTypes ?? null,
      categoryId: preset.filters.categoryId ?? null,
      categoryIds: preset.filters.categoryIds ?? null,
      excludeCategoryIds: preset.filters.excludeCategoryIds ?? null,
      tagId: preset.filters.tagId ?? null,
      tagIds: preset.filters.tagIds ?? null,
      accountTagIds: preset.filters.accountTagIds ?? null,
      search: preset.filters.search ?? null,
      type: preset.filters.type ?? null,
      startDate: preset.filters.startDate ?? null,
      endDate: preset.filters.endDate ?? null,
      pending: preset.filters.pending ?? null,
      reviewed: preset.filters.reviewed ?? null,
      minAmount: preset.filters.minAmount ?? null,
      maxAmount: preset.filters.maxAmount ?? null,
      categorizedByAi: preset.filters.categorizedByAi ?? null,
      sort: preset.filters.sort ?? 'date',
      order: preset.filters.order ?? 'desc',
    });
  }, []);

  const handleSavePreset = useCallback((name: string) => {
    const filtersToSave = { ...filters };
    delete filtersToSave.sort;
    delete filtersToSave.order;
    
    // Clean up null/empty values
    Object.keys(filtersToSave).forEach(k => {
      const key = k as keyof FilterState;
      if (filtersToSave[key] === null || filtersToSave[key] === '') {
        delete filtersToSave[key];
      }
    });

    const newPreset: TransactionPreset = {
      id: Math.random().toString(36).substring(2, 9),
      name,
      filters: filtersToSave,
      isCustom: true,
    };
    setCustomPresets((prev) => [...(prev || []), newPreset]);
  }, [filters, setCustomPresets]);

  const handleDeletePreset = useCallback((id: string) => {
    setCustomPresets((prev) => (prev || []).filter((p) => p.id !== id));
  }, [setCustomPresets]);

  const handleAiSuggestionsDismiss = useCallback((dismissed: boolean) => {
    if (dismissed) {
      setAiSuggestionsDismissed(true);
      setDismissedSuggestionIds((prev) => Array.from(new Set([...(prev || []), ...pendingAiIds])));
    }
  }, [pendingAiIds, setDismissedSuggestionIds]);

  const hasNewSuggestions = pendingAiIds.length > 0 && pendingAiIds.some(id => !dismissedSuggestionIds.includes(id));
  const isSuggestionsDismissed = aiSuggestionsDismissed || !hasNewSuggestions;

  useEffect(() => {
    fetchPendingAi();
  }, [fetchPendingAi]);

  useEffect(() => {
    const params = new URLSearchParams();
    if (filters.accountId) params.set('accountId', filters.accountId);
    if (filters.accountIds) params.set('accountIds', filters.accountIds);
    if (filters.accountTypes) params.set('accountTypes', filters.accountTypes);
    if (filters.categoryId) params.set('categoryId', filters.categoryId);
    if (filters.categoryIds) params.set('categoryIds', filters.categoryIds);
    if (filters.excludeCategoryIds) params.set('excludeCategoryIds', filters.excludeCategoryIds);
    if (filters.tagId) params.set('tagId', filters.tagId);
    if (filters.tagIds) params.set('tagIds', filters.tagIds);
    if (filters.accountTagIds) params.set('accountTagIds', filters.accountTagIds);
    if (filters.search) params.set('search', filters.search);
    if (filters.type) params.set('type', filters.type);
    if (filters.startDate) params.set('startDate', filters.startDate);
    if (filters.endDate) params.set('endDate', filters.endDate);
    if (filters.pending) params.set('pending', filters.pending);
    if (filters.reviewed) params.set('reviewed', filters.reviewed);
    if (filters.minAmount) params.set('minAmount', filters.minAmount);
    if (filters.maxAmount) params.set('maxAmount', filters.maxAmount);
    if (filters.categorizedByAi) params.set('categorizedByAi', filters.categorizedByAi);
    if (filters.sort !== 'date') params.set('sort', filters.sort);
    if (filters.order !== 'desc') params.set('order', filters.order);

    const newUrl = `?${params.toString()}`;
    const currentUrl = `?${searchParamsRef.current.toString()}`;
    if (newUrl !== currentUrl) {
      router.replace(newUrl, { scroll: false });
    }
  }, [filters, router]);

  useEffect(() => {
    setSelectAllMatching(false);
    setSelectedIds(new Set());
  }, [filters]);

  // Fetch categories hidden from transactions and auto-apply exclude filter
  useEffect(() => {
    // Only auto-apply if no explicit category filter is set
    if (filters.categoryId || filters.categoryIds) return;

    fetch('/api/categories', { credentials: 'include' })
      .then((r) => r.json())
      .then((cats: any[]) => {
        const hiddenIds = cats
          .filter((c) => c.hideFromTransactions)
          .map((c) => c.id);
        if (hiddenIds.length > 0) {
          const hiddenStr = hiddenIds.join(',');
          setFilters((prev) => {
            if (prev.excludeCategoryIds === hiddenStr) return prev;
            return { ...prev, excludeCategoryIds: hiddenStr };
          });
        }
      })
      .catch(() => {});
  }, []); // only on mount

  const spAccountId = searchParams.get('accountId');
  const spAccountIds = searchParams.get('accountIds');
  const spAccountTypes = searchParams.get('accountTypes');
  const spCategoryId = searchParams.get('categoryId');
  const spCategoryIds = searchParams.get('categoryIds');
  const spExcludeCategoryIds = searchParams.get('excludeCategoryIds');
  const spTagId = searchParams.get('tagId');
  const spTagIds = searchParams.get('tagIds');
  const spAccountTagIds = searchParams.get('accountTagIds');
  const spSearch = searchParams.get('search');
  const spType = searchParams.get('type');
  const spStartDate = searchParams.get('startDate');
  const spEndDate = searchParams.get('endDate');
  const spPending = searchParams.get('pending');
  const spReviewed = searchParams.get('reviewed');
  const spMinAmount = searchParams.get('minAmount');
  const spMaxAmount = searchParams.get('maxAmount');
  const spCategorizedByAi = searchParams.get('categorizedByAi');
  const spSort = searchParams.get('sort');
  const spOrder = searchParams.get('order');

  useEffect(() => {
    setFilters((prev) => {
      const accountId = spAccountId ?? null;
      const accountIds = spAccountIds ?? null;
      const accountTypes = spAccountTypes ?? null;
      const categoryId = spCategoryId ?? null;
      const categoryIds = spCategoryIds ?? null;
      const excludeCategoryIds = spExcludeCategoryIds ?? null;
      const tagId = spTagId ?? null;
      const tagIds = spTagIds ?? null;
      const accountTagIds = spAccountTagIds ?? null;
      const search = spSearch ?? null;
      const type = spType ?? null;
      const startDate = spStartDate ?? null;
      const endDate = spEndDate ?? null;
      const pending = spPending ?? null;
      const reviewed = spReviewed ?? null;
      const minAmount = spMinAmount ?? null;
      const maxAmount = spMaxAmount ?? null;
      const categorizedByAi = spCategorizedByAi ?? null;
      const sort = spSort ?? 'date';
      const order = spOrder ?? 'desc';
      if (
        prev.accountId === accountId &&
        prev.accountIds === accountIds &&
        prev.accountTypes === accountTypes &&
        prev.categoryId === categoryId &&
        prev.categoryIds === categoryIds &&
        prev.excludeCategoryIds === excludeCategoryIds &&
        prev.tagId === tagId &&
        prev.tagIds === tagIds &&
        prev.accountTagIds === accountTagIds &&
        prev.search === search &&
        prev.type === type &&
        prev.startDate === startDate &&
        prev.endDate === endDate &&
        prev.pending === pending &&
        prev.reviewed === reviewed &&
        prev.minAmount === minAmount &&
        prev.maxAmount === maxAmount &&
        prev.categorizedByAi === categorizedByAi &&
        prev.sort === sort &&
        prev.order === order
      ) {
        return prev;
      }
      return { ...prev, accountId, accountIds, accountTypes, categoryId, categoryIds, excludeCategoryIds, tagId, tagIds, accountTagIds, search, type, startDate, endDate, pending, reviewed, minAmount, maxAmount, categorizedByAi, sort, order };
    });
    }, [spAccountId, spAccountIds, spAccountTypes, spCategoryId, spCategoryIds, spExcludeCategoryIds, spTagId, spTagIds, spAccountTagIds, spSearch, spType, spStartDate, spEndDate, spPending, spReviewed, spMinAmount, spMaxAmount, spCategorizedByAi, spSort, spOrder]);

  const updateFilter = useCallback((key: keyof FilterState, value: string | null) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
  }, []);

  const clearAllFilters = useCallback(() => {
    setFilters({
      accountId: null,
      accountIds: null,
      accountTypes: null,
      categoryId: null,
      categoryIds: null,
      excludeCategoryIds: null,
      tagId: null,
      tagIds: null,
      accountTagIds: null,
      search: null,
      type: null,
      startDate: null,
      endDate: null,
      pending: null,
      reviewed: null,
      minAmount: null,
      maxAmount: null,
      categorizedByAi: null,
      sort: 'date',
      order: 'desc',
    });
  }, []);

  const handleSelectAll = useCallback((ids: string[]) => {
    if (ids.length > 0) {
      setSelectedIds(new Set(ids));
    } else {
      setSelectedIds(new Set());
    }
  }, []);

  const handleSelectAllMatching = useCallback(() => {
    setSelectAllMatching(true);
  }, []);

  const handleTotalChange = useCallback((total: number) => {
    setTotalCount(total);
  }, []);

  const handleBulkActionComplete = useCallback(() => {
    setSelectedIds(new Set());
    setSelectAllMatching(false);
    setRefreshKey((k) => k + 1);
  }, []);

  const handleTransactionClick = useCallback((tx: any) => {
    setSelectedTransaction(tx);
    setDrawerMode('edit');
    setDrawerOpen(true);
  }, []);

  const handleAddTransaction = useCallback(() => {
    setSelectedTransaction(null);
    setDrawerMode('create');
    setDrawerOpen(true);
  }, []);

  const handleDrawerClose = useCallback(() => {
    setDrawerOpen(false);
    setSelectedTransaction(null);
  }, []);

  const handleDrawerSuccess = useCallback(() => {
    setRefreshKey((k) => k + 1);
  }, []);

  return (
    <div className="min-h-screen w-full overflow-visible">
      <PageHeader
        title="Transactions"
        icon={Receipt}
      />
      <PageContent maxWidth="max-w-[1920px]">
        <FilterBar 
          filters={filters} 
          onChange={updateFilter} 
          onClearAll={clearAllFilters}
          customPresets={customPresets}
          onApplyPreset={handleApplyPreset}
          onSavePreset={handleSavePreset}
          onDeletePreset={handleDeletePreset}
          compactView={compactView}
          onCompactViewChange={setCompactView}
          pendingAiCount={pendingAiCount}
          aiSuggestionsDismissed={isSuggestionsDismissed}
          onAiSuggestionsDismissed={handleAiSuggestionsDismiss}
          onOpenAiSuggestions={() => setAiModalOpen(true)}
        />

        <div className="min-w-0">
          {(selectedIds.size > 0 || selectAllMatching) && (
            <BulkActionsToolbar
              selectedIds={Array.from(selectedIds)}
              onClear={handleBulkActionComplete}
              totalCount={totalCount}
              selectAllMatching={selectAllMatching}
              onSelectAllMatching={handleSelectAllMatching}
              filters={filters}
            />
          )}
          <TransactionTable
            key={refreshKey}
            filters={filters}
            onSelectAll={handleSelectAll}
            onTransactionClick={handleTransactionClick}
            onTotalChange={handleTotalChange}
            onAddTransaction={handleAddTransaction}
            compactView={compactView}
            onCompactViewChange={setCompactView}
          />
          {(selectedTransaction || drawerMode === 'create') && (
            <TransactionDetailDrawer
              transaction={selectedTransaction || undefined}
              open={drawerOpen}
              onClose={handleDrawerClose}
              onSuccess={handleDrawerSuccess}
              mode={drawerMode}
            />
          )}
          <AiSuggestionsModal
            open={aiModalOpen}
            onOpenChange={setAiModalOpen}
            onProposalsUpdated={handleProposalsUpdated}
          />
        </div>
      </PageContent>
    </div>
  );
}

export default function TransactionsPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center text-muted-foreground">Loading...</div>}>
      <TransactionsContent />
    </Suspense>
  );
}
