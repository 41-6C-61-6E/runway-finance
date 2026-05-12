import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { categories } from '@/lib/db/schema';
import { eq, asc } from 'drizzle-orm';
import { z } from 'zod';
import { logger } from '@/lib/logger';

const CreateCategorySchema = z.object({
  name: z.string().min(1).max(100),
  parentId: z.string().uuid().nullable().optional(),
  color: z.string().max(7).default('#6366f1'),
  isIncome: z.boolean().default(false),
  excludeFromReports: z.boolean().default(false),
  displayOrder: z.number().int().default(0),
});

export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  }

  const userId = session.user.id;
  const cats = await getDb()
    .select()
    .from(categories)
    .where(eq(categories.userId, userId))
    .orderBy(asc(categories.displayOrder));

  logger.info('GET /api/categories', { userId, count: cats.length });
  return NextResponse.json(cats);
}

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

  const parsed = CreateCategorySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'validation_error', details: parsed.error.flatten().fieldErrors },
      { status: 400 }
    );
  }

  const { name, parentId, color, isIncome, excludeFromReports, displayOrder } = parsed.data;

  const [cat] = await getDb()
    .insert(categories)
    .values({
      userId,
      name,
      parentId: parentId ?? null,
      color,
      isIncome,
      isSystem: false,
      excludeFromReports,
      displayOrder,
    })
    .returning();

  logger.info('POST /api/categories - created', { userId, name, isIncome });
  return NextResponse.json(cat, { status: 201 });
}
