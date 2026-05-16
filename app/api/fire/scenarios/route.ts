import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { logger } from '@/lib/logger';
import { fireScenarios } from '@/lib/db/schema';
import { eq, desc } from 'drizzle-orm';
import { getSessionDEK } from '@/lib/crypto-context';
import { decryptRows, encryptRow } from '@/lib/crypto';

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const dek = await getSessionDEK();
  const scenarios = await getDb()
    .select()
    .from(fireScenarios)
    .where(eq(fireScenarios.userId, session.user.id))
    .orderBy(desc(fireScenarios.isDefault), desc(fireScenarios.createdAt));

  const decrypted = await decryptRows('fire_scenarios', scenarios, dek);
  logger.info('GET /api/fire/scenarios', { count: decrypted.length });
  return NextResponse.json(decrypted);
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const dek = await getSessionDEK();
  const body = await request.json();
  const existing = await getDb()
    .select()
    .from(fireScenarios)
    .where(eq(fireScenarios.userId, session.user.id))
    .limit(1);

  const encryptedValues = await encryptRow('fire_scenarios', {
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
  }, dek);

  const scenario = await getDb()
    .insert(fireScenarios)
    .values(encryptedValues)
    .returning();

  logger.info('POST /api/fire/scenarios', { scenarioId: scenario[0].id, name: scenario[0].name });
  return NextResponse.json(scenario[0]);
}
