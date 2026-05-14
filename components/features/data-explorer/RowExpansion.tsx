'use client';

import { useCallback, useState } from 'react';
import { Copy, Check, ExternalLink } from 'lucide-react';
import JsonViewer from './JsonViewer';

type ColumnMeta = {
  field: string;
  label: string;
  type: 'string' | 'number' | 'boolean' | 'date' | 'json';
  nullable: boolean;
};

interface RowExpansionProps {
  row: Record<string, unknown>;
  columns: ColumnMeta[];
  onNavigate: (table: string, filterField: string, filterValue: string) => void;
}

const NAVIGABLE_FIELDS = ['account_id', 'category_id', 'connection_id', 'fire_scenario_id', 'funding_account_id', 'linked_account_id'];

export default function RowExpansion({ row, columns, onNavigate }: RowExpansionProps) {
  return (
    <div className="border-t border-b border-border/50 bg-muted/10">
      <div className="grid grid-cols-[200px_1fr] gap-x-4 gap-y-2 p-4 text-xs">
        {columns.map((col) => {
          const value = row[col.field];
          const isNavigable = NAVIGABLE_FIELDS.includes(col.field) && typeof value === 'string';
          return (
            <div key={col.field} className="contents">
              <div className="text-muted-foreground font-medium truncate self-start pt-0.5">{col.label}</div>
              <div className="min-w-0">
                <CellValue
                  field={col.field}
                  value={value}
                  type={col.type}
                  nullable={col.nullable}
                  isNavigable={isNavigable}
                  onNavigate={onNavigate}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function CellValue({
  field,
  value,
  type,
  nullable,
  isNavigable,
  onNavigate,
}: {
  field: string;
  value: unknown;
  type: string;
  nullable: boolean;
  isNavigable: boolean;
  onNavigate: (table: string, filterField: string, filterValue: string) => void;
}) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async (val: string) => {
    try {
      await navigator.clipboard.writeText(val);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {}
  }, []);

  const handleNavigate = useCallback(() => {
    if (isNavigable && typeof value === 'string') {
      const targetTable = field === 'account_id' ? 'accounts' :
        field === 'category_id' ? 'categories' :
        field === 'connection_id' ? 'simplefin_connections' :
        field === 'fire_scenario_id' ? 'fire_scenarios' :
        field === 'funding_account_id' ? 'accounts' :
        field === 'linked_account_id' ? 'accounts' :
        field.replace(/_id$/, 's');
      onNavigate(targetTable, 'id', value as string);
    }
  }, [field, value, isNavigable, onNavigate]);

  if (value === null || value === undefined) {
    return <span className="text-muted-foreground/50 italic">—</span>;
  }

  if (type === 'json') {
    return <JsonViewer data={value} defaultExpanded />;
  }

  if (type === 'boolean') {
    return (
      <span className={`inline-flex items-center px-2 py-0.5 text-[10px] font-medium rounded-full ${
        value ? 'bg-amber-500/20 text-amber-500' : 'bg-emerald-500/20 text-emerald-500'
      }`}>
        {value ? 'True' : 'False'}
      </span>
    );
  }

  if (isNavigable) {
    return (
      <div className="flex items-center gap-1.5 group">
        <code className="text-primary font-mono text-[11px]">{String(value)}</code>
        <button
          onClick={handleNavigate}
          className="p-0.5 rounded text-muted-foreground/50 hover:text-primary hover:bg-primary/10 opacity-0 group-hover:opacity-100 transition-opacity"
          title="View related record"
        >
          <ExternalLink className="h-3 w-3" />
        </button>
        <button
          onClick={() => handleCopy(String(value))}
          className="p-0.5 rounded text-muted-foreground/50 hover:text-foreground hover:bg-muted opacity-0 group-hover:opacity-100 transition-opacity"
          title="Copy value"
        >
          {copied ? <Check className="h-3 w-3 text-chart-1" /> : <Copy className="h-3 w-3" />}
        </button>
      </div>
    );
  }

  const display = type === 'date'
    ? new Date(value as string).toLocaleDateString()
    : type === 'number'
    ? new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 4 }).format(Number(value))
    : String(value);

  return (
    <div className="flex items-center gap-1.5 group">
      <span className={`font-mono text-[11px] ${type === 'number' ? 'tabular-nums' : ''}`}>{display}</span>
      <button
        onClick={() => handleCopy(String(value))}
        className="p-0.5 rounded text-muted-foreground/50 hover:text-foreground hover:bg-muted opacity-0 group-hover:opacity-100 transition-opacity"
        title="Copy value"
      >
        {copied ? <Check className="h-3 w-3 text-chart-1" /> : <Copy className="h-3 w-3" />}
      </button>
    </div>
  );
}
