import 'server-only';
import { eq } from 'drizzle-orm';
import { getDb, type DbOrTx } from '../index';
import { simplifinConnections, plaidConnections } from '../schema';

export async function listSimpleFinConnections(userId: string, tx?: DbOrTx) {
  const db = tx ?? getDb();
  return await db
    .select()
    .from(simplifinConnections)
    .where(eq(simplifinConnections.userId, userId));
}

export async function listPlaidConnections(userId: string, tx?: DbOrTx) {
  const db = tx ?? getDb();
  return await db
    .select()
    .from(plaidConnections)
    .where(eq(plaidConnections.userId, userId));
}

