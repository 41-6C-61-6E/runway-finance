import { getDb } from '@/lib/db';
import { retirementProjections } from '@/lib/db/schema';
import { eq, desc } from 'drizzle-orm';
import type { RetirementPlan } from './retirement';

function mapRowToPlan(row: any): RetirementPlan {
  return {
    id: row.id,
    name: row.name,
    fireScenarioId: row.fireScenarioId,
    retirementAge: row.retirementAge ?? 65,
    lifeExpectancy: row.lifeExpectancy ?? 95,
    portfolioAtRetirement: parseFloat(row.portfolioAtRetirement ?? '0'),
    expectedReturnRate: parseFloat(row.expectedReturnRate ?? '0.05'),
    inflationRate: parseFloat(row.inflationRate ?? '0.03'),
    annualWithdrawal: parseFloat(row.annualWithdrawal ?? '40000'),
    ssStartAge: row.ssStartAge ?? 67,
    ssAnnual: parseFloat(row.ssAnnual ?? '0'),
    pensionStartAge: row.pensionStartAge ?? 65,
    pensionAnnual: parseFloat(row.pensionAnnual ?? '0'),
    partTimeIncome: parseFloat(row.partTimeIncome ?? '0'),
    partTimeEndAge: row.partTimeEndAge ?? 0,
    rentalIncomeAnnual: parseFloat(row.rentalIncomeAnnual ?? '0'),
    healthcareAnnual: parseFloat(row.healthcareAnnual ?? '0'),
    legacyGoal: parseFloat(row.legacyGoal ?? '0'),
  };
}

export async function fetchRetirementPlans(userId: string): Promise<RetirementPlan[]> {
  const rows = await getDb()
    .select()
    .from(retirementProjections)
    .where(eq(retirementProjections.userId, userId))
    .orderBy(desc(retirementProjections.createdAt));

  return rows.map(mapRowToPlan);
}

export async function fetchRetirementPlan(userId: string, id: string): Promise<RetirementPlan | null> {
  const [row] = await getDb()
    .select()
    .from(retirementProjections)
    .where(eq(retirementProjections.id, id));

  if (!row) return null;
  return mapRowToPlan(row);
}

export async function saveRetirementPlan(
  userId: string,
  plan: RetirementPlan,
): Promise<RetirementPlan> {
  const data = {
    userId,
    name: plan.name,
    fireScenarioId: plan.fireScenarioId || null,
    retirementAge: plan.retirementAge,
    lifeExpectancy: plan.lifeExpectancy,
    portfolioAtRetirement: plan.portfolioAtRetirement.toString(),
    expectedReturnRate: plan.expectedReturnRate.toString(),
    inflationRate: plan.inflationRate.toString(),
    annualWithdrawal: plan.annualWithdrawal?.toString() || null,
    ssStartAge: plan.ssStartAge,
    ssAnnual: plan.ssAnnual.toString(),
    pensionStartAge: plan.pensionStartAge,
    pensionAnnual: plan.pensionAnnual.toString(),
    partTimeIncome: plan.partTimeIncome.toString(),
    partTimeEndAge: plan.partTimeEndAge || null,
    rentalIncomeAnnual: plan.rentalIncomeAnnual.toString(),
    healthcareAnnual: plan.healthcareAnnual.toString(),
    legacyGoal: plan.legacyGoal.toString(),
  };

  if (plan.id) {
    const [updated] = await getDb()
      .update(retirementProjections)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(retirementProjections.id, plan.id))
      .returning();
    return mapRowToPlan(updated);
  } else {
    const [created] = await getDb()
      .insert(retirementProjections)
      .values(data)
      .returning();
    return mapRowToPlan(created);
  }
}

export async function deleteRetirementPlan(userId: string, id: string): Promise<void> {
  await getDb()
    .delete(retirementProjections)
    .where(eq(retirementProjections.id, id));
}
