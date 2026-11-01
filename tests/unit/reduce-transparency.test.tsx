// @vitest-environment jsdom
import React from 'react';
import { render, act, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ReduceTransparencyProvider, useReduceTransparency } from '@/components/reduce-transparency-provider';

describe('ReduceTransparencyProvider (WS-09-F08)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    document.documentElement.className = '';
    global.fetch = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
      if (init?.method === 'PATCH') {
        return Promise.resolve({ ok: true, json: async () => ({ success: true }) });
      }
      return Promise.resolve({ ok: true, json: async () => ({ reduceTransparency: false }) });
    });
  });

  it('toggles reduce-transparency-active class on document.documentElement', async () => {
    let toggleFn: (val: boolean) => Promise<void>;

    function Consumer() {
      const { reduceTransparency, updateReduceTransparency, loading } = useReduceTransparency();
      toggleFn = updateReduceTransparency;
      return <div data-testid="status">{loading ? 'loading' : String(reduceTransparency)}</div>;
    }

    const { getByTestId } = render(
      <ReduceTransparencyProvider>
        <Consumer />
      </ReduceTransparencyProvider>
    );

    await waitFor(() => {
      expect(getByTestId('status').textContent).toBe('false');
    });

    expect(document.documentElement.classList.contains('reduce-transparency-active')).toBe(false);

    await act(async () => {
      await toggleFn(true);
    });

    expect(document.documentElement.classList.contains('reduce-transparency-active')).toBe(true);

    await act(async () => {
      await toggleFn(false);
    });

    expect(document.documentElement.classList.contains('reduce-transparency-active')).toBe(false);
  });
});
