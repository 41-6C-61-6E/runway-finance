export interface ChangeBarChartPoint {
  date: string;
  netWorth: number;
}

export interface NetWorthChangeBarDataPoint {
  date: string;
  startDate: string;
  endDate: string;
  change: number;
  startNetWorth: number;
  endNetWorth: number;
}

import {
  getWeekStart,
  getBiweeklyStart,
  getMonthStart,
  getQuarterStart,
  getYearStart,
} from './chart-aggregation';

export type NetWorthChangeBucketSize = 'daily' | 'weekly' | 'biweekly' | 'monthly' | 'quarterly' | 'yearly';

function getBucketPeriodEnd(key: string, bucketSize: NetWorthChangeBucketSize): string {
  const [y, m] = key.split('-').map(Number);
  switch (bucketSize) {
    case 'daily':
      return key;
    case 'weekly': {
      const d = new Date(key + 'T00:00:00Z');
      d.setUTCDate(d.getUTCDate() + 6);
      return d.toISOString().split('T')[0];
    }
    case 'biweekly': {
      const d = new Date(key + 'T00:00:00Z');
      d.setUTCDate(d.getUTCDate() + 13);
      return d.toISOString().split('T')[0];
    }
    case 'monthly': {
      const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
      return `${y}-${String(m).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
    }
    case 'quarterly': {
      const endMonth = m + 2;
      const lastDay = new Date(Date.UTC(y, endMonth, 0)).getUTCDate();
      return `${y}-${String(endMonth).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
    }
    case 'yearly':
      return `${y}-12-31`;
    default:
      return key;
  }
}

const bucketFns: Record<NetWorthChangeBucketSize, (dateStr: string) => string> = {
  daily: (d) => d,
  weekly: getWeekStart,
  biweekly: getBiweeklyStart,
  monthly: getMonthStart,
  quarterly: getQuarterStart,
  yearly: getYearStart,
};

function computeBucketSize(days: number): NetWorthChangeBucketSize {
  if (days <= 50) return 'daily';
  if (days <= 180) return 'weekly';
  if (days <= 400) return 'monthly';
  if (days <= 1000) return 'quarterly';
  return 'yearly';
}

export function computeNetWorthChangeBarData(
  data: ChangeBarChartPoint[]
): { barData: NetWorthChangeBarDataPoint[]; bucketSize: NetWorthChangeBucketSize } {
  if (data.length < 2) return { barData: [], bucketSize: 'daily' };

  const sorted = [...data].sort((a, b) => a.date.localeCompare(b.date));

  const firstDate = new Date(sorted[0].date + 'T00:00:00Z');
  const lastDate = new Date(sorted[sorted.length - 1].date + 'T00:00:00Z');
  const days = Math.round((lastDate.getTime() - firstDate.getTime()) / 86400000);
  const bucketSize = computeBucketSize(days);

  if (bucketSize === 'daily') {
    const barData: NetWorthChangeBarDataPoint[] = [];
    for (let i = 1; i < sorted.length; i++) {
      barData.push({
        date: sorted[i].date,
        startDate: sorted[i - 1].date,
        endDate: sorted[i].date,
        change: sorted[i].netWorth - sorted[i - 1].netWorth,
        startNetWorth: sorted[i - 1].netWorth,
        endNetWorth: sorted[i].netWorth,
      });
    }
    return { barData, bucketSize };
  }

  const getKey = bucketFns[bucketSize];
  const buckets = new Map<string, ChangeBarChartPoint[]>();
  for (const point of sorted) {
    const key = getKey(point.date);
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key)!.push(point);
  }

  const barData: NetWorthChangeBarDataPoint[] = [];
  let previousEndPoint: ChangeBarChartPoint | null = null;
  const sortedBuckets = Array.from(buckets.entries()).sort(([a], [b]) => a.localeCompare(b));
  const overallEndDate = sorted[sorted.length - 1].date;

  for (const [key, points] of sortedBuckets) {
    points.sort((a, b) => a.date.localeCompare(b.date));
    const endPoint = points[points.length - 1];
    const startPoint = previousEndPoint ?? points[0];

    const calendarEnd = getBucketPeriodEnd(key, bucketSize);
    const finalEndDate = calendarEnd > overallEndDate ? overallEndDate : calendarEnd;

    barData.push({
      date: key,
      startDate: previousEndPoint ? key : startPoint.date,
      endDate: finalEndDate,
      change: endPoint.netWorth - startPoint.netWorth,
      startNetWorth: startPoint.netWorth,
      endNetWorth: endPoint.netWorth,
    });
    previousEndPoint = endPoint;
  }

  return { barData, bucketSize };
}
