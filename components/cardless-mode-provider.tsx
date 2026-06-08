'use client';

import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';

type CardlessModeContextType = {
  cardlessMode: boolean;
  toggleCardlessMode: () => Promise<void>;
  loading: boolean;
};

const CardlessModeContext = createContext<CardlessModeContextType | null>(null);

export function CardlessModeProvider({ children }: { children: ReactNode }) {
  const [cardlessMode, setCardlessMode] = useState(false);
  const [loading, setLoading] = useState(true);

  const fetchSetting = useCallback(async () => {
    try {
      const res = await fetch('/api/user-settings', { credentials: 'include', cache: 'no-store' });
      if (res.ok) {
        const data = await res.json();
        setCardlessMode(data.cardlessMode === true);
      }
    } catch {
      setCardlessMode(false);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSetting();
  }, [fetchSetting]);

  useEffect(() => {
    if (loading) return;
    if (cardlessMode) {
      document.documentElement.classList.add('cardless-mode');
    } else {
      document.documentElement.classList.remove('cardless-mode');
    }
  }, [cardlessMode, loading]);

  const toggleCardlessMode = useCallback(async () => {
    const newMode = !cardlessMode;
    setCardlessMode(newMode);
    try {
      await fetch('/api/user-settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ cardlessMode: newMode }),
      });
    } catch {
      setCardlessMode(!newMode);
    }
  }, [cardlessMode]);

  return (
    <CardlessModeContext.Provider value={{ cardlessMode, toggleCardlessMode, loading }}>
      {children}
    </CardlessModeContext.Provider>
  );
}

export function useCardlessMode() {
  const context = useContext(CardlessModeContext);
  if (!context) {
    throw new Error('useCardlessMode must be used within a CardlessModeProvider');
  }
  return context;
}
