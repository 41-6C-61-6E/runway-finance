'use client';

import { useMemo, useEffect } from 'react';
import type { TimeRange } from '@/components/charts/chart-filters';
import { usePersistentState } from './use-persistent-state';
import { getCurrentMonth, getMonthRange, getPeriodLabel, snapToPeriod } from '@/lib/utils/date-window';

const WINDOW_SPAN: Record<string, number> = { '1m': 1, '3m': 3, '6m': 6, '1y': 12, 'ytd': 12 };
const MONTHS_BACK: Record<string, number> = { '1m': 0, '3m': 2, '6m': 5, '1y': 11 };

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
    if (controlledTimeframe !== undefined) {
      setWindowEnd((prev) => snapToPeriod(prev, controlledTimeframe));
    }
  }, [controlledTimeframe, setWindowEnd]);

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
    if (nextStr <= currentMonth) setWindowEnd(nextStr);
  };

  const isNextDisabled = useMemo(() => {
    if (timeframe === 'all') return true;
    const [y, m] = windowEnd.split('-').map(Number);
    const nextEnd = new Date(y, m - 1, 1);
    nextEnd.setMonth(nextEnd.getMonth() + shift);
    const mb = MONTHS_BACK[timeframe] ?? 0;
    const nextStart = new Date(nextEnd.getFullYear(), nextEnd.getMonth() - mb, 1);
    return `${nextStart.getFullYear()}-${String(nextStart.getMonth() + 1).padStart(2, '0')}` > currentMonth;
  }, [timeframe, windowEnd, shift, currentMonth]);

  const showWindowNav = timeframe !== 'all' && timeframe !== 'ytd';

  const windowLabel = useMemo(() => getPeriodLabel(windowEnd, timeframe), [windowEnd, timeframe]);

  const monthRange = useMemo(() => getMonthRange(timeframe, windowEnd), [timeframe, windowEnd]);

  const periodOptions = useMemo(() => {
    if (timeframe === 'all') return [];
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
    periodOptions,
    showWindowNav,
  };
}
