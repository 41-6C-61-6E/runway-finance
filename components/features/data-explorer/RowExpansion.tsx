'use client';

import { useCallback, useState } from 'react';
import { Copy, Check, ExternalLink, Trash2, AlertTriangle, Loader2 } from 'lucide-react';
import JsonViewer from './JsonViewer';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

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
  tableKey?: string;
  onRowDeleted?: () => void;
}

const NAVIGABLE_FIELDS = ['account_id', 'category_id', 'connection_id', 'fire_scenario_id', 'funding_account_id', 'linked_account_id'];

export default function RowExpansion({ row, columns, onNavigate, tableKey, onRowDeleted }: RowExpansionProps) {
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const handleDelete = useCallback(async () => {
    if (!tableKey || !row.id) return;
    setIsDeleting(true);
    setDeleteError(null);
    try {
      const res = await fetch(`/api/data-explorer?table=${tableKey}&id=${row.id}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      if (!res.ok) {
        let errMsg = `Failed to delete record (${res.status})`;
        try {
          const err = await res.json();
          errMsg = err.message || err.error || errMsg;
        } catch {}
        throw new Error(errMsg);
      }
      setShowDeleteConfirm(false);
      if (onRowDeleted) {
        onRowDeleted();
      }
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsDeleting(false);
    }
  }, [tableKey, row.id, onRowDeleted]);

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

      {tableKey && row.id && (
        <>
          <div className="border-t border-border/30 px-4 py-3 flex items-center justify-between bg-muted/5">
            <span className="text-xs text-muted-foreground">
              Record ID: <code className="font-mono bg-muted px-1.5 py-0.5 rounded text-[11px] select-all">{String(row.id || '')}</code>
            </span>
            <button
              onClick={() => {
                setDeleteError(null);
                setShowDeleteConfirm(true);
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-destructive hover:bg-destructive/10 border border-destructive/20 hover:border-destructive/30 rounded-lg transition-colors cursor-pointer"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Delete Entry
            </button>
          </div>

          <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
            <AlertDialogContent className="max-w-md">
              <AlertDialogHeader>
                <AlertDialogTitle className="flex items-center gap-2 text-destructive">
                  <AlertTriangle className="h-5 w-5 flex-shrink-0" />
                  Delete Database Entry
                </AlertDialogTitle>
                <AlertDialogDescription className="space-y-3 pt-2">
                  <p className="font-medium text-foreground">
                    Warning: This is a direct database delete operation and is highly dangerous.
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Deleting this entry from the <strong className="text-foreground">{tableKey}</strong> table can cause database integrity issues, broken foreign key references, or missing balance history.
                  </p>
                  <div className="text-xs text-muted-foreground bg-muted p-3 rounded border border-border space-y-1 font-mono">
                    <div><strong>ID:</strong> {String(row.id)}</div>
                    <div><strong>Table:</strong> {tableKey}</div>
                  </div>
                  <p className="font-medium text-foreground text-sm">
                    Are you sure you want to permanently delete this entry?
                  </p>
                  {deleteError && (
                    <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-lg text-xs text-destructive font-medium break-words">
                      Error: {deleteError}
                    </div>
                  )}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter className="mt-4">
                <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
                <button
                  onClick={handleDelete}
                  disabled={isDeleting}
                  className="inline-flex h-9 items-center justify-center rounded-lg bg-destructive px-4 py-2 text-sm font-semibold text-destructive-foreground hover:opacity-90 transition-opacity disabled:opacity-50 gap-1.5 cursor-pointer"
                >
                  {isDeleting ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      Deleting...
                    </>
                  ) : (
                    'Confirm Delete'
                  )}
                </button>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </>
      )}
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
