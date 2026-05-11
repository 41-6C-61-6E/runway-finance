import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { categoryRules } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { seedUserDefaultRules } from '@/lib/db/seed-default-rules';

export async function POST() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  }

  const userId = session.user.id;
  const db = getDb();

  await db
    .delete(categoryRules)
    .where(eq(categoryRules.userId, userId));

  await seedUserDefaultRules(userId);

  return NextResponse.json({ success: true, message: 'Rules reset to defaults' });
}
