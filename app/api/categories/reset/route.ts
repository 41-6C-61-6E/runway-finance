import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { categories } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { DEFAULT_CATEGORIES } from '@/lib/db/seed-categories';
import { logger } from '@/lib/logger';

export async function POST() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  }

  const userId = session.user.id;
  const db = getDb();

  // Delete all user categories (both system and custom)
  await db
    .delete(categories)
    .where(eq(categories.userId, userId));

  // Re-seed with defaults
  let order = 0;

  for (const group of DEFAULT_CATEGORIES) {
    const [parent] = await db
      .insert(categories)
      .values({
        userId,
        name: group.name,
        color: group.color,
        isIncome: group.isIncome,
        isSystem: true,
        displayOrder: order++,
      })
      .returning();

    if (group.children && parent) {
      for (const child of group.children) {
        await db.insert(categories).values({
          userId,
          parentId: parent.id,
          name: child.name,
          color: child.color,
          isIncome: group.isIncome,
          isSystem: true,
          displayOrder: order++,
        });
      }
    }
  }

  logger.info('POST /api/categories/reset', { userId });
  return NextResponse.json({ success: true, message: 'Categories reset to defaults' });
}
