import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { issues } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { UpdateIssueStatusSchema } from '@/lib/validations/issue';
import { logger } from '@/lib/logger';
import { apiNotFound, apiUnauthorized, apiValidation, handleApiError } from '@/lib/api/response';

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  if (process.env.BUG_REPORTING !== 'true') {
    return apiNotFound('Feature disabled');
  }

  const session = await auth();
  if (!session?.user?.id) {
    return apiUnauthorized();
  }

  const { id } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'bad_request', message: 'Invalid request body' }, { status: 400 });
  }

  const parsed = UpdateIssueStatusSchema.safeParse(body);
  if (!parsed.success) {
    return apiValidation(parsed.error.flatten().fieldErrors, 'Validation failed');
  }

  const { status } = parsed.data;

  try {
    const [updated] = await getDb()
      .update(issues)
      .set({
        status,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(issues.id, id),
          eq(issues.userId, session.user.id)
        )
      )
      .returning();

    if (!updated) {
      return apiNotFound('Issue not found');
    }

    logger.info('PATCH /api/bug-reporting/[id] - updated status', {
      userId: session.user.id,
      issueId: id,
      status,
    });

    return NextResponse.json(updated);
  } catch (error) {
    logger.error('PATCH /api/bug-reporting/[id] failed', {
      error: error instanceof Error ? error.message : String(error),
    });
    return handleApiError(error, 'Failed to update issue status');
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  if (process.env.BUG_REPORTING !== 'true') {
    return apiNotFound('Feature disabled');
  }

  const session = await auth();
  if (!session?.user?.id) {
    return apiUnauthorized();
  }

  const { id } = await params;

  try {
    const [deleted] = await getDb()
      .delete(issues)
      .where(
        and(
          eq(issues.id, id),
          eq(issues.userId, session.user.id)
        )
      )
      .returning();

    if (!deleted) {
      return apiNotFound('Issue not found');
    }

    logger.info('DELETE /api/bug-reporting/[id] - deleted', {
      userId: session.user.id,
      issueId: id,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error('DELETE /api/bug-reporting/[id] failed', {
      error: error instanceof Error ? error.message : String(error),
    });
    return handleApiError(error, 'Failed to delete issue');
  }
}
