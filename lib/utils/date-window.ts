import type { TimeRange } from '@/components/charts/chart-filters';

export function getCurrentMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

export function snapToPeriod(ym: string, timeframe: TimeRange): string {
  if (timeframe === '7d' || timeframe === '30d' || timeframe === '365d') return ym;
  
  if (timeframe === '1d_discrete') {
    if (/^\d{4}-\d{2}-\d{2}$/.test(ym)) return ym;
    const today = new Date();
    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    if (ym === todayStr.slice(0, 7)) return todayStr;
    return `${ym}-01`;
  }

  let periodYm = ym;
  if (/^\d{4}-\d{2}-\d{2}$/.test(ym)) {
    periodYm = ym.slice(0, 7);
  }

  const [y, m] = periodYm.split('-').map(Number);
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

  if (timeframe === '1d_discrete') {
    const baseEnd = end.slice(0, 7);
    return { start: baseEnd, end: baseEnd };
  }

  const baseEnd = end.includes('-') && end.split('-').length === 3 ? end.slice(0, 7) : end;
  const monthsBack = ({ '1m': 0, '3m': 2, '6m': 5, '1y': 11, '5y': 59 } as Record<string, number>)[timeframe] ?? 0;
  const [ey, em] = baseEnd.split('-').map(Number);
  const start = new Date(ey, em - 1 - monthsBack, 1);
  return {
    start: `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}`,
    end: baseEnd,
  };
}

export function getPreciseDateRange(timeframe: TimeRange, windowEnd?: string): { start: string; end: string } {
  const formatDate = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

  if (timeframe === '1d_discrete') {
    const today = new Date();
    const todayStr = formatDate(today);
    const dateStr = windowEnd || todayStr;
    const cleanDateStr = /^\d{4}-\d{2}-\d{2}$/.test(dateStr) ? dateStr : `${dateStr.slice(0, 7)}-01`;
    return { start: cleanDateStr, end: cleanDateStr };
  }

  if (timeframe === '1d' || timeframe === '7d' || timeframe === '30d' || timeframe === '365d') {
    const end = new Date();
    const start = new Date();
    if (timeframe === '1d') start.setDate(start.getDate() - 1);
    if (timeframe === '7d') start.setDate(start.getDate() - 7);
    if (timeframe === '30d') start.setDate(start.getDate() - 30);
    if (timeframe === '365d') start.setDate(start.getDate() - 365);
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

  if (timeframe === '1d_discrete') {
    const dateStr = ym;
    const cleanDateStr = /^\d{4}-\d{2}-\d{2}$/.test(dateStr) ? dateStr : `${dateStr.slice(0, 7)}-01`;
    const [y, m, d] = cleanDateStr.split('-').map(Number);
    return new Date(y, m - 1, d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }

  const base = ym.includes('-') && ym.split('-').length === 3 ? ym.slice(0, 7) : ym;
  const [y, m] = base.split('-').map(Number);
  switch (timeframe) {
    case '1d': return 'Previous 24 Hours';
    case '7d': return 'Last 7 Days';
    case '30d': return 'Last 30 Days';
    case '365d': return 'Last 365 Days';
    case '1m': return formatMonth(base);
    case '3m': return `Q${m / 3} ${y}`;
    case '6m': return `H${m / 6} ${y}`;
    case '1y': return `${y}`;
    case 'ytd': return `YTD ${y}`;
    case '5y': return `${y - 4} – ${y}`;
    default: return '';
  }
}

