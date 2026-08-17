import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { syncLogs } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { getSessionDEK } from '@/lib/crypto-context';
import { decryptRows } from '@/lib/crypto';
import { apiUnauthorized, handleApiError } from '@/lib/api/response';
import { getOwnedConnection } from '@/lib/utils/require-auth';

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;

    const session = await auth();
    if (!session?.user?.id) {
      return apiUnauthorized();
    }

    const userId = session.user.id;

    // Verify user owns connection before querying logs or decrypting
    const { errorResponse } = await getOwnedConnection(id, userId);
    if (errorResponse) {
      return errorResponse;
    }

    const dek = await getSessionDEK();

    const { searchParams } = new URL(request.url);
    const limit = Math.min(Math.max(1, parseInt(searchParams.get('limit') || '20', 10)), 100);
    const offset = Math.max(0, parseInt(searchParams.get('offset') || '0', 10));

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
  } catch (err) {
    return handleApiError(err);
  }
}
