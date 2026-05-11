import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { fireScenarios } from '@/lib/db/schema';
import { eq, desc } from 'drizzle-orm';

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const scenarios = await getDb()
    .select()
    .from(fireScenarios)
    .where(eq(fireScenarios.userId, session.user.id))
    .orderBy(desc(fireScenarios.isDefault), desc(fireScenarios.createdAt));
  return NextResponse.json(scenarios);
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const body = await request.json();
  const existing = await getDb()
    .select()
    .from(fireScenarios)
    .where(eq(fireScenarios.userId, session.user.id))
    .limit(1);

  const scenario = await getDb()
    .insert(fireScenarios)
    .values({
      userId: session.user.id,
      name: body.name || 'Primary Scenario',
      isDefault: existing.length === 0,
      currentAge: body.currentAge || 30,
      targetAge: body.targetAge || 65,
      targetAnnualExpenses: body.targetAnnualExpenses?.toString() || '40000',
      currentInvestableAssets: body.currentInvestableAssets?.toString() || '0',
      annualContributions: body.annualContributions?.toString() || '12000',
      expectedReturnRate: body.expectedReturnRate?.toString() || '0.07',
      inflationRate: body.inflationRate?.toString() || '0.03',
      safeWithdrawalRate: body.safeWithdrawalRate?.toString() || '0.04',
    })
    .returning();

  return NextResponse.json(scenario[0]);
}
