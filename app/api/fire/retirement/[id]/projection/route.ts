import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { calculateDecumulation, runMonteCarlo } from '@/lib/services/retirement';
import { fetchRetirementPlan } from '@/lib/services/retirement-db';
import { logger } from '@/lib/logger';

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const plan = await fetchRetirementPlan(session.user.id, id);
  if (!plan) return NextResponse.json({ error: 'not_found' }, { status: 404 });

  const projection = calculateDecumulation(plan);
  const monteCarlo = runMonteCarlo(plan, 1000);

  logger.info('GET /api/fire/retirement/[id]/projection', { planId: id });
  return NextResponse.json({ projection, monteCarlo });
}
