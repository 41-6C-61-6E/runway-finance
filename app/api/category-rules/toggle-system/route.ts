import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { categoryRules } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { z } from 'zod';

const ToggleSystemSchema = z.object({
  active: z.boolean(),
});

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  }

  const userId = session.user.id;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const parsed = ToggleSystemSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'validation_error', details: parsed.error.flatten().fieldErrors },
      { status: 400 }
    );
  }

  const { active } = parsed.data;

  const result = await getDb()
    .update(categoryRules)
    .set({ isActive: active, updatedAt: new Date() })
    .where(and(eq(categoryRules.userId, userId), eq(categoryRules.isSystem, true)));

  return NextResponse.json({ success: true, active, updated: result.rowCount ?? 0 });
}
