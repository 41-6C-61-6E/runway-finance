import { getDb } from '@/lib/db';
import { systemTaxRules } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { DEFAULT_2026_RULES } from '@/lib/constants/retirement-defaults';
import { HISTORICAL_TAX_RULES } from '@/lib/constants/historical-tax-rules';
import { logger } from '@/lib/logger';

export type SystemTaxRulesType = typeof DEFAULT_2026_RULES;

export function getYearDefaultRules(taxYear: number = 2026): SystemTaxRulesType {
  return taxYear === DEFAULT_2026_RULES.taxYear
    ? DEFAULT_2026_RULES
    : (HISTORICAL_TAX_RULES[taxYear] ?? DEFAULT_2026_RULES);
}

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
  const defaultBase = getYearDefaultRules(taxYear);
  try {
    const existing = await getDb()
      .select()
      .from(systemTaxRules)
      .where(eq(systemTaxRules.taxYear, taxYear))
      .limit(1);

    if (existing[0]) {
      return deepMergeRules(defaultBase, existing[0] as any) as SystemTaxRulesType;
    }

    // Seed global tax rules for the requested year if missing.
    const seedValues = {
      taxYear,
      country: defaultBase.country,
      standardDeductionSingle: defaultBase.standardDeductionSingle,
      standardDeductionMfj: defaultBase.standardDeductionMfj,
      standardDeductionHoH: defaultBase.standardDeductionHoH,
      standardDeductionMfs: defaultBase.standardDeductionMfs,
      standardDeduction: defaultBase.standardDeduction,
      additionalStdDeduction65Plus: defaultBase.additionalStdDeduction65Plus,
      ordinaryTaxBrackets: defaultBase.ordinaryTaxBrackets,
      headOfHouseholdBrackets: defaultBase.headOfHouseholdBrackets,
      capitalGainsBrackets: defaultBase.capitalGainsBrackets,
      ficaRules: defaultBase.ficaRules,
      socialSecurityRules: defaultBase.socialSecurityRules,
      earlyPenaltyRules: defaultBase.earlyPenaltyRules,
      niitRules: defaultBase.niitRules,
      acaRules: defaultBase.acaRules,
      niitThreshold: defaultBase.niitThreshold,
      irmaaThresholds: defaultBase.irmaaThresholds,
      ssTaxationThresholds: defaultBase.ssTaxationThresholds,
      contributionLimits: defaultBase.contributionLimits,
      giftEstateExemptions: defaultBase.giftEstateExemptions,
      acaSubsidyTable: defaultBase.acaSubsidyTable,
      fplAmount: defaultBase.fplAmount,
      secureActRules: defaultBase.secureActRules,
      rmdUniformLifetimeTable: defaultBase.rmdUniformLifetimeTable,
    };

    try {
      const inserted = await getDb().insert(systemTaxRules).values(seedValues).returning();
      return deepMergeRules(defaultBase, inserted[0] as any) as SystemTaxRulesType;
    } catch (insertErr) {
      // If a concurrent insert occurred, re-fetch
      const reFetched = await getDb()
        .select()
        .from(systemTaxRules)
        .where(eq(systemTaxRules.taxYear, taxYear))
        .limit(1);
      if (reFetched[0]) {
        return deepMergeRules(defaultBase, reFetched[0] as any) as SystemTaxRulesType;
      }
      throw insertErr;
    }
  } catch (err) {
    logger.error('Failed to fetch/seed system tax rules, falling back to defaultBase', { error: err });
    return defaultBase;
  }
}

export async function updateSystemTaxRules(taxYear: number = 2026, updates: Record<string, any>): Promise<SystemTaxRulesType> {
  const defaultBase = getYearDefaultRules(taxYear);
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
      ...defaultBase,
      ...payload,
    };
    const inserted = await getDb().insert(systemTaxRules).values(seedValues).returning();
    return deepMergeRules(defaultBase, inserted[0] as any) as SystemTaxRulesType;
  }

  const updated = await getDb()
    .update(systemTaxRules)
    .set(payload)
    .where(eq(systemTaxRules.id, existing[0].id))
    .returning();

  return deepMergeRules(defaultBase, updated[0] as any) as SystemTaxRulesType;
}
