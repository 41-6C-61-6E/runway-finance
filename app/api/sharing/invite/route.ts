/**
 * POST /api/sharing/invite  — create a new sharing invitation
 */
import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { createInvitation } from '@/lib/sharing';
import { logger } from '@/lib/logger';

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ message: 'Unauthorised' }, { status: 401 });
  }

  // Only the data owner (primary user) may create invitations
  const userId = session.user.id;
  const dataUserId = (session.user as any).dataUserId ?? userId;
  if (dataUserId !== userId) {
    return NextResponse.json(
      { message: 'Only the account owner can create sharing invitations.' },
      { status: 403 }
    );
  }

  try {
    const body = await request.json();
    const { inviteeEmail } = body;

    if (!inviteeEmail || typeof inviteeEmail !== 'string') {
      return NextResponse.json({ message: 'inviteeEmail is required' }, { status: 400 });
    }

    const result = await createInvitation(userId, inviteeEmail.toLowerCase().trim());

    if ('error' in result) {
      return NextResponse.json({ message: result.error }, { status: 400 });
    }

    logger.info('[sharing] Invitation created via API', { userId, inviteeEmail });
    return NextResponse.json({ invitationId: result.invitationId, pin: result.pin }, { status: 201 });
  } catch (err) {
    logger.error('[sharing] POST /api/sharing/invite failed', { error: err instanceof Error ? err.message : String(err) });
    return NextResponse.json({ message: 'Internal server error' }, { status: 500 });
  }
}
