'use client';

import { createContext, useContext, useEffect, useCallback, type ReactNode } from 'react';
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

  // Backward compatibility migration from old raw key
  useEffect(() => {
    if (typeof window !== 'undefined' && isLoaded && Object.keys(savedInflows).length === 0) {
      try {
        const legacy = localStorage.getItem('rf-goal-saved-inflows-by-account');
        if (legacy) {
          const parsed = JSON.parse(legacy);
          if (parsed && typeof parsed === 'object') {
            setSavedInflowsState(parsed);
          }
        }
      } catch {}
    }
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

  return (
    <InflowContext.Provider value={{ savedInflows: isLoaded ? savedInflows : undefined, setSavedInflow }}>
      {children}
    </InflowContext.Provider>
  );
}

export function useGoalInflow() {
  return useContext(InflowContext);
}
