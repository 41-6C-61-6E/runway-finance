import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { accounts } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { logger } from '@/lib/logger';
import { getSessionDEK } from '@/lib/crypto-context';
import { decryptRow, encryptRow } from '@/lib/crypto';
import {
  createAccountSnapshots,
  createNetWorthSnapshot,
  updateCategoryIncomeSummaries,
  updateCategorySpendingSummaries,
  updateMonthlyCashFlowSummaries,
} from '@/lib/services/sync';

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json(
      { error: 'unauthenticated', message: 'Authentication required' },
      { status: 401 }
    );
  }

  const userId = session.user.id;
  const dek = await getSessionDEK();
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

  const decrypted = await decryptRow('accounts', account, dek);
  return NextResponse.json(decrypted);
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json(
      { error: 'unauthenticated', message: 'Authentication required' },
      { status: 401 }
    );
  }

  const userId = session.user.id;
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

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: 'validation_error', message: 'Invalid request body' },
      { status: 400 }
    );
  }

  const dek = await getSessionDEK();
  let updateData: Record<string, unknown> = {};
  if (body.name !== undefined) updateData.name = body.name;
  if (body.isHidden !== undefined) updateData.isHidden = body.isHidden;
  if (body.isExcludedFromNetWorth !== undefined) updateData.isExcludedFromNetWorth = body.isExcludedFromNetWorth;
  if (body.displayOrder !== undefined) updateData.displayOrder = body.displayOrder;
  if (body.type !== undefined) updateData.type = body.type;
  if (body.balance !== undefined) updateData.balance = String(body.balance);
  if (body.metadata !== undefined) updateData.metadata = body.metadata;

  if (Object.keys(updateData).length === 0) {
    logger.warn('No valid fields to update for account', { accountId: id });
    return NextResponse.json(
      { error: 'validation_error', message: 'No valid fields to update' },
      { status: 400 }
    );
  }

  updateData = await encryptRow('accounts', updateData, dek);
  const changedFields = Object.keys(updateData);
  logger.info('Updating account', { accountId: id, changedFields });

  const [updated] = await getDb()
    .update(accounts)
    .set(updateData)
    .where(eq(accounts.id, id))
    .returning();

  if (!updated) {
    return NextResponse.json(
      { error: 'not_found', message: 'Account not found after update' },
      { status: 404 }
    );
  }

  const decrypted = await decryptRow('accounts', updated, dek);

  if (body.metadata !== undefined && updated) {
    const meta = typeof decrypted.metadata === 'string' ? JSON.parse(decrypted.metadata) : (decrypted.metadata || {});
    const SNAPSHOT_TYPES = ['realestate', 'primaryhome', 'secondaryhome', 'rentalproperty', 'commercial', 'land', 'otherrealestate', 'vehicle', 'metals', 'mortgage'];
    if (SNAPSHOT_TYPES.includes(decrypted.type)) {
      try {
        const { readApiConfig } = await import('@/lib/services/manual-accounts');
        const { generateAssetHistorySnapshots } = await import('@/lib/services/asset-estimator');
        const apiConfig = await readApiConfig(userId);
        const oldDecrypted = await decryptRow('accounts', account, dek);
        const oldMeta = typeof oldDecrypted.metadata === 'string' ? JSON.parse(oldDecrypted.metadata) : (oldDecrypted.metadata || {});
        await generateAssetHistorySnapshots(
          id,
          userId,
          decrypted.type,
          meta,
          apiConfig,
          dek,
          oldMeta.purchaseDate as string | undefined,
          oldMeta.purchasePrice as number | undefined
        );
      } catch (err) {
        logger.warn(`Failed to regenerate history snapshots on PATCH for account ${id}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  }

  if (
    body.isHidden !== undefined ||
    body.isExcludedFromNetWorth !== undefined ||
    body.balance !== undefined ||
    body.type !== undefined
  ) {
    const today = new Date().toISOString().split('T')[0];
    Promise.all([
      createAccountSnapshots(userId, dek, today),
      createNetWorthSnapshot(userId, dek, today),
      updateMonthlyCashFlowSummaries(userId, dek),
      updateCategorySpendingSummaries(userId, dek),
      updateCategoryIncomeSummaries(userId, dek),
    ]).catch((err) => {
      logger.error('Error in background sync/recalc after account PATCH', {
        accountId: id,
        userId,
        error: err instanceof Error ? err.message : String(err),
      });
    });
  }

  return NextResponse.json(decrypted);
}
