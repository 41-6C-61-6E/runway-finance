import { DEFAULT_2026_RULES } from '@/lib/constants/retirement-defaults';

/**
 * Official Social Security Administration (SSA) Benefit Estimation Utility
 * Uses AIME (Average Indexed Monthly Earnings) bend points and claiming multipliers from database tax rules.
 */

export interface SocialSecurityRuleOptions {
  ssWageBaseCap?: number;
  bendPoint1?: number;
  bendPoint2?: number;
  claimingMultipliers?: Record<number, number>;
}

/**
 * Calculates Primary Insurance Amount (PIA) at Full Retirement Age (FRA, Age 67)
 * based on SSA bend point rules.
 */
export function calculateSocialSecurityPIA(grossAnnualSalary: number, options?: SocialSecurityRuleOptions): number {
  if (!grossAnnualSalary || grossAnnualSalary <= 0) return 0;
  
  const wageCap = options?.ssWageBaseCap ?? DEFAULT_2026_RULES.ficaRules.ssWageBaseCap;
  const bp1 = options?.bendPoint1 ?? DEFAULT_2026_RULES.socialSecurityRules.bendPoint1;
  const bp2 = options?.bendPoint2 ?? DEFAULT_2026_RULES.socialSecurityRules.bendPoint2;

  // AIME = Average Indexed Monthly Earnings (capped at wage base limit)
  const monthlyEarnings = Math.min(grossAnnualSalary, wageCap) / 12;

  let pia = 0;
  if (monthlyEarnings <= bp1) {
    pia = 0.90 * monthlyEarnings;
  } else if (monthlyEarnings <= bp2) {
    pia = 0.90 * bp1 + 0.32 * (monthlyEarnings - bp1);
  } else {
    const maxEarnings = Math.min(monthlyEarnings, wageCap / 12);
    pia =
      0.90 * bp1 +
      0.32 * (bp2 - bp1) +
      0.15 * (maxEarnings - bp2);
  }

  return Math.round(pia);
}

/**
 * SSA Official Claiming Age Adjustment Multiplier relative to FRA (Age 67 = 100%)
 */
export function getSsClaimingMultiplier(age: number, options?: SocialSecurityRuleOptions): number {
  const claimAge = Math.min(70, Math.max(62, Math.round(Number(age) || 67)));
  const customTable = options?.claimingMultipliers ?? DEFAULT_2026_RULES.socialSecurityRules.claimingMultipliers;

  if (customTable && customTable[claimAge] !== undefined) {
    return customTable[claimAge];
  }

  if (claimAge <= 62) return 0.70;
  if (claimAge === 63) return 0.75;
  if (claimAge === 64) return 0.80;
  if (claimAge === 65) return 0.8667;
  if (claimAge === 66) return 0.9333;
  if (claimAge === 67) return 1.00;
  if (claimAge === 68) return 1.08;
  if (claimAge === 69) return 1.16;
  return 1.24;
}

/**
 * Calculates estimated monthly benefit adjusted for claiming age.
 */
export function calculateAdjustedSsBenefit(pia: number, claimAge: number, options?: SocialSecurityRuleOptions): number {
  const mult = getSsClaimingMultiplier(claimAge, options);
  return Math.round((pia || 0) * mult);
}

/**
 * Estimates monthly Social Security benefit directly from gross annual salary and target claiming age.
 */
export function estimateSsBenefitFromSalary(salary: number, claimAge: number = 67, options?: SocialSecurityRuleOptions): number {
  const pia = calculateSocialSecurityPIA(salary, options);
  return calculateAdjustedSsBenefit(pia, claimAge, options);
}
