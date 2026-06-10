import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { requireDeleteConfirmation } from '@/lib/utils/require-auth';
import { getDb } from '@/lib/db';
import { simplifinConnections, plaidConnections, accounts, syncLogs } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { logger } from '@/lib/logger';
import { syncScheduler } from '@/lib/services/sync-scheduler';

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'unauthenticated', message: 'Authentication required' }, { status: 401 });
  }

  const userId = session.user.id;

  // Check SimpleFIN connections first
  let isSimplefin = true;
  let [connection] = await getDb()
    .select()
    .from(simplifinConnections)
    .where(eq(simplifinConnections.id, id))
    .limit(1);

  if (!connection) {
    isSimplefin = false;
    const [plaidConn] = await getDb()
      .select()
      .from(plaidConnections)
      .where(eq(plaidConnections.id, id))
      .limit(1);
    connection = plaidConn as any;
  }

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
    const validFrequencies = ['manual', 'hourly', 'daily', 'weekly', 'monthly'];
    if (!validFrequencies.includes(body.syncFrequency)) {
      return NextResponse.json(
        { error: 'validation_error', message: 'Invalid sync frequency' },
        { status: 400 }
      );
    }
    updateData.syncFrequency = body.syncFrequency;
  }

  let updated: any;
  if (isSimplefin) {
    [updated] = await getDb()
      .update(simplifinConnections)
      .set(updateData)
      .where(eq(simplifinConnections.id, id))
      .returning();
  } else {
    [updated] = await getDb()
      .update(plaidConnections)
      .set(updateData)
      .where(eq(plaidConnections.id, id))
      .returning();
  }

  logger.info('Connection updated', { connectionId: id, updateData, isSimplefin });
  syncScheduler.schedule(id, updated.syncFrequency, updated.lastSyncAt);
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
    // No body or invalid JSON — default to delete all
  }

  // Find connection
  let isSimplefin = true;
  let [connection] = await getDb()
    .select()
    .from(simplifinConnections)
    .where(eq(simplifinConnections.id, id))
    .limit(1);

  if (!connection) {
    isSimplefin = false;
    const [plaidConn] = await getDb()
      .select()
      .from(plaidConnections)
      .where(eq(plaidConnections.id, id))
      .limit(1);
    connection = plaidConn as any;
  }

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

  if (isSimplefin) {
    if (keepData) {
      await getDb()
        .update(accounts)
        .set({ connectionId: null })
        .where(eq(accounts.connectionId, id));
    }
    await getDb().delete(syncLogs).where(eq(syncLogs.connectionId, id));
    await getDb().delete(simplifinConnections).where(eq(simplifinConnections.id, id));
  } else {
    if (keepData) {
      await getDb()
        .update(accounts)
        .set({ plaidConnectionId: null })
        .where(eq(accounts.plaidConnectionId, id));
    }
    await getDb().delete(syncLogs).where(eq(syncLogs.plaidConnectionId, id));
    await getDb().delete(plaidConnections).where(eq(plaidConnections.id, id));
  }

  syncScheduler.cancel(id);
  logger.info('Connection deleted', { connectionId: id, keepData, isSimplefin });
  return new NextResponse(null, { status: 204 });
}
