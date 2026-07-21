import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { logger } from '@/lib/logger';
import { retirementRules } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { getSessionDEK } from '@/lib/crypto-context';
import { decryptRow, encryptRow } from '@/lib/crypto';
import { DEFAULT_2026_RULES } from '@/lib/constants/retirement-defaults';

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  try {
    const dek = await getSessionDEK();
    const dataUserId = (session.user as any).dataUserId ?? session.user.id;

    const existing = await getDb()
      .select()
      .from(retirementRules)
      .where(eq(retirementRules.userId, dataUserId))
      .limit(1);

    if (!existing[0]) {
      // Seed default rules for the user
      const encryptedValues = await encryptRow('retirement_rules', {
        userId: dataUserId,
        taxYear: DEFAULT_2026_RULES.taxYear,
        filingStatus: DEFAULT_2026_RULES.filingStatus,
        standardDeduction: DEFAULT_2026_RULES.standardDeduction,
        ordinaryTaxBrackets: DEFAULT_2026_RULES.ordinaryTaxBrackets,
        capitalGainsBrackets: DEFAULT_2026_RULES.capitalGainsBrackets,
        niitThreshold: DEFAULT_2026_RULES.niitThreshold,
        irmaaThresholds: DEFAULT_2026_RULES.irmaaThresholds,
        ssTaxationThresholds: DEFAULT_2026_RULES.ssTaxationThresholds,
        contributionLimits: DEFAULT_2026_RULES.contributionLimits,
        giftEstateExemptions: DEFAULT_2026_RULES.giftEstateExemptions,
        acaSubsidyTable: DEFAULT_2026_RULES.acaSubsidyTable,
        fplAmount: DEFAULT_2026_RULES.fplAmount,
        secureActRules: DEFAULT_2026_RULES.secureActRules,
      }, dek);

      const inserted = await getDb().insert(retirementRules).values(encryptedValues).returning();
      const decrypted = await decryptRow('retirement_rules', inserted[0], dek);
      return NextResponse.json(decrypted);
    }

    const decrypted = await decryptRow('retirement_rules', existing[0], dek);
    return NextResponse.json(decrypted);
  } catch (err) {
    logger.error('GET /api/retirement/rules error', { error: err });
    return NextResponse.json({ error: 'Failed to fetch retirement rules' }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  try {
    const dek = await getSessionDEK();
    const dataUserId = (session.user as any).dataUserId ?? session.user.id;
    const body = await req.json();

    const existing = await getDb()
      .select()
      .from(retirementRules)
      .where(eq(retirementRules.userId, dataUserId))
      .limit(1);

    const updatePayload = body.reset
      ? {
          taxYear: DEFAULT_2026_RULES.taxYear,
          filingStatus: DEFAULT_2026_RULES.filingStatus,
          standardDeduction: DEFAULT_2026_RULES.standardDeduction,
          ordinaryTaxBrackets: DEFAULT_2026_RULES.ordinaryTaxBrackets,
          capitalGainsBrackets: DEFAULT_2026_RULES.capitalGainsBrackets,
          niitThreshold: DEFAULT_2026_RULES.niitThreshold,
          irmaaThresholds: DEFAULT_2026_RULES.irmaaThresholds,
          ssTaxationThresholds: DEFAULT_2026_RULES.ssTaxationThresholds,
          contributionLimits: DEFAULT_2026_RULES.contributionLimits,
          giftEstateExemptions: DEFAULT_2026_RULES.giftEstateExemptions,
          acaSubsidyTable: DEFAULT_2026_RULES.acaSubsidyTable,
          fplAmount: DEFAULT_2026_RULES.fplAmount,
          secureActRules: DEFAULT_2026_RULES.secureActRules,
          updatedAt: new Date(),
        }
      : {
          ...(body.taxYear !== undefined && { taxYear: body.taxYear }),
          ...(body.filingStatus !== undefined && { filingStatus: body.filingStatus }),
          ...(body.standardDeduction !== undefined && { standardDeduction: String(body.standardDeduction) }),
          ...(body.ordinaryTaxBrackets !== undefined && { ordinaryTaxBrackets: body.ordinaryTaxBrackets }),
          ...(body.capitalGainsBrackets !== undefined && { capitalGainsBrackets: body.capitalGainsBrackets }),
          ...(body.niitThreshold !== undefined && { niitThreshold: String(body.niitThreshold) }),
          ...(body.irmaaThresholds !== undefined && { irmaaThresholds: body.irmaaThresholds }),
          ...(body.ssTaxationThresholds !== undefined && { ssTaxationThresholds: body.ssTaxationThresholds }),
          ...(body.contributionLimits !== undefined && { contributionLimits: body.contributionLimits }),
          ...(body.giftEstateExemptions !== undefined && { giftEstateExemptions: body.giftEstateExemptions }),
          ...(body.acaSubsidyTable !== undefined && { acaSubsidyTable: body.acaSubsidyTable }),
          ...(body.fplAmount !== undefined && { fplAmount: String(body.fplAmount) }),
          ...(body.secureActRules !== undefined && { secureActRules: body.secureActRules }),
          updatedAt: new Date(),
        };

    const encryptedValues = await encryptRow('retirement_rules', updatePayload, dek);

    if (!existing[0]) {
      const inserted = await getDb()
        .insert(retirementRules)
        .values({ userId: dataUserId, ...encryptedValues })
        .returning();
      const decrypted = await decryptRow('retirement_rules', inserted[0], dek);
      return NextResponse.json(decrypted);
    }

    const updated = await getDb()
      .update(retirementRules)
      .set(encryptedValues)
      .where(eq(retirementRules.id, existing[0].id))
      .returning();

    const decrypted = await decryptRow('retirement_rules', updated[0], dek);
    return NextResponse.json(decrypted);
  } catch (err) {
    logger.error('PUT /api/retirement/rules error', { error: err });
    return NextResponse.json({ error: 'Failed to update retirement rules' }, { status: 500 });
  }
}

