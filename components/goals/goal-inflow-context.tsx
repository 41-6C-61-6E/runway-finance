'use client';

import { createContext, useContext, useEffect, useCallback, useMemo, useRef, type ReactNode } from 'react';
import { usePersistentState } from '@/lib/hooks/use-persistent-state';

interface InflowContextValue {
  savedInflows: Record<string, number> | undefined;
  setSavedInflow: (accountId: string, value: number | null) => void;
}

const InflowContext = createContext<InflowContextValue>({
  savedInflows: undefined,
  setSavedInflow: () => {},
});

export function GoalInflowProvider({ children }: { children: ReactNode }) {
  const [savedInflows, setSavedInflowsState, isLoaded] = usePersistentState<Record<string, number>>(
    'finance:goals:savedInflows',
    {}
  );

  // Backward compatibility migration from old raw key:
  // Run once on load, migrate non-empty valid numbers, and always clean up legacy key to prevent infinite loops.
  const hasMigrated = useRef(false);
  useEffect(() => {
    if (typeof window === 'undefined' || !isLoaded || hasMigrated.current) return;
    hasMigrated.current = true;

    try {
      const legacy = localStorage.getItem('rf-goal-saved-inflows-by-account');
      if (legacy) {
        localStorage.removeItem('rf-goal-saved-inflows-by-account');
        const parsed = JSON.parse(legacy);
        if (parsed && typeof parsed === 'object') {
          const cleaned: Record<string, number> = {};
          for (const [k, v] of Object.entries(parsed)) {
            if (typeof v === 'number' && !isNaN(v) && v >= 0) {
              cleaned[k] = v;
            }
          }
          if (Object.keys(cleaned).length > 0 && Object.keys(savedInflows || {}).length === 0) {
            setSavedInflowsState(cleaned);
          }
        }
      }
    } catch {}
  }, [isLoaded, savedInflows, setSavedInflowsState]);

  const setSavedInflow = useCallback(
    (accountId: string, value: number | null) => {
      setSavedInflowsState((prev) => {
        const next = { ...(prev || {}) };
        if (value !== null) {
          next[accountId] = value;
        } else {
          delete next[accountId];
        }
        return next;
      });
    },
    [setSavedInflowsState]
  );

  const contextValue = useMemo(
    () => ({ savedInflows: isLoaded ? savedInflows : undefined, setSavedInflow }),
    [isLoaded, savedInflows, setSavedInflow]
  );

  return (
    <InflowContext.Provider value={contextValue}>
      {children}
    </InflowContext.Provider>
  );
}

export function useGoalInflow() {
  return useContext(InflowContext);
}
