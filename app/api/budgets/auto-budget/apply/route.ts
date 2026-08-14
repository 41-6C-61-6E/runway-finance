import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { budgets, categories } from '@/lib/db/schema';
import { eq, and, isNull, ne } from 'drizzle-orm';
import { logger } from '@/lib/logger';
import { getSessionDEK } from '@/lib/crypto-context';
import { encryptRow, decryptField } from '@/lib/crypto';
import { formatToCents } from '@/lib/services/account-history';

export async function POST(request: Request) {
  try {
    const session = await auth();
    const dataUserId = session?.user ? ((session.user as any).dataUserId ?? session.user.id) : undefined;
    if (!session?.user || !dataUserId) {
      return NextResponse.json({ error: 'unauthorized', message: 'User is not authenticated' }, { status: 401 });
    }

    let dek: Uint8Array;
    try {
      dek = await getSessionDEK();
    } catch (err) {
      logger.error('Failed to get session DEK for auto-budget apply', { error: err });
      return NextResponse.json({ error: 'encryption_error', message: 'Encryption session key is unavailable. Please re-authenticate.' }, { status: 500 });
    }

    let body: Record<string, any>;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'invalid_body', message: 'Invalid JSON request body' }, { status: 400 });
    }

    const items = Array.isArray(body.items) ? body.items : [];
    const overwriteExisting = body.overwriteExisting !== false;
    const targetPeriodType = (body.periodType as string) || 'monthly';
    const targetPeriodKey = (body.periodKey as string) || null;
    const isRecurring = body.isRecurring !== false;
    const effectiveFrom = targetPeriodKey || `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`;

    if (items.length === 0) {
      return NextResponse.json({ error: 'no_items', message: 'No items selected to publish' }, { status: 400 });
    }

    const db = getDb();

    const userCategories = await db
      .select()
      .from(categories)
      .where(eq(categories.userId, dataUserId));

    const decryptedCategories = await Promise.all(
      userCategories.map(async (c) => ({
        ...c,
        name: c.name ? await decryptField(c.name, dek).catch(() => c.name) : '',
      }))
    );

    let catchAllCategory = decryptedCategories.find(
      (c) => !c.isIncome && (c.name.toLowerCase() === 'everything else' || c.name.toLowerCase().includes('everything else'))
    );

    let appliedCount = 0;

    for (const item of items) {
      let catId = item.categoryId;
      const isEEItem = item.isEverythingElse || item.categoryId === 'all-other-grouped' || (item.categoryName && item.categoryName.toLowerCase() === 'everything else');

      if (isEEItem || !catId || catId === 'all-other-grouped') {
        if (!catchAllCategory) {
          const encryptedCat = await encryptRow(
            'categories',
            {
              userId: dataUserId,
              name: 'Everything Else',
              color: '#64748b',
              isIncome: false,
              categoryType: 'standard',
              excludeFromReports: false,
              isDiscretionary: true,
            },
            dek
          );
          const [newCat] = await db.insert(categories).values(encryptedCat).returning({ id: categories.id });
          catchAllCategory = { id: newCat.id, name: 'Everything Else', isIncome: false } as any;
        }
        catId = catchAllCategory.id;
      }
      if (!catId) continue;

      const rawAmount = parseFloat(String(item.amount ?? 0));
      if (isNaN(rawAmount) || rawAmount <= 0) continue;
      const numAmount = Math.round(rawAmount);

      const periodCondition = isRecurring
        ? isNull(budgets.yearMonth)
        : (targetPeriodKey ? eq(budgets.yearMonth, targetPeriodKey) : isNull(budgets.yearMonth));

      const [existing] = await db
        .select()
        .from(budgets)
        .where(
          and(
            eq(budgets.userId, dataUserId),
            eq(budgets.categoryId, catId),
            eq(budgets.periodType, targetPeriodType),
            periodCondition
          )
        )
        .limit(1);

      if (existing && !overwriteExisting) {
        continue;
      }

      if (overwriteExisting) {
        // Remove or deactivate any conflicting budgets with different periodType for this category
        await db
          .delete(budgets)
          .where(
            and(
              eq(budgets.userId, dataUserId),
              eq(budgets.categoryId, catId),
              ne(budgets.periodType, targetPeriodType)
            )
          );
      }

      const encryptedData = await encryptRow(
        'budgets',
        {
          userId: dataUserId,
          categoryId: catId,
          periodType: targetPeriodType,
          yearMonth: isRecurring ? null : targetPeriodKey,
          periodKey: isRecurring ? null : targetPeriodKey,
          effectiveFrom: effectiveFrom,
          effectiveTo: null,
          amount: formatToCents(numAmount),
          isRecurring: isRecurring,
          fundingAccountId: item.fundingAccountId || null,
          rollover: item.rollover === true,
          notes: item.notes || null,
        },
        dek
      );

      if (existing) {
        await db
          .update(budgets)
          .set({
            ...encryptedData,
            updatedAt: new Date(),
          })
          .where(eq(budgets.id, existing.id));
      } else {
        await db.insert(budgets).values(encryptedData);
      }

      if (typeof item.isDiscretionary === 'boolean') {
        await db
          .update(categories)
          .set({ isDiscretionary: item.isDiscretionary })
          .where(and(eq(categories.id, catId), eq(categories.userId, dataUserId)));
      }

      appliedCount++;
    }

    return NextResponse.json({
      success: true,
      count: appliedCount,
    });
  } catch (error) {
    logger.error('Error applying auto budget proposal', { error: error instanceof Error ? error.stack : error });
    return NextResponse.json({
      error: 'internal_error',
      message: error instanceof Error ? error.message : 'An error occurred while applying the budget proposal'
    }, { status: 500 });
  }
}

