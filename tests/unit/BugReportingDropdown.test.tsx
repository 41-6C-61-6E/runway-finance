// @vitest-environment jsdom
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import BugReportingDropdown from '@/components/bug-reporting-dropdown';

// Mock next/navigation (component imports nothing from it directly, but a
// transitive dependency may)
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
  }),
}));

// Mock sonner toast
vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

// Mock Tooltip components to avoid portal/provider issues in jsdom
vi.mock('@/components/ui/tooltip', () => ({
  Tooltip: ({ children }: any) => <>{children}</>,
  TooltipTrigger: ({ children }: any) => <>{children}</>,
  TooltipContent: ({ children }: any) => <>{children}</>,
  TooltipProvider: ({ children }: any) => <>{children}</>,
}));

interface TestIssue {
  id: string;
  type: 'bug' | 'feature';
  title: string;
  description: string;
  status: string;
}

function makeIssue(overrides: Partial<TestIssue> & Pick<TestIssue, 'id'>): TestIssue {
  return {
    type: 'bug',
    title: 'Test issue',
    description: 'A test issue for the badge',
    status: 'reported',
    ...overrides,
  };
}

describe('BugReportingDropdown badge', () => {
  let originalFetch: typeof global.fetch;
  let mockFetch: any;
  let currentIssues: TestIssue[];
  let configEnabled: boolean;

  const trigger = (container: HTMLElement) => container.querySelector('button');

  const badgeIn = (container: HTMLElement) => {
    const btn = container.querySelector('button') as HTMLButtonElement | null;
    return btn?.querySelector('span');
  };

  const renderDropdown = () => {
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });
    return render(
      <QueryClientProvider client={queryClient}>
        <BugReportingDropdown />
      </QueryClientProvider>,
    );
  };

  beforeEach(() => {
    vi.clearAllMocks();
    originalFetch = global.fetch;
    currentIssues = [];
    configEnabled = true;

    mockFetch = vi.fn().mockImplementation((url: string) => {
      if (url === '/api/bug-reporting/config') {
        return Promise.resolve({ ok: true, json: async () => ({ enabled: configEnabled }) });
      }
      if (url === '/api/bug-reporting') {
        return Promise.resolve({ ok: true, json: async () => currentIssues });
      }
      return Promise.resolve({ ok: true, json: async () => ({}) });
    });
    global.fetch = mockFetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('renders no badge when there are no issues', async () => {
    const { container } = renderDropdown();

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith('/api/bug-reporting');
    });
    expect(trigger(container)).toBeTruthy(); // icon renders
    expect(badgeIn(container)).toBeNull();
  });

  it('counts an open bug and colors the badge destructive (red)', async () => {
    currentIssues = [makeIssue({ id: 'bug-1' })]; // type: bug, status: reported
    const { container } = renderDropdown();

    const badge = await screen.findByText('1');
    expect(badge).toBeTruthy();
    expect(badge.className).toContain('bg-destructive');
    expect(container).toBeTruthy();
  });

  it('counts an open feature request and colors the badge with the accent', async () => {
    currentIssues = [
      makeIssue({ id: 'feat-1', type: 'feature', status: 'requested' }),
    ];
    const { container } = renderDropdown();

    const badge = await screen.findByText('1');
    expect(badge.className).toContain('bg-primary');
    expect(container).toBeTruthy();
  });

  it('prioritizes the bug (destructive) color when bugs and features are both open', async () => {
    currentIssues = [
      makeIssue({ id: 'bug-1' }),
      makeIssue({ id: 'feat-1', type: 'feature', status: 'requested' }),
    ];
    const { container } = renderDropdown();

    const badge = await screen.findByText('2');
    expect(badge.className).toContain('bg-destructive');
  });

  it('renders nothing when the feature flag is disabled', async () => {
    configEnabled = false;
    currentIssues = [makeIssue({ id: 'bug-1' })];
    const { container } = renderDropdown();

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith('/api/bug-reporting/config');
    });
    expect(container.innerHTML).toBe('');
    // The issues endpoint must never be called when disabled
    expect(mockFetch).not.toHaveBeenCalledWith('/api/bug-reporting');
  });
});
