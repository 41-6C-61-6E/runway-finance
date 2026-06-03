import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { fetchRetirementPlan, saveRetirementPlan, deleteRetirementPlan } from '@/lib/services/retirement-db';
import { getSessionDEK } from '@/lib/crypto-context';
import { logger } from '@/lib/logger';

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth();
  const dataUserId = session?.user ? ((session.user as any).dataUserId ?? session.user.id) : undefined;
  if (!session?.user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const dek = await getSessionDEK();
  const plan = await fetchRetirementPlan(dataUserId, id, dek);
  if (!plan) return NextResponse.json({ error: 'not_found' }, { status: 404 });

  logger.info('GET /api/fire/retirement/[id]', { planId: id });
  return NextResponse.json(plan);
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth();
  const dataUserId = session?.user ? ((session.user as any).dataUserId ?? session.user.id) : undefined;
  if (!session?.user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const dek = await getSessionDEK();
  const existing = await fetchRetirementPlan(dataUserId, id, dek);
  if (!existing) return NextResponse.json({ error: 'not_found' }, { status: 404 });

  const body = await request.json();
  const updated = await saveRetirementPlan(dataUserId, { ...existing, ...body, id }, dek);
  logger.info('PATCH /api/fire/retirement/[id]', { planId: id });
  return NextResponse.json(updated);
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth();
  const dataUserId = session?.user ? ((session.user as any).dataUserId ?? session.user.id) : undefined;
  if (!session?.user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  await deleteRetirementPlan(dataUserId, id);
  logger.info('DELETE /api/fire/retirement/[id]', { planId: id });
  return NextResponse.json({ success: true });
}
