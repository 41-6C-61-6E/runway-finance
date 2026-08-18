import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getSessionDEK } from '@/lib/crypto-context';
import { logger } from '@/lib/logger';
import { getDb } from '@/lib/db';
import { simplifinConnections, plaidConnections, accountShareMembers, userEncryptionKeys } from '@/lib/db/schema';
import { and, eq } from 'drizzle-orm';
import { apiNotFound, apiForbidden } from '@/lib/api/response';

// ── Share roles ───────────────────────────────────────────────────────────────

export type ShareRole = 'primary' | 'admin' | 'member';

const ROLE_RANK: Record<ShareRole, number> = {
  member: 1,
  admin: 2,
  primary: 3,
};

export function roleAtLeast(role: ShareRole, minRole: ShareRole): boolean {
  return ROLE_RANK[role] >= ROLE_RANK[minRole];
}

/**
 * Effective share role for a user:
 * - primary (owns their own data) → 'primary'
 * - active member → role from account_share_members ('admin' | 'member')
 * - unknown/removed → 'member' (safe default: no destructive permissions)
 */
export async function getEffectiveRole(userId: string): Promise<ShareRole> {
  const db = getDb();
  const [keyRow] = await db
    .select({ primaryUserId: userEncryptionKeys.primaryUserId })
    .from(userEncryptionKeys)
    .where(eq(userEncryptionKeys.userId, userId))
    .limit(1);

  if (!keyRow) {
    return 'member';
  }

  if (keyRow.primaryUserId === null || keyRow.primaryUserId === userId) {
    return 'primary';
  }

  const [row] = await db
    .select({ role: accountShareMembers.role })
    .from(accountShareMembers)
    .where(
      and(
        eq(accountShareMembers.primaryUserId, keyRow.primaryUserId),
        eq(accountShareMembers.memberUserId, userId),
        eq(accountShareMembers.status, 'active')
      )
    )
    .limit(1);

  return row?.role === 'admin' ? 'admin' : 'member';
}

/**
 * Gate destructive shared-group actions by role.
 * Returns a 403 response when the user's role is below minRole, otherwise null.
 */
export async function requireMinRole(minRole: ShareRole, userId: string): Promise<NextResponse | null> {
  const role = await getEffectiveRole(userId);
  if (roleAtLeast(role, minRole)) {
    return null;
  }
  return apiForbidden('You do not have permission to perform this action');
}

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
