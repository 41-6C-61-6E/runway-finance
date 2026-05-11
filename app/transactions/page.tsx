'use client';

import { Suspense, useState, useEffect, useCallback } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import TransactionTable from '@/components/features/transactions/TransactionTable';
import FilterBar from '@/components/features/transactions/FilterBar';
import BulkActionsToolbar from '@/components/features/transactions/BulkActionsToolbar';
import TransactionDetailDrawer from '@/components/features/transactions/TransactionDetailDrawer';
import ContentWrapper from '@/components/content-wrapper';

type FilterState = {
  accountId: string | null;
  categoryId: string | null;
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
    categoryId: searchParams.get('categoryId') ?? null,
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

  useEffect(() => {
    const params = new URLSearchParams();
    if (filters.accountId) params.set('accountId', filters.accountId);
    if (filters.categoryId) params.set('categoryId', filters.categoryId);
    if (filters.search) params.set('search', filters.search);
    if (filters.startDate) params.set('startDate', filters.startDate);
    if (filters.endDate) params.set('endDate', filters.endDate);
    if (filters.pending) params.set('pending', filters.pending);
    if (filters.reviewed) params.set('reviewed', filters.reviewed);
    if (filters.minAmount) params.set('minAmount', filters.minAmount);
    if (filters.maxAmount) params.set('maxAmount', filters.maxAmount);
    if (filters.sort !== 'date') params.set('sort', filters.sort);
    if (filters.order !== 'desc') params.set('order', filters.order);
    router.push(`?${params.toString()}`, { scroll: false });
  }, [filters, router]);

  const updateFilter = useCallback((key: keyof FilterState, value: string | null) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
  }, []);

  const clearAllFilters = useCallback(() => {
    setFilters({
      accountId: null,
      categoryId: null,
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
            <h1 className="text-xl font-semibold text-foreground mb-4">Transactions</h1>

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
