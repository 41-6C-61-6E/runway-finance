// @vitest-environment jsdom
import React from 'react';
import { render, cleanup, act } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { OfflineBanner } from '@/components/offline-banner';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

describe('OfflineBanner Component', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    vi.clearAllMocks();
    queryClient = new QueryClient();
  });

  afterEach(() => {
    cleanup();
  });

  it('renders offline message when offline event fires', () => {
    const { getByText, queryByText } = render(
      <QueryClientProvider client={queryClient}>
        <OfflineBanner />
      </QueryClientProvider>
    );

    expect(queryByText('You are offline — showing offline data')).toBeNull();

    act(() => {
      window.dispatchEvent(new Event('offline'));
    });

    expect(getByText('You are offline — showing offline data')).not.toBeNull();
  });

  it('triggers refetchQueries when back online', () => {
    const refetchSpy = vi.spyOn(queryClient, 'refetchQueries');

    const { getByText } = render(
      <QueryClientProvider client={queryClient}>
        <OfflineBanner />
      </QueryClientProvider>
    );

    act(() => {
      window.dispatchEvent(new Event('online'));
    });

    expect(refetchSpy).toHaveBeenCalled();
    expect(getByText('Back online — data refreshed')).not.toBeNull();
  });
});
