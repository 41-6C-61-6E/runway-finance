import { getDb } from '@/lib/db';
import { systemTaxRules } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { DEFAULT_2026_RULES } from '@/lib/constants/retirement-defaults';
import { HISTORICAL_TAX_RULES } from '@/lib/constants/historical-tax-rules';
import { logger } from '@/lib/logger';

export type SystemTaxRulesType = typeof DEFAULT_2026_RULES;

function deepMergeRules<T extends Record<string, any>>(defaults: T, overrides: Partial<T>): T {
  const result: any = { ...defaults };
  for (const key of Object.keys(overrides)) {
    const val = (overrides as any)[key];
    if (val !== undefined && val !== null) {
      if (typeof val === 'object' && !Array.isArray(val) && typeof result[key] === 'object' && !Array.isArray(result[key])) {
        result[key] = deepMergeRules(result[key], val);
      } else {
        result[key] = val;
      }
    }
  }
  return result;
}

export async function getSystemTaxRules(taxYear: number = 2026): Promise<SystemTaxRulesType> {
  try {
    const existing = await getDb()
      .select()
      .from(systemTaxRules)
      .where(eq(systemTaxRules.taxYear, taxYear))
      .limit(1);

    if (existing[0]) {
      return deepMergeRules(DEFAULT_2026_RULES, existing[0] as any) as SystemTaxRulesType;
    }

    // Seed global tax rules for the requested year if missing.
    // Years with published historical rules (2024/2025) seed from exact
    // statutory values; all other years seed from current defaults.
    const isCurrentYear = taxYear === DEFAULT_2026_RULES.taxYear;
    const seedBase = isCurrentYear
      ? DEFAULT_2026_RULES
      : (HISTORICAL_TAX_RULES[taxYear] ?? DEFAULT_2026_RULES);

    const seedValues = {
      taxYear,
      country: seedBase.country,
      standardDeductionSingle: seedBase.standardDeductionSingle,
      standardDeductionMfj: seedBase.standardDeductionMfj,
      standardDeductionHoH: seedBase.standardDeductionHoH,
      standardDeductionMfs: seedBase.standardDeductionMfs,
      standardDeduction: seedBase.standardDeduction,
      additionalStdDeduction65Plus: seedBase.additionalStdDeduction65Plus,
      ordinaryTaxBrackets: seedBase.ordinaryTaxBrackets,
      headOfHouseholdBrackets: seedBase.headOfHouseholdBrackets,
      capitalGainsBrackets: seedBase.capitalGainsBrackets,
      ficaRules: seedBase.ficaRules,
      socialSecurityRules: seedBase.socialSecurityRules,
      earlyPenaltyRules: seedBase.earlyPenaltyRules,
      niitRules: seedBase.niitRules,
      acaRules: seedBase.acaRules,
      niitThreshold: seedBase.niitThreshold,
      irmaaThresholds: seedBase.irmaaThresholds,
      ssTaxationThresholds: seedBase.ssTaxationThresholds,
      contributionLimits: seedBase.contributionLimits,
      giftEstateExemptions: seedBase.giftEstateExemptions,
      acaSubsidyTable: seedBase.acaSubsidyTable,
      fplAmount: seedBase.fplAmount,
      secureActRules: seedBase.secureActRules,
      rmdUniformLifetimeTable: seedBase.rmdUniformLifetimeTable,
    };

    const inserted = await getDb().insert(systemTaxRules).values(seedValues).returning();
    return deepMergeRules(DEFAULT_2026_RULES, inserted[0] as any) as SystemTaxRulesType;
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
    // Seed from historical values when known so a brand-new 2024/2025 row
    // starts from statutory defaults of that year, not current-year numbers.
    const seedBase = taxYear === DEFAULT_2026_RULES.taxYear
      ? DEFAULT_2026_RULES
      : (HISTORICAL_TAX_RULES[taxYear] ?? DEFAULT_2026_RULES);
    const seedValues = {
      taxYear,
      ...seedBase,
      ...payload,
    };
    const inserted = await getDb().insert(systemTaxRules).values(seedValues).returning();
    return deepMergeRules(DEFAULT_2026_RULES, inserted[0] as any) as SystemTaxRulesType;
  }

  const updated = await getDb()
    .update(systemTaxRules)
    .set(payload)
    .where(eq(systemTaxRules.id, existing[0].id))
    .returning();

  return deepMergeRules(DEFAULT_2026_RULES, updated[0] as any) as SystemTaxRulesType;
}
