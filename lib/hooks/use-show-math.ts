'use client';

import { useState, useEffect, useCallback } from 'react';

export function useShowMath() {
  const [enabled, setEnabled] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/user-settings', { credentials: 'include', cache: 'no-store' })
      .then((res) => res.json())
      .then((data) => {
        if (typeof data.showMathEnabled === 'boolean') {
          setEnabled(data.showMathEnabled);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const updateEnabled = useCallback(async (next: boolean) => {
    const prev = enabled;
    setEnabled(next);
    try {
      const res = await fetch('/api/user-settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ showMathEnabled: next }),
      });
      if (!res.ok) throw new Error('Failed to save');
    } catch {
      setEnabled(prev);
    }
  }, [enabled]);

  return { enabled, loading, updateEnabled };
}
