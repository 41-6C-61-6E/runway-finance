'use client';

import React from 'react';
import { SectionHeading } from '@/components/ui/section-heading';
import { Spinner } from '@/components/ui/loading-spinner';
import { Download, Trash2 } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

export interface ImportLog {
  id: string;
  createdAt: string;
  fileName: string;
  importType?: string;
  recordsImported: number;
  status: string;
  startDate?: string | null;
  endDate?: string | null;
  dataStartDate?: string | null;
  dataEndDate?: string | null;
}

interface ImportHistoryTableProps {
  logs: ImportLog[];
  logsLoading: boolean;
  handleDownloadImport: (id: string, fileName: string) => void;
  deleteConfirm: string | null;
  setDeleteConfirm: (id: string | null) => void;
  handleDeleteImport: () => void;
  deleting: boolean;
}

export function ImportHistoryTable({
  logs,
  logsLoading,
  handleDownloadImport,
  deleteConfirm,
  setDeleteConfirm,
  handleDeleteImport,
  deleting,
}: ImportHistoryTableProps) {
  return (
    <>
      <div className="p-3 sm:p-5 bg-card border border-border rounded-xl">
        <SectionHeading className="mb-4">Import History</SectionHeading>

        {logsLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
            <Spinner size="sm" /> Loading...
          </div>
        ) : logs.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4">No imports yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left p-2 text-muted-foreground font-medium">Date</th>
                  <th className="text-left p-2 text-muted-foreground font-medium">File</th>
                  <th className="hidden sm:table-cell text-left p-2 text-muted-foreground font-medium">Type</th>
                  <th className="hidden sm:table-cell text-right p-2 text-muted-foreground font-medium">Records</th>
                  <th className="text-center p-2 text-muted-foreground font-medium">Status</th>
                  <th className="text-right p-2 text-muted-foreground font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log) => (
                  <tr key={log.id} className="border-b border-border/50 hover:bg-muted/20 transition-colors">
                    <td className="p-2 text-foreground whitespace-nowrap">
                      {new Date(log.createdAt).toLocaleDateString()}
                    </td>
                    <td className="p-2 text-foreground max-w-[200px] truncate">
                      <div>{log.fileName}</div>
                      {log.startDate || log.endDate ? (
                        <div className="text-[10px] text-muted-foreground">
                          Filter: {log.startDate ? new Date(log.startDate + 'T00:00:00Z').toLocaleDateString() : 'Start'} - {log.endDate ? new Date(log.endDate + 'T00:00:00Z').toLocaleDateString() : 'End'}
                        </div>
                      ) : log.dataStartDate || log.dataEndDate ? (
                        <div className="text-[10px] text-muted-foreground">
                          Covers: {log.dataStartDate ? new Date(log.dataStartDate + 'T00:00:00Z').toLocaleDateString() : 'Start'} - {log.dataEndDate ? new Date(log.dataEndDate + 'T00:00:00Z').toLocaleDateString() : 'End'}
                        </div>
                      ) : (
                        <div className="text-[10px] text-muted-foreground">All dates</div>
                      )}
                    </td>
                    <td className="hidden sm:table-cell p-2 text-foreground capitalize">
                      {log.importType === 'account_snapshots' ? 'Snapshots' : 'Transactions'}
                    </td>
                    <td className="hidden sm:table-cell p-2 text-foreground text-right">{log.recordsImported}</td>
                    <td className="p-2 text-center">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium ${
                        log.status === 'completed'
                          ? 'bg-chart-1/10 text-chart-1'
                          : log.status === 'partial'
                          ? 'bg-chart-3/10 text-chart-3'
                          : 'bg-destructive/10 text-destructive'
                      }`}>
                        {log.status}
                      </span>
                    </td>
                    <td className="p-2 text-right">
                      <div className="flex items-center justify-end gap-3">
                        {log.status !== 'failed' && (
                          <button
                            onClick={() => handleDownloadImport(log.id, log.fileName)}
                            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                          >
                            <Download className="w-3.5 h-3.5" /> Download
                          </button>
                        )}
                        <button
                          onClick={() => setDeleteConfirm(log.id)}
                          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-destructive transition-colors cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" /> Remove
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteConfirm} onOpenChange={(open) => !open && setDeleteConfirm(null)}>
        <AlertDialogContent className="max-w-sm">
          <AlertDialogHeader>
            <AlertDialogTitle>Remove Imported Data?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete all transactions and account snapshots imported in this batch, as well as clear any synthetically generated balance history dependent on this data. All charts, summaries, and account balances will be recalculated. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <button
              type="button"
              onClick={handleDeleteImport}
              disabled={deleting}
              className="inline-flex h-9 items-center justify-center rounded-lg bg-destructive px-4 py-2 text-sm font-semibold text-destructive-foreground hover:opacity-90 transition-opacity focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 cursor-pointer"
            >
              {deleting ? 'Removing...' : 'Remove Data'}
            </button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

