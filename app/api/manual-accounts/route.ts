import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { accounts, accountTags, tags } from '@/lib/db/schema';
import { eq, and, isNull, asc, inArray } from 'drizzle-orm';
import { createManualAccount, readApiConfig, MANUAL_ACCOUNT_TYPES, type AssetSubType } from '@/lib/services/manual-accounts';
import { logger } from '@/lib/logger';
import { getSessionDEK } from '@/lib/crypto-context';
import { decryptRows, decryptField } from '@/lib/crypto';
import { manualAccountScheduler } from '@/lib/services/manual-account-scheduler';

export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'unauthenticated', message: 'Authentication required' }, { status: 401 });
  }

  const userId = session.user.id;
  const dek = await getSessionDEK();

  const result = await getDb()
    .select()
    .from(accounts)
    .where(
      and(
        eq(accounts.userId, userId),
        isNull(accounts.connectionId),
      )
    )
    .orderBy(asc(accounts.displayOrder), asc(accounts.name));

  const decrypted = await decryptRows('accounts', result, dek);
  logger.info('GET /api/manual-accounts', { userId, count: decrypted.length });

  // Batch fetch tags for these manual accounts
  const accountIds = decrypted.map((a: any) => a.id);
  const tagRows = accountIds.length > 0
    ? await getDb()
        .select({
          accountId: accountTags.accountId,
          tagId: tags.id,
          tagName: tags.name,
          tagColor: tags.color,
        })
        .from(accountTags)
        .leftJoin(tags, eq(accountTags.tagId, tags.id))
        .where(inArray(accountTags.accountId, accountIds))
    : [];

  const tagsByAccountId = new Map<string, any[]>();
  for (const row of tagRows) {
    const name = row.tagName ? await decryptField(row.tagName, dek) : '';
    const tag = { id: row.tagId, name, color: row.tagColor };
    const existing = tagsByAccountId.get(row.accountId) ?? [];
    existing.push(tag);
    tagsByAccountId.set(row.accountId, existing);
  }

  const decryptedWithTags = decrypted.map((acc: any) => ({
    ...acc,
    tags: tagsByAccountId.get(acc.id) ?? [],
  }));

  return NextResponse.json(decryptedWithTags);
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'unauthenticated', message: 'Authentication required' }, { status: 401 });
  }

  const userId = session.user.id;
  const dek = await getSessionDEK();

  let body: {
    name?: string;
    type?: string;
    metadata?: Record<string, unknown>;
    initialValue?: number;
    currency?: string;
    tagIds?: string[];
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'validation_error', message: 'Invalid request body' }, { status: 400 });
  }

  if (!body.name || !body.type) {
    return NextResponse.json({ error: 'validation_error', message: 'name and type are required' }, { status: 400 });
  }

  if (!MANUAL_ACCOUNT_TYPES.includes(body.type as AssetSubType)) {
    return NextResponse.json({ error: 'validation_error', message: `Invalid type. Must be one of: ${MANUAL_ACCOUNT_TYPES.join(', ')}` }, { status: 400 });
  }

  try {
    const apiConfig = await readApiConfig(userId);
    const account = await createManualAccount({
      userId,
      name: body.name,
      type: body.type as AssetSubType,
      metadata: body.metadata,
      initialValue: body.initialValue,
      currency: body.currency,
      apiConfig,
    }, dek);
    logger.info('POST /api/manual-accounts - created', { userId, type: body.type, name: body.name, initialValue: body.initialValue });

    // Associate tags if specified
    const tagIds = body.tagIds;
    if (tagIds && Array.isArray(tagIds) && tagIds.length > 0) {
      await getDb().insert(accountTags).values(
        tagIds.map(tId => ({
          accountId: account.id,
          tagId: tId,
        }))
      );
    }

    let attachedTags: any[] = [];
    if (tagIds && Array.isArray(tagIds) && tagIds.length > 0) {
      const tagRows = await getDb()
        .select({
          id: tags.id,
          name: tags.name,
          color: tags.color,
        })
        .from(tags)
        .where(inArray(tags.id, tagIds));
      for (const row of tagRows) {
        attachedTags.push({
          id: row.id,
          name: row.name ? await decryptField(row.name, dek) : '',
          color: row.color,
        });
      }
    }

    // Schedule auto-sync if the account has a sync frequency
    const syncFrequency = (body.metadata?.syncFrequency as string) || 'manual';
    manualAccountScheduler.schedule(account.id, userId, syncFrequency, account.balanceDate);

    return NextResponse.json({ ...account, tags: attachedTags }, { status: 201 });
  } catch (err) {
    logger.error('POST /api/manual-accounts - error', { userId, name: body.name, error: err instanceof Error ? err.message : 'Failed to create account' });
    return NextResponse.json({ error: 'internal_error', message: err instanceof Error ? err.message : 'Failed to create account' }, { status: 500 });
  }
}
