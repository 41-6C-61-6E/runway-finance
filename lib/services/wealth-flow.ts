import { getDb } from '@/lib/db';
import { accountSnapshots, transactions, categories, accounts, userSettings } from '@/lib/db/schema';
import { eq, and, or, gte, lte, sql, inArray, isNull, ne } from 'drizzle-orm';
import { decryptField, decryptRows } from '@/lib/crypto';
import { convertCurrency, roundToCents } from '@/lib/services/account-history';
import { isAssetAccount, isInvestmentAccount, isLiabilityAccount } from '@/lib/utils/account-scope';

export interface WealthFlowNode {
  id: string;
  label: string;
  color: string;
  value: number;
  percentage: number;
  group?: string;
  isBalancingNode?: boolean;
  accounts?: Array<{ id: string; name: string; type?: string; delta: number }>;
  netWorthChange?: number;
  visualImbalance?: number;
  contributions?: number;
  marketGrowth?: number;
}

export interface WealthFlowData {
  nodes: WealthFlowNode[];
  links: Array<{
    source: string;
    target: string;
    value: number;
  }>;
  summary: {
    beginningNetWorth: number;
    endingNetWorth: number;
    netWorthChange: number;
    percentChange: number;
    reconciliationError: number;
    baseCurrency?: string;
    totalIncome: number;
    totalExpenses: number;
    totalMarketGains: number;
    totalMarketLosses: number;
    totalAdjustmentsIn?: number;
    totalAdjustmentsOut?: number;
    totalSavings: number;
    totalDrawdowns: number;
  };
  reconciliationDetails?: {
    leftSum: number;
    rightSum: number;
    gap: number;
    sources: Array<{ id: string; label: string; value: number; group: string }>;
    uses: Array<{ id: string; label: string; value: number; group: string }>;
  };
}

function classifyAccount(type: string): 'cash' | 'retirement' | 'brokerage' | 'realestate' | 'asset' | 'liability' {
  const t = type.toLowerCase();
  if (isLiabilityAccount(t)) {
    return 'liability';
  }
  if (['checking', 'savings', 'hsachecking'].includes(t)) {
    return 'cash';
  }
  if (['retirement', 'rothira', 'traditionalira', '401k', '403b', 'sepira', 'simpleira', 'hsa', 'health', '529'].includes(t)) {
    return 'retirement';
  }
  if (['investment', 'brokerage', 'otherinvestment', 'otherInvestment', 'crypto', 'metals'].includes(t)) {
    return 'brokerage';
  }
  if (['realestate', 'primaryhome', 'secondaryhome', 'rentalproperty', 'commercial', 'land', 'otherrealestate'].includes(t)) {
    return 'realestate';
  }
  return isAssetAccount(t) ? 'asset' : 'cash';
}

function getMortgageEndDate(acc: any): string | undefined {
  if (!acc.metadata) return undefined;
  try {
    const meta = typeof acc.metadata === 'string' ? JSON.parse(acc.metadata) : acc.metadata;
    if (meta) {
      const status = meta.mortgageStatus as string | undefined;
      if (status === 'paid_off') return meta.payoffDate as string | undefined;
      if (status === 'refinanced') return meta.refinanceDate as string | undefined;
    }
  } catch {}
  return undefined;
}

function getEffectiveBalance(
  balances: Record<string, number>,
  account: any,
  targetDate: string,
  baseCurrency: string
): number {
  const endEventDate = getMortgageEndDate(account);
  if (endEventDate) {
    const compTarget = targetDate.length === 7 ? `${targetDate}-31` : targetDate;
    if (compTarget >= endEventDate) {
      return 0;
    }
  }

  return convertCurrency(balances[account.id] ?? 0, account.currency, baseCurrency);
}

function getSignedNetWorthBalance(balance: number, accountType: string): number {
  return isLiabilityAccount(accountType) ? -Math.abs(balance) : balance;
}

