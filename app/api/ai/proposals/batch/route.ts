import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { aiProposals } from '@/lib/db/schema';
import { eq, and, inArray } from 'drizzle-orm';
import { logger } from '@/lib/logger';
import { getSessionDEK } from '@/lib/crypto-context';
import { applyApprovedProposals } from '@/lib/services/ai-categorizer';

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  }

  const userId = session.user.id;
  const body = await request.json();
  const { ids, action } = body as { ids: string[]; action: 'approve' | 'reject' };

  if (!Array.isArray(ids) || ids.length === 0) {
    return NextResponse.json({ error: 'ids array is required' }, { status: 400 });
  }

  if (action !== 'approve' && action !== 'reject') {
    return NextResponse.json({ error: 'action must be "approve" or "reject"' }, { status: 400 });
  }

  const db = getDb();

  const proposals = await db
    .select()
    .from(aiProposals)
    .where(and(eq(aiProposals.userId, userId), inArray(aiProposals.id, ids), eq(aiProposals.status, 'pending')));

  if (proposals.length === 0) {
    return NextResponse.json({ error: 'No matching pending proposals found' }, { status: 404 });
  }

  const dek = await getSessionDEK();

  try {
    if (action === 'reject') {
      await db
        .update(aiProposals)
        .set({ status: 'rejected', updatedAt: new Date() })
        .where(inArray(aiProposals.id, proposals.map((p) => p.id)));

      return NextResponse.json({ success: true, count: proposals.length });
    }

    // For approve, set status to approved first, then apply them
    await db
      .update(aiProposals)
      .set({ status: 'approved', updatedAt: new Date() })
      .where(inArray(aiProposals.id, proposals.map((p) => p.id)));

    await applyApprovedProposals(userId, dek);

    return NextResponse.json({ success: true, count: proposals.length });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    logger.error('Batch action failed', { userId, action, error: message });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
