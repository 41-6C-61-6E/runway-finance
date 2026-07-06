import { getDb } from '@/lib/db';
import { accounts, userSettings } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { decryptRows } from '@/lib/crypto';
import { convertCurrency, roundToCents } from '@/lib/services/account-history';
import { getBalancesOnDate, getEarliestBalances } from '@/lib/services/snapshot-balances';
import { isAssetAccount, isLiabilityAccount, isAccountActiveOnDate } from '@/lib/utils/account-scope';
import type { WealthFlowData, WealthFlowNode, WealthFlowAccountDetail } from '@/lib/types/financial';

interface AccountGroupConfig {
  label: string;
  incLabel: string;
  decLabel: string;
  incColor: string;
  decColor: string;
  description: string;
}

const GROUP_CONFIG: Record<string, AccountGroupConfig> = {
  cash: {
    label: 'Bank & Cash',
    incLabel: 'Cash Accumulated',
    decLabel: 'Cash Spent',
    incColor: '#10b981',
    decColor: '#ef4444',
    description: 'Net change in your checking, savings, and cash account balances. This could include income, transfers, interest, spending, and fees.',
  },
  investments: {
    label: 'Investments',
    incLabel: 'Portfolio Growth',
    decLabel: 'Portfolio Decline',
    incColor: '#8b5cf6',
    decColor: '#f59e0b',
    description: 'Net change in your investment, brokerage, and retirement account balances. This could include contributions, market gains, dividends, withdrawals, and losses.',
  },
  real_estate: {
    label: 'Real Estate',
    incLabel: 'Property Appreciation',
    decLabel: 'Property Depreciation',
    incColor: '#3b82f6',
    decColor: '#f97316',
    description: 'Net change in your real estate property values based on recorded snapshots.',
  },
  mortgage: {
    label: 'Mortgage',
    incLabel: 'Principal Paydown',
    decLabel: 'Mortgage Increase',
    incColor: '#06b6d4',
    decColor: '#ec4899',
    description: 'Net change in your mortgage balance. A decrease means you owe less. An increase could mean new borrowing or interest accrual.',
  },
  credit_loans: {
    label: 'Credit & Loans',
    incLabel: 'Debt Repayment',
    decLabel: 'New Borrowing',
    incColor: '#14b8a6',
    decColor: '#e11d48',
    description: 'Net change in your credit card and loan balances. A decrease means you paid down debt. An increase means new charges or loans.',
  },
  other_assets: {
    label: 'Other Assets',
    incLabel: 'Other Asset Growth',
    decLabel: 'Other Asset Decline',
    incColor: '#6366f1',
    decColor: '#a855f7',
    description: 'Net change in other asset values such as vehicles, personal property, and other tracked assets.',
  },
};

function getAccountGroup(type: string): string {
  const t = type.toLowerCase();
  if (['checking', 'savings', 'cash', 'hsachecking'].includes(t)) return 'cash';
  if (['investment', 'brokerage', 'retirement', 'rothira', 'traditionalira', '401k', '403b', 'sepira', 'simpleira', 'hsa', 'health', '529', 'crypto', 'metals', 'otherinvestment', 'otherInvestment'].includes(t)) return 'investments';
  if (['realestate', 'primaryhome', 'secondaryhome', 'rentalproperty', 'commercial', 'land', 'otherrealestate', 'single-family', 'condo', 'townhouse', 'multi-family'].includes(t)) return 'real_estate';
  if (t === 'mortgage') return 'mortgage';
  if (['credit', 'loan', 'studentloan', 'autoloan', 'otherloan', 'otherliability', 'otherLiability', 'personal_loan', 'heloc'].includes(t)) return 'credit_loans';
  if (['vehicle', 'other', 'otherasset', 'otherAsset'].includes(t) && isAssetAccount(t)) return 'other_assets';
  return isAssetAccount(t) ? 'other_assets' : 'credit_loans';
}

function getSignedNetWorthBalance(balance: number, accountType: string): number {
  return isLiabilityAccount(accountType) ? -Math.abs(balance) : balance;
}