async function getBalancesOnDate(
  db: any,
  userId: string,
  targetDate: string,
  accountIds: string[],
  dek: Uint8Array
): Promise<Record<string, number>> {
  if (accountIds.length === 0) return {};

  const latestDates = await db
    .select({
      accountId: accountSnapshots.accountId,
      maxDate: sql<string>`max(${accountSnapshots.snapshotDate})`,
    })
    .from(accountSnapshots)
    .where(and(
      eq(accountSnapshots.userId, userId),
      lte(accountSnapshots.snapshotDate, targetDate),
      inArray(accountSnapshots.accountId, accountIds)
    ))
    .groupBy(accountSnapshots.accountId);

  if (latestDates.length === 0) return {};

  const conditions = latestDates.map((ld: any) =>
    and(
      eq(accountSnapshots.accountId, ld.accountId),
      eq(accountSnapshots.snapshotDate, ld.maxDate)
    )
  );

  const snaps = await db
    .select({
      accountId: accountSnapshots.accountId,
      balance: accountSnapshots.balance,
    })
    .from(accountSnapshots)
    .where(and(
      eq(accountSnapshots.userId, userId),
      or(...conditions)
    ));

  const result: Record<string, number> = {};
  for (const s of snaps) {
    const decrypted = await decryptField(s.balance, dek);
    result[s.accountId] = parseFloat(decrypted) || 0;
  }
  return result;
}

