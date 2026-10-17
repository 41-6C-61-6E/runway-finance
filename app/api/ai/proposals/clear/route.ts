import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { aiProposals } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { logger } from '@/lib/logger';
import { pruneDuplicateProposals } from '@/lib/services/ai-categorizer';

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

  const prunedCount = await pruneDuplicateProposals(dataUserId);
  const deletedCount = (result.rowCount ?? 0) + (rejectedResult.rowCount ?? 0) + prunedCount;

  logger.info('POST /api/ai/proposals/clear', { userId, deletedCount, prunedCount });
  return NextResponse.json({ success: true, deletedCount });
}
