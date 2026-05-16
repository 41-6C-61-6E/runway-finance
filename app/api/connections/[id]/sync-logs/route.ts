import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { syncLogs } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { getSessionDEK } from '@/lib/crypto-context';
import { decryptRows } from '@/lib/crypto';

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'unauthenticated', message: 'Authentication required' }, { status: 401 });
  }

  const userId = session.user.id;
  const dek = await getSessionDEK();

  const { searchParams } = new URL(request.url);
  const limit = Math.min(parseInt(searchParams.get('limit') || '20', 10), 100);
  const offset = parseInt(searchParams.get('offset') || '0', 10);

  const [totalRow] = await getDb()
    .select({ count: syncLogs.id })
    .from(syncLogs)
    .where(eq(syncLogs.connectionId, id))
    .limit(1);

  const total = totalRow ? parseInt(totalRow.count, 10) : 0;

  const logs = await getDb()
    .select()
    .from(syncLogs)
    .where(eq(syncLogs.connectionId, id))
    .orderBy(syncLogs.startedAt)
    .limit(limit)
    .offset(offset);

  const decrypted = await decryptRows('sync_logs', logs, dek);
  return NextResponse.json({ data: decrypted, total, limit, offset });
}
