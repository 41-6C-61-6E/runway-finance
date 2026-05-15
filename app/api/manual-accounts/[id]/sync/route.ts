import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { accounts } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { syncManualAccount, readApiConfig } from '@/lib/services/manual-accounts';
import { logger } from '@/lib/logger';

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
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

  const apiConfig = await readApiConfig(userId);
  const result = await syncManualAccount(id, userId, apiConfig);

  logger.info('POST /api/manual-accounts/[id]/sync', { userId, id, accountType: account.type, status: result.status });

  if (result.status === 'error') {
    return NextResponse.json(result, { status: 500 });
  }

  return NextResponse.json(result);
}
