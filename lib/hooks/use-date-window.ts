'use client';

import { useMemo, useEffect, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import type { TimeRange } from '@/components/charts/chart-filters';
import { usePersistentState } from './use-persistent-state';
import { getCurrentMonth, getMonthRange, getPreciseDateRange, getPeriodLabel, snapToPeriod } from '@/lib/utils/date-window';

const WINDOW_SPAN: Record<string, number> = { '1m': 1, '3m': 3, '6m': 6, '1y': 12, 'ytd': 12, '5y': 60 };
const MONTHS_BACK: Record<string, number> = { '1m': 0, '3m': 2, '6m': 5, '1y': 11, '5y': 59 };

const VALID_TIMEFRAMES: TimeRange[] = ['1d', '7d', '30d', '1m', '3m', '6m', '1y', '365d', '5y', 'ytd', 'all', '1d_discrete', '7d_discrete'];

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

  // URL search params (e.g. notification deep links like
  // /flows?timeframe=7d_discrete&date=2026-08-16) are authoritative for the
  // initial window. They seed the state synchronously — so the very first
  // data fetch already uses the linked window — and the persisted
  // (DB/localStorage) chart selections are NOT restored over them. Without
  // this, a previously saved window (often set by an *earlier* click of the
  // same deep link) would clobber the linked window after mount.
  const urlTimeframe = useMemo(() => {
    const paramTf = searchParams?.get('timeframe');
    return paramTf && (VALID_TIMEFRAMES as string[]).includes(paramTf) ? (paramTf as TimeRange) : null;
  }, [searchParams]);

  const urlWindowEnd = useMemo(() => {
    const paramDate = searchParams?.get('date');
    return paramDate && (/^\d{4}-\d{2}-\d{2}$/.test(paramDate) || /^\d{4}-\d{2}$/.test(paramDate)) ? paramDate : null;
  }, [searchParams]);

  const [timeframeState, _setTimeframe] = usePersistentState<TimeRange>(
    timeframeKey || '',
    urlTimeframe ?? defaultTimeframe,
    { skipRestore: urlTimeframe !== null },
  );
  const [windowEnd, setWindowEnd] = usePersistentState<string>(
    windowEndKey,
    urlWindowEnd ?? currentMonth,
    { skipRestore: urlWindowEnd !== null },
  );

  const timeframe = controlledTimeframe !== undefined ? controlledTimeframe : timeframeState;

  // Seed with the URL value so the sync effect below doesn't re-apply
  // (and re-persist) the same value on mount.
  const lastSyncedParamRef = useRef<TimeRange | null>(urlTimeframe);

  const setTimeframe = (tf: TimeRange) => {
    if (controlledTimeframe === undefined) {
      _setTimeframe(tf);
    }
    setWindowEnd(snapToPeriod(windowEnd, tf));
  };

  useEffect(() => {
    if (controlledTimeframe !== undefined) return;
    if (!searchParams) return;

    // Re-sync on client-side navigation. On initial mount these already match
    // the state initializers above, so no redundant (and re-persisting)
    // state update happens.
    if (urlTimeframe !== null) {
      if (lastSyncedParamRef.current !== urlTimeframe) {
        lastSyncedParamRef.current = urlTimeframe;
        _setTimeframe(urlTimeframe);
      }
    }

    // Compare against current state so re-applying the same value on mount
    // is a no-op; only a genuine param change persists.
    if (urlWindowEnd !== null && urlWindowEnd !== windowEnd) {
      setWindowEnd(urlWindowEnd);
    }
  }, [searchParams, controlledTimeframe, _setTimeframe, setWindowEnd, urlTimeframe, urlWindowEnd, windowEnd]);

  useEffect(() => {
    lastSyncedParamRef.current = timeframe;
  }, [timeframe]);

  useEffect(() => {
    // When the window end came straight from the URL (e.g. a notification
    // deep link), it is already an exact date for discrete timeframes —
    // force-snapping it would silently change the linked window. Only snap
    // persisted monthly values (e.g. after the user switches to a discrete
    // timeframe, which already snaps synchronously in setTimeframe).
    if (urlWindowEnd !== null) return;
    const snapped = snapToPeriod(windowEnd, timeframe);
    if (snapped !== windowEnd) {
      setWindowEnd(snapped);
    }
  }, [timeframe, windowEnd, setWindowEnd, urlWindowEnd]);

  const shift = WINDOW_SPAN[timeframe] ?? 1;

  const prevWindow = () => {
    if (timeframe === '1d_discrete') {
      const dateParts = windowEnd.split('-');
      const y = Number(dateParts[0]);
      const m = Number(dateParts[1]);
      const d = dateParts[2] ? Number(dateParts[2]) : 1;
      const prevDate = new Date(y, m - 1, d);
      prevDate.setDate(prevDate.getDate() - 1);
      setWindowEnd(`${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, '0')}-${String(prevDate.getDate()).padStart(2, '0')}`);
      return;
    }
    if (timeframe === '7d_discrete') {
      const dateParts = windowEnd.split('-');
      const y = Number(dateParts[0]);
      const m = Number(dateParts[1]);
      const d = dateParts[2] ? Number(dateParts[2]) : 1;
      const prevDate = new Date(y, m - 1, d);
      prevDate.setDate(prevDate.getDate() - 7);
      setWindowEnd(`${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, '0')}-${String(prevDate.getDate()).padStart(2, '0')}`);
      return;
    }
    const [y, m] = windowEnd.split('-').map(Number);
    const d = new Date(y, m - 1, 1);
    d.setMonth(d.getMonth() - shift);
    setWindowEnd(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  };

  const nextWindow = () => {
    if (timeframe === '1d_discrete') {
      const dateParts = windowEnd.split('-');
      const y = Number(dateParts[0]);
      const m = Number(dateParts[1]);
      const d = dateParts[2] ? Number(dateParts[2]) : 1;
      const nextDate = new Date(y, m - 1, d);
      nextDate.setDate(nextDate.getDate() + 1);
      const nextStr = `${nextDate.getFullYear()}-${String(nextDate.getMonth() + 1).padStart(2, '0')}-${String(nextDate.getDate()).padStart(2, '0')}`;
      
      const today = new Date();
      const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
      if (nextStr <= todayStr) {
        setWindowEnd(nextStr);
      }
      return;
    }
    if (timeframe === '7d_discrete') {
      const dateParts = windowEnd.split('-');
      const y = Number(dateParts[0]);
      const m = Number(dateParts[1]);
      const d = dateParts[2] ? Number(dateParts[2]) : 1;
      const nextDate = new Date(y, m - 1, d);
      nextDate.setDate(nextDate.getDate() + 7);
      const nextStr = `${nextDate.getFullYear()}-${String(nextDate.getMonth() + 1).padStart(2, '0')}-${String(nextDate.getDate()).padStart(2, '0')}`;
      
      const today = new Date();
      const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
      if (nextStr <= todayStr) {
        setWindowEnd(nextStr);
      } else {
        setWindowEnd(todayStr);
      }
      return;
    }
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
    if (timeframe === 'all' || timeframe === '1d' || timeframe === '7d' || timeframe === '30d' || timeframe === '365d') return true;
    if (timeframe === '1d_discrete' || timeframe === '7d_discrete') {
      const today = new Date();
      const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
      return windowEnd >= todayStr;
    }
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
  const dateRange = useMemo(() => getPreciseDateRange(timeframe, windowEnd), [timeframe, windowEnd]);

  const periodOptions = useMemo(() => {
    if (timeframe === 'all' || timeframe === '1d' || timeframe === '7d' || timeframe === '30d' || timeframe === '365d' || timeframe === '1d_discrete' || timeframe === '7d_discrete') return [];
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
