import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { accounts, accountTags, tags } from '@/lib/db/schema';
import { eq, and, asc, or, like, inArray } from 'drizzle-orm';
import { logger } from '@/lib/logger';
import { getSessionDEK } from '@/lib/crypto-context';
import { decryptRows, decryptField } from '@/lib/crypto';
import { filterReportableAccounts, isReportableAccount } from '@/lib/utils/account-scope';

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json(
      { error: 'unauthenticated', message: 'Authentication required' },
      { status: 401 }
    );
  }

  const userId = session.user.id;
  const dek = await getSessionDEK();
  const { searchParams } = new URL(request.url);
  const includeHidden = searchParams.get('includeHidden') === 'true';
  const includeVirtual = searchParams.get('includeVirtual') === 'true';
  const typeFilter = searchParams.get('type');

  logger.info('Fetching accounts', { includeHidden, includeVirtual, type: typeFilter });

  const whereConditions = [eq(accounts.userId, userId)];

  if (!includeHidden) {
    if (includeVirtual) {
      whereConditions.push(
        or(
          eq(accounts.isHidden, false),
          eq(accounts.type, 'paystub'),
          like(accounts.externalId, 'virtual-%')
        )
      );
    } else {
      whereConditions.push(eq(accounts.isHidden, false));
    }
  }

  if (typeFilter) {
    whereConditions.push(eq(accounts.type, typeFilter));
  }

  const result = await getDb()
    .select()
    .from(accounts)
    .where(and(...whereConditions))
    .orderBy(asc(accounts.displayOrder));

  const decrypted = await decryptRows('accounts', result, dek);
  const scoped = includeHidden
    ? decrypted
    : decrypted.filter(
        (acc) =>
          isReportableAccount(acc) ||
          (includeVirtual && (acc.type === 'paystub' || acc.externalId?.startsWith('virtual-')))
      );

  // Batch fetch tags for these accounts
  const accountIds = scoped.map((a: any) => a.id);
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

  const scopedWithTags = scoped.map((acc: any) => ({
    ...acc,
    tags: tagsByAccountId.get(acc.id) ?? [],
  }));

  logger.info('Accounts fetched', { count: scopedWithTags.length });
  return NextResponse.json(scopedWithTags);
}
