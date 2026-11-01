import { NextRequest } from 'next/server';
import { getDb } from '@/lib/db';
import { logger } from '@/lib/logger';
import { financialGoals, categories, tags, goalTags } from '@/lib/db/schema';
import { eq, and, asc } from 'drizzle-orm';
import { decryptRow, encryptRow, decryptField } from '@/lib/crypto';
import { computeGoalAllocations, getGoalAllocation } from '@/lib/services/goal-allocation';
import { formatToCents } from '@/lib/services/account-history';
import { getCached, setCached, invalidateUserServerCache } from '@/lib/server-cache';
import { withAuthAndDek } from '@/lib/utils/require-auth';
import { apiSuccess, apiBadRequest, apiNotFound } from '@/lib/api/response';

export const GET = withAuthAndDek(async (req: Request, { userId, dek }) => {
  const { searchParams } = new URL(req.url);
  const status = searchParams.get('status');
  const type = searchParams.get('type');
  const cacheKey = `user:${userId}:financial-goals:${status || ''}:${type || ''}`;
  const cached = getCached<any>(cacheKey);
  if (cached) {
    return apiSuccess(cached);
  }

  const conditions = [eq(financialGoals.userId, userId)];
  if (status) conditions.push(eq(financialGoals.status, status));
  if (type) conditions.push(eq(financialGoals.type, type));

  const goals = await getDb()
    .select({
      goal: financialGoals,
      category: {
        id: categories.id,
        name: categories.name,
        color: categories.color,
      },
    })
    .from(financialGoals)
    .leftJoin(categories, eq(financialGoals.categoryId, categories.id))
    .where(and(...conditions))
    .orderBy(asc(financialGoals.sortOrder));

  const allGoalTags = await getDb()
    .select({
      goalId: goalTags.goalId,
      tagId: tags.id,
      tagName: tags.name,
      tagColor: tags.color,
    })
    .from(goalTags)
    .innerJoin(tags, eq(goalTags.tagId, tags.id))
    .where(eq(tags.userId, userId));

  const decryptedTags = await Promise.all(
    allGoalTags.map(async (t) => ({
      goalId: t.goalId,
      id: t.tagId,
      name: t.tagName ? await decryptField(t.tagName, dek) : '',
      color: t.tagColor,
    }))
  );

  const tagsByGoalId = new Map<string, Array<{ id: string; name: string; color: string }>>();
  for (const t of decryptedTags) {
    if (!tagsByGoalId.has(t.goalId)) {
      tagsByGoalId.set(t.goalId, []);
    }
    tagsByGoalId.get(t.goalId)!.push({ id: t.id, name: t.name, color: t.color });
  }

  const decrypted = await Promise.all(
    goals.map(async (row) => {
      const decGoal = await decryptRow('financial_goals', row.goal, dek);
      let decCategory = null;
      if (row.category && row.category.id) {
        decCategory = {
          id: row.category.id,
          name: row.category.name ? await decryptField(row.category.name, dek) : '',
          color: row.category.color,
        };
      }
      return {
        ...decGoal,
        category: decCategory,
        tags: tagsByGoalId.get(decGoal.id) ?? [],
      };
    })
  );

  const allocationMap = new Map<string, any>();
  try {
    const allocation = await computeGoalAllocations(userId);
    for (const account of allocation.accounts) {
      for (const goal of account.goals) {
        allocationMap.set(goal.goalId, goal);
      }
    }
  } catch (err) {
    logger.error('GET /api/goals allocation', { error: err });
  }

  const enriched = decrypted.map((goal) => {
    const alloc = allocationMap.get(goal.id);
    return {
      ...goal,
      allocatedAmount: alloc?.allocatedAmount ?? parseFloat(goal.currentAmount),
      isUnderfunded: alloc?.isUnderfunded ?? false,
      accountBalance: alloc?.accountBalance ?? null,
      accountName: alloc?.accountName ?? null,
      remainingOnAccount: alloc?.remainingOnAccount ?? null,
    };
  });

  setCached(cacheKey, enriched, 2 * 60 * 1000);
  logger.info('GET /api/goals', { count: enriched.length, status, type });
  return apiSuccess(enriched);
});

