import { describe, it, expect } from 'vitest';
import {
  computeRecurringSummaryFromItems,
  type RecurringItem,
} from '@/lib/services/recurring-detection';

function mockItem(overrides: Partial<RecurringItem> = {}): RecurringItem {
  return {
    id: overrides.id || 'rec-1',
    userId: 'user-1',
    merchantName: 'Netflix',
    matchPattern: 'netflix',
    displayName: 'Netflix',
    customName: null,
    notes: null,
    accountId: 'acc-1',
    accountName: 'Checking',
    categoryId: 'cat-1',
    categoryName: 'Entertainment',
    categoryColor: '#6366f1',
    isDiscretionary: true,
    frequency: 'monthly',
    averageAmount: 15,
    lastAmount: 15,
    monthlyAmount: 15,
    annualAmount: 180,
    lastDate: '2026-08-01',
    nextExpectedDate: '2026-09-01',
    daysUntilNext: 20,
    isOverdue: false,
    flowType: 'expense',
    isConfirmed: true,
    isDismissed: false,
    isPaused: false,
    occurrenceCount: 5,
    confidence: 90,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe('Recurring Subscriptions & Non-Discretionary Summary', () => {
  it('correctly splits expenses into discretionary subscriptions and fixed commitments', () => {
    const items: RecurringItem[] = [
      // Discretionary subscriptions
      mockItem({
        id: 'sub-1',
        displayName: 'Netflix',
        monthlyAmount: 15.99,
        annualAmount: 191.88,
        isDiscretionary: true,
      }),
      mockItem({
        id: 'sub-2',
        displayName: 'Spotify',
        monthlyAmount: 10.99,
        annualAmount: 131.88,
        isDiscretionary: true,
      }),
      // Fixed non-discretionary commitments
      mockItem({
        id: 'fixed-1',
        displayName: 'Apartment Rent',
        monthlyAmount: 1500,
        annualAmount: 18000,
        isDiscretionary: false,
      }),
      mockItem({
        id: 'fixed-2',
        displayName: 'Electric Utility',
        monthlyAmount: 120,
        annualAmount: 1440,
        isDiscretionary: false,
      }),
      // Income item
      mockItem({
        id: 'inc-1',
        displayName: 'Employer Paycheck',
        flowType: 'income',
        monthlyAmount: 4000,
        annualAmount: 48000,
      }),
    ];

    const summary = computeRecurringSummaryFromItems(items);

    // Total expenses
    expect(summary.expenseCount).toBe(4);
    expect(summary.monthlyExpenses).toBe(1646.98);
    expect(summary.annualExpenses).toBe(19763.76);

    // Subscriptions (discretionary)
    expect(summary.subscriptionCount).toBe(2);
    expect(summary.monthlySubscriptions).toBe(26.98);
    expect(summary.annualSubscriptions).toBe(323.76);

    // Fixed bills (non-discretionary)
    expect(summary.fixedCount).toBe(2);
    expect(summary.monthlyFixed).toBe(1620);
    expect(summary.annualFixed).toBe(19440);

    // Income
    expect(summary.incomeCount).toBe(1);
    expect(summary.monthlyIncome).toBe(4000);
  });

  it('treats items without explicit isDiscretionary flag as discretionary by default', () => {
    const items: RecurringItem[] = [
      mockItem({
        id: 'sub-default',
        displayName: 'Gym Membership',
        monthlyAmount: 45,
        annualAmount: 540,
        isDiscretionary: undefined,
      }),
    ];

    const summary = computeRecurringSummaryFromItems(items);
    expect(summary.subscriptionCount).toBe(1);
    expect(summary.monthlySubscriptions).toBe(45);
    expect(summary.fixedCount).toBe(0);
    expect(summary.monthlyFixed).toBe(0);
  });

  it('omits paused and dismissed items from active subscription and fixed totals', () => {
    const items: RecurringItem[] = [
      mockItem({
        id: 'sub-active',
        displayName: 'Cloud Storage',
        monthlyAmount: 9.99,
        annualAmount: 119.88,
        isDiscretionary: true,
        isPaused: false,
      }),
      mockItem({
        id: 'sub-paused',
        displayName: 'Hulu',
        monthlyAmount: 14.99,
        annualAmount: 179.88,
        isDiscretionary: true,
        isPaused: true,
      }),
      mockItem({
        id: 'fixed-dismissed',
        displayName: 'Old Car Insurance',
        monthlyAmount: 110,
        annualAmount: 1320,
        isDiscretionary: false,
        isDismissed: true,
      }),
    ];

    const summary = computeRecurringSummaryFromItems(items);
    expect(summary.subscriptionCount).toBe(1);
    expect(summary.monthlySubscriptions).toBe(9.99);
    expect(summary.pausedCount).toBe(1);
    expect(summary.fixedCount).toBe(0);
    expect(summary.monthlyFixed).toBe(0);
  });

  it('safely handles items with negative amounts normalizing them to positive magnitudes', () => {
    const items: RecurringItem[] = [
      mockItem({
        id: 'sub-neg',
        displayName: 'Sub With Negative Raw Amount',
        monthlyAmount: -10,
        annualAmount: -120,
        isDiscretionary: true,
      }),
    ];

    const summary = computeRecurringSummaryFromItems(items);
    expect(summary.monthlySubscriptions).toBe(10);
    expect(summary.annualSubscriptions).toBe(120);
    expect(summary.monthlyExpenses).toBe(10);
  });
});
