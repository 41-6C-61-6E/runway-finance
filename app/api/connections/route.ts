import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { requireDeleteConfirmation } from '@/lib/utils/require-auth';
import { getDb } from '@/lib/db';
import { simplifinConnections } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { logger } from '@/lib/logger';

export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'unauthenticated', message: 'Authentication required' }, { status: 401 });
  }

  const userId = session.user.id;

  const connections = await getDb()
    .select({
      id: simplifinConnections.id,
      label: simplifinConnections.label,
      lastSyncAt: simplifinConnections.lastSyncAt,
      lastSyncStatus: simplifinConnections.lastSyncStatus,
      lastSyncError: simplifinConnections.lastSyncError,
      createdAt: simplifinConnections.createdAt,
    })
    .from(simplifinConnections)
    .where(eq(simplifinConnections.userId, userId))
    .orderBy(simplifinConnections.createdAt);

  logger.info('Connections fetched', { count: connections.length });
  return NextResponse.json(connections);
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'unauthenticated', message: 'Authentication required' }, { status: 401 });
  }

  const userId = session.user.id;

  // Check if user already has a connection (single-connection per phase 1 design)
  const existing = await getDb()
    .select({ id: simplifinConnections.id })
    .from(simplifinConnections)
    .where(eq(simplifinConnections.userId, userId))
    .limit(1);

  if (existing.length > 0) {
    return NextResponse.json(
      { error: 'conflict', message: 'A connection already exists for this user' },
      { status: 409 }
    );
  }

  let body: { setupToken: string; label?: string };
  try {
    body = await request.json();
  } catch {
    logger.warn('Connection create invalid request body');
    return NextResponse.json(
      { error: 'validation_error', message: 'Invalid request body' },
      { status: 400 }
    );
  }

  const parsed = CreateConnectionSchema.safeParse(body);
  if (!parsed.success) {
    logger.warn('Connection create validation failed', { errors: parsed.error.flatten().fieldErrors });
    return NextResponse.json(
      { error: 'validation_error', message: 'Invalid request body', details: parsed.error.flatten().fieldErrors },
      { status: 400 }
    );
  }

  const { setupToken, label } = parsed.data;

  // Claim access URL from SimpleFIN
  let accessUrl: string;
  try {
    const { claimAccessUrl } = await import('@/lib/simplefin');
    accessUrl = await claimAccessUrl(setupToken);
  } catch (err) {
    if (err instanceof Error && 'code' in err) {
      const code = (err as { code: string }).code;
      if (code === 'invalid_token') {
        logger.warn('Connection claim invalid token');
        return NextResponse.json(
          { error: 'invalid_token', message: 'Invalid setup token' },
          { status: 400 }
        );
      }
      if (code === 'claim_failed') {
        logger.warn('Connection claim failed');
        return NextResponse.json(
          { error: 'claim_failed', message: 'Failed to claim SimpleFIN access URL. Invalid token or already claimed.' },
          { status: 502 }
        );
      }
    }
    logger.warn('Connection claim failed (fallback)');
    return NextResponse.json(
      { error: 'claim_failed', message: 'Failed to claim SimpleFIN access URL. Invalid token or already claimed.' },
      { status: 502 }
    );
  }

  // Encrypt the access URL with user's DEK
  const { encryptField } = await import('@/lib/crypto');
  const { getSessionDEK } = await import('@/lib/crypto-context');
  const dek = await getSessionDEK();
  const encryptedPayload = await encryptField(accessUrl, dek);

  // Insert connection
  const [connection] = await getDb()
    .insert(simplifinConnections)
    .values({
      userId,
      accessUrlEncrypted: encryptedPayload,
      accessUrlIv: '',
      accessUrlTag: '',
      label,
    })
    .returning();

  logger.info('Connection created', { connectionId: connection.id, label: connection.label });
  return NextResponse.json(connection, { status: 201 });
}

import { CreateConnectionSchema } from '@/lib/validations/connection';
