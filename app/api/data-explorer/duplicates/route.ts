import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { transactions, accounts } from '@/lib/db/schema';
import { eq, and, gte, lte } from 'drizzle-orm';
import { getSessionDEK } from '@/lib/crypto-context';
import { decryptRows, decryptField } from '@/lib/crypto';
import { isSimilarDescription } from '@/lib/utils/description-matching';
import { logger } from '@/lib/logger';

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'unauthenticated', message: 'Authentication required' }, { status: 401 });
  }

  const userId = session.user.id;
  const dek = await getSessionDEK();
  const { searchParams } = new URL(request.url);

  const accountId = searchParams.get('accountId');
  const startDate = searchParams.get('startDate');
  const endDate = searchParams.get('endDate');
  const simplefinOnly = searchParams.get('simplefinOnly') === 'true';

  try {
    const db = getDb();

    const whereConditions = [
      eq(transactions.userId, userId),
      eq(transactions.deleted, false),
    ];

    if (accountId) {
      whereConditions.push(eq(transactions.accountId, accountId));
    }
    if (startDate) {
      whereConditions.push(gte(transactions.date, startDate));
    }
    if (endDate) {
      whereConditions.push(lte(transactions.date, endDate));
    }
    if (simplefinOnly) {
      whereConditions.push(eq(transactions.isImported, false));
    }

    // Fetch all active transactions (not deleted)
    const activeTxns = await db
      .select({
        transaction: transactions,
        accountName: accounts.name,
      })
      .from(transactions)
      .leftJoin(accounts, eq(transactions.accountId, accounts.id))
      .where(and(...whereConditions));

    if (activeTxns.length === 0) {
      return NextResponse.json({ duplicateGroups: [] });
    }

    // Decrypt all transactions and account names
    const decryptedRows = await Promise.all(
      activeTxns.map(async (row) => {
        const decTx = await decryptRows('transactions', [row.transaction], dek);
        let accountName = null;
        if (row.accountName) {
          accountName = await decryptField(row.accountName, dek);
        }
        return {
          ...decTx[0],
          accountName,
        };
      })
    );

    // Group transactions by account and absolute amount
    const groups: Record<string, typeof decryptedRows> = {};
    for (const tx of decryptedRows) {
      const amountStr = String(Math.abs(parseFloat(tx.amount) || 0));
      const key = `${tx.accountId}_${amountStr}`;
      if (!groups[key]) {
        groups[key] = [];
      }
      groups[key].push(tx);
    }

    const duplicateGroups: Array<{
      id: string;
      amount: string;
      accountId: string;
      accountName: string | null;
      transactions: typeof decryptedRows;
    }> = [];

    let groupCounter = 1;

    for (const [key, list] of Object.entries(groups)) {
      if (list.length < 2) continue;

      // Find pairs/groups within 3 days date window and with similar description
      const visited = new Set<string>();

      for (let i = 0; i < list.length; i++) {
        const txA = list[i];
        if (visited.has(txA.id)) continue;

        const cluster = [txA];
        const dateA = new Date(txA.date).getTime();

        for (let j = i + 1; j < list.length; j++) {
          const txB = list[j];
          if (visited.has(txB.id)) continue;

          const dateB = new Date(txB.date).getTime();
          const diffDays = Math.abs(dateA - dateB) / (1000 * 60 * 60 * 24);

          if (diffDays <= 3 && isSimilarDescription(txA.description, txB.description)) {
            cluster.push(txB);
          }
        }

        if (cluster.length >= 2) {
          for (const tx of cluster) {
            visited.add(tx.id);
          }

          duplicateGroups.push({
            id: `group-${groupCounter++}`,
            amount: list[0].amount,
            accountId: list[0].accountId,
            accountName: list[0].accountName,
            transactions: cluster,
          });
        }
      }
    }

    return NextResponse.json({ duplicateGroups });
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    logger.error('Duplicate detection query failed', { error: errMsg });
    return NextResponse.json({ error: 'query_failed', message: errMsg }, { status: 500 });
  }
}
