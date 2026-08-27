import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { importLog } from '@/lib/db/schema';
import { eq, desc } from 'drizzle-orm';
import { handleApiError } from '@/lib/api/response';

export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const userId = session.user.id;
  const dataUserId = (session.user as any).dataUserId ?? session.user.id;

  try {
    const logs = await getDb()
      .select()
      .from(importLog)
      .where(eq(importLog.userId, dataUserId))
      .orderBy(desc(importLog.createdAt));

    return NextResponse.json(logs);
  } catch (error) {
    return handleApiError(error, 'Failed to fetch import logs');
  }
}
