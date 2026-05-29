import { auth } from 'auth';
import { getDb } from '@/lib/db';
import {
  paystubAutoGenerateSettings,
  paystubs,
  paystubLineItems,
  paystubFieldMappings,
} from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { createTransactionsFromLineItems } from '../route';

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const db = getDb();
  const result = await db
    .select()
    .from(paystubAutoGenerateSettings)
    .where(eq(paystubAutoGenerateSettings.userId, session.user.id));

  return Response.json(result);
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const db = getDb();
  const userId = session.user.id;

  let body: Record<string, any>;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const { mappingId, isEnabled, frequency, basePaystubId } = body;

  if (!mappingId) {
    return Response.json({ error: 'mappingId is required' }, { status: 400 });
  }

  // Check if setting already exists for this user + mapping
  const [existing] = await db
    .select()
    .from(paystubAutoGenerateSettings)
    .where(
      and(
        eq(paystubAutoGenerateSettings.userId, userId),
        eq(paystubAutoGenerateSettings.mappingId, mappingId)
      )
    )
    .limit(1);

  if (existing) {
    // Update existing
    const updates: Record<string, any> = { updatedAt: new Date() };
    if (isEnabled !== undefined) updates.isEnabled = isEnabled;
    if (frequency !== undefined) updates.frequency = frequency;
    if (basePaystubId !== undefined) updates.basePaystubId = basePaystubId;

    const [updated] = await db
      .update(paystubAutoGenerateSettings)
      .set(updates)
      .where(eq(paystubAutoGenerateSettings.id, existing.id))
      .returning();

    return Response.json(updated);
  }

  // Create new
  const [created] = await db
    .insert(paystubAutoGenerateSettings)
    .values({
      userId,
      mappingId,
      isEnabled: isEnabled ?? false,
      frequency: frequency || 'biweekly',
      basePaystubId: basePaystubId || null,
    })
    .returning();

  return Response.json(created, { status: 201 });
}

/**
 * Add a frequency interval to a date string (YYYY-MM-DD).
 */
export function addFrequencyInterval(dateStr: string, frequency: string): string {
  const date = new Date(dateStr + 'T00:00:00Z');

  switch (frequency) {
    case 'weekly':
      date.setUTCDate(date.getUTCDate() + 7);
      break;
    case 'biweekly':
      date.setUTCDate(date.getUTCDate() + 14);
      break;
    case 'semimonthly':
      date.setUTCDate(date.getUTCDate() + 15);
      break;
    case 'monthly': {
      const originalDay = date.getUTCDate();
      date.setUTCMonth(date.getUTCMonth() + 1);
      if (date.getUTCDate() !== originalDay) {
        date.setUTCDate(0);
      }
      break;
    }
    default:
      date.setUTCDate(date.getUTCDate() + 14); // Default to biweekly
  }

  return date.toISOString().split('T')[0];
}

/**
 * Compute the number of days in a frequency interval.
 */
export function getFrequencyDays(frequency: string): number {
  switch (frequency) {
    case 'weekly':
      return 7;
    case 'biweekly':
      return 14;
    case 'semimonthly':
      return 15;
    case 'monthly':
      return 30;
    default:
      return 14;
  }
}

