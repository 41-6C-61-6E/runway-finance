'use client';

import { useState, useCallback } from 'react';
import { Download, Loader2 } from 'lucide-react';

interface DataExportProps {
  table: string;
  filters: string;
  search: string | null;
  columns: Array<{ field: string; label: string }>;
  total: number;
}

export default function DataExport({ table, filters, search, columns, total }: DataExportProps) {
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleExport = useCallback(async () => {
    setExporting(true);
    setError(null);
    try {
      const params = new URLSearchParams({ table, limit: '10000', offset: '0' });
      if (filters) params.set('filters', filters);
      if (search) params.set('search', search);

      const res = await fetch(`/api/data-explorer?${params.toString()}`, { credentials: 'include' });
      if (!res.ok) throw new Error('Export failed');

      const json = await res.json();
      const rows = json.data || [];

      if (rows.length === 0) {
        setError('No data to export');
        return;
      }

      const headers = columns.map((c) => c.label);
      const csvRows = [
        headers.join(','),
        ...rows.map((row: Record<string, unknown>) =>
          columns.map((c) => {
            const val = row[c.field];
            if (val === null || val === undefined) return '';
            const str = String(val);
            return str.includes(',') || str.includes('"') || str.includes('\n')
              ? `"${str.replace(/"/g, '""')}"`
              : str;
          }).join(',')
        ),
      ];

      const csv = csvRows.join('\n');
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${table}_${new Date().toISOString().split('T')[0]}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Export failed');
    } finally {
      setExporting(false);
    }
  }, [table, filters, search, columns]);

  return (
    <div className="relative">
      <button
        onClick={handleExport}
        disabled={exporting || total === 0}
        className="flex items-center gap-1.5 px-2.5 py-1 text-xs text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        title="Export CSV"
      >
        {exporting ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <Download className="h-3.5 w-3.5" />
        )}
        Export CSV
      </button>
      {error && (
        <div className="absolute top-full right-0 mt-1 px-2 py-1 text-xs text-destructive bg-destructive/10 border border-destructive/20 rounded whitespace-nowrap z-10">
          {error}
        </div>
      )}
    </div>
  );
}
