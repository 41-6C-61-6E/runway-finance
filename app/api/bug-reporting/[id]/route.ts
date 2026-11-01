import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { issues } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { UpdateIssueSchema } from '@/lib/validations/issue';
import { logger } from '@/lib/logger';
import { apiNotFound, apiUnauthorized, apiForbidden, apiValidation, handleApiError } from '@/lib/api/response';

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

  const parsed = UpdateIssueSchema.safeParse(body);
  if (!parsed.success) {
    return apiValidation(parsed.error.flatten().fieldErrors, 'Validation failed');
  }

  const { status, title, description, type } = parsed.data;

  try {
    const updateData: Record<string, any> = {
      updatedAt: new Date(),
    };
    if (status !== undefined) updateData.status = status;
    if (title !== undefined) updateData.title = title;
    if (description !== undefined) updateData.description = description;
    if (type !== undefined) updateData.type = type;

    // Check existing issue and enforce author ownership for editing details
    const [existing] = await getDb()
      .select({ userId: issues.userId })
      .from(issues)
      .where(eq(issues.id, id))
      .limit(1);

    if (!existing) {
      return apiNotFound('Issue not found');
    }

    if ((title !== undefined || description !== undefined || type !== undefined) && existing.userId !== session.user.id) {
      return apiForbidden('Only the author can edit issue details');
    }

    const [updated] = await getDb()
      .update(issues)
      .set(updateData)
      .where(eq(issues.id, id))
      .returning();

    if (!updated) {
      return apiNotFound('Issue not found');
    }

    logger.info('PATCH /api/bug-reporting/[id] - updated issue', {
      actorUserId: session.user.id,
      issueId: id,
      updatedFields: Object.keys(updateData),
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
      .where(and(eq(issues.id, id), eq(issues.userId, session.user.id)))
      .returning();

    if (!deleted) {
      return apiNotFound('Issue not found');
    }

    logger.info('DELETE /api/bug-reporting/[id] - deleted', {
      actorUserId: session.user.id,
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
