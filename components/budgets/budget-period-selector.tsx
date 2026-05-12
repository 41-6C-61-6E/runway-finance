'use client';

import { createContext, useContext, useState, useCallback, ReactNode } from 'react';

export type PeriodType = 'monthly' | 'quarterly' | 'yearly';

interface PeriodContextType {
  periodType: PeriodType;
  periodKey: string;
  setPeriodType: (type: PeriodType) => void;
  setPeriodKey: (key: string) => void;
  goNext: () => void;
  goPrev: () => void;
}

const PeriodContext = createContext<PeriodContextType | null>(null);

export function useBudgetPeriod() {
  const ctx = useContext(PeriodContext);
  if (!ctx) throw new Error('useBudgetPeriod must be used within BudgetPeriodProvider');
  return ctx;
}

function getCurrentKey(type: PeriodType): string {
  const now = new Date();
  if (type === 'monthly') return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  if (type === 'quarterly') {
    const q = Math.floor(now.getMonth() / 3) + 1;
    return `${now.getFullYear()}-Q${q}`;
  }
  return String(now.getFullYear());
}

function getNextKey(type: PeriodType, key: string): string {
  if (type === 'monthly') {
    const [y, m] = key.split('-').map(Number);
    const d = new Date(y, m);
    d.setMonth(d.getMonth() + 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  }
  if (type === 'quarterly') {
    const [y, q] = key.split('-Q').map(Number);
    if (q === 4) return `${y + 1}-Q1`;
    return `${y}-Q${q + 1}`;
  }
  return String(parseInt(key) + 1);
}

function getPrevKey(type: PeriodType, key: string): string {
  if (type === 'monthly') {
    const [y, m] = key.split('-').map(Number);
    const d = new Date(y, m - 2);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  }
  if (type === 'quarterly') {
    const [y, q] = key.split('-Q').map(Number);
    if (q === 1) return `${y - 1}-Q4`;
    return `${y}-Q${q - 1}`;
  }
  return String(parseInt(key) - 1);
}

function getKeyLabel(type: PeriodType, key: string): string {
  if (type === 'monthly') {
    const [y, m] = key.split('-').map(Number);
    return new Date(y, m - 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  }
  if (type === 'quarterly') return `Q${key.split('-Q')[1]} ${key.split('-Q')[0]}`;
  return key;
}

export function BudgetPeriodProvider({ children }: { children: ReactNode }) {
  const [periodType, setPeriodType] = useState<PeriodType>('monthly');
  const [periodKey, setPeriodKey] = useState(() => getCurrentKey('monthly'));

  const handleSetPeriodType = useCallback((type: PeriodType) => {
    setPeriodType(type);
    setPeriodKey(getCurrentKey(type));
  }, []);

  const goNext = useCallback(() => setPeriodKey((k) => getNextKey(periodType, k)), [periodType]);
  const goPrev = useCallback(() => setPeriodKey((k) => getPrevKey(periodType, k)), [periodType]);

  return (
    <PeriodContext.Provider value={{ periodType, periodKey, setPeriodType: handleSetPeriodType, setPeriodKey, goNext, goPrev }}>
      {children}
    </PeriodContext.Provider>
  );
}

export function BudgetPeriodSelector() {
  const { periodType, periodKey, setPeriodType, goNext, goPrev } = useBudgetPeriod();
  const label = getKeyLabel(periodType, periodKey);

  return (
    <div className="flex items-center gap-2">
      <div className="flex bg-muted rounded-lg p-0.5">
        {(['monthly', 'quarterly', 'yearly'] as PeriodType[]).map((type) => (
          <button
            key={type}
            onClick={() => setPeriodType(type)}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all capitalize ${
              periodType === type
                ? 'bg-card text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {type}
          </button>
        ))}
      </div>
      <div className="flex items-center gap-1">
        <button onClick={goPrev} className="p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
        </button>
        <span className="text-sm font-medium text-foreground min-w-[140px] text-center">{label}</span>
        <button onClick={goNext} className="p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
        </button>
      </div>
    </div>
  );
}
