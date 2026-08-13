import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { sql } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import { recurringStreams } from '@/lib/db/schema';
import { logger } from '@/lib/logger';
import { getSessionDEK } from '@/lib/crypto-context';
import { encryptRow } from '@/lib/crypto';
import { calculateNextExpectedDate } from '@/lib/services/recurring-engine';

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const dataUserId = (session.user as any).dataUserId ?? session.user.id;
  const dek = await getSessionDEK();

  let body: Record<string, any>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'invalid_body' }, { status: 400 });
  }

  const {
    name,
    payee,
    amount,
    type = 'subscription',
    frequency = 'monthly',
    accountId,
    categoryId,
    anchorDate = new Date().toISOString().split('T')[0],
    isVariableAmount = false,
    confidence = 100,
  } = body;

  if (!name || amount === undefined || isNaN(parseFloat(amount))) {
    return NextResponse.json({ error: 'name and valid amount are required' }, { status: 400 });
  }

  const numericAmount = parseFloat(amount);
  const nextExpectedDate = body.nextExpectedDate || calculateNextExpectedDate(anchorDate, frequency);

  const db = getDb();

  try {
    const rawRow = {
      userId: dataUserId,
      name: name.trim(),
      payee: payee ? payee.trim() : name.trim(),
      amount: numericAmount.toFixed(2),
      type,
      frequency,
      intervalDays: frequency === 'weekly' ? 7 : frequency === 'biweekly' ? 14 : frequency === 'semimonthly' ? 15 : frequency === 'quarterly' ? 91 : frequency === 'yearly' ? 365 : 30,
      anchorDate,
      nextExpectedDate,
      accountId: accountId || null,
      categoryId: categoryId || null,
      isAutoDetected: false,
      isConfirmed: true,
      isActive: true,
      confidence: Math.max(0, Math.min(100, parseInt(confidence, 10) || 100)),
      isVariableAmount: !!isVariableAmount,
      averageAmount: numericAmount.toFixed(2),
      metadata: body.metadata || {},
    };

    const encryptedRow = await encryptRow('recurring_streams', rawRow, dek);
    let inserted;
    try {
      [inserted] = await db
        .insert(recurringStreams)
        .values(encryptedRow)
        .returning();
    } catch (dbErr: any) {
      if (dbErr?.code === '42P01' || String(dbErr?.message || '').includes('recurring_streams')) {
        await db.execute(sql`
          CREATE TABLE IF NOT EXISTS recurring_streams (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            user_id TEXT NOT NULL,
            account_id UUID REFERENCES accounts(id) ON DELETE CASCADE,
            category_id UUID REFERENCES categories(id) ON DELETE SET NULL,
            name TEXT NOT NULL,
            payee TEXT,
            amount TEXT NOT NULL,
            currency TEXT NOT NULL DEFAULT 'USD',
            type TEXT NOT NULL DEFAULT 'subscription',
            frequency TEXT NOT NULL DEFAULT 'monthly',
            interval_days INTEGER,
            anchor_date DATE NOT NULL,
            next_expected_date DATE NOT NULL,
            is_auto_detected BOOLEAN NOT NULL DEFAULT true,
            is_confirmed BOOLEAN NOT NULL DEFAULT false,
            is_active BOOLEAN NOT NULL DEFAULT true,
            confidence INTEGER NOT NULL DEFAULT 100,
            is_variable_amount BOOLEAN NOT NULL DEFAULT false,
            average_amount TEXT,
            metadata JSONB DEFAULT '{}',
            created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
          );
          CREATE INDEX IF NOT EXISTS idx_recurring_streams_user_id ON recurring_streams (user_id);
        `);
        [inserted] = await db
          .insert(recurringStreams)
          .values(encryptedRow)
          .returning();
      } else {
        throw dbErr;
      }
    }

    return NextResponse.json({ success: true, item: { ...inserted, amount: numericAmount } });
  } catch (error) {
    logger.error('Failed to create recurring stream', { error });
    return NextResponse.json({ error: 'internal_error' }, { status: 500 });
  }
}
