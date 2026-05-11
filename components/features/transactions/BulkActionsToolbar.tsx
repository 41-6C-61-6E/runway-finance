'use client';

import { useState, useCallback } from 'react';

interface BulkActionsToolbarProps {
  count: number;
  onSelectAll: (ids: string[]) => void;
  onClear: () => void;
}

export default function BulkActionsToolbar({ count, onSelectAll, onClear }: BulkActionsToolbarProps) {
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const handleBulkPatch = useCallback(
    async (updates: Record<string, unknown>) => {
      setActionLoading('patch');
      try {
        await fetch('/api/transactions', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ ids: Array.from({ length: count }, (_, i) => `temp-${i}`), ...updates }),
        });
        onClear();
        window.location.reload();
      } finally {
        setActionLoading(null);
      }
    },
    [count, onClear]
  );

  return (
    <div className="flex items-center gap-3 px-4 py-2.5 bg-primary/5 border border-primary/20 rounded-xl mb-4">
      <span className="text-sm text-primary font-medium">{count} selected</span>
      <div className="h-4 w-px bg-border" />
      <button
        onClick={() => handleBulkPatch({ reviewed: true })}
        disabled={actionLoading !== null}
        className="px-3 py-1.5 text-xs font-medium text-primary bg-primary/10 hover:bg-primary/20 rounded-lg transition-colors disabled:opacity-50"
      >
        Mark Reviewed
      </button>
      <button
        onClick={() => handleBulkPatch({ ignored: true })}
        disabled={actionLoading !== null}
        className="px-3 py-1.5 text-xs font-medium text-muted-foreground bg-muted hover:bg-accent rounded-lg transition-colors disabled:opacity-50"
      >
        Mark Ignored
      </button>
      <div className="flex-1" />
      <button
        onClick={onClear}
        className="px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
      >
        Clear Selection
      </button>
    </div>
  );
}
