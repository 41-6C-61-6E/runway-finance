import { getDb } from '@/lib/db';
import { retirementProjections } from '@/lib/db/schema';
import { eq, desc } from 'drizzle-orm';
import { decryptRow, encryptRow } from '@/lib/crypto';
import type { RetirementPlan } from './retirement';

function mapRowToPlan(row: Record<string, unknown>): RetirementPlan {
  return {
    id: row.id as string,
    name: (row.name as string) ?? '',
    fireScenarioId: (row.fireScenarioId as string) ?? null,
    retirementAge: (row.retirementAge as number) ?? 65,
    lifeExpectancy: (row.lifeExpectancy as number) ?? 95,
    portfolioAtRetirement: parseFloat((row.portfolioAtRetirement as string) ?? '0'),
    expectedReturnRate: parseFloat((row.expectedReturnRate as string) ?? '0.05'),
    inflationRate: parseFloat((row.inflationRate as string) ?? '0.03'),
    annualWithdrawal: parseFloat((row.annualWithdrawal as string) ?? '40000'),
    ssStartAge: (row.ssStartAge as number) ?? 67,
    ssAnnual: parseFloat((row.ssAnnual as string) ?? '0'),
    pensionStartAge: (row.pensionStartAge as number) ?? 65,
    pensionAnnual: parseFloat((row.pensionAnnual as string) ?? '0'),
    partTimeIncome: parseFloat((row.partTimeIncome as string) ?? '0'),
    partTimeEndAge: (row.partTimeEndAge as number) ?? 0,
    rentalIncomeAnnual: parseFloat((row.rentalIncomeAnnual as string) ?? '0'),
    healthcareAnnual: parseFloat((row.healthcareAnnual as string) ?? '0'),
    legacyGoal: parseFloat((row.legacyGoal as string) ?? '0'),
  };
}

export async function fetchRetirementPlans(userId: string, dek?: Uint8Array): Promise<RetirementPlan[]> {
  const rows = await getDb()
    .select()
    .from(retirementProjections)
    .where(eq(retirementProjections.userId, userId))
    .orderBy(desc(retirementProjections.createdAt));

  if (dek) {
    const decrypted = await Promise.all(rows.map((row) => decryptRow('retirement_projections', row, dek)));
    return decrypted.map(mapRowToPlan);
  }
  return rows.map(mapRowToPlan);
}

export async function fetchRetirementPlan(userId: string, id: string, dek?: Uint8Array): Promise<RetirementPlan | null> {
  const [row] = await getDb()
    .select()
    .from(retirementProjections)
    .where(eq(retirementProjections.id, id));

  if (!row) return null;
  const decrypted = dek ? await decryptRow('retirement_projections', row, dek) : row;
  return mapRowToPlan(decrypted);
}

export async function saveRetirementPlan(
  userId: string,
  plan: RetirementPlan,
  dek?: Uint8Array,
): Promise<RetirementPlan> {
  const data: Record<string, unknown> = {
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

  const values = dek ? await encryptRow('retirement_projections', data, dek) : data;

  if (plan.id) {
    const [updated] = await getDb()
      .update(retirementProjections)
      .set({ ...values, updatedAt: new Date() })
      .where(eq(retirementProjections.id, plan.id))
      .returning();
    const decrypted = dek ? await decryptRow('retirement_projections', updated, dek) : updated;
    return mapRowToPlan(decrypted);
  } else {
    const [created] = await getDb()
      .insert(retirementProjections)
      .values(values)
      .returning();
    const decrypted = dek ? await decryptRow('retirement_projections', created, dek) : created;
    return mapRowToPlan(decrypted);
  }
}

export async function deleteRetirementPlan(userId: string, id: string): Promise<void> {
  await getDb()
    .delete(retirementProjections)
    .where(eq(retirementProjections.id, id));
}
