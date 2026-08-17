import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getSessionDEK } from '@/lib/crypto-context';
import { logger } from '@/lib/logger';
import { getDb } from '@/lib/db';
import { simplifinConnections, plaidConnections } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { apiNotFound, apiForbidden } from '@/lib/api/response';

export function requireDeleteConfirmation(request: Request): void {
  if (request.headers.get('X-Confirm-Delete') !== 'true') {
    throw NextResponse.json(
      { error: 'confirmation_required', message: 'Include X-Confirm-Delete: true header' },
      { status: 400 }
    );
  }
}

export async function getOwnedConnection(connectionId: string, requestingUserId: string): Promise<{
  connection: any;
  isSimplefin: boolean;
  errorResponse?: NextResponse;
}> {
  const db = getDb();
  let isSimplefin = true;
  let [connection] = await db
    .select()
    .from(simplifinConnections)
    .where(eq(simplifinConnections.id, connectionId))
    .limit(1);

  if (!connection) {
    isSimplefin = false;
    const [plaidConn] = await db
      .select()
      .from(plaidConnections)
      .where(eq(plaidConnections.id, connectionId))
      .limit(1);
    connection = plaidConn as any;
  }

  if (!connection) {
    return { connection: null, isSimplefin, errorResponse: apiNotFound('Connection not found') };
  }

  const { resolveDataUserId } = await import('@/lib/sharing');
  const requestingDataUserId = await resolveDataUserId(requestingUserId);
  const connectionDataUserId = await resolveDataUserId(connection.userId);

  if (connectionDataUserId !== requestingDataUserId) {
    return { connection: null, isSimplefin, errorResponse: apiForbidden('You do not own this connection') };
  }

  return { connection, isSimplefin };
}

export interface AuthContext {
  session: any;
  userId: string;
  dataUserId: string;
}

export interface AuthDekContext extends AuthContext {
  dek: Uint8Array;
}

/**
 * Safely extracts the user ID from a NextAuth session object.
 */
export function getUserId(session: any): string | null {
  return session?.user?.id ?? null;
}

/**
 * Safely extracts the data user ID from a NextAuth session object, falling back to user ID.
 */
export function getDataUserId(session: any): string | null {
  if (!session?.user) return null;
  return (session.user as any).dataUserId ?? session.user.id ?? null;
}

export function withAuth(
  handler: (req: Request, ctx: AuthContext) => Promise<Response | NextResponse>
) {
  return async (req: Request = new Request('http://localhost')): Promise<Response | NextResponse> => {
    try {
      const session = await auth();
      const userId = getUserId(session);
      if (!userId) {
        return NextResponse.json(
          { error: 'Unauthorized', message: 'Authentication required' },
          { status: 401 }
        );
      }
      const dataUserId = getDataUserId(session) ?? userId;
      return await handler(req, { session, userId, dataUserId });
    } catch (error) {
      logger.error('API route error in withAuth', { error: error instanceof Error ? error.message : String(error) });
      return NextResponse.json(
        { error: 'internal_error', message: 'Internal server error' },
        { status: 500 }
      );
    }
  };
}

export function withAuthAndDek(
  handler: (req: Request, ctx: AuthDekContext) => Promise<Response | NextResponse>
) {
  return withAuth(async (req: Request, ctx: AuthContext) => {
    try {
      const dek = await getSessionDEK();
      return await handler(req, { ...ctx, dek });
    } catch (error) {
      logger.error('API route error fetching DEK', { error: error instanceof Error ? error.message : String(error) });
      return NextResponse.json(
        { error: 'encryption_error', message: 'Failed to access encryption keys' },
        { status: 500 }
      );
    }
  });
}
