// @vitest-environment jsdom
import React from 'react';
import { render, fireEvent, cleanup } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { PullToRefresh } from '@/components/pull-to-refresh';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const mockPush = vi.fn();
const mockRefresh = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
    refresh: mockRefresh,
  }),
}));

describe('PullToRefresh Component', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    vi.clearAllMocks();
    queryClient = new QueryClient();
    window.scrollY = 0;
  });

  afterEach(() => {
    cleanup();
  });

  it('renders children properly', () => {
    const { getByText } = render(
      <QueryClientProvider client={queryClient}>
        <PullToRefresh>
          <div>Main App Content</div>
        </PullToRefresh>
      </QueryClientProvider>
    );

    expect(getByText('Main App Content')).not.toBeNull();
  });

  it('ignores touches inside excluded elements like horizontally scrollable containers', () => {
    const { getByTestId, queryByText } = render(
      <QueryClientProvider client={queryClient}>
        <PullToRefresh>
          <div className="scroll-contain-x" data-testid="scroll-container">
            <span>Chart or Table</span>
          </div>
        </PullToRefresh>
      </QueryClientProvider>
    );

    const scrollContainer = getByTestId('scroll-container');

    // Simulate drag start inside excluded element
    fireEvent.touchStart(scrollContainer, {
      touches: [{ clientX: 100, clientY: 50 }],
    });

    // Move downward
    fireEvent.touchMove(scrollContainer, {
      touches: [{ clientX: 105, clientY: 150 }],
      cancelable: true,
    });

    expect(queryByText('Release to refresh')).toBeNull();
  });

  it('resets state on touchcancel without throwing', () => {
    const { container } = render(
      <QueryClientProvider client={queryClient}>
        <PullToRefresh>
          <div>Content</div>
        </PullToRefresh>
      </QueryClientProvider>
    );

    const ptrRoot = container.firstChild as HTMLElement;

    fireEvent.touchStart(ptrRoot, {
      touches: [{ clientX: 100, clientY: 50 }],
    });

    fireEvent.touchMove(ptrRoot, {
      touches: [{ clientX: 100, clientY: 100 }],
      cancelable: true,
    });

    fireEvent.touchCancel(ptrRoot);
  });
});
