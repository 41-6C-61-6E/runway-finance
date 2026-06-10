import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { plaidConnections } from '@/lib/db/schema';
import { getSessionDEK } from '@/lib/crypto-context';
import { encryptField } from '@/lib/crypto';
import { getPlaidClient } from '@/lib/plaid';
import { syncPlaidConnection } from '@/lib/services/plaid-sync';
import { logger } from '@/lib/logger';
import { eq, and } from 'drizzle-orm';

const LOG_TAG = '[api-plaid-exchange-public-token]';

export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: 'unauthenticated', message: 'Authentication required' }, { status: 401 });
    }

    const userId = session.user.id;
    const dek = await getSessionDEK();

    let body: { publicToken?: string; institutionName?: string; institutionId?: string };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'validation_error', message: 'Invalid request body' }, { status: 400 });
    }

    const { publicToken, institutionName, institutionId } = body;
    if (!publicToken) {
      return NextResponse.json({ error: 'validation_error', message: 'publicToken is required' }, { status: 400 });
    }

    const client = await getPlaidClient(userId, dek);

    // Exchange public token for access token
    const exchangeResponse = await client.itemPublicTokenExchange({
      public_token: publicToken,
    });

    const accessToken = exchangeResponse.data.access_token;
    const itemId = exchangeResponse.data.item_id;

    // Encrypt access token
    const encryptedAccessToken = await encryptField(accessToken, dek);

    // Check if item already exists for this user
    const existing = await getDb()
      .select({ id: plaidConnections.id })
      .from(plaidConnections)
      .where(and(eq(plaidConnections.userId, userId), eq(plaidConnections.itemId, itemId)))
      .limit(1);

    let connectionId: string;

    if (existing.length > 0) {
      connectionId = existing[0].id;
      await getDb()
        .update(plaidConnections)
        .set({
          accessTokenEncrypted: encryptedAccessToken,
          accessTokenIv: '',
          accessTokenTag: '',
          institutionId: institutionId || null,
          institutionName: institutionName || 'Plaid Bank',
          lastSyncStatus: 'pending',
          lastSyncError: null,
        })
        .where(eq(plaidConnections.id, connectionId));
      logger.info(`${LOG_TAG} Updated existing Plaid Connection`, { itemId, connectionId });
    } else {
      const [inserted] = await getDb()
        .insert(plaidConnections)
        .values({
          userId,
          accessTokenEncrypted: encryptedAccessToken,
          accessTokenIv: '',
          accessTokenTag: '',
          itemId,
          institutionId: institutionId || null,
          institutionName: institutionName || 'Plaid Bank',
          label: institutionName || 'Plaid Connection',
          syncFrequency: 'manual',
          lastSyncStatus: 'pending',
        })
        .returning();
      connectionId = inserted.id;
      logger.info(`${LOG_TAG} Created new Plaid Connection`, { itemId, connectionId });
    }

    // Trigger initial sync synchronously to fetch accounts and transactions immediately
    logger.info(`${LOG_TAG} Triggering initial sync`, { connectionId });
    const syncResult = await syncPlaidConnection(connectionId, userId, dek);

    return NextResponse.json({
      success: true,
      connectionId,
      sync: syncResult,
    });
  } catch (error: any) {
    logger.error(`${LOG_TAG} Error exchanging public token`, { error: error.message });
    return NextResponse.json({
      error: 'internal_error',
      message: error.response?.data?.error_message || error.message || 'Failed to exchange public token'
    }, { status: 500 });
  }
}
