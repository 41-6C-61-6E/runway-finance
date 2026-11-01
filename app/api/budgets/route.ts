import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { accounts, budgets, categories, categorySpendingSummary, categoryIncomeSummary, transactions, transactionTags, userSettings } from '@/lib/db/schema';
import { eq, and, or, isNull, sql, inArray, gte, lt, lte } from 'drizzle-orm';
import { logger } from '@/lib/logger';
import { getSessionDEK } from '@/lib/crypto-context';
import { decryptField, decryptRows, encryptRow } from '@/lib/crypto';
import { formatToCents } from '@/lib/services/account-history';
import { ensureCategoryDiscretionaryColumn } from '@/lib/db/seed-categories';

import { handleGetBudgets, getPreviousPeriodKey } from '@/lib/services/budgets/budget-calculator';

export async function GET(request: Request) {
  const session = await auth();
  const userId = session?.user?.id;
  if (!session?.user || !userId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const dek = await getSessionDEK();
  return await handleGetBudgets(request, userId, dek);
}

export async function POST(request: Request) {
  const session = await auth();
  const userId = session?.user?.id;
  if (!session?.user || !userId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const dek = await getSessionDEK();
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'invalid_body' }, { status: 400 });
  }

  const db = getDb();
  try {
    const targetPeriodKey = (body.periodKey as string) ?? null;
    const targetPeriodType = (body.periodType as string) || 'monthly';
    let targetCategoryId = body.categoryId as string;
    const effectiveFrom = targetPeriodKey || (
      targetPeriodType === 'yearly'
        ? String(new Date().getFullYear())
        : targetPeriodType === 'quarterly'
        ? `${new Date().getFullYear()}-Q${Math.floor(new Date().getMonth() / 3) + 1}`
        : `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`
    );

    // Handle synthetic or named 'Everything Else' category creation
    if (targetCategoryId === 'everything-else-special' || !targetCategoryId) {
      const userCategories = await db
        .select()
        .from(categories)
        .where(eq(categories.userId, userId));

      const decryptedCategories = await Promise.all(
        userCategories.map(async (c) => ({
          ...c,
          name: c.name ? await decryptField(c.name, dek) : '',
        }))
      );

      let eeCat = decryptedCategories.find((c) => c.name.toLowerCase() === 'everything else');
      if (!eeCat) {
        const encryptedCat = await encryptRow(
          'categories',
          {
            userId,
            name: 'Everything Else',
            color: '#64748b',
            isIncome: false,
            categoryType: 'expense',
            excludeFromReports: false,
            isDiscretionary: true,
          },
          dek
        );
        const [newCat] = await db.insert(categories).values(encryptedCat).returning({ id: categories.id });
        targetCategoryId = newCat.id;
      } else {
        targetCategoryId = eeCat.id;
      }
    }

    const [existing] = await db
      .select()
      .from(budgets)
      .where(
        and(
          eq(budgets.userId, userId),
          eq(budgets.categoryId, targetCategoryId),
          eq(budgets.periodType, targetPeriodType),
          targetPeriodKey ? eq(budgets.yearMonth, targetPeriodKey) : isNull(budgets.yearMonth)
        )
      )
      .limit(1);

    if (existing) {
      return NextResponse.json(
        { error: 'duplicate_budget', message: 'A budget already exists for this category and period' },
        { status: 400 }
      );
    }

    const encryptedValues = await encryptRow('budgets', {
      userId,
      categoryId: targetCategoryId,
      periodType: targetPeriodType,
      yearMonth: body.isRecurring !== false ? null : targetPeriodKey,
      periodKey: body.isRecurring !== false ? null : targetPeriodKey,
      effectiveFrom: effectiveFrom,
      effectiveTo: null,
      amount: formatToCents(parseFloat(String(body.amount ?? 0)) || 0),
      isRecurring: body.isRecurring !== false,
      fundingAccountId: (body.fundingAccountId as string) ?? null,
      rollover: body.rollover === true,
      notes: (body.notes as string) ?? null,
    }, dek);

    if (typeof body.isDiscretionary === 'boolean') {
      await db
        .update(categories)
        .set({ isDiscretionary: body.isDiscretionary })
        .where(and(eq(categories.id, targetCategoryId), eq(categories.userId, userId)));
    }

    const [budget] = await db
      .insert(budgets)
      .values(encryptedValues)
      .returning();

    return NextResponse.json(budget, { status: 201 });
  } catch (error) {
    logger.error('Error creating budget', { error });
    return NextResponse.json({ error: 'internal_error' }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const userId = session.user.id;
  const dek = await getSessionDEK();

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'invalid_body' }, { status: 400 });
  }

  const id = (searchParams.get('id') || body.id) as string;
  if (!id) {
    return NextResponse.json({ error: 'missing_id' }, { status: 400 });
  }

  const db = getDb();
  const [existing] = await db
    .select()
    .from(budgets)
    .where(and(eq(budgets.id, id), eq(budgets.userId, userId)))
    .limit(1);

  if (!existing) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }

  const targetCategoryId = (body.categoryId as string) || existing.categoryId;
  if (typeof body.isDiscretionary === 'boolean' && targetCategoryId) {
    await db
      .update(categories)
      .set({ isDiscretionary: body.isDiscretionary })
      .where(and(eq(categories.id, targetCategoryId), eq(categories.userId, userId)));
  }

  const applyMode = (body.applyMode as string) || 'future';
  const currentPeriodKey = (body.periodKey as string) || `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`;
  const periodType = (body.periodType as string) || existing.periodType;

  if (existing.isRecurring && applyMode === 'future' && body.amount !== undefined) {
    const existingFrom = existing.effectiveFrom || '1970-01';
    if (existingFrom < currentPeriodKey) {
      const prevPeriod = getPreviousPeriodKey(periodType, currentPeriodKey);
      await db
        .update(budgets)
        .set({ effectiveTo: prevPeriod, updatedAt: new Date() })
        .where(eq(budgets.id, id));

      const newEncryptedData = await encryptRow('budgets', {
        userId,
        categoryId: targetCategoryId,
        periodType: periodType,
        yearMonth: null,
        periodKey: null,
        effectiveFrom: currentPeriodKey,
        effectiveTo: null,
        amount: formatToCents(parseFloat(String(body.amount)) || 0),
        isRecurring: true,
        fundingAccountId: (body.fundingAccountId as string) ?? existing.fundingAccountId,
        rollover: body.rollover !== undefined ? body.rollover === true : existing.rollover,
        notes: (body.notes as string) ?? existing.notes,
      }, dek);

      const [newBudget] = await db.insert(budgets).values(newEncryptedData).returning();
      return NextResponse.json(newBudget);
    }
  }

  let updateData: Record<string, unknown> = {};
  if (body.categoryId !== undefined) updateData.categoryId = body.categoryId;
  if (body.periodType !== undefined) updateData.periodType = body.periodType;
  if (body.amount !== undefined) updateData.amount = formatToCents(parseFloat(String(body.amount)) || 0);
  if (body.isRecurring !== undefined) updateData.isRecurring = body.isRecurring;
  if (body.periodKey !== undefined) {
    updateData.yearMonth = body.isRecurring ? null : body.periodKey;
    updateData.periodKey = body.isRecurring ? null : body.periodKey;
  }
  if (body.effectiveFrom !== undefined) updateData.effectiveFrom = body.effectiveFrom;
  if (body.effectiveTo !== undefined) updateData.effectiveTo = body.effectiveTo;
  if (body.fundingAccountId !== undefined) updateData.fundingAccountId = body.fundingAccountId || null;
  if (body.rollover !== undefined) updateData.rollover = body.rollover;
  if (body.notes !== undefined) updateData.notes = body.notes || null;
  updateData.updatedAt = new Date();

  updateData = await encryptRow('budgets', updateData, dek);

  try {
    const [updated] = await db
      .update(budgets)
      .set(updateData)
      .where(eq(budgets.id, id))
      .returning();
    return NextResponse.json(updated);
  } catch (error) {
    logger.error('Error updating budget', { error });
    return NextResponse.json({ error: 'internal_error' }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const session = await auth();
  const userId = session?.user?.id;
  if (!session?.user || !userId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const action = searchParams.get('action');
  const periodKey = searchParams.get('periodKey') || `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`;

  const db = getDb();

  try {
    if (action === 'reset') {
      await db.delete(budgets).where(eq(budgets.userId, userId));
      return NextResponse.json({ success: true, message: 'All budgets reset' });
    }

    if (action === 'purge_history') {
      await db
        .delete(budgets)
        .where(
          and(
            eq(budgets.userId, userId),
            or(
              lt(budgets.effectiveTo, periodKey),
              lt(budgets.yearMonth, periodKey)
            )
          )
        );

      await db
        .update(budgets)
        .set({ effectiveFrom: periodKey })
        .where(
          and(
            eq(budgets.userId, userId),
            or(
              lt(budgets.effectiveFrom, periodKey),
              isNull(budgets.effectiveFrom)
            )
          )
        );

      return NextResponse.json({ success: true, message: 'Budget history removed' });
    }

    return NextResponse.json({ error: 'invalid_action' }, { status: 400 });
  } catch (error) {
    logger.error('Error in DELETE /api/budgets', { error });
    return NextResponse.json({ error: 'internal_error' }, { status: 500 });
  }
}