export async function PATCH() {
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const db = getDb();
  const userId = session.user.id;
  const today = new Date().toISOString().split('T')[0];

  // Get all enabled auto-generate settings for this user
  const settings = await db
    .select()
    .from(paystubAutoGenerateSettings)
    .where(
      and(
        eq(paystubAutoGenerateSettings.userId, userId),
        eq(paystubAutoGenerateSettings.isEnabled, true)
      )
    );

  let generated = 0;

  for (const setting of settings) {
    if (!setting.basePaystubId) continue;

    // Get the base paystub
    const [basePaystub] = await db
      .select()
      .from(paystubs)
      .where(
        and(eq(paystubs.id, setting.basePaystubId), eq(paystubs.userId, userId))
      )
      .limit(1);

    if (!basePaystub) continue;

    // Get base line items
    const baseLineItems = await db
      .select()
      .from(paystubLineItems)
      .where(eq(paystubLineItems.paystubId, basePaystub.id));

    // Determine next expected check date
    const referenceDate = setting.lastGeneratedDate || basePaystub.checkDate;
    const nextExpectedDate = addFrequencyInterval(referenceDate, setting.frequency);

    // Only generate if the next expected date is today or in the past
    if (nextExpectedDate > today) continue;

    // Compute shifted dates
    const frequencyDays = getFrequencyDays(setting.frequency);
    const baseCheckDate = new Date(basePaystub.checkDate + 'T00:00:00Z');
    const basePeriodStart = new Date(basePaystub.payPeriodStart + 'T00:00:00Z');
    const basePeriodEnd = new Date(basePaystub.payPeriodEnd + 'T00:00:00Z');

    // How many days to shift from base check date to next expected date
    const nextDate = new Date(nextExpectedDate + 'T00:00:00Z');
    const daysDiff = Math.round(
      (nextDate.getTime() - baseCheckDate.getTime()) / (1000 * 60 * 60 * 24)
    );

    const newCheckDate = nextExpectedDate;
    const newPeriodStart = new Date(basePeriodStart.getTime() + daysDiff * 86400000)
      .toISOString()
      .split('T')[0];
    const newPeriodEnd = new Date(basePeriodEnd.getTime() + daysDiff * 86400000)
      .toISOString()
      .split('T')[0];

    // Get the mapping for employer name
    const [mapping] = await db
      .select()
      .from(paystubFieldMappings)
      .where(eq(paystubFieldMappings.id, setting.mappingId))
      .limit(1);

    // Clone the paystub
    const [newPaystub] = await db
      .insert(paystubs)
      .values({
        userId,
        employerName: basePaystub.employerName,
        employeeName: basePaystub.employeeName,
        payPeriodStart: newPeriodStart,
        payPeriodEnd: newPeriodEnd,
        checkDate: newCheckDate,
        adviceNumber: null, // Auto-generated stubs don't have advice numbers
        grossCurrent: basePaystub.grossCurrent,
        taxesCurrent: basePaystub.taxesCurrent,
        deductionsCurrent: basePaystub.deductionsCurrent,
        netCurrent: basePaystub.netCurrent,
        grossYtd: null, // YTD values can't be reliably cloned
        taxesYtd: null,
        deductionsYtd: null,
        source: 'auto_generated',
        isAutoGenerated: true,
        mappingId: setting.mappingId,
      })
      .returning();

    // Clone line items
    const clonedLineItems: Array<{
      id: string;
      section: string;
      description: string;
      amount: string;
      mappingAction: string;
      categoryId: string | null;
    }> = [];

    for (const baseItem of baseLineItems) {
      const [cloned] = await db
        .insert(paystubLineItems)
        .values({
          paystubId: newPaystub.id,
          userId,
          section: baseItem.section,
          description: baseItem.description,
          amount: baseItem.amount,
          ytdAmount: null, // YTD values can't be reliably cloned
          hours: baseItem.hours,
          rate: baseItem.rate,
          ytdHours: null,
          mappingAction: baseItem.mappingAction,
          categoryId: baseItem.categoryId,
        })
        .returning();

      clonedLineItems.push(cloned);
    }

    // Create transactions from cloned line items
    await createTransactionsFromLineItems(
      db,
      userId,
      newPaystub,
      clonedLineItems,
      basePaystub.employerName,
      newCheckDate
    );

    // Update lastGeneratedDate
    await db
      .update(paystubAutoGenerateSettings)
      .set({
        lastGeneratedDate: newCheckDate,
        updatedAt: new Date(),
      })
      .where(eq(paystubAutoGenerateSettings.id, setting.id));

    generated++;
  }

  return Response.json({ generated });
}
