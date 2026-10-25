'use client';

import { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import { usePersistentState } from '@/lib/hooks/use-persistent-state';
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

export function isValidPeriodKey(type: PeriodType, key: string | null | undefined): boolean {
  if (!key || typeof key !== 'string') return false;
  if (key === 'undefined' || key === 'null' || key.includes('NaN')) return false;
  if (type === 'monthly') return /^\d{4}-(0[1-9]|1[0-2])$/.test(key);
  if (type === 'quarterly') return /^\d{4}-Q[1-4]$/.test(key);
  if (type === 'yearly') return /^\d{4}$/.test(key);
  return false;
}

export function getCurrentKey(type: PeriodType, refDate = new Date()): string {
  const y = refDate.getFullYear();
  if (type === 'monthly') return `${y}-${String(refDate.getMonth() + 1).padStart(2, '0')}`;
  if (type === 'quarterly') {
    const q = Math.floor(refDate.getMonth() / 3) + 1;
    return `${y}-Q${q}`;
  }
  return String(y);
}

export function convertPeriodKeyForType(currentKey: string | null | undefined, targetType: PeriodType): string {
  const now = new Date();
  if (!currentKey || typeof currentKey !== 'string' || currentKey === 'undefined' || currentKey === 'null' || currentKey.includes('NaN')) {
    return getCurrentKey(targetType, now);
  }

  if (isValidPeriodKey(targetType, currentKey)) {
    return currentKey;
  }

  const yearMatch = currentKey.match(/^(\d{4})/);
  const y = yearMatch ? parseInt(yearMatch[1], 10) : now.getFullYear();

  if (targetType === 'yearly') {
    return String(y);
  }

  if (targetType === 'quarterly') {
    const mMatch = currentKey.match(/^\d{4}-(0[1-9]|1[0-2])$/);
    if (mMatch) {
      const m = parseInt(mMatch[1], 10);
      const q = Math.floor((m - 1) / 3) + 1;
      return `${y}-Q${q}`;
    }
    const qMatch = currentKey.match(/-Q([1-4])/);
    if (qMatch) {
      return `${y}-Q${qMatch[1]}`;
    }
    const q = y === now.getFullYear() ? Math.floor(now.getMonth() / 3) + 1 : 1;
    return `${y}-Q${q}`;
  }

  // targetType === 'monthly'
  const qMatch = currentKey.match(/^(\d{4})-Q([1-4])$/);
  if (qMatch) {
    const q = parseInt(qMatch[2], 10);
    const m = (q - 1) * 3 + 1;
    return `${y}-${String(m).padStart(2, '0')}`;
  }
  const m = y === now.getFullYear() ? now.getMonth() + 1 : 1;
  return `${y}-${String(m).padStart(2, '0')}`;
}

export function getNextKey(type: PeriodType, key: string): string {
  const safeKey = isValidPeriodKey(type, key) ? key : convertPeriodKeyForType(key, type);
  if (type === 'monthly') {
    const [y, m] = safeKey.split('-').map(Number);
    const d = new Date(y, m - 1 + 1, 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  }
  if (type === 'quarterly') {
    const [y, q] = safeKey.split('-Q').map(Number);
    if (q === 4) return `${y + 1}-Q1`;
    return `${y}-Q${q + 1}`;
  }
  const y = parseInt(safeKey, 10) || new Date().getFullYear();
  return String(y + 1);
}

export function getPrevKey(type: PeriodType, key: string): string {
  const safeKey = isValidPeriodKey(type, key) ? key : convertPeriodKeyForType(key, type);
  if (type === 'monthly') {
    const [y, m] = safeKey.split('-').map(Number);
    const d = new Date(y, m - 1 - 1, 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  }
  if (type === 'quarterly') {
    const [y, q] = safeKey.split('-Q').map(Number);
    if (q === 1) return `${y - 1}-Q4`;
    return `${y}-Q${q - 1}`;
  }
  const y = parseInt(safeKey, 10) || new Date().getFullYear();
  return String(y - 1);
}

export function getKeyLabel(type: PeriodType, key: string): string {
  if (!key || typeof key !== 'string' || key === 'undefined' || key === 'null' || key.includes('NaN')) {
    return getKeyLabel(type, getCurrentKey(type));
  }
  if (type === 'monthly') {
    const match = key.match(/^(\d{4})-(0[1-9]|1[0-2])$/);
    if (match) {
      const y = Number(match[1]);
      const m = Number(match[2]);
      return new Date(y, m - 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    }
    const safeKey = convertPeriodKeyForType(key, 'monthly');
    const [y, m] = safeKey.split('-').map(Number);
    return new Date(y, m - 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  }
  if (type === 'quarterly') {
    const match = key.match(/^(\d{4})-Q([1-4])$/);
    if (match) {
      return `Q${match[2]} ${match[1]}`;
    }
    const safeKey = convertPeriodKeyForType(key, 'quarterly');
    const match2 = safeKey.match(/^(\d{4})-Q([1-4])$/);
    if (match2) {
      return `Q${match2[2]} ${match2[1]}`;
    }
    return safeKey;
  }
  const match = key.match(/^(\d{4})$/);
  if (match) return match[1];
  return convertPeriodKeyForType(key, 'yearly');
}

export function BudgetPeriodProvider({ children }: { children: ReactNode }) {
  const [periodType, setPeriodType] = usePersistentState<PeriodType>('finance:budgets:periodType', 'monthly');
  const [storedPeriodKey, setStoredPeriodKey] = usePersistentState<string>('finance:budgets:periodKey', getCurrentKey('monthly'));

  // Ensure periodKey provided to components is always strictly valid for active periodType
  const periodKey = isValidPeriodKey(periodType, storedPeriodKey)
    ? storedPeriodKey
    : convertPeriodKeyForType(storedPeriodKey, periodType);

  // Reconcile stored value if it was mismatched or invalid
  const handleSetPeriodKey = useCallback((newKey: string | ((prev: string) => string)) => {
    setStoredPeriodKey((prev) => {
      const resolved = typeof newKey === 'function' ? newKey(prev) : newKey;
      return isValidPeriodKey(periodType, resolved) ? resolved : convertPeriodKeyForType(resolved, periodType);
    });
  }, [periodType, setStoredPeriodKey]);

  const handleSetPeriodType = useCallback((type: PeriodType) => {
    setPeriodType(type);
    setStoredPeriodKey((prevKey) => convertPeriodKeyForType(prevKey, type));
  }, [setPeriodType, setStoredPeriodKey]);

  const goNext = useCallback(() => handleSetPeriodKey((k) => getNextKey(periodType, k)), [periodType, handleSetPeriodKey]);
  const goPrev = useCallback(() => handleSetPeriodKey((k) => getPrevKey(periodType, k)), [periodType, handleSetPeriodKey]);

  return (
    <PeriodContext.Provider value={{ periodType, periodKey, setPeriodType: handleSetPeriodType, setPeriodKey: handleSetPeriodKey, goNext, goPrev }}>
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
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border/40 mb-3 sm:mb-3.5 pb-2 sm:pb-0">
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
          className="-m-3.5 p-3.5 rounded-md hover:bg-accent text-muted-foreground hover:text-accent-foreground transition-colors"
          aria-label="Previous period"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
        <span className="text-sm font-semibold text-foreground min-w-[130px] text-center select-none">
          {label}
        </span>
        <button
          onClick={goNext}
          className="-m-3.5 p-3.5 rounded-md hover:bg-accent text-muted-foreground hover:text-accent-foreground transition-colors"
          aria-label="Next period"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
