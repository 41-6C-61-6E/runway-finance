import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { requireDeleteConfirmation } from '@/lib/utils/require-auth';
import { getDb } from '@/lib/db';
import { simplifinConnections } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'unauthenticated', message: 'Authentication required' }, { status: 401 });
  }

  requireDeleteConfirmation(_request);

  const userId = session.user.id;

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

  await getDb().delete(simplifinConnections).where(eq(simplifinConnections.id, id));

  return new NextResponse(null, { status: 204 });
}
