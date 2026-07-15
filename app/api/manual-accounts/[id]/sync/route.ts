import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { accounts } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { syncManualAccount, readApiConfig } from '@/lib/services/manual-accounts';
import { logger } from '@/lib/logger';
import { getSessionDEK } from '@/lib/crypto-context';
import { decryptField } from '@/lib/crypto';
import { manualAccountScheduler } from '@/lib/services/manual-account-scheduler';

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
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
    return NextResponse.json({ error: 'not_found', message: 'Account not found' }, { status: 404 });
  }

  const apiConfig = await readApiConfig(userId);
  const result = await syncManualAccount(id, dataUserId, apiConfig, dek);

  logger.info('POST /api/manual-accounts/[id]/sync', { userId, id, accountType: account.type, status: result.status });

  // Reschedule the sync timer based on the updated balanceDate
  if (result.status === 'success') {
    const [refreshed] = await getDb()
      .select({ balanceDate: accounts.balanceDate, metadata: accounts.metadata })
      .from(accounts)
      .where(eq(accounts.id, id))
      .limit(1);

    if (refreshed) {
      const dek = await getSessionDEK();
      let syncFrequency = 'manual';
      try {
        let raw: string;
        if (typeof refreshed.metadata === 'string') {
          raw = await decryptField(refreshed.metadata, dek);
        } else {
          raw = JSON.stringify(refreshed.metadata || '{}');
        }
        const meta = JSON.parse(raw) as Record<string, unknown>;
        syncFrequency = (meta.syncFrequency as string) || 'manual';
      } catch {}
      await manualAccountScheduler.schedule(id, userId, syncFrequency, refreshed.balanceDate);
    }
  }

  if (result.status === 'error') {
    return NextResponse.json(result, { status: 500 });
  }

  return NextResponse.json(result);
}
