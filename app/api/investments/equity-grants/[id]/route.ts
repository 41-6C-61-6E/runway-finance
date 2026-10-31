import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getSessionDEK } from '@/lib/crypto-context';
import { z } from 'zod';
import { logger } from '@/lib/logger';
import {
  updateEquityGrant,
  deleteEquityGrant,
} from '@/lib/services/equity-grants';
import { CreateEquityGrantSchema } from '../route';

const LOG_TAG = '[api-equity-grants-id]';

const UpdateEquityGrantSchema = CreateEquityGrantSchema.partial().extend({
  applyValuationToCompany: z.boolean().optional(),
});

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json(
      { error: 'unauthenticated', message: 'Authentication required' },
      { status: 401 }
    );
  }

  const { id } = await context.params;
  const userId = session.user.id;
  const dek = await getSessionDEK();

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: 'invalid_body', message: 'Request body must be valid JSON' },
      { status: 400 }
    );
  }

  const parsed = UpdateEquityGrantSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: 'validation_error',
        details: parsed.error.flatten().fieldErrors,
        message: 'Invalid equity grant update parameters',
      },
      { status: 400 }
    );
  }

  try {
    const updated = await updateEquityGrant(id, userId, parsed.data, dek);
    return NextResponse.json(updated);
  } catch (error) {
    if (error instanceof Error && error.message === 'grant_not_found') {
      return NextResponse.json(
        { error: 'not_found', message: 'Equity grant not found' },
        { status: 404 }
      );
    }
    logger.error(`${LOG_TAG} Error updating equity grant`, {
      id,
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      { error: 'internal_error', message: 'Failed to update equity grant' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json(
      { error: 'unauthenticated', message: 'Authentication required' },
      { status: 401 }
    );
  }

  const { id } = await context.params;
  const userId = session.user.id;
  const dek = await getSessionDEK();

  try {
    await deleteEquityGrant(id, userId, dek);
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof Error && error.message === 'grant_not_found') {
      return NextResponse.json(
        { error: 'not_found', message: 'Equity grant not found' },
        { status: 404 }
      );
    }
    logger.error(`${LOG_TAG} Error deleting equity grant`, {
      id,
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      { error: 'internal_error', message: 'Failed to delete equity grant' },
      { status: 500 }
    );
  }
}