export async function calculateWealthFlow(
  userId: string,
  startDateStr: string,
  endDateStr: string,
  dek: Uint8Array,
  filterAccountIds?: string[]
): Promise<WealthFlowData> {
  const db = getDb();

  const userSettingsList = await db
    .select()
    .from(userSettings)
    .where(eq(userSettings.userId, userId))
    .limit(1);
  const userSetting = userSettingsList[0];
  const baseCurrency = userSetting?.currency || 'USD';

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
        beginningNetWorth: 0,
        endingNetWorth: 0,
        netWorthChange: 0,
        percentChange: 0,
        baseCurrency,
        totalIncreases: 0,
        totalDecreases: 0,
      },
    };
  }

  const accountsMap = new Map<string, any>(
    reportableAccounts.map((a: any) => [a.id, a])
  );

  const dayBeforeDate = new Date(startDateStr + 'T00:00:00Z');
  dayBeforeDate.setUTCDate(dayBeforeDate.getUTCDate() - 1);
  const dayBeforeStr = dayBeforeDate.toISOString().split('T')[0];

  const beginningAccountIds = accountIdsToUse.filter((id) => {
    const acc = accountsMap.get(id);
    return acc ? isAccountActiveOnDate(acc, dayBeforeStr) : false;
  });
  const endingAccountIds = accountIdsToUse.filter((id) => {
    const acc = accountsMap.get(id);
    return acc ? isAccountActiveOnDate(acc, endDateStr) : false;
  });

  const beginningBalances = await getBalancesOnDate(db, userId, dayBeforeStr, beginningAccountIds, dek);
  const endingBalances = await getBalancesOnDate(db, userId, endDateStr, endingAccountIds, dek);

  const accountIdsWithEndButNoBeg = Object.keys(endingBalances).filter(id => !(id in beginningBalances));
  const earliestBalances = accountIdsWithEndButNoBeg.length > 0
    ? await getEarliestBalances(db, userId, accountIdsWithEndButNoBeg, dek)
    : {};

  let beginningNetWorth = 0;
  let endingNetWorth = 0;

  const accountDetails: WealthFlowAccountDetail[] = [];

  for (const id of accountIdsToUse) {
    const acc = accountsMap.get(id);
    if (!acc) continue;

    const hasBeg = id in beginningBalances;
    const hasEnd = id in endingBalances;

    if (!hasBeg && !hasEnd) continue;

    const beg = hasBeg
      ? convertCurrency(beginningBalances[id], acc.currency, baseCurrency)
      : id in earliestBalances
        ? convertCurrency(earliestBalances[id], acc.currency, baseCurrency)
        : 0;
    const end = hasEnd ? convertCurrency(endingBalances[id], acc.currency, baseCurrency) : 0;

    const rawDelta = end - beg;
    const signedBeg = getSignedNetWorthBalance(beg, acc.type);
    const signedEnd = getSignedNetWorthBalance(end, acc.type);
    const signedNWDelta = signedEnd - signedBeg;

    if (hasBeg) {
      beginningNetWorth += getSignedNetWorthBalance(beg, acc.type);
    }
    if (hasEnd) {
      endingNetWorth += getSignedNetWorthBalance(end, acc.type);
    }

    accountDetails.push({
      id,
      name: acc.name,
      type: acc.type,
      beginningBalance: roundToCents(beg),
      endingBalance: roundToCents(end),
      delta: roundToCents(rawDelta),
      signedNWDelta: roundToCents(signedNWDelta),
    });
  }

  const netWorthChange = roundToCents(endingNetWorth - beginningNetWorth);
  const percentChange = beginningNetWorth !== 0
    ? (netWorthChange / Math.abs(beginningNetWorth)) * 100
    : 0;

  const groupPositives = new Map<string, number>();
  const groupNegatives = new Map<string, number>();
  const groupAccountsPos = new Map<string, WealthFlowAccountDetail[]>();
  const groupAccountsNeg = new Map<string, WealthFlowAccountDetail[]>();

  for (const detail of accountDetails) {
    const group = getAccountGroup(detail.type);

    if (detail.signedNWDelta > 0.01) {
      groupPositives.set(group, (groupPositives.get(group) || 0) + detail.signedNWDelta);
      if (!groupAccountsPos.has(group)) groupAccountsPos.set(group, []);
      groupAccountsPos.get(group)!.push(detail);
    } else if (detail.signedNWDelta < -0.01) {
      const absVal = Math.abs(detail.signedNWDelta);
      groupNegatives.set(group, (groupNegatives.get(group) || 0) + absVal);
      if (!groupAccountsNeg.has(group)) groupAccountsNeg.set(group, []);
      groupAccountsNeg.get(group)!.push(detail);
    }
  }

  const nodes: WealthFlowNode[] = [];
  const links: Array<{ source: string; target: string; value: number }> = [];

  const totalIncreases = Array.from(groupPositives.values()).reduce((s, v) => s + v, 0);
  const totalDecreases = Array.from(groupNegatives.values()).reduce((s, v) => s + v, 0);

  for (const [group, value] of groupPositives) {
    const config = GROUP_CONFIG[group] || GROUP_CONFIG.other_assets;
    const incValue = roundToCents(value);
    if (incValue <= 0.01) continue;

    const incAccounts = groupAccountsPos.get(group) || [];
    const node: WealthFlowNode = {
      id: `inc_${group}`,
      label: config.incLabel,
      color: config.incColor,
      value: incValue,
      percentage: 0,
      type: 'increase',
      accountGroup: group,
      accounts: incAccounts,
      description: config.description,
    };
    nodes.push(node);
    links.push({ source: node.id, target: 'hub_net_worth_change', value: incValue });
  }

  for (const [group, value] of groupNegatives) {
    const config = GROUP_CONFIG[group] || GROUP_CONFIG.other_assets;
    const decValue = roundToCents(value);
    if (decValue <= 0.01) continue;

    const decAccounts = groupAccountsNeg.get(group) || [];
    const node: WealthFlowNode = {
      id: `dec_${group}`,
      label: config.decLabel,
      color: config.decColor,
      value: decValue,
      percentage: 0,
      type: 'decrease',
      accountGroup: group,
      accounts: decAccounts,
      description: config.description,
    };
    nodes.push(node);
    links.push({ source: 'hub_net_worth_change', target: node.id, value: decValue });
  }

  const hubValue = Math.max(totalIncreases, totalDecreases, Math.abs(netWorthChange)) || 0.01;
  const hubNode: WealthFlowNode = {
    id: 'hub_net_worth_change',
    label: netWorthChange >= 0 ? 'Net Worth Increase' : 'Net Worth Decrease',
    color: '#0ea5e9',
    value: roundToCents(hubValue),
    percentage: 100,
    type: 'hub',
    netWorthChange: roundToCents(netWorthChange),
    visualImbalance: roundToCents(totalIncreases - totalDecreases),
    description: 'The center of your wealth flow. All increases in net worth flow in from the left, and all decreases flow out to the right. The colored bar shows whether you built wealth (green, surplus) or drew it down (red, deficit).',
  };
  nodes.push(hubNode);

  const maxNodeValue = Math.max(...nodes.map(n => n.value), 1);
  for (const node of nodes) {
    node.percentage = (node.value / maxNodeValue) * 100;
  }

  const increaseNodes = nodes.filter(n => n.type === 'increase');
  const decreaseNodes = nodes.filter(n => n.type === 'decrease');
  const sortedNodes = [...increaseNodes, hubNode, ...decreaseNodes];

  return {
    nodes: sortedNodes,
    links,
    summary: {
      beginningNetWorth: roundToCents(beginningNetWorth),
      endingNetWorth: roundToCents(endingNetWorth),
      netWorthChange: roundToCents(netWorthChange),
      percentChange: roundToCents(percentChange),
      baseCurrency,
      totalIncreases: roundToCents(totalIncreases),
      totalDecreases: roundToCents(totalDecreases),
    },
  };
}
