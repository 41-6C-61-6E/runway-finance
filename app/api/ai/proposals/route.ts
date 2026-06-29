import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { aiProposals, transactions, accounts, accountTags, tags } from '@/lib/db/schema';
import { eq, and, or, isNull, desc, sql, inArray } from 'drizzle-orm';
import { logger } from '@/lib/logger';
import { decryptRow, decryptField } from '@/lib/crypto';
import { getSessionDEK } from '@/lib/crypto-context';

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  }

  const userId = session.user.id;
  const dataUserId = (session.user as any).dataUserId ?? session.user.id;
  const { searchParams } = new URL(request.url);
  const status = searchParams.get('status'); // optional filter
  const type = searchParams.get('type'); // optional filter

  const whereConditions = [
    eq(aiProposals.userId, dataUserId),
    or(
      isNull(accounts.id),
      and(
        eq(accounts.isHidden, false),
        eq(accounts.isExcludedFromNetWorth, false)
      ),
      eq(accounts.type, 'paystub')
    )
  ];
  if (status) {
    whereConditions.push(eq(aiProposals.status, status));
  }
  if (type) {
    whereConditions.push(eq(aiProposals.type, type));
  }

  const db = getDb();
  const rawProposals = await db
    .select({
      proposal: aiProposals,
      transaction: transactions,
      account: accounts,
    })
    .from(aiProposals)
    .leftJoin(
      transactions,
      and(
        eq(transactions.userId, dataUserId),
        eq(
          transactions.id,
          sql<string>`(${aiProposals.payload}->>'transactionId')::uuid`
        )
      )
    )
    .leftJoin(
      accounts,
      eq(transactions.accountId, accounts.id)
    )
    .where(and(...whereConditions))
    .orderBy(desc(aiProposals.createdAt));

  let dek: Uint8Array | null = null;
  try {
    dek = await getSessionDEK();
  } catch {
    // Session DEK not available in context
  }

  // Batch fetch tags for the linked accounts
  const accountIds = Array.from(
    new Set(rawProposals.map((row) => row.account?.id).filter(Boolean))
  ) as string[];

  const tagRows = accountIds.length > 0
    ? await db
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
  if (dek) {
    for (const row of tagRows) {
      try {
        const name = row.tagName ? await decryptField(row.tagName, dek) : '';
        const tag = { id: row.tagId, name, color: row.tagColor };
        const existing = tagsByAccountId.get(row.accountId) ?? [];
        existing.push(tag);
        tagsByAccountId.set(row.accountId, existing);
      } catch (err) {
        logger.error('Failed to decrypt tag in proposals route', { tagId: row.tagId, error: err });
      }
    }
  }

  const proposals = await Promise.all(
    rawProposals.map(async (row) => {
      const proposal = row.proposal;
      if (row.transaction && dek) {
        try {
          const decryptedTx = await decryptRow('transactions', row.transaction, dek);
          let accountName: string | null = null;
          let accountTagsList: any[] = [];
          if (row.account?.name) {
            accountName = await decryptField(row.account.name, dek);
            accountTagsList = tagsByAccountId.get(row.account.id) ?? [];
          }
          return {
            ...proposal,
            transactionDetails: {
              payee: decryptedTx.payee,
              date: decryptedTx.date,
              amount: decryptedTx.amount,
              accountName,
              accountTags: accountTagsList,
            }
          };
        } catch (err) {
          logger.error('Failed to decrypt transaction details for proposal', { proposalId: proposal.id, error: err });
        }
      }
      return proposal;
    })
  );

  logger.info('GET /api/ai/proposals', { userId, count: proposals.length, status, type });
  return NextResponse.json(proposals);
}
