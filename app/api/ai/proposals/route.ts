import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { aiProposals, transactions, accounts } from '@/lib/db/schema';
import { eq, and, desc, sql } from 'drizzle-orm';
import { logger } from '@/lib/logger';
import { decryptRow, decryptField } from '@/lib/crypto';
import { getSessionDEK } from '@/lib/crypto-context';

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  }

  const userId = session.user.id;
  const { searchParams } = new URL(request.url);
  const status = searchParams.get('status'); // optional filter
  const type = searchParams.get('type'); // optional filter

  const whereConditions = [eq(aiProposals.userId, userId)];
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
        eq(transactions.userId, userId),
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

  const proposals = await Promise.all(
    rawProposals.map(async (row) => {
      const proposal = row.proposal;
      if (row.transaction && dek) {
        try {
          const decryptedTx = await decryptRow('transactions', row.transaction, dek);
          let accountName: string | null = null;
          if (row.account?.name) {
            accountName = await decryptField(row.account.name, dek);
          }
          return {
            ...proposal,
            transactionDetails: {
              payee: decryptedTx.payee,
              date: decryptedTx.date,
              amount: decryptedTx.amount,
              accountName,
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
