import 'server-only';
import { eq, and, type SQL, type Column } from 'drizzle-orm';
import { type PgTable } from 'drizzle-orm/pg-core';
import { getDb, type DbOrTx } from './index';

interface OwnedTable {
  id: Column;
  userId: Column;
}

export async function findOwned<T extends OwnedTable>(
  table: T,
  id: string,
  userId: string,
  tx?: DbOrTx
): Promise<Record<string, unknown> | null> {
  const db = tx ?? getDb();
  const rows = await (db
    .select()
    .from(table as unknown as PgTable)
    .where(and(eq(table.id, id), eq(table.userId, userId)))
    .limit(1) as unknown as Promise<Record<string, unknown>[]>);

  return rows[0] ?? null;
}

export async function findOwnedOrThrow<T extends OwnedTable>(
  table: T,
  id: string,
  userId: string,
  errorMessage = 'Record not found',
  tx?: DbOrTx
): Promise<Record<string, unknown>> {
  const record = await findOwned(table, id, userId, tx);
  if (!record) {
    const error = new Error(errorMessage) as Error & { status?: number };
    error.status = 404;
    throw error;
  }
  return record;
}

export async function listOwned<T extends OwnedTable>(
  table: T,
  userId: string,
  additionalWhere?: SQL,
  tx?: DbOrTx
): Promise<Record<string, unknown>[]> {
  const db = tx ?? getDb();
  const condition = additionalWhere
    ? and(eq(table.userId, userId), additionalWhere)
    : eq(table.userId, userId);

  return await (db
    .select()
    .from(table as unknown as PgTable)
    .where(condition) as unknown as Promise<Record<string, unknown>[]>);
}

export async function deleteOwned<T extends OwnedTable>(
  table: T,
  id: string,
  userId: string,
  tx?: DbOrTx
): Promise<boolean> {
  const db = tx ?? getDb();
  const result = await (db
    .delete(table as unknown as PgTable)
    .where(and(eq(table.id, id), eq(table.userId, userId))) as unknown as Promise<unknown>);

  return Boolean(result);
}
