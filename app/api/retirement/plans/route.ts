import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { logger } from '@/lib/logger';
import { plans, planAccounts, planEvents, planFlows, planSettings } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { getSessionDEK } from '@/lib/crypto-context';
import { decryptRow, encryptRow } from '@/lib/crypto';
import { runRetirementSimulation, EnginePlan } from '@/lib/services/retirement-engine';
import { DEFAULT_2026_RULES } from '@/lib/constants/retirement-defaults';
import { populatePlanWithUserFinances } from '@/lib/services/plan-auto-populator';

/** Shared helper: hydrate a plan row with all sub-entities + run simulation */
async function hydratePlan(planRow: any, dek: Uint8Array) {
  const decPlan = await decryptRow('plans', planRow, dek);

  // Fetch accounts, events, flows, settings for this plan
  const [rawAccounts, rawEvents, rawFlows, rawSettings] = await Promise.all([
    getDb().select().from(planAccounts).where(eq(planAccounts.planId, planRow.id)),
    getDb().select().from(planEvents).where(eq(planEvents.planId, planRow.id)),
    getDb().select().from(planFlows).where(eq(planFlows.planId, planRow.id)),
    getDb().select().from(planSettings).where(eq(planSettings.planId, planRow.id)).limit(1),
  ]);

  const decAccounts = await Promise.all(rawAccounts.map((a) => decryptRow('plan_accounts', a, dek)));
  const decEvents = await Promise.all(rawEvents.map((e) => decryptRow('plan_events', e, dek)));
  const decFlows = await Promise.all(rawFlows.map((f) => decryptRow('plan_flows', f, dek)));
  const decSettings = rawSettings[0] ? await decryptRow('plan_settings', rawSettings[0], dek) : null;

  const enginePlan: EnginePlan = {
    id: decPlan.id,
    name: decPlan.name,
    hasSpouse: decPlan.hasSpouse,
    primaryBirthYear: decPlan.primaryBirthYear,
    primaryBirthMonth: decPlan.primaryBirthMonth,
    spouseBirthYear: decPlan.spouseBirthYear,
    spouseBirthMonth: decPlan.spouseBirthMonth,
    filingStatus: decPlan.filingStatus,
    retirementAge: decPlan.retirementAge,
    lifeExpectancyAge: decPlan.lifeExpectancyAge,
    withdrawalMethod: decPlan.withdrawalMethod,
    customWithdrawalOrder: Array.isArray(decPlan.customWithdrawalOrder) ? decPlan.customWithdrawalOrder : undefined,
    accounts: decAccounts.map((a) => ({
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
    })),
    liabilities: [],
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
    })),
    settings: {
      fixedInflationRate: parseFloat(decSettings?.fixedInflationRate || '3.0'),
      withholdingDeferred: parseFloat(decSettings?.withholdingDeferred || '20.0'),
      withholdingTaxable: parseFloat(decSettings?.withholdingTaxable || '10.0'),
      incomeTaxModifier: parseFloat(decSettings?.incomeTaxModifier || '0.0'),
      capGainsTaxModifier: parseFloat(decSettings?.capGainsTaxModifier || '0.0'),
      heirFlatIncomeTaxRate: parseFloat(decSettings?.heirFlatIncomeTaxRate || '25.0'),
      stepUpBasis: decSettings?.stepUpBasis ?? true,
      realEstateLiquidationRate: parseFloat(decSettings?.realEstateLiquidationRate || '6.0'),
      administrativeCostRate: parseFloat(decSettings?.administrativeCostRate || '1.0'),
      charitableGiving: parseFloat(decSettings?.charitableGiving || '0.0'),
    },
    rules: DEFAULT_2026_RULES,
  };

  const simulation = runRetirementSimulation(enginePlan);

  return {
    ...decPlan,
    accounts: decAccounts,
    events: decEvents,
    flows: decFlows,
    settings: decSettings,
    simulation,
  };
}

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  try {
    const dek = await getSessionDEK();
    const dataUserId = (session.user as any).dataUserId ?? session.user.id;

    // Fetch user plans
    const dbPlans = await getDb().select().from(plans).where(eq(plans.userId, dataUserId));

    const decryptedPlans = await Promise.all(
      dbPlans.map((p) => hydratePlan(p, dek))
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
    const dataUserId = (session.user as any).dataUserId ?? session.user.id;
    const body = await req.json();

    const { name, retirementAge, lifeExpectancyAge, filingStatus } = body;

    const encryptedValues = await encryptRow('plans', {
      userId: dataUserId,
      name: name || 'Primary Plan',
      hasSpouse: false,
      primaryBirthYear: 1985,
      primaryBirthMonth: 1,
      country: 'US',
      filingStatus: filingStatus || 'single',
      retirementAge: retirementAge || 60,
      lifeExpectancyAge: lifeExpectancyAge || 100,
      fiTargetMultiplier: 25,
      withdrawalMethod: 'textbook',
      isDefault: false,
    }, dek);

    const inserted = await getDb().insert(plans).values(encryptedValues).returning();
    
    // Auto-populate accounts, income, expenses, and flows from user finances
    await populatePlanWithUserFinances(inserted[0].id, dataUserId, dek);

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
    const dataUserId = (session.user as any).dataUserId ?? session.user.id;
    const body = await req.json();
    const { planId, ...updates } = body;

    if (!planId) {
      return NextResponse.json({ error: 'planId is required' }, { status: 400 });
    }

    // Verify plan ownership
    const existing = await getDb().select().from(plans)
      .where(and(eq(plans.id, planId), eq(plans.userId, dataUserId)))
      .limit(1);

    if (!existing[0]) {
      return NextResponse.json({ error: 'Plan not found' }, { status: 404 });
    }

    // Build the update fields (only encrypt changed plan-level fields)
    const allowedFields = [
      'name', 'retirementAge', 'lifeExpectancyAge', 'filingStatus',
      'withdrawalMethod', 'hasSpouse', 'primaryBirthYear', 'primaryBirthMonth',
      'spouseBirthYear', 'spouseBirthMonth', 'customWithdrawalOrder',
    ];

    const planUpdates: Record<string, any> = {};
    for (const key of allowedFields) {
      if (updates[key] !== undefined) {
        planUpdates[key] = updates[key];
      }
    }

    if (Object.keys(planUpdates).length > 0) {
      planUpdates.updatedAt = new Date();
      const encrypted = await encryptRow('plans', { ...planUpdates, userId: dataUserId }, dek);
      // Remove userId from encrypted since it's not being updated
      delete encrypted.userId;
      await getDb().update(plans).set(encrypted).where(eq(plans.id, planId));
    }

    // Handle settings updates
    if (updates.settings) {
      const settingsRow = await getDb().select().from(planSettings)
        .where(eq(planSettings.planId, planId)).limit(1);

      if (settingsRow[0]) {
        const settingsUpdates = { ...updates.settings, updatedAt: new Date() };
        const encSettings = await encryptRow('plan_settings', { ...settingsUpdates, userId: dataUserId, planId }, dek);
        delete encSettings.userId;
        delete encSettings.planId;
        await getDb().update(planSettings).set(encSettings).where(eq(planSettings.planId, planId));
      }
    }

    // Handle adding new events
    if (updates.newEvent) {
      const ev = updates.newEvent;
      const encEvent = await encryptRow('plan_events', {
        planId,
        userId: dataUserId,
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
        userId: dataUserId,
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
    const dataUserId = (session.user as any).dataUserId ?? session.user.id;
    const { searchParams } = new URL(req.url);
    const planId = searchParams.get('planId');

    if (!planId) {
      return NextResponse.json({ error: 'planId is required' }, { status: 400 });
    }

    // Verify ownership then delete (cascade handles sub-entities)
    const existing = await getDb().select().from(plans)
      .where(and(eq(plans.id, planId), eq(plans.userId, dataUserId)))
      .limit(1);

    if (!existing[0]) {
      return NextResponse.json({ error: 'Plan not found' }, { status: 404 });
    }

    await getDb().delete(plans).where(eq(plans.id, planId));

    return NextResponse.json({ success: true });
  } catch (err) {
    logger.error('DELETE /api/retirement/plans error', { error: err });
    return NextResponse.json({ error: 'Failed to delete plan' }, { status: 500 });
  }
}
