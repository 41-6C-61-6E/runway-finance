/**
 * DELETE /api/sharing/members/[memberId]
 * Remove a member from the share group, or leave if you are the member.
 */
import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { removeMember, resolveDataUserId } from '@/lib/sharing';
import { logShareAudit, SHARE_AUDIT_ACTIONS } from '@/lib/share-audit';
import { logger } from '@/lib/logger';

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ memberId: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ message: 'Unauthorised' }, { status: 401 });
  }

  const { memberId } = await params;

  try {
    // Resolve the group's data owner BEFORE the mutation: removing a member
    // wipes their key row, after which they would resolve to themselves.
    const dataUserId = await resolveDataUserId(session.user.id);
    const result = await removeMember(memberId, session.user.id);
    if (result.error) {
      return NextResponse.json({ message: result.error }, { status: 400 });
    }
    await logShareAudit(dataUserId, session.user.id, SHARE_AUDIT_ACTIONS.MEMBER_REMOVED, 'account_share_members', memberId);
    logger.info('[sharing] Member removed via API', { requestingUserId: session.user.id, memberId });
    return NextResponse.json({ success: true });
  } catch (err) {
    logger.error('[sharing] DELETE /api/sharing/members/[memberId] failed', {
      error: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json({ message: 'Internal server error' }, { status: 500 });
  }
}
