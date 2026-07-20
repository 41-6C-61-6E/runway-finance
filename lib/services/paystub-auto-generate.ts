import { getDb } from '@/lib/db';
import {
  paystubAutoGenerateSettings,
  paystubs,
  paystubLineItems,
  paystubFieldMappings,
  transactions,
} from '@/lib/db/schema';
import { eq, and, desc } from 'drizzle-orm';
import { createTransactionsFromLineItems } from '@/app/api/paystubs/route';
import {
  updateCategorySpendingSummaries,
  updateCategoryIncomeSummaries,
  updateMonthlyCashFlowSummaries,
} from '@/lib/services/sync';
import { addFrequencyInterval, getFrequencyDays } from '@/lib/utils/paystub';
import { logger } from '@/lib/logger';
import { invalidateUserSearchCache } from '@/lib/services/search-cache';

const LOG_TAG = '[paystub-auto-generate]';

async function deletePaystubAndTransactions(db: any, paystubId: string, userId: string): Promise<void> {
  // Delete all transactions linked to this paystub
  await db
    .delete(transactions)
    .where(
      and(
        eq(transactions.paystubId, paystubId),
        eq(transactions.userId, userId)
      )
    );
  // Delete the paystub itself (cascades to line items in the DB)
  await db
    .delete(paystubs)
    .where(
      and(
        eq(paystubs.id, paystubId),
        eq(paystubs.userId, userId)
      )
    );
}

function getDaysDiff(dateStr1: string, dateStr2: string): number {
  const d1 = new Date(dateStr1 + 'T00:00:00Z');
  const d2 = new Date(dateStr2 + 'T00:00:00Z');
  return Math.abs(Math.round((d1.getTime() - d2.getTime()) / (1000 * 60 * 60 * 24)));
}

function findExistingPaystub(paystubsList: any[], expectedDate: string) {
  return paystubsList.find(p => getDaysDiff(p.checkDate, expectedDate) <= 2);
}

function findMostRecentPaystubBefore(paystubsList: any[], date: string) {
  const past = paystubsList.filter(p => p.checkDate < date);
  if (past.length === 0) return null;
  return past[past.length - 1]; // Array is sorted ascending, so last element is the most recent
}

function shouldRegenerate(
  existing: any,
  existingLineItems: any[],
  template: any,
  templateLineItems: any[],
  mappingsJson: Record<string, { action: string; categoryId: string | null }>
): boolean {
  if (
    existing.employerName !== template.employerName ||
    existing.employeeName !== template.employeeName ||
    existing.grossCurrent !== template.grossCurrent ||
    existing.taxesCurrent !== template.taxesCurrent ||
    existing.deductionsCurrent !== template.deductionsCurrent ||
    existing.netCurrent !== template.netCurrent ||
    existing.mappingId !== template.mappingId
  ) {
    return true;
  }

  if (existingLineItems.length !== templateLineItems.length) {
    return true;
  }

  const sortFn = (a: any, b: any) => {
    const secComp = a.section.localeCompare(b.section);
    if (secComp !== 0) return secComp;
    return a.description.localeCompare(b.description);
  };

  const sortedExisting = [...existingLineItems].sort(sortFn);
  const sortedTemplate = [...templateLineItems].sort(sortFn);

  for (let i = 0; i < sortedExisting.length; i++) {
    const e = sortedExisting[i];
    const t = sortedTemplate[i];

    const lookupKey = `${t.section}:${t.description}`;
    const mappingEntry = mappingsJson[lookupKey];
    const expectedAction = mappingEntry?.action || t.mappingAction || 'import';
    const expectedCategoryId = mappingEntry?.categoryId ?? t.categoryId;

    if (
      e.section !== t.section ||
      e.description !== t.description ||
      e.amount !== t.amount ||
      e.hours !== t.hours ||
      e.rate !== t.rate ||
      e.mappingAction !== expectedAction ||
      e.categoryId !== expectedCategoryId
    ) {
      return true;
    }
  }

  return false;
}

