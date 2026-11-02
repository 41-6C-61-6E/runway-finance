import { getTypesByGroup } from '@/lib/constants/account-types';
import { computeNextSync as baseComputeNextSync } from './sync-intervals';

export type AssetSubType = string;

export function computeNextSync(syncFrequency: string, balanceDate: string | null): Date | null {
  return baseComputeNextSync(syncFrequency, balanceDate, { fallbackNowIfMissingDate: true });
}

export type ManualAccount = {
  id: string;
  name: string;
  type: string;
  balance: string;
  currency: string;
  syncFrequency: string;
  metadata?: Record<string, any> | null;
  isHidden?: boolean;
  isExcludedFromNetWorth?: boolean;
  lastSyncedAt?: string | null;
  balanceDate: string | null;
  connectionId?: string | null;
  tags?: { id: string; name: string; color: string }[];
};

export const ASSET_TYPE_LABELS: Record<string, string> = {
  realestate: 'Real Estate',
  vehicle: 'Vehicle',
  crypto: 'Bitcoin',
  gold: 'Gold',
  silver: 'Silver',
  otherAsset: 'Other Asset',
  mortgage: 'Mortgage',
  cash: 'Cash',
};

export const PROPERTY_TYPES = [
  { value: 'single-family', label: 'Single Family Home' },
  { value: 'condo', label: 'Condo' },
  { value: 'townhouse', label: 'Townhouse' },
  { value: 'multi-family', label: 'Multi-Family' },
  { value: 'land', label: 'Land' },
  { value: 'commercial', label: 'Commercial' },
  { value: 'other', label: 'Other' },
] as const;

export const SYNC_FREQUENCY_LABELS: Record<string, string> = {
  manual: 'Manual',
  daily: 'Daily',
  weekly: 'Weekly',
  monthly: 'Monthly',
};

export const SYNC_FREQ_COLORS: Record<string, string> = {
  manual: 'text-muted-foreground',
  daily: 'text-chart-1',
  weekly: 'text-chart-3',
  monthly: 'text-chart-4',
};

export const ASSET_TYPE_ICONS: Record<string, string> = {
  checking: '🏦',
  savings: '🏦',
  other: '🏦',
  credit: '💳',
  investment: '📈',
  brokerage: '📈',
  retirement: '📈',
  otherinvestment: '📈',
  rothira: '📈',
  traditionalira: '📈',
  '401k': '📈',
  '403b': '📈',
  sepira: '📈',
  simpleira: '📈',
  '529': '📈',
  otherAsset: '📦',
  hsa: '🏥',
  hsachecking: '🏥',
  health: '🏥',
  loan: '📋',
  mortgage: '📋',
  realestate: '🏠',
  primaryhome: '🏠',
  secondaryhome: '🏠',
  rentalproperty: '🏠',
  commercial: '🏢',
  land: '🌳',
  otherrealestate: '🏠',
  otherLiability: '⚠️',
  vehicle: '🚗',
  crypto: '₿',
  gold: '🥇',
  silver: '🥈',
  cash: '💵',
};

export const REAL_ESTATE_TYPES = [
  'realestate', 'primaryhome', 'secondaryhome', 'rentalproperty', 'commercial', 'land', 'otherrealestate',
  'single-family', 'condo', 'townhouse', 'multi-family'
];

export const ACCOUNT_TYPE_MAP: Record<string, string> = {
  realestate: 'realestate',
  vehicle: 'vehicle',
  crypto: 'crypto',
  gold: 'metals',
  silver: 'metals',
  otherAsset: 'otherAsset',
  mortgage: 'mortgage',
  cash: 'cash',
};

export function getAccountIcon(account: ManualAccount): string {
  if (account.type === 'metals') {
    const meta = account.metadata ?? {};
    const subType = (meta as Record<string, string>).subType ?? 'gold';
    return ASSET_TYPE_ICONS[subType] ?? '🥇';
  }
  return ASSET_TYPE_ICONS[account.type] ?? '📦';
}

export const getGroupedOptions = () => {
  const groups = getTypesByGroup();
  return groups.map(g => {
    let types = [...g.types];
    if (g.group === 'Assets') {
      types = types.flatMap(t => {
        if (t.value === 'metals') {
          return [
            { value: 'gold', label: 'Gold (Metal)' },
            { value: 'silver', label: 'Silver (Metal)' }
          ];
        }
        return t;
      });
    }
    if (g.group === 'Banking') {
      types.push({ value: 'cash', label: 'Cash (Manual)' });
    }
    return { ...g, types };
  });
};

export function getSubTypeLabel(account: ManualAccount): string {
  if (account.type === 'metals') {
    const meta = account.metadata ?? {};
    const subType = (meta as Record<string, string>).subType ?? 'gold';
    return ASSET_TYPE_LABELS[subType] ?? 'Metals';
  }
  for (const [key, val] of Object.entries(ASSET_TYPE_LABELS)) {
    if (ACCOUNT_TYPE_MAP[key] === account.type) return val;
  }
  return ASSET_TYPE_LABELS[account.type] ?? account.type;
}
