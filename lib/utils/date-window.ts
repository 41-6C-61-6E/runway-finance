import type { TimeRange } from '@/components/charts/chart-filters';

export function getCurrentMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

export function snapToPeriod(ym: string, timeframe: TimeRange): string {
  const [y, m] = ym.split('-').map(Number);
  const [cy, cm] = getCurrentMonth().split('-').map(Number);
  let sy = y, sm = m;
  switch (timeframe) {
    case '3m': {
      const q = Math.ceil(m / 3);
      const qEnd = q * 3;
      if (m >= qEnd) { sm = qEnd; }
      else {
        const prev = qEnd - 3;
        if (prev <= 0) { sy = y - 1; sm = 12; }
        else { sm = prev; }
      }
      break;
    }
    case '6m': {
      if (m >= 12) { sm = 12; }
      else if (m >= 6) { sm = 6; }
      else { sy = y - 1; sm = 12; }
      break;
    }
    case '1y': { sm = 12; break; }
    default: break;
  }
  if (timeframe !== '1y' && (sy > cy || (sy === cy && sm > cm))) return getCurrentMonth();
  return `${sy}-${String(sm).padStart(2, '0')}`;
}

export function getMonthRange(timeframe: TimeRange, windowEnd?: string): { start: string; end: string } {
  const currentYm = getCurrentMonth();
  const end = windowEnd || currentYm;

  if (timeframe === 'all') {
    return { start: '2000-01', end: currentYm };
  }

  if (timeframe === 'ytd') {
    const [cy] = currentYm.split('-').map(Number);
    return { start: `${cy}-01`, end: currentYm };
  }

  const monthsBack = ({ '1m': 0, '3m': 2, '6m': 5, '1y': 11 } as Record<string, number>)[timeframe] ?? 0;
  const [ey, em] = end.split('-').map(Number);
  const start = new Date(ey, em - 1 - monthsBack, 1);
  return {
    start: `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}`,
    end,
  };
}

export function formatMonth(ym: string): string {
  const [y, m] = ym.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

export function getPeriodLabel(ym: string, timeframe: TimeRange): string {
  if (timeframe === 'all') return 'All time';
  const [y, m] = ym.split('-').map(Number);
  switch (timeframe) {
    case '1m': return formatMonth(ym);
    case '3m': return `Q${m / 3} ${y}`;
    case '6m': return `H${m / 6} ${y}`;
    case '1y': return `${y}`;
    case 'ytd': return `YTD ${y}`;
    default: return '';
  }
}
