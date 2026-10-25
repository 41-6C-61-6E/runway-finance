import type { UpcomingBill } from '@/lib/services/recurring-detection';
import type { DailyCashFlowDay } from '@/lib/finance/daily-cash-flow';
import { roundToCents } from '@/lib/utils/format';

export type DayKind = 'past' | 'today' | 'future';

export const HEAT_CLASSES = [
  '',
  'bg-rose-500/[0.04]',
  'bg-rose-500/[0.07]',
  'bg-rose-500/[0.11]',
  'bg-rose-500/[0.15]',
] as const;

export interface CalendarCell {
  dateStr: string;
  dayNumber: number;
  monthShort: string;
  dayOfWeek: number;
  isCurrentMonth: boolean;
  isToday: boolean;
  kind: DayKind;
  bills: UpcomingBill[];
  billInflow: number;
  billOutflow: number;
  actual?: DailyCashFlowDay;
  heatLevel: 0 | 1 | 2 | 3 | 4;
}

export interface MonthSummary {
  monthType: 'past' | 'current' | 'future';
  totalActualIncome: number;
  totalActualExpenses: number;
  actualNet: number;
  avgDailySpend: number;
  biggestDay: { dateStr: string; amount: number } | null;
  upcomingBills: number;
  upcomingIncome: number;
  projectedNet: number;
}

/** Formats a Date object to YYYY-MM-DD using local timezone. */
export const localDateStr = (d: Date): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/**
 * Computes the start and end dates covered by the calendar grid (including trailing and leading days).
 */
export function computeGridRange(year: number, month: number): { gridStart: string; gridEnd: string } {
  const firstDayOfMonth = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const daysInPrevMonth = new Date(year, month, 0).getDate();

  // First trailing day
  let gridStart: string;
  if (firstDayOfMonth > 0) {
    const startDay = daysInPrevMonth - (firstDayOfMonth - 1);
    gridStart = localDateStr(new Date(year, month - 1, startDay));
  } else {
    gridStart = localDateStr(new Date(year, month, 1));
  }

  // Count cells so far
  const trailingCount = firstDayOfMonth;
  const currentMonthCount = daysInMonth;
  const filled = trailingCount + currentMonthCount;
  const remaining = (7 - (filled % 7)) % 7;
  const totalNeeded = filled + remaining < 35 ? 35 - filled : remaining;

  const gridEnd = localDateStr(new Date(year, month + 1, totalNeeded));
  return { gridStart, gridEnd };
}

/**
 * Calculates the heat level (0 to 4) for an expense amount given the 90th percentile.
 */
export function getHeatLevel(expenses: number, p90: number): 0 | 1 | 2 | 3 | 4 {
  if (expenses <= 0) return 0;
  if (p90 <= 0) return 1;
  const level = Math.ceil((4 * expenses) / p90);
  return Math.min(4, Math.max(1, level)) as 0 | 1 | 2 | 3 | 4;
}

/**
 * Builds the complete grid cells for the calendar.
 */
export function buildCalendarCells(args: {
  year: number;
  month: number;
  todayStr: string;
  billsByDate: Map<string, UpcomingBill[]>;
  actualsByDate: Map<string, DailyCashFlowDay>;
  flowFilter?: 'all' | 'expense' | 'income';
}): CalendarCell[] {
  const { year, month, todayStr, billsByDate, actualsByDate } = args;

  const firstDayOfMonth = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const daysInPrevMonth = new Date(year, month, 0).getDate();

  interface RawCell {
    dateStr: string;
    dayNumber: number;
    monthShort: string;
    dayOfWeek: number;
    isCurrentMonth: boolean;
    isToday: boolean;
    kind: DayKind;
    bills: UpcomingBill[];
    billInflow: number;
    billOutflow: number;
    actual?: DailyCashFlowDay;
  }

  const rawCells: RawCell[] = [];

  const createCell = (d: Date, isCurrentMonth: boolean): RawCell => {
    const dStr = localDateStr(d);
    const dayBills = billsByDate.get(dStr) || [];
    const billInflow = dayBills
      .filter((b) => b.flowType === 'income')
      .reduce((sum, b) => sum + (Number.isFinite(b.amount) ? b.amount : 0), 0);
    const billOutflow = dayBills
      .filter((b) => b.flowType === 'expense')
      .reduce((sum, b) => sum + (Number.isFinite(b.amount) ? b.amount : 0), 0);

    const isToday = dStr === todayStr;
    const kind: DayKind = dStr < todayStr ? 'past' : isToday ? 'today' : 'future';
    const actual = actualsByDate.get(dStr);

    return {
      dateStr: dStr,
      dayNumber: d.getDate(),
      monthShort: d.toLocaleString('default', { month: 'short' }),
      dayOfWeek: d.getDay(),
      isCurrentMonth,
      isToday,
      kind,
      bills: dayBills,
      billInflow,
      billOutflow,
      actual,
    };
  };

  // 1. Previous month trailing days
  for (let i = firstDayOfMonth - 1; i >= 0; i--) {
    const dayNum = daysInPrevMonth - i;
    rawCells.push(createCell(new Date(year, month - 1, dayNum), false));
  }

  // 2. Current month days
  for (let d = 1; d <= daysInMonth; d++) {
    rawCells.push(createCell(new Date(year, month, d), true));
  }

  // 3. Next month leading days (to complete 35 or 42 grid cells)
  const remaining = (7 - (rawCells.length % 7)) % 7;
  const totalNeeded = rawCells.length + remaining < 35 ? 35 - rawCells.length : remaining;
  for (let d = 1; d <= totalNeeded; d++) {
    rawCells.push(createCell(new Date(year, month + 1, d), false));
  }

  // Compute p90 of positive daily expenses for heatmap
  const positiveExpenses: number[] = [];
  for (const cell of rawCells) {
    if (cell.kind !== 'future' && cell.actual && cell.actual.expenses > 0) {
      positiveExpenses.push(cell.actual.expenses);
    }
  }

  positiveExpenses.sort((a, b) => a - b);
  const p90 =
    positiveExpenses.length > 0
      ? positiveExpenses[Math.min(positiveExpenses.length - 1, Math.floor(positiveExpenses.length * 0.9))]
      : 0;

  return rawCells.map((cell) => ({
    ...cell,
    heatLevel: getHeatLevel(cell.actual?.expenses ?? 0, p90),
  }));
}

