import { getDb } from '@/lib/db';
import { systemTaxRules } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { DEFAULT_2026_RULES } from '@/lib/constants/retirement-defaults';
import { logger } from '@/lib/logger';

export type SystemTaxRulesType = typeof DEFAULT_2026_RULES;

export async function getSystemTaxRules(taxYear: number = 2026): Promise<SystemTaxRulesType> {
  try {
    const existing = await getDb()
      .select()
      .from(systemTaxRules)
      .where(eq(systemTaxRules.taxYear, taxYear))
      .limit(1);

    if (existing[0]) {
      return {
        ...DEFAULT_2026_RULES,
        ...existing[0],
      } as SystemTaxRulesType;
    }

    // Seed global tax rules for the requested year if missing
    const seedValues = {
      taxYear: DEFAULT_2026_RULES.taxYear,
      country: DEFAULT_2026_RULES.country,
      standardDeductionSingle: DEFAULT_2026_RULES.standardDeductionSingle,
      standardDeductionMfj: DEFAULT_2026_RULES.standardDeductionMfj,
      standardDeductionHoH: DEFAULT_2026_RULES.standardDeductionHoH,
      standardDeductionMfs: DEFAULT_2026_RULES.standardDeductionMfs,
      standardDeduction: DEFAULT_2026_RULES.standardDeduction,
      additionalStdDeduction65Plus: DEFAULT_2026_RULES.additionalStdDeduction65Plus,
      ordinaryTaxBrackets: DEFAULT_2026_RULES.ordinaryTaxBrackets,
      headOfHouseholdBrackets: DEFAULT_2026_RULES.headOfHouseholdBrackets,
      capitalGainsBrackets: DEFAULT_2026_RULES.capitalGainsBrackets,
      ficaRules: DEFAULT_2026_RULES.ficaRules,
      socialSecurityRules: DEFAULT_2026_RULES.socialSecurityRules,
      earlyPenaltyRules: DEFAULT_2026_RULES.earlyPenaltyRules,
      niitRules: DEFAULT_2026_RULES.niitRules,
      acaRules: DEFAULT_2026_RULES.acaRules,
      niitThreshold: DEFAULT_2026_RULES.niitThreshold,
      irmaaThresholds: DEFAULT_2026_RULES.irmaaThresholds,
      ssTaxationThresholds: DEFAULT_2026_RULES.ssTaxationThresholds,
      contributionLimits: DEFAULT_2026_RULES.contributionLimits,
      giftEstateExemptions: DEFAULT_2026_RULES.giftEstateExemptions,
      acaSubsidyTable: DEFAULT_2026_RULES.acaSubsidyTable,
      fplAmount: DEFAULT_2026_RULES.fplAmount,
      secureActRules: DEFAULT_2026_RULES.secureActRules,
      rmdUniformLifetimeTable: DEFAULT_2026_RULES.rmdUniformLifetimeTable,
    };

    const inserted = await getDb().insert(systemTaxRules).values(seedValues).returning();
    return {
      ...DEFAULT_2026_RULES,
      ...inserted[0],
    } as SystemTaxRulesType;
  } catch (err) {
    logger.error('Failed to fetch/seed system tax rules, falling back to DEFAULT_2026_RULES', { error: err });
    return DEFAULT_2026_RULES;
  }
}

export async function updateSystemTaxRules(taxYear: number = 2026, updates: Record<string, any>): Promise<SystemTaxRulesType> {
  const existing = await getDb()
    .select()
    .from(systemTaxRules)
    .where(eq(systemTaxRules.taxYear, taxYear))
    .limit(1);

  const payload = {
    ...updates,
    updatedAt: new Date(),
  };

  if (!existing[0]) {
    const seedValues = {
      taxYear,
      country: 'US',
      ...DEFAULT_2026_RULES,
      ...payload,
    };
    const inserted = await getDb().insert(systemTaxRules).values(seedValues).returning();
    return { ...DEFAULT_2026_RULES, ...inserted[0] } as SystemTaxRulesType;
  }

  const updated = await getDb()
    .update(systemTaxRules)
    .set(payload)
    .where(eq(systemTaxRules.id, existing[0].id))
    .returning();

  return { ...DEFAULT_2026_RULES, ...updated[0] } as SystemTaxRulesType;
}
