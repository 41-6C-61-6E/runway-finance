import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { accounts } from '@/lib/db/schema';
import { eq, and, isNull } from 'drizzle-orm';
import { deleteManualAccount, readApiConfig } from '@/lib/services/manual-accounts';
import { generateAssetHistorySnapshots } from '@/lib/services/asset-estimator';
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
import { manualAccountScheduler } from '@/lib/services/manual-account-scheduler';

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'unauthenticated', message: 'Authentication required' }, { status: 401 });
  }

  const userId = session.user.id;
  const dek = await getSessionDEK();
  const { id } = await params;

  const [account] = await getDb()
    .select()
    .from(accounts)
    .where(and(eq(accounts.id, id), eq(accounts.userId, userId)))
    .limit(1);

  if (!account) {
    logger.warn('GET /api/manual-accounts/[id] - not found', { userId, id });
    return NextResponse.json({ error: 'not_found', message: 'Account not found' }, { status: 404 });
  }

  const decrypted = await decryptRow('accounts', account, dek);
  logger.info('GET /api/manual-accounts/[id]', { userId, id, type: decrypted.type, name: decrypted.name });
  return NextResponse.json(decrypted);
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'unauthenticated', message: 'Authentication required' }, { status: 401 });
  }

  const userId = session.user.id;
  const { id } = await params;

  const [account] = await getDb()
    .select()
    .from(accounts)
    .where(and(eq(accounts.id, id), eq(accounts.userId, userId)))
    .limit(1);

  if (!account) {
    return NextResponse.json({ error: 'not_found', message: 'Account not found' }, { status: 404 });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'validation_error', message: 'Invalid request body' }, { status: 400 });
  }

  const dek = await getSessionDEK();
  let updateData: Record<string, unknown> = {};
  if (body.name !== undefined) updateData.name = body.name;
  if (body.isHidden !== undefined) updateData.isHidden = body.isHidden;
  if (body.isExcludedFromNetWorth !== undefined) updateData.isExcludedFromNetWorth = body.isExcludedFromNetWorth;
  if (body.displayOrder !== undefined) updateData.displayOrder = body.displayOrder;
  if (body.balance !== undefined) updateData.balance = String(body.balance);
  if (body.metadata !== undefined) {
    updateData.metadata = body.metadata;
  }

  if (Object.keys(updateData).length === 0) {
    return NextResponse.json({ error: 'validation_error', message: 'No valid fields to update' }, { status: 400 });
  }

  updateData = await encryptRow('accounts', updateData, dek);
  const [updated] = await getDb()
    .update(accounts)
    .set({ ...updateData, updatedAt: new Date() })
    .where(eq(accounts.id, id))
    .returning();

  // Reschedule sync timer when metadata (which contains syncFrequency) changes
  if (body.metadata !== undefined && updated) {
    const decrypted = await decryptRow('accounts', updated, dek);
    const meta = typeof decrypted.metadata === 'string' ? JSON.parse(decrypted.metadata) : (decrypted.metadata || {});
    const syncFrequency = (meta.syncFrequency as string) || 'manual';
    manualAccountScheduler.schedule(id, userId, syncFrequency, decrypted.balanceDate);

    // Regenerate synthetic history snapshots if the account type is supported
    const SNAPSHOT_TYPES = ['realestate', 'primaryhome', 'secondaryhome', 'rentalproperty', 'commercial', 'land', 'otherrealestate', 'vehicle', 'metals', 'mortgage'];
    if (SNAPSHOT_TYPES.includes(decrypted.type)) {
      try {
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
    body.balance !== undefined
  ) {
    const today = new Date().toISOString().split('T')[0];
    Promise.all([
      createAccountSnapshots(userId, dek, today),
      createNetWorthSnapshot(userId, dek, today),
      updateMonthlyCashFlowSummaries(userId, dek),
      updateCategorySpendingSummaries(userId, dek),
      updateCategoryIncomeSummaries(userId, dek),
    ]).catch((err) => {
      logger.error('Error in background sync/recalc after manual account PATCH', {
        accountId: id,
        userId,
        error: err instanceof Error ? err.message : String(err),
      });
    });
  }

  logger.info('PATCH /api/manual-accounts/[id]', { userId, id, fieldsChanged: Object.keys(updateData) });
  return NextResponse.json(updated ? await decryptRow('accounts', updated, dek) : updated);
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'unauthenticated', message: 'Authentication required' }, { status: 401 });
  }

  const userId = session.user.id;
  const dek = await getSessionDEK();
  const { id } = await params;

  if (request.headers.get('X-Confirm-Delete') !== 'true') {
    return NextResponse.json(
      { error: 'confirmation_required', message: 'Include X-Confirm-Delete: true header' },
      { status: 400 }
    );
  }

  await deleteManualAccount(id, userId, false, dek);
  manualAccountScheduler.cancel(id);

  logger.info('DELETE /api/manual-accounts/[id]', { userId, id });
  return NextResponse.json({ success: true });
}