/**
 * Summarizes the viewed month combining actuals and forward projections.
 */
export function summarizeMonth(cells: CalendarCell[], todayStr: string): MonthSummary {
  const currentMonthCells = cells.filter((c) => c.isCurrentMonth);
  if (currentMonthCells.length === 0) {
    return {
      monthType: 'future',
      totalActualIncome: 0,
      totalActualExpenses: 0,
      actualNet: 0,
      avgDailySpend: 0,
      biggestDay: null,
      upcomingBills: 0,
      upcomingIncome: 0,
      projectedNet: 0,
    };
  }

  const firstDate = currentMonthCells[0].dateStr;
  const currentMonthKey = firstDate.slice(0, 7);
  const todayMonthKey = todayStr.slice(0, 7);

  const monthType: 'past' | 'current' | 'future' =
    currentMonthKey < todayMonthKey
      ? 'past'
      : currentMonthKey === todayMonthKey
      ? 'current'
      : 'future';

  let totalActualIncome = 0;
  let totalActualExpenses = 0;
  let daysWithActuals = 0;
  let biggestDay: { dateStr: string; amount: number } | null = null;

  let upcomingBills = 0;
  let upcomingIncome = 0;

  for (const cell of currentMonthCells) {
    if (cell.kind === 'past' || cell.kind === 'today') {
      if (cell.actual) {
        totalActualIncome += cell.actual.income;
        totalActualExpenses += cell.actual.expenses;
        daysWithActuals += 1;

        if (cell.actual.expenses > 0) {
          if (!biggestDay || cell.actual.expenses > biggestDay.amount) {
            biggestDay = { dateStr: cell.dateStr, amount: cell.actual.expenses };
          }
        }
      }
    }

    // Projections for future days and remaining today's bills (exclude overdue to avoid double-counting)
    if (cell.dateStr >= todayStr) {
      for (const bill of cell.bills) {
        if (bill.isOverdue) continue;
        if (bill.flowType === 'expense') {
          upcomingBills += bill.amount;
        } else {
          upcomingIncome += bill.amount;
        }
      }
    }
  }

  totalActualIncome = roundToCents(totalActualIncome);
  totalActualExpenses = roundToCents(totalActualExpenses);
  const actualNet = roundToCents(totalActualIncome - totalActualExpenses);
  const avgDailySpend = daysWithActuals > 0 ? roundToCents(totalActualExpenses / daysWithActuals) : 0;
  upcomingBills = roundToCents(upcomingBills);
  upcomingIncome = roundToCents(upcomingIncome);

  let projectedNet = actualNet;
  if (monthType === 'current') {
    projectedNet = roundToCents(actualNet + upcomingIncome - upcomingBills);
  } else if (monthType === 'future') {
    projectedNet = roundToCents(upcomingIncome - upcomingBills);
  }

  return {
    monthType,
    totalActualIncome,
    totalActualExpenses,
    actualNet,
    avgDailySpend,
    biggestDay,
    upcomingBills,
    upcomingIncome,
    projectedNet,
  };
}
