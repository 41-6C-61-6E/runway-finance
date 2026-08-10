import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { budgets, categories } from '@/lib/db/schema';
import { eq, and, isNull } from 'drizzle-orm';
import { logger } from '@/lib/logger';
import { getSessionDEK } from '@/lib/crypto-context';
import { encryptRow, decryptField } from '@/lib/crypto';
import { formatToCents } from '@/lib/services/account-history';

export async function POST(request: Request) {
  const session = await auth();
  const dataUserId = session?.user ? ((session.user as any).dataUserId ?? session.user.id) : undefined;
  if (!session?.user || !dataUserId) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const dek = await getSessionDEK();
  let body: Record<string, any>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'invalid_body' }, { status: 400 });
  }

  const items = Array.isArray(body.items) ? body.items : [];
  const overwriteExisting = body.overwriteExisting !== false;
  const targetPeriodType = (body.periodType as string) || 'monthly';
  const targetPeriodKey = (body.periodKey as string) || null;
  const isRecurring = body.isRecurring !== false;

  if (items.length === 0) {
    return NextResponse.json({ error: 'no_items', message: 'No items selected to publish' }, { status: 400 });
  }

  const db = getDb();

  try {
    // 1. Fetch user categories to resolve any synthetic "all-other-grouped" ID
    const userCategories = await db
      .select()
      .from(categories)
      .where(eq(categories.userId, dataUserId));

    const decryptedCategories = await Promise.all(
      userCategories.map(async (c) => ({
        ...c,
        name: c.name ? await decryptField(c.name, dek) : '',
      }))
    );

    let catchAllCategory = decryptedCategories.find(
      (c) => c.name.toLowerCase().includes('other') || c.name.toLowerCase().includes('misc')
    );

    let appliedCount = 0;

    for (const item of items) {
      let catId = item.categoryId;
      if (catId === 'all-other-grouped' || !catId) {
        if (!catchAllCategory) {
          // Safely create a dedicated "All Other" category instead of overwriting arbitrary user categories
          const encryptedCat = await encryptRow(
            'categories',
            {
              userId: dataUserId,
              name: 'All Other',
              color: '#64748b',
              isIncome: false,
              categoryType: 'expense',
              excludeFromReports: false,
              isDiscretionary: true,
            },
            dek
          );
          const [newCat] = await db.insert(categories).values(encryptedCat).returning({ id: categories.id });
          catchAllCategory = { id: newCat.id, name: 'All Other' } as any;
        }
        catId = catchAllCategory?.id;
      }
      if (!catId) continue;

      const rawAmount = parseFloat(String(item.amount ?? 0));
      if (isNaN(rawAmount) || rawAmount <= 0) continue;
      const numAmount = Math.round(rawAmount);

      // Check if existing budget exists for this category & period
      // When isRecurring is true, yearMonth is null, so query must match isNull(budgets.yearMonth)
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

      const encryptedData = await encryptRow(
        'budgets',
        {
          userId: dataUserId,
          categoryId: catId,
          periodType: targetPeriodType,
          yearMonth: isRecurring ? null : targetPeriodKey,
          periodKey: isRecurring ? null : targetPeriodKey,
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

      // Update discretionary state on category if specified
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
    logger.error('Error applying auto budget proposal', { error });
    return NextResponse.json({ error: 'internal_error' }, { status: 500 });
  }
}
