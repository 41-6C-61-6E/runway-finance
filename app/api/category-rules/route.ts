import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { categoryRules, categories } from '@/lib/db/schema';
import { eq, asc } from 'drizzle-orm';
import { z } from 'zod';

const CreateRuleSchema = z.object({
  name: z.string().min(1).max(200),
  priority: z.number().int().default(0),
  isActive: z.boolean().default(true),
  conditionField: z.enum(['description', 'payee', 'amount', 'memo']),
  conditionOperator: z.enum(['contains', 'equals', 'starts_with', 'ends_with', 'regex']),
  conditionValue: z.string().min(1).max(500),
  conditionCaseSensitive: z.boolean().default(false),
  setCategoryId: z.string().uuid().nullable().optional(),
  setPayee: z.string().max(200).nullable().optional(),
  setReviewed: z.boolean().nullable().optional(),
});

export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  }

  const userId = session.user.id;

  const rules = await getDb()
    .select({
      rule: categoryRules,
      category: {
        id: categories.id,
        name: categories.name,
        color: categories.color,
      },
    })
    .from(categoryRules)
    .leftJoin(categories, eq(categoryRules.setCategoryId, categories.id))
    .where(eq(categoryRules.userId, userId))
    .orderBy(asc(categoryRules.priority));

  const data = rules.map((r) => ({
    ...r.rule,
    isSystem: r.rule.isSystem,
    categoryName: r.category?.name ?? null,
    categoryColor: r.category?.color ?? null,
  }));

  return NextResponse.json(data);
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

  const parsed = CreateRuleSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'validation_error', details: parsed.error.flatten().fieldErrors },
      { status: 400 }
    );
  }

  const { name, priority, isActive, conditionField, conditionOperator, conditionValue, conditionCaseSensitive, setCategoryId, setPayee, setReviewed } = parsed.data;

  const [rule] = await getDb()
    .insert(categoryRules)
    .values({
      userId,
      name,
      priority,
      isActive,
      conditionField,
      conditionOperator,
      conditionValue,
      conditionCaseSensitive,
      setCategoryId: setCategoryId ?? null,
      setPayee: setPayee ?? null,
      setReviewed: setReviewed ?? null,
    })
    .returning();

  return NextResponse.json(rule, { status: 201 });
}
