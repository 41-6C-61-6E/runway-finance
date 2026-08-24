import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { accounts, transactions, holdings } from '@/lib/db/schema';
import { eq, and, asc, desc, inArray } from 'drizzle-orm';
import { z } from 'zod';
import { logger } from '@/lib/logger';
import { getSessionDEK } from '@/lib/crypto-context';
import { decryptRows } from '@/lib/crypto';
import { isInvestmentAccount } from '@/lib/utils/account-scope';
import {
  isValidIdentifier,
  resolveDisplayTicker,
  updateHoldingOverrides,
} from './helpers/holding-overrides';

const LOG_TAG = '[api-investments]';

/**
 * Body for POST /api/investments — updates user-set ticker identifiers for
 * a security. Both fields are optional; at least one must be provided.
 * Empty string clears the value.
 */
const UpdateHoldingOverridesSchema = z.object({
  securityId: z.string().min(1).max(128),
  // Empty string clears the value; otherwise must be a valid ticker format.
  tickerOverride: z.string().max(12).optional(),
  publicEquivalent: z.string().max(12).optional(),
});

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json(
      { error: 'unauthenticated', message: 'Authentication required' },
      { status: 401 }
    );
  }

  const dataUserId = (session.user as any).dataUserId ?? session.user.id;
  const dek = await getSessionDEK();
  const { searchParams } = new URL(request.url);
  const includeHidden = searchParams.get('includeHidden') === 'true';

  logger.info(`${LOG_TAG} Fetching investments`, { includeHidden });

  try {
    const whereConditions = [eq(accounts.userId, dataUserId)];
    if (!includeHidden) {
      whereConditions.push(eq(accounts.isHidden, false));
    }

    const result = await getDb()
      .select()
      .from(accounts)
      .where(and(...whereConditions))
      .orderBy(asc(accounts.displayOrder));

    const decryptedAccounts = await decryptRows('accounts', result, dek);
    
    // Filter down to only investment-related accounts
    const investmentAccounts = decryptedAccounts.filter((acc) =>
      isInvestmentAccount(acc.type)
    );

    const accountIds = investmentAccounts.map((acc) => acc.id);
    const dbHoldings = accountIds.length > 0
      ? await getDb()
          .select()
          .from(holdings)
          .where(inArray(holdings.accountId, accountIds))
      : [];

    const decryptedHoldings = await decryptRows('holdings', dbHoldings, dek);

    const flatHoldings: any[] = [];
    let totalBalance = 0;
    let totalCostBasis = 0;
    let totalValueForCostBasis = 0;
    const uniqueSecurities = new Set<string>();

    for (const acc of investmentAccounts) {
      const balance = typeof acc.balance === 'string' ? parseFloat(acc.balance) : acc.balance;
      totalBalance += balance || 0;
    }

    for (const h of decryptedHoldings) {
      const acc = investmentAccounts.find((a) => a.id === h.accountId);
      if (!acc) continue;

      const qty = Number(h.quantity) || 0;
      const price = Number(h.price) || 0;
      const value = Number(h.value) || (qty * price);
      const cost = h.costBasis != null ? Number(h.costBasis) : null;
      
      const securityId = h.securityId || h.ticker || h.name || '';
      if (securityId) {
        uniqueSecurities.add(securityId);
      }

      let gainLoss = null;
      let returnPct = null;

      if (cost != null && cost >= 0) {
        gainLoss = value - cost;
        returnPct = cost > 0 ? (gainLoss / cost) * 100 : null;
        
        totalCostBasis += cost;
        totalValueForCostBasis += value;
      }

      flatHoldings.push({
        accountId: h.accountId,
        accountName: acc.name,
        institutionName: acc.institution || 'Unknown Brokerage',
        securityId,
        ticker: h.ticker,
        tickerOverride: h.tickerOverride ?? null,
        publicEquivalent: h.publicEquivalent ?? null,
        displayTicker: resolveDisplayTicker(h.ticker, h.tickerOverride, h.publicEquivalent),
        name: h.name || 'Unknown Security',
        quantity: qty,
        price,
        value,
        costBasis: cost,
        unrealizedGainLoss: gainLoss,
        unrealizedReturnPct: returnPct,
        currency: h.currency || 'USD',
      });
    }

    // Compute portfolio-level unrealized gains
    const totalUnrealizedGainLoss = totalValueForCostBasis > 0 ? (totalValueForCostBasis - totalCostBasis) : null;
    const totalUnrealizedReturnPct = (totalCostBasis > 0 && totalUnrealizedGainLoss != null) 
      ? (totalUnrealizedGainLoss / totalCostBasis) * 100 
      : null;

    // Calculate portfolio weight for each holding
    const holdingsWithWeights = flatHoldings.map((h) => ({
      ...h,
      portfolioWeight: totalBalance > 0 ? (h.value / totalBalance) * 100 : 0,
    }));

    // Get investment account IDs

    // Fetch recent investment transactions
    const recentTxns = accountIds.length > 0
      ? await getDb()
          .select({
            id: transactions.id,
            accountId: transactions.accountId,
            date: transactions.date,
            amount: transactions.amount,
            description: transactions.description,
            payee: transactions.payee,
            pending: transactions.pending,
          })
          .from(transactions)
          .where(
            and(
              eq(transactions.userId, dataUserId),
              eq(transactions.deleted, false),
              inArray(transactions.accountId, accountIds)
            )
          )
          .orderBy(desc(transactions.date))
          .limit(10)
      : [];

    const decryptedTxns = recentTxns.length > 0
      ? await decryptRows('transactions', recentTxns, dek)
      : [];

    const mappedTxns = decryptedTxns.map((tx) => {
      const acc = investmentAccounts.find((a) => a.id === tx.accountId);
      const parsedAmount = typeof tx.amount === 'string' ? parseFloat(tx.amount) : tx.amount;
      return {
        id: tx.id,
        date: tx.date,
        amount: parsedAmount || 0,
        description: tx.description,
        payee: tx.payee,
        pending: tx.pending,
        accountName: acc?.name || 'Investment Account',
        institutionName: acc?.institution || 'Brokerage',
      };
    });

    return NextResponse.json({
      accounts: investmentAccounts.map(acc => ({
        id: acc.id,
        name: acc.name,
        balance: typeof acc.balance === 'string' ? parseFloat(acc.balance) : acc.balance,
        institution: acc.institution,
        type: acc.type,
        currency: acc.currency,
        updatedAt: acc.updatedAt,
        metadata: typeof acc.metadata === 'string'
          ? (acc.metadata.trim() !== '' ? JSON.parse(acc.metadata) : null)
          : (acc.metadata || null),
      })),
      holdings: holdingsWithWeights,
      summary: {
        totalBalance,
        totalCostBasis: totalCostBasis > 0 ? totalCostBasis : null,
        totalUnrealizedGainLoss,
        totalUnrealizedReturnPct,
        holdingsCount: uniqueSecurities.size,
      },
      recentTransactions: mappedTxns,
    });
  } catch (error) {
    logger.error(`${LOG_TAG} Error fetching investments data`, {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      { error: 'internal_error', message: 'Failed to fetch investments data' },
      { status: 500 }
    );
  }
}

