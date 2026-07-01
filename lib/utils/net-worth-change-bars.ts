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

export type NetWorthChangeBucketSize = 'daily' | 'weekly' | 'biweekly' | 'monthly' | 'quarterly' | 'yearly';

function getWeekStart(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00Z');
  const day = d.getUTCDay();
  d.setUTCDate(d.getUTCDate() - day);
  return d.toISOString().split('T')[0];
}

function getBiweeklyStart(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00Z');
  const startOfYear = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const dayOfYear = Math.floor((d.getTime() - startOfYear.getTime()) / 86400000);
  const periodStartDay = Math.floor(dayOfYear / 14) * 14;
  d.setUTCMonth(0, 1 + periodStartDay);
  return d.toISOString().split('T')[0];
}

function getMonthStart(dateStr: string): string {
  return dateStr.slice(0, 7) + '-01';
}

function getQuarterStart(dateStr: string): string {
  const month = parseInt(dateStr.slice(5, 7), 10);
  const qMonth = (Math.ceil(month / 3) - 1) * 3 + 1;
  return dateStr.slice(0, 4) + '-' + String(qMonth).padStart(2, '0') + '-01';
}

function getYearStart(dateStr: string): string {
  return dateStr.slice(0, 4) + '-01-01';
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

  for (const [key, points] of sortedBuckets) {
    points.sort((a, b) => a.date.localeCompare(b.date));
    const endPoint = points[points.length - 1];
    const startPoint = previousEndPoint ?? points[0];
    barData.push({
      date: key,
      startDate: startPoint.date,
      endDate: endPoint.date,
      change: endPoint.netWorth - startPoint.netWorth,
      startNetWorth: startPoint.netWorth,
      endNetWorth: endPoint.netWorth,
    });
    previousEndPoint = endPoint;
  }

  return { barData, bucketSize };
}
