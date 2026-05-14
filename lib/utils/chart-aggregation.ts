export type AggregationLevel = 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'yearly';

export interface AggregatablePoint {
  date: string;
  [key: string]: string | number | boolean | undefined;
}

export function getAggregationLevel(pointCount: number): AggregationLevel {
  if (pointCount <= 60) return 'daily';
  if (pointCount <= 250) return 'weekly';
  if (pointCount <= 1000) return 'monthly';
  if (pointCount <= 4000) return 'quarterly';
  return 'yearly';
}

function getWeekKey(dateStr: string): string {
  const d = new Date(dateStr);
  const start = new Date(d);
  start.setDate(d.getDate() - d.getDay());
  return start.toISOString().split('T')[0];
}

function getMonthKey(dateStr: string): string {
  return dateStr.slice(0, 7);
}

function getQuarterKey(dateStr: string): string {
  const m = parseInt(dateStr.slice(5, 7), 10);
  const q = Math.ceil(m / 3);
  return `${dateStr.slice(0, 4)}-Q${q}`;
}

function getYearKey(dateStr: string): string {
  return dateStr.slice(0, 4);
}

function getBucketKey(dateStr: string, level: AggregationLevel): string {
  switch (level) {
    case 'weekly': return getWeekKey(dateStr);
    case 'monthly': return getMonthKey(dateStr);
    case 'quarterly': return getQuarterKey(dateStr);
    case 'yearly': return getYearKey(dateStr);
    default: return dateStr;
  }
}

function getBucketDate(bucketKey: string, level: AggregationLevel): string {
  switch (level) {
    case 'weekly': {
      const d = new Date(bucketKey);
      d.setDate(d.getDate() + 3);
      return d.toISOString().split('T')[0];
    }
    case 'monthly': return `${bucketKey}-15`;
    case 'quarterly': {
      const [year, q] = bucketKey.split('-Q');
      const month = (parseInt(q) - 1) * 3 + 2;
      return `${year}-${String(month).padStart(2, '0')}-15`;
    }
    case 'yearly': return `${bucketKey}-07-01`;
    default: return bucketKey;
  }
}

export function aggregateChartData<T extends AggregatablePoint>(
  data: T[],
  numericFields: (keyof T & string)[],
  level?: AggregationLevel,
): T[] {
  if (data.length === 0) return [];
  const effectiveLevel = level || getAggregationLevel(data.length);
  if (effectiveLevel === 'daily') return data;

  const buckets = new Map<string, Map<string, number>>();
  const countMap = new Map<string, number>();
  const sampleMap = new Map<string, T>();

  for (const point of data) {
    const key = getBucketKey(point.date, effectiveLevel);
    if (!buckets.has(key)) {
      buckets.set(key, new Map());
      countMap.set(key, 0);
      sampleMap.set(key, point);
    }
    const bucket = buckets.get(key)!;
    countMap.set(key, countMap.get(key)! + 1);
    for (const field of numericFields) {
      const val = point[field];
      if (typeof val === 'number') {
        bucket.set(field, (bucket.get(field) || 0) + val);
      }
    }
  }

  return Array.from(buckets.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([bucketKey, sums]) => {
      const count = countMap.get(bucketKey)!;
      const sample = sampleMap.get(bucketKey)!;
      const result = { ...sample, date: getBucketDate(bucketKey, effectiveLevel) };
      for (const field of numericFields) {
        const sum = sums.get(field);
        if (sum !== undefined) {
          (result as Record<string, unknown>)[field] = Math.round((sum / count) * 100) / 100;
        }
      }
      return result;
    });
}
