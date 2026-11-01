// @vitest-environment jsdom
import React from 'react';
import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { UserSettingsProvider } from '@/components/user-settings-provider';
import { useSyntheticData } from '@/lib/hooks/use-synthetic-data';
import { useImportedData } from '@/lib/hooks/use-imported-data';
import { useChartColorScheme } from '@/lib/hooks/use-chart-colors';

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
});
