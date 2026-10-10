// @vitest-environment jsdom
import React, { useState } from 'react';
import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';

const mockPush = vi.fn();
const mockReplace = vi.fn();
let currentSearch = '';

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
    replace: mockReplace,
    prefetch: vi.fn(),
  }),
  useSearchParams: () => ({
    get: (key: string) => new URLSearchParams(currentSearch).get(key),
    toString: () => currentSearch,
  }),
}));

vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({
    invalidateQueries: vi.fn(),
  }),
}));

vi.mock('@/lib/hooks/use-persistent-state', () => ({
  usePersistentState: (_key: string, initialValue: any) => {
    const [val, setVal] = useState(initialValue);
    return [val, setVal];
  },
}));

vi.mock('@/components/features/transactions/TransactionTable', () => ({
  default: ({ pendingAiCount, aiSuggestionsDismissed, onOpenAiSuggestions }: any) => (
    <div data-testid="transaction-table">
      {pendingAiCount > 0 && !aiSuggestionsDismissed && (
        <button
          type="button"
          data-testid="ai-suggestions-button"
          onClick={onOpenAiSuggestions}
        >
          {pendingAiCount} suggestions
        </button>
      )}
    </div>
  ),
}));

vi.mock('@/components/features/transactions/FilterBar', () => ({
  default: () => <div data-testid="filter-bar" />,
}));

vi.mock('@/components/features/transactions/BulkActionsToolbar', () => ({
  default: () => null,
}));

vi.mock('@/components/features/transactions/TransactionDetailDrawer', () => ({
  default: () => null,
}));

vi.mock('@/components/features/ai/AiSuggestionsModal', () => ({
  default: ({ open, onOpenChange }: any) =>
    open ? (
      <div data-testid="ai-suggestions-modal">
        <span>AI Suggestions Window</span>
        <button data-testid="close-ai-modal" onClick={() => onOpenChange(false)}>
          Close
        </button>
      </div>
    ) : null,
}));

vi.mock('@/components/page-content', () => ({
  default: ({ children }: any) => <div>{children}</div>,
}));

vi.mock('@/components/page-header', () => ({
  PageHeader: () => null,
}));

vi.mock('@/components/ui/mobile-view-switcher', () => ({
  MobileTabSwipeContainer: ({ children }: any) => <div>{children}</div>,
}));

vi.mock('@/components/ui/app-tabs', () => ({
  AppTabs: () => null,
}));

import TransactionsPage from '@/app/transactions/page';

describe('TransactionsPage AI Suggestions Modal', () => {
  beforeAll(() => {
    global.ResizeObserver = class ResizeObserver {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
  });

  beforeEach(() => {
    vi.clearAllMocks();
    currentSearch = '';

    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/api/ai/proposals')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve([{ id: 'prop-1' }, { id: 'prop-2' }]),
        });
      }
      if (url.includes('/api/ai/provider')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ endpoint: 'http://ai' }),
        });
      }
      if (url.includes('/api/ai/status')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ status: 'idle' }),
        });
      }
      if (url.includes('/api/recurring')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ counts: { total: 0 } }),
        });
      }
      if (url.includes('/api/categories')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve([]),
        });
      }
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({}),
      });
    });
  });

  it('does NOT open AI suggestions window automatically when pending proposals exist', async () => {
    await act(async () => {
      render(<TransactionsPage />);
    });

    // Wait for pending proposals to load
    await waitFor(() => {
      expect(screen.getByTestId('ai-suggestions-button')).toBeInTheDocument();
    });

    // The modal window must NOT be open
    expect(screen.queryByTestId('ai-suggestions-modal')).toBeNull();
  });

  it('only opens AI suggestions window when the AI suggestions button is clicked', async () => {
    await act(async () => {
      render(<TransactionsPage />);
    });

    await waitFor(() => {
      expect(screen.getByTestId('ai-suggestions-button')).toBeInTheDocument();
    });

    // Modal is initially closed
    expect(screen.queryByTestId('ai-suggestions-modal')).toBeNull();

    // Click the AI suggestions button
    await act(async () => {
      fireEvent.click(screen.getByTestId('ai-suggestions-button'));
    });

    // Now modal is open
    expect(screen.getByTestId('ai-suggestions-modal')).toBeInTheDocument();

    // Close the modal
    await act(async () => {
      fireEvent.click(screen.getByTestId('close-ai-modal'));
    });

    // Modal is closed again
    expect(screen.queryByTestId('ai-suggestions-modal')).toBeNull();
  });
});
