/**
 * DELETE /api/sharing/members/[memberId]
 * Remove a member from the share group, or leave if you are the member.
 */
import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { removeMember } from '@/lib/sharing';
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
    const result = await removeMember(memberId, session.user.id);
    if (result.error) {
      return NextResponse.json({ message: result.error }, { status: 400 });
    }
    logger.info('[sharing] Member removed via API', { requestingUserId: session.user.id, memberId });
    return NextResponse.json({ success: true });
  } catch (err) {
    logger.error('[sharing] DELETE /api/sharing/members/[memberId] failed', {
      error: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json({ message: 'Internal server error' }, { status: 500 });
  }
}
