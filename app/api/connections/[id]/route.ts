import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { requireDeleteConfirmation } from '@/lib/utils/require-auth';
import { getDb } from '@/lib/db';
import { simplifinConnections, accounts, syncLogs } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { logger } from '@/lib/logger';

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'unauthenticated', message: 'Authentication required' }, { status: 401 });
  }

  const userId = session.user.id;

  const [connection] = await getDb()
    .select()
    .from(simplifinConnections)
    .where(eq(simplifinConnections.id, id))
    .limit(1);

  if (!connection) {
    return NextResponse.json(
      { error: 'not_found', message: 'Connection not found' },
      { status: 404 }
    );
  }

  if (connection.userId !== userId) {
    return NextResponse.json(
      { error: 'forbidden', message: 'You do not own this connection' },
      { status: 403 }
    );
  }

  let body: { label?: string; syncFrequency?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: 'validation_error', message: 'Invalid request body' },
      { status: 400 }
    );
  }

  const updateData: Record<string, any> = {};
  
  if ('label' in body && body.label !== undefined) {
    if (!body.label || body.label.trim().length === 0) {
      return NextResponse.json(
        { error: 'validation_error', message: 'Label is required' },
        { status: 400 }
      );
    }
    updateData.label = body.label.trim();
  }

  if ('syncFrequency' in body && body.syncFrequency !== undefined) {
    const validFrequencies = ['manual', 'daily', 'weekly', 'monthly'];
    if (!validFrequencies.includes(body.syncFrequency)) {
      return NextResponse.json(
        { error: 'validation_error', message: 'Invalid sync frequency' },
        { status: 400 }
      );
    }
    updateData.syncFrequency = body.syncFrequency;
  }

  const [updated] = await getDb()
    .update(simplifinConnections)
    .set(updateData)
    .where(eq(simplifinConnections.id, id))
    .returning();

  logger.info('Connection updated', { connectionId: id, updateData });
  return NextResponse.json(updated);
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'unauthenticated', message: 'Authentication required' }, { status: 401 });
  }

  requireDeleteConfirmation(request);

  const userId = session.user.id;

  // Parse optional body for keepData flag
  let keepData = false;
  try {
    const body = await request.json();
    keepData = body.keepData === true;
  } catch {
    // No body or invalid JSON — default to delete all (current behavior)
  }

  // Find the connection
  const [connection] = await getDb()
    .select()
    .from(simplifinConnections)
    .where(eq(simplifinConnections.id, id))
    .limit(1);

  if (!connection) {
    return NextResponse.json(
      { error: 'not_found', message: 'Connection not found' },
      { status: 404 }
    );
  }

  if (connection.userId !== userId) {
    return NextResponse.json(
      { error: 'forbidden', message: 'You do not own this connection' },
      { status: 403 }
    );
  }

  if (keepData) {
    // Disconnect accounts from this connection so they survive deletion
    await getDb()
      .update(accounts)
      .set({ connectionId: null })
      .where(eq(accounts.connectionId, id));
  }

  // Remove dependent sync logs first because this table does not cascade on delete.
  await getDb().delete(syncLogs).where(eq(syncLogs.connectionId, id));
  await getDb().delete(simplifinConnections).where(eq(simplifinConnections.id, id));

  logger.info('Connection deleted', { connectionId: id, keepData });
  return new NextResponse(null, { status: 204 });
}
