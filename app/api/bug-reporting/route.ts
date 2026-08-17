import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { issues, users } from '@/lib/db/schema';
import { eq, desc } from 'drizzle-orm';
import { CreateIssueSchema } from '@/lib/validations/issue';
import { logger } from '@/lib/logger';
import { apiNotFound, apiUnauthorized, apiValidation, apiTooManyRequests, handleApiError } from '@/lib/api/response';
import { checkRateLimit } from '@/lib/rate-limit';

export async function GET() {
  if (process.env.BUG_REPORTING !== 'true') {
    return apiNotFound('Feature disabled');
  }

  const session = await auth();
  if (!session?.user?.id) {
    return apiUnauthorized();
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
      .where(eq(issues.userId, session.user.id))
      .orderBy(desc(issues.createdAt));

    return NextResponse.json(rows);
  } catch (error) {
    logger.error('GET /api/bug-reporting failed', {
      error: error instanceof Error ? error.message : String(error),
    });
    return handleApiError(error, 'Failed to fetch reported issues');
  }
}

export async function POST(request: Request) {
  if (process.env.BUG_REPORTING !== 'true') {
    return apiNotFound('Feature disabled');
  }

  const session = await auth();
  if (!session?.user?.id) {
    return apiUnauthorized();
  }

  const userId = session.user.id;
  if (!checkRateLimit(`bug-report:${userId}`, 10, 60_000)) {
    return apiTooManyRequests('Too many issue submissions. Please wait a moment.');
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'bad_request', message: 'Invalid request body' }, { status: 400 });
  }

  const parsed = CreateIssueSchema.safeParse(body);
  if (!parsed.success) {
    return apiValidation(parsed.error.flatten().fieldErrors, 'Validation failed');
  }

  const { type, title, description } = parsed.data;
  const status = type === 'bug' ? 'reported' : 'requested';

  try {
    const [newIssue] = await getDb()
      .insert(issues)
      .values({
        userId,
        type,
        title,
        description,
        status,
      })
      .returning();

    logger.info('POST /api/bug-reporting - created', {
      userId,
      issueId: newIssue.id,
      type,
    });

    return NextResponse.json(newIssue, { status: 201 });
  } catch (error) {
    logger.error('POST /api/bug-reporting failed', {
      error: error instanceof Error ? error.message : String(error),
    });
    return handleApiError(error, 'Failed to create issue report');
  }
}
