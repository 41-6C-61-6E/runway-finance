'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  flexRender,
  ColumnDef,
  SortingState,
  VisibilityState,
  RowSelectionState,
} from '@tanstack/react-table';
import {
  ChevronUp,
  ChevronDown,
  ChevronsUpDown,
  Eye,
  EyeOff,
  Settings2,
  Check,
  GripVertical,
} from 'lucide-react';

type Transaction = {
  id: string;
  date: string;
  description: string;
  payee: string | null;
  amount: string;
  pending: boolean;
  postedDate: string | null;
  categoryId: string | null;
  categoryName: string | null;
  categoryColor: string | null;
  accountName: string | null;
  reviewed: boolean | null;
};

type Category = {
  id: string;
  parentId: string | null;
  name: string;
  color: string;
  isIncome: boolean;
};

interface TransactionTableProps {
  filters: Record<string, string | null>;
  onSelectAll: (ids: string[]) => void;
  onTransactionClick?: (tx: Transaction) => void;
}

const ALL_COLUMNS: string[] = [
  'select',
  'date',
  'description',
  'account',
  'category',
  'amount',
];

const COLUMN_LABELS: Record<string, string> = {
  select: '',
  date: 'Date',
  description: 'Description',
  account: 'Account',
  category: 'Category',
  amount: 'Amount',
};

const COLUMN_MIN_WIDTHS: Record<string, number> = {
  select: 40,
  date: 90,
  description: 120,
  account: 80,
  category: 100,
  amount: 100,
};

function SortableHeader({
  column,
  title,
  dragHandleProps,
}: {
  column: any;
  title: string;
  dragHandleProps?: any;
}) {
  return (
    <div className="flex items-center gap-1">
      {dragHandleProps && (
        <span {...dragHandleProps} className="cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground flex-shrink-0">
          <GripVertical className="h-3 w-3" />
        </span>
      )}
      <button
        onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
        className="flex items-center gap-1 hover:text-foreground transition-colors"
      >
        {title}
        {column.getCanSort() && (
          column.getIsSorted() === 'asc' ? <ChevronUp className="ml-0.5 h-3 w-3" /> :
          column.getIsSorted() === 'desc' ? <ChevronDown className="ml-0.5 h-3 w-3" /> :
          <ChevronsUpDown className="ml-0.5 h-3 w-3 opacity-50" />
        )}
      </button>
    </div>
  );
}