export async function calculateWealthFlow(
  userId: string,
  startDateStr: string,
  endDateStr: string,
  dek: Uint8Array,
  filterAccountIds?: string[]
): Promise<WealthFlowData> {
  const db = getDb();

  // 0. Fetch user settings for base currency and data toggles
  const userSettingsList = await db
    .select()
    .from(userSettings)
    .where(eq(userSettings.userId, userId))
    .limit(1);
  const userSetting = userSettingsList[0];
  const baseCurrency = userSetting?.currency || 'USD';

  // 1. Load active, reportable accounts
  const allAccounts = await db
    .select()
    .from(accounts)
    .where(eq(accounts.userId, userId));

  const decryptedAccounts = await decryptRows('accounts', allAccounts, dek);

  const reportableAccounts = decryptedAccounts.filter(
    (a: any) => !a.isHidden && !a.isExcludedFromNetWorth
  );

  const accountIdsToUse = filterAccountIds && filterAccountIds.length > 0
    ? reportableAccounts.map((a: any) => a.id).filter((id: string) => filterAccountIds.includes(id))
    : reportableAccounts.map((a: any) => a.id);

  if (accountIdsToUse.length === 0) {
    return {
      nodes: [],
      links: [],
      summary: {
        beginningNetWorth: 0, endingNetWorth: 0, netWorthChange: 0, percentChange: 0,
        reconciliationError: 0, baseCurrency,
        totalIncome: 0, totalExpenses: 0, totalMarketGains: 0, totalMarketLosses: 0,
        totalSavings: 0, totalDrawdowns: 0,
      }
    };
  }

  const accountsMap = new Map<string, any>(
    reportableAccounts.map((a: any) => [a.id, a])
  );

  // 2. Resolve dates
  const dayBeforeDate = new Date(startDateStr + 'T00:00:00Z');
  dayBeforeDate.setUTCDate(dayBeforeDate.getUTCDate() - 1);
  const dayBeforeStr = dayBeforeDate.toISOString().split('T')[0];

  // Determine each account's earliest snapshot date across ALL time (not just the period).
  // An account is "new" within this period only if its earliest-ever snapshot falls within
  // the period. If it has any snapshot before the period start, its historical balance
  // already existed — we should use that as the true beginning balance rather than 0.
  const allEarliestSnapshots = await db
    .select({
      accountId: accountSnapshots.accountId,
      minDate: sql<string>`min(${accountSnapshots.snapshotDate})`,
    })
    .from(accountSnapshots)
    .where(and(
      eq(accountSnapshots.userId, userId),
      inArray(accountSnapshots.accountId, accountIdsToUse)
    ))
    .groupBy(accountSnapshots.accountId);

  const earliestSnapshotDateMap = new Map<string, string>();
  for (const s of allEarliestSnapshots) {
    if (s.minDate) earliestSnapshotDateMap.set(s.accountId, s.minDate);
  }

  // "New" = earliest snapshot is within the period (account had no prior history)
  const newAccountIds = accountIdsToUse.filter(id => {
    const earliest = earliestSnapshotDateMap.get(id);
    return !earliest || earliest >= startDateStr;
  });

  // For new accounts, fetch the balance at their earliest snapshot (their "opening" balance).
  // This is what gets routed to New Assets / New Liabilities in the Sankey.
  const newAccountInitBals = new Map<string, number>();
  if (newAccountIds.length > 0) {
    const conditions = newAccountIds
      .filter(id => earliestSnapshotDateMap.has(id))
      .map(id =>
        and(
          eq(accountSnapshots.accountId, id),
          eq(accountSnapshots.snapshotDate, earliestSnapshotDateMap.get(id)!)
        )
      );

    if (conditions.length > 0) {
      const initSnaps = await db
        .select({
          accountId: accountSnapshots.accountId,
          balance: accountSnapshots.balance,
        })
        .from(accountSnapshots)
        .where(and(
          eq(accountSnapshots.userId, userId),
          or(...conditions)
        ));
      for (const s of initSnaps) {
        const decrypted = await decryptField(s.balance, dek);
        newAccountInitBals.set(s.accountId, parseFloat(decrypted) || 0);
      }
    }
  }

  // 3. Fetch beginning and ending balances
  // For accounts with history before the period, getBalancesOnDate will find their
  // last snapshot <= dayBeforeStr as the true beginning. For genuinely new accounts
  // (no prior snapshot), it returns nothing and we use 0.
  const beginningBalances = await getBalancesOnDate(db, userId, dayBeforeStr, accountIdsToUse, dek);
  const endingBalances = await getBalancesOnDate(db, userId, endDateStr, accountIdsToUse, dek);

  // Calculate beginning and ending net worth
  let beginningNetWorth = 0;
  let endingNetWorth = 0;

  for (const id of accountIdsToUse) {
    const acc = accountsMap.get(id);
    if (!acc) continue;

    // For new accounts (no pre-period snapshot), beginning = 0.
    // For all others, use the actual last snapshot before the period start.
    const isNewAccount = newAccountIds.includes(id);
    const begConverted = isNewAccount ? 0 : getEffectiveBalance(beginningBalances, acc, dayBeforeStr, baseCurrency);
    const endConverted = getEffectiveBalance(endingBalances, acc, endDateStr, baseCurrency);

    beginningNetWorth += getSignedNetWorthBalance(begConverted, acc.type);
    endingNetWorth += getSignedNetWorthBalance(endConverted, acc.type);
  }

  const netWorthChange = endingNetWorth - beginningNetWorth;
  const percentChange = beginningNetWorth !== 0 ? (netWorthChange / Math.abs(beginningNetWorth)) * 100 : 0;

  // 4. Data toggles from settings
  const rawShowImported = userSetting?.showImportedData;
  const importSettings = {
    global: true,
    cashFlowProjections: true,
    ...(typeof rawShowImported === 'object' && rawShowImported !== null ? rawShowImported : {}),
  } as Record<string, boolean>;

  const isImportTransactionsEnabled = importSettings.global !== false && importSettings.cashFlowProjections !== false;
  const isPaystubEnabled = userSetting?.paystubEnabled ?? false;

  // 5. Query transactions in the range
  const conditions = [
    eq(transactions.userId, userId),
    gte(transactions.date, startDateStr),
    lte(transactions.date, endDateStr),
    eq(transactions.pending, false),
    eq(transactions.ignored, false),
    eq(transactions.deleted, false),
    eq(accounts.isHidden, false),
    eq(accounts.isExcludedFromNetWorth, false),
  ];
  if (!isImportTransactionsEnabled) {
    conditions.push(eq(transactions.isImported, false));
  }
  if (!isPaystubEnabled) {
    conditions.push(ne(transactions.source, 'paystub'));
  }
  let whereClause = and(...conditions);
  if (accountIdsToUse.length > 0) {
    whereClause = and(whereClause, inArray(transactions.accountId, accountIdsToUse));
  }

  const txRows = await db
    .select({
      id: transactions.id,
      accountId: transactions.accountId,
      amount: transactions.amount,
      date: transactions.date,
      categoryId: transactions.categoryId,
      categoryName: categories.name,
      categoryColor: categories.color,
      categoryType: categories.categoryType,
      isIncome: categories.isIncome,
      excludeFromReports: categories.excludeFromReports,
      parentId: categories.parentId,
      payee: transactions.payee,
    })
    .from(transactions)
    .innerJoin(accounts, eq(transactions.accountId, accounts.id))
    .leftJoin(categories, eq(transactions.categoryId, categories.id))
    .where(whereClause);

  const links: Array<{ source: string; target: string; value: number }> = [];
  const nodesMap = new Map<string, WealthFlowNode>();

  const addLink = (source: string, target: string, value: number) => {
    if (value <= 0.01) return;
    const existing = links.find(l => l.source === source && l.target === target);
    if (existing) {
      existing.value += value;
    } else {
      links.push({ source, target, value });
    }
  };

  const getOrCreateNode = (id: string, label: string, color: string, group: string) => {
    if (!nodesMap.has(id)) {
      nodesMap.set(id, { id, label, color, value: 0, percentage: 0, group });
    }
    return nodesMap.get(id)!;
  };

  // 1. Process Transactions directly to Category Nodes
  let totalIncome = 0;
  let totalExpenses = 0;
  const txSumByAccount = new Map<string, number>();
  
  // We will keep account breakdowns for each node
  const accountBreakdowns: Record<string, Array<{ id: string; name: string; type: string; beg: number; end: number; delta: number }>> = {};
  const addToBreakdown = (nodeId: string, accId: string, accName: string, accType: string, beg: number, end: number, delta: number) => {
    if (!accountBreakdowns[nodeId]) accountBreakdowns[nodeId] = [];
    const existing = accountBreakdowns[nodeId].find(a => a.id === accId);
    if (existing) {
      existing.beg = roundToCents(existing.beg + beg);
      existing.end = roundToCents(existing.end + end);
      existing.delta = roundToCents(existing.delta + delta);
    } else {
      accountBreakdowns[nodeId].push({ id: accId, name: accName, type: accType, beg: roundToCents(beg), end: roundToCents(end), delta: roundToCents(delta) });
    }
  };

  const addFlowAmount = (
    nodeId: string,
    label: string,
    color: string,
    group: string,
    amount: number,
    acc: any
  ) => {
    if (Math.abs(amount) <= 0.01) return;

    const node = getOrCreateNode(nodeId, label, color, group);
    node.value = roundToCents(node.value + amount);
    addToBreakdown(nodeId, acc.id, acc.name, acc.type, 0, 0, amount);
  };

  for (const row of txRows) {
    const acc = accountsMap.get(row.accountId);
    if (!acc) continue;

    const plainAmountStr = await decryptField(row.amount, dek);
    const amountVal = parseFloat(plainAmountStr) || 0;
    const amountUSD = convertCurrency(amountVal, acc.currency, baseCurrency);

    // Group transactions by account
    txSumByAccount.set(row.accountId, (txSumByAccount.get(row.accountId) || 0) + amountUSD);

    const isExcluded = row.excludeFromReports === true;
    if (isExcluded) continue;

    if (row.categoryType === 'transfer') {
      // Transfers are completely excluded from the direct flow (they cancel out and don't change net worth)
      continue;
    } else if (row.categoryType === 'compound') {
      const absAmount = Math.abs(amountUSD);
      totalIncome += absAmount;
      totalExpenses += absAmount;

      const catId = row.categoryId ? `inc_${row.categoryId}` : 'inc_uncategorized_tx';
      const catName = row.categoryId ? (row.categoryName ? await decryptField(row.categoryName, dek) : 'Uncategorized Income') : 'Uncategorized Income';
      const catColor = row.categoryColor || '#10b981';

      addFlowAmount(catId, catName, catColor, 'income', absAmount, acc);
      addFlowAmount('exp_expenses', 'Expenses', '#f43f5e', 'expense', absAmount, acc);
    } else {
      const absAmount = Math.abs(amountUSD);

      if (amountUSD > 0) {
        if (row.isIncome) {
          totalIncome += amountUSD;
          const catId = row.categoryId ? `inc_${row.categoryId}` : 'inc_uncategorized_tx';
          const catName = row.categoryId ? (row.categoryName ? await decryptField(row.categoryName, dek) : 'Uncategorized Income') : 'Uncategorized Income';
          const catColor = row.categoryColor || '#10b981';
          addFlowAmount(catId, catName, catColor, 'income', amountUSD, acc);
        } else {
          totalExpenses = roundToCents(totalExpenses - amountUSD);
          addFlowAmount('exp_expenses', 'Expenses', '#f43f5e', 'expense', -amountUSD, acc);
        }
      } else if (amountUSD < 0) {
        if (row.isIncome) {
          totalIncome = roundToCents(totalIncome - absAmount);
          const catId = row.categoryId ? `inc_${row.categoryId}` : 'inc_uncategorized_tx';
          const catName = row.categoryId ? (row.categoryName ? await decryptField(row.categoryName, dek) : 'Uncategorized Income') : 'Uncategorized Income';
          const catColor = row.categoryColor || '#10b981';
          addFlowAmount(catId, catName, catColor, 'income', -absAmount, acc);
        } else {
          totalExpenses += absAmount;
          addFlowAmount('exp_expenses', 'Expenses', '#f43f5e', 'expense', absAmount, acc);
        }
      }
    }
  }

  for (const [id, node] of Array.from(nodesMap.entries())) {
    if (node.value <= 0.01) {
      nodesMap.delete(id);
    }
  }

  // 2. Process Snapshots & Gaps
  let totalMarketGains = 0;
  let totalMarketLosses = 0;
  let totalMortgageReduction = 0;

  for (const accId of accountIdsToUse) {
    const acc = accountsMap.get(accId);
    if (!acc) continue;

    const isNewAccount = newAccountIds.includes(accId);
    const initValRaw = newAccountInitBals.get(accId) || 0;
    const initValUSD = convertCurrency(initValRaw, acc.currency, baseCurrency);
    const signedInitVal = getSignedNetWorthBalance(initValUSD, acc.type);

    const begUSD = isNewAccount ? 0 : getEffectiveBalance(beginningBalances, acc, dayBeforeStr, baseCurrency);
    const endUSD = getEffectiveBalance(endingBalances, acc, endDateStr, baseCurrency);

    const isLiab = isLiabilityAccount(acc.type);
    const signedBeg = getSignedNetWorthBalance(begUSD, acc.type);
    const signedEnd = getSignedNetWorthBalance(endUSD, acc.type);
    const actualDeltaUSD = signedEnd - signedBeg;

    const txSum = txSumByAccount.get(accId) || 0;
    const liabilityUsesNegativeBalances = isLiab && (begUSD < 0 || endUSD < 0);
    const effectiveTxSum = isLiab && !liabilityUsesNegativeBalances ? -txSum : txSum;

    const gap = roundToCents(actualDeltaUSD - effectiveTxSum - (isNewAccount ? signedInitVal : 0));

    if (isNewAccount) {
      if (!isLiab) {
        const nodeId = 'inc_new_accounts';
        const node = getOrCreateNode(nodeId, 'New Assets', '#10b981', 'new_accounts');
        node.value = roundToCents(node.value + signedInitVal);
        addToBreakdown(nodeId, accId, acc.name, acc.type, 0, signedEnd, signedInitVal);
      } else {
        const absVal = Math.abs(signedInitVal);
        const nodeId = 'exp_new_accounts';
        const node = getOrCreateNode(nodeId, 'New Liabilities', '#ef4444', 'new_accounts');
        node.value = roundToCents(node.value + absVal);
        addToBreakdown(nodeId, accId, acc.name, acc.type, 0, signedEnd, -absVal);
      }
    }

    if (acc.type.toLowerCase() === 'mortgage' && gap > 0) {
      totalMortgageReduction += gap;

      const incNodeId = 'inc_mortgage_reduction';
      const incNode = getOrCreateNode(incNodeId, 'Mortgage Liability Reduction', '#10b981', 'mortgage');
      incNode.value = roundToCents(incNode.value + gap);
      addToBreakdown(incNodeId, accId, acc.name, acc.type, signedBeg, signedEnd, gap);

      const expNodeId = 'exp_mortgage_payment';
      const expNode = getOrCreateNode(expNodeId, 'Mortgage Payment', '#f43f5e', 'mortgage');
      expNode.value = roundToCents(expNode.value + gap);
      addToBreakdown(expNodeId, accId, acc.name, acc.type, signedBeg, signedEnd, gap);
    } else if (Math.abs(gap) > 0.01) {
      const accountClass = classifyAccount(acc.type);
      const isInvest = accountClass === 'brokerage' || accountClass === 'realestate' || accountClass === 'retirement';

      if (gap > 0) {
        if (isInvest) {
          totalMarketGains += gap;
          if (accountClass === 'realestate') {
            const nodeId = 'inc_real_estate_appreciation';
            const node = getOrCreateNode(nodeId, 'Real Estate Appreciation', '#8b5cf6', 'market');
            node.value = roundToCents(node.value + gap);
            addToBreakdown(nodeId, accId, acc.name, acc.type, signedBeg, signedEnd, gap);
          } else {
            const nodeId = 'inc_market_gains';
            const node = getOrCreateNode(nodeId, 'Market Gains', '#10b981', 'market');
            node.value = roundToCents(node.value + gap);
            addToBreakdown(nodeId, accId, acc.name, acc.type, signedBeg, signedEnd, gap);
          }
        } else {
          const nodeId = 'inc_balance_adjustments';
          const node = getOrCreateNode(nodeId, 'Cash & Liability Adjustments', '#64748b', 'unaccounted');
          node.value = roundToCents(node.value + gap);
          addToBreakdown(nodeId, accId, acc.name, acc.type, signedBeg, signedEnd, gap);
        }
      } else {
        const absGap = Math.abs(gap);
        if (isInvest) {
          totalMarketLosses += absGap;
          if (accountClass === 'realestate') {
            const nodeId = 'exp_real_estate_depreciation';
            const node = getOrCreateNode(nodeId, 'Real Estate Depreciation', '#f43f5e', 'market');
            node.value = roundToCents(node.value + absGap);
            addToBreakdown(nodeId, accId, acc.name, acc.type, signedBeg, signedEnd, -absGap);
          } else {
            const nodeId = 'exp_market_losses';
            const node = getOrCreateNode(nodeId, 'Market Losses', '#ef4444', 'market');
            node.value = roundToCents(node.value + absGap);
            addToBreakdown(nodeId, accId, acc.name, acc.type, signedBeg, signedEnd, -absGap);
          }
        } else {
          const nodeId = 'exp_balance_adjustments';
          const node = getOrCreateNode(nodeId, 'Cash & Liability Adjustments', '#64748b', 'unaccounted');
          node.value = roundToCents(node.value + absGap);
          addToBreakdown(nodeId, accId, acc.name, acc.type, signedBeg, signedEnd, -absGap);
        }
      }
    }
  }

  // Deduct mortgage principal payments from Category Expenses to avoid double counting
  let mortgageDeductionRemaining = totalMortgageReduction;
  if (mortgageDeductionRemaining > 0) {
    const expensesNode = nodesMap.get('exp_expenses');
    if (expensesNode) {
      const deduct = Math.min(expensesNode.value, mortgageDeductionRemaining);
      expensesNode.value = roundToCents(expensesNode.value - deduct);
      totalExpenses = roundToCents(totalExpenses - deduct);
      mortgageDeductionRemaining = roundToCents(mortgageDeductionRemaining - deduct);
    }
    if (mortgageDeductionRemaining > 0) {
      const adjNode = nodesMap.get('exp_balance_adjustments');
      if (adjNode) {
        const deduct = Math.min(adjNode.value, mortgageDeductionRemaining);
        adjNode.value = roundToCents(adjNode.value - deduct);
        mortgageDeductionRemaining = roundToCents(mortgageDeductionRemaining - deduct);
      }
    }
  }

  // Clean up any nodes with value <= 0.01 after deductions
  for (const [id, node] of Array.from(nodesMap.entries())) {
    if (node.value <= 0.01) {
      nodesMap.delete(id);
    }
  }

  // 3. Construct the central hub and let net worth change appear as imbalance.
  const hubId = 'hub_net_worth_change';
  const hubColor = netWorthChange >= 0 ? '#0ea5e9' : '#ef4444';
  const hubNode = getOrCreateNode(
    hubId,
    netWorthChange >= 0 ? 'Net Worth Increase' : 'Net Worth Decrease',
    hubColor,
    'hub'
  );
  hubNode.netWorthChange = roundToCents(netWorthChange);

  // Link Inflows/Gains to the Hub
  const inflowNodes = Array.from(nodesMap.values()).filter(n => n.id.startsWith('inc_'));
  for (const node of inflowNodes) {
    addLink(node.id, hubId, node.value);
  }

  // Link the Hub to Outflows/Destinations
  const outflowNodes = Array.from(nodesMap.values()).filter(n => n.id.startsWith('exp_'));
  for (const node of outflowNodes) {
    addLink(hubId, node.id, node.value);
  }

  // Define Hub value as the max of total inflows or outflows
  const totalInflowsSum = roundToCents(inflowNodes.reduce((s, n) => s + n.value, 0));
  const totalOutflowsSum = roundToCents(outflowNodes.reduce((s, n) => s + n.value, 0));
  hubNode.value = roundToCents(Math.max(totalInflowsSum, totalOutflowsSum)) || 0.01;
  hubNode.visualImbalance = roundToCents(totalInflowsSum - totalOutflowsSum);

  // Set node percentages based on maximum value in the chart
  const maxNodeValue = Math.max(...Array.from(nodesMap.values()).map(n => n.value)) || 1;
  for (const node of Array.from(nodesMap.values())) {
    node.percentage = (node.value / maxNodeValue) * 100;
    node.accounts = accountBreakdowns[node.id];
  }

  // Ensure nodes are sorted correctly for rendering: Sources, Hub, Destinations
  const sources = Array.from(nodesMap.values()).filter(n => n.id.startsWith('inc_'));
  const hub = [hubNode];
  const destinations = Array.from(nodesMap.values()).filter(n => n.id.startsWith('exp_'));

  const finalNodes = [...sources, ...hub, ...destinations];
  const roundedNetWorthChange = roundToCents(netWorthChange);

  // Calculate detailed adjustments sums for the Net Worth Drivers section
  let totalAdjustmentsIn = 0;
  let totalAdjustmentsOut = 0;
  for (const node of Array.from(nodesMap.values())) {
    if (node.id.startsWith('inc_')) {
      if (node.group === 'unaccounted' || node.group === 'new_accounts' || node.group === 'mortgage') {
        totalAdjustmentsIn += node.value;
      }
    } else if (node.id.startsWith('exp_')) {
      if (node.group === 'unaccounted' || node.group === 'new_accounts' || node.group === 'mortgage') {
        totalAdjustmentsOut += node.value;
      }
    }
  }

  return {
    nodes: finalNodes,
    links,
    summary: {
      beginningNetWorth: roundToCents(beginningNetWorth),
      endingNetWorth: roundToCents(endingNetWorth),
      netWorthChange: roundToCents(netWorthChange),
      percentChange,
      reconciliationError: 0,
      baseCurrency,
      totalIncome: roundToCents(totalIncome),
      totalExpenses: roundToCents(totalExpenses),
      totalMarketGains: roundToCents(totalMarketGains),
      totalMarketLosses: roundToCents(totalMarketLosses),
      totalAdjustmentsIn: roundToCents(totalAdjustmentsIn),
      totalAdjustmentsOut: roundToCents(totalAdjustmentsOut),
      totalSavings: roundedNetWorthChange > 0 ? roundedNetWorthChange : 0,
      totalDrawdowns: roundedNetWorthChange < 0 ? Math.abs(roundedNetWorthChange) : 0,
    }
  };
}
