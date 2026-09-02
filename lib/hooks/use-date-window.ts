'use client';

import { useMemo, useEffect, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import type { TimeRange } from '@/components/charts/chart-filters';
import { usePersistentState } from './use-persistent-state';
import { getCurrentMonth, getMonthRange, getPreciseDateRange, getPeriodLabel, snapToPeriod } from '@/lib/utils/date-window';

const WINDOW_SPAN: Record<string, number> = { '1m': 1, '3m': 3, '6m': 6, '1y': 12, '3y': 36, 'ytd': 12, '5y': 60 };
const MONTHS_BACK: Record<string, number> = { '1m': 0, '3m': 2, '6m': 5, '1y': 11, '3y': 35, '5y': 59 };

// Keep deprecated 1d values for back-compat (deep links / persisted state) but not surfaced in UI
const VALID_TIMEFRAMES: TimeRange[] = ['7d', '30d', '90d', '1m', '3m', '6m', '1y', '3y', '365d', '5y', 'ytd', 'all', '7d_discrete', '1d', '1d_discrete'];

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

  const setTimeframe = (tf: TimeRange) => {
    if (controlledTimeframe === undefined) {
      _setTimeframe(tf);
    }
    setWindowEnd(snapToPeriod(windowEnd, tf));
  };

  // Identity of the URLSearchParams object for which the URL-params sync
  // effect below has already run. Next.js gives a new object per distinct
  // URL, so comparing by identity "applies once per URL" with no
  // re-serialization or string-parsing work.
  const appliedSearchParamsRef = useRef<URLSearchParams | null>(null);

  // Serialized URL params for which the URL-params sync effect below has
  // already run. String comparison (instead of object identity) is robust
  // against Next.js re-instancing the URLSearchParams object for the same
  // URL. "Apply once per URL" — never re-asserting afterward — is what lets
  // the user freely navigate (back/next buttons, timeframe switches) after
  // following an alert link without the window snapping back to the linked
  // params.
  const appliedUrlKeyRef = useRef<string | null>(null);

  useEffect(() => {
    if (controlledTimeframe !== undefined) return;
    if (!searchParams) return;

    const urlKey = searchParams.toString();
    if (appliedUrlKeyRef.current === urlKey) return;
    appliedUrlKeyRef.current = urlKey;

    // Compare against current state so applying on mount is a no-op; only a
    // genuine param change (a new deep link after client-side navigation)
    // persists.
    if (urlTimeframe !== null && urlTimeframe !== timeframeState) {
      _setTimeframe(urlTimeframe);
    }

    // Compare against current state so re-applying the same value on mount
    // is a no-op; only a genuine param change persists.
    if (urlWindowEnd !== null && urlWindowEnd !== windowEnd) {
      setWindowEnd(urlWindowEnd);
    }
  }, [searchParams, controlledTimeframe, _setTimeframe, setWindowEnd, timeframeState]);

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

  // Auto-migrate deprecated 1d values persisted in DB/localStorage
  useEffect(() => {
    if (controlledTimeframe !== undefined) return;
    if (timeframeState === ('1d' as TimeRange)) _setTimeframe('7d' as TimeRange);
    else if (timeframeState === ('1d_discrete' as TimeRange)) _setTimeframe('1m' as TimeRange);
  }, [timeframeState, controlledTimeframe, _setTimeframe]);

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
    if (timeframe === 'all' || timeframe === '1d' || timeframe === '7d' || timeframe === '30d' || timeframe === '90d' || timeframe === '365d') return true;
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
    if (timeframe === 'all' || timeframe === '1d' || timeframe === '7d' || timeframe === '30d' || timeframe === '90d' || timeframe === '365d' || timeframe === '1d_discrete' || timeframe === '7d_discrete') return [];
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
