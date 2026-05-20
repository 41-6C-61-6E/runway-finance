'use client';

import { useState } from 'react';

interface SyncLogEntry {
  id: string;
  timestamp: Date;
  status: 'success' | 'error' | 'info';
  message: string;
  transactionCount?: number;
}

interface SyncLogsProps {
  logs: SyncLogEntry[];
  loading?: boolean;
}

export function SyncLogs({ logs, loading = false }: SyncLogsProps) {
  if (loading) {
    return (
      <div className="border border-gray-200 rounded-lg p-4">
        <div className="animate-pulse space-y-2">
          <div className="h-4 bg-gray-200 rounded w-3/4"></div>
          <div className="h-4 bg-gray-200 rounded w-1/2"></div>
          <div className="h-4 bg-gray-200 rounded w-5/6"></div>
        </div>
      </div>
    );
  }

  if (!logs || logs.length === 0) {
    return (
      <div className="border border-gray-200 rounded-lg p-4 text-center text-gray-500">
        No sync logs available
      </div>
    );
  }

  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden">
      <div className="bg-gray-50 px-4 py-2 border-b border-gray-200">
        <h3 className="font-semibold text-lg">Sync Logs</h3>
      </div>
      <div className="max-h-96 overflow-y-auto">
        {logs.map((log) => (
          <div 
            key={log.id} 
            className="border-b border-gray-100 last:border-b-0 p-4 hover:bg-gray-50 transition-colors"
          >
            <div className="flex justify-between items-start">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <span className={`inline-block w-2 h-2 rounded-full ${
                    log.status === 'success' ? 'bg-green-500' : 
                    log.status === 'error' ? 'bg-red-500' : 'bg-blue-500'
                  }`} />
                  <span className="text-sm text-gray-500">
                    {new Date(log.timestamp).toLocaleString()}
                  </span>
                </div>
                <p className="text-sm">
                  {log.message}
                </p>
                {log.transactionCount !== undefined && (
                  <p className="text-xs text-gray-500 mt-1">
                    Transactions processed: {log.transactionCount}
                  </p>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}