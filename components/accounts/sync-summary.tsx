'use client';

import { useState } from 'react';

// Simplified component without UI dependencies
interface SimpleFinConnection {
  id: string;
  label: string;
  lastSyncAt: string | Date | null;
  lastSyncStatus: string | null;
  lastSyncError: string | null;
  syncFrequency: string;
}

interface SyncSummaryProps {
  connection: SimpleFinConnection | null;
  onSync?: (connectionId?: string) => Promise<void>;
  showSyncButton?: boolean;
  compact?: boolean;
}

export function SyncSummary({ 
  connection, 
  onSync,
  showSyncButton = true,
  compact = false 
}: SyncSummaryProps) {
  const [loading, setLoading] = useState(false);

  const handleSync = async () => {
    if (!connection || !onSync) return;
    
    setLoading(true);
    try {
      await onSync(connection.id);
    } finally {
      setLoading(false);
    }
  };

  if (!connection) {
    return null;
  }

  const lastSyncDate = connection.lastSyncAt ? new Date(connection.lastSyncAt) : null;
  const isSyncSuccess = connection.lastSyncStatus === 'ok';
  const isSyncError = connection.lastSyncStatus === 'error';

  return (
    <div className={compact ? 'border-none shadow-none bg-transparent' : 'border border-gray-200 rounded-lg'}>
      {compact ? (
        <div className="p-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className={`inline-block w-2 h-2 rounded-full ${
                isSyncSuccess ? 'bg-green-500' : isSyncError ? 'bg-red-500' : 'bg-gray-400'
              }`} />
              <span className="text-xs text-gray-500">
                {lastSyncDate ? lastSyncDate.toLocaleDateString() : 'Never'}
              </span>
            </div>
            {showSyncButton && (
              <button 
                onClick={handleSync}
                disabled={loading}
                className="text-xs px-2 py-1 bg-blue-100 text-blue-700 rounded hover:bg-blue-200 disabled:opacity-50"
              >
                {loading ? 'Syncing...' : 'Sync'} 
              </button>
            )}
          </div>
        </div>
      ) : (
        <div>
          <div className="p-4 border-b border-gray-200">
            <div className="flex justify-between items-center">
              <h3 className="text-lg font-semibold">Sync Status</h3>
              {showSyncButton && (
                <button 
                  onClick={handleSync}
                  disabled={loading}
                  className="px-3 py-1 bg-blue-600 text-white text-sm rounded hover:bg-blue-700 disabled:opacity-50"
                >
                  {loading ? 'Syncing...' : 'Sync Now'} 
                </button>
              )}
            </div>
          </div>
          <div className="p-4">
            <div className="space-y-3">
              <div className="flex justify-between">
                <span className="text-sm font-medium">Connection</span>
                <span className="text-sm">{connection.label}</span>
              </div>
              
              <div className="flex justify-between">
                <span className="text-sm font-medium">Sync Frequency</span>
                <span className="text-sm bg-gray-100 px-2 py-1 rounded text-xs">
                  {connection.syncFrequency.charAt(0).toUpperCase() + connection.syncFrequency.slice(1)}
                </span>
              </div>
              
              <div className="flex justify-between">
                <span className="text-sm font-medium">Last Sync</span>
                <span className="text-sm">
                  {lastSyncDate ? lastSyncDate.toLocaleDateString() : 'Never'}
                </span>
              </div>
              
              <div className="flex justify-between">
                <span className="text-sm font-medium">Status</span>
                <span className={`text-xs px-2 py-1 rounded ${
                  isSyncSuccess ? 'bg-green-100 text-green-800' : 
                  isSyncError ? 'bg-red-100 text-red-800' : 'bg-gray-100 text-gray-800'
                }`}>
                  {isSyncSuccess ? 'Success' : isSyncError ? 'Error' : 'Pending'}
                </span>
              </div>
              
              {connection.lastSyncError && (
                <div className="pt-2">
                  <p className="text-xs text-red-600 font-medium">Last Error</p>
                  <p className="text-xs text-red-600">{connection.lastSyncError}</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}