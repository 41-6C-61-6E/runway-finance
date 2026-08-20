import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getSessionDEK } from '@/lib/crypto-context';
import { resolveDataUserId } from '@/lib/sharing';
import { logger } from '@/lib/logger';
import { getDb } from '@/lib/db';
import { recurringTransactions } from '@/lib/db/schema';
import { eq, and, inArray } from 'drizzle-orm';
import {
  RecurringFilterSchema,
  RecurringCreateSchema,
  RecurringPatchSchema,
  RecurringBulkPatchSchema,
  RecurringBulkActionSchema,
} from '@/lib/validations/recurring';
import {
  getRecurringTransactions,
  applyRecurringFilters,
  computeRecurringSummaryFromItems,
  createManualRecurring,
  updateRecurringTransaction,
  deleteRecurringTransaction,
  type RecurringItem,
} from '@/lib/services/recurring-detection';

const LOG_TAG = '[api-recurring]';

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  try {
    const dataUserId = await resolveDataUserId(session.user.id);
    const dek = await getSessionDEK();

    const { searchParams } = new URL(req.url);
    const parsedParams = RecurringFilterSchema.parse({
      flowType: searchParams.get('flowType') || 'all',
      status: searchParams.get('status') || 'active',
      includeDismissed: searchParams.get('includeDismissed'),
      search: searchParams.get('search') || undefined,
      accountId: searchParams.get('accountId') || undefined,
      categoryId: searchParams.get('categoryId') || undefined,
    });
    const countOnly = searchParams.get('countOnly') === 'true';

    if (countOnly) {
      const res = await getRecurringTransactions(dataUserId, dek, { ...parsedParams, countOnly: true });
      const total = Array.isArray(res) ? res.length : res.count;
      return NextResponse.json({ counts: { total } });
    }

    const fullList = await getRecurringTransactions(dataUserId, dek, { includeDismissed: true });
    const items = applyRecurringFilters(fullList as RecurringItem[], parsedParams);
    const summary = computeRecurringSummaryFromItems(fullList as RecurringItem[]);

    return NextResponse.json({
      items,
      summary,
    });
  } catch (err) {
    logger.error(`${LOG_TAG} GET failed:`, err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal Server Error' },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  try {
    const dataUserId = await resolveDataUserId(session.user.id);
    const dek = await getSessionDEK();

    const json = await req.json();

    // Check if bulk action or create
    if (json.action) {
      const { action, ids } = RecurringBulkActionSchema.parse(json);
      const db = getDb();

      if (action === 'dismiss_all_pending') {
        await db
          .update(recurringTransactions)
          .set({ isDismissed: true, updatedAt: new Date() })
          .where(
            and(
              eq(recurringTransactions.userId, dataUserId),
              eq(recurringTransactions.isConfirmed, false),
              eq(recurringTransactions.isDismissed, false)
            )
          );
        return NextResponse.json({ success: true });
      }

      if (action === 'reset_unconfirmed') {
        await db
          .delete(recurringTransactions)
          .where(
            and(
              eq(recurringTransactions.userId, dataUserId),
              eq(recurringTransactions.isConfirmed, false)
            )
          );
        return NextResponse.json({ success: true });
      }

      if (ids && ids.length > 0) {
        if (action === 'confirm') {
          await Promise.all(
            ids.map((id) =>
              updateRecurringTransaction(id, dataUserId, dek, { isConfirmed: true, isDismissed: false })
            )
          );
        } else if (action === 'dismiss') {
          await Promise.all(
            ids.map((id) =>
              updateRecurringTransaction(id, dataUserId, dek, { isDismissed: true })
            )
          );
        } else if (action === 'undismiss') {
          // Restore a dismissed suggestion back to "needs review" — clears only
          // the dismissal flag and leaves isConfirmed untouched.
          await Promise.all(
            ids.map((id) =>
              updateRecurringTransaction(id, dataUserId, dek, { isDismissed: false })
            )
          );
        } else if (action === 'pause') {
          await Promise.all(
            ids.map((id) =>
              updateRecurringTransaction(id, dataUserId, dek, { isPaused: true })
            )
          );
        } else if (action === 'resume') {
          await Promise.all(
            ids.map((id) =>
              updateRecurringTransaction(id, dataUserId, dek, { isPaused: false })
            )
          );
        } else if (action === 'delete') {
          await Promise.all(
            ids.map((id) => deleteRecurringTransaction(id, dataUserId))
          );
        }
        return NextResponse.json({ success: true, count: ids.length });
      }

      return NextResponse.json({ error: 'No IDs provided' }, { status: 400 });
    }

    const parsed = RecurringCreateSchema.parse(json);

    const created = await createManualRecurring(dataUserId, dek, parsed);

    logger.info(`${LOG_TAG} Created recurring transaction manually`, {
      userId: dataUserId,
      merchantName: parsed.merchantName,
    });

    return NextResponse.json(created, { status: 201 });
  } catch (err) {
    logger.error(`${LOG_TAG} POST failed:`, err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Invalid request payload' },
      { status: 400 }
    );
  }
}

export async function PATCH(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  try {
    const dataUserId = await resolveDataUserId(session.user.id);
    const dek = await getSessionDEK();

    const json = await req.json();

    // Check if bulk or single
    if (json.items && Array.isArray(json.items)) {
      const parsed = RecurringBulkPatchSchema.parse(json);
      const results = await Promise.all(
        parsed.items.map((item) =>
          updateRecurringTransaction(item.id, dataUserId, dek, item)
        )
      );
      return NextResponse.json({ updated: results.filter(Boolean).length });
    } else {
      const parsed = RecurringPatchSchema.parse(json);
      if (!parsed.id) {
        return NextResponse.json({ error: 'id is required' }, { status: 400 });
      }
      const updated = await updateRecurringTransaction(parsed.id, dataUserId, dek, parsed);
      if (!updated) {
        return NextResponse.json({ error: 'Not found' }, { status: 404 });
      }
      return NextResponse.json(updated);
    }
  } catch (err) {
    logger.error(`${LOG_TAG} PATCH failed:`, err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Invalid update payload' },
      { status: 400 }
    );
  }
}

export async function DELETE(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  try {
    const dataUserId = await resolveDataUserId(session.user.id);
    const json = await req.json();
    const ids: string[] = json.ids || [];

    if (ids.length === 0) {
      return NextResponse.json({ error: 'ids array is required' }, { status: 400 });
    }

    const results = await Promise.all(
      ids.map((id) => deleteRecurringTransaction(id, dataUserId))
    );

    return NextResponse.json({ deleted: results.filter(Boolean).length });
  } catch (err) {
    logger.error(`${LOG_TAG} DELETE failed:`, err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal Server Error' },
      { status: 500 }
    );
  }
}
