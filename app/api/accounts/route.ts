import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { accounts } from '@/lib/db/schema';
import { eq, and, asc } from 'drizzle-orm';
import { logger } from '@/lib/logger';

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json(
      { error: 'unauthenticated', message: 'Authentication required' },
      { status: 401 }
    );
  }

  const userId = session.user.id;
  const { searchParams } = new URL(request.url);
  const includeHidden = searchParams.get('includeHidden') === 'true';
  const typeFilter = searchParams.get('type');

  logger.info('Fetching accounts', { includeHidden, type: typeFilter });

  const whereConditions = [eq(accounts.userId, userId)];

  if (!includeHidden) {
    whereConditions.push(eq(accounts.isHidden, false));
  }

  if (typeFilter) {
    whereConditions.push(eq(accounts.type, typeFilter));
  }

  const result = await getDb()
    .select()
    .from(accounts)
    .where(and(...whereConditions))
    .orderBy(asc(accounts.displayOrder));

  logger.info('Accounts fetched', { count: result.length });
  return NextResponse.json(result);
}
