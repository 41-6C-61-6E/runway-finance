import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { categoryRules, categories } from '@/lib/db/schema';
import { eq, asc } from 'drizzle-orm';
import { z } from 'zod';
import { logger } from '@/lib/logger';
import { getSessionDEK } from '@/lib/crypto-context';
import { decryptRows, encryptRow } from '@/lib/crypto';

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
  const dek = await getSessionDEK();

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

  const decryptedRules = await decryptRows('category_rules', rules.map((r) => r.rule), dek);
  const decryptedCategories = await decryptRows('categories', rules.map((r) => r.category).filter(Boolean), dek);
  const catMap = new Map(decryptedCategories.map((c: any) => [c.id, c]));

  const data = decryptedRules.map((rule: any) => {
    const cat = catMap.get(rule.setCategoryId);
    return {
      ...rule,
      isSystem: rule.isSystem,
      categoryName: cat?.name ?? null,
      categoryColor: cat?.color ?? null,
    };
  });

  logger.info('GET /api/category-rules', { userId, count: data.length });
  return NextResponse.json(data);
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

  const parsed = CreateRuleSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'validation_error', details: parsed.error.flatten().fieldErrors },
      { status: 400 }
    );
  }

  const { name, priority, isActive, conditionField, conditionOperator, conditionValue, conditionCaseSensitive, setCategoryId, setPayee, setReviewed } = parsed.data;

  const encryptedValues = await encryptRow('category_rules', {
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
  }, dek);

  const [rule] = await getDb()
    .insert(categoryRules)
    .values(encryptedValues)
    .returning();

  logger.info('POST /api/category-rules - created', { userId, name: rule.name, conditionField: rule.conditionField, conditionOperator: rule.conditionOperator, conditionValue: rule.conditionValue });
  return NextResponse.json(rule, { status: 201 });
}
