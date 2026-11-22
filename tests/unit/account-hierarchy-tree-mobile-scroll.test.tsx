// @vitest-environment jsdom
import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import '@testing-library/jest-dom';

vi.mock('@/components/user-settings-provider', () => ({
  useUserSettings: () => ({
    settings: {},
    updateSetting: vi.fn(),
    loading: false,
  }),
}));

vi.mock('@/components/features/accounts/account-transactions', () => ({
  AccountTransactions: ({ accountId }: { accountId: string }) => (
    <div data-testid={`account-transactions-stub-${accountId}`} />
  ),
}));
vi.mock('@/components/features/accounts/account-detail-panel', () => ({
  default: ({ account }: { account: { name: string } | null }) => (
    <div data-testid="account-detail-panel-stub" data-account-name={account?.name ?? 'none'} />
  ),
}));
vi.mock('@/components/features/accounts/group-detail-panel', () => ({
  default: ({ group }: { group: string | null }) => (
    <div data-testid="group-detail-panel-stub" data-group={group ?? 'none'} />
  ),
}));
vi.mock('@/components/features/accounts/all-accounts-detail-panel', () => ({
  default: ({ onClose, isInline }: { onClose: () => void; isInline?: boolean }) => (
    <div data-testid="all-accounts-detail-panel-stub">
      {!isInline && (
        <button type="button" aria-label="Close all accounts overview" onClick={onClose} />
      )}
    </div>
  ),
}));
vi.mock('recharts', () => ({
  ResponsiveContainer: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  AreaChart: () => null,
  PieChart: () => null,
  Area: () => null,
  Pie: () => null,
  Cell: () => null,
  CartesianGrid: () => null,
  ReferenceLine: () => null,
  Tooltip: () => null,
  XAxis: () => null,
  YAxis: () => null,
}));

import AccountHierarchyTree from '@/components/features/accounts/account-hierarchy-tree';
import type { Account } from '@/components/features/accounts/account-types';

const accounts: Account[] = [
  {
    id: 'acc_checking',
    name: 'Main Checking',
    type: 'checking',
    balance: 2000,
    currency: 'USD',
    institution: 'Chase',
    isHidden: false,
    isExcludedFromNetWorth: false,
  },
  {
    id: 'acc_inv',
    name: 'Brokerage',
    type: 'investment',
    balance: 15000,
    currency: 'USD',
    institution: 'Fidelity',
    isHidden: false,
    isExcludedFromNetWorth: false,
  },
];

function makeRect(top: number, height: number): DOMRect {
  return {
    x: 0,
    y: top,
    top,
    left: 0,
    bottom: top + height,
    right: 390,
    width: 390,
    height,
    toJSON: () => ({}),
  } as DOMRect;
}

