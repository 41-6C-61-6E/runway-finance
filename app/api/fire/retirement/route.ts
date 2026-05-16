import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getDefaultRetirementPlan } from '@/lib/services/retirement';
import { fetchRetirementPlans, saveRetirementPlan } from '@/lib/services/retirement-db';
import { getSessionDEK } from '@/lib/crypto-context';
import { logger } from '@/lib/logger';

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const dek = await getSessionDEK();
  const plans = await fetchRetirementPlans(session.user.id, dek);
  logger.info('GET /api/fire/retirement', { count: plans.length });
  return NextResponse.json(plans);
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const dek = await getSessionDEK();
  const body = await request.json();
  const plan = { ...getDefaultRetirementPlan(), ...body };

  const saved = await saveRetirementPlan(session.user.id, plan, dek);
  logger.info('POST /api/fire/retirement', { planId: saved.id });
  return NextResponse.json(saved);
}
