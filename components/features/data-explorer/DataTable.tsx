'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  flexRender,
  SortingState,
  VisibilityState,
} from '@tanstack/react-table';
import type { ColumnDef, RowData } from '@tanstack/react-table';
import { Fragment } from 'react';
import {
  ChevronUp,
  ChevronDown,
  ChevronsUpDown,
  ChevronRight,
  GripVertical,
} from 'lucide-react';
import RowExpansion from './RowExpansion';

declare module '@tanstack/react-table' {
  interface ColumnMeta<TData extends RowData, TValue> {
    className?: string;
  }
}

type ColumnMeta = {
  field: string;
  label: string;
  type: 'string' | 'number' | 'boolean' | 'date' | 'json';
  nullable: boolean;
};

type FilterRule = {
  field: string;
  op: string;
  value: string;
};

interface DataTableProps {
  tableKey: string;
  columns: ColumnMeta[];
  data: Record<string, unknown>[];
  total: number;
  limit: number;
  offset: number;
  sort: string;
  order: string;
  filters: FilterRule[];
  search: string;
  loading: boolean;
  onSortChange: (field: string, order: string) => void;
  onPageChange: (offset: number) => void;
  onPageSizeChange: (size: number) => void;
  onNavigate: (table: string, filterField: string, filterValue: string) => void;
}

const ALL_COLUMNS_MARKER = '__all__';

export default function DataTable({
  tableKey,
  columns,
  data,
  total,
  limit,
  offset,
  sort,
  order,
  filters,
  search,
  loading,
  onSortChange,
  onPageChange,
  onPageSizeChange,
  onNavigate,
}: DataTableProps) {
  const [sorting, setSorting] = useState<SortingState>(
    sort ? [{ id: sort, desc: order === 'desc' }] : []
  );
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({});
  const [expandedRow, setExpandedRow] = useState<string | null>(null);
  const [columnOrder, setColumnOrder] = useState<string[]>([]);
  const [columnSizing, setColumnSizing] = useState<Record<string, number>>({});
  const [dragColId, setDragColId] = useState<string | null>(null);
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const visibleFields = useMemo(
    () => new Set(columns.map((c) => c.field)),
    [columns]
  );

  useEffect(() => {
    const initial: VisibilityState = {};
    for (const col of columns) {
      initial[col.field] = true;
    }
    setColumnVisibility(initial);
    setColumnOrder(columns.map((c) => c.field));
  }, [tableKey, columns]);

  useEffect(() => {
    setSorting(sort ? [{ id: sort, desc: order === 'desc' }] : []);
  }, [sort, order]);

  useEffect(() => {
    setExpandedRow(null);
  }, [tableKey, filters, search]);

  useEffect(() => {
    if (sorting.length > 0) {
      const s = sorting[0];
      onSortChange(s.id, s.desc ? 'desc' : 'asc');
    }
  }, [sorting, onSortChange]);

  const calculateSizes = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    const containerWidth = el.clientWidth;
    if (containerWidth <= 0) return;

    const visibleCols = columnOrder.filter(
      (id) => columnVisibility[id] !== false && visibleFields.has(id)
    );
    if (visibleCols.length === 0) return;

    const fixedSizes: Record<string, number> = {};
    const flexibleCols = visibleCols.filter((id) => !(id in fixedSizes));
    const fixedTotal = visibleCols
      .filter((id) => id in fixedSizes)
      .reduce((s, id) => s + fixedSizes[id], 0);

    const remaining = Math.max(containerWidth - fixedTotal - 8, 300);
    const eachWidth = Math.floor(remaining / flexibleCols.length);
    const sizes: Record<string, number> = { ...fixedSizes };
    for (const id of flexibleCols) {
      sizes[id] = Math.max(eachWidth, 80);
    }

    setColumnSizing((prev) => {
      if (JSON.stringify(prev) === JSON.stringify(sizes)) return prev;
      return sizes;
    });
  }, [columnOrder, columnVisibility, visibleFields]);

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

  const handleRowClick = useCallback(
    (rowId: string) => {
      setExpandedRow((prev) => (prev === rowId ? null : rowId));
    },
    []
  );

  const columnsDef = useMemo<ColumnDef<Record<string, unknown>>[]>(
    () =>
      columns.map((col) => ({
        accessorKey: col.field,
        header: ({ column }) => (
          <div className="flex items-center gap-1">
            <span
              draggable
              onDragStart={(e) => {
                setDragColId(col.field);
                e.dataTransfer.effectAllowed = 'move';
                e.dataTransfer.setData('text/plain', col.field);
              }}
              onDragOver={(e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
                setDropTargetId(col.field);
              }}
              onDragLeave={() => setDropTargetId(null)}
              onDrop={(e) => {
                e.preventDefault();
                const sourceId = dragColId || e.dataTransfer.getData('text/plain');
                if (sourceId && sourceId !== col.field) {
                  setColumnOrder((prev) => {
                    const copy = [...prev];
                    const srcIdx = copy.indexOf(sourceId);
                    const tgtIdx = copy.indexOf(col.field);
                    if (srcIdx === -1 || tgtIdx === -1) return prev;
                    copy.splice(srcIdx, 1);
                    copy.splice(tgtIdx, 0, sourceId);
                    return copy;
                  });
                }
                setDragColId(null);
                setDropTargetId(null);
              }}
              onDragEnd={() => { setDragColId(null); setDropTargetId(null); }}
              className="flex items-center gap-1 cursor-grab active:cursor-grabbing"
            >
              <GripVertical className="h-3 w-3 text-muted-foreground/30 hover:text-muted-foreground flex-shrink-0" />
            </span>
            <button
              onClick={() =>
                column.toggleSorting(column.getIsSorted() === 'asc')
              }
              className="flex items-center gap-1 hover:text-foreground transition-colors"
            >
              <span className="truncate">{col.label}</span>
              {column.getIsSorted() === 'asc' ? (
                <ChevronUp className="ml-0.5 h-3 w-3 flex-shrink-0" />
              ) : column.getIsSorted() === 'desc' ? (
                <ChevronDown className="ml-0.5 h-3 w-3 flex-shrink-0" />
              ) : (
                <ChevronsUpDown className="ml-0.5 h-3 w-3 opacity-50 flex-shrink-0" />
              )}
            </button>
          </div>
        ),
        cell: ({ row }) => {
          const value = row.original[col.field];
          return (
            <CellRenderer
              value={value}
              type={col.type}
              field={col.field}
              isExpanded={expandedRow === row.id}
            />
          );
        },
        enableSorting: true,
        enableHiding: true,
        meta: col.type === 'number' ? { className: 'text-right font-mono tabular-nums' } : undefined,
      })),
    [columns, expandedRow, dragColId]
  );

  const table = useReactTable({
    data,
    columns: columnsDef,
    state: {
      sorting,
      columnVisibility,
      columnOrder,
      columnSizing,
    },
    onSortingChange: setSorting,
    onColumnVisibilityChange: setColumnVisibility,
    onColumnOrderChange: setColumnOrder,
    onColumnSizingChange: setColumnSizing,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    manualPagination: true,
    pageCount: Math.ceil(total / limit),
    enableSortingRemoval: false,
    enableColumnResizing: true,
    columnResizeMode: 'onChange',
  });

  const totalPages = Math.ceil(total / limit);
  const currentPage = Math.floor(offset / limit);

  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden" ref={containerRef}>
      {loading ? (
        <div className="p-12 text-center text-muted-foreground">Loading data...</div>
      ) : data.length === 0 ? (
        <div className="p-12 text-center">
          <p className="text-muted-foreground text-base mb-2">No data found.</p>
          <p className="text-xs text-muted-foreground/60">
            Try adjusting your filters or selecting a different table.
          </p>
        </div>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse" style={{ tableLayout: 'fixed' }}>
              <thead>
                {table.getHeaderGroups().map((headerGroup) => (
                  <tr key={headerGroup.id} className="border-b border-border">
                    <th className="w-8 px-2 py-2 text-muted-foreground text-xs" />
                    {headerGroup.headers.map((header) => {
                      const colId = header.id;
                      const isVisible = header.column.getIsVisible();
                      if (!isVisible || !visibleFields.has(colId)) return null;

                      const size = columnSizing[colId] || header.getSize() || 100;
                      const isDropTarget = dropTargetId === colId && dragColId !== colId;

                      return (
                        <th
                          key={header.id}
                          className={`px-3 py-2 text-left text-muted-foreground font-medium text-xs uppercase tracking-wider relative select-none ${
                            isDropTarget ? 'border-l-2 border-l-primary' : ''
                          }`}
                          style={{ width: size, minWidth: 60, maxWidth: 500 }}
                        >
                          {flexRender(header.column.columnDef.header, header.getContext())}
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
                  const isExpanded = expandedRow === row.id;
                  return (
                    <Fragment key={row.id}>
                      <tr
                        className={`border-b border-border/50 hover:bg-muted/30 transition-colors cursor-pointer ${
                          isExpanded ? 'bg-muted/20' : ''
                        }`}
                        onClick={() => handleRowClick(row.id)}
                      >
                        <td className="w-8 px-2 py-2 text-muted-foreground">
                          {isExpanded ? (
                            <ChevronDown className="h-3.5 w-3.5" />
                          ) : (
                            <ChevronRight className="h-3.5 w-3.5" />
                          )}
                        </td>
                        {row.getVisibleCells().map((cell) => {
                          const colId = cell.column.id;
                          if (!visibleFields.has(colId)) return null;
                          return (
                            <td
                              key={cell.id}
                              className={`px-3 py-2 overflow-hidden truncate ${cell.column.columnDef.meta?.className || ''}`}
                              style={{ width: columnSizing[colId] || cell.column.getSize() }}
                            >
                              {flexRender(cell.column.columnDef.cell, cell.getContext())}
                            </td>
                          );
                        })}
                      </tr>
                      {isExpanded && (
                        <tr>
                          <td colSpan={table.getVisibleFlatColumns().length + 1} className="p-0">
                            <RowExpansion
                              row={row.original}
                              columns={columns}
                              onNavigate={onNavigate}
                            />
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          <div className="flex items-center justify-between px-4 py-2.5 border-t border-border">
            <div className="flex items-center gap-3">
              <span className="text-xs text-muted-foreground">
                {offset + 1}–{Math.min(offset + limit, total)} of {total}
              </span>
              <select
                value={limit}
                onChange={(e) => onPageSizeChange(Number(e.target.value))}
                className="px-2 py-1 text-xs bg-muted border border-border rounded text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              >
                <option value={25}>25 / page</option>
                <option value={50}>50 / page</option>
                <option value={100}>100 / page</option>
                <option value={500}>500 / page</option>
              </select>
            </div>
            {totalPages > 1 && (
              <div className="flex gap-1.5">
                <button
                  onClick={() => onPageChange(0)}
                  disabled={currentPage === 0}
                  className="px-2 py-1 text-xs text-muted-foreground hover:text-foreground disabled:opacity-30 disabled:cursor-not-allowed transition-colors rounded-md hover:bg-muted"
                >
                  First
                </button>
                <button
                  onClick={() => onPageChange(Math.max(0, offset - limit))}
                  disabled={currentPage === 0}
                  className="px-3 py-1 text-xs text-muted-foreground hover:text-foreground disabled:opacity-30 disabled:cursor-not-allowed transition-colors rounded-md hover:bg-muted"
                >
                  Previous
                </button>
                <span className="px-2 py-1 text-xs text-muted-foreground">
                  Page {currentPage + 1} of {totalPages}
                </span>
                <button
                  onClick={() =>
                    onPageChange(Math.min((totalPages - 1) * limit, offset + limit))
                  }
                  disabled={currentPage >= totalPages - 1}
                  className="px-3 py-1 text-xs text-muted-foreground hover:text-foreground disabled:opacity-30 disabled:cursor-not-allowed transition-colors rounded-md hover:bg-muted"
                >
                  Next
                </button>
                <button
                  onClick={() => onPageChange((totalPages - 1) * limit)}
                  disabled={currentPage >= totalPages - 1}
                  className="px-2 py-1 text-xs text-muted-foreground hover:text-foreground disabled:opacity-30 disabled:cursor-not-allowed transition-colors rounded-md hover:bg-muted"
                >
                  Last
                </button>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function CellRenderer({
  value,
  type,
  field,
  isExpanded,
}: {
  value: unknown;
  type: string;
  field: string;
  isExpanded: boolean;
}) {
  if (value === null || value === undefined) {
    return <span className="text-muted-foreground/50 italic">—</span>;
  }

  if (type === 'json') {
    return (
      <span className="text-chart-4 text-[11px] font-mono">
        {isExpanded ? '▼ JSON' : '▶ JSON'}
      </span>
    );
  }

  if (type === 'boolean') {
    const isSynthetic = field === 'isSynthetic';
    if (isSynthetic) {
      return (
        <span
          className={`inline-flex items-center px-1.5 py-0.5 text-[10px] font-medium rounded-full ${
            value
              ? 'bg-amber-500/20 text-amber-500'
              : 'bg-emerald-500/20 text-emerald-500'
          }`}
        >
          {value ? 'Synthetic' : 'Real'}
        </span>
      );
    }
    return (
      <span
        className={`inline-flex items-center px-1.5 py-0.5 text-[10px] font-medium rounded-full ${
          value
            ? 'bg-amber-500/20 text-amber-500'
            : 'bg-emerald-500/20 text-emerald-500'
        }`}
      >
        {value ? 'True' : 'False'}
      </span>
    );
  }

  if (type === 'date') {
    return (
      <span className="text-foreground text-[13px] whitespace-nowrap">
        {new Date(value as string).toLocaleDateString()}
      </span>
    );
  }

  if (type === 'number') {
    return (
      <span className="text-foreground text-[13px] tabular-nums">
        {new Intl.NumberFormat('en-US', {
          minimumFractionDigits: 2,
          maximumFractionDigits: 4,
        }).format(Number(value))}
      </span>
    );
  }

  return (
    <span className="text-foreground text-[13px] truncate block">
      {String(value)}
    </span>
  );
}
