import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { simplifinConnections } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { getSessionDEK } from '@/lib/crypto-context';
import { decryptField } from '@/lib/crypto';
import { fetchAccounts } from '@/lib/simplefin';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'unauthenticated', message: 'Authentication required' }, { status: 401 });
  }

  const userId = session.user.id;

  // Fetch connection
  const [connection] = await getDb()
    .select()
    .from(simplifinConnections)
    .where(eq(simplifinConnections.id, id))
    .limit(1);

  if (!connection) {
    return NextResponse.json({ error: 'not_found', message: 'SimpleFIN connection not found' }, { status: 404 });
  }

  const { resolveDataUserId } = await import('@/lib/sharing');
  const requestingDataUserId = await resolveDataUserId(userId);
  const connectionDataUserId = await resolveDataUserId(connection.userId);

  if (connectionDataUserId !== requestingDataUserId) {
    return NextResponse.json({ error: 'forbidden', message: 'Unauthorized access to connection' }, { status: 403 });
  }

  try {
    const dek = await getSessionDEK();
    const accessUrl = await decryptField(connection.accessUrlEncrypted, dek);

    // Fetch account list from SimpleFIN without retrieving transaction history (start/end dates equal to now)
    const now = new Date();
    const data = await fetchAccounts(accessUrl, now, now);

    const formattedAccounts = data.accounts.map(acc => ({
      id: acc.id,
      name: acc.name,
      institution: acc.org?.name || 'Unknown Bank',
      balance: acc.balance,
      currency: acc.currency,
    }));

    return NextResponse.json({
      accounts: formattedAccounts,
      disabledAccounts: connection.disabledAccounts || [],
    });
  } catch (error) {
    return NextResponse.json(
      { error: 'fetch_failed', message: error instanceof Error ? error.message : 'Failed to fetch accounts from SimpleFIN' },
      { status: 500 }
    );
  }
}
