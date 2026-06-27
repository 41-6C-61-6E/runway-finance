'use client';

import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';

interface InflowContextValue {
  savedInflow: number | null | undefined;
  setSavedInflow: (value: number | null) => void;
}

const InflowContext = createContext<InflowContextValue>({
  savedInflow: undefined,
  setSavedInflow: () => {},
});

const STORAGE_KEY = 'rf-goal-saved-inflow';

export function GoalInflowProvider({ children }: { children: ReactNode }) {
  const [savedInflow, setSavedInflowState] = useState<number | null | undefined>(undefined);

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored !== null) {
      const parsed = parseFloat(stored);
      if (!isNaN(parsed) && parsed >= 0) {
        setSavedInflowState(parsed);
        return;
      }
    }
    setSavedInflowState(null);
  }, []);

  const setSavedInflow = useCallback((value: number | null) => {
    setSavedInflowState(value);
    if (value !== null) {
      localStorage.setItem(STORAGE_KEY, String(value));
    } else {
      localStorage.removeItem(STORAGE_KEY);
    }
  }, []);

  return (
    <InflowContext.Provider value={{ savedInflow, setSavedInflow }}>
      {children}
    </InflowContext.Provider>
  );
}

export function useGoalInflow() {
  return useContext(InflowContext);
}
