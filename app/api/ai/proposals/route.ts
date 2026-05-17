import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { aiProposals } from '@/lib/db/schema';
import { eq, and, desc } from 'drizzle-orm';
import { logger } from '@/lib/logger';

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  }

  const userId = session.user.id;
  const { searchParams } = new URL(request.url);
  const status = searchParams.get('status'); // optional filter
  const type = searchParams.get('type'); // optional filter

  const whereConditions = [eq(aiProposals.userId, userId)];
  if (status) {
    whereConditions.push(eq(aiProposals.status, status));
  }
  if (type) {
    whereConditions.push(eq(aiProposals.type, type));
  }

  const proposals = await getDb()
    .select()
    .from(aiProposals)
    .where(and(...whereConditions))
    .orderBy(desc(aiProposals.createdAt));

  logger.info('GET /api/ai/proposals', { userId, count: proposals.length, status, type });
  return NextResponse.json(proposals);
}
