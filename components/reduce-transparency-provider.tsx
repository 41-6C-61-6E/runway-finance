'use client';

import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';

type ReduceTransparencyContextType = {
  reduceTransparency: boolean;
  updateReduceTransparency: (val: boolean) => Promise<void>;
  loading: boolean;
};

const ReduceTransparencyContext = createContext<ReduceTransparencyContextType | null>(null);

export function ReduceTransparencyProvider({ children }: { children: ReactNode }) {
  const [reduceTransparency, setReduceTransparency] = useState(false);
  const [loading, setLoading] = useState(true);

  const fetchSetting = useCallback(async () => {
    try {
      const res = await fetch('/api/user-settings', { credentials: 'include', cache: 'no-store' });
      if (res.ok) {
        const data = await res.json();
        setReduceTransparency(data.reduceTransparency === true);
      }
    } catch {
      setReduceTransparency(false);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSetting();
  }, [fetchSetting]);

  const updateReduceTransparency = useCallback(async (val: boolean) => {
    setReduceTransparency(val);
    try {
      await fetch('/api/user-settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ reduceTransparency: val }),
      });
    } catch {
      setReduceTransparency(!val);
    }
  }, []);

  return (
    <ReduceTransparencyContext.Provider value={{ reduceTransparency, updateReduceTransparency, loading }}>
      {children}
    </ReduceTransparencyContext.Provider>
  );
}

export function useReduceTransparency() {
  const context = useContext(ReduceTransparencyContext);
  if (!context) {
    throw new Error('useReduceTransparency must be used within a ReduceTransparencyProvider');
  }
  return context;
}
