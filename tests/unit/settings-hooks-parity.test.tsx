// @vitest-environment jsdom
import React from 'react';
import { renderHook, act, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { UserSettingsProvider, useUserSettings } from '@/components/user-settings-provider';
import { useSyntheticData } from '@/lib/hooks/use-synthetic-data';
import { useImportedData } from '@/lib/hooks/use-imported-data';
import { useChartColorScheme } from '@/lib/hooks/use-chart-colors';
import { usePersistentState } from '@/lib/hooks/use-persistent-state';

describe('Settings hooks parity and central provider synchronization', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    vi.restoreAllMocks();
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
      },
    });

    global.fetch = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
      if (url.includes('/api/user-settings')) {
        if (init?.method === 'PATCH') {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => ({ success: true }),
          });
        }
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({
            showSyntheticData: { global: true, netWorth: true },
            showImportedData: { global: true, netWorth: true },
            chartColorScheme: 'emerald',
          }),
        });
      }
      return Promise.resolve({ ok: true, json: async () => ({}) });
    });
  });

  it('synchronizes synthetic data settings updates via central UserSettingsProvider', async () => {
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={queryClient}>
        <UserSettingsProvider>{children}</UserSettingsProvider>
      </QueryClientProvider>
    );

    const { result } = renderHook(() => useSyntheticData(), { wrapper });

    await act(async () => {
      await result.current.updateSettings({ netWorth: false });
    });

    expect(global.fetch).toHaveBeenCalledWith('/api/user-settings', expect.objectContaining({
      method: 'PATCH',
      body: JSON.stringify({ showSyntheticData: { global: false, netWorth: false, investments: false, realEstate: false, cashFlowProjections: false } }),
    }));
  });

  it('synchronizes chart color scheme updates via central UserSettingsProvider', async () => {
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={queryClient}>
        <UserSettingsProvider>{children}</UserSettingsProvider>
      </QueryClientProvider>
    );

    const { result } = renderHook(() => useChartColorScheme(), { wrapper });

    await act(async () => {
      await result.current.updateScheme('seattle');
    });

    expect(global.fetch).toHaveBeenCalledWith('/api/user-settings', expect.objectContaining({
      method: 'PATCH',
      body: JSON.stringify({ chartColorScheme: 'seattle' }),
    }));
  });

  it('coalesces multiple synchronous chartSelections updates into a single PATCH request', async () => {
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={queryClient}>
        <UserSettingsProvider>{children}</UserSettingsProvider>
      </QueryClientProvider>
    );

    const { result } = renderHook(() => useUserSettings(), { wrapper });

    await act(async () => {
      const p1 = result.current?.updateSetting('chartSelections', {
        'finance:accounts:selectedAccountId': 'acc_1',
      });
      const p2 = result.current?.updateSetting('chartSelections', {
        'finance:accounts:expandedAccounts': { acc_1: true },
      });
      const p3 = result.current?.updateSetting('chartSelections', {
        'finance:accounts:selectedGroup': null,
      });
      await Promise.all([p1, p2, p3]);
    });

    const patchCalls = (global.fetch as ReturnType<typeof vi.fn>).mock.calls.filter(
      ([url, init]) => url === '/api/user-settings' && init?.method === 'PATCH'
    );
    expect(patchCalls).toHaveLength(1);
    expect(JSON.parse(patchCalls[0][1].body)).toEqual({
      chartSelections: {
        'finance:accounts:selectedAccountId': 'acc_1',
        'finance:accounts:expandedAccounts': { acc_1: true },
        'finance:accounts:selectedGroup': null,
      },
    });
  });

  it('gracefully ignores Safari TypeError: Load failed on aborted chartSelections PATCH without console.error', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    global.fetch = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
      if (url.includes('/api/user-settings') && init?.method === 'PATCH') {
        return Promise.reject(new TypeError('Load failed'));
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        json: async () => ({ chartSelections: {} }),
      });
    });

    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={queryClient}>
        <UserSettingsProvider>{children}</UserSettingsProvider>
      </QueryClientProvider>
    );

    const { result } = renderHook(() => useUserSettings(), { wrapper });

    await waitFor(() => expect(result.current?.loading).toBe(false));

    await act(async () => {
      await result.current?.updateSetting('chartSelections', {
        'finance:accounts:selectedAccountId': 'acc_1',
      });
    });

    expect(consoleErrorSpy).not.toHaveBeenCalled();
    expect(queryClient.getQueryData(['user-settings'])).toEqual({
      chartSelections: {
        'finance:accounts:selectedAccountId': 'acc_1',
      },
    });
    await waitFor(() => {
      expect(result.current?.settings.chartSelections).toEqual({
        'finance:accounts:selectedAccountId': 'acc_1',
      });
    });
  });

  it('skips DB PATCH in usePersistentState when setting a value identical to current state', async () => {
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={queryClient}>
        <UserSettingsProvider>{children}</UserSettingsProvider>
      </QueryClientProvider>
    );

    const { result } = renderHook(
      () => usePersistentState<Record<string, boolean>>('finance:accounts:expandedGroups', {}),
      { wrapper }
    );

    await act(async () => {
      // No-op functional update (group is already expanded by default when not false)
      result.current[1]((prev) => (prev.Banking !== false ? prev : { ...prev, Banking: true }));
      // Explicit identical value
      result.current[1]({});
    });

    const patchCalls = (global.fetch as ReturnType<typeof vi.fn>).mock.calls.filter(
      ([url, init]) => url === '/api/user-settings' && init?.method === 'PATCH'
    );
    expect(patchCalls).toHaveLength(0);
  });
});
