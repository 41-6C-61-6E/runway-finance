'use client';

import { Suspense, useState, useEffect, useCallback } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { Sparkles } from 'lucide-react';
import TransactionTable from '@/components/features/transactions/TransactionTable';
import FilterBar from '@/components/features/transactions/FilterBar';
import BulkActionsToolbar from '@/components/features/transactions/BulkActionsToolbar';
import TransactionDetailDrawer from '@/components/features/transactions/TransactionDetailDrawer';
import ContentWrapper from '@/components/content-wrapper';

type FilterState = {
  accountId: string | null;
  accountIds: string | null;
  accountTypes: string | null;
  categoryId: string | null;
  categoryIds: string | null;
  search: string | null;
  startDate: string | null;
  endDate: string | null;
  pending: string | null;
  reviewed: string | null;
  minAmount: string | null;
  maxAmount: string | null;
  sort: string;
  order: string;
};

function TransactionsContent() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const [filters, setFilters] = useState<FilterState>({
    accountId: searchParams.get('accountId') ?? null,
    accountIds: searchParams.get('accountIds') ?? null,
    accountTypes: searchParams.get('accountTypes') ?? null,
    categoryId: searchParams.get('categoryId') ?? null,
    categoryIds: searchParams.get('categoryIds') ?? null,
    search: searchParams.get('search') ?? null,
    startDate: searchParams.get('startDate') ?? null,
    endDate: searchParams.get('endDate') ?? null,
    pending: searchParams.get('pending') ?? null,
    reviewed: searchParams.get('reviewed') ?? null,
    minAmount: searchParams.get('minAmount') ?? null,
    maxAmount: searchParams.get('maxAmount') ?? null,
    sort: searchParams.get('sort') ?? 'date',
    order: searchParams.get('order') ?? 'desc',
  });

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [selectedTransaction, setSelectedTransaction] = useState<any>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [pendingAiCount, setPendingAiCount] = useState<number>(0);

  useEffect(() => {
    fetch('/api/ai/proposals?status=pending', { credentials: 'include' })
      .then(r => r.json())
      .then(data => setPendingAiCount(Array.isArray(data) ? data.length : 0))
      .catch(() => {})
  }, []);

  useEffect(() => {
    const params = new URLSearchParams();
    if (filters.accountId) params.set('accountId', filters.accountId);
    if (filters.accountIds) params.set('accountIds', filters.accountIds);
    if (filters.accountTypes) params.set('accountTypes', filters.accountTypes);
    if (filters.categoryId) params.set('categoryId', filters.categoryId);
    if (filters.categoryIds) params.set('categoryIds', filters.categoryIds);
    if (filters.search) params.set('search', filters.search);
    if (filters.startDate) params.set('startDate', filters.startDate);
    if (filters.endDate) params.set('endDate', filters.endDate);
    if (filters.pending) params.set('pending', filters.pending);
    if (filters.reviewed) params.set('reviewed', filters.reviewed);
    if (filters.minAmount) params.set('minAmount', filters.minAmount);
    if (filters.maxAmount) params.set('maxAmount', filters.maxAmount);
    if (filters.sort !== 'date') params.set('sort', filters.sort);
    if (filters.order !== 'desc') params.set('order', filters.order);

    const newUrl = `?${params.toString()}`;
    const currentUrl = `?${searchParams.toString()}`;
    if (newUrl !== currentUrl) {
      router.replace(newUrl, { scroll: false });
    }
  }, [filters, router, searchParams]);

  const spAccountId = searchParams.get('accountId');
  const spAccountIds = searchParams.get('accountIds');
  const spAccountTypes = searchParams.get('accountTypes');
  const spCategoryId = searchParams.get('categoryId');
  const spCategoryIds = searchParams.get('categoryIds');
  const spSearch = searchParams.get('search');
  const spStartDate = searchParams.get('startDate');
  const spEndDate = searchParams.get('endDate');
  const spPending = searchParams.get('pending');
  const spReviewed = searchParams.get('reviewed');
  const spMinAmount = searchParams.get('minAmount');
  const spMaxAmount = searchParams.get('maxAmount');
  const spSort = searchParams.get('sort');
  const spOrder = searchParams.get('order');

  useEffect(() => {
    setFilters((prev) => {
      const accountId = spAccountId ?? null;
      const accountIds = spAccountIds ?? null;
      const accountTypes = spAccountTypes ?? null;
      const categoryId = spCategoryId ?? null;
      const categoryIds = spCategoryIds ?? null;
      const search = spSearch ?? null;
      const startDate = spStartDate ?? null;
      const endDate = spEndDate ?? null;
      const pending = spPending ?? null;
      const reviewed = spReviewed ?? null;
      const minAmount = spMinAmount ?? null;
      const maxAmount = spMaxAmount ?? null;
      const sort = spSort ?? 'date';
      const order = spOrder ?? 'desc';
      if (
        prev.accountId === accountId &&
        prev.accountIds === accountIds &&
        prev.accountTypes === accountTypes &&
        prev.categoryId === categoryId &&
        prev.categoryIds === categoryIds &&
        prev.search === search &&
        prev.startDate === startDate &&
        prev.endDate === endDate &&
        prev.pending === pending &&
        prev.reviewed === reviewed &&
        prev.minAmount === minAmount &&
        prev.maxAmount === maxAmount &&
        prev.sort === sort &&
        prev.order === order
      ) {
        return prev;
      }
      return { ...prev, accountId, accountIds, accountTypes, categoryId, categoryIds, search, startDate, endDate, pending, reviewed, minAmount, maxAmount, sort, order };
    });
  }, [spAccountId, spAccountIds, spAccountTypes, spCategoryId, spCategoryIds, spSearch, spStartDate, spEndDate, spPending, spReviewed, spMinAmount, spMaxAmount, spSort, spOrder]);

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
      search: null,
      startDate: null,
      endDate: null,
      pending: null,
      reviewed: null,
      minAmount: null,
      maxAmount: null,
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

  const handleBulkActionComplete = useCallback(() => {
    setSelectedIds(new Set());
  }, []);

  const handleTransactionClick = useCallback((tx: any) => {
    setSelectedTransaction(tx);
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
    <div className="min-h-screen w-full">
      <div className="relative z-10">
        <ContentWrapper>
          <div className="px-0 sm:px-1 lg:px-3 max-w-[1920px]">
            <div className="flex items-center gap-3 mb-4">
              <h1 className="text-xl font-semibold text-foreground">Transactions</h1>
              {pendingAiCount > 0 && (
                <Link
                  href="/ai-suggestions"
                  className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-primary bg-primary/10 hover:bg-primary/20 border border-primary/20 rounded-lg transition-colors"
                >
                  <Sparkles className="h-3 w-3" />
                  {pendingAiCount} suggestion{pendingAiCount !== 1 ? 's' : ''}
                </Link>
              )}
            </div>

            <FilterBar filters={filters} onChange={updateFilter} onClearAll={clearAllFilters} />

            <div className="min-w-0">
              {selectedIds.size > 0 && (
                <BulkActionsToolbar
                  count={selectedIds.size}
                  onSelectAll={handleSelectAll}
                  onClear={handleBulkActionComplete}
                />
              )}
              <TransactionTable
                key={refreshKey}
                filters={filters}
                onSelectAll={handleSelectAll}
                onTransactionClick={handleTransactionClick}
              />
              {selectedTransaction && (
                <TransactionDetailDrawer
                  transaction={selectedTransaction}
                  open={drawerOpen}
                  onClose={handleDrawerClose}
                  onSuccess={handleDrawerSuccess}
                />
              )}
            </div>
          </div>
        </ContentWrapper>
      </div>
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
