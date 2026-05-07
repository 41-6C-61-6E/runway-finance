'use client';

import { Suspense, useState, useEffect, useCallback } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import TransactionTable from '@/components/features/transactions/TransactionTable';
import FilterSidebar from '@/components/features/transactions/FilterSidebar';
import BulkActionsToolbar from '@/components/features/transactions/BulkActionsToolbar';
import ResizableSidebar from '@/components/resizable-sidebar';
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

  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Update URL when filters change
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

  return (
    <div className="min-h-screen w-full relative overflow-hidden">
      {/* Background */}
      <div
        className="absolute inset-0 z-0 opacity-40 dark:opacity-20"
        style={{
          backgroundImage: `
            radial-gradient(ellipse at 20% 30%, rgba(59, 130, 246, 0.5) 0%, transparent 60%),
            radial-gradient(ellipse at 80% 70%, rgba(168, 85, 247, 0.4) 0%, transparent 70%),
            radial-gradient(ellipse at 60% 20%, rgba(236, 72, 153, 0.3) 0%, transparent 50%),
            radial-gradient(ellipse at 40% 80%, rgba(34, 197, 94, 0.3) 0%, transparent 65%)
          `,
        }}
      />

      {/* Navigation Sidebar */}
      <ResizableSidebar />

      <ContentWrapper>
        <div className="relative z-10 mt-20 px-6 lg:px-12 max-w-7xl">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-4xl font-bold">
            <span className="bg-linear-to-r from-blue-600 via-purple-600 to-pink-600 dark:from-blue-400 dark:via-purple-400 dark:to-pink-400 bg-clip-text text-transparent">
              Transactions
            </span>
          </h1>
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="px-3 py-1.5 text-sm text-gray-400 hover:text-white bg-white/5 hover:bg-white/10 rounded-lg border border-white/10 transition-colors"
          >
            {sidebarOpen ? 'Hide Filters' : 'Show Filters'}
          </button>
        </div>

        <div className="flex gap-6">
          {/* Filter Sidebar */}
          {sidebarOpen && (
            <div className="w-64 flex-shrink-0">
              <FilterSidebar filters={filters} onChange={updateFilter} onClearAll={clearAllFilters} />
            </div>
          )}

          {/* Main Content */}
          <div className="flex-1 min-w-0">
            {selectedIds.size > 0 && (
              <BulkActionsToolbar
                count={selectedIds.size}
                onSelectAll={handleSelectAll}
                onClear={handleBulkActionComplete}
              />
            )}
            <TransactionTable
              filters={filters}
              onSelectAll={handleSelectAll}
            />
          </div>
        </div>
      </div>
      </ContentWrapper>
    </div>
  );
}

export default function TransactionsPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center">Loading...</div>}>
      <TransactionsContent />
    </Suspense>
  );
}
