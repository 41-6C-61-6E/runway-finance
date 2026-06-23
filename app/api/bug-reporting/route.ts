import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { issues, users } from '@/lib/db/schema';
import { eq, desc } from 'drizzle-orm';
import { CreateIssueSchema } from '@/lib/validations/issue';
import { logger } from '@/lib/logger';

export async function GET() {
  if (process.env.BUG_REPORTING !== 'true') {
    return NextResponse.json({ error: 'Feature disabled' }, { status: 404 });
  }

  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  }

  try {
    const rows = await getDb()
      .select({
        id: issues.id,
        userId: issues.userId,
        type: issues.type,
        title: issues.title,
        description: issues.description,
        status: issues.status,
        createdAt: issues.createdAt,
        updatedAt: issues.updatedAt,
        reporterName: users.username,
      })
      .from(issues)
      .leftJoin(users, eq(issues.userId, users.username))
      .orderBy(desc(issues.createdAt));

    return NextResponse.json(rows);
  } catch (error) {
    logger.error('GET /api/bug-reporting failed', {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json({ error: 'internal_server_error' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  if (process.env.BUG_REPORTING !== 'true') {
    return NextResponse.json({ error: 'Feature disabled' }, { status: 404 });
  }

  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const parsed = CreateIssueSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'validation_error', details: parsed.error.flatten().fieldErrors },
      { status: 400 }
    );
  }

  const { type, title, description } = parsed.data;
  const status = type === 'bug' ? 'reported' : 'requested';

  try {
    const [newIssue] = await getDb()
      .insert(issues)
      .values({
        userId: session.user.id,
        type,
        title,
        description,
        status,
      })
      .returning();

    logger.info('POST /api/bug-reporting - created', {
      userId: session.user.id,
      issueId: newIssue.id,
      type,
    });

    return NextResponse.json(newIssue, { status: 201 });
  } catch (error) {
    logger.error('POST /api/bug-reporting failed', {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json({ error: 'internal_server_error' }, { status: 500 });
  }
}
