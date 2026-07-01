import { getDb } from '@/lib/db';
import {
  plaidConnections,
  accounts,
  transactions,
  syncLogs,
  categories,
  transactionTags,
  userSettings,
  holdings,
  holdingSnapshots,
} from '@/lib/db/schema';
import { generateHistoricalAccountSnapshots, getEarliestTransactionDate } from '@/lib/services/account-history';
import { applyRulesToTransactions } from '@/lib/services/rules-engine';
import { analyzeUncategorized } from '@/lib/services/ai-categorizer';
import { ensureCompoundCategories, ensureEmployerContributions } from '@/lib/db/seed-categories';
import { invalidateUserSearchCache } from '@/lib/services/search-cache';
import { eq, and, or, inArray, isNull, sql } from 'drizzle-orm';
import { decryptField, encryptField, encryptRow, decryptRows } from '@/lib/crypto';
import { getSessionDEK } from '@/lib/crypto-context';
import { getPlaidClient } from '@/lib/plaid';
import { logger } from '@/lib/logger';
import { resolveDataUserId } from '@/lib/sharing';
import {
  createAccountSnapshots,
  createNetWorthSnapshot,
  updateCategoryIncomeSummaries,
  updateCategorySpendingSummaries,
  updateMonthlyCashFlowSummaries
} from '@/lib/services/sync';

const LOG_TAG = '[plaid-sync]';

