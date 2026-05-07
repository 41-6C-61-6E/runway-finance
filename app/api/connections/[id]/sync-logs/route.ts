import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { syncLogs } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'unauthenticated', message: 'Authentication required' }, { status: 401 });
  }

  const userId = session.user.id;

  const { searchParams } = new URL(request.url);
  const limit = Math.min(parseInt(searchParams.get('limit') || '20', 10), 100);
  const offset = parseInt(searchParams.get('offset') || '0', 10);

  const [totalRow] = await getDb()
    .select({ count: syncLogs.id })
    .from(syncLogs)
    .where(eq(syncLogs.connectionId, id))
    .limit(1);

  const total = totalRow ? parseInt(totalRow.count, 10) : 0;

  const logs = await getDb()
    .select()
    .from(syncLogs)
    .where(eq(syncLogs.connectionId, id))
    .orderBy(syncLogs.startedAt)
    .limit(limit)
    .offset(offset);

  return NextResponse.json({ data: logs, total, limit, offset });
}
