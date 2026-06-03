import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { simplifinConnections } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { logger } from '@/lib/logger';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'unauthenticated', message: 'Authentication required' }, { status: 401 });
  }

  const userId = session.user.id;
  const dataUserId = (session.user as any).dataUserId ?? session.user.id;
  const { id: connectionId } = await params;

  // Verify this connection belongs to the user
  const connection = await getDb()
    .select({ id: simplifinConnections.id })
    .from(simplifinConnections)
    .where(
      and(
        eq(simplifinConnections.id, connectionId),
        eq(simplifinConnections.userId, dataUserId)
      )
    )
    .limit(1);

  if (connection.length === 0) {
    return NextResponse.json({ error: 'not-found', message: 'Connection not found' }, { status: 404 });
  }

  // For now, return empty array
  logger.info('Sync logs fetched', { connectionId, count: 0 });
  return NextResponse.json([]);
}