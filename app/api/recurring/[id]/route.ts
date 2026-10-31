import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getSessionDEK } from '@/lib/crypto-context';
import { logger } from '@/lib/logger';
import { RecurringPatchSchema } from '@/lib/validations/recurring';
import {
  getRecurringTransactionById,
  updateRecurringTransaction,
  deleteRecurringTransaction,
} from '@/lib/services/recurring-detection';

const LOG_TAG = '[api-recurring-id]';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  try {
    const { id } = await params;
    const userId = session.user.id;
    const dek = await getSessionDEK();

    const detail = await getRecurringTransactionById(id, userId, dek);
    if (!detail) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    return NextResponse.json(detail);
  } catch (err) {
    logger.error(`${LOG_TAG} GET [id] failed:`, err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal Server Error' },
      { status: 500 }
    );
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  try {
    const { id } = await params;
    const userId = session.user.id;
    const dek = await getSessionDEK();

    const json = await req.json();
    const parsed = RecurringPatchSchema.parse(json);

    const updated = await updateRecurringTransaction(id, userId, dek, parsed);
    if (!updated) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    return NextResponse.json(updated);
  } catch (err) {
    logger.error(`${LOG_TAG} PATCH [id] failed:`, err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Invalid request payload' },
      { status: 400 }
    );
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  try {
    const { id } = await params;
    const userId = session.user.id;

    await deleteRecurringTransaction(id, userId);

    logger.info(`${LOG_TAG} Deleted recurring transaction`, {
      userId,
      id,
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    logger.error(`${LOG_TAG} DELETE [id] failed:`, err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal Server Error' },
      { status: 500 }
    );
  }
}
