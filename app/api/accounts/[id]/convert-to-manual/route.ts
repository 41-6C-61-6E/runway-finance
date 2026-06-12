import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { accounts } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { logger } from '@/lib/logger';
import { getSessionDEK } from '@/lib/crypto-context';
import { randomUUID } from 'node:crypto';
import {
  createAccountSnapshots,
  createNetWorthSnapshot,
  updateCategoryIncomeSummaries,
  updateCategorySpendingSummaries,
  updateMonthlyCashFlowSummaries,
} from '@/lib/services/sync';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json(
      { error: 'unauthenticated', message: 'Authentication required' },
      { status: 401 }
    );
  }

  const userId = session.user.id;
  const dataUserId = (session.user as any).dataUserId ?? session.user.id;
  const { id } = await params;

  const [account] = await getDb()
    .select()
    .from(accounts)
    .where(eq(accounts.id, id))
    .limit(1);

  if (!account) {
    return NextResponse.json(
      { error: 'not_found', message: 'Account not found' },
      { status: 404 }
    );
  }

  if (account.userId !== userId) {
    return NextResponse.json(
      { error: 'forbidden', message: 'You do not own this account' },
      { status: 403 }
    );
  }

  // Update the account to disconnect it and set a manual external ID
  const manualId = `manual-${randomUUID()}`;
  await getDb()
    .update(accounts)
    .set({
      connectionId: null,
      plaidConnectionId: null,
      externalId: manualId,
      updatedAt: new Date(),
    })
    .where(eq(accounts.id, id));

  // Invalidate search cache
  const { invalidateUserSearchCache } = await import('@/lib/services/search-cache');
  invalidateUserSearchCache(userId);


  // Recalculate snapshots and summaries in the background
  const dek = await getSessionDEK();
  const today = new Date().toISOString().split('T')[0];
  try {
    await Promise.all([
      createAccountSnapshots(dataUserId, dek, today),
      createNetWorthSnapshot(dataUserId, dek, today),
      updateMonthlyCashFlowSummaries(dataUserId, dek),
      updateCategorySpendingSummaries(dataUserId, dek),
      updateCategoryIncomeSummaries(dataUserId, dek),
    ]);
  } catch (err) {
    logger.error('Error in background sync/recalc after convert to manual', {
      accountId: id,
      userId,
      error: err instanceof Error ? err.message : String(err),
    });
  }

  logger.info('Converted account to manual', { userId, id, manualId });
  return NextResponse.json({ success: true });
}
