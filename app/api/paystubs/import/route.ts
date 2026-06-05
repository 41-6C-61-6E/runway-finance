import { auth } from 'auth';
import { getDb } from '@/lib/db';
import {
  paystubs,
  paystubLineItems,
  paystubFieldMappings,
  accounts,
  transactions,
} from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { createTransactionsFromLineItems } from '../route';
import { getSessionDEK } from '@/lib/crypto-context';
import {
  updateCategorySpendingSummaries,
  updateCategoryIncomeSummaries,
  updateMonthlyCashFlowSummaries,
} from '@/lib/services/sync';
import { parseDate, normalizeBackendInput } from '@/lib/utils/paystub';

interface RawPaystub {
  employeeName?: string;
  lmPeopleId?: string;
  payPeriodStart: string;
  payPeriodEnd: string;
  checkDate: string;
  adviceNumber?: string;
  grossCurrent?: number | string;
  grossYTD?: number | string;
  taxesCurrent?: number | string;
  taxesYTD?: number | string;
  deductionsCurrent?: number | string;
  deductionsYTD?: number | string;
  netCurrent?: number | string;
  hoursAndEarnings?: Array<{
    description: string;
    hours?: number | string;
    rate?: number | string;
    amount?: number | string;
    ytdHours?: number | string;
    ytdAmount?: number | string;
  }>;
  taxes?: Array<{
    description: string;
    amount?: number | string;
    ytdAmount?: number | string;
  }>;
  beforeTaxDeductions?: Array<{
    description: string;
    amount?: number | string;
    ytdAmount?: number | string;
  }>;
  afterTaxDeductions?: Array<{
    description: string;
    amount?: number | string;
    ytdAmount?: number | string;
  }>;
}





export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const db = getDb();
  const userId = session.user.id;
  const dataUserId = (session.user as any).dataUserId ?? session.user.id;
  const dek = await getSessionDEK();

  let body: {
    paystubs: any;
    mappingId: string;
    startDate?: string;
    employerName: string;
  };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const { paystubs: inputPaystubs, mappingId, startDate, employerName } = body;
  const rawPaystubs = normalizeBackendInput(inputPaystubs);

  if (rawPaystubs.length === 0 || !mappingId) {
    return Response.json(
      { error: 'paystubs array and mappingId are required' },
      { status: 400 }
    );
  }

  // Look up the field mapping template
  const [mapping] = await db
    .select()
    .from(paystubFieldMappings)
    .where(
      and(
        eq(paystubFieldMappings.id, mappingId),
        eq(paystubFieldMappings.userId, dataUserId)
      )
    )
    .limit(1);

  if (!mapping) {
    return Response.json({ error: 'Mapping template not found' }, { status: 404 });
  }

  const mappingsJson = (mapping.mappings || {}) as Record<
    string,
    { action: 'import' | 'ignore'; categoryId: string | null }
  >;

  let imported = 0;
  let skipped = 0;
  const total = rawPaystubs.length;

  for (const raw of rawPaystubs) {
    // Parse dates
    const checkDate = parseDate(raw.checkDate);
    const payPeriodStart = parseDate(raw.payPeriodStart);
    const payPeriodEnd = parseDate(raw.payPeriodEnd);

    // Filter by startDate if provided
    if (startDate && checkDate < startDate) {
      skipped++;
      continue;
    }

    // Check for duplicate adviceNumber
    if (raw.adviceNumber) {
      const [existing] = await db
        .select({ id: paystubs.id })
        .from(paystubs)
        .where(
          and(
            eq(paystubs.userId, dataUserId),
            eq(paystubs.adviceNumber, raw.adviceNumber)
          )
        )
        .limit(1);

      if (existing) {
        skipped++;
        continue;
      }
    }

    // Insert paystub
    const [paystub] = await db
      .insert(paystubs)
      .values({
        userId: dataUserId,
        employerName: employerName || '',
        employeeName: raw.employeeName || null,
        payPeriodStart,
        payPeriodEnd,
        checkDate,
        adviceNumber: raw.adviceNumber || null,
        grossCurrent: String(raw.grossCurrent ?? '0'),
        taxesCurrent: String(raw.taxesCurrent ?? '0'),
        deductionsCurrent: String(raw.deductionsCurrent ?? '0'),
        netCurrent: String(raw.netCurrent ?? '0'),
        grossYtd: raw.grossYTD != null ? String(raw.grossYTD) : null,
        taxesYtd: raw.taxesYTD != null ? String(raw.taxesYTD) : null,
        deductionsYtd: raw.deductionsYTD != null ? String(raw.deductionsYTD) : null,
        source: 'json',
        mappingId,
        sourceJson: JSON.stringify(raw),
      })
      .returning();

    // Build and insert line items
    const allLineItems: Array<{
      id: string;
      section: string;
      description: string;
      amount: string;
      mappingAction: string;
      categoryId: string | null;
    }> = [];

    // Helper to insert line items for a section
    async function insertSectionItems(
      items: Array<any> | undefined,
      section: string,
      includeHours: boolean
    ) {
      if (!items || !Array.isArray(items)) return;
      for (const item of items) {
        const descKey = item.description || '';
        const lookupKey = `${section}:${descKey}`;
        const mappingEntry = mappingsJson[lookupKey];
        const mappingAction = mappingEntry?.action || 'import';
        const categoryId = mappingEntry?.categoryId || null;

        const [inserted] = await db
          .insert(paystubLineItems)
          .values({
            paystubId: paystub.id,
            userId: dataUserId,
            section,
            description: descKey,
            amount: String(item.amount ?? '0'),
            ytdAmount: item.ytdAmount != null ? String(item.ytdAmount) : null,
            hours: includeHours && item.hours != null ? String(item.hours) : null,
            rate: includeHours && item.rate != null ? String(item.rate) : null,
            ytdHours:
              includeHours && item.ytdHours != null ? String(item.ytdHours) : null,
            mappingAction,
            categoryId,
          })
          .returning();

        allLineItems.push(inserted);
      }
    }

    await insertSectionItems(raw.hoursAndEarnings, 'earnings', true);
    await insertSectionItems(raw.taxes, 'taxes', false);
    await insertSectionItems(raw.beforeTaxDeductions, 'before_tax_deductions', false);
    await insertSectionItems(raw.afterTaxDeductions, 'after_tax_deductions', false);

    // Create transactions from mapped line items
    await createTransactionsFromLineItems(
      db,
      dataUserId,
      paystub,
      allLineItems,
      employerName,
      checkDate,
      dek
    );

    imported++;
  }

  // Recalculate summaries to update charts
  await updateCategorySpendingSummaries(dataUserId, dek);
  await updateCategoryIncomeSummaries(dataUserId, dek);
  await updateMonthlyCashFlowSummaries(dataUserId, dek);

  return Response.json({ imported, skipped, total });
}
