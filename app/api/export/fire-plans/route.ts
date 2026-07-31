import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { getSessionDEK } from '@/lib/crypto-context';
import { decryptRow } from '@/lib/crypto';
import { eq, and } from 'drizzle-orm';
import { plans, planAccounts, planEvents, planFlows, planSettings } from '@/lib/db/schema';
import { runRetirementSimulation, EnginePlan } from '@/lib/services/retirement-engine';
import { formatFirePlanTxt, toCsv } from '@/lib/utils/export-formatter';

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const searchParams = req.nextUrl.searchParams;
  const planId = searchParams.get('planId');
  const format = searchParams.get('format') || 'txt'; // 'txt' | 'csv'

  const userId = session.user.id;
  const dataUserId = (session.user as any).dataUserId ?? userId;
  const db = getDb();
  const dek = await getSessionDEK();

  try {
    const planConditions = [eq(plans.userId, dataUserId)];
    if (planId && planId !== 'all') {
      planConditions.push(eq(plans.id, planId));
    }

    const planRowsRaw = await db.select().from(plans).where(and(...planConditions));
    if (planRowsRaw.length === 0) {
      return NextResponse.json({ error: 'No plans found' }, { status: 404 });
    }

    const hydratedPlans = await Promise.all(
      planRowsRaw.map(async (pRow) => {
        const decPlan = await decryptRow('plans', pRow as Record<string, unknown>, dek);

        const [rawAccounts, rawEvents, rawFlows, rawSettings] = await Promise.all([
          db.select().from(planAccounts).where(eq(planAccounts.planId, pRow.id)),
          db.select().from(planEvents).where(eq(planEvents.planId, pRow.id)),
          db.select().from(planFlows).where(eq(planFlows.planId, pRow.id)),
          db.select().from(planSettings).where(eq(planSettings.planId, pRow.id)).limit(1),
        ]);

        const decAccounts = await Promise.all(
          rawAccounts.map((a) => decryptRow('plan_accounts', a as Record<string, unknown>, dek))
        );
        const decEvents = await Promise.all(
          rawEvents.map((e) => decryptRow('plan_events', e as Record<string, unknown>, dek))
        );
        const decFlows = await Promise.all(
          rawFlows.map((f) => decryptRow('plan_flows', f as Record<string, unknown>, dek))
        );
        const decSettings = rawSettings[0]
          ? await decryptRow('plan_settings', rawSettings[0] as Record<string, unknown>, dek)
          : null;

        let simResults: Record<string, any> | null = null;
        try {
          const activeAccounts = decAccounts.filter((a) => a.isIncluded !== false);
          const currentYear = new Date().getFullYear();

          const enginePlan: EnginePlan = {
            id: String(decPlan.id || ''),
            name: String(decPlan.name || 'Untitled Plan'),
            hasSpouse: Boolean(decPlan.hasSpouse),
            primaryBirthYear: Number(decPlan.primaryBirthYear) || 1985,
            primaryBirthMonth: Number(decPlan.primaryBirthMonth) || 1,
            spouseBirthYear: decPlan.spouseBirthYear ? Number(decPlan.spouseBirthYear) : undefined,
            spouseBirthMonth: decPlan.spouseBirthMonth ? Number(decPlan.spouseBirthMonth) : undefined,
            spouseName: String(decPlan.spouseName || 'Spouse / Partner'),
            spouseRetirementAge: decPlan.spouseRetirementAge ? Number(decPlan.spouseRetirementAge) : 60,
            spouseLifeExpectancyAge: decPlan.spouseLifeExpectancyAge ? Number(decPlan.spouseLifeExpectancyAge) : 100,
            primarySsMonthlyAmount: parseFloat(String(decPlan.primarySsMonthlyAmount || '2500')),
            primarySsStartAge: decPlan.primarySsStartAge ? Number(decPlan.primarySsStartAge) : 67,
            spouseSsMonthlyAmount: parseFloat(String(decPlan.spouseSsMonthlyAmount || '2000')),
            spouseSsStartAge: decPlan.spouseSsStartAge ? Number(decPlan.spouseSsStartAge) : 67,
            enableSpousalSsBenefit: decPlan.enableSpousalSsBenefit !== false,
            filingStatus: String(decPlan.filingStatus || 'single'),
            retirementAge: Number(decPlan.retirementAge) || 60,
            lifeExpectancyAge: Number(decPlan.lifeExpectancyAge) || 100,
            withdrawalMethod: (decPlan.withdrawalMethod as any) || 'textbook',
            customWithdrawalOrder: Array.isArray(decPlan.customWithdrawalOrder) ? decPlan.customWithdrawalOrder : undefined,
            primarySalary: parseFloat(String(decPlan.primarySalary || '0')),
            spouseSalary: parseFloat(String(decPlan.spouseSalary || '0')),
            primarySalaryYear: Number(decPlan.primarySalaryYear) || currentYear,
            primarySalaryRaisePct: parseFloat(String(decPlan.primarySalaryRaisePct || '0')),
            primarySalaryOverrides:
              decPlan.primarySalaryOverrides && typeof decPlan.primarySalaryOverrides === 'object'
                ? (decPlan.primarySalaryOverrides as any)
                : undefined,
            spouseSalaryYear: Number(decPlan.spouseSalaryYear) || currentYear,
            spouseSalaryRaisePct: parseFloat(String(decPlan.spouseSalaryRaisePct || '0')),
            spouseSalaryOverrides:
              decPlan.spouseSalaryOverrides && typeof decPlan.spouseSalaryOverrides === 'object'
                ? (decPlan.spouseSalaryOverrides as any)
                : undefined,
            fiTargetMultiplier: Number(decPlan.fiTargetMultiplier) || 25,
            accounts: activeAccounts.map((a) => ({
              id: String(a.id || ''),
              name: String(a.name || ''),
              type: String(a.type || 'cash'),
              owner: String(a.owner || 'primary'),
              balance: parseFloat(String(a.balance || '0')),
              costBasis: parseFloat(String(a.costBasis || '0')),
              expectedGrowthRate: parseFloat(String(a.expectedGrowthRate || '6.0')),
              dividendYield: parseFloat(String(a.dividendYield || '2.5')),
              reinvestDividends: Boolean(a.reinvestDividends),
              qualifiedDividendRatio: parseFloat(String(a.qualifiedDividendRatio || '1.0')),
              rothPercentage: typeof a.rothPercentage === 'number' ? a.rothPercentage : undefined,
            })),
            liabilities: [],
            events: decEvents.map((e) => ({
              id: String(e.id || ''),
              name: String(e.name || ''),
              category: (e.category as any) || 'income',
              type: String(e.type || 'other'),
              owner: String(e.owner || 'primary'),
              amount: parseFloat(String(e.amount || '0')),
              frequency: (e.frequency as any) || 'yearly',
              growthRate: parseFloat(String(e.growthRate || '0')),
              adjustForInflation: Boolean(e.adjustForInflation),
              startTriggerType: String(e.startTriggerType || 'now'),
              startTriggerValue: e.startTriggerValue ? String(e.startTriggerValue) : undefined,
              endTriggerType: String(e.endTriggerType || 'end_of_plan'),
              endTriggerValue: e.endTriggerValue ? String(e.endTriggerValue) : undefined,
            })),
            flows: [],
            settings: {
              fixedInflationRate: parseFloat(String(decSettings?.fixedInflationRate || '3.0')),
              withholdingDeferred: parseFloat(String(decSettings?.withholdingDeferred || '20.0')),
              withholdingTaxable: parseFloat(String(decSettings?.withholdingTaxable || '10.0')),
              incomeTaxModifier: parseFloat(String(decSettings?.incomeTaxModifier || '0.0')),
              capGainsTaxModifier: parseFloat(String(decSettings?.capGainsTaxModifier || '0.0')),
              heirFlatIncomeTaxRate: parseFloat(String(decSettings?.heirFlatIncomeTaxRate || '25.0')),
              stepUpBasis: decSettings?.stepUpBasis !== undefined ? Boolean(decSettings.stepUpBasis) : true,
              realEstateLiquidationRate: parseFloat(String(decSettings?.realEstateLiquidationRate || '6.0')),
              administrativeCostRate: parseFloat(String(decSettings?.administrativeCostRate || '1.0')),
              charitableGiving: parseFloat(String(decSettings?.charitableGiving || '0.0')),
              withdrawalMethod: (decSettings?.withdrawalMethod as any) || decPlan.withdrawalMethod || 'textbook',
            },
          };

          const sim = runRetirementSimulation(enginePlan);
          if (sim) {
            simResults = {
              successRate: sim.success ? 100 : 0,
              finalNetWorth: sim.endingNetWorth,
              shortfallYear: sim.depletionAge ? `Age ${sim.depletionAge}` : null,
            };
          }
        } catch {
          // Simulation optional fallback
        }

        return {
          details: decPlan,
          accounts: decAccounts,
          events: decEvents,
          flows: decFlows,
          settings: decSettings,
          simulation: simResults,
        };
      })
    );

    const dateStr = new Date().toISOString().split('T')[0];

    if (format === 'csv') {
      const flattenedRows: Record<string, unknown>[] = [];
      for (const item of hydratedPlans) {
        const p = item.details;
        if (item.accounts.length === 0) {
          flattenedRows.push({
            PlanName: p.name,
            RetirementAge: p.retirementAge,
            LifeExpectancy: p.lifeExpectancyAge,
            AccountName: 'N/A',
            AccountType: 'N/A',
            Balance: 0,
            GrowthRate: '0%',
            IsIncluded: 'No',
          });
        } else {
          for (const a of item.accounts) {
            flattenedRows.push({
              PlanName: p.name,
              RetirementAge: p.retirementAge,
              LifeExpectancy: p.lifeExpectancyAge,
              AccountName: a.name,
              AccountType: a.type,
              Balance: parseFloat(String(a.balance || '0')),
              CostBasis: parseFloat(String(a.costBasis || '0')),
              GrowthRate: `${a.expectedGrowthRate || '0'}%`,
              IsIncluded: a.isIncluded !== false ? 'Yes' : 'No',
            });
          }
        }
      }

      const csvContent = toCsv(flattenedRows);
      return new NextResponse(csvContent, {
        status: 200,
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="fire_plans_export_${dateStr}.csv"`,
        },
      });
    }

    // Default TXT Format
    let txtReport = '';
    for (let i = 0; i < hydratedPlans.length; i++) {
      if (i > 0) txtReport += '\n\n' + '='.repeat(80) + '\n\n';
      txtReport += formatFirePlanTxt(hydratedPlans[i]);
    }

    const firstPlanName = String(hydratedPlans[0].details.name || 'plan');
    const planSlug =
      hydratedPlans.length === 1
        ? firstPlanName.toLowerCase().replace(/[^a-z0-9]+/g, '_')
        : 'all_plans';

    return new NextResponse(txtReport, {
      status: 200,
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Content-Disposition': `attachment; filename="fire_plan_${planSlug}_${dateStr}.txt"`,
      },
    });
  } catch (err) {
    console.error('Error exporting FIRE plans:', err);
    return NextResponse.json({ error: 'Failed to export FIRE plans' }, { status: 500 });
  }
}
