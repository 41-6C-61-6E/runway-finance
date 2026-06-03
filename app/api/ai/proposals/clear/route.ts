import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { aiProposals } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { logger } from '@/lib/logger';

export async function POST() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  }

  const userId = session.user.id;
  const dataUserId = (session.user as any).dataUserId ?? session.user.id;

  const result = await getDb()
    .delete(aiProposals)
    .where(
      and(
        eq(aiProposals.userId, dataUserId),
        eq(aiProposals.status, 'approved'),
      )
    );

  const rejectedResult = await getDb()
    .delete(aiProposals)
    .where(
      and(
        eq(aiProposals.userId, dataUserId),
        eq(aiProposals.status, 'rejected'),
      )
    );

  const deletedCount = (result.rowCount ?? 0) + (rejectedResult.rowCount ?? 0);

  logger.info('POST /api/ai/proposals/clear', { userId, deletedCount });
  return NextResponse.json({ success: true, deletedCount });
}
