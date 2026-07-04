import type { TimeRange } from '@/components/charts/chart-filters';

export function getCurrentMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

export function snapToPeriod(ym: string, timeframe: TimeRange): string {
  if (timeframe === '7d' || timeframe === '30d' || timeframe === '365d') return ym;
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
    case '5y':
    case '1y': { sm = 12; break; }
    default: break;
  }
  // Ensure the range does not start in the future
  const monthsBack = ({ '1m': 0, '3m': 2, '6m': 5, '1y': 11, '5y': 59 } as Record<string, number>)[timeframe] ?? 0;
  const start = new Date(sy, sm - 1 - monthsBack, 1);
  const startYm = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}`;
  const currentYm = getCurrentMonth();

  if (startYm > currentYm) {
    return snapToPeriod(currentYm, timeframe);
  }

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

  const monthsBack = ({ '1m': 0, '3m': 2, '6m': 5, '1y': 11, '5y': 59 } as Record<string, number>)[timeframe] ?? 0;
  const [ey, em] = end.split('-').map(Number);
  const start = new Date(ey, em - 1 - monthsBack, 1);
  return {
    start: `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}`,
    end,
  };
}

export function getPreciseDateRange(timeframe: TimeRange, windowEnd?: string): { start: string; end: string } {
  if (timeframe === '1d' || timeframe === '7d' || timeframe === '30d' || timeframe === '365d') {
    const end = new Date();
    const start = new Date();
    if (timeframe === '1d') start.setDate(start.getDate() - 1);
    if (timeframe === '7d') start.setDate(start.getDate() - 7);
    if (timeframe === '30d') start.setDate(start.getDate() - 30);
    if (timeframe === '365d') start.setDate(start.getDate() - 365);
    
    const formatDate = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    return { start: formatDate(start), end: formatDate(end) };
  }
  
  const mr = getMonthRange(timeframe, windowEnd);
  const startStr = mr.start + '-01';
  const [ey, em] = mr.end.split('-').map(Number);
  const endStr = mr.end + '-' + String(new Date(ey, em, 0).getDate()).padStart(2, '0');
  return { start: startStr, end: endStr };
}

export function formatMonth(ym: string): string {
  const [y, m] = ym.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

export function getPeriodLabel(ym: string, timeframe: TimeRange): string {
  if (timeframe === 'all') return 'All time';
  const [y, m] = ym.split('-').map(Number);
  switch (timeframe) {
    case '7d': return 'Last 7 Days';
    case '30d': return 'Last 30 Days';
    case '365d': return 'Last 365 Days';
    case '1m': return formatMonth(ym);
    case '3m': return `Q${m / 3} ${y}`;
    case '6m': return `H${m / 6} ${y}`;
    case '1y': return `${y}`;
    case 'ytd': return `YTD ${y}`;
    case '5y': return `${y - 4} – ${y}`;
    default: return '';
  }
}