async function generatePaystub(
  db: any,
  effectiveUserId: string,
  template: any,
  templateLineItems: any[],
  basePaystub: any,
  newCheckDate: string,
  setting: any,
  dek: Uint8Array,
  mappingsJson: Record<string, { action: string; categoryId: string | null }>
) {
  const baseCheckDate = new Date(basePaystub.checkDate + 'T00:00:00Z');
  const basePeriodStart = new Date(basePaystub.payPeriodStart + 'T00:00:00Z');
  const basePeriodEnd = new Date(basePaystub.payPeriodEnd + 'T00:00:00Z');
  const nextDate = new Date(newCheckDate + 'T00:00:00Z');
  const daysDiff = Math.round(
    (nextDate.getTime() - baseCheckDate.getTime()) / (1000 * 60 * 60 * 24)
  );

  const newPeriodStart = new Date(basePeriodStart.getTime() + daysDiff * 86400000)
    .toISOString()
    .split('T')[0];
  const newPeriodEnd = new Date(basePeriodEnd.getTime() + daysDiff * 86400000)
    .toISOString()
    .split('T')[0];

  const [newPaystub] = await db
    .insert(paystubs)
    .values({
      userId: effectiveUserId,
      employerName: template.employerName,
      employeeName: template.employeeName,
      payPeriodStart: newPeriodStart,
      payPeriodEnd: newPeriodEnd,
      checkDate: newCheckDate,
      adviceNumber: null,
      grossCurrent: template.grossCurrent,
      taxesCurrent: template.taxesCurrent,
      deductionsCurrent: template.deductionsCurrent,
      netCurrent: template.netCurrent,
      grossYtd: null,
      taxesYtd: null,
      deductionsYtd: null,
      source: 'auto_generated',
      isAutoGenerated: true,
      mappingId: setting.mappingId,
    })
    .returning();

  const clonedLineItems: any[] = [];
  for (const item of templateLineItems) {
    const lookupKey = `${item.section}:${item.description}`;
    const mappingEntry = mappingsJson[lookupKey];
    const mappingAction = mappingEntry?.action || item.mappingAction || 'import';
    const categoryId = mappingEntry?.categoryId ?? item.categoryId;

    const [cloned] = await db
      .insert(paystubLineItems)
      .values({
        paystubId: newPaystub.id,
        userId: effectiveUserId,
        section: item.section,
        description: item.description,
        amount: item.amount,
        ytdAmount: null,
        hours: item.hours,
        rate: item.rate,
        ytdHours: null,
        mappingAction,
        categoryId,
      })
      .returning();

    clonedLineItems.push(cloned);
  }

  await createTransactionsFromLineItems(
    db,
    effectiveUserId,
    newPaystub,
    clonedLineItems,
    template.employerName,
    newCheckDate,
    dek,
  );

  return { ...newPaystub, lineItems: clonedLineItems };
}