describe('AccountHierarchyTree mobile scroll anchoring', () => {
  let currentScrollY = 0;
  const allPanelHeight = 500;
  const bankingPanelHeight = 460;
  let investmentsPanelHeight = 420;
  let checkingExpandedHeight = 360;
  let scrollToSpy: ReturnType<typeof vi.spyOn>;
  let scrollIntoViewSpy: ReturnType<typeof vi.fn<(arg?: boolean | ScrollIntoViewOptions) => void>>;

  beforeEach(() => {
    vi.useFakeTimers();
    localStorage.clear();
    currentScrollY = 0;
    investmentsPanelHeight = 420;
    checkingExpandedHeight = 360;

    Object.defineProperty(window, 'innerWidth', {
      writable: true,
      configurable: true,
      value: 390,
    });
    Object.defineProperty(window, 'innerHeight', {
      writable: true,
      configurable: true,
      value: 844,
    });
    Object.defineProperty(window, 'scrollY', {
      configurable: true,
      get: () => currentScrollY,
    });

    scrollToSpy = vi.spyOn(window, 'scrollTo').mockImplementation((arg1: unknown, arg2?: unknown) => {
      if (typeof arg1 === 'number' && typeof arg2 === 'number') {
        currentScrollY = arg2;
      } else if (
        arg1 &&
        typeof arg1 === 'object' &&
        'top' in arg1 &&
        typeof (arg1 as ScrollToOptions).top === 'number'
      ) {
        currentScrollY = (arg1 as ScrollToOptions).top as number;
      }
    });

    scrollIntoViewSpy = vi.fn<(arg?: boolean | ScrollIntoViewOptions) => void>();
    HTMLElement.prototype.scrollIntoView = scrollIntoViewSpy;

    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
      this: HTMLElement,
    ) {
      const allOpen = Boolean(document.getElementById('hierarchy-all-accounts-detail-inline'));
      const offset1 = allOpen ? allPanelHeight : 0;

      const groupInline = document.getElementById('hierarchy-group-detail-inline');
      const groupStub = groupInline?.querySelector('[data-group]');
      const activeGroup = groupStub?.getAttribute('data-group');
      const bankingOpen = activeGroup === 'Banking';
      const investmentsOpen = activeGroup === 'Investments';

      const checkingRow = document.getElementById('account-row-acc_checking');
      const checkingCard = checkingRow?.parentElement ?? null;
      const checkingOpen = Boolean(checkingCard?.classList.contains('account-selected-card'));

      const bankingOffset = bankingOpen ? bankingPanelHeight : 0;
      const checkingExtra = checkingOpen ? checkingExpandedHeight - 52 : 0;

      if (this.id === 'account-row-acc_checking') {
        return makeRect(260 + offset1 + bankingOffset - currentScrollY, 52);
      }
      if (this === checkingCard) {
        return makeRect(
          260 + offset1 + bankingOffset - currentScrollY,
          checkingOpen ? checkingExpandedHeight : 52,
        );
      }
      if (
        this.className.includes('cursor-pointer') &&
        this.textContent?.includes('Investments')
      ) {
        return makeRect(420 + offset1 + bankingOffset + checkingExtra - currentScrollY, 56);
      }
      if (
        !this.className.includes('cursor-pointer') &&
        this.querySelector('#hierarchy-group-detail-inline [data-group="Investments"]')
      ) {
        return makeRect(
          420 + offset1 + bankingOffset + checkingExtra - currentScrollY,
          investmentsOpen ? investmentsPanelHeight : 56,
        );
      }
      if (
        this.className.includes('cursor-pointer') &&
        this.textContent?.includes('Banking')
      ) {
        return makeRect(160 + offset1 - currentScrollY, 56);
      }
      return makeRect(0, 52);
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  const baseProps = {
    filteredAllAccounts: accounts,
    allTags: [],
    historyData: [],
    accountsLoading: false,
    targetAccountId: null,
  };

  it('prevents the 150ms deep-link scrollIntoView from fighting mobile account taps', () => {
    render(<AccountHierarchyTree {...baseProps} />);

    const checkingRow = document.getElementById('account-row-acc_checking')!;
    fireEvent.click(checkingRow);

    act(() => {
      vi.advanceTimersByTime(300);
    });

    expect(scrollIntoViewSpy).not.toHaveBeenCalled();
  });

  it('compensates synchronously before paint when collapsing a tall panel above an opened account and scrolls smoothly once if card overflows', () => {
    currentScrollY = 500;
    checkingExpandedHeight = 620;

    render(<AccountHierarchyTree {...baseProps} />);
    scrollToSpy.mockClear();

    const checkingRow = document.getElementById('account-row-acc_checking')!;
    // Before click: docTop = 260 + 500 = 760, scrollY = 500 -> beforeTop = 260
    fireEvent.click(checkingRow);

    // Pre-paint synchronous compensation cancels the -500px collapse immediately
    expect(scrollToSpy).toHaveBeenCalledTimes(1);
    expect(scrollToSpy).toHaveBeenNthCalledWith(1, 0, 0);
    expect(currentScrollY).toBe(0);

    // Next frame: cardRect.bottom = 260 + 620 = 880 > viewportBottom (760),
    // neededDown = 120 <= maxDown (260 - 72 = 188) -> single smooth scroll to 120
    act(() => {
      vi.advanceTimersByTime(20);
    });

    expect(scrollToSpy).toHaveBeenCalledTimes(2);
    expect(scrollToSpy).toHaveBeenNthCalledWith(2, { top: 120, behavior: 'smooth' });

    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(scrollToSpy).toHaveBeenCalledTimes(2);
    expect(scrollIntoViewSpy).not.toHaveBeenCalled();
  });

  it('anchors group selection when All Accounts collapses above it and skips scrolling if already selected or fits', () => {
    currentScrollY = 600;
    investmentsPanelHeight = 420;

    render(<AccountHierarchyTree {...baseProps} />);
    scrollToSpy.mockClear();

    // Investments beforeTop = 420 + 500 - 600 = 320
    const investmentsHeader = screen.getByText('Investments').closest('.cursor-pointer')!;
    fireEvent.click(investmentsHeader);

    // Pre-paint anchor pulls scrollY from 600 to 100 so Investments stays at top=320
    expect(scrollToSpy).toHaveBeenCalledTimes(1);
    expect(scrollToSpy).toHaveBeenNthCalledWith(1, 0, 100);

    // Card bottom = 320 + 420 = 740 <= 760 -> fits comfortably, no smooth jump
    act(() => {
      vi.advanceTimersByTime(250);
    });
    expect(scrollToSpy).toHaveBeenCalledTimes(1);

    // Tapping an already-selected group triggers no scroll
    scrollToSpy.mockClear();
    fireEvent.click(investmentsHeader);
    act(() => {
      vi.advanceTimersByTime(250);
    });
    expect(scrollToSpy).not.toHaveBeenCalled();
  });

  it('nudges an account opened behind the mobile top clearance down to MOBILE_TOP_CLEARANCE (72px)', () => {
    render(<AccountHierarchyTree {...baseProps} />);

    // Close All Accounts first so no panel is above
    fireEvent.click(screen.getByLabelText('Close all accounts overview'));
    currentScrollY = 240; // Main Checking docTop = 260 -> beforeTop = 20 (< 72)
    scrollToSpy.mockClear();

    const checkingRow = document.getElementById('account-row-acc_checking')!;
    fireEvent.click(checkingRow);

    // No layout shift above -> no synchronous scrollTo
    expect(scrollToSpy).not.toHaveBeenCalled();

    // rAF nudges header from top=20 down to top=72 -> scrollY = 240 + (20 - 72) = 188
    act(() => {
      vi.advanceTimersByTime(20);
    });
    expect(scrollToSpy).toHaveBeenCalledTimes(1);
    expect(scrollToSpy).toHaveBeenCalledWith({ top: 188, behavior: 'smooth' });
  });

  it('does not scroll when collapsing an account or when clicking on desktop (>= 1024px)', () => {
    render(<AccountHierarchyTree {...baseProps} />);

    const checkingRow = document.getElementById('account-row-acc_checking')!;
    fireEvent.click(checkingRow);
    act(() => {
      vi.advanceTimersByTime(50);
    });
    scrollToSpy.mockClear();

    // Collapse expanded account -> zero scroll
    fireEvent.click(checkingRow);
    act(() => {
      vi.advanceTimersByTime(250);
    });
    expect(scrollToSpy).not.toHaveBeenCalled();
    expect(scrollIntoViewSpy).not.toHaveBeenCalled();

    // Desktop width -> zero mobile scrollTo
    Object.defineProperty(window, 'innerWidth', {
      writable: true,
      configurable: true,
      value: 1280,
    });
    fireEvent.click(checkingRow);
    act(() => {
      vi.advanceTimersByTime(250);
    });
    expect(scrollToSpy).not.toHaveBeenCalled();
    expect(scrollIntoViewSpy).not.toHaveBeenCalled();
  });

  it('scrolls deep-linked targetAccountId with top clearance on mobile and cancels if user taps before timer fires', () => {
    const { rerender } = render(
      <AccountHierarchyTree {...baseProps} targetAccountId="acc_checking" />,
    );

    act(() => {
      vi.advanceTimersByTime(160);
    });
    // docTop = 260, clearance = 72 -> 188
    expect(scrollToSpy).toHaveBeenCalledTimes(1);
    expect(scrollToSpy).toHaveBeenCalledWith({ top: 188, behavior: 'smooth' });
    expect(scrollIntoViewSpy).not.toHaveBeenCalled();

    // Desktop deep-link uses scrollIntoView center
    scrollToSpy.mockClear();
    Object.defineProperty(window, 'innerWidth', {
      writable: true,
      configurable: true,
      value: 1280,
    });
    rerender(<AccountHierarchyTree {...baseProps} targetAccountId="acc_inv" />);
    act(() => {
      vi.advanceTimersByTime(160);
    });
    expect(scrollIntoViewSpy).toHaveBeenCalledWith({ behavior: 'smooth', block: 'center' });

    // Mobile deep-link cancelled if user clicks a group before 150ms
    scrollToSpy.mockClear();
    scrollIntoViewSpy.mockClear();
    Object.defineProperty(window, 'innerWidth', {
      writable: true,
      configurable: true,
      value: 390,
    });
    rerender(<AccountHierarchyTree {...baseProps} targetAccountId="acc_checking" />);
    const investmentsHeader = screen.getByText('Investments').closest('.cursor-pointer')!;
    fireEvent.click(investmentsHeader);

    act(() => {
      vi.advanceTimersByTime(250);
    });
    expect(scrollIntoViewSpy).not.toHaveBeenCalled();
    // Only the Investments scroll ran, never the deep-link smooth scroll to 188
    expect(scrollToSpy).not.toHaveBeenCalledWith({ top: 188, behavior: 'smooth' });
  });
});
