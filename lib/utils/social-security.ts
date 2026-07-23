/**
 * Official 2026 Social Security Administration (SSA) Benefit Estimation Utility
 * Uses real SSA AIME (Average Indexed Monthly Earnings) bend points and claiming multipliers.
 */

// 2026 SSA Constants
export const SSA_2026_WAGE_BASE_CAP = 176100; // Annual cap on SS taxable wages
export const SSA_2026_BEND_POINT_1 = 1226;    // First monthly AIME bend point ($1,226/mo)
export const SSA_2026_BEND_POINT_2 = 7391;    // Second monthly AIME bend point ($7,391/mo)

/**
 * Calculates Primary Insurance Amount (PIA) at Full Retirement Age (FRA, Age 67)
 * based on 2026 SSA bend point rules.
 */
export function calculateSocialSecurityPIA(grossAnnualSalary: number): number {
  if (!grossAnnualSalary || grossAnnualSalary <= 0) return 0;
  
  // AIME = Average Indexed Monthly Earnings (capped at wage base limit)
  const monthlyEarnings = Math.min(grossAnnualSalary, SSA_2026_WAGE_BASE_CAP) / 12;

  let pia = 0;
  if (monthlyEarnings <= SSA_2026_BEND_POINT_1) {
    pia = 0.90 * monthlyEarnings;
  } else if (monthlyEarnings <= SSA_2026_BEND_POINT_2) {
    pia = 0.90 * SSA_2026_BEND_POINT_1 + 0.32 * (monthlyEarnings - SSA_2026_BEND_POINT_1);
  } else {
    const maxEarnings = Math.min(monthlyEarnings, SSA_2026_WAGE_BASE_CAP / 12);
    pia =
      0.90 * SSA_2026_BEND_POINT_1 +
      0.32 * (SSA_2026_BEND_POINT_2 - SSA_2026_BEND_POINT_1) +
      0.15 * (maxEarnings - SSA_2026_BEND_POINT_2);
  }

  return Math.round(pia);
}

/**
 * SSA Official Claiming Age Adjustment Multiplier relative to FRA (Age 67 = 100%)
 */
export function getSsClaimingMultiplier(age: number): number {
  const claimAge = Math.min(70, Math.max(62, Number(age) || 67));
  if (claimAge <= 62) return 0.70;      // Early at 62 (-30%)
  if (claimAge === 63) return 0.75;      // Early at 63 (-25%)
  if (claimAge === 64) return 0.80;      // Early at 64 (-20%)
  if (claimAge === 65) return 0.8667;    // Early at 65 (-13.33%)
  if (claimAge === 66) return 0.9333;    // Early at 66 (-6.67%)
  if (claimAge === 67) return 1.00;      // Full Retirement Age (100%)
  if (claimAge === 68) return 1.08;      // Delayed at 68 (+8%)
  if (claimAge === 69) return 1.16;      // Delayed at 69 (+16%)
  return 1.24;                           // Delayed at 70 (+24% max)
}

/**
 * Calculates estimated monthly benefit adjusted for claiming age.
 * @param pia Monthly benefit at FRA (age 67)
 * @param claimAge Target claiming age (62-70)
 */
export function calculateAdjustedSsBenefit(pia: number, claimAge: number): number {
  const mult = getSsClaimingMultiplier(claimAge);
  return Math.round((pia || 0) * mult);
}

/**
 * Estimates monthly Social Security benefit directly from gross annual salary and target claiming age.
 */
export function estimateSsBenefitFromSalary(salary: number, claimAge: number = 67): number {
  const pia = calculateSocialSecurityPIA(salary);
  return calculateAdjustedSsBenefit(pia, claimAge);
}
