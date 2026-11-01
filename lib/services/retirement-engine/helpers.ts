import type { EngineEvent } from './types';

export function getYearSalary(
  baseSalary: number,
  baseYear: number,
  raisePct: number,
  overrides: Record<number, number> | undefined,
  targetYear: number
): number {
  if (baseSalary <= 0) return 0;

  let effectiveBase = baseSalary;
  let effectiveBaseYear = baseYear;

  if (overrides) {
    const overrideYears = Object.keys(overrides)
      .map(Number)
      .filter((y) => y <= targetYear)
      .sort((a, b) => b - a);
    if (overrideYears.length > 0) {
      const latestOverrideYear = overrideYears[0];
      effectiveBase = overrides[latestOverrideYear];
      effectiveBaseYear = latestOverrideYear;
    }
  }

  const yearDiff = targetYear - effectiveBaseYear;
  if (yearDiff <= 0) return effectiveBase;
  return effectiveBase * Math.pow(1 + raisePct / 100, yearDiff);
}

export function isEventActive(
  ev: EngineEvent,
  simYear: number,
  primaryAge: number,
  primaryRetirementAge: number,
  spouseAge?: number,
  spouseRetirementAge?: number,
  yearOffset: number = 0
): boolean {
  const isSpouseEvent = ev.owner === 'spouse';
  const evalAge = isSpouseEvent && spouseAge !== undefined ? spouseAge : primaryAge;
  const evalRetirementAge = isSpouseEvent && spouseRetirementAge !== undefined ? spouseRetirementAge : primaryRetirementAge;

  if (ev.startTriggerType === 'age' && ev.startTriggerValue) {
    if (evalAge < parseInt(ev.startTriggerValue, 10)) return false;
  } else if (ev.startTriggerType === 'year' && ev.startTriggerValue) {
    if (simYear < parseInt(ev.startTriggerValue, 10)) return false;
  } else if (ev.startTriggerType === 'retirement') {
    if (evalAge < evalRetirementAge) return false;
  }

  if (ev.endTriggerType === 'age' && ev.endTriggerValue) {
    if (evalAge > parseInt(ev.endTriggerValue, 10)) return false;
  } else if (ev.endTriggerType === 'year' && ev.endTriggerValue) {
    if (simYear > parseInt(ev.endTriggerValue, 10)) return false;
  } else if (ev.endTriggerType === 'retirement') {
    if (evalAge >= evalRetirementAge) return false;
  } else if ((ev.endTriggerType === 'after_n_years' || ev.endTriggerType === 'duration') && ev.endTriggerValue) {
    const duration = parseInt(ev.endTriggerValue, 10);
    if (!isNaN(duration) && duration > 0) {
      if (ev.startTriggerType === 'retirement') {
        if (evalAge >= evalRetirementAge + duration) return false;
      } else if (ev.startTriggerType === 'age' && ev.startTriggerValue) {
        const startAge = parseInt(ev.startTriggerValue, 10);
        if (evalAge >= startAge + duration) return false;
      } else if (ev.startTriggerType === 'year' && ev.startTriggerValue) {
        const startYear = parseInt(ev.startTriggerValue, 10);
        if (simYear >= startYear + duration) return false;
      } else {
        if (yearOffset >= duration) return false;
      }
    }
  }

  return true;
}

export function getSsClaimingMultiplier(age: number, rules?: any): number {
  const customTable = rules?.socialSecurityRules?.claimingMultipliers;
  if (customTable && customTable[age] !== undefined) {
    return customTable[age];
  }
  if (age <= 62) return 0.70;
  if (age === 63) return 0.75;
  if (age === 64) return 0.80;
  if (age === 65) return 0.8667;
  if (age === 66) return 0.9333;
  if (age === 67) return 1.00;
  if (age === 68) return 1.08;
  if (age === 69) return 1.16;
  return 1.24;
}

