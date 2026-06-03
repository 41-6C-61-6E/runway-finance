/**
 * DELETE /api/sharing/invite/[id]  — revoke a pending invitation
 */
import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { revokeInvitation } from '@/lib/sharing';
import { logger } from '@/lib/logger';

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ message: 'Unauthorised' }, { status: 401 });
  }

  const { id } = await params;

  try {
    const result = await revokeInvitation(id, session.user.id);
    if (result.error) {
      return NextResponse.json({ message: result.error }, { status: 400 });
    }
    logger.info('[sharing] Invitation revoked via API', { userId: session.user.id, invitationId: id });
    return NextResponse.json({ success: true });
  } catch (err) {
    logger.error('[sharing] DELETE /api/sharing/invite/[id] failed', { error: err instanceof Error ? err.message : String(err) });
    return NextResponse.json({ message: 'Internal server error' }, { status: 500 });
  }
}
