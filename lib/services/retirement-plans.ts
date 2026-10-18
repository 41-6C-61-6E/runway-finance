import { getDb } from '@/lib/db';
import {
  plans,
  planAccounts,
  planEvents,
  planFlows,
  planSettings,
  planLiabilities,
} from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { decryptRow, encryptRow } from '@/lib/crypto';
import { getSystemTaxRules, getSystemTaxRulesReadOnly } from '@/lib/services/system-tax-rules-service';
import type { EnginePlan } from '@/lib/services/retirement-engine';
import type { FinanceContext } from '@/lib/finance/context';

export interface PlanMeta {
  id: string;
  name: string;
  isDefault: boolean;
  fiTargetMultiplier: number;
  retirementAge: number;
  lifeExpectancyAge: number;
  hasSpouse: boolean;
  filingStatus: string;
  withdrawalMethod: string;
}

export interface LoadedPlanResult {
  planMeta: PlanMeta;
  enginePlan: EnginePlan;
  rawDecryptedPlan: Record<string, any>;
  decAccounts: any[];
  decLiabilities: any[];
  decEvents: any[];
  decFlows: any[];
  decSettings: any;
}

export async function loadEnginePlan(
  ctx: FinanceContext,
  planId?: string,
  options?: { persistMigration?: boolean; preloadedTaxRules?: any }
): Promise<LoadedPlanResult | null> {
  const db = getDb();
  const persistMigration = options?.persistMigration ?? false;
  const currentYear = ctx.now.getFullYear();

  let planRow: any = null;

  if (planId) {
    const rows = await db
      .select()
      .from(plans)
      .where(and(eq(plans.id, planId), eq(plans.userId, ctx.dataUserId)))
      .limit(1);
    planRow = rows[0] ?? null;
  } else {
    // Default plan or first plan
    const defaultRows = await db
      .select()
      .from(plans)
      .where(and(eq(plans.userId, ctx.dataUserId), eq(plans.isDefault, true)))
      .limit(1);

    if (defaultRows[0]) {
      planRow = defaultRows[0];
    } else {
      const anyRows = await db
        .select()
        .from(plans)
        .where(eq(plans.userId, ctx.dataUserId))
        .limit(1);
      planRow = anyRows[0] ?? null;
    }
  }

  if (!planRow) {
    return null;
  }

  const decPlan = await decryptRow('plans', planRow, ctx.dek);

  const [rawAccounts, rawEvents, rawFlows, rawSettings, rawLiabilities, activeRules] = await Promise.all([
    db.select().from(planAccounts).where(eq(planAccounts.planId, planRow.id)),
    db.select().from(planEvents).where(eq(planEvents.planId, planRow.id)),
    db.select().from(planFlows).where(eq(planFlows.planId, planRow.id)),
    db.select().from(planSettings).where(eq(planSettings.planId, planRow.id)).limit(1),
    db.select().from(planLiabilities).where(eq(planLiabilities.planId, planRow.id)),
    options?.preloadedTaxRules
      ? Promise.resolve(options.preloadedTaxRules)
      : persistMigration
        ? getSystemTaxRules(currentYear)
        : getSystemTaxRulesReadOnly(currentYear),
  ]);

  const decAccounts = await Promise.all(rawAccounts.map((a) => decryptRow('plan_accounts', a, ctx.dek)));
  const decEvents = await Promise.all(rawEvents.map((e) => decryptRow('plan_events', e, ctx.dek)));
  const decFlows = await Promise.all(rawFlows.map((f) => decryptRow('plan_flows', f, ctx.dek)));
  const decLiabilities = await Promise.all(rawLiabilities.map((l) => decryptRow('plan_liabilities', l, ctx.dek)));
  const decSettings = rawSettings[0] ? await decryptRow('plan_settings', rawSettings[0], ctx.dek) : null;

  const activeAccounts = decAccounts.filter((a) => a.isIncluded !== false);
  const sAny = decSettings as any;

  let migratedPrimarySalary = parseFloat(decPlan.primarySalary) || 0;
  let migratedPrimarySalaryYear = Number(decPlan.primarySalaryYear) || currentYear;
  let migratedSpouseSalary = parseFloat(decPlan.spouseSalary) || 0;
  let migratedSpouseSalaryYear = Number(decPlan.spouseSalaryYear) || currentYear;
  let needsSalaryMigration = false;

  if (migratedPrimarySalary === 0) {
    const primarySalaryEv = decEvents.find((e: any) => e.type === 'salary' && e.owner !== 'spouse');
    if (primarySalaryEv) {
      migratedPrimarySalary = parseFloat(primarySalaryEv.amount) || 0;
      if (primarySalaryEv.startTriggerType === 'year' && primarySalaryEv.startTriggerValue) {
        migratedPrimarySalaryYear = parseInt(primarySalaryEv.startTriggerValue, 10) || currentYear;
      } else {
        migratedPrimarySalaryYear = currentYear;
      }
      needsSalaryMigration = true;
    }
  }

  if (migratedSpouseSalary === 0) {
    const spouseSalaryEv = decEvents.find((e: any) => e.type === 'salary' && e.owner === 'spouse');
    if (spouseSalaryEv) {
      migratedSpouseSalary = parseFloat(spouseSalaryEv.amount) || 0;
      if (spouseSalaryEv.startTriggerType === 'year' && spouseSalaryEv.startTriggerValue) {
        migratedSpouseSalaryYear = parseInt(spouseSalaryEv.startTriggerValue, 10) || currentYear;
      } else {
        migratedSpouseSalaryYear = currentYear;
      }
      needsSalaryMigration = true;
    }
  }

  // Persist migrated salary fields back to DB only if persistMigration is true (not in Ask read-only mode)
  if (needsSalaryMigration && persistMigration) {
    try {
      const salaryUpdate: Record<string, any> = { userId: planRow.userId };
      if (migratedPrimarySalary > 0) {
        salaryUpdate.primarySalary = String(Math.round(migratedPrimarySalary));
        salaryUpdate.primarySalaryYear = migratedPrimarySalaryYear;
      }
      if (migratedSpouseSalary > 0) {
        salaryUpdate.spouseSalary = String(Math.round(migratedSpouseSalary));
        salaryUpdate.spouseSalaryYear = migratedSpouseSalaryYear;
      }
      const encSalary = await encryptRow('plans', salaryUpdate, ctx.dek);
      delete encSalary.userId;
      await db.update(plans).set(encSalary).where(eq(plans.id, planRow.id));
    } catch {
      // Non-critical write failure
    }
  }

  const enginePlan: EnginePlan = {
    id: decPlan.id,
    name: decPlan.name,
    hasSpouse: Boolean(decPlan.hasSpouse),
    primaryBirthYear: Number(decPlan.primaryBirthYear) || 1985,
    primaryBirthMonth: Number(decPlan.primaryBirthMonth) || 1,
    spouseBirthYear: decPlan.spouseBirthYear ? Number(decPlan.spouseBirthYear) : undefined,
    spouseBirthMonth: decPlan.spouseBirthMonth ? Number(decPlan.spouseBirthMonth) : undefined,
    spouseName: decPlan.spouseName || 'Spouse / Partner',
    spouseRetirementAge: decPlan.spouseRetirementAge ? Number(decPlan.spouseRetirementAge) : 60,
    spouseLifeExpectancyAge: decPlan.spouseLifeExpectancyAge ? Number(decPlan.spouseLifeExpectancyAge) : 100,
    primarySsMonthlyAmount: decPlan.primarySsMonthlyAmount ? parseFloat(decPlan.primarySsMonthlyAmount) : 2500,
    primarySsStartAge: decPlan.primarySsStartAge ? Number(decPlan.primarySsStartAge) : 67,
    spouseSsMonthlyAmount: decPlan.spouseSsMonthlyAmount ? parseFloat(decPlan.spouseSsMonthlyAmount) : 2000,
    spouseSsStartAge: decPlan.spouseSsStartAge ? Number(decPlan.spouseSsStartAge) : 67,
    enableSpousalSsBenefit: decPlan.enableSpousalSsBenefit !== false,
    filingStatus: decPlan.filingStatus || 'single',
    retirementAge: Number(decPlan.retirementAge) || 60,
    lifeExpectancyAge: Number(decPlan.lifeExpectancyAge) || 100,
    withdrawalMethod: decPlan.withdrawalMethod || 'textbook',
    customWithdrawalOrder: Array.isArray(decPlan.customWithdrawalOrder) ? decPlan.customWithdrawalOrder : undefined,
    primarySalary: migratedPrimarySalary || parseFloat(decPlan.primarySalary) || 0,
    spouseSalary: migratedSpouseSalary || parseFloat(decPlan.spouseSalary) || 0,
    primarySalaryYear: migratedPrimarySalaryYear || Number(decPlan.primarySalaryYear) || currentYear,
    primarySalaryRaisePct: parseFloat(decPlan.primarySalaryRaisePct) || 0,
    primarySalaryOverrides:
      decPlan.primarySalaryOverrides && typeof decPlan.primarySalaryOverrides === 'object'
        ? decPlan.primarySalaryOverrides
        : undefined,
    spouseSalaryYear: Number(decPlan.spouseSalaryYear) || currentYear,
    spouseSalaryRaisePct: parseFloat(decPlan.spouseSalaryRaisePct) || 0,
    spouseSalaryOverrides:
      decPlan.spouseSalaryOverrides && typeof decPlan.spouseSalaryOverrides === 'object'
        ? decPlan.spouseSalaryOverrides
        : undefined,
    accounts: activeAccounts.map((a) => ({
      id: a.id,
      name: a.name,
      type: a.type,
      owner: a.owner,
      balance: parseFloat(a.balance) || 0,
      costBasis: parseFloat(a.costBasis) || 0,
      expectedGrowthRate: parseFloat(a.expectedGrowthRate) || 6.0,
      dividendYield: parseFloat(a.dividendYield) || 2.5,
      reinvestDividends: a.reinvestDividends,
      qualifiedDividendRatio: parseFloat(a.qualifiedDividendRatio) || 1.0,
      rothPercentage: a.rothPercentage,
      contributionMode: (a.contributionMode as any) || 'none',
      contributionValue: a.contributionValue ? parseFloat(a.contributionValue) : undefined,
      contributionSalarySource: (a.contributionSalarySource as any) || undefined,
      companyMatchRate: a.companyMatchRate ? parseFloat(a.companyMatchRate) : undefined,
      companyMatchLimit: a.companyMatchLimit ? parseFloat(a.companyMatchLimit) : undefined,
      isSurplusDestination: Boolean(a.isSurplusDestination),
    })),
    liabilities: decLiabilities.map((l) => ({
      id: l.id,
      name: l.name,
      owner: l.owner || 'primary',
      balance: parseFloat(l.balance) || 0,
      interestRate: parseFloat(l.interestRate) || 0,
      monthlyPayment: parseFloat(l.monthlyPayment) || 0,
      yearsRemaining: parseFloat(l.yearsRemaining) || 30,
    })),
    events: decEvents.map((e) => ({
      id: e.id,
      name: e.name,
      category: e.category as any,
      type: e.type,
      owner: e.owner,
      amount: parseFloat(e.amount) || 0,
      frequency: e.frequency as any,
      growthRate: parseFloat(e.growthRate) || 0,
      adjustForInflation: e.adjustForInflation,
      startTriggerType: e.startTriggerType,
      startTriggerValue: e.startTriggerValue,
      endTriggerType: e.endTriggerType,
      endTriggerValue: e.endTriggerValue,
    })),
    flows: decFlows.map((f) => ({
      id: f.id,
      name: f.name,
      type: f.type as any,
      rank: f.rank,
      targetAccountId: f.targetAccountId,
      ruleType: f.ruleType as any,
      ruleValue: f.ruleValue ? parseFloat(f.ruleValue) : undefined,
      matchRate: f.matchRate ? parseFloat(f.matchRate) : undefined,
      matchLimit: f.matchLimit ? parseFloat(f.matchLimit) : undefined,
      matchAccountId: f.matchAccountId || undefined,
      salarySource: (f.salarySource as any) || undefined,
    })),
    settings: {
      fixedInflationRate: parseFloat(decSettings?.fixedInflationRate || '3.0'),
      withholdingDeferred: parseFloat(decSettings?.withholdingDeferred || '20.0'),
      withholdingTaxable: parseFloat(decSettings?.withholdingTaxable || '10.0'),
      incomeTaxModifier: parseFloat(decSettings?.incomeTaxModifier || '0.0'),
      stateTaxBrackets: Array.isArray((decSettings as any)?.stateTaxTable?.stateTaxBrackets)
        ? (decSettings as any).stateTaxTable.stateTaxBrackets
        : undefined,
      stateTaxStandardDeduction:
        (decSettings as any)?.stateTaxTable?.stateTaxStandardDeduction != null
          ? Number((decSettings as any).stateTaxTable.stateTaxStandardDeduction)
          : undefined,
      stateGrossFloorRate:
        (decSettings as any)?.stateTaxTable?.stateGrossFloorRate != null
          ? Number((decSettings as any).stateTaxTable.stateGrossFloorRate)
          : undefined,
      stateCode: (decSettings as any)?.stateTaxTable?.stateCode || undefined,
      projectionMode: (decSettings as any)?.projectionMode === 'statutory' ? 'statutory' : 'inflationEscalated',
      enableAmt: Boolean((decSettings as any)?.enableAmt),
      capGainsTaxModifier: parseFloat(decSettings?.capGainsTaxModifier || '0.0'),
      heirFlatIncomeTaxRate: parseFloat(decSettings?.heirFlatIncomeTaxRate || '25.0'),
      stepUpBasis: decSettings?.stepUpBasis ?? true,
      realEstateLiquidationRate: parseFloat(decSettings?.realEstateLiquidationRate || '6.0'),
      administrativeCostRate: parseFloat(decSettings?.administrativeCostRate || '1.0'),
      charitableGiving: parseFloat(decSettings?.charitableGiving || '0.0'),
      withdrawalMethod: sAny?.withdrawalMethod || decPlan.withdrawalMethod || 'textbook',
      enableRothConversions: Boolean(sAny?.enableRothConversions),
      rothConversionTargetCeiling: sAny?.rothConversionTargetCeiling || 'top_of_12',
      avoidIrmaaCliffs: Boolean(sAny?.avoidIrmaaCliffs),
      allowPenaltyWithdrawals: sAny?.allowPenaltyWithdrawals !== false,
    },
    rules: activeRules as any,
  };

  const planMeta: PlanMeta = {
    id: decPlan.id,
    name: decPlan.name,
    isDefault: Boolean(decPlan.isDefault),
    fiTargetMultiplier: Number(decPlan.fiTargetMultiplier) || 25,
    retirementAge: Number(decPlan.retirementAge) || 60,
    lifeExpectancyAge: Number(decPlan.lifeExpectancyAge) || 100,
    hasSpouse: Boolean(decPlan.hasSpouse),
    filingStatus: decPlan.filingStatus || 'single',
    withdrawalMethod: decPlan.withdrawalMethod || 'textbook',
  };

  return {
    planMeta,
    enginePlan,
    rawDecryptedPlan: decPlan,
    decAccounts,
    decLiabilities,
    decEvents,
    decFlows,
    decSettings,
  };
}
