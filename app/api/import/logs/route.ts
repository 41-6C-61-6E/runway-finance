import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { importLog } from '@/lib/db/schema';
import { eq, desc } from 'drizzle-orm';

export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const userId = session.user.id;

  try {
    const logs = await getDb()
      .select()
      .from(importLog)
      .where(eq(importLog.userId, userId))
      .orderBy(desc(importLog.createdAt));

    return NextResponse.json(logs);
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to fetch import logs', message: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
