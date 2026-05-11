import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { categories } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { z } from 'zod';

const UpdateCategorySchema = z.object({
  name: z.string().min(1).max(100).optional(),
  parentId: z.string().uuid().nullable().optional(),
  color: z.string().max(7).optional(),
  isIncome: z.boolean().optional(),
  excludeFromReports: z.boolean().optional(),
  displayOrder: z.number().int().optional(),
});

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  }

  const userId = session.user.id;
  const { id } = await params;

  const [existing] = await getDb()
    .select()
    .from(categories)
    .where(and(eq(categories.id, id), eq(categories.userId, userId)))
    .limit(1);

  if (!existing) {
    return NextResponse.json({ error: 'not_found', message: 'Category not found' }, { status: 404 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const parsed = UpdateCategorySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'validation_error', details: parsed.error.flatten().fieldErrors },
      { status: 400 }
    );
  }

  const [updated] = await getDb()
    .update(categories)
    .set({ ...parsed.data })
    .where(eq(categories.id, id))
    .returning();

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
    .from(categories)
    .where(and(eq(categories.id, id), eq(categories.userId, userId)))
    .limit(1);

  if (!existing) {
    return NextResponse.json({ error: 'not_found', message: 'Category not found' }, { status: 404 });
  }

  await getDb().delete(categories).where(eq(categories.id, id));

  return NextResponse.json({ success: true });
}
