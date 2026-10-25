import { describe, it, expect } from 'vitest';
import {
  computeGridRange,
  buildCalendarCells,
  getHeatLevel,
  summarizeMonth,
  localDateStr,
  type CalendarCell,
} from '@/components/cash-flow/calendar/calendar-cells';
import type { UpcomingBill } from '@/lib/services/recurring-detection';
import type { DailyCashFlowDay } from '@/lib/finance/daily-cash-flow';

describe('calendar-cells', () => {
  it('computes grid range correctly for a standard month', () => {
    // October 2026: Oct 1 is Thursday (day 4). Days in Sept = 30.
    // Trailing days: Sept 27, 28, 29, 30 (4 days)
    // Days in Oct: 31
    // Total filled: 35 cells.
    const { gridStart, gridEnd } = computeGridRange(2026, 9); // month index 9 is October
    expect(gridStart).toBe('2026-09-27');
    expect(gridEnd).toBe('2026-10-31');
  });

  it('calculates heat levels correctly', () => {
    expect(getHeatLevel(0, 100)).toBe(0);
    expect(getHeatLevel(-20, 100)).toBe(0);
    expect(getHeatLevel(20, 100)).toBe(1); // 4 * 20 / 100 = 0.8 -> ceil 1
    expect(getHeatLevel(50, 100)).toBe(2); // 4 * 50 / 100 = 2 -> 2
    expect(getHeatLevel(80, 100)).toBe(4); // 4 * 80 / 100 = 3.2 -> ceil 4
    expect(getHeatLevel(150, 100)).toBe(4); // max 4
    expect(getHeatLevel(50, 0)).toBe(1);
  });

  it('builds calendar cells with correct kind, actuals, and heat levels', () => {
    const todayStr = '2026-10-15';
    const billsByDate = new Map<string, UpcomingBill[]>();
    const actualsByDate = new Map<string, DailyCashFlowDay>([
      [
        '2026-10-10',
        {
          date: '2026-10-10',
          income: 0,
          expenses: 200,
          net: -200,
          transactionCount: 2,
          pendingCount: 0,
          topItems: [],
          topCategories: [],
        },
      ],
      [
        '2026-10-15',
        {
          date: '2026-10-15',
          income: 1000,
          expenses: 50,
          net: 950,
          transactionCount: 1,
          pendingCount: 0,
          topItems: [],
          topCategories: [],
        },
      ],
    ]);

    const cells = buildCalendarCells({
      year: 2026,
      month: 9, // October
      todayStr,
      billsByDate,
      actualsByDate,
    });

    expect(cells.length).toBe(35);

    const pastCell = cells.find((c) => c.dateStr === '2026-10-10');
    expect(pastCell).toBeDefined();
    expect(pastCell?.kind).toBe('past');
    expect(pastCell?.actual?.expenses).toBe(200);
    expect(pastCell?.heatLevel).toBeGreaterThan(0);

    const todayCell = cells.find((c) => c.dateStr === '2026-10-15');
    expect(todayCell).toBeDefined();
    expect(todayCell?.kind).toBe('today');
    expect(todayCell?.isToday).toBe(true);

    const futureCell = cells.find((c) => c.dateStr === '2026-10-20');
    expect(futureCell).toBeDefined();
    expect(futureCell?.kind).toBe('future');
  });

  it('summarizes month correctly combining actuals and future projections', () => {
    const todayStr = '2026-10-15';
    const mockCells: CalendarCell[] = [
      {
        dateStr: '2026-10-10',
        dayNumber: 10,
        monthShort: 'Oct',
        dayOfWeek: 6,
        isCurrentMonth: true,
        isToday: false,
        kind: 'past',
        bills: [],
        billInflow: 0,
        billOutflow: 0,
        actual: {
          date: '2026-10-10',
          income: 500,
          expenses: 200,
          net: 300,
          transactionCount: 2,
          pendingCount: 0,
          topItems: [],
          topCategories: [],
        },
        heatLevel: 2,
      },
      {
        dateStr: '2026-10-20',
        dayNumber: 20,
        monthShort: 'Oct',
        dayOfWeek: 2,
        isCurrentMonth: true,
        isToday: false,
        kind: 'future',
        bills: [
          {
            id: 'b-1',
            recurringId: 'rec-1',
            merchantName: 'Electric Co',
            displayName: 'Electric',
            amount: 150,
            expectedDate: '2026-10-20',
            frequency: 'monthly',
            flowType: 'expense',
            accountName: 'Checking',
            categoryName: 'Utilities',
            categoryColor: '#38bdf8',
            isEstimate: false,
            daysUntil: 5,
            isOverdue: false,
          },
          {
            id: 'b-2',
            recurringId: 'rec-2',
            merchantName: 'Overdue Bill',
            displayName: 'Overdue',
            amount: 50,
            expectedDate: '2026-10-20',
            frequency: 'monthly',
            flowType: 'expense',
            accountName: 'Checking',
            categoryName: 'Utilities',
            categoryColor: '#38bdf8',
            isEstimate: false,
            daysUntil: -2,
            isOverdue: true, // Should be excluded from forward upcoming bills
          },
        ],
        billInflow: 0,
        billOutflow: 200,
        heatLevel: 0,
      },
    ];

    const summary = summarizeMonth(mockCells, todayStr);
    expect(summary.monthType).toBe('current');
    expect(summary.totalActualIncome).toBe(500);
    expect(summary.totalActualExpenses).toBe(200);
    expect(summary.actualNet).toBe(300);
    expect(summary.biggestDay?.amount).toBe(200);
    expect(summary.upcomingBills).toBe(150); // b-2 overdue was excluded
    expect(summary.projectedNet).toBe(150); // 300 - 150 = 150
  });
});
