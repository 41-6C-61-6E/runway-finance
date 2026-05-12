import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { fetchRetirementPlan, saveRetirementPlan, deleteRetirementPlan } from '@/lib/services/retirement-db';
import { logger } from '@/lib/logger';

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const plan = await fetchRetirementPlan(session.user.id, id);
  if (!plan) return NextResponse.json({ error: 'not_found' }, { status: 404 });

  logger.info('GET /api/fire/retirement/[id]', { planId: id });
  return NextResponse.json(plan);
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const existing = await fetchRetirementPlan(session.user.id, id);
  if (!existing) return NextResponse.json({ error: 'not_found' }, { status: 404 });

  const body = await request.json();
  const updated = await saveRetirementPlan(session.user.id, { ...existing, ...body, id });
  logger.info('PATCH /api/fire/retirement/[id]', { planId: id });
  return NextResponse.json(updated);
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  await deleteRetirementPlan(session.user.id, id);
  logger.info('DELETE /api/fire/retirement/[id]', { planId: id });
  return NextResponse.json({ success: true });
}