/**
 * POST — Update user-set ticker identifiers (display ticker / public ETF
 * equivalent) for a security. Applies to all account positions of that
 * security. Values are stored encrypted at rest.
 */
export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json(
      { error: 'unauthenticated', message: 'Authentication required' },
      { status: 401 }
    );
  }

  const dataUserId = (session.user as any).dataUserId ?? session.user.id;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: 'invalid_body', message: 'Request body must be valid JSON' },
      { status: 400 }
    );
  }

  const parsed = UpdateHoldingOverridesSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: 'validation_error',
        details: parsed.error.flatten().fieldErrors,
        message: 'tickerOverride / publicEquivalent must each be an empty string or a valid ticker (1–12 chars, A–Z 0–9 . - =)',
      },
      { status: 400 }
    );
  }

  // Three-state per field: absent → keep DB value, '' → clear (NULL),
  // ticker → set. `undefined` must be passed through untouched so the
  // helper can distinguish "not sent" from "clear".
  const rawOverride = parsed.data.tickerOverride;
  const rawEquivalent = parsed.data.publicEquivalent;
  const cleanedOverride = rawOverride === undefined ? undefined : rawOverride.trim().toUpperCase();
  const cleanedEquivalent = rawEquivalent === undefined ? undefined : rawEquivalent.trim().toUpperCase();
  if (cleanedOverride !== undefined && cleanedOverride !== '' && !isValidIdentifier(cleanedOverride)) {
    return NextResponse.json(
      { error: 'validation_error', field: 'tickerOverride', message: 'Invalid ticker format (1–12 chars, A–Z 0–9 . - =)' },
      { status: 400 }
    );
  }
  if (cleanedEquivalent !== undefined && cleanedEquivalent !== '' && !isValidIdentifier(cleanedEquivalent)) {
    return NextResponse.json(
      { error: 'validation_error', field: 'publicEquivalent', message: 'Invalid ticker format (1–12 chars, A–Z 0–9 . - =)' },
      { status: 400 }
    );
  }

  try {
    const { securityId } = parsed.data;
    await updateHoldingOverrides(
      securityId,
      dataUserId,
      cleanedOverride,
      cleanedEquivalent,
    );
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof Error && error.message === 'holding_not_found') {
      return NextResponse.json(
        { error: 'not_found', message: 'Holding no longer exists' },
        { status: 404 }
      );
    }
    logger.error(`${LOG_TAG} Error updating holding overrides`, {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      { error: 'internal_error', message: 'Failed to update holding' },
      { status: 500 }
    );
  }
}
