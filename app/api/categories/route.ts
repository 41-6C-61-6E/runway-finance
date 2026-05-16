import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { categories } from '@/lib/db/schema';
import { eq, asc } from 'drizzle-orm';
import { z } from 'zod';
import { logger } from '@/lib/logger';
import { getSessionDEK } from '@/lib/crypto-context';
import { decryptRows, encryptRow } from '@/lib/crypto';

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
  const dek = await getSessionDEK();
  const cats = await getDb()
    .select()
    .from(categories)
    .where(eq(categories.userId, userId))
    .orderBy(asc(categories.displayOrder));

  const decrypted = await decryptRows('categories', cats, dek);
  logger.info('GET /api/categories', { userId, count: decrypted.length });
  return NextResponse.json(decrypted);
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  }

  const userId = session.user.id;
  const dek = await getSessionDEK();
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

  const encryptedValues = await encryptRow('categories', {
    userId,
    name,
    parentId: parentId ?? null,
    color,
    isIncome,
    isSystem: false,
    excludeFromReports,
    displayOrder,
  }, dek);

  const [cat] = await getDb()
    .insert(categories)
    .values(encryptedValues)
    .returning();

  logger.info('POST /api/categories - created', { userId, name, isIncome });
  return NextResponse.json(cat, { status: 201 });
}
