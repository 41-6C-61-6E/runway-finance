'use client';

import { useMemo, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import type { TimeRange } from '@/components/charts/chart-filters';
import { usePersistentState } from './use-persistent-state';
import { getCurrentMonth, getMonthRange, getPreciseDateRange, getPeriodLabel, snapToPeriod } from '@/lib/utils/date-window';

const WINDOW_SPAN: Record<string, number> = { '1m': 1, '3m': 3, '6m': 6, '1y': 12, '3y': 36, 'ytd': 12, '5y': 60 };
const MONTHS_BACK: Record<string, number> = { '1m': 0, '3m': 2, '6m': 5, '1y': 11, '3y': 35, '5y': 59 };

// Keep deprecated 1d values for back-compat (deep links / persisted state) but not surfaced in UI
const VALID_TIMEFRAMES: TimeRange[] = ['7d', '30d', '90d', '1m', '3m', '6m', '1y', '3y', '365d', '5y', 'ytd', 'all', '7d_discrete', '1d', '1d_discrete'];
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const YEAR_MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

function formatCustomRangeLabel(start: string, end: string): string {
  const [sy, sm, sd] = start.split('-').map(Number);
  const [ey, em, ed] = end.split('-').map(Number);
  const startDate = new Date(Date.UTC(sy, sm - 1, sd));
  const endDate = new Date(Date.UTC(ey, em - 1, ed));
  if (sy === ey) {
    const startLabel = startDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
    const endLabel = endDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
    return `${startLabel} – ${endLabel}`;
  }
  const startLabel = startDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
  const endLabel = endDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
  return `${startLabel} – ${endLabel}`;
}

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
  isCustomRange: boolean;
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
  // /flows?timeframe=7d_discrete&date=2026-08-16 or ?month=2026-08) are
  // authoritative for the initial window. They seed the state synchronously —
  // so the very first data fetch already uses the linked window — and the
  // persisted (DB/localStorage) chart selections are NOT restored over them.
  const urlMonth = useMemo(() => {
    const paramMonth = searchParams?.get('month');
    return paramMonth && YEAR_MONTH_RE.test(paramMonth) ? paramMonth : null;
  }, [searchParams]);

  const urlTimeframe = useMemo(() => {
    const paramTf = searchParams?.get('timeframe');
    if (paramTf && (VALID_TIMEFRAMES as string[]).includes(paramTf)) {
      return paramTf as TimeRange;
    }
    if (urlMonth !== null) {
      return '1m' as TimeRange;
    }
    return null;
  }, [searchParams, urlMonth]);

  const urlWindowEnd = useMemo(() => {
    const paramDate = searchParams?.get('date');
    if (paramDate && (ISO_DATE_RE.test(paramDate) || /^\d{4}-\d{2}$/.test(paramDate))) {
      return paramDate;
    }
    return urlMonth;
  }, [searchParams, urlMonth]);

  const urlCustomRange = useMemo(() => {
    if (urlTimeframe !== null) return null;
    const start = searchParams?.get('startDate');
    const end = searchParams?.get('endDate');
    if (start && end && ISO_DATE_RE.test(start) && ISO_DATE_RE.test(end) && start <= end) {
      return { start, end };
    }
    return null;
  }, [searchParams, urlTimeframe]);

  const [customRange, setCustomRange] = useState<{ start: string; end: string } | null>(urlCustomRange);

  const [timeframeState, _setTimeframe, isTimeframeLoaded] = usePersistentState<TimeRange>(
    timeframeKey || '',
    urlTimeframe ?? defaultTimeframe,
    { skipRestore: urlTimeframe !== null || urlCustomRange !== null },
  );
  const initialTimeframe = controlledTimeframe !== undefined ? controlledTimeframe : (urlTimeframe ?? defaultTimeframe);
  const [windowEnd, _setWindowEnd, isWindowEndLoaded] = usePersistentState<string>(
    windowEndKey,
    urlWindowEnd ?? snapToPeriod(currentMonth, initialTimeframe),
    { skipRestore: urlWindowEnd !== null || urlCustomRange !== null },
  );

  const timeframe = controlledTimeframe !== undefined ? controlledTimeframe : timeframeState;

  const setTimeframe = (tf: TimeRange) => {
    setCustomRange(null);
    if (controlledTimeframe === undefined) {
      _setTimeframe(tf);
    }
    _setWindowEnd(snapToPeriod(windowEnd, tf));
  };

  const setWindowEnd = (ym: string) => {
    setCustomRange(null);
    _setWindowEnd(ym);
  };

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

    if (urlCustomRange !== null) {
      setCustomRange(urlCustomRange);
    } else if (urlTimeframe !== null || urlWindowEnd !== null) {
      setCustomRange(null);
    }

    // Compare against current state so applying on mount is a no-op; only a
    // genuine param change (a new deep link after client-side navigation)
    // persists.
    if (urlTimeframe !== null && urlTimeframe !== timeframeState) {
      _setTimeframe(urlTimeframe);
    }

    // Compare against current state so re-applying the same value on mount
    // is a no-op; only a genuine param change persists.
    if (urlWindowEnd !== null && urlWindowEnd !== windowEnd) {
      _setWindowEnd(urlWindowEnd);
    }
  }, [searchParams, controlledTimeframe, _setTimeframe, _setWindowEnd, timeframeState, windowEnd, urlTimeframe, urlWindowEnd, urlCustomRange]);

  useEffect(() => {
    // When the window end came straight from the URL (e.g. a notification
    // deep link), it is already an exact date for discrete timeframes —
    // force-snapping it would silently change the linked window. Only snap
    // persisted monthly values (e.g. after the user switches to a discrete
    // timeframe, which already snaps synchronously in setTimeframe).
    if (urlWindowEnd !== null || urlCustomRange !== null) return;
    if (!isWindowEndLoaded || (controlledTimeframe === undefined && !isTimeframeLoaded)) return;
    const snapped = snapToPeriod(windowEnd, timeframe);
    if (snapped !== windowEnd) {
      _setWindowEnd(snapped);
    }
  }, [timeframe, windowEnd, _setWindowEnd, urlWindowEnd, urlCustomRange, isWindowEndLoaded, isTimeframeLoaded, controlledTimeframe]);

  // Auto-migrate deprecated 1d values persisted in DB/localStorage,
  // but preserve explicit 1d_discrete deep links from the URL.
  useEffect(() => {
    if (controlledTimeframe !== undefined) return;
    if (timeframeState === ('1d' as TimeRange) && urlTimeframe !== '1d') {
      _setTimeframe('7d' as TimeRange);
    } else if (timeframeState === ('1d_discrete' as TimeRange) && urlTimeframe !== '1d_discrete') {
      _setTimeframe('1m' as TimeRange);
    }
  }, [timeframeState, controlledTimeframe, _setTimeframe, urlTimeframe]);

  const shift = WINDOW_SPAN[timeframe] ?? 1;

  const prevWindow = () => {
    setCustomRange(null);
    if (timeframe === '1d_discrete') {
      const dateParts = windowEnd.split('-');
      const y = Number(dateParts[0]);
      const m = Number(dateParts[1]);
      const d = dateParts[2] ? Number(dateParts[2]) : 1;
      const prevDate = new Date(y, m - 1, d);
      prevDate.setDate(prevDate.getDate() - 1);
      _setWindowEnd(`${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, '0')}-${String(prevDate.getDate()).padStart(2, '0')}`);
      return;
    }
    if (timeframe === '7d_discrete') {
      const dateParts = windowEnd.split('-');
      const y = Number(dateParts[0]);
      const m = Number(dateParts[1]);
      const d = dateParts[2] ? Number(dateParts[2]) : 1;
      const prevDate = new Date(y, m - 1, d);
      prevDate.setDate(prevDate.getDate() - 7);
      _setWindowEnd(`${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, '0')}-${String(prevDate.getDate()).padStart(2, '0')}`);
      return;
    }
    const [y, m] = windowEnd.split('-').map(Number);
    const d = new Date(y, m - 1, 1);
    d.setMonth(d.getMonth() - shift);
    _setWindowEnd(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  };

  const nextWindow = () => {
    setCustomRange(null);
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
        _setWindowEnd(nextStr);
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
        _setWindowEnd(nextStr);
      } else {
        _setWindowEnd(todayStr);
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
    
    if (nextStartStr <= currentMonth) _setWindowEnd(nextStr);
  };

  const isNextDisabled = useMemo(() => {
    if (customRange !== null) return true;
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
  }, [customRange, timeframe, windowEnd, shift, currentMonth]);

  const showWindowNav = customRange !== null || (timeframe !== 'all' && timeframe !== 'ytd');

  const windowLabel = useMemo(
    () => (customRange ? formatCustomRangeLabel(customRange.start, customRange.end) : getPeriodLabel(windowEnd, timeframe)),
    [customRange, windowEnd, timeframe]
  );

  const monthRange = useMemo(
    () => (customRange ? { start: customRange.start.slice(0, 7), end: customRange.end.slice(0, 7) } : getMonthRange(timeframe, windowEnd)),
    [customRange, timeframe, windowEnd]
  );
  const dateRange = useMemo(
    () => customRange ?? getPreciseDateRange(timeframe, windowEnd),
    [customRange, timeframe, windowEnd]
  );

  const periodOptions = useMemo(() => {
    if (customRange !== null) return [];
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
  }, [customRange, timeframe, shift]);

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
    isCustomRange: customRange !== null,
  };
}
