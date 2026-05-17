import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { aiProposals } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { logger } from '@/lib/logger';

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  }

  const userId = session.user.id;
  const { id } = await params;

  const db = getDb();

  const [proposal] = await db
    .select()
    .from(aiProposals)
    .where(and(eq(aiProposals.id, id), eq(aiProposals.userId, userId)))
    .limit(1);

  if (!proposal) {
    return NextResponse.json({ error: 'Proposal not found' }, { status: 404 });
  }

  if (proposal.status !== 'pending') {
    return NextResponse.json({ error: 'Proposal already processed' }, { status: 400 });
  }

  await db
    .update(aiProposals)
    .set({ status: 'rejected', updatedAt: new Date() })
    .where(eq(aiProposals.id, id));

  logger.info('Rejected proposal', { userId, proposalId: id });

  return NextResponse.json({ success: true });
}
