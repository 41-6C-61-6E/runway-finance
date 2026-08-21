// @vitest-environment jsdom
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { PerformanceChart } from '@/components/investments/performance-chart';
import { InvestmentsSummary } from '@/components/investments/investments-summary';

vi.mock('@/lib/hooks/use-card-collapsed', () => ({
  useCardCollapsed: () => [false, vi.fn()],
}));

vi.mock('@/components/privacy-mode-provider', () => ({
  usePrivacyMode: () => ({ privacyMode: false }),
}));

// Mock recharts ResponsiveContainer and chart primitives to prevent DOM measurement issues in jsdom
vi.mock('recharts', async () => {
  const actual = await vi.importActual<any>('recharts');
  return {
    ...actual,
    ResponsiveContainer: ({ children }: { children: React.ReactNode }) => (
      <div data-testid="responsive-container" style={{ width: 800, height: 400 }}>
        {children}
      </div>
    ),
  };
});

describe('Investments UI Enhancements', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('renders InvestmentsSummary with hidden md:block classes to exclude it on mobile screens', () => {
    const mockSummary = {
      totalBalance: 125000,
      totalCostBasis: 100000,
      totalUnrealizedGainLoss: 25000,
      totalUnrealizedReturnPct: 25,
      holdingsCount: 5,
      twrPct: 18.5,
    };

    const { container } = render(
      <InvestmentsSummary
        summary={mockSummary}
        accounts={[{ id: 'acc-1', name: 'Brokerage', balance: 125000, institution: 'Vanguard', type: 'brokerage' }]}
        holdings={[]}
      />
    );

    const rootCard = container.firstChild as HTMLElement;
    expect(rootCard).not.toBeNull();
    expect(rootCard.className).toContain('hidden');
    expect(rootCard.className).toContain('md:block');
    expect(screen.getByText('Portfolio Summary')).toBeDefined();
  });

  it('renders Portfolio TWR in PerformanceChart with interactive tooltip explaining the metric, calculation, and meaning', async () => {
    const mockHistoryResponse = {
      data: [
        { date: '2026-01-01', value: 10000, twr: 0 },
        { date: '2026-02-01', value: 11000, twr: 10 },
      ],
      summary: {
        current: 11000,
        previous: 10000,
        change: 1000,
        percentChange: 10,
        twrPct: 10.0,
      },
    };

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockHistoryResponse,
    });

    const user = userEvent.setup();
    render(<PerformanceChart />);

    // Wait for performance chart to finish loading data
    await waitFor(() => {
      expect(screen.getByText('Portfolio TWR:')).toBeDefined();
    });

    expect(screen.getByText('+10.00%')).toBeDefined();

    // Verify tooltip button trigger has descriptive aria-label
    const tooltipTrigger = screen.getByRole('button', {
      name: /Portfolio Time-Weighted Return explanation and calculation/i,
    });
    expect(tooltipTrigger).toBeDefined();

    // Trigger tooltip interaction
    await user.hover(tooltipTrigger);

    // Verify key conceptual sections are present
    await waitFor(() => {
      expect(screen.getByText('Time-Weighted Return (TWR)')).toBeDefined();
      expect(screen.getByText(/Measures true portfolio performance over time/i)).toBeDefined();
      expect(screen.getByText(/Ending Val - Net Cash Flow/i)).toBeDefined();
      expect(screen.getByText(/Positive \(\+%\)/i)).toBeDefined();
      expect(screen.getByText(/Negative \(-\%\)/i)).toBeDefined();
    });
  });
});
