import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { logger } from '@/lib/logger';
import { plans, planAccounts, planEvents, planFlows, planSettings, retirementRules, planLiabilities } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { getSessionDEK } from '@/lib/crypto-context';
import { decryptRow, encryptRow } from '@/lib/crypto';
import { runRetirementSimulation, EnginePlan } from '@/lib/services/retirement-engine';
import { DEFAULT_2026_RULES } from '@/lib/constants/retirement-defaults';
import { populatePlanWithUserFinances } from '@/lib/services/plan-auto-populator';

import { getSystemTaxRules } from '@/lib/services/system-tax-rules-service';

import { loadEnginePlan } from '@/lib/services/retirement-plans';

/** Shared helper: hydrate a plan row with all sub-entities + run simulation */
async function hydratePlan(planRow: any, dek: Uint8Array, preloadedTaxRules?: any) {
  const loaded = await loadEnginePlan(
    {
      userId: planRow.userId,
      dek,
      settings: {} as any,
      now: new Date(),
      getAccounts: async () => [],
    },
    planRow.id,
    { persistMigration: true, preloadedTaxRules }
  );

  if (!loaded) {
    throw new Error('Plan not found');
  }

  const simulation = runRetirementSimulation(loaded.enginePlan);

  return {
    ...loaded.rawDecryptedPlan,
    accounts: loaded.decAccounts.map((a) => ({
      ...a,
      isIncluded: a.isIncluded !== false,
    })),
    liabilities: loaded.decLiabilities,
    events: loaded.decEvents,
    flows: loaded.decFlows,
    settings: {
      ...loaded.decSettings,
      ...loaded.enginePlan.settings,
    },
    simulation,
  };
}

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  try {
    const dek = await getSessionDEK();
    const userId = session.user.id;

    // Engine simulations start at the current calendar year
    // (retirement-engine: currentYear), so rules must be for the same year.
    const currentYear = new Date().getFullYear();

    // Fetch user plans and tax rules in parallel
    const [dbPlans, taxRules] = await Promise.all([
      getDb().select().from(plans).where(eq(plans.userId, userId)),
      getSystemTaxRules(currentYear),
    ]);

    if (dbPlans.length === 0) {
      return NextResponse.json([]);
    }

    const decryptedPlans = await Promise.all(
      dbPlans.map((p) => hydratePlan(p, dek, taxRules))
    );

    return NextResponse.json(decryptedPlans);
  } catch (err) {
    logger.error('GET /api/retirement/plans error', { error: err });
    return NextResponse.json({ error: 'Failed to fetch retirement plans' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  try {
    const dek = await getSessionDEK();
    const userId = session.user.id;
    const body = await req.json();

    const {
      name,
      retirementAge,
      lifeExpectancyAge,
      filingStatus,
      hasSpouse,
      primaryBirthYear,
      primaryBirthMonth,
      spouseName,
      spouseRetirementAge,
      spouseBirthYear,
      spouseBirthMonth,
      spouseLifeExpectancyAge,
      primarySsMonthlyAmount,
      primarySsStartAge,
      spouseSsMonthlyAmount,
      spouseSsStartAge,
      enableSpousalSsBenefit,
      fiTargetMultiplier,
      isDefault,
      accountInclusions,
      primarySalary,
      spouseSalary,
      primarySalaryRaisePct,
      spouseSalaryRaisePct,
      primarySalaryYear,
      spouseSalaryYear,
      sourcePlanId,
    } = body;

    // Find default plan ID as source if not explicitly passed
    let effectiveSourcePlanId = sourcePlanId;
    if (!effectiveSourcePlanId) {
      const defaultPlanRow = await getDb().select({ id: plans.id }).from(plans).where(and(eq(plans.userId, userId), eq(plans.isDefault, true))).limit(1);
      effectiveSourcePlanId = defaultPlanRow[0]?.id;
    }

    // If setting as default, clear default status on other plans
    if (isDefault) {
      await getDb().update(plans).set({ isDefault: false }).where(eq(plans.userId, userId));
    }

    const encryptedValues = await encryptRow('plans', {
      userId,
      name: name || 'Default Plan',
      hasSpouse: Boolean(hasSpouse),
      primaryBirthYear: Number(primaryBirthYear) || 1985,
      primaryBirthMonth: Number(primaryBirthMonth) || 1,
      spouseName: spouseName || 'Spouse / Partner',
      spouseRetirementAge: Number(spouseRetirementAge) || 60,
      spouseBirthYear: spouseBirthYear ? Number(spouseBirthYear) : undefined,
      spouseBirthMonth: spouseBirthMonth ? Number(spouseBirthMonth) : undefined,
      spouseLifeExpectancyAge: spouseLifeExpectancyAge ? Number(spouseLifeExpectancyAge) : 100,
      primarySsMonthlyAmount: primarySsMonthlyAmount !== undefined ? String(primarySsMonthlyAmount) : '2500',
      primarySsStartAge: Number(primarySsStartAge) || 67,
      spouseSsMonthlyAmount: spouseSsMonthlyAmount !== undefined ? String(spouseSsMonthlyAmount) : '2000',
      spouseSsStartAge: Number(spouseSsStartAge) || 67,
      enableSpousalSsBenefit: enableSpousalSsBenefit !== false,
      country: 'US',
      filingStatus: filingStatus || 'single',
      retirementAge: Number(retirementAge) || 60,
      lifeExpectancyAge: Number(lifeExpectancyAge) || 100,
      fiTargetMultiplier: Number(fiTargetMultiplier) || 25,
      withdrawalMethod: body.withdrawalMethod || 'textbook',
      isDefault: Boolean(isDefault),
      primarySalary: primarySalary !== undefined ? String(primarySalary) : '0',
      spouseSalary: spouseSalary !== undefined ? String(spouseSalary) : '0',
      primarySalaryYear: Number(primarySalaryYear) || new Date().getFullYear(),
      spouseSalaryYear: Number(spouseSalaryYear) || new Date().getFullYear(),
      primarySalaryRaisePct: primarySalaryRaisePct !== undefined ? String(primarySalaryRaisePct) : '0',
      spouseSalaryRaisePct: spouseSalaryRaisePct !== undefined ? String(spouseSalaryRaisePct) : '0',
    }, dek);

    const inserted = await getDb().insert(plans).values(encryptedValues).returning();
    const newPlanId = inserted[0].id;
    
    // Auto-populate accounts, income, expenses, and flows (cloning from source plan if available)
    await populatePlanWithUserFinances(newPlanId, userId, dek, effectiveSourcePlanId, accountInclusions);

    // Apply specific settings overrides if passed from the wizard
    if (body.settings && typeof body.settings === 'object') {
      const settingsRow = await getDb().select().from(planSettings)
        .where(eq(planSettings.planId, newPlanId)).limit(1);

      if (settingsRow[0]) {
        const decSettings = await decryptRow('plan_settings', settingsRow[0], dek);
        const settingsUpdates = { ...decSettings, ...body.settings, updatedAt: new Date() };
        const encSettings = await encryptRow('plan_settings', { ...settingsUpdates, userId, planId: newPlanId }, dek);
        delete encSettings.userId;
        delete encSettings.planId;
        await getDb().update(planSettings).set(encSettings).where(eq(planSettings.planId, newPlanId));
      }
    }

    // Apply living expenses / healthcare / pension event overrides if passed from the wizard
    const rawEvents = await getDb().select().from(planEvents).where(eq(planEvents.planId, newPlanId));
    const decEvents = await Promise.all(rawEvents.map((e) => decryptRow('plan_events', e, dek)));

    if (body.livingExpenseAmount !== undefined && Number(body.livingExpenseAmount) >= 0) {
      const existingLiving = decEvents.find((e) => e.type === 'living_expense' || e.category === 'expense');
      if (existingLiving) {
        const encEv = await encryptRow('plan_events', {
          ...existingLiving,
          amount: String(body.livingExpenseAmount),
          adjustForInflation: body.livingExpenseAdjustForInflation !== false,
          updatedAt: new Date(),
          userId,
          planId: newPlanId,
        }, dek);
        delete encEv.userId;
        delete encEv.planId;
        await getDb().update(planEvents).set(encEv).where(eq(planEvents.id, existingLiving.id));
      } else {
        const encEv = await encryptRow('plan_events', {
          planId: newPlanId,
          userId,
          name: 'Base Living Expenses',
          category: 'expense',
          type: 'living_expense',
          owner: 'primary',
          amount: String(body.livingExpenseAmount),
          frequency: 'yearly',
          growthRate: '2.5',
          adjustForInflation: body.livingExpenseAdjustForInflation !== false,
          startTriggerType: 'now',
          endTriggerType: 'end_of_plan',
        }, dek);
        await getDb().insert(planEvents).values(encEv);
      }
    }

    if (body.healthcareExpenseAmount !== undefined && Number(body.healthcareExpenseAmount) >= 0) {
      const existingHealth = decEvents.find((e) => e.type === 'healthcare');
      if (existingHealth) {
        const encEv = await encryptRow('plan_events', {
          ...existingHealth,
          amount: String(body.healthcareExpenseAmount),
          updatedAt: new Date(),
          userId,
          planId: newPlanId,
        }, dek);
        delete encEv.userId;
        delete encEv.planId;
        await getDb().update(planEvents).set(encEv).where(eq(planEvents.id, existingHealth.id));
      } else if (Number(body.healthcareExpenseAmount) > 0) {
        const encEv = await encryptRow('plan_events', {
          planId: newPlanId,
          userId,
          name: 'Healthcare & Medical Expenses',
          category: 'expense',
          type: 'healthcare',
          owner: 'primary',
          amount: String(body.healthcareExpenseAmount),
          frequency: 'yearly',
          growthRate: '4.5',
          adjustForInflation: true,
          startTriggerType: 'now',
          endTriggerType: 'end_of_plan',
        }, dek);
        await getDb().insert(planEvents).values(encEv);
      }
    }

    if (body.pensionIncomeAmount !== undefined && Number(body.pensionIncomeAmount) >= 0) {
      const existingPension = decEvents.find((e) => e.type === 'pension' || e.type === 'passive');
      if (existingPension) {
        const encEv = await encryptRow('plan_events', {
          ...existingPension,
          amount: String(body.pensionIncomeAmount),
          startTriggerValue: body.pensionStartAge ? String(body.pensionStartAge) : existingPension.startTriggerValue,
          updatedAt: new Date(),
          userId,
          planId: newPlanId,
        }, dek);
        delete encEv.userId;
        delete encEv.planId;
        await getDb().update(planEvents).set(encEv).where(eq(planEvents.id, existingPension.id));
      } else if (Number(body.pensionIncomeAmount) > 0) {
        const encEv = await encryptRow('plan_events', {
          planId: newPlanId,
          userId,
          name: 'Pension / Passive Income',
          category: 'income',
          type: 'pension',
          owner: 'primary',
          amount: String(body.pensionIncomeAmount),
          frequency: 'yearly',
          growthRate: '0.0',
          adjustForInflation: true,
          startTriggerType: 'age',
          startTriggerValue: body.pensionStartAge ? String(body.pensionStartAge) : String(Number(retirementAge) || 60),
          endTriggerType: 'end_of_plan',
        }, dek);
        await getDb().insert(planEvents).values(encEv);
      }
    }

    // Apply specific account inclusions if passed from the wizard
    if (accountInclusions && typeof accountInclusions === 'object') {
      const rawAccounts = await getDb().select().from(planAccounts).where(eq(planAccounts.planId, newPlanId));
      for (const a of rawAccounts) {
        const decAcc = await decryptRow('plan_accounts', a, dek);
        const incVal = accountInclusions[decAcc.id] !== undefined ? accountInclusions[decAcc.id] : accountInclusions[decAcc.name];
        if (incVal !== undefined) {
          const encAcc = await encryptRow('plan_accounts', {
            ...decAcc,
            isIncluded: Boolean(incVal),
            userId,
            planId: newPlanId,
          }, dek);
          delete encAcc.userId;
          delete encAcc.planId;
          await getDb().update(planAccounts).set(encAcc).where(eq(planAccounts.id, a.id));
        }
      }
    }

    // Return the fully hydrated plan with all sub-entities + simulation
    const hydratedPlan = await hydratePlan(inserted[0], dek);

    return NextResponse.json(hydratedPlan, { status: 201 });
  } catch (err) {
    logger.error('POST /api/retirement/plans error', { error: err });
    return NextResponse.json({ error: 'Failed to create plan' }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  try {
    const dek = await getSessionDEK();
    const userId = session.user.id;
    const body = await req.json();
    const { planId, ...updates } = body;

    if (!planId) {
      return NextResponse.json({ error: 'planId is required' }, { status: 400 });
    }

    // Verify plan ownership
    const existing = await getDb().select().from(plans)
      .where(and(eq(plans.id, planId), eq(plans.userId, userId)))
      .limit(1);

    if (!existing[0]) {
      return NextResponse.json({ error: 'Plan not found' }, { status: 404 });
    }

    // Handle setting as default plan
    if (updates.isDefault === true) {
      await getDb().update(plans).set({ isDefault: false }).where(eq(plans.userId, userId));
    }

    // Reset default / plan finances
    if (updates.resetPlanFinances || updates.resetDefault) {
      await populatePlanWithUserFinances(planId, userId, dek);
    }

    // Build the update fields (only encrypt changed plan-level fields)
    const allowedFields = [
      'name', 'retirementAge', 'lifeExpectancyAge', 'filingStatus',
      'withdrawalMethod', 'hasSpouse', 'primaryBirthYear', 'primaryBirthMonth',
      'spouseBirthYear', 'spouseBirthMonth', 'customWithdrawalOrder',
      'spouseName', 'spouseRetirementAge', 'spouseLifeExpectancyAge',
      'primarySsMonthlyAmount', 'primarySsStartAge', 'spouseSsMonthlyAmount',
      'spouseSsStartAge', 'enableSpousalSsBenefit', 'fiTargetMultiplier', 'isDefault',
      'primarySalary', 'spouseSalary',
      'primarySalaryYear', 'primarySalaryRaisePct', 'primarySalaryOverrides',
      'spouseSalaryYear', 'spouseSalaryRaisePct', 'spouseSalaryOverrides',
    ];

    const planUpdates: Record<string, any> = {};
    for (const key of allowedFields) {
      if (updates[key] !== undefined) {
        planUpdates[key] = updates[key];
      }
    }

    if (Object.keys(planUpdates).length > 0) {
      planUpdates.updatedAt = new Date();
      const encrypted = await encryptRow('plans', { ...planUpdates, userId }, dek);
      delete encrypted.userId;
      await getDb().update(plans).set(encrypted).where(eq(plans.id, planId));
    }

    // Handle account inclusions map
    if (updates.accountInclusions && typeof updates.accountInclusions === 'object') {
      const rawAccounts = await getDb().select().from(planAccounts).where(eq(planAccounts.planId, planId));
      for (const a of rawAccounts) {
        const decAcc = await decryptRow('plan_accounts', a, dek);
        const incVal = updates.accountInclusions[decAcc.id] !== undefined ? updates.accountInclusions[decAcc.id] : updates.accountInclusions[decAcc.name];
        if (incVal !== undefined) {
          const encAcc = await encryptRow('plan_accounts', {
            ...decAcc,
            isIncluded: Boolean(incVal),
            userId,
            planId,
          }, dek);
          delete encAcc.userId;
          delete encAcc.planId;
          await getDb().update(planAccounts).set(encAcc).where(eq(planAccounts.id, a.id));
        }
      }
    }

    // Handle toggling account inclusion
    if (updates.toggleAccountId) {
      const targetAcc = await getDb().select().from(planAccounts)
        .where(and(eq(planAccounts.id, updates.toggleAccountId), eq(planAccounts.planId, planId)))
        .limit(1);

      if (targetAcc[0]) {
        const decAcc = await decryptRow('plan_accounts', targetAcc[0], dek);
        const newIncluded = updates.isIncluded !== undefined ? updates.isIncluded : !decAcc.isIncluded;
        const encAcc = await encryptRow('plan_accounts', {
          ...decAcc,
          isIncluded: newIncluded,
          userId,
          planId,
        }, dek);
        delete encAcc.userId;
        delete encAcc.planId;
        await getDb().update(planAccounts).set(encAcc).where(eq(planAccounts.id, updates.toggleAccountId));
      }
    }

    // Handle settings updates
    if (updates.settings) {
      const settingsRow = await getDb().select().from(planSettings)
        .where(eq(planSettings.planId, planId)).limit(1);

      if (settingsRow[0]) {
        const decSettings = await decryptRow('plan_settings', settingsRow[0], dek);
        const settingsUpdates = { ...decSettings, ...updates.settings, updatedAt: new Date() };
        const encSettings = await encryptRow('plan_settings', { ...settingsUpdates, userId, planId }, dek);
        delete encSettings.userId;
        delete encSettings.planId;
        await getDb().update(planSettings).set(encSettings).where(eq(planSettings.planId, planId));
      } else {
        const encSettings = await encryptRow('plan_settings', {
          planId,
          userId,
          ...updates.settings,
        }, dek);
        await getDb().insert(planSettings).values(encSettings);
      }
    }

    // Handle wizard living expenses / healthcare / pension event updates
    if (updates.livingExpenseAmount !== undefined || updates.healthcareExpenseAmount !== undefined || updates.pensionIncomeAmount !== undefined) {
      const rawEvents = await getDb().select().from(planEvents).where(eq(planEvents.planId, planId));
      const decEvents = await Promise.all(rawEvents.map((e) => decryptRow('plan_events', e, dek)));

      if (updates.livingExpenseAmount !== undefined && Number(updates.livingExpenseAmount) >= 0) {
        const existingLiving = decEvents.find((e) => e.type === 'living_expense' || e.category === 'expense');
        if (existingLiving) {
          const encEv = await encryptRow('plan_events', {
            ...existingLiving,
            amount: String(updates.livingExpenseAmount),
            adjustForInflation: updates.livingExpenseAdjustForInflation !== false,
            updatedAt: new Date(),
            userId,
            planId,
          }, dek);
          delete encEv.userId;
          delete encEv.planId;
          await getDb().update(planEvents).set(encEv).where(eq(planEvents.id, existingLiving.id));
        } else {
          const encEv = await encryptRow('plan_events', {
            planId,
            userId,
            name: 'Base Living Expenses',
            category: 'expense',
            type: 'living_expense',
            owner: 'primary',
            amount: String(updates.livingExpenseAmount),
            frequency: 'yearly',
            growthRate: '2.5',
            adjustForInflation: updates.livingExpenseAdjustForInflation !== false,
            startTriggerType: 'now',
            endTriggerType: 'end_of_plan',
          }, dek);
          await getDb().insert(planEvents).values(encEv);
        }
      }

      if (updates.healthcareExpenseAmount !== undefined && Number(updates.healthcareExpenseAmount) >= 0) {
        const existingHealth = decEvents.find((e) => e.type === 'healthcare');
        if (existingHealth) {
          const encEv = await encryptRow('plan_events', {
            ...existingHealth,
            amount: String(updates.healthcareExpenseAmount),
            updatedAt: new Date(),
            userId,
            planId,
          }, dek);
          delete encEv.userId;
          delete encEv.planId;
          await getDb().update(planEvents).set(encEv).where(eq(planEvents.id, existingHealth.id));
        } else if (Number(updates.healthcareExpenseAmount) > 0) {
          const encEv = await encryptRow('plan_events', {
            planId,
            userId,
            name: 'Healthcare & Medical Expenses',
            category: 'expense',
            type: 'healthcare',
            owner: 'primary',
            amount: String(updates.healthcareExpenseAmount),
            frequency: 'yearly',
            growthRate: '4.5',
            adjustForInflation: true,
            startTriggerType: 'now',
            endTriggerType: 'end_of_plan',
          }, dek);
          await getDb().insert(planEvents).values(encEv);
        }
      }

      if (updates.pensionIncomeAmount !== undefined && Number(updates.pensionIncomeAmount) >= 0) {
        const existingPension = decEvents.find((e) => e.type === 'pension' || e.type === 'passive');
        if (existingPension) {
          const encEv = await encryptRow('plan_events', {
            ...existingPension,
            amount: String(updates.pensionIncomeAmount),
            startTriggerValue: updates.pensionStartAge ? String(updates.pensionStartAge) : existingPension.startTriggerValue,
            updatedAt: new Date(),
            userId,
            planId,
          }, dek);
          delete encEv.userId;
          delete encEv.planId;
          await getDb().update(planEvents).set(encEv).where(eq(planEvents.id, existingPension.id));
        } else if (Number(updates.pensionIncomeAmount) > 0) {
          const encEv = await encryptRow('plan_events', {
            planId,
            userId,
            name: 'Pension / Passive Income',
            category: 'income',
            type: 'pension',
            owner: 'primary',
            amount: String(updates.pensionIncomeAmount),
            frequency: 'yearly',
            growthRate: '0.0',
            adjustForInflation: true,
            startTriggerType: 'age',
            startTriggerValue: updates.pensionStartAge ? String(updates.pensionStartAge) : '60',
            endTriggerType: 'end_of_plan',
          }, dek);
          await getDb().insert(planEvents).values(encEv);
        }
      }
    }

    // Handle updating an existing event (income or expense)
    if (updates.updateEvent) {
      const ev = updates.updateEvent;
      const existingEv = await getDb().select().from(planEvents)
        .where(and(eq(planEvents.id, ev.id), eq(planEvents.planId, planId)))
        .limit(1);

      if (existingEv[0]) {
        const decEv = await decryptRow('plan_events', existingEv[0], dek);
        const updatedValues = {
          ...decEv,
          name: ev.name !== undefined ? ev.name : decEv.name,
          amount: ev.amount !== undefined ? String(ev.amount) : decEv.amount,
          category: ev.category !== undefined ? ev.category : decEv.category,
          type: ev.type !== undefined ? ev.type : decEv.type,
          growthRate: ev.growthRate !== undefined ? String(ev.growthRate) : decEv.growthRate,
          adjustForInflation: ev.adjustForInflation !== undefined ? ev.adjustForInflation : decEv.adjustForInflation,
          startTriggerType: ev.startTriggerType !== undefined ? ev.startTriggerType : decEv.startTriggerType,
          startTriggerValue: ev.startTriggerValue !== undefined ? String(ev.startTriggerValue) : decEv.startTriggerValue,
          endTriggerType: ev.endTriggerType !== undefined ? ev.endTriggerType : decEv.endTriggerType,
          endTriggerValue: ev.endTriggerValue !== undefined ? String(ev.endTriggerValue) : decEv.endTriggerValue,
          updatedAt: new Date(),
          userId,
          planId,
        };
        const encEv = await encryptRow('plan_events', updatedValues, dek);
        delete encEv.userId;
        delete encEv.planId;
        await getDb().update(planEvents).set(encEv).where(eq(planEvents.id, ev.id));
      }
    }

    // Handle updating an existing flow (savings rule)
    if (updates.updateFlow) {
      const fl = updates.updateFlow;
      const existingFl = await getDb().select().from(planFlows)
        .where(and(eq(planFlows.id, fl.id), eq(planFlows.planId, planId)))
        .limit(1);

      if (existingFl[0]) {
        const decFl = await decryptRow('plan_flows', existingFl[0], dek);
        const updatedValues = {
          ...decFl,
          name: fl.name !== undefined ? fl.name : decFl.name,
          type: fl.type !== undefined ? fl.type : decFl.type,
          rank: fl.rank !== undefined ? fl.rank : decFl.rank,
          targetAccountId: fl.targetAccountId !== undefined ? fl.targetAccountId : decFl.targetAccountId,
          ruleType: fl.ruleType !== undefined ? fl.ruleType : decFl.ruleType,
          ruleValue: fl.ruleValue !== undefined ? String(fl.ruleValue) : decFl.ruleValue,
          updatedAt: new Date(),
          userId,
          planId,
        };
        const encFl = await encryptRow('plan_flows', updatedValues, dek);
        delete encFl.userId;
        delete encFl.planId;
        await getDb().update(planFlows).set(encFl).where(eq(planFlows.id, fl.id));
      }
    }

    // Handle updating account contribution configuration
    if (updates.updateAccountContribution) {
      const contrib = updates.updateAccountContribution;
      const existingAcc = await getDb().select().from(planAccounts)
        .where(and(eq(planAccounts.id, contrib.accountId), eq(planAccounts.planId, planId)))
        .limit(1);

      if (existingAcc[0]) {
        const decAcc = await decryptRow('plan_accounts', existingAcc[0], dek);
        const updatedValues = {
          ...decAcc,
          contributionMode: contrib.contributionMode !== undefined ? contrib.contributionMode : decAcc.contributionMode,
          contributionValue: contrib.contributionValue !== undefined ? (contrib.contributionValue != null ? String(contrib.contributionValue) : null) : decAcc.contributionValue,
          contributionSalarySource: contrib.contributionSalarySource !== undefined ? contrib.contributionSalarySource : decAcc.contributionSalarySource,
          companyMatchRate: contrib.companyMatchRate !== undefined ? (contrib.companyMatchRate != null ? String(contrib.companyMatchRate) : null) : decAcc.companyMatchRate,
          companyMatchLimit: contrib.companyMatchLimit !== undefined ? (contrib.companyMatchLimit != null ? String(contrib.companyMatchLimit) : null) : decAcc.companyMatchLimit,
          isSurplusDestination: contrib.isSurplusDestination !== undefined ? contrib.isSurplusDestination : decAcc.isSurplusDestination,
          rothPercentage: contrib.rothPercentage !== undefined ? (contrib.rothPercentage != null ? Number(contrib.rothPercentage) : null) : decAcc.rothPercentage,
          updatedAt: new Date(),
          userId,
          planId,
        };

        // If setting as surplus destination, clear all other accounts
        if (contrib.isSurplusDestination === true) {
          const allAccs = await getDb().select().from(planAccounts).where(eq(planAccounts.planId, planId));
          for (const otherAcc of allAccs) {
            if (otherAcc.id === contrib.accountId) continue;
            const decOther = await decryptRow('plan_accounts', otherAcc, dek);
            if (decOther.isSurplusDestination) {
              const encOther = await encryptRow('plan_accounts', {
                ...decOther,
                isSurplusDestination: false,
                userId,
                planId,
              }, dek);
              delete encOther.userId;
              delete encOther.planId;
              await getDb().update(planAccounts).set(encOther).where(eq(planAccounts.id, otherAcc.id));
            }
          }
        }

        const encAcc = await encryptRow('plan_accounts', updatedValues, dek);
        delete encAcc.userId;
        delete encAcc.planId;
        await getDb().update(planAccounts).set(encAcc).where(eq(planAccounts.id, contrib.accountId));
      }
    }

    // Handle adding new events
    if (updates.newEvent) {
      const ev = updates.newEvent;
      const encEvent = await encryptRow('plan_events', {
        planId,
        userId,
        name: ev.name,
        category: ev.category,
        type: ev.type,
        owner: ev.owner || 'primary',
        amount: String(ev.amount),
        frequency: ev.frequency || 'yearly',
        growthRate: String(ev.growthRate || 0),
        adjustForInflation: ev.adjustForInflation ?? true,
        startTriggerType: ev.startTriggerType || 'now',
        startTriggerValue: ev.startTriggerValue,
        endTriggerType: ev.endTriggerType || 'end_of_plan',
        endTriggerValue: ev.endTriggerValue,
      }, dek);
      await getDb().insert(planEvents).values(encEvent);
    }

    // Handle adding new flows
    if (updates.newFlow) {
      const fl = updates.newFlow;
      const encFlow = await encryptRow('plan_flows', {
        planId,
        userId,
        name: fl.name,
        type: fl.type || 'invest',
        rank: fl.rank || 1,
        targetAccountId: fl.targetAccountId,
        ruleType: fl.ruleType || 'save_leftover',
        ruleValue: fl.ruleValue ? String(fl.ruleValue) : undefined,
        startTriggerType: 'now',
        endTriggerType: 'end_of_plan',
      }, dek);
      await getDb().insert(planFlows).values(encFlow);
    }

    // Handle adding new liabilities
    if (updates.newLiability) {
      const liab = updates.newLiability;
      const encLiab = await encryptRow('plan_liabilities', {
        planId,
        userId,
        name: liab.name || 'Debt / Mortgage',
        owner: liab.owner || 'primary',
        balance: String(liab.balance || 0),
        interestRate: String(liab.interestRate || 4.5),
        monthlyPayment: String(liab.monthlyPayment || 0),
        yearsRemaining: String(liab.yearsRemaining || 30),
      }, dek);
      await getDb().insert(planLiabilities).values(encLiab);
    }

    // Handle updating an existing liability
    if (updates.updateLiability) {
      const liab = updates.updateLiability;
      const existingLiab = await getDb().select().from(planLiabilities)
        .where(and(eq(planLiabilities.id, liab.id), eq(planLiabilities.planId, planId)))
        .limit(1);

      if (existingLiab[0]) {
        const decLiab = await decryptRow('plan_liabilities', existingLiab[0], dek);
        const updatedValues = {
          ...decLiab,
          name: liab.name !== undefined ? liab.name : decLiab.name,
          owner: liab.owner !== undefined ? liab.owner : decLiab.owner,
          balance: liab.balance !== undefined ? String(liab.balance) : decLiab.balance,
          interestRate: liab.interestRate !== undefined ? String(liab.interestRate) : decLiab.interestRate,
          monthlyPayment: liab.monthlyPayment !== undefined ? String(liab.monthlyPayment) : decLiab.monthlyPayment,
          yearsRemaining: liab.yearsRemaining !== undefined ? String(liab.yearsRemaining) : decLiab.yearsRemaining,
          updatedAt: new Date(),
          userId,
          planId,
        };
        const encLiab = await encryptRow('plan_liabilities', updatedValues, dek);
        delete encLiab.userId;
        delete encLiab.planId;
        await getDb().update(planLiabilities).set(encLiab).where(eq(planLiabilities.id, liab.id));
      }
    }

    // Handle deleting liabilities
    if (updates.deleteLiabilityId) {
      await getDb().delete(planLiabilities)
        .where(and(eq(planLiabilities.id, updates.deleteLiabilityId), eq(planLiabilities.planId, planId)));
    }

    // Handle deleting events
    if (updates.deleteEventId) {
      await getDb().delete(planEvents)
        .where(and(eq(planEvents.id, updates.deleteEventId), eq(planEvents.planId, planId)));
    }

    // Handle deleting flows
    if (updates.deleteFlowId) {
      await getDb().delete(planFlows)
        .where(and(eq(planFlows.id, updates.deleteFlowId), eq(planFlows.planId, planId)));
    }

    // Re-fetch and return the fully hydrated plan
    const updatedPlanRow = await getDb().select().from(plans).where(eq(plans.id, planId)).limit(1);
    const hydratedPlan = await hydratePlan(updatedPlanRow[0], dek);

    return NextResponse.json(hydratedPlan);
  } catch (err) {
    logger.error('PUT /api/retirement/plans error', { error: err });
    return NextResponse.json({ error: 'Failed to update plan' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  try {
    const dek = await getSessionDEK();
    const userId = session.user.id;
    const { searchParams } = new URL(req.url);
    const planId = searchParams.get('planId');

    if (!planId) {
      return NextResponse.json({ error: 'planId is required' }, { status: 400 });
    }

    // Verify ownership then delete (cascade handles sub-entities)
    const existing = await getDb().select().from(plans)
      .where(and(eq(plans.id, planId), eq(plans.userId, userId)))
      .limit(1);

    if (!existing[0]) {
      return NextResponse.json({ error: 'Plan not found' }, { status: 404 });
    }

    await getDb().delete(plans).where(eq(plans.id, planId));

    // If the deleted plan was default, mark the first remaining plan as default
    if (existing[0].isDefault) {
      const remainingPlans = await getDb().select().from(plans).where(eq(plans.userId, userId)).limit(1);
      if (remainingPlans.length > 0) {
        await getDb().update(plans).set({ isDefault: true }).where(eq(plans.id, remainingPlans[0].id));
      }
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    logger.error('DELETE /api/retirement/plans error', { error: err });
    return NextResponse.json({ error: 'Failed to delete plan' }, { status: 500 });
  }
}
