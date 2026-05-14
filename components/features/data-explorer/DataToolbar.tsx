'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { Search, X, Plus, Filter, RotateCcw, Settings2, EyeOff, Eye } from 'lucide-react';
import DataExport from './DataExport';

type ColumnMeta = {
  field: string;
  label: string;
  type: string;
  nullable: boolean;
};

type FilterRule = {
  field: string;
  op: string;
  value: string;
};

interface DataToolbarProps {
  columns: ColumnMeta[];
  filters: FilterRule[];
  search: string;
  table: string;
  total: number;
  onFiltersChange: (filters: FilterRule[]) => void;
  onSearchChange: (search: string) => void;
  onClearAll: () => void;
  onColumnVisibilityChange: (field: string, visible: boolean) => void;
  visibleColumns: Set<string>;
  tableKey: string;
}

const OPERATORS: Record<string, { label: string; needsValue: boolean }> = {
  eq: { label: '=', needsValue: true },
  neq: { label: '≠', needsValue: true },
  contains: { label: 'Contains', needsValue: true },
  gt: { label: '>', needsValue: true },
  gte: { label: '≥', needsValue: true },
  lt: { label: '<', needsValue: true },
  lte: { label: '≤', needsValue: true },
  isNull: { label: 'Is null', needsValue: false },
  isNotNull: { label: 'Is not null', needsValue: false },
};

const SYNTHETIC_TABLES = new Set(['account_snapshots', 'net_worth_snapshots']);

