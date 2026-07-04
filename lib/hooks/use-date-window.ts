'use client';

import { useMemo, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import type { TimeRange } from '@/components/charts/chart-filters';
import { usePersistentState } from './use-persistent-state';
import { getCurrentMonth, getMonthRange, getPreciseDateRange, getPeriodLabel, snapToPeriod } from '@/lib/utils/date-window';

const WINDOW_SPAN: Record<string, number> = { '1m': 1, '3m': 3, '6m': 6, '1y': 12, 'ytd': 12, '5y': 60 };
const MONTHS_BACK: Record<string, number> = { '1m': 0, '3m': 2, '6m': 5, '1y': 11, '5y': 59 };

export interface DateWindowState {
  timeframe: TimeRange;
  setTimeframe: (tf: TimeRange) => void;
  windowEnd: string;
  setWindowEnd: (ym: string) => void;
  prevWindow: () => void;
  nextWindow: () => void;
  isNextDisabled: boolean;
  windowLabel: string;
  monthRange: { start: string; end: string };
  dateRange: { start: string; end: string };
  periodOptions: { label: string; value: string }[];
  showWindowNav: boolean;
}

export function useDateWindow(
  timeframeKey: string | null,
  windowEndKey: string,
  defaultTimeframe: TimeRange = '1m',
  controlledTimeframe?: TimeRange,
): DateWindowState {
  const currentMonth = getCurrentMonth();
  const searchParams = useSearchParams();

  const [timeframeState, _setTimeframe] = usePersistentState<TimeRange>(timeframeKey || '', defaultTimeframe);
  const [windowEnd, setWindowEnd] = usePersistentState<string>(windowEndKey, currentMonth);

  const timeframe = controlledTimeframe !== undefined ? controlledTimeframe : timeframeState;

  const setTimeframe = (tf: TimeRange) => {
    if (controlledTimeframe === undefined) {
      _setTimeframe(tf);
    }
    setWindowEnd(snapToPeriod(windowEnd, tf));
  };

  useEffect(() => {
    if (searchParams) {
      const paramTf = searchParams.get('timeframe') as TimeRange | null;
      const validTfs: TimeRange[] = ['1d', '7d', '30d', '1m', '3m', '6m', '1y', '365d', '5y', 'ytd', 'all'];
      if (paramTf && validTfs.includes(paramTf)) {
        if (timeframe !== paramTf) {
          setTimeframe(paramTf);
        }
      }
    }
  }, [searchParams, timeframe]);

  useEffect(() => {
    const snapped = snapToPeriod(windowEnd, timeframe);
    if (snapped !== windowEnd) {
      setWindowEnd(snapped);
    }
  }, [timeframe, windowEnd, setWindowEnd]);

  const shift = WINDOW_SPAN[timeframe] ?? 1;

  const prevWindow = () => {
    const [y, m] = windowEnd.split('-').map(Number);
    const d = new Date(y, m - 1, 1);
    d.setMonth(d.getMonth() - shift);
    setWindowEnd(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  };

  const nextWindow = () => {
    const [y, m] = windowEnd.split('-').map(Number);
    const next = new Date(y, m - 1, 1);
    next.setMonth(next.getMonth() + shift);
    const nextStr = `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}`;
    
    const mb = MONTHS_BACK[timeframe] ?? 0;
    const nextStart = new Date(next.getFullYear(), next.getMonth() - mb, 1);
    const nextStartStr = `${nextStart.getFullYear()}-${String(nextStart.getMonth() + 1).padStart(2, '0')}`;
    
    if (nextStartStr <= currentMonth) setWindowEnd(nextStr);
  };

  const isNextDisabled = useMemo(() => {
    if (timeframe === 'all' || timeframe === '7d' || timeframe === '30d' || timeframe === '365d') return true;
    const [y, m] = windowEnd.split('-').map(Number);
    const nextEnd = new Date(y, m - 1, 1);
    nextEnd.setMonth(nextEnd.getMonth() + shift);
    const mb = MONTHS_BACK[timeframe] ?? 0;
    const nextStart = new Date(nextEnd.getFullYear(), nextEnd.getMonth() - mb, 1);
    return `${nextStart.getFullYear()}-${String(nextStart.getMonth() + 1).padStart(2, '0')}` > currentMonth;
  }, [timeframe, windowEnd, shift, currentMonth]);

  const showWindowNav = timeframe !== 'all' && timeframe !== 'ytd' && timeframe !== '7d' && timeframe !== '30d' && timeframe !== '365d';

  const windowLabel = useMemo(() => getPeriodLabel(windowEnd, timeframe), [windowEnd, timeframe]);

  const monthRange = useMemo(() => getMonthRange(timeframe, windowEnd), [timeframe, windowEnd]);
  const dateRange = useMemo(() => getPreciseDateRange(timeframe, windowEnd), [timeframe, windowEnd]);

  const periodOptions = useMemo(() => {
    if (timeframe === 'all' || timeframe === '7d' || timeframe === '30d' || timeframe === '365d') return [];
    const options: { label: string; value: string }[] = [];
    const count = timeframe === '1m' ? 24 : 12;
    const cursor = new Date();
    for (let i = 0; i < count; i++) {
      const y = cursor.getFullYear();
      const m = cursor.getMonth() + 1;
      const ym = `${y}-${String(m).padStart(2, '0')}`;
      const snapped = snapToPeriod(ym, timeframe);
      if (options.length === 0 || options[options.length - 1].value !== snapped) {
        options.push({ label: getPeriodLabel(snapped, timeframe), value: snapped });
      }
      cursor.setMonth(cursor.getMonth() - shift);
    }
    return options;
  }, [timeframe, shift]);

  return {
    timeframe,
    setTimeframe,
    windowEnd,
    setWindowEnd,
    prevWindow,
    nextWindow,
    isNextDisabled,
    windowLabel,
    monthRange,
    dateRange,
    periodOptions,
    showWindowNav,
  };
}
