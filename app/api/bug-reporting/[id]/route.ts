import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { issues } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { UpdateIssueStatusSchema } from '@/lib/validations/issue';
import { logger } from '@/lib/logger';

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  if (process.env.BUG_REPORTING !== 'true') {
    return NextResponse.json({ error: 'Feature disabled' }, { status: 404 });
  }

  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  }

  const { id } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const parsed = UpdateIssueStatusSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'validation_error', details: parsed.error.flatten().fieldErrors },
      { status: 400 }
    );
  }

  const { status } = parsed.data;

  try {
    const [updated] = await getDb()
      .update(issues)
      .set({
        status,
        updatedAt: new Date(),
      })
      .where(eq(issues.id, id))
      .returning();

    if (!updated) {
      return NextResponse.json({ error: 'not_found' }, { status: 404 });
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
    return NextResponse.json({ error: 'internal_server_error' }, { status: 500 });
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  if (process.env.BUG_REPORTING !== 'true') {
    return NextResponse.json({ error: 'Feature disabled' }, { status: 404 });
  }

  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  }

  const { id } = await params;

  try {
    const [deleted] = await getDb()
      .delete(issues)
      .where(eq(issues.id, id))
      .returning();

    if (!deleted) {
      return NextResponse.json({ error: 'not_found' }, { status: 404 });
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
    return NextResponse.json({ error: 'internal_server_error' }, { status: 500 });
  }
}
