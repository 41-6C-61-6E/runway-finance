import 'server-only';
import { sql, type SQL } from 'drizzle-orm';

/**
 * Standard typed SQL helpers for Runway Finance Drizzle queries.
 */

export function sqlCount(): SQL<number> {
  return sql<number>`cast(count(*) as int)`;
}

export function sqlCoalesce<T = number>(column: unknown, fallback: unknown): SQL<T> {
  return sql<T>`coalesce(${column}, ${fallback})`;
}

export function sqlJsonExtract(column: unknown, key: string): SQL<string> {
  return sql<string>`${column}->>${key}`;
}

export function buildOnConflictUpdateSet(columns: string[]): Record<string, SQL> {
  const result: Record<string, SQL> = {};
  for (const col of columns) {
    result[col] = sql`excluded.${sql.raw(col)}`;
  }
  return result;
}