export async function syncPlaidConnection(
  connectionId: string,
  userId: string,
  dekOverride?: Uint8Array
): Promise<{
  status: 'success' | 'error';
  accountsSynced: number;
  transactionsFetched: number;
  transactionsNew: number;
  transactionsUpdated: number;
  errorMessage?: string;
  details?: Array<{
    externalId: string;
    name: string;
    type: string;
    currency: string;
    balance: string;
    transactionsFetched: number;
    transactionsNew: number;
    transactionsPending: number;
    wasNewAccount: boolean;
  }>;
  durationMs?: number;
}> {
  const startedAt = Date.now();
  logger.info(`${LOG_TAG} Plaid Sync started`, { connectionId, userId });

  const dataUserId = await resolveDataUserId(userId);

  let dek: Uint8Array;
  try {
    dek = dekOverride ?? (await getSessionDEK());
  } catch (err) {
    return {
      status: 'error',
      accountsSynced: 0,
      transactionsFetched: 0,
      transactionsNew: 0,
      transactionsUpdated: 0,
      errorMessage: 'Encryption key unavailable — authentication required',
    };
  }

  // Insert initial running sync log
  const [log] = await getDb()
    .insert(syncLogs)
    .values({
      userId: dataUserId,
      plaidConnectionId: connectionId,
      status: 'running',
      accountsSynced: '0',
      transactionsFetched: '0',
      transactionsNew: '0',
      startedAt: new Date(),
    })
    .returning();

  try {
    const [connection] = await getDb()
      .select()
      .from(plaidConnections)
      .where(eq(plaidConnections.id, connectionId))
      .limit(1);

    if (!connection) {
      throw new Error('Plaid connection not found');
    }

    const connectionDataUserId = await resolveDataUserId(connection.userId);
    if (connectionDataUserId !== dataUserId) {
      throw new Error('Plaid connection unauthorized');
    }

    const client = await getPlaidClient(dataUserId, dek);
    const accessToken = await decryptField(connection.accessTokenEncrypted, dek);

    // Pre-seed category configurations
    await ensureCompoundCategories(dataUserId, dek);
    await ensureEmployerContributions(dataUserId, dek);

    let hasMore = true;
    let currentCursor = connection.cursor || undefined;
    const isFirstSync = !connection.cursor;

    let addedTxns: any[] = [];
    let modifiedTxns: any[] = [];
    let removedTxns: any[] = [];
    let plaidAccountsList: any[] = [];

    // Fetch incremental updates in a loop from Plaid
    while (hasMore) {
      const response = await client.transactionsSync({
        access_token: accessToken,
        cursor: currentCursor,
        count: 500,
        options: {
          include_original_description: true,
          include_personal_finance_category: true,
          // On first sync, request the maximum 730 days of history
          ...(isFirstSync && !currentCursor ? { days_requested: 730 } : {}),
        },
      });

      addedTxns = addedTxns.concat(response.data.added);
      modifiedTxns = modifiedTxns.concat(response.data.modified);
      removedTxns = removedTxns.concat(response.data.removed);
      currentCursor = response.data.next_cursor;
      hasMore = response.data.has_more;

      if (response.data.accounts) {
        plaidAccountsList = response.data.accounts;
      }
    }

    // If we didn't get accounts list because no deltas occurred, get them explicitly
    if (plaidAccountsList.length === 0) {
      const accountsRes = await client.accountsGet({
        access_token: accessToken,
      });
      plaidAccountsList = accountsRes.data.accounts;
    }

    // Fetch investment transactions and holdings if there are investment accounts
    const hasInvestmentAccounts = plaidAccountsList.some(
      (a) => a.type.toLowerCase() === 'investment'
    );

    const accountHoldingsMap = new Map<string, any[]>();

    if (hasInvestmentAccounts) {
      // 1. Fetch holdings
      try {
        logger.info(`${LOG_TAG} Fetching Plaid investment holdings`, { connectionId });
        const holdingsRes = await client.investmentsHoldingsGet({
          access_token: accessToken,
        });

        const allHoldings = holdingsRes.data.holdings || [];
        const allSecurities = holdingsRes.data.securities || [];

        for (const holding of allHoldings) {
          const security = allSecurities.find((s) => s.security_id === holding.security_id);
          const mappedHolding = {
            securityId: holding.security_id,
            ticker: security?.ticker_symbol || null,
            name: security?.name || null,
            closePrice: security?.close_price || null,
            closePriceAsOf: security?.close_price_as_of || null,
            institutionPrice: holding.institution_price,
            institutionPriceAsOf: holding.institution_price_as_of || null,
            institutionValue: holding.institution_value,
            costBasis: holding.cost_basis || null,
            quantity: holding.quantity,
            currency: holding.iso_currency_code || 'USD',
          };

          if (!accountHoldingsMap.has(holding.account_id)) {
            accountHoldingsMap.set(holding.account_id, []);
          }
          accountHoldingsMap.get(holding.account_id)!.push(mappedHolding);
        }
      } catch (err: any) {
        logger.error(`${LOG_TAG} Error fetching investment holdings`, {
          connectionId,
          error: err.message || String(err),
        });
      }

      // 2. Fetch investment transactions
      logger.info(`${LOG_TAG} Fetching Plaid investment transactions`, { connectionId });
      const now = new Date();

      // On first sync: pull max 2 years of investment history.
      // On subsequent syncs: go back to connection creation date (or 60 days as a buffer), whichever is further.
      let startDate: Date;
      if (isFirstSync) {
        startDate = new Date(now.getTime() - 730 * 24 * 60 * 60 * 1000);
      } else if (connection.createdAt) {
        // Use connection creation date minus a 14-day overlap buffer
        startDate = new Date(connection.createdAt.getTime() - 14 * 24 * 60 * 60 * 1000);
      } else {
        startDate = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);
      }

      const startDateStr = startDate.toISOString().split('T')[0];
      const endDateStr = now.toISOString().split('T')[0];

      try {
        let invTransactions: any[] = [];
        let offset = 0;
        let totalInvTxns = 1;

        while (offset < totalInvTxns) {
          const invRes = await client.investmentsTransactionsGet({
            access_token: accessToken,
            start_date: startDateStr,
            end_date: endDateStr,
            options: {
              offset,
              count: 500,
            },
          });

          invTransactions = invTransactions.concat(invRes.data.investment_transactions);
          totalInvTxns = invRes.data.total_investment_transactions || 0;
          offset += invRes.data.investment_transactions.length;

          if (invRes.data.investment_transactions.length === 0) break;
        }

        logger.info(`${LOG_TAG} Fetched investment transactions`, {
          connectionId,
          count: invTransactions.length,
          startDateStr,
          endDateStr,
          isFirstSync,
        });

        // Translate investment transactions to standard Plaid transactions format
        for (const it of invTransactions) {
          const pt = {
            transaction_id: it.investment_transaction_id,
            account_id: it.account_id,
            date: it.date,
            authorized_date: it.date,
            amount: it.amount,
            name: it.name,
            merchant_name: it.type ? `Investment ${it.type}` : 'Investment Transaction',
            pending: false,
            payment_meta: {
              reference_number: it.subtype || null,
            },
          };
          addedTxns.push(pt);
        }
      } catch (err: any) {
        logger.error(`${LOG_TAG} Error fetching investment transactions`, {
          connectionId,
          error: err.message || String(err),
        });
      }
    }

    let accountsSynced = 0;
    let transactionsNew = 0;
    let transactionsUpdated = 0;

    const externalIdToAccountId = new Map<string, string>();
    const existingExternalIds = new Set<string>();

    const existingAccts = await getDb()
      .select({ externalId: accounts.externalId })
      .from(accounts)
      .where(eq(accounts.plaidConnectionId, connectionId));
    for (const a of existingAccts) existingExternalIds.add(a.externalId);

    const accountDetails: any[] = [];
    const rawTxData: any[] = [];

    const disabledAccounts = connection.disabledAccounts || [];

    let hasNewAccounts = false;

    // 1. Process and sync accounts
    for (const plaidAcc of plaidAccountsList) {
      if (disabledAccounts.includes(plaidAcc.account_id)) {
        logger.debug(`${LOG_TAG} Skipping sync-disabled Plaid account: ${plaidAcc.name} (${plaidAcc.account_id})`);
        continue;
      }
      const balance = plaidAcc.balances.current != null ? String(plaidAcc.balances.current) : '0';
      const balanceDate = new Date();

      const [existingAccount] = await getDb()
        .select({ id: accounts.id, metadata: accounts.metadata })
        .from(accounts)
        .where(and(eq(accounts.userId, dataUserId), eq(accounts.externalId, plaidAcc.account_id)))
        .limit(1);

      const [orphanedAccount] = await getDb()
        .select({ id: accounts.id, metadata: accounts.metadata })
        .from(accounts)
        .where(
          and(
            eq(accounts.userId, dataUserId),
            eq(accounts.externalId, plaidAcc.account_id),
            isNull(accounts.connectionId),
            isNull(accounts.plaidConnectionId)
          )
        )
        .limit(1);

      let currentMetadata: any = {};
      const baseMetadata = orphanedAccount?.metadata || existingAccount?.metadata;
      if (baseMetadata) {
        try {
          const decrypted = await decryptField(baseMetadata, dek);
          if (decrypted) {
            currentMetadata = JSON.parse(decrypted);
          }
        } catch {}
      }

      const holdingsForAccount = accountHoldingsMap.get(plaidAcc.account_id);
      delete currentMetadata.plaidHoldings;

      const encryptedMetadata = Object.keys(currentMetadata).length > 0
        ? await encryptField(JSON.stringify(currentMetadata), dek)
        : null;

      let upserted: typeof accounts.$inferSelect;

      if (orphanedAccount) {
        [upserted] = await getDb()
          .update(accounts)
          .set({
            plaidConnectionId: connectionId,
            balance: await encryptField(balance, dek),
            balanceDate,
            institution: await encryptField(connection.institutionName || 'Plaid Bank', dek),
            metadata: encryptedMetadata,
            updatedAt: new Date(),
          })
          .where(eq(accounts.id, orphanedAccount.id))
          .returning();
      } else {
        [upserted] = await getDb()
          .insert(accounts)
          .values({
            userId: dataUserId,
            plaidConnectionId: connectionId,
            externalId: plaidAcc.account_id,
            name: await encryptField(plaidAcc.name, dek),
            currency: plaidAcc.balances.iso_currency_code || 'USD',
            balance: await encryptField(balance, dek),
            balanceDate,
            type: inferPlaidAccountType(plaidAcc.type, plaidAcc.subtype),
            institution: await encryptField(connection.institutionName || 'Plaid Bank', dek),
            metadata: encryptedMetadata,
            isHidden: false,
            isExcludedFromNetWorth: false,
            displayOrder: 0,
          })
          .onConflictDoUpdate({
            target: [accounts.plaidConnectionId, accounts.externalId],
            set: {
              balance: await encryptField(balance, dek),
              balanceDate,
              institution: await encryptField(connection.institutionName || 'Plaid Bank', dek),
              metadata: encryptedMetadata,
              updatedAt: new Date(),
            },
          })
          .returning();
      }

      externalIdToAccountId.set(plaidAcc.account_id, upserted.id);

      const wasNewAccount = !orphanedAccount && !existingExternalIds.has(plaidAcc.account_id);
      if (wasNewAccount) {
        hasNewAccounts = true;
      }

      // Trigger custom account balance alerts check
      const { checkAccountBalanceAlerts } = await import('@/lib/services/notifications');
      checkAccountBalanceAlerts(dataUserId, upserted.id, parseFloat(balance) || 0, dek).catch((e) => {
        logger.error('[plaid-sync] Failed to check custom account balance alerts:', e);
      });

      if (holdingsForAccount !== undefined) {
        await getDb()
          .delete(holdings)
          .where(eq(holdings.accountId, upserted.id));

        if (holdingsForAccount.length > 0) {
          const todayStr = new Date().toISOString().split('T')[0];

          // Aggregate holdings by securityId to handle duplicate positions under the same security ID
          const aggregatedHoldings = new Map<string, any>();
          for (const h of holdingsForAccount) {
            const existing = aggregatedHoldings.get(h.securityId);
            if (existing) {
              const currentQty = existing.quantity || 0;
              const newQty = h.quantity || 0;
              existing.quantity = currentQty + newQty;

              const currentValue = existing.institutionValue || (currentQty * (existing.institutionPrice ?? existing.closePrice ?? 0));
              const newValue = h.institutionValue || (newQty * (h.institutionPrice ?? h.closePrice ?? 0));
              existing.institutionValue = currentValue + newValue;

              if (h.costBasis != null) {
                existing.costBasis = (existing.costBasis || 0) + h.costBasis;
              }

              if (existing.quantity > 0) {
                existing.institutionPrice = existing.institutionValue / existing.quantity;
              }

              if (!existing.name && h.name) existing.name = h.name;
              if (!existing.ticker && h.ticker) existing.ticker = h.ticker;
            } else {
              aggregatedHoldings.set(h.securityId, { ...h });
            }
          }

          for (const h of aggregatedHoldings.values()) {
            const qty = String(h.quantity);
            const price = String(h.institutionPrice ?? h.closePrice ?? '0');
            const cost = h.costBasis != null ? String(h.costBasis) : null;
            const val = String(h.institutionValue ?? (Number(qty) * Number(price)));
            const nameVal = h.name || 'Unknown Security';

            const encryptedName = await encryptField(nameVal, dek);
            const encryptedQty = await encryptField(qty, dek);
            const encryptedPrice = await encryptField(price, dek);
            const encryptedCost = cost != null ? await encryptField(cost, dek) : null;
            const encryptedValue = await encryptField(val, dek);

            await getDb()
              .insert(holdings)
              .values({
                userId: dataUserId,
                accountId: upserted.id,
                securityId: h.securityId,
                ticker: h.ticker,
                name: encryptedName,
                quantity: encryptedQty,
                price: encryptedPrice,
                costBasis: encryptedCost,
                value: encryptedValue,
                currency: h.currency,
              })
              .onConflictDoUpdate({
                target: [holdings.accountId, holdings.securityId],
                set: {
                  ticker: h.ticker,
                  name: encryptedName,
                  quantity: encryptedQty,
                  price: encryptedPrice,
                  costBasis: encryptedCost,
                  value: encryptedValue,
                  currency: h.currency,
                  updatedAt: new Date(),
                },
              });

            await getDb()
              .insert(holdingSnapshots)
              .values({
                userId: dataUserId,
                accountId: upserted.id,
                snapshotDate: todayStr,
                securityId: h.securityId,
                ticker: h.ticker,
                name: encryptedName,
                quantity: encryptedQty,
                price: encryptedPrice,
                value: encryptedValue,
                costBasis: encryptedCost,
              })
              .onConflictDoUpdate({
                target: [
                  holdingSnapshots.userId,
                  holdingSnapshots.accountId,
                  holdingSnapshots.securityId,
                  holdingSnapshots.snapshotDate,
                ],
                set: {
                  name: encryptedName,
                  quantity: encryptedQty,
                  price: encryptedPrice,
                  value: encryptedValue,
                  costBasis: encryptedCost,
                },
              });
          }
        }
      }

      accountsSynced++;

      accountDetails.push({
        externalId: plaidAcc.account_id,
        name: plaidAcc.name,
        type: inferPlaidAccountType(plaidAcc.type, plaidAcc.subtype),
        currency: plaidAcc.balances.iso_currency_code || 'USD',
        balance,
        transactionsFetched: 0,
        transactionsNew: 0,
        transactionsPending: 0,
        wasNewAccount,
      });
    }

    // 2. Process added and modified transactions
    const allIncomingTxns = [...addedTxns, ...modifiedTxns];
    for (const pt of allIncomingTxns) {
      const accountId = externalIdToAccountId.get(pt.account_id);
      if (!accountId) continue;

      // In Plaid, positive values are debits (expenses), negative are credits (deposits/income).
      // THis app  stores deposits as positive, and expenses as negative. So we negate the amount.
      const appAmount = String(-pt.amount);
      const isPending = pt.pending ?? false;

      const txData = {
        userId: dataUserId,
        accountId,
        externalId: pt.transaction_id,
        date: pt.date,
        postedDate: pt.authorized_date || null,
        amount: await encryptField(appAmount, dek),
        description: await encryptField(
          pt.original_description || pt.name || 'Plaid Transaction',
          dek
        ),
        payee: pt.merchant_name ? await encryptField(pt.merchant_name, dek) : null,
        memo: pt.payment_meta?.reference_number
          ? await encryptField(pt.payment_meta.reference_number, dek)
          : pt.personal_finance_category?.primary
            ? await encryptField(`[${pt.personal_finance_category.primary}]`, dek)
            : null,
        pending: isPending,
      };

      rawTxData.push({
        externalId: pt.transaction_id,
        accountId,
        description: pt.original_description || pt.name || '',
        payee: pt.merchant_name || null,
        memo: pt.payment_meta?.reference_number || null,
        amount: appAmount,
      });

      const [existingTx] = await getDb()
        .select({ id: transactions.id })
        .from(transactions)
        .where(
          and(
            eq(transactions.userId, dataUserId),
            eq(transactions.accountId, accountId),
            eq(transactions.externalId, pt.transaction_id)
          )
        )
        .limit(1);

      await getDb()
        .insert(transactions)
        .values(txData)
        .onConflictDoUpdate({
          target: [transactions.accountId, transactions.externalId],
          set: {
            amount: txData.amount,
            pending: isPending,
            description: txData.description,
            postedDate: pt.authorized_date || null,
            updatedAt: new Date(),
          },
        });

      if (existingTx) {
        transactionsUpdated++;
      } else {
        transactionsNew++;

        // Trigger custom transaction alerts check
        const { checkTransactionAlerts } = await import('@/lib/services/notifications');
        checkTransactionAlerts(dataUserId, {
          externalId: pt.transaction_id,
          accountId,
          description: pt.original_description || pt.name || '',
          payee: pt.merchant_name || null,
          memo: pt.payment_meta?.reference_number || null,
          amount: appAmount,
        }).catch((e) => {
          logger.error('[plaid-sync] Failed to run custom transaction alert checks:', e);
        });
      }

      // Update counters in accountDetails
      const detail = accountDetails.find((d) => d.externalId === pt.account_id);
      if (detail) {
        detail.transactionsFetched++;
        if (!existingTx) detail.transactionsNew++;
        if (isPending) detail.transactionsPending++;
      }
    }

    // 3. Process removed transactions
    for (const rt of removedTxns) {
      if (rt.transaction_id) {
        await getDb()
          .update(transactions)
          .set({ deleted: true, updatedAt: new Date() })
          .where(and(eq(transactions.userId, dataUserId), eq(transactions.externalId, rt.transaction_id)));
      }
    }

    // 4. Run rules engine & AI categorization
    if (rawTxData.length > 0) {
      const syncedTxnsWithIds = await getDb()
        .select({
          id: transactions.id,
          externalId: transactions.externalId,
          categoryId: transactions.categoryId,
        })
        .from(transactions)
        .where(
          inArray(
            transactions.externalId,
            rawTxData.map((t) => t.externalId)
          )
        );

      const syncedWithPlaintext = syncedTxnsWithIds.map((dbTx) => {
        const raw = rawTxData.find((r) => r.externalId === dbTx.externalId);
        return {
          id: dbTx.id,
          description: raw?.description ?? '',
          payee: raw?.payee ?? null,
          memo: raw?.memo ?? null,
          amount: raw?.amount ?? '0',
          categoryId: dbTx.categoryId,
        };
      });

      const uncategorized = syncedWithPlaintext.filter((t) => !t.categoryId);
      if (syncedWithPlaintext.length > 0) {
        const ruleResults = await applyRulesToTransactions(syncedWithPlaintext, dataUserId, dek);

        for (const [txId, action] of ruleResults) {
          if (action.shouldUpdateCategory) {
            const updateData: Record<string, unknown> = { updatedAt: new Date() };
            if (action.categoryId) updateData.categoryId = action.categoryId;
            if (action.payee) {
              updateData.payee = await encryptField(action.payee, dek);
            }
            if (action.reviewed !== null) updateData.reviewed = action.reviewed;

            if (Object.keys(updateData).length > 1) {
              await getDb()
                .update(transactions)
                .set(updateData)
                .where(eq(transactions.id, txId));
            }
          }

          if (action.shouldUpdateTags) {
            if (action.overrideExisting) {
              await getDb()
                .delete(transactionTags)
                .where(eq(transactionTags.transactionId, txId));
            }
            if (action.setTagId) {
              await getDb()
                .insert(transactionTags)
                .values({ transactionId: txId, tagId: action.setTagId })
                .onConflictDoNothing();
            }
          }
        }
      }

      // Auto AI Analysis
      if (!dekOverride && uncategorized.length > 0) {
        try {
          const [settingsRow] = await getDb()
            .select()
            .from(userSettings)
            .where(eq(userSettings.userId, userId))
            .limit(1);

          if (settingsRow?.aiAutoAnalyze && settingsRow?.aiActiveProviderId) {
            analyzeUncategorized(userId).catch((err) => {
              logger.error(`${LOG_TAG} AI auto-categorization failed`, { error: String(err) });
            });
          }
        } catch {}
      }
    }

    // 5. Update Plaid connection state
    await getDb()
      .update(plaidConnections)
      .set({
        lastSyncAt: new Date(),
        lastSyncStatus: 'ok',
        lastSyncError: null,
        cursor: currentCursor,
      })
      .where(eq(plaidConnections.id, connectionId));

    const totalFetched = addedTxns.length + modifiedTxns.length;
    const detailsEncrypted = await encryptField(JSON.stringify(accountDetails), dek);

    // Update Sync Log
    await getDb()
      .update(syncLogs)
      .set({
        status: 'success',
        completedAt: new Date(),
        accountsSynced: String(accountsSynced),
        transactionsFetched: String(totalFetched),
        transactionsNew: String(transactionsNew),
        durationMs: String(Date.now() - log.startedAt.getTime()),
        details: detailsEncrypted,
      })
      .where(eq(syncLogs.id, log.id));

    // 6. Recalculate downstream calculations
    const today = new Date().toISOString().split('T')[0];
    await createNetWorthSnapshot(dataUserId, dek, today);
    await createAccountSnapshots(dataUserId, dek, today);

    // Historical snapshot generation
    // Generate synthetic snapshots covering the full transaction history pulled from Plaid.
    // No watermark — run the full two-pass reconstruction from earliestTx all the way to today.
    // The anchor is the real snapshot written by createAccountSnapshots() above (today's balance).
    for (const plaidAcc of plaidAccountsList) {
      const accountId = externalIdToAccountId.get(plaidAcc.account_id);
      if (!accountId) continue;

      const earliestTx = await getEarliestTransactionDate(accountId);
      if (!earliestTx) continue;

      const toDate = new Date();
      toDate.setDate(toDate.getDate() - 1);
      const toDateStr = toDate.toISOString().split('T')[0];

      if (earliestTx < toDateStr) {
        await generateHistoricalAccountSnapshots(
          accountId,
          dataUserId,
          earliestTx,
          toDateStr,
          dek
          // No watermarkDate — generate the full range so all years of history are covered
        );
      }
    }

    if (hasNewAccounts) {
      const { recalculateNetWorthSnapshots } = await import('@/lib/services/account-history');
      await recalculateNetWorthSnapshots(dataUserId, dek);
      logger.info(`${LOG_TAG} Recalculated net worth snapshots historically for new Plaid accounts`, { userId });
    }

    await updateMonthlyCashFlowSummaries(dataUserId, dek);
    await updateCategorySpendingSummaries(dataUserId, dek);
    await updateCategoryIncomeSummaries(dataUserId, dek);

    // Trigger custom cash flow alerts check
    const { checkCashFlowAlerts } = await import('@/lib/services/notifications');
    checkCashFlowAlerts(dataUserId, dek).catch((e) => {
      logger.error('[plaid-sync] Failed to check cash flow alerts:', e);
    });

    if (transactionsNew > 0 || transactionsUpdated > 0) {
      invalidateUserSearchCache(dataUserId);
    }

    logger.info(`${LOG_TAG} Plaid Sync completed successfully`, {
      connectionId,
      accountsSynced,
      transactionsFetched: totalFetched,
      transactionsNew,
    });

    return {
      status: 'success',
      accountsSynced,
      transactionsFetched: totalFetched,
      transactionsNew,
      transactionsUpdated,
      details: accountDetails,
      durationMs: Date.now() - startedAt,
    };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    logger.error(`${LOG_TAG} Plaid Sync failed`, { connectionId, error: errorMessage });

    await getDb()
      .update(syncLogs)
      .set({
        status: 'error',
        completedAt: new Date(),
        errorMessage,
        durationMs: String(Date.now() - log.startedAt.getTime()),
      })
      .where(eq(syncLogs.id, log.id));

    await getDb()
      .update(plaidConnections)
      .set({
        lastSyncStatus: 'error',
        lastSyncError: errorMessage,
      })
      .where(eq(plaidConnections.id, connectionId));

    return {
      status: 'error',
      accountsSynced: 0,
      transactionsFetched: 0,
      transactionsNew: 0,
      transactionsUpdated: 0,
      errorMessage,
      details: [],
      durationMs: Date.now() - startedAt,
    };
  }
}

function inferPlaidAccountType(type: string, subtype: string | null): string {
  const t = type.toLowerCase();
  const s = subtype?.toLowerCase() || '';
  if (s === 'checking') return 'checking';
  if (s === 'savings') return 'savings';
  if (s === 'hsa' || s === 'hsa checking') return 'hsachecking';
  if (t === 'depository') return 'checking';
  if (t === 'credit') return 'credit';
  if (s === 'mortgage') return 'mortgage';
  if (t === 'loan') return 'loan';
  if (t === 'investment') return 'investment';
  return 'other';
}
