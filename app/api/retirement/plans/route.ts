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

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  try {
    const dek = await getSessionDEK();
    const dataUserId = (session.user as any).dataUserId ?? session.user.id;

    // Fetch user plans
    const dbPlans = await getDb().select().from(plans).where(eq(plans.userId, dataUserId));

    const decryptedPlans = await Promise.all(
      dbPlans.map(async (p) => {
        const decPlan = await decryptRow('plans', p, dek);
        
        // Fetch accounts, events, flows for each plan
        const rawAccounts = await getDb().select().from(planAccounts).where(eq(planAccounts.planId, p.id));
        const rawEvents = await getDb().select().from(planEvents).where(eq(planEvents.planId, p.id));
        const rawFlows = await getDb().select().from(planFlows).where(eq(planFlows.planId, p.id));
        const rawSettings = await getDb().select().from(planSettings).where(eq(planSettings.planId, p.id)).limit(1);

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
      })
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
    const dec = await decryptRow('plans', inserted[0], dek);

    return NextResponse.json(dec, { status: 201 });
  } catch (err) {
    logger.error('POST /api/retirement/plans error', { error: err });
    return NextResponse.json({ error: 'Failed to create plan' }, { status: 500 });
  }
}
