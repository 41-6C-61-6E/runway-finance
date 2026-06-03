/**
 * GET  /api/sharing  — get the current user's share group status
 * POST /api/sharing  — not used here; invite lives at /api/sharing/invite
 */
import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getShareGroup } from '@/lib/sharing';
import { logger } from '@/lib/logger';

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ message: 'Unauthorised' }, { status: 401 });
  }

  try {
    const group = await getShareGroup(session.user.id);
    return NextResponse.json({ group });
  } catch (err) {
    logger.error('[sharing] GET /api/sharing failed', { error: err instanceof Error ? err.message : String(err) });
    return NextResponse.json({ message: 'Internal server error' }, { status: 500 });
  }
}
