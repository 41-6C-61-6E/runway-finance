import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { fireScenarios } from '@/lib/db/schema';
import { eq, desc } from 'drizzle-orm';

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const [scenario] = await getDb().select().from(fireScenarios).where(eq(fireScenarios.id, id));
  if (!scenario) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  return NextResponse.json(scenario);
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const body = await request.json();
  const updateData: Record<string, any> = {};
  const numericFields = ['currentAge', 'targetAge', 'expectedReturnRate', 'inflationRate', 'safeWithdrawalRate'];
  const stringFields = ['name', 'isDefault'];

  for (const [key, value] of Object.entries(body)) {
    if (numericFields.includes(key)) {
      updateData[key] = value?.toString();
    } else if (stringFields.includes(key)) {
      updateData[key] = value;
    }
  }
  if (body.targetAnnualExpenses !== undefined) updateData.targetAnnualExpenses = body.targetAnnualExpenses.toString();
  if (body.currentInvestableAssets !== undefined) updateData.currentInvestableAssets = body.currentInvestableAssets.toString();
  if (body.annualContributions !== undefined) updateData.annualContributions = body.annualContributions.toString();

  const [updated] = await getDb().update(fireScenarios).set(updateData).where(eq(fireScenarios.id, id)).returning();
  return NextResponse.json(updated);
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const [deleted] = await getDb().delete(fireScenarios).where(eq(fireScenarios.id, id)).returning();

  if (deleted?.isDefault) {
    const [nextDefault] = await getDb()
      .select()
      .from(fireScenarios)
      .where(eq(fireScenarios.userId, session.user.id))
      .orderBy(desc(fireScenarios.createdAt))
      .limit(1);
    if (nextDefault) {
      await getDb().update(fireScenarios).set({ isDefault: true }).where(eq(fireScenarios.id, nextDefault.id));
    }
  }

  return NextResponse.json({ success: true });
}
