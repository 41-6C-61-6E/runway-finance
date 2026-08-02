import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getSessionDEK } from '@/lib/crypto-context';
import { logger } from '@/lib/logger';

export function requireDeleteConfirmation(request: Request): void {
  if (request.headers.get('X-Confirm-Delete') !== 'true') {
    throw NextResponse.json(
      { error: 'confirmation_required', message: 'Include X-Confirm-Delete: true header' },
      { status: 400 }
    );
  }
}

export interface AuthContext {
  session: any;
  userId: string;
}

export interface AuthDekContext extends AuthContext {
  dek: Uint8Array;
}

export function withAuth(
  handler: (req: Request, ctx: AuthContext) => Promise<Response | NextResponse>
) {
  return async (req: Request = new Request('http://localhost')): Promise<Response | NextResponse> => {
    try {
      const session = await auth();
      if (!session?.user?.id) {
        return NextResponse.json(
          { error: 'Unauthorized', message: 'Authentication required' },
          { status: 401 }
        );
      }
      return await handler(req, { session, userId: session.user.id });
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