export const POST = withAuthAndDek(async (req: Request, { userId, dek }) => {
  const body = (await req.json()) as any;
  const {
    name,
    description,
    type,
    targetAmount,
    currentAmount,
    initialAmount,
    targetDate,
    categoryId,
    tagIds,
    status,
    linkedAccountId,
    percentage,
    reserve,
    sortOrder,
  } = body;

  if (!name || !type || !targetAmount) {
    return apiBadRequest('name, type, and targetAmount are required');
  }

  const encryptedValues = await encryptRow(
    'financial_goals',
    {
      userId,
      name,
      description: description || null,
      type,
      targetAmount: formatToCents(parseFloat(String(targetAmount)) || 0),
      currentAmount: formatToCents(parseFloat(String(currentAmount || 0)) || 0),
      initialAmount: formatToCents(parseFloat(String(initialAmount != null ? initialAmount : currentAmount || 0)) || 0),
      targetDate: targetDate || null,
      categoryId: categoryId || null,
      status: status || 'active',
      linkedAccountId: linkedAccountId || null,
      percentage: percentage != null ? String(percentage) : '100',
      reserve: reserve != null ? formatToCents(parseFloat(String(reserve)) || 0) : '0.00',
      sortOrder: sortOrder != null ? Number(sortOrder) : 0,
    },
    dek
  );

  const goal = await getDb().insert(financialGoals).values(encryptedValues).returning();

  if (tagIds && tagIds.length > 0) {
    await getDb().insert(goalTags).values(
      tagIds.map((tagId: string) => ({ goalId: goal[0].id, tagId }))
    );
  }

  const decrypted = await decryptRow('financial_goals', goal[0], dek);

  invalidateUserServerCache(userId);
  logger.info('POST /api/goals', { goalId: goal[0].id });
  return apiSuccess(decrypted, 201);
});

export const PATCH = withAuthAndDek(async (req: Request, { userId, dek }) => {
  const { searchParams } = new URL(req.url);
  const body = (await req.json()) as any;
  const { id, ...updates } = body;

  const goalId = id || searchParams.get('id');

  if (!goalId) {
    return apiBadRequest('id is required');
  }

  const existing = await getDb()
    .select()
    .from(financialGoals)
    .where(and(eq(financialGoals.id, goalId), eq(financialGoals.userId, userId)))
    .limit(1);

  if (!existing[0]) {
    return apiNotFound('Goal not found');
  }

  const updateData: Record<string, unknown> = {};
  if (updates.name !== undefined) updateData.name = updates.name;
  if (updates.description !== undefined) updateData.description = updates.description;
  if (updates.targetAmount !== undefined) updateData.targetAmount = formatToCents(parseFloat(String(updates.targetAmount)) || 0);
  if (updates.currentAmount !== undefined) updateData.currentAmount = formatToCents(parseFloat(String(updates.currentAmount)) || 0);
  if (updates.initialAmount !== undefined) updateData.initialAmount = formatToCents(parseFloat(String(updates.initialAmount)) || 0);
  if (updates.targetDate !== undefined) updateData.targetDate = updates.targetDate || null;
  if (updates.categoryId !== undefined) updateData.categoryId = updates.categoryId || null;
  if (updates.percentage !== undefined) updateData.percentage = String(updates.percentage);
  if (updates.reserve !== undefined) updateData.reserve = formatToCents(parseFloat(String(updates.reserve)) || 0);
  if (updates.status !== undefined) updateData.status = updates.status;
  if (updates.sortOrder !== undefined) updateData.sortOrder = Number(updates.sortOrder);
  if (updates.linkedAccountId !== undefined) updateData.linkedAccountId = updates.linkedAccountId || null;

  if (updates.status === 'completed' && existing[0].linkedAccountId) {
    try {
      const currentAllocation = await getGoalAllocation(goalId, userId);
      if (currentAllocation) {
        updateData.allocatedAmount = String(currentAllocation.allocatedAmount);
      }
    } catch {
      // If allocation computation fails, continue without persisting
    }
  }

  const encrypted = await encryptRow('financial_goals', updateData, dek);
  const updated = await getDb()
    .update(financialGoals)
    .set({
      ...encrypted,
      updatedAt: new Date(),
    })
    .where(eq(financialGoals.id, goalId))
    .returning();

  if (updates.tagIds !== undefined) {
    await getDb().delete(goalTags).where(eq(goalTags.goalId, goalId));
    if (updates.tagIds.length > 0) {
      await getDb().insert(goalTags).values(
        updates.tagIds.map((tagId: string) => ({ goalId, tagId }))
      );
    }
  }

  invalidateUserServerCache(userId);
  logger.info('PATCH /api/goals', { goalId: id });
  const decrypted = updated[0] ? await decryptRow('financial_goals', updated[0], dek) : updated[0];
  return apiSuccess(decrypted);
});

export const DELETE = withAuthAndDek(async (req: Request, { userId }) => {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');

  if (!id) {
    return apiBadRequest('id is required');
  }

  const existing = await getDb()
    .select()
    .from(financialGoals)
    .where(and(eq(financialGoals.id, id), eq(financialGoals.userId, userId)))
    .limit(1);

  if (!existing[0]) {
    return apiNotFound('Goal not found');
  }

  await getDb().delete(financialGoals).where(eq(financialGoals.id, id));

  invalidateUserServerCache(userId);
  logger.info('DELETE /api/goals', { goalId: id });
  return apiSuccess({ success: true });
});
