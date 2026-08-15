// @vitest-environment jsdom
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ChangelogModal } from '@/components/changelog-modal';
import { GET } from '@/app/api/changelog/route';

// Mock dialog component if needed or use real components
vi.mock('@/components/ui/dialog', () => ({
  Dialog: ({ open, children }: any) => (open ? <div data-testid="dialog">{children}</div> : null),
  DialogContent: ({ children }: any) => <div data-testid="dialog-content">{children}</div>,
  DialogHeader: ({ children }: any) => <div>{children}</div>,
  DialogTitle: ({ children }: any) => <h2>{children}</h2>,
  DialogDescription: ({ children }: any) => <p>{children}</p>,
}));

vi.mock('@/lib/auth', () => ({
  auth: vi.fn().mockResolvedValue({ user: { id: 'test-user' } }),
}));

describe('Changelog Feature', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('GET /api/changelog returns valid JSON structure', async () => {
    const response = await GET();
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data).toHaveProperty('buildNumber');
    expect(data).toHaveProperty('commits');
    expect(data).toHaveProperty('history');
    expect(Array.isArray(data.commits)).toBe(true);
    expect(Array.isArray(data.history)).toBe(true);
  });

  it('ChangelogModal renders and opens on custom event "open-changelog"', async () => {
    const mockData = {
      buildNumber: '26.08.12345',
      buildTime: '2026-08-01T12:00:00.000Z',
      commits: ['feat: add new feature', 'fix: resolve bug'],
      history: [
        {
          hash: 'abc1234',
          author: 'Test Dev',
          date: '2026-08-01T12:00:00.000Z',
          message: 'feat: add new feature',
          type: 'feat',
        },
        {
          hash: 'def5678',
          author: 'Test Dev',
          date: '2026-08-01T11:00:00.000Z',
          message: 'fix: resolve bug',
          type: 'fix',
        },
      ],
    };

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockData,
    } as Response);

    render(<ChangelogModal />);

    // Initially closed
    expect(screen.queryByTestId('dialog')).toBeNull();

    // Trigger custom event
    fireEvent(window, new CustomEvent('open-changelog'));

    // Verify modal appears and displays data
    await waitFor(() => {
      expect(screen.getByTestId('dialog')).not.toBeNull();
      expect(screen.getByText('Changelog & Recent Releases')).not.toBeNull();
    });

    await waitFor(() => {
      expect(screen.getByText('feat: add new feature')).not.toBeNull();
      expect(screen.getByText('fix: resolve bug')).not.toBeNull();
      expect(screen.getByText('26.08.12345')).not.toBeNull();
    });
  });

  it('ChangelogModal filters commit history by search query', async () => {
    const mockData = {
      buildNumber: '26.08.12345',
      commits: [],
      history: [
        {
          hash: 'aaa111',
          author: 'Alice',
          date: '2026-08-01T12:00:00.000Z',
          message: 'feat: dark mode theme',
          type: 'feat',
        },
        {
          hash: 'bbb222',
          author: 'Bob',
          date: '2026-08-01T11:00:00.000Z',
          message: 'fix: payment calculations',
          type: 'fix',
        },
      ],
    };

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockData,
    } as Response);

    render(<ChangelogModal open={true} />);

    await waitFor(() => {
      expect(screen.getByText('feat: dark mode theme')).not.toBeNull();
      expect(screen.getByText('fix: payment calculations')).not.toBeNull();
    });

    const searchInput = screen.getByPlaceholderText('Search changes, authors, or commits...');
    fireEvent.change(searchInput, { target: { value: 'payment' } });

    await waitFor(() => {
      expect(screen.queryByText('feat: dark mode theme')).toBeNull();
      expect(screen.getByText('fix: payment calculations')).not.toBeNull();
    });
  });

  it('GET /api/changelog preserves stored history when git log is shallow', async () => {
    const response = await GET();
    const data = await response.json();
    expect(data.history.length).toBeGreaterThan(1);
  });
});
