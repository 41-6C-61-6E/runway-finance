'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  flexRender,
  ColumnDef,
  SortingState,
  VisibilityState,
  ColumnOrderState,
} from '@tanstack/react-table';
import {
  DndContext,
  closestCorners,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import { arrayMove, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  ChevronUp,
  ChevronDown,
  ChevronsUpDown,
  Eye,
  EyeOff,
  GripVertical,
  Settings2,
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

interface TransactionTableProps {
  filters: Record<string, string | null>;
  onSelectAll: (ids: string[]) => void;
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
  select: 'Select',
  date: 'Date',
  description: 'Description',
  account: 'Account',
  category: 'Category',
  amount: 'Amount',
};

function SortableHeader({
  column,
  title,
}: {
  column: any;
  title: string;
}) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({
    id: column.id,
  });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const getSortIcon = () => {
    if (!column.getCanSort()) return <ChevronsUpDown className="ml-1 h-3 w-3" />;
    if (column.getIsSorted() === 'asc') return <ChevronUp className="ml-1 h-3 w-3" />;
    if (column.getIsSorted() === 'desc') return <ChevronDown className="ml-1 h-3 w-3" />;
    return <ChevronsUpDown className="ml-1 h-3 w-3" />;
  };

  return (
    <th
      className="px-3 py-3 text-left text-gray-400 font-medium whitespace-nowrap"
      style={style}
    >
      <div className="flex items-center gap-1">
        <div
          ref={setNodeRef}
          {...attributes}
          {...listeners}
          className="cursor-grab active:cursor-grabbing text-gray-500 hover:text-gray-300 flex-shrink-0"
        >
          <GripVertical className="h-3.5 w-3.5" />
        </div>
        <button
          onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
          className="flex items-center gap-1 hover:text-white transition-colors"
        >
          {title}
          {getSortIcon()}
        </button>
      </div>
    </th>
  );
}

export default function TransactionTable({ filters, onSelectAll }: TransactionTableProps) {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [page, setPage] = useState(0);
  const [sorting, setSorting] = useState<SortingState>([]);
  const [columnOrder, setColumnOrder] = useState<ColumnOrderState>(ALL_COLUMNS);
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({
    select: true,
    account: true,
    category: true,
  });
  const [showColumnMenu, setShowColumnMenu] = useState(false);
  const limit = 50;

  const fetchTransactions = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set('limit', String(limit));
      params.set('offset', String(page * limit));
      if (sorting.length > 0) {
        const sort = sorting[0];
        params.set('sortBy', sort.id);
        params.set('sortOrder', sort.desc ? 'desc' : 'asc');
      }
      for (const [key, value] of Object.entries(filters)) {
        if (value) params.set(key, value);
      }
      const res = await fetch(`/api/transactions?${params.toString()}`, { credentials: 'include' });
      const data = await res.json();
      setTransactions(data.data || []);
      setTotal(data.total ?? 0);
    } finally {
      setLoading(false);
    }
  }, [filters, page, sorting]);

  useEffect(() => {
    fetchTransactions();
  }, [fetchTransactions]);

  useEffect(() => {
    onSelectAll(Array.from(selectedIds));
  }, [selectedIds, onSelectAll]);

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const toggleSelectAll = useCallback(() => {
    if (selectedIds.size === transactions.length && transactions.length > 0) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(transactions.map((t) => t.id)));
    }
  }, [selectedIds, transactions]);

  const formatAmount = (amount: string) => {
    const num = parseFloat(amount);
    return {
      text: new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        minimumFractionDigits: 2,
      }).format(Math.abs(num)),
      color: 'text-gray-400',
    };
  };

  const totalPages = Math.ceil(total / limit);

  const columns = useMemo<ColumnDef<Transaction>[]>(
    () => [
      {
        id: 'select',
        header: ({ table }) => (
          <input
            type="checkbox"
            checked={table.getIsAllRowsSelected()}
            onChange={table.getToggleAllRowsSelectedHandler()}
            className="rounded border-white/20 bg-white/10 text-blue-600 focus:ring-blue-500"
          />
        ),
        cell: ({ row }) => (
          <input
            type="checkbox"
            checked={row.getIsSelected()}
            onChange={row.getToggleSelectedHandler()}
            className="rounded border-white/20 bg-white/10 text-blue-600 focus:ring-blue-500"
          />
        ),
        size: 40,
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
            <div className="whitespace-nowrap">
              <span className="text-gray-300">
                {new Date(row.getValue('date')).toLocaleDateString()}
              </span>
              {isPending && (
                <span className="ml-1.5 inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-medium text-amber-400 bg-amber-400/10 rounded-full">
                  <svg className="h-2.5 w-2.5 animate-pulse" fill="currentColor" viewBox="0 0 8 8">
                    <circle cx="4" cy="4" r="3" />
                  </svg>
                  Pending
                </span>
              )}
            </div>
          );
        },
        size: 100,
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
            <div>
              <span className={`max-w-xs truncate block ${isPending ? 'text-gray-300' : 'text-white'}`}>
                {tx.payee || tx.description}
              </span>
            </div>
          );
        },
        size: 200,
      },
      {
        accessorKey: 'accountName',
        header: ({ column }) => (
          <SortableHeader column={column} title="Account" />
        ),
        cell: ({ row }) => (
          <span className="text-gray-400">{row.getValue('accountName') || '—'}</span>
        ),
        size: 120,
      },
      {
        accessorKey: 'categoryName',
        header: ({ column }) => (
          <SortableHeader column={column} title="Category" />
        ),
        cell: ({ row }) => {
          const category = row.original.categoryName;
          const color = row.original.categoryColor;
          return category ? (
            <span
              className="px-2 py-0.5 text-xs rounded-full font-medium inline-block"
              style={{
                backgroundColor: `${color}33`,
                color: color || '#6366f1',
              }}
            >
              {category}
            </span>
          ) : (
            <span className="px-2 py-0.5 text-xs rounded-full bg-gray-500/20 text-gray-400">
              Uncategorized
            </span>
          );
        },
        size: 120,
      },
      {
        accessorKey: 'amount',
        header: ({ column }) => (
          <SortableHeader column={column} title="Amount" />
        ),
        cell: ({ row }) => {
          const { text, color } = formatAmount(row.getValue('amount'));
          return (
            <span className={`text-right font-mono font-medium ${color} block pr-4`}>
              {text}
            </span>
          );
        },
        size: 100,
        meta: { className: 'text-right' },
      },
    ],
    []
  );

  const table = useReactTable({
    data: transactions,
    columns,
    state: {
      sorting,
      columnOrder,
      columnVisibility,
    },
    onSortingChange: setSorting,
    onColumnOrderChange: setColumnOrder,
    onColumnVisibilityChange: setColumnVisibility,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    manualPagination: true,
    pageCount: totalPages,
    enableSortingRemoval: false,
    columnResizeMode: 'onChange',
  });

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor)
  );

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    if (active && over && active.id !== over.id) {
      setColumnOrder((prev) => {
        const oldIndex = prev.indexOf(active.id as string);
        const newIndex = prev.indexOf(over.id as string);
        return arrayMove(prev, oldIndex, newIndex);
      });
    }
  }, []);

  const toggleColumn = (columnId: string) => {
    const col = table.getColumn(columnId);
    if (col) {
      col.toggleVisibility(!col.getIsVisible());
    }
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragEnd={handleDragEnd}
    >
      <div className="bg-white/5 backdrop-blur-sm rounded-xl border border-white/10 overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-gray-400">Loading transactions...</div>
        ) : transactions.length === 0 ? (
          <div className="p-12 text-center">
            <p className="text-gray-400 text-lg mb-4">No transactions found.</p>
            <a
              href="/settings"
              className="inline-block px-6 py-2.5 text-sm font-semibold text-white bg-gradient-to-r from-blue-600 to-purple-600 rounded-lg hover:from-blue-700 hover:to-purple-700 transition-all"
            >
              Connect a Financial Institution
            </a>
          </div>
        ) : (
          <>
            {/* Column config toolbar */}
            <div className="flex items-center justify-end px-3 py-2 border-b border-white/5">
              <div className="relative">
                <button
                  onClick={() => setShowColumnMenu(!showColumnMenu)}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-gray-400 hover:text-white hover:bg-white/5 rounded-lg transition-colors"
                >
                  <Settings2 className="h-3.5 w-3.5" />
                  Columns
                </button>
                {showColumnMenu && (
                  <div className="absolute right-0 top-full mt-1 w-48 bg-gray-900/95 backdrop-blur-sm border border-white/10 rounded-lg shadow-xl z-50 py-1">
                    <div className="px-3 py-2 text-xs text-gray-500 border-b border-white/5">
                      Drag to reorder · Click to toggle
                    </div>
                    {ALL_COLUMNS.map((colId) => {
                      const col = table.getColumn(colId);
                      const isVisible = col?.getIsVisible() ?? true;
                      return (
                        <button
                          key={colId}
                          onClick={() => toggleColumn(colId)}
                          className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-gray-300 hover:bg-white/5 transition-colors"
                        >
                          {isVisible ? (
                            <EyeOff className="h-3 w-3 text-gray-500" />
                          ) : (
                            <Eye className="h-3 w-3 text-gray-600" />
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
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm border-collapse">
                <thead>
                  {table.getHeaderGroups().map((headerGroup) => (
                    <tr key={headerGroup.id} className="border-b border-white/10">
                      {headerGroup.headers.map((header) => {
                        const colId = header.id;
                        const isVisible = header.column.getIsVisible();
                        if (!isVisible) return null;
                        return (
                          <th
                            key={header.id}
                            className="relative px-3 py-3 text-left text-gray-400 font-medium"
                            style={{ width: header.getSize(), minWidth: header.getSize() }}
                          >
                            <div className="flex items-center gap-1">
                              <div className="cursor-grab active:cursor-grabbing text-gray-500 hover:text-gray-300 flex-shrink-0">
                                <GripVertical className="h-3.5 w-3.5" />
                              </div>
                              <button
                                onClick={() => header.column.toggleSorting(header.column.getIsSorted() === 'asc')}
                                className="flex items-center gap-1 hover:text-white transition-colors"
                              >
                                {flexRender(header.column.columnDef.header, header.getContext())}
                              </button>
                            </div>
                            {/* Resize handle */}
                            <div
                              {...{
                                onMouseDown: header.getResizeHandler(),
                                onTouchStart: header.getResizeHandler(),
                                className: 'absolute top-0 right-0 w-2 h-full cursor-col-resize touch-none bg-blue-500/30 hover:bg-blue-500/60 transition-colors opacity-0 hover:opacity-100 group-hover:opacity-50',
                              }}
                            />
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
                        className={`border-b border-white/5 hover:bg-white/5 transition-colors cursor-pointer h-10 group ${
                          isPending ? 'bg-amber-400/[0.03]' : ''
                        }`}
                      >
                      {row.getVisibleCells().map((cell) => (
                        <td
                          key={cell.id}
                          className="px-3 py-0 overflow-hidden"
                          style={{ width: cell.column.getSize(), minWidth: cell.column.getSize() }}
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
              <div className="flex items-center justify-between px-4 py-3 border-t border-white/10">
                <span className="text-sm text-gray-400">
                  {page * limit + 1}–{Math.min((page + 1) * limit, total)} of {total}
                </span>
                <div className="flex gap-2">
                  <button
                    onClick={() => setPage((p) => Math.max(0, p - 1))}
                    disabled={page === 0}
                    className="px-3 py-1 text-sm text-gray-400 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                  >
                    Previous
                  </button>
                  <button
                    onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                    disabled={page >= totalPages - 1}
                    className="px-3 py-1 text-sm text-gray-400 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </DndContext>
  );
}
