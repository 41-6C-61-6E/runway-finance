'use client';

import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';

interface InflowContextValue {
  savedInflows: Record<string, number> | undefined;
  setSavedInflow: (accountId: string, value: number | null) => void;
}

const InflowContext = createContext<InflowContextValue>({
  savedInflows: undefined,
  setSavedInflow: () => {},
});

const STORAGE_KEY = 'rf-goal-saved-inflows-by-account';

export function GoalInflowProvider({ children }: { children: ReactNode }) {
  const [savedInflows, setSavedInflowsState] = useState<Record<string, number> | undefined>(undefined);

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored !== null) {
      try {
        const parsed = JSON.parse(stored);
        if (typeof parsed === 'object' && parsed !== null) {
          // Validate values are numbers
          const cleaned: Record<string, number> = {};
          for (const [k, v] of Object.entries(parsed)) {
            if (typeof v === 'number' && !isNaN(v) && v >= 0) {
              cleaned[k] = v;
            }
          }
          setSavedInflowsState(cleaned);
          return;
        }
      } catch {
        // ignore parse errors
      }
    }
    setSavedInflowsState({});
  }, []);

  const setSavedInflow = useCallback((accountId: string, value: number | null) => {
    setSavedInflowsState((prev) => {
      const next = { ...(prev || {}) };
      if (value !== null) {
        next[accountId] = value;
      } else {
        delete next[accountId];
      }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  return (
    <InflowContext.Provider value={{ savedInflows, setSavedInflow }}>
      {children}
    </InflowContext.Provider>
  );
}

export function useGoalInflow() {
  return useContext(InflowContext);
}
