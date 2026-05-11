import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { categoryRules } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { z } from 'zod';

const ReorderSchema = z.object({
  rules: z.array(z.object({
    id: z.string().uuid(),
    priority: z.number().int(),
  })).min(1),
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

  const parsed = ReorderSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'validation_error', details: parsed.error.flatten().fieldErrors },
      { status: 400 }
    );
  }

  for (const { id, priority } of parsed.data.rules) {
    await getDb()
      .update(categoryRules)
      .set({ priority })
      .where(and(eq(categoryRules.id, id), eq(categoryRules.userId, userId)));
  }

  return NextResponse.json({ success: true });
}
