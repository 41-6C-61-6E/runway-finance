// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi, beforeAll } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import '@testing-library/jest-dom';
import FilterBar from '@/components/features/transactions/FilterBar';

beforeAll(() => {
  global.ResizeObserver = class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
});

// Mock fetch for accounts/categories/tags
global.fetch = vi.fn().mockImplementation((url: string) => {
  if (url.includes('/api/accounts')) return Promise.resolve({ ok: true, json: () => Promise.resolve([]) });
  if (url.includes('/api/categories')) return Promise.resolve({ ok: true, json: () => Promise.resolve([]) });
  if (url.includes('/api/tags')) return Promise.resolve({ ok: true, json: () => Promise.resolve([]) });
  return Promise.resolve({ ok: true, json: () => Promise.resolve([]) });
});

describe('FilterBar Active Filter Indicator & Clear Button', () => {
  const emptyFilters = {
    accountId: null,
    accountIds: null,
    accountTypes: null,
    categoryId: null,
    categoryIds: null,
    tagId: null,
    tagIds: null,
    accountTagIds: null,
    search: null,
    type: null,
    startDate: null,
    endDate: null,
    pending: null,
    reviewed: null,
    minAmount: null,
    maxAmount: null,
    categorizedByAi: null,
  };

  it('does not display Filtered badge or Clear button when no filters are active', async () => {
    await act(async () => {
      render(
        <FilterBar
          filters={emptyFilters}
          onChange={vi.fn()}
          onClearAll={vi.fn()}
          customPresets={[]}
          onApplyPreset={vi.fn()}
          onSavePreset={vi.fn()}
          onDeletePreset={vi.fn()}
        />
      );
    });

    expect(screen.queryByText('Filtered')).toBeNull();
    expect(screen.queryByRole('button', { name: /clear all filters/i })).toBeNull();
  });

  it('displays Filtered badge and Clear button when a filter is active', async () => {
    const onClearAll = vi.fn();
    await act(async () => {
      render(
        <FilterBar
          filters={{ ...emptyFilters, pending: 'true' }}
          onChange={vi.fn()}
          onClearAll={onClearAll}
          customPresets={[]}
          onApplyPreset={vi.fn()}
          onSavePreset={vi.fn()}
          onDeletePreset={vi.fn()}
        />
      );
    });

    expect(screen.getByText('Filtered')).toBeInTheDocument();
    const clearButton = screen.getByRole('button', { name: /clear all filters/i });
    expect(clearButton).toBeInTheDocument();

    fireEvent.click(clearButton);
    expect(onClearAll).toHaveBeenCalledTimes(1);
  });

  it('displays Filtered badge when search is active', async () => {
    await act(async () => {
      render(
        <FilterBar
          filters={{ ...emptyFilters, search: 'coffee' }}
          onChange={vi.fn()}
          onClearAll={vi.fn()}
          customPresets={[]}
          onApplyPreset={vi.fn()}
          onSavePreset={vi.fn()}
          onDeletePreset={vi.fn()}
        />
      );
    });

    expect(screen.getByText('Filtered')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /clear all filters/i })).toBeInTheDocument();
  });
});