export async function runAutoGenerate(
  userId: string,
  dek: Uint8Array,
  dataUserId?: string,
  force?: boolean,
): Promise<number> {
  const db = getDb();
  const effectiveUserId = dataUserId ?? userId;
  const today = new Date().toISOString().split('T')[0];

  const settings = await db
    .select()
    .from(paystubAutoGenerateSettings)
    .where(
      and(
        eq(paystubAutoGenerateSettings.userId, effectiveUserId),
        eq(paystubAutoGenerateSettings.isEnabled, true),
      )
    );

  let generated = 0;
  let didAnyDeletion = false;

  for (const setting of settings) {
    // Resolve the base (template) paystub
    let basePaystub = null;
    if (setting.basePaystubId) {
      const [found] = await db
        .select()
        .from(paystubs)
        .where(
          and(eq(paystubs.id, setting.basePaystubId), eq(paystubs.userId, effectiveUserId))
        )
        .limit(1);
      basePaystub = found;
    }
    if (!basePaystub) {
      // Fall back to most recent imported paystub
      const [latest] = await db
        .select()
        .from(paystubs)
        .where(
          and(eq(paystubs.userId, effectiveUserId), eq(paystubs.isAutoGenerated, false))
        )
        .orderBy(desc(paystubs.checkDate))
        .limit(1);
      basePaystub = latest;
    }
    if (!basePaystub) continue;

    const baseLineItems = await db
      .select()
      .from(paystubLineItems)
      .where(eq(paystubLineItems.paystubId, basePaystub.id));

    // Fetch all user paystubs & line items to build state in-memory
    let allUserPaystubs = await db
      .select()
      .from(paystubs)
      .where(eq(paystubs.userId, effectiveUserId))
      .orderBy(paystubs.checkDate);

    const allLineItems = await db
      .select()
      .from(paystubLineItems)
      .where(eq(paystubLineItems.userId, effectiveUserId));

    const lineItemsMap = new Map<string, any[]>();
    for (const item of allLineItems) {
      if (!lineItemsMap.has(item.paystubId)) {
        lineItemsMap.set(item.paystubId, []);
      }
      lineItemsMap.get(item.paystubId)!.push(item);
    }

    const [mapping] = await db
      .select()
      .from(paystubFieldMappings)
      .where(eq(paystubFieldMappings.id, setting.mappingId))
      .limit(1);
    const mappingsJson = (mapping?.mappings || {}) as Record<string, { action: string; categoryId: string | null }>;

    let currentReferenceDate = basePaystub.checkDate;
    let nextExpectedDate = addFrequencyInterval(currentReferenceDate, setting.frequency);
    let settingGenerated = 0;

    while (nextExpectedDate <= today || (force && settingGenerated === 0)) {
      const existing = findExistingPaystub(allUserPaystubs, nextExpectedDate);

      if (existing) {
        if (existing.isAutoGenerated) {
          let template = findMostRecentPaystubBefore(allUserPaystubs, existing.checkDate);
          let templateLineItems = [];
          if (template) {
            templateLineItems = lineItemsMap.get(template.id) || [];
          } else {
            template = basePaystub;
            templateLineItems = baseLineItems;
          }

          const existingLineItems = lineItemsMap.get(existing.id) || [];

          if (shouldRegenerate(existing, existingLineItems, template, templateLineItems, mappingsJson)) {
            await deletePaystubAndTransactions(db, existing.id, effectiveUserId);
            didAnyDeletion = true;

            allUserPaystubs = allUserPaystubs.filter(p => p.id !== existing.id);
            lineItemsMap.delete(existing.id);

            const newPaystub = await generatePaystub(
              db,
              effectiveUserId,
              template,
              templateLineItems,
              basePaystub,
              nextExpectedDate,
              setting,
              dek,
              mappingsJson
            );

            allUserPaystubs.push(newPaystub);
            allUserPaystubs.sort((a, b) => a.checkDate.localeCompare(b.checkDate));
            lineItemsMap.set(newPaystub.id, newPaystub.lineItems);

            settingGenerated++;
            generated++;
          }
        }
        currentReferenceDate = existing.checkDate;
      } else {
        // Missed paystub! Generate it.
        let template = findMostRecentPaystubBefore(allUserPaystubs, nextExpectedDate);
        let templateLineItems = [];
        if (template) {
          templateLineItems = lineItemsMap.get(template.id) || [];
        } else {
          template = basePaystub;
          templateLineItems = baseLineItems;
        }

        const newPaystub = await generatePaystub(
          db,
          effectiveUserId,
          template,
          templateLineItems,
          basePaystub,
          nextExpectedDate,
          setting,
          dek,
          mappingsJson
        );

        allUserPaystubs.push(newPaystub);
        allUserPaystubs.sort((a, b) => a.checkDate.localeCompare(b.checkDate));
        lineItemsMap.set(newPaystub.id, newPaystub.lineItems);

        currentReferenceDate = nextExpectedDate;
        settingGenerated++;
        generated++;
      }

      nextExpectedDate = addFrequencyInterval(currentReferenceDate, setting.frequency);
    }

    // Update the lastGeneratedDate setting to reflect the latest check date processed
    const latestPaystub = allUserPaystubs[allUserPaystubs.length - 1];
    if (latestPaystub) {
      await db
        .update(paystubAutoGenerateSettings)
        .set({
          lastGeneratedDate: latestPaystub.checkDate,
          updatedAt: new Date(),
        })
        .where(eq(paystubAutoGenerateSettings.id, setting.id));
    }
  }

  if (generated > 0 || didAnyDeletion) {
    await updateCategorySpendingSummaries(effectiveUserId, dek);
    await updateCategoryIncomeSummaries(effectiveUserId, dek);
    await updateMonthlyCashFlowSummaries(effectiveUserId, dek);
    invalidateUserSearchCache(effectiveUserId);

    logger.info(`${LOG_TAG} Finished cycle. Generated/Regenerated ${generated} paystubs`, {
      userId: effectiveUserId,
      count: generated,
    });
  }

  return generated;
}
