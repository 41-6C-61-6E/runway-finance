'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import TableSelector from './TableSelector';
import DataToolbar from './DataToolbar';
import DataTable from './DataTable';
import ContentWrapper from '@/components/content-wrapper';

type ColumnMeta = {
  field: string;
  label: string;
  type: 'string' | 'number' | 'boolean' | 'date' | 'json';
  nullable: boolean;
};

type TableMeta = {
  key: string;
  label: string;
  group: string;
};

type FilterRule = {
  field: string;
  op: string;
  value: string;
};

interface ApiResponse {
  data: Record<string, unknown>[];
  total: number;
  limit: number;
  offset: number;
  columns: ColumnMeta[];
  table: { key: string; label: string; group: string };
}

export default function DataExplorerPage() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const [tables, setTables] = useState<TableMeta[]>([]);
  const [tablesLoading, setTablesLoading] = useState(true);

  const [table, setTable] = useState(searchParams.get('table') ?? 'account_snapshots');
  const [search, setSearch] = useState(searchParams.get('search') ?? '');
  const [sort, setSort] = useState(searchParams.get('sort') ?? '');
  const [order, setOrder] = useState(searchParams.get('order') ?? 'desc');
  const [offset, setOffset] = useState(Number(searchParams.get('offset') ?? '0'));
  const [limit, setLimit] = useState(Number(searchParams.get('limit') ?? '50'));
  const [filters, setFilters] = useState<FilterRule[]>(() => {
    try {
      const raw = searchParams.get('filters');
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  });

  const [data, setData] = useState<Record<string, unknown>[]>([]);
  const [total, setTotal] = useState(0);
  const [columns, setColumns] = useState<ColumnMeta[]>([]);
  const [loading, setLoading] = useState(true);

  const [visibleColumns, setVisibleColumns] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);

  // Fetch table list
  useEffect(() => {
    fetch('/api/data-explorer/tables', { credentials: 'include' })
      .then((res) => res.json())
      .then((data) => setTables(Array.isArray(data) ? data : []))
      .catch(() => setTables([]))
      .finally(() => setTablesLoading(false));
  }, []);

  // Sync state to URL
  const syncUrl = useCallback(
    (updates: Record<string, string | null>) => {
      const params = new URLSearchParams();
      const current: Record<string, string> = {};
      if (table) current.table = table;
      if (search) current.search = search;
      if (sort) current.sort = sort;
      if (order !== 'desc') current.order = order;
      if (offset > 0) current.offset = String(offset);
      if (limit !== 50) current.limit = String(limit);
      if (filters.length > 0) current.filters = JSON.stringify(filters);

      const merged = { ...current, ...Object.fromEntries(Object.entries(updates).filter(([, v]) => v !== null)) };
      for (const [k, v] of Object.entries(merged)) {
        params.set(k, v);
      }
      router.push(`/data?${params.toString()}`, { scroll: false });
    },
    [table, search, sort, order, offset, limit, filters, router]
  );

  // Fetch data
  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set('table', table);
      params.set('limit', String(limit));
      params.set('offset', String(offset));
      if (sort) params.set('sort', sort);
      if (order) params.set('order', order);
      if (search) params.set('search', search);
      if (filters.length > 0) params.set('filters', JSON.stringify(filters));

      const res = await fetch(`/api/data-explorer?${params.toString()}`, { credentials: 'include' });
      if (!res.ok) {
        let errMsg = `API error: ${res.status}`;
        try {
          const err = await res.json();
          errMsg = err.message || err.error || errMsg;
          console.error('Data Explorer API error:', err);
        } catch {}
        setError(errMsg);
        setData([]);
        setTotal(0);
        return;
      }
      setError(null);
      const json: ApiResponse = await res.json();
      setData(json.data);
      setTotal(json.total);
      setColumns(json.columns);
      setVisibleColumns(new Set(json.columns.map((c) => c.field)));
    } catch (err) {
      console.error('Data fetch error:', err);
      setData([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [table, limit, offset, sort, order, search, filters]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Reset pagination when filters/search/table change
  const handleTableChange = useCallback(
    (newTable: string) => {
      setTable(newTable);
      setOffset(0);
      setFilters([]);
      setSearch('');
      setSort('');
      setOrder('desc');
      syncUrl({ table: newTable, offset: '0', filters: null, search: null, sort: null, order: 'desc' });
    },
    [syncUrl]
  );

  const handleSearchChange = useCallback(
    (newSearch: string) => {
      setSearch(newSearch);
      setOffset(0);
      syncUrl({ search: newSearch || null, offset: '0' });
    },
    [syncUrl]
  );

  const handleFiltersChange = useCallback(
    (newFilters: FilterRule[]) => {
      setFilters(newFilters);
      setOffset(0);
      syncUrl({ filters: newFilters.length > 0 ? JSON.stringify(newFilters) : null, offset: '0' });
    },
    [syncUrl]
  );

  const handleClearAll = useCallback(() => {
    setFilters([]);
    setSearch('');
    setOffset(0);
    syncUrl({ filters: null, search: null, offset: '0' });
  }, [syncUrl]);

  const handleSortChange = useCallback(
    (field: string, newOrder: string) => {
      setSort(field);
      setOrder(newOrder);
      syncUrl({ sort: field, order: newOrder });
    },
    [syncUrl]
  );

  const handlePageChange = useCallback(
    (newOffset: number) => {
      setOffset(newOffset);
      syncUrl({ offset: newOffset > 0 ? String(newOffset) : null });
    },
    [syncUrl]
  );

  const handlePageSizeChange = useCallback(
    (newLimit: number) => {
      setLimit(newLimit);
      setOffset(0);
      syncUrl({ limit: newLimit !== 50 ? String(newLimit) : null, offset: '0' });
    },
    [syncUrl]
  );

  const handleColumnVisibilityChange = useCallback(
    (field: string, visible: boolean) => {
      setVisibleColumns((prev) => {
        const next = new Set(prev);
        if (visible) next.add(field);
        else next.delete(field);
        return next;
      });
    },
    []
  );

  const handleNavigate = useCallback(
    (targetTable: string, filterField: string, filterValue: string) => {
      setTable(targetTable);
      setFilters([{ field: filterField, op: 'eq', value: filterValue }]);
      setOffset(0);
      setSearch('');
      setSort('');
      setOrder('desc');
      const params = new URLSearchParams();
      params.set('table', targetTable);
      params.set('filters', JSON.stringify([{ field: filterField, op: 'eq', value: filterValue }]));
      router.push(`/data?${params.toString()}`, { scroll: false });
    },
    [router]
  );

  const filterKey = JSON.stringify(filters);
  const searchKey = search;

  return (
    <div className="min-h-screen w-full">
      <div className="relative z-10">
        <ContentWrapper>
          <div className="px-0 sm:px-1 lg:px-3 max-w-[1920px]">
            <div className="flex items-center justify-between mb-4 gap-4">
              <h1 className="text-xl font-semibold text-foreground shrink-0">Data Explorer</h1>
              {tables.length > 0 && (
                <div className="w-72">
                  <TableSelector
                    tables={tables}
                    selected={table}
                    onSelect={handleTableChange}
                  />
                </div>
              )}
            </div>

            {error && (
              <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-lg">
                <p className="text-xs text-destructive font-medium">{error}</p>
              </div>
            )}

            <div className="space-y-3">
              <DataToolbar
                key={`${table}-${filterKey}-${searchKey}`}
                columns={columns}
                filters={filters}
                search={search}
                table={table}
                total={total}
                tableKey={table}
                visibleColumns={visibleColumns}
                onFiltersChange={handleFiltersChange}
                onSearchChange={handleSearchChange}
                onClearAll={handleClearAll}
                onColumnVisibilityChange={handleColumnVisibilityChange}
              />

              <DataTable
                tableKey={table}
                columns={columns}
                data={data}
                total={total}
                limit={limit}
                offset={offset}
                sort={sort}
                order={order}
                filters={filters}
                search={search}
                loading={loading}
                onSortChange={handleSortChange}
                onPageChange={handlePageChange}
                onPageSizeChange={handlePageSizeChange}
                onNavigate={handleNavigate}
              />
            </div>
          </div>
        </ContentWrapper>
      </div>
    </div>
  );
}
