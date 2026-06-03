import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { accounts, accountTags, tags } from '@/lib/db/schema';
import { eq, and, isNull, inArray } from 'drizzle-orm';
import { deleteManualAccount, readApiConfig } from '@/lib/services/manual-accounts';
import { generateAssetHistorySnapshots } from '@/lib/services/asset-estimator';
import { logger } from '@/lib/logger';
import { getSessionDEK } from '@/lib/crypto-context';
import { decryptRow, encryptRow, decryptField } from '@/lib/crypto';
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
  const dataUserId = (session.user as any).dataUserId ?? session.user.id;
  const dek = await getSessionDEK();
  const { id } = await params;

  const [account] = await getDb()
    .select()
    .from(accounts)
    .where(and(eq(accounts.id, id), eq(accounts.userId, dataUserId)))
    .limit(1);

  if (!account) {
    logger.warn('GET /api/manual-accounts/[id] - not found', { userId, id });
    return NextResponse.json({ error: 'not_found', message: 'Account not found' }, { status: 404 });
  }

  const decrypted = await decryptRow('accounts', account, dek);
  logger.info('GET /api/manual-accounts/[id]', { userId, id, type: decrypted.type, name: decrypted.name });

  // Fetch account tags
  const tagRows = await getDb()
    .select({
      id: tags.id,
      name: tags.name,
      color: tags.color,
    })
    .from(accountTags)
    .leftJoin(tags, eq(accountTags.tagId, tags.id))
    .where(eq(accountTags.accountId, id));

  const attachedTags: any[] = [];
  for (const row of tagRows) {
    if (row.id) {
      attachedTags.push({
        id: row.id,
        name: row.name ? await decryptField(row.name, dek) : '',
        color: row.color,
      });
    }
  }

  return NextResponse.json({ ...decrypted, tags: attachedTags });
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'unauthenticated', message: 'Authentication required' }, { status: 401 });
  }

  const userId = session.user.id;
  const dataUserId = (session.user as any).dataUserId ?? session.user.id;
  const { id } = await params;

  const [account] = await getDb()
    .select()
    .from(accounts)
    .where(and(eq(accounts.id, id), eq(accounts.userId, dataUserId)))
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

  const tagIds = body.tagIds as string[] | undefined;

  if (Object.keys(updateData).length === 0 && tagIds === undefined) {
    return NextResponse.json({ error: 'validation_error', message: 'No valid fields to update' }, { status: 400 });
  }

  let updated = account;
  if (Object.keys(updateData).length > 0) {
    const encryptedUpdate = await encryptRow('accounts', updateData, dek);
    const [result] = await getDb()
      .update(accounts)
      .set({ ...encryptedUpdate, updatedAt: new Date() })
      .where(eq(accounts.id, id))
      .returning();
    updated = result;
  }

  if (tagIds !== undefined) {
    await getDb()
      .delete(accountTags)
      .where(eq(accountTags.accountId, id));

    if (tagIds.length > 0) {
      await getDb()
        .insert(accountTags)
        .values(
          tagIds.map(tId => ({
            accountId: id,
            tagId: tId,
          }))
        );
    }
  }

  // Fetch updated tags
  const tagRows = await getDb()
    .select({
      id: tags.id,
      name: tags.name,
      color: tags.color,
    })
    .from(accountTags)
    .leftJoin(tags, eq(accountTags.tagId, tags.id))
    .where(eq(accountTags.accountId, id));

  const attachedTags: any[] = [];
  for (const row of tagRows) {
    if (row.id) {
      attachedTags.push({
        id: row.id,
        name: row.name ? await decryptField(row.name, dek) : '',
        color: row.color,
      });
    }
  }

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
      createAccountSnapshots(dataUserId, dek, today),
      createNetWorthSnapshot(dataUserId, dek, today),
      updateMonthlyCashFlowSummaries(dataUserId, dek),
      updateCategorySpendingSummaries(dataUserId, dek),
      updateCategoryIncomeSummaries(dataUserId, dek),
    ]).catch((err) => {
      logger.error('Error in background sync/recalc after manual account PATCH', {
        accountId: id,
        userId,
        error: err instanceof Error ? err.message : String(err),
      });
    });
  }

  logger.info('PATCH /api/manual-accounts/[id]', { userId, id, fieldsChanged: Object.keys(updateData), tagIdsUpdated: tagIds !== undefined });
  const decryptedResult = updated ? await decryptRow('accounts', updated, dek) : updated;
  return NextResponse.json({ ...decryptedResult, tags: attachedTags });
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'unauthenticated', message: 'Authentication required' }, { status: 401 });
  }

  const userId = session.user.id;
  const dataUserId = (session.user as any).dataUserId ?? session.user.id;
  const dek = await getSessionDEK();
  const { id } = await params;

  if (request.headers.get('X-Confirm-Delete') !== 'true') {
    return NextResponse.json(
      { error: 'confirmation_required', message: 'Include X-Confirm-Delete: true header' },
      { status: 400 }
    );
  }

  await deleteManualAccount(id, dataUserId, false, dek);
  manualAccountScheduler.cancel(id);

  logger.info('DELETE /api/manual-accounts/[id]', { userId, id });
  return NextResponse.json({ success: true });
}
