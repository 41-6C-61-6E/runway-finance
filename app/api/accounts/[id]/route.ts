import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { accounts } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { logger } from '@/lib/logger';
import { getSessionDEK } from '@/lib/crypto-context';
import { decryptRow, encryptRow } from '@/lib/crypto';

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
  return NextResponse.json(decrypted);
}