export default function TransactionTable({ filters, onSelectAll, onTransactionClick }: TransactionTableProps) {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [page, setPage] = useState(0);
  const [sorting, setSorting] = useState<SortingState>([]);
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({
    select: true,
    account: true,
    category: true,
  });
  const [showColumnMenu, setShowColumnMenu] = useState(false);
  const [categories, setCategories] = useState<Category[]>([]);
  const [openCategoryTx, setOpenCategoryTx] = useState<string | null>(null);
  const [columnOrder, setColumnOrder] = useState<string[]>(ALL_COLUMNS);
  const [columnSizing, setColumnSizing] = useState<Record<string, number>>({});
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  const containerRef = useRef<HTMLDivElement>(null);
  const limit = 50;

  const [dragColId, setDragColId] = useState<string | null>(null);
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/categories', { credentials: 'include' })
      .then((res) => res.json())
      .then((data) => setCategories(Array.isArray(data) ? data : []))
      .catch(() => setCategories([]));
  }, []);

  const calculateSizes = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    const containerWidth = el.clientWidth;
    if (containerWidth <= 0) return;

    const visibleCols = columnOrder.filter((id) => columnVisibility[id] !== false);
    const fixedSizes: Record<string, number> = { select: 40 };
    const flexibleCols = visibleCols.filter((id) => !(id in fixedSizes));

    const fixedTotal = visibleCols
      .filter((id) => id in fixedSizes)
      .reduce((s, id) => s + fixedSizes[id], 0);

    const remaining = Math.max(containerWidth - fixedTotal - 8, 300);

    const flexRatios: Record<string, number> = {
      date: 1,
      description: 2.5,
      account: 1.2,
      category: 1.5,
      amount: 1,
    };

    const totalRatio = flexibleCols.reduce((s, id) => s + (flexRatios[id] || 1), 0);

    const sizes: Record<string, number> = { ...fixedSizes };
    for (const id of flexibleCols) {
      sizes[id] = Math.floor((remaining * (flexRatios[id] || 1)) / totalRatio);
    }

    setColumnSizing((prev) => {
      if (JSON.stringify(prev) === JSON.stringify(sizes)) return prev;
      return sizes;
    });
  }, [columnOrder, columnVisibility]);

  useEffect(() => {
    calculateSizes();
  }, [calculateSizes]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => calculateSizes());
    ro.observe(el);
    return () => ro.disconnect();
  }, [calculateSizes]);

  const handleSetCategory = useCallback(async (txId: string, categoryId: string | null, categoryName?: string | null, categoryColor?: string | null) => {
    const res = await fetch(`/api/transactions/${txId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ categoryId }),
    });
    if (res.ok) {
      setTransactions((prev) => prev.map((t) =>
        t.id === txId ? { ...t, categoryId, categoryName: categoryName ?? null, categoryColor: categoryColor ?? null } : t
      ));
    }
    setOpenCategoryTx(null);
  }, []);

  const fetchTransactions = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set('limit', String(limit));
      params.set('offset', String(page * limit));
      if (sorting.length > 0) {
        const sort = sorting[0];
        params.set('sort', sort.id);
        params.set('order', sort.desc ? 'desc' : 'asc');
      }
      for (const [key, value] of Object.entries(filters)) {
        if (value) params.set(key, value);
      }
      const res = await fetch(`/api/transactions?${params.toString()}`, { credentials: 'include' });
      const data = await res.json();
      setTransactions((data.data || []).map((tx: any) => ({
        ...tx,
        categoryName: tx.category?.name ?? null,
        categoryColor: tx.category?.color ?? null,
      })));
      setTotal(data.total ?? 0);
    } finally {
      setLoading(false);
    }
  }, [filters, page, sorting]);

  useEffect(() => {
    fetchTransactions();
  }, [fetchTransactions]);

  useEffect(() => {
    const selected = Object.keys(rowSelection).filter((id) => rowSelection[id]);
    setSelectedIds(new Set(selected));
  }, [rowSelection]);

  useEffect(() => {
    onSelectAll(Array.from(selectedIds));
  }, [selectedIds, onSelectAll]);

  const formatAmount = (amount: string) => {
    const num = parseFloat(amount);
    return {
      text: new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        minimumFractionDigits: 2,
        signDisplay: 'exceptZero',
      }).format(num),
    };
  };

  const totalPages = Math.ceil(total / limit);

  const handleDragStart = useCallback((e: React.DragEvent, colId: string) => {
    setDragColId(colId);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', colId);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent, colId: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDropTargetId(colId);
  }, []);

  const handleDragLeave = useCallback(() => {
    setDropTargetId(null);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent, targetColId: string) => {
    e.preventDefault();
    const sourceColId = dragColId || e.dataTransfer.getData('text/plain');
    if (!sourceColId || sourceColId === targetColId) {
      setDragColId(null);
      setDropTargetId(null);
      return;
    }
    setColumnOrder((prev) => {
      const copy = [...prev];
      const srcIdx = copy.indexOf(sourceColId);
      const tgtIdx = copy.indexOf(targetColId);
      if (srcIdx === -1 || tgtIdx === -1) return prev;
      copy.splice(srcIdx, 1);
      copy.splice(tgtIdx, 0, sourceColId);
      return copy;
    });
    setDragColId(null);
    setDropTargetId(null);
  }, [dragColId]);

  const handleDragEnd = useCallback(() => {
    setDragColId(null);
    setDropTargetId(null);
  }, []);

  const columns = useMemo<ColumnDef<Transaction>[]>(
    () => [
      {
        id: 'select',
        header: ({ table }) => (
          <input
            type="checkbox"
            checked={table.getIsAllRowsSelected()}
            onChange={table.getToggleAllRowsSelectedHandler()}
            className="rounded border-border bg-background text-primary focus:ring-ring"
          />
        ),
        cell: ({ row }) => (
          <input
            type="checkbox"
            checked={row.getIsSelected()}
            onChange={row.getToggleSelectedHandler()}
            className="rounded border-border bg-background text-primary focus:ring-ring"
          />
        ),
        enableSorting: false,
        enableHiding: false,
      },
      {
        accessorKey: 'date',
        header: ({ column }) => (
          <SortableHeader column={column} title="Date" />
        ),
        cell: ({ row }) => {
          const tx = row.original;
          const isPending = tx.pending;
          return (
            <div className="whitespace-nowrap truncate">
              <span className="text-foreground text-sm">
                {new Date(row.getValue('date')).toLocaleDateString()}
              </span>
              {isPending && (
                <span className="ml-1.5 inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-medium text-chart-3 bg-chart-3/10 rounded-full">
                  <svg className="h-2 w-2 animate-pulse" fill="currentColor" viewBox="0 0 8 8">
                    <circle cx="4" cy="4" r="3" />
                  </svg>
                  Pending
                </span>
              )}
            </div>
          );
        },
      },
      {
        accessorKey: 'description',
        header: ({ column }) => (
          <SortableHeader column={column} title="Description" />
        ),
        cell: ({ row }) => {
          const tx = row.original;
          const isPending = tx.pending;
          return (
            <div className="truncate">
              <span className={`text-sm ${isPending ? 'text-muted-foreground' : 'text-foreground'}`}>
                {tx.payee || tx.description}
              </span>
            </div>
          );
        },
      },
      {
        accessorKey: 'accountName',
        header: ({ column }) => (
          <SortableHeader column={column} title="Account" />
        ),
        cell: ({ row }) => (
          <span className="text-sm text-muted-foreground truncate block">{row.getValue('accountName') || '—'}</span>
        ),
      },
      {
        accessorKey: 'categoryName',
        header: ({ column }) => (
          <SortableHeader column={column} title="Category" />
        ),
        cell: ({ row }) => {
          const tx = row.original;
          const isOpen = openCategoryTx === tx.id;
          const parents = categories.filter((c) => !c.parentId);
          const getChildren = (parentId: string) => categories.filter((c) => c.parentId === parentId);

          return (
            <div className="relative">
              <button
                onClick={(e) => { e.stopPropagation(); setOpenCategoryTx(isOpen ? null : tx.id); }}
                className="flex items-center gap-1 max-w-full group/cat"
              >
                {tx.categoryName ? (
                  <span
                    className="px-2 py-0.5 text-xs rounded-full font-medium inline-flex items-center gap-1 whitespace-nowrap truncate max-w-full"
                    style={{
                      backgroundColor: `${tx.categoryColor}22`,
                      color: tx.categoryColor || 'var(--color-primary)',
                    }}
                  >
                    {tx.categoryName}
                    <ChevronDown className="h-3 w-3 opacity-0 group-hover/cat:opacity-100 transition-opacity flex-shrink-0" />
                  </span>
                ) : (
                  <span className="px-2 py-0.5 text-xs rounded-full inline-flex items-center gap-1 whitespace-nowrap bg-muted text-muted-foreground group-hover/cat:text-foreground transition-colors">
                    Uncategorized
                    <ChevronDown className="h-3 w-3 opacity-0 group-hover/cat:opacity-100 transition-opacity flex-shrink-0" />
                  </span>
                )}
              </button>
              {isOpen && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setOpenCategoryTx(null)} />
                  <div className="absolute z-50 top-full left-0 mt-1 w-48 bg-card border border-border rounded-lg shadow-xl max-h-64 overflow-y-auto">
                    <button
                      onClick={() => handleSetCategory(tx.id, null, null, null)}
                      className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-muted-foreground hover:bg-muted transition-colors"
                    >
                      None
                    </button>
                    {parents.map((parent) => (
                      <div key={parent.id}>
                        <div className="flex items-center gap-2 px-3 py-1 text-[10px] font-medium text-muted-foreground bg-muted/30">
                          <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: parent.color }} />
                          {parent.name}
                        </div>
                        {getChildren(parent.id).map((child) => (
                          <button
                            key={child.id}
                            onClick={() => handleSetCategory(tx.id, child.id, child.name, child.color)}
                            className={`w-full flex items-center gap-2 px-4 py-1.5 text-xs transition-colors ${
                              tx.categoryId === child.id
                                ? 'text-primary bg-primary/10'
                                : 'text-foreground/80 hover:bg-muted'
                            }`}
                          >
                            <div className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: child.color }} />
                            {child.name}
                            {tx.categoryId === child.id && <Check className="ml-auto h-3 w-3" />}
                          </button>
                        ))}
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          );
        },
      },
      {
        accessorKey: 'amount',
        header: ({ column }) => (
          <SortableHeader column={column} title="Amount" />
        ),
        cell: ({ row }) => {
          const { text } = formatAmount(row.getValue('amount'));
          return (
            <span className="text-right text-sm font-mono font-medium text-foreground block pr-3 financial-value">
              {text}
            </span>
          );
        },
        meta: { className: 'text-right' },
      },
    ],
    [categories, openCategoryTx, handleSetCategory]
  );

  const table = useReactTable({
    data: transactions,
    columns,
    state: {
      sorting,
      columnVisibility,
      columnOrder,
      columnSizing,
      rowSelection,
    },
    onSortingChange: setSorting,
    onColumnVisibilityChange: setColumnVisibility,
    onColumnOrderChange: setColumnOrder,
    onColumnSizingChange: setColumnSizing,
    onRowSelectionChange: setRowSelection,
    enableRowSelection: true,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    manualPagination: true,
    pageCount: totalPages,
    enableSortingRemoval: false,
    enableColumnResizing: true,
    columnResizeMode: 'onChange',
  });

  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden" ref={containerRef}>
        {loading ? (
          <div className="p-12 text-center text-muted-foreground">Loading transactions...</div>
        ) : transactions.length === 0 ? (
          <div className="p-12 text-center">
            <p className="text-muted-foreground text-base mb-4">No transactions found.</p>
            <a
              href="/settings"
              className="inline-block px-5 py-2 text-sm font-semibold text-primary-foreground bg-primary rounded-lg hover:opacity-90 transition-opacity"
            >
              Connect a Financial Institution
            </a>
          </div>
        ) : (
          <>
            {/* Column config toolbar */}
            <div className="flex items-center justify-end px-3 py-1.5 border-b border-border">
              <div className="relative">
                <button
                  onClick={() => setShowColumnMenu(!showColumnMenu)}
                  className="flex items-center gap-1.5 px-2.5 py-1 text-xs text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-colors"
                >
                  <Settings2 className="h-3.5 w-3.5" />
                  Columns
                </button>
                {showColumnMenu && (
                  <div className="absolute right-0 top-full mt-1 w-44 bg-card border border-border rounded-lg shadow-xl z-50 py-1">
                    <div className="px-3 py-1.5 text-xs text-muted-foreground border-b border-border">
                      Toggle columns
                    </div>
                    {ALL_COLUMNS.map((colId) => {
                      const col = table.getColumn(colId);
                      const isVisible = col?.getIsVisible() ?? true;
                      return (
                        <button
                          key={colId}
                          onClick={() => {
                            const col = table.getColumn(colId);
                            if (col) col.toggleVisibility(!col.getIsVisible());
                          }}
                          className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-foreground/80 hover:bg-muted transition-colors"
                        >
                          {isVisible ? (
                            <EyeOff className="h-3 w-3 text-muted-foreground" />
                          ) : (
                            <Eye className="h-3 w-3 text-muted-foreground/50" />
                          )}
                          <span className={isVisible ? '' : 'opacity-50'}>
                            {COLUMN_LABELS[colId]}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            {/* Table */}
            <div className="overflow-x-hidden">
              <table className="w-full text-sm border-collapse" style={{ tableLayout: 'fixed' }}>
                <thead>
                  {table.getHeaderGroups().map((headerGroup) => (
                    <tr key={headerGroup.id} className="border-b border-border">
                      {headerGroup.headers.map((header) => {
                        const colId = header.id;
                        const isVisible = header.column.getIsVisible();
                        if (!isVisible) return null;

                        const size = columnSizing[colId] || header.getSize() || COLUMN_MIN_WIDTHS[colId] || 80;
                        const isDropTarget = dropTargetId === colId && dragColId !== colId;

                        return (
                          <th
                            key={header.id}
                            className={`px-3 py-2 text-left text-muted-foreground font-medium text-xs uppercase tracking-wider relative select-none ${
                              colId !== 'select' ? 'cursor-pointer' : ''
                            } ${isDropTarget ? 'border-l-2 border-l-primary' : ''}`}
                            style={{ width: size, minWidth: COLUMN_MIN_WIDTHS[colId] || 60, maxWidth: 500 }}
                          >
                            <div className="flex items-center">
                              {colId !== 'select' && (
                                <span
                                  draggable
                                  onDragStart={(e) => handleDragStart(e, colId)}
                                  onDragOver={(e) => handleDragOver(e, colId)}
                                  onDragLeave={handleDragLeave}
                                  onDrop={(e) => handleDrop(e, colId)}
                                  onDragEnd={handleDragEnd}
                                  className="flex items-center gap-1 min-w-0 flex-1"
                                >
                                  {flexRender(header.column.columnDef.header, header.getContext())}
                                </span>
                              )}
                              {colId === 'select' && flexRender(header.column.columnDef.header, header.getContext())}
                            </div>
                            {/* Resize handle */}
                            {colId !== 'select' && (
                              <div
                                onMouseDown={header.getResizeHandler()}
                                onTouchStart={header.getResizeHandler()}
                                className={`absolute right-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-ring active:bg-ring transition-colors ${
                                  header.column.getIsResizing() ? 'bg-ring' : ''
                                }`}
                              />
                            )}
                          </th>
                        );
                      })}
                    </tr>
                  ))}
                </thead>
                <tbody>
                  {table.getRowModel().rows.map((row) => {
                    const isPending = row.original.pending;
                    return (
                      <tr
                        key={row.id}
                        className={`border-b border-border/50 hover:bg-muted/30 transition-colors cursor-pointer group ${
                          isPending ? 'bg-chart-3/[0.02]' : ''
                        }`}
                        onClick={() => onTransactionClick?.(row.original)}
                      >
                      {row.getVisibleCells().map((cell) => (
                        <td
                          key={cell.id}
                          className="px-3 py-1.5 overflow-hidden truncate"
                          style={{ width: columnSizing[cell.column.id] || cell.column.getSize() }}
                        >
                          {flexRender(cell.column.columnDef.cell, cell.getContext())}
                        </td>
                      ))}
                    </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between px-4 py-2.5 border-t border-border">
                <span className="text-xs text-muted-foreground">
                  {page * limit + 1}–{Math.min((page + 1) * limit, total)} of {total}
                </span>
                <div className="flex gap-1.5">
                  <button
                    onClick={() => setPage((p) => Math.max(0, p - 1))}
                    disabled={page === 0}
                    className="px-3 py-1 text-xs text-muted-foreground hover:text-foreground disabled:opacity-30 disabled:cursor-not-allowed transition-colors rounded-md hover:bg-muted"
                  >
                    Previous
                  </button>
                  <button
                    onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                    disabled={page >= totalPages - 1}
                    className="px-3 py-1 text-xs text-muted-foreground hover:text-foreground disabled:opacity-30 disabled:cursor-not-allowed transition-colors rounded-md hover:bg-muted"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
  );
}
