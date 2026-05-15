'use client';

import { useState, useEffect, useCallback } from 'react';

export function useReduceTransparency() {
  const [reduceTransparency, setReduceTransparency] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/user-settings', { credentials: 'include', cache: 'no-store' })
      .then((res) => res.json())
      .then((data) => {
        const val = data.reduceTransparency === true;
        setReduceTransparency(val);
        applyReduceTransparency(val);
      })
      .catch(() => {
        applyReduceTransparency(false);
      })
      .finally(() => setLoading(false));
  }, []);

  const updateReduceTransparency = useCallback(async (val: boolean) => {
    setReduceTransparency(val);
    applyReduceTransparency(val);
    await fetch('/api/user-settings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ reduceTransparency: val }),
    });
  }, []);

  return { reduceTransparency, loading, updateReduceTransparency };
}

function applyReduceTransparency(val: boolean) {
  if (val) {
    document.documentElement.classList.add('reduce-transparency');
  } else {
    document.documentElement.classList.remove('reduce-transparency');
  }
}
