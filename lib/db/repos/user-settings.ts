import 'server-only';
import { eq } from 'drizzle-orm';
import { getDb, type DbOrTx } from '../index';
import { userSettings } from '../schema';

export async function getUserSettings(userId: string, tx?: DbOrTx) {
  const db = tx ?? getDb();
  const [settings] = await db
    .select()
    .from(userSettings)
    .where(eq(userSettings.userId, userId))
    .limit(1);

  return settings ?? null;
}

export async function updateUserSettings(
  userId: string,
  data: Partial<typeof userSettings.$inferInsert>,
  tx?: DbOrTx
) {
  const db = tx ?? getDb();
  const [updated] = await db
    .insert(userSettings)
    .values({ ...data, userId })
    .onConflictDoUpdate({
      target: userSettings.userId,
      set: data,
    })
    .returning();

  return updated;
}

