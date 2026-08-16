'use client';

import React from 'react';
import { RefreshCw, Clock, CheckCircle2, AlertCircle } from 'lucide-react';
import { formatRelativeTime } from '@/lib/utils/sync';
import { cn } from '@/lib/utils';

export interface SyncControlsProps {
  lastSyncAt: string | null | undefined;
  syncFrequency?: string;
  isSyncing?: boolean;
  syncError?: string | null;
  onSyncNow?: () => Promise<void> | void;
  className?: string;
}

export function SyncControls({
  lastSyncAt,
  isSyncing = false,
  syncError,
  onSyncNow,
  className,
}: SyncControlsProps) {
  return (
    <div className={cn('flex items-center gap-3', className)}>
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        {syncError ? (
          <AlertCircle className="w-3.5 h-3.5 text-destructive shrink-0" />
        ) : (
          <Clock className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
        )}
        <span>Last synced: {formatRelativeTime(lastSyncAt)}</span>
      </div>

      {onSyncNow && (
        <button
          type="button"
          onClick={onSyncNow}
          disabled={isSyncing}
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary hover:text-primary/80 transition-colors disabled:opacity-50 cursor-pointer"
        >
          <RefreshCw className={cn('w-3.5 h-3.5', isSyncing && 'animate-spin')} />
          <span>{isSyncing ? 'Syncing...' : 'Sync Now'}</span>
        </button>
      )}
    </div>
  );
}