export default function DataToolbar({
  columns,
  filters,
  search,
  table,
  total,
  onFiltersChange,
  onSearchChange,
  onClearAll,
  onColumnVisibilityChange,
  visibleColumns,
  tableKey,
}: DataToolbarProps) {
  const [showColumnMenu, setShowColumnMenu] = useState(false);
  const [showFilterBuilder, setShowFilterBuilder] = useState(false);
  const [newFilter, setNewFilter] = useState<{ field: string; op: string; value: string }>({
    field: columns[0]?.field ?? '',
    op: 'eq',
    value: '',
  });
  const colMenuRef = useRef<HTMLDivElement>(null);
  const filterRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setNewFilter({ field: columns[0]?.field ?? '', op: 'eq', value: '' });
  }, [columns]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (colMenuRef.current && !colMenuRef.current.contains(e.target as Node)) {
        setShowColumnMenu(false);
      }
      if (filterRef.current && !filterRef.current.contains(e.target as Node)) {
        setShowFilterBuilder(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleAddFilter = useCallback(() => {
    if (!newFilter.field) return;
    onFiltersChange([...filters, { ...newFilter, value: newFilter.value || '' }]);
    setNewFilter({ field: columns[0]?.field ?? '', op: 'eq', value: '' });
    setShowFilterBuilder(false);
  }, [filters, newFilter, onFiltersChange, columns]);

  const handleRemoveFilter = useCallback((idx: number) => {
    onFiltersChange(filters.filter((_, i) => i !== idx));
  }, [filters, onFiltersChange]);

  const handleSyntheticToggle = useCallback(() => {
    const hasSyntheticFilter = filters.some(
      (f) => f.field === 'isSynthetic' && f.op === 'eq' && f.value === 'true'
    );
    if (hasSyntheticFilter) {
      onFiltersChange(filters.filter((f) => !(f.field === 'isSynthetic' && f.op === 'eq')));
    } else {
      onFiltersChange([...filters.filter((f) => f.field !== 'isSynthetic'), { field: 'isSynthetic', op: 'eq', value: 'true' }]);
    }
  }, [filters, onFiltersChange]);

  const isSyntheticOnly = filters.some(
    (f) => f.field === 'isSynthetic' && f.op === 'eq' && f.value === 'true'
  );

  const selectedOp = OPERATORS[newFilter.op] || OPERATORS.eq;
  const booleanColumns = columns.filter((c) => c.type === 'boolean');
  const textColumns = columns.filter((c) => c.type === 'string');
  const numericColumns = columns.filter((c) => c.type === 'number');
  const dateColumns = columns.filter((c) => c.type === 'date');

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 flex-wrap">
        {/* Search */}
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
          <input
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search..."
            className="w-full pl-8 pr-8 py-1.5 text-xs bg-card border border-border rounded-lg text-foreground placeholder-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          />
          {search && (
            <button
              onClick={() => onSearchChange('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 rounded text-muted-foreground hover:text-foreground"
            >
              <X className="h-3 w-3" />
            </button>
          )}
        </div>

        {/* Synthetic toggle */}
        {SYNTHETIC_TABLES.has(tableKey) && (
          <button
            onClick={handleSyntheticToggle}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs rounded-lg border transition-colors ${
              isSyntheticOnly
                ? 'bg-amber-500/20 text-amber-500 border-amber-500/30'
                : 'text-muted-foreground border-border hover:text-foreground hover:bg-muted'
            }`}
          >
            <span className={`w-1.5 h-1.5 rounded-full ${isSyntheticOnly ? 'bg-amber-500' : 'bg-muted-foreground/50'}`} />
            Synthetic only
          </button>
        )}

        {/* Add filter */}
        <div ref={filterRef} className="relative">
          <button
            onClick={() => setShowFilterBuilder(!showFilterBuilder)}
            className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg border border-border transition-colors"
          >
            <Plus className="h-3.5 w-3.5" />
            Filter
          </button>

          {showFilterBuilder && (
            <div className="absolute left-0 top-full mt-1 w-72 bg-card border border-border rounded-lg shadow-xl z-50 p-3 space-y-3">
              <div>
                <label className="block text-[10px] font-medium text-muted-foreground mb-1">Column</label>
                <select
                  value={newFilter.field}
                  onChange={(e) => setNewFilter({ ...newFilter, field: e.target.value })}
                  className="w-full px-2 py-1.5 text-xs bg-background border border-input rounded text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                >
                  {columns.map((c) => (
                    <option key={c.field} value={c.field}>{c.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-[10px] font-medium text-muted-foreground mb-1">Operator</label>
                <select
                  value={newFilter.op}
                  onChange={(e) => setNewFilter({ ...newFilter, op: e.target.value })}
                  className="w-full px-2 py-1.5 text-xs bg-background border border-input rounded text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                >
                  {Object.entries(OPERATORS).map(([key, op]) => (
                    <option key={key} value={key}>{op.label}</option>
                  ))}
                </select>
              </div>
              {selectedOp.needsValue && (
                <div>
                  <label className="block text-[10px] font-medium text-muted-foreground mb-1">Value</label>
                  <input
                    value={newFilter.value}
                    onChange={(e) => setNewFilter({ ...newFilter, value: e.target.value })}
                    placeholder="Enter value..."
                    className="w-full px-2 py-1.5 text-xs bg-background border border-input rounded text-foreground placeholder-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                    onKeyDown={(e) => { if (e.key === 'Enter') handleAddFilter(); }}
                  />
                </div>
              )}
              <button
                onClick={handleAddFilter}
                className="w-full px-3 py-1.5 text-xs font-medium text-primary-foreground bg-primary rounded-lg hover:opacity-90 transition-opacity"
              >
                Add Filter
              </button>
            </div>
          )}
        </div>

        {/* Column visibility */}
        <div ref={colMenuRef} className="relative">
          <button
            onClick={() => setShowColumnMenu(!showColumnMenu)}
            className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg border border-border transition-colors"
          >
            <Settings2 className="h-3.5 w-3.5" />
            Columns
          </button>

          {showColumnMenu && (
            <div className="absolute right-0 top-full mt-1 w-48 bg-card border border-border rounded-lg shadow-xl z-50 py-1">
              <div className="px-3 py-1.5 text-[10px] font-medium text-muted-foreground border-b border-border uppercase tracking-wider">
                Toggle columns
              </div>
              {columns.map((col) => {
                const isVisible = visibleColumns.has(col.field);
                return (
                  <button
                    key={col.field}
                    onClick={() => onColumnVisibilityChange(col.field, !isVisible)}
                    className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-foreground/80 hover:bg-muted transition-colors"
                  >
                    {isVisible ? (
                      <EyeOff className="h-3 w-3 text-muted-foreground" />
                    ) : (
                      <Eye className="h-3 w-3 text-muted-foreground/50" />
                    )}
                    <span className={isVisible ? '' : 'opacity-50'}>{col.label}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Export CSV */}
        <DataExport
          table={tableKey}
          filters={JSON.stringify(filters)}
          search={search}
          columns={columns}
          total={total}
        />

        {/* Clear all */}
        {(filters.length > 0 || search) && (
          <button
            onClick={onClearAll}
            className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg border border-border transition-colors"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Clear
          </button>
        )}
      </div>

      {/* Active filter chips */}
      {filters.length > 0 && (
        <div className="flex items-center gap-1.5 flex-wrap">
          <Filter className="h-3 w-3 text-muted-foreground" />
          {filters.map((f, idx) => {
            const col = columns.find((c) => c.field === f.field);
            const opLabel = OPERATORS[f.op]?.label ?? f.op;
            return (
              <span
                key={idx}
                className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-medium bg-primary/10 text-primary border border-primary/20 rounded-full"
              >
                <span>{col?.label ?? f.field}</span>
                <span className="text-muted-foreground">{opLabel}</span>
                {f.value && <span className="font-mono">&quot;{f.value}&quot;</span>}
                <button
                  onClick={() => handleRemoveFilter(idx)}
                  className="ml-0.5 p-0.5 rounded hover:bg-primary/20 transition-colors"
                >
                  <X className="h-2.5 w-2.5" />
                </button>
              </span>
            );
          })}
        </div>
      )}
    </div>
  );
}
