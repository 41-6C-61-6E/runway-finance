import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { tags, transactionTags, accountTags, budgetTags, goalTags } from '@/lib/db/schema';
import { eq, sql } from 'drizzle-orm';
import { CreateTagSchema } from '@/lib/validations/tag';
import { logger } from '@/lib/logger';
import { getSessionDEK } from '@/lib/crypto-context';
import { decryptRows, encryptRow } from '@/lib/crypto';

export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  }

  const userId = session.user.id;
  const dataUserId = (session.user as any).dataUserId ?? session.user.id;
  const dek = await getSessionDEK();

  const rows = await getDb()
    .select()
    .from(tags)
    .where(eq(tags.userId, dataUserId))
    .orderBy(tags.name);

  const decrypted = await decryptRows('tags', rows, dek);

  // Attach usage counts
  const [txCounts, acctCounts, budgetCounts, goalCounts] = await Promise.all([
    getDb()
      .select({ tagId: transactionTags.tagId, count: sql<number>`count(*)::int` })
      .from(transactionTags)
      .groupBy(transactionTags.tagId),
    getDb()
      .select({ tagId: accountTags.tagId, count: sql<number>`count(*)::int` })
      .from(accountTags)
      .groupBy(accountTags.tagId),
    getDb()
      .select({ tagId: budgetTags.tagId, count: sql<number>`count(*)::int` })
      .from(budgetTags)
      .groupBy(budgetTags.tagId),
    getDb()
      .select({ tagId: goalTags.tagId, count: sql<number>`count(*)::int` })
      .from(goalTags)
      .groupBy(goalTags.tagId),
  ]);

  const txMap = new Map(txCounts.map((r) => [r.tagId, r.count]));
  const acctMap = new Map(acctCounts.map((r) => [r.tagId, r.count]));
  const budgetMap = new Map(budgetCounts.map((r) => [r.tagId, r.count]));
  const goalMap = new Map(goalCounts.map((r) => [r.tagId, r.count]));

  const data = decrypted.map((tag: any) => ({
    ...tag,
    transactionCount: txMap.get(tag.id) ?? 0,
    accountCount: acctMap.get(tag.id) ?? 0,
    budgetCount: budgetMap.get(tag.id) ?? 0,
    goalCount: goalMap.get(tag.id) ?? 0,
    usageCount:
      (txMap.get(tag.id) ?? 0) +
      (acctMap.get(tag.id) ?? 0) +
      (budgetMap.get(tag.id) ?? 0) +
      (goalMap.get(tag.id) ?? 0),
  }));

  logger.info('GET /api/tags', { userId, count: data.length });
  return NextResponse.json(data);
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  }

  const userId = session.user.id;
  const dataUserId = (session.user as any).dataUserId ?? session.user.id;
  const dek = await getSessionDEK();

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const parsed = CreateTagSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'validation_error', details: parsed.error.flatten().fieldErrors },
      { status: 400 }
    );
  }

  const { name, color, description } = parsed.data;

  const encrypted = await encryptRow('tags', {
    userId: dataUserId,
    name,
    color,
    description: description ?? null,
  }, dek);

  const [tag] = await getDb().insert(tags).values(encrypted).returning();

  logger.info('POST /api/tags - created', { userId, tagId: tag.id });
  return NextResponse.json(tag, { status: 201 });
}
