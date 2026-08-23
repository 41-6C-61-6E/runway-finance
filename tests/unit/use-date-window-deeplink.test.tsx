// @vitest-environment jsdom
//
// Guards for the weekly-net-worth-alert deep-link fix:
//
// The alert links to /flows?timeframe=7d_discrete&date=YYYY-MM-DD and computes
// its number for exactly that window. useDateWindow must therefore treat those
// URL params as the authoritative initial window — even when a stale chart
// selection (persisted DB value — often written by a PREVIOUS click of the
// same link, or an old month) would otherwise override it after mount.
import React, { useState, useEffect } from 'react';
import { render } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';

// ── Mocked collaborators ──────────────────────────────────────────────────────

const mockSp = {
  get: vi.fn((key: string) => new URLSearchParams(window.location.search).get(key)),
};
vi.mock('next/navigation', () => ({
  useSearchParams: () => mockSp,
}));

const mockUpdateSetting = vi.fn();
const settingsHolder: { value: Record<string, any> | undefined } = { value: undefined };
vi.mock('@/components/user-settings-provider', () => ({
  useUserSettings: () => ({
    settings: settingsHolder.value,
    updateSetting: mockUpdateSetting,
    loading: false,
    refreshSettings: vi.fn(),
  }),
}));

// Mirrors the real hook's restore semantics: after mount, the persisted DB
// value is applied to state — unless the caller sets skipRestore. Writes
// always go to localStorage + the settings context.
vi.mock('@/lib/hooks/use-persistent-state', () => ({
  usePersistentState: (key: string, defaultValue: any, options?: any) => {
    const [state, setState] = useState(defaultValue);
    const context = {
      settings: settingsHolder.value,
      updateSetting: mockUpdateSetting,
    };

    useEffect(() => {
      if (!key) return;
      if (!options?.skipRestore) {
        const dbValue = context.settings?.[key];
        if (dbValue !== undefined && dbValue !== null) {
          setState(dbValue);
        }
      }
    });

    const set = (value: any) => {
      setState(value);
      const valForDb = value instanceof Set ? Array.from(value) : value;
      try {
        localStorage.setItem(key, JSON.stringify(valForDb));
      } catch {
        /* ignore */
      }
      context.updateSetting('chartSelections', { [key]: valForDb });
    };

    return [state, set, true] as const;
  },
}));

import { useDateWindow } from '@/lib/hooks/use-date-window';

// ── Harness ───────────────────────────────────────────────────────────────────

function TestHarness() {
  const dw = useDateWindow('finance:sankey:timeframe', 'finance:sankey:windowEnd', '1m');
  return (
    <div data-testid="window" data-timeframe={dw.timeframe} data-window-end={dw.windowEnd}>
      <span data-testid="range-start">{dw.dateRange.start}</span>
      <span data-testid="range-end">{dw.dateRange.end}</span>
    </div>
  );
}

function renderHarness() {
  const utils = render(<TestHarness />);
  const read = () => {
    const el = document.querySelector('[data-testid="window"]') as HTMLElement;
    return {
      timeframe: el.dataset.timeframe as string,
      windowEnd: el.dataset.windowEnd as string,
      start: (document.querySelector('[data-testid="range-start"]') as HTMLElement).textContent,
      end: (document.querySelector('[data-testid="range-end"]') as HTMLElement).textContent,
    };
  };
  return { utils, read };
}

function setUrl(pathname: string, params: Record<string, string>) {
  const qs = new URLSearchParams(params).toString();
  window.history.pushState({}, '', qs ? `${pathname}?${qs}` : pathname);
}

// The mocked restore effect runs after the first paint — flush the event loop
// so it has definitely run before asserting.
async function settle(ticks = 3) {
  for (let i = 0; i < ticks; i++) await new Promise((r) => setTimeout(r, 0));
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('useDateWindow — URL deep-link authority (weekly net worth alert)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    settingsHolder.value = undefined;
    setUrl('/flows', {});
  });

  it('seeds the 7d_discrete deep-link window synchronously (start = end - 7d), ignoring a stale persisted month', () => {
    // Stale persisted selections — e.g. written by last Sunday's click of the
    // same deep link, or by any prior generic chart usage.
    settingsHolder.value = {
      'finance:sankey:timeframe': '1m',
      'finance:sankey:windowEnd': '2026-07',
    };
    localStorage.setItem('finance:sankey:timeframe', JSON.stringify('1m'));
    localStorage.setItem('finance:sankey:windowEnd', JSON.stringify('2026-07'));

    setUrl('/flows', { timeframe: '7d_discrete', date: '2026-08-16' });

    const { read } = renderHarness();
    // First render already shows the linked window — no default-month flash.
    expect(read()).toEqual({
      timeframe: '7d_discrete',
      windowEnd: '2026-08-16',
      start: '2026-08-09',
      end: '2026-08-16',
    });
  });

  it('keeps the deep-link window after the async restore of stale persisted values runs', async () => {
    settingsHolder.value = {
      'finance:sankey:timeframe': '1m',
      'finance:sankey:windowEnd': '2026-07',
    };

    setUrl('/flows', { timeframe: '7d_discrete', date: '2026-08-16' });

    const { read } = renderHarness();
    await settle();

    // Without skipRestore this is where the old code regressed: the persisted
    // '1m' / '2026-07' would clobber the linked window here.
    expect(read()).toEqual({
      timeframe: '7d_discrete',
      windowEnd: '2026-08-16',
      start: '2026-08-09',
      end: '2026-08-16',
    });

    // The URL values were already the state initial value, so nothing should
    // have been re-persisted on mount.
    expect(mockUpdateSetting).not.toHaveBeenCalled();
  });

  it('still restores persisted selections when no URL params are present (default behavior preserved)', async () => {
    settingsHolder.value = { 'finance:sankey:windowEnd': '2026-05' };

    setUrl('/flows', {});

    const { read } = renderHarness();
    // First render: default month, before the async restore.
    expect(read().timeframe).toBe('1m');

    await settle();
    const restored = read();
    expect(restored.timeframe).toBe('1m');
    expect(restored.windowEnd).toBe('2026-05');
  });

  it('does not force-snap a URL-provided past discrete date (snapToPeriod would coerce it to today)', () => {
    setUrl('/flows', { timeframe: '7d_discrete', date: '2026-07-26' });

    const { read } = renderHarness();
    expect(read()).toEqual({
      timeframe: '7d_discrete',
      windowEnd: '2026-07-26',
      start: '2026-07-19',
      end: '2026-07-26',
    });
  });
});
