import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { logger } from '@/lib/logger';
import { financialGoals } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const goals = await getDb().select().from(financialGoals).where(eq(financialGoals.userId, session.user.id));
  logger.info('GET /api/financial-goals', { count: goals.length });
  return NextResponse.json(goals);
}
