import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { logger } from '@/lib/logger';
import { financialGoals } from '@/lib/db/schema';
import { eq, and, inArray } from 'drizzle-orm';

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const userId = session.user.id;
  const dataUserId = (session.user as any).dataUserId ?? session.user.id;

  try {
    const { updates } = await req.json();

    if (!Array.isArray(updates) || updates.length === 0) {
      return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
    }

    // Validate all updates belong to this user
    const goalIds = updates.map((u: any) => u.id);
    const existingGoals = await getDb()
      .select({ id: financialGoals.id })
      .from(financialGoals)
      .where(and(
        eq(financialGoals.userId, dataUserId),
        inArray(financialGoals.id, goalIds)
      ));

    const existingIds = new Set(existingGoals.map((g: any) => g.id));
    const validUpdates = updates.filter((u: any) => existingIds.has(u.id));

    if (validUpdates.length === 0) {
      return NextResponse.json({ error: 'No valid goals found' }, { status: 404 });
    }

    // Update sort orders
    for (const update of validUpdates) {
      await getDb()
        .update(financialGoals)
        .set({
          sortOrder: Number(update.sortOrder),
          updatedAt: new Date(),
        })
        .where(eq(financialGoals.id, update.id as any));
    }

    return NextResponse.json({ success: true, updated: validUpdates.length });
  } catch (err) {
    logger.error('POST /api/goals/bulk-reorder', { error: err });
    return NextResponse.json({ error: 'Failed to update goal order' }, { status: 500 });
  }
}
