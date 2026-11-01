// @vitest-environment jsdom
import React from 'react';
import { render, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ClientErrorReporter } from '@/components/client-error-reporter';

describe('ClientErrorReporter rate-limiting and resilience', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('rate limits client log reporting to a maximum of 5 reports per minute', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    global.fetch = fetchMock;

    render(
      <ClientErrorReporter>
        <div>Test Child</div>
      </ClientErrorReporter>
    );

    // Trigger 15 distinct console errors in rapid succession
    act(() => {
      for (let i = 0; i < 15; i++) {
        console.error(`Simulated distinct runtime error ${i}`);
      }
    });

    // Should have reported at most 5 errors
    expect(fetchMock).toHaveBeenCalledTimes(5);
  });
});

