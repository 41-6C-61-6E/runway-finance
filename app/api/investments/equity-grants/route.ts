import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getSessionDEK } from '@/lib/crypto-context';
import { z } from 'zod';
import { logger } from '@/lib/logger';
import {
  listUserEquityGrants,
  createEquityGrant,
} from '@/lib/services/equity-grants';

const LOG_TAG = '[api-equity-grants]';

const VestingScheduleSchema = z.object({
  totalMonths: z.number().min(0).max(240).default(48),
  cliffMonths: z.number().min(0).max(240).default(12),
  cliffPercent: z.number().min(0).max(100).default(25),
  frequency: z.enum(['monthly', 'quarterly', 'annual', 'custom', 'immediate']).default('monthly'),
  customTranches: z
    .array(
      z.object({
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        shares: z.number().min(0),
      })
    )
    .optional(),
});

export const CreateEquityGrantSchema = z.object({
  accountId: z.string().uuid().optional(),
  companyName: z.string().trim().min(1).max(120),
  grantName: z.string().trim().min(1).max(120),
  grantType: z.enum(['iso', 'nso', 'rsu', 'common']).default('iso'),
  grantDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  vestingStartDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  expirationDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  totalShares: z.number().positive(),
  exercisedShares: z.number().min(0).optional().default(0),
  soldShares: z.number().min(0).optional().default(0),
  strikePrice: z.number().min(0).default(0),
  currentFmv: z.number().min(0).default(0),
  preferredPrice: z.number().min(0).nullable().optional(),
  valuationMode: z.enum(['fmv', 'preferred']).default('fmv'),
  vestingSchedule: VestingScheduleSchema,
  earlyExerciseAllowed: z.boolean().optional().default(false),
  filed83b: z.boolean().optional().default(false),
  earlyExerciseDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  logoUrl: z.string().max(150000).nullable().optional(),
  notes: z.string().max(1000).nullable().optional(),
  isExcludedFromNetWorth: z.boolean().optional(),
});

export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json(
      { error: 'unauthenticated', message: 'Authentication required' },
      { status: 401 }
    );
  }

  const userId = session.user.id;
  const dek = await getSessionDEK();

  try {
    const result = await listUserEquityGrants(userId, dek);
    return NextResponse.json(result);
  } catch (error) {
    logger.error(`${LOG_TAG} Error listing equity grants`, {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      { error: 'internal_error', message: 'Failed to load equity grants' },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json(
      { error: 'unauthenticated', message: 'Authentication required' },
      { status: 401 }
    );
  }

  const userId = session.user.id;
  const dek = await getSessionDEK();

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: 'invalid_body', message: 'Request body must be valid JSON' },
      { status: 400 }
    );
  }

  const parsed = CreateEquityGrantSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: 'validation_error',
        details: parsed.error.flatten().fieldErrors,
        message: 'Invalid equity grant parameters',
      },
      { status: 400 }
    );
  }

  try {
    const created = await createEquityGrant(userId, parsed.data, dek);
    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    logger.error(`${LOG_TAG} Error creating equity grant`, {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      { error: 'internal_error', message: 'Failed to create equity grant' },
      { status: 500 }
    );
  }
}

