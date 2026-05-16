import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { categoryRules } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { z } from 'zod';
import { logger } from '@/lib/logger';
import { getSessionDEK } from '@/lib/crypto-context';
import { encryptRow } from '@/lib/crypto';

const UpdateRuleSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  priority: z.number().int().optional(),
  isActive: z.boolean().optional(),
  conditionField: z.enum(['description', 'payee', 'amount', 'memo']).optional(),
  conditionOperator: z.enum(['contains', 'equals', 'starts_with', 'ends_with', 'regex']).optional(),
  conditionValue: z.string().min(1).max(500).optional(),
  conditionCaseSensitive: z.boolean().optional(),
  setCategoryId: z.string().uuid().nullable().optional(),
  setPayee: z.string().max(200).nullable().optional(),
  setReviewed: z.boolean().nullable().optional(),
});

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  }

  const userId = session.user.id;
  const dek = await getSessionDEK();
  const { id } = await params;

  const [existing] = await getDb()
    .select()
    .from(categoryRules)
    .where(and(eq(categoryRules.id, id), eq(categoryRules.userId, userId)))
    .limit(1);

  if (!existing) {
    return NextResponse.json({ error: 'not_found', message: 'Rule not found' }, { status: 404 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const parsed = UpdateRuleSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'validation_error', details: parsed.error.flatten().fieldErrors },
      { status: 400 }
    );
  }

  const encrypted = await encryptRow('category_rules', { ...parsed.data }, dek);

  const [updated] = await getDb()
    .update(categoryRules)
    .set(encrypted)
    .where(eq(categoryRules.id, id))
    .returning();

  logger.info('PATCH /api/category-rules/[id]', { userId, id, updatedFields: Object.keys(parsed.data) });
  return NextResponse.json(updated);
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  }

  const userId = session.user.id;
  const { id } = await params;

  const [existing] = await getDb()
    .select()
    .from(categoryRules)
    .where(and(eq(categoryRules.id, id), eq(categoryRules.userId, userId)))
    .limit(1);

  if (!existing) {
    return NextResponse.json({ error: 'not_found', message: 'Rule not found' }, { status: 404 });
  }

  await getDb().delete(categoryRules).where(eq(categoryRules.id, id));

  logger.info('DELETE /api/category-rules/[id]', { userId, id, name: existing.name });
  return NextResponse.json({ success: true });
}
