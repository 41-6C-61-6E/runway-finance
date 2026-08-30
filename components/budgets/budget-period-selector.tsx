'use client';

import { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import { AppTabs } from '@/components/ui/app-tabs';
import { ChevronLeft, ChevronRight } from 'lucide-react';

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
    const d = new Date(y, m - 1 + 1, 1);
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
    const d = new Date(y, m - 1 - 1, 1);
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

export function BudgetPeriodSelector({ hideTypeTabsOnMobile = false }: { hideTypeTabsOnMobile?: boolean }) {
  const { periodType, periodKey, setPeriodType, goNext, goPrev } = useBudgetPeriod();
  const label = getKeyLabel(periodType, periodKey);

  const tabs = [
    { id: 'monthly', label: 'Monthly' },
    { id: 'quarterly', label: 'Quarterly' },
    { id: 'yearly', label: 'Yearly' },
  ];

  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border/40 mb-5 sm:mb-6 pb-2 sm:pb-0">
      <AppTabs
        tabs={tabs}
        activeTab={periodType}
        onChange={(tabId) => setPeriodType(tabId as PeriodType)}
        variant="underline"
        className={hideTypeTabsOnMobile ? 'hidden lg:flex border-b-0' : 'border-b-0'}
      />
      <div className="flex items-center gap-1 self-start sm:self-center pb-2 sm:pb-2.5">
        <button
          onClick={goPrev}
          className="p-1.5 rounded-md hover:bg-accent text-muted-foreground hover:text-accent-foreground transition-colors"
          aria-label="Previous period"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
        <span className="text-sm font-semibold text-foreground min-w-[130px] text-center select-none">
          {label}
        </span>
        <button
          onClick={goNext}
          className="p-1.5 rounded-md hover:bg-accent text-muted-foreground hover:text-accent-foreground transition-colors"
          aria-label="Next period"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
