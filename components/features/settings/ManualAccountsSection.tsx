'use client';

import { useState, useEffect, useCallback } from 'react';
import { Input } from '@/components/ui/input';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetFooter, SheetClose } from '@/components/ui/sheet';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { MortgageAttributesForm } from '@/components/features/mortgages/mortgage-attributes-form';
import { getTypesByGroup, ACCOUNT_TYPE_LABELS, TYPE_HIERARCHY } from '@/lib/constants/account-types';
import { isLiabilityAccount } from '@/lib/utils/account-scope';

type ManualAccount = {
  id: string;
  name: string;
  type: string;
  balance: string;
  currency: string;
  metadata: Record<string, unknown> | null;
  isHidden: boolean;
  isExcludedFromNetWorth: boolean;
  balanceDate: string | null;
  connectionId?: string | null;
  tags?: { id: string; name: string; color: string }[];
};

type AssetSubType = string;

const ASSET_TYPE_LABELS: Record<string, string> = {
  realestate: 'Real Estate',
  vehicle: 'Vehicle',
  crypto: 'Bitcoin',
  gold: 'Gold',
  silver: 'Silver',
  otherAsset: 'Other Asset',
  mortgage: 'Mortgage',
  cash: 'Cash',
};

const PROPERTY_TYPES = [
  { value: 'single-family', label: 'Single Family Home' },
  { value: 'condo', label: 'Condo' },
  { value: 'townhouse', label: 'Townhouse' },
  { value: 'multi-family', label: 'Multi-Family' },
  { value: 'land', label: 'Land' },
  { value: 'commercial', label: 'Commercial' },
  { value: 'other', label: 'Other' },
] as const;

const SYNC_FREQUENCIES = [
  { value: 'manual', label: 'Manual only' },
  { value: 'daily', label: 'Daily' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' },
] as const;

const SYNC_INTERVALS: Record<string, number> = {
  manual: 0,
  daily: 24 * 60 * 60 * 1000,
  weekly: 7 * 24 * 60 * 60 * 1000,
  monthly: 30 * 24 * 60 * 60 * 1000,
};

function computeNextSync(syncFrequency: string, balanceDate: string | null): Date | null {
  if (syncFrequency === 'manual') return null;
  const interval = SYNC_INTERVALS[syncFrequency];
  if (!interval) return null;
  if (!balanceDate) return new Date();
  return new Date(new Date(balanceDate).getTime() + interval);
}

const SYNC_FREQUENCY_LABELS: Record<string, string> = {
  manual: 'Manual',
  daily: 'Daily',
  weekly: 'Weekly',
  monthly: 'Monthly',
};

const SYNC_FREQ_COLORS: Record<string, string> = {
  manual: 'text-muted-foreground',
  daily: 'text-chart-1',
  weekly: 'text-chart-3',
  monthly: 'text-chart-4',
};

const ASSET_TYPE_ICONS: Record<string, string> = {
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

const REAL_ESTATE_TYPES = [
  'realestate', 'primaryhome', 'secondaryhome', 'rentalproperty', 'commercial', 'land', 'otherrealestate',
  'single-family', 'condo', 'townhouse', 'multi-family'
];

function getAccountIcon(account: ManualAccount): string {
  if (account.type === 'metals') {
    const meta = account.metadata ?? {};
    const subType = (meta as Record<string, string>).subType ?? 'gold';
    return ASSET_TYPE_ICONS[subType] ?? '🥇';
  }
  return ASSET_TYPE_ICONS[account.type] ?? '📦';
}

function getBadgeClasses(type: string): string {
  const lowerType = type.toLowerCase();
  if (lowerType === 'vehicle') return 'bg-chart-4 text-white';
  if (lowerType === 'metals') return 'bg-chart-1 text-white';
  
  const hierarchy = TYPE_HIERARCHY[lowerType];
  const group = hierarchy?.group ?? 'Other';
  
  switch (group) {
    case 'Banking':
    case 'Assets':
      return 'bg-status-positive text-white';
    case 'Credit':
    case 'Loans':
    case 'Liabilities':
      return 'bg-destructive text-white';
    case 'Investments':
      return 'bg-chart-1 text-white';
    case 'Real Estate':
      return 'bg-chart-3 text-white';
    default:
      return 'bg-muted text-muted-foreground';
  }
}

const getGroupedOptions = () => {
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

function getSubTypeLabel(account: ManualAccount): string {
  if (account.type === 'metals') {
    const meta = account.metadata ?? {};
    const subType = (meta as Record<string, string>).subType ?? 'gold';
    return ASSET_TYPE_LABELS[subType] ?? 'Metals';
  }
  for (const [key, val] of Object.entries(ASSET_TYPE_LABELS)) {
    if (ACCOUNT_TYPE_MAP[key] === account.type) return val;
  }
  return ACCOUNT_TYPE_LABELS[account.type] ?? account.type;
}

const ACCOUNT_TYPE_MAP: Record<string, string> = {
  realestate: 'realestate',
  vehicle: 'vehicle',
  crypto: 'crypto',
  gold: 'metals',
  silver: 'metals',
  otherAsset: 'otherAsset',
  mortgage: 'mortgage',
  cash: 'cash',
};

const formatCurrency = (balance: string, currency: string) => {
  const num = parseFloat(balance);
  const isPositive = num >= 0;
  return {
    text: new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency || 'USD',
      minimumFractionDigits: 2,
    }).format(Math.abs(num)),
    sign: isPositive ? '' : '-',
  };
};

const formatRelativeTime = (date: string | null) => {
  if (!date) return 'Never';
  const diff = Date.now() - new Date(date).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
};

const formatTimeUntil = (date: Date): string => {
  const diff = date.getTime() - Date.now();
  if (diff <= 0) return 'Overdue';
  const mins = Math.ceil(diff / 60000);
  if (mins < 60) return `in ${mins}m`;
  const hours = Math.floor(diff / 3600000);
  if (hours < 24) return `in ${hours}h`;
  const days = Math.floor(hours / 24);
  return `in ${days}d`;
};

export default function ManualAccountsSection() {
  const [accounts, setAccounts] = useState<ManualAccount[]>([]);
  const [realEstateAccounts, setRealEstateAccounts] = useState<ManualAccount[]>([]);
  const [allMortgageAccounts, setAllMortgageAccounts] = useState<ManualAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [showCreate, setShowCreate] = useState(false);
  const [createType, setCreateType] = useState<AssetSubType>('realestate');
  const [createName, setCreateName] = useState('');
  const [createInitialValue, setCreateInitialValue] = useState('');
  const [createMeta, setCreateMeta] = useState<Record<string, string>>({});
  const [createLoading, setCreateLoading] = useState(false);

  const [syncingId, setSyncingId] = useState<string | null>(null);
  const [syncResult, setSyncResult] = useState<{ status: string; newBalance: string; oldBalance: string; changed: boolean; errorMessage?: string } | null>(null);

  const [adjustAccount, setAdjustAccount] = useState<ManualAccount | null>(null);
  const [adjustValue, setAdjustValue] = useState('');
  const [adjustDate, setAdjustDate] = useState('');
  const [adjustNote, setAdjustNote] = useState('');
  const [adjustLoading, setAdjustLoading] = useState(false);

  const [deleteAccount, setDeleteAccount] = useState<ManualAccount | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  const [editAccount, setEditAccount] = useState<ManualAccount | null>(null);
  const [editName, setEditName] = useState('');
  const [editMeta, setEditMeta] = useState<Record<string, string>>({});
  const [editLoading, setEditLoading] = useState(false);

  // Tags state
  const [tagIds, setTagIds] = useState<string[]>([]);
  const [allTags, setAllTags] = useState<any[]>([]);
  const [tagSearch, setTagSearch] = useState('');
  const [showTagDropdown, setShowTagDropdown] = useState(false);
  const [showEditTagDropdown, setShowEditTagDropdown] = useState(false);

  const fetchAccounts = useCallback(async () => {
    try {
      const [res, reRes, mRes, tRes] = await Promise.all([
        fetch('/api/manual-accounts', { credentials: 'include' }),
        fetch('/api/accounts?type=realestate', { credentials: 'include' }),
        fetch('/api/accounts?type=mortgage', { credentials: 'include' }),
        fetch('/api/tags', { credentials: 'include' }),
      ]);
      const manualData = await res.json();
      const mortgageData = mRes.ok ? await mRes.json() : [];
      const tagsData = tRes.ok ? await tRes.json() : [];
      
      setAccounts(Array.isArray(manualData) ? manualData : []);
      if (reRes.ok) setRealEstateAccounts(await reRes.json());
      if (mRes.ok) setAllMortgageAccounts(Array.isArray(mortgageData) ? mortgageData : []);
      setAllTags(Array.isArray(tagsData) ? tagsData : []);
    } catch {
      setAccounts([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAccounts();
  }, [fetchAccounts]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreateLoading(true);
    setError('');
    try {
      const metadata: Record<string, unknown> = { ...createMeta };
      if (createType === 'vehicle') {
        metadata.make = createMeta.make || '';
        metadata.model = createMeta.model || '';
        if (createMeta.year) {
          metadata.year = parseInt(createMeta.year, 10);
        }
        if (createMeta.purchasePrice) metadata.purchasePrice = parseFloat(createMeta.purchasePrice);
        if (createMeta.purchaseDate) metadata.purchaseDate = createMeta.purchaseDate;
      }
      if (createType === 'gold' || createType === 'silver') {
        metadata.subType = createType;
        metadata.amountOz = parseFloat(createMeta.amountOz || '0');
        if (createMeta.purchaseDate) metadata.purchaseDate = createMeta.purchaseDate;
      }
      if (REAL_ESTATE_TYPES.includes(createType)) {
        metadata.propertyId = createMeta.propertyId || '';
        if (createMeta.propertyType) metadata.propertyType = createMeta.propertyType;
        if (createMeta.purchasePrice) metadata.purchasePrice = parseFloat(createMeta.purchasePrice);
        if (createMeta.purchaseDate) metadata.purchaseDate = createMeta.purchaseDate;
        if (createMeta.zipCode) metadata.zipCode = createMeta.zipCode;
        if (createInitialValue) metadata.initialValue = parseFloat(createInitialValue) || 0;
        if (createMeta.linkedMortgageId) {
          metadata.mortgageAccountIds = [createMeta.linkedMortgageId];
        }
      }
      if (createType === 'mortgage') {
        metadata.originalLoanAmount = parseFloat(createMeta.originalLoanAmount || '0');
        metadata.interestRate = parseFloat(createMeta.interestRate || '0');
        metadata.termMonths = parseInt(createMeta.termMonths || '360', 10);
        metadata.monthlyPayment = parseFloat(createMeta.monthlyPayment || '0');
        metadata.escrowAmount = parseFloat(createMeta.escrowAmount || '0');
        metadata.extraPrincipal = parseFloat(createMeta.extraPrincipal || '0');
        metadata.pmi = parseFloat(createMeta.pmi || '0');
        metadata.escrow = parseFloat(createMeta.escrow || '0');
        if (createMeta.purchaseDate) metadata.purchaseDate = createMeta.purchaseDate;
        if (createMeta.linkedPropertyId) {
          metadata.linkedPropertyId = createMeta.linkedPropertyId;
        }
        metadata.mortgageStatus = createMeta.mortgageStatus || 'active';
        if (createMeta.mortgageStatus === 'paid_off') {
          metadata.payoffDate = createMeta.payoffDate;
        } else if (createMeta.mortgageStatus === 'refinanced') {
          metadata.refinanceDate = createMeta.refinanceDate;
          metadata.payoffBalance = parseFloat(createMeta.payoffBalance || '0');
          metadata.refinancedByLoanId = createMeta.refinancedByLoanId || '';
        }
      }
      if (['loan', 'studentloan', 'autoloan', 'otherloan'].includes(createType)) {
        if (createMeta.originalLoanAmount) metadata.originalLoanAmount = parseFloat(createMeta.originalLoanAmount);
        if (createMeta.purchaseDate) metadata.purchaseDate = createMeta.purchaseDate;
      }
      if (createType === 'crypto') {
        metadata.xpub = createMeta.xpub || '';
      }
      if (createType === 'otherAsset') {
        metadata.description = createMeta.description || '';
      }
      if ([...REAL_ESTATE_TYPES, 'crypto', 'gold', 'silver'].includes(createType)) {
        metadata.syncFrequency = createMeta.syncFrequency || 'manual';
      }

      const res = await fetch('/api/manual-accounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          name: createName,
          type: createType,
          metadata,
          initialValue: (createType === 'mortgage' && ['paid_off', 'refinanced'].includes(createMeta.mortgageStatus))
            ? 0
            : (parseFloat(createInitialValue) || 0),
          tagIds,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message || 'Failed to create account');
      }

      setShowCreate(false);
      setCreateName('');
      setCreateInitialValue('');
      setCreateMeta({});
      await fetchAccounts();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setCreateLoading(false);
    }
  };

  const handleSync = async (accountId: string) => {
    setSyncingId(accountId);
    setSyncResult(null);
    try {
      const res = await fetch(`/api/manual-accounts/${accountId}/sync`, {
        method: 'POST',
        credentials: 'include',
      });
      const data = await res.json();
      setSyncResult({
        status: data.status,
        newBalance: data.newBalance,
        oldBalance: data.oldBalance,
        changed: data.changed,
        errorMessage: data.errorMessage,
      });
      if (res.ok) await fetchAccounts();
    } catch {
      setSyncResult({ status: 'error', newBalance: '0', oldBalance: '0', changed: false, errorMessage: 'Network error' });
    } finally {
      setSyncingId(null);
    }
  };

  const handleSyncFrequencyChange = useCallback(async (accountId: string, frequency: string) => {
    try {
      const account = accounts.find((a) => a.id === accountId);
      if (!account) return;
      const newMeta = { ...(account.metadata || {}), syncFrequency: frequency };
      await fetch(`/api/manual-accounts/${accountId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ metadata: newMeta }),
      });
      setAccounts((prev) =>
        prev.map((a) => (a.id === accountId ? { ...a, metadata: newMeta } : a))
      );
    } catch {}
  }, [accounts]);

  const isMetalsAdjust = adjustAccount?.type === 'metals';

  const handleAdjust = async () => {
    if (!adjustAccount) return;
    setAdjustLoading(true);
    setError('');
    try {
      const body: Record<string, unknown> = {
        note: adjustNote || undefined,
        date: adjustDate || undefined,
      };
      if (isMetalsAdjust) {
        body.amountOz = parseFloat(adjustValue);
      } else {
        body.value = parseFloat(adjustValue);
      }
      const res = await fetch(`/api/manual-accounts/${adjustAccount.id}/adjust`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message || 'Failed to add snapshot');
      }
      setAdjustAccount(null);
      setAdjustValue('');
      setAdjustDate('');
      setAdjustNote('');
      await fetchAccounts();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setAdjustLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteAccount) return;
    setDeleteLoading(true);
    setError('');
    try {
      await fetch(`/api/manual-accounts/${deleteAccount.id}`, {
        method: 'DELETE',
        headers: { 'X-Confirm-Delete': 'true' },
        credentials: 'include',
      });
      setDeleteAccount(null);
      await fetchAccounts();
    } catch {
      setError('Failed to delete account');
    } finally {
      setDeleteLoading(false);
    }
  };

  const openEdit = (account: ManualAccount) => {
    setEditAccount(account);
    setEditName(account.name);
    setTagIds(account.tags?.map((t) => t.id) ?? []);
    setTagSearch('');
    setShowEditTagDropdown(false);
    const meta = account.metadata ?? {};
    const flat: Record<string, string> = {};
    Object.entries(meta).forEach(([k, v]) => {
      if (v !== undefined && v !== null) flat[k] = String(v);
    });
    if (REAL_ESTATE_TYPES.includes(account.type)) {
      const ids = (meta.mortgageAccountIds as string[]) ?? [];
      flat.linkedMortgageId = ids[0] ?? '';
    }
    if (account.type === 'mortgage' && meta.linkedPropertyId) {
      flat.linkedPropertyId = meta.linkedPropertyId as string;
    }
    setEditMeta(flat);
    setError('');
  };

  const handleEdit = async () => {
    if (!editAccount) return;
    setEditLoading(true);
    setError('');
    try {
      const metadata: Record<string, unknown> = {};

      if (REAL_ESTATE_TYPES.includes(editAccount.type)) {
        metadata.propertyId = editMeta.propertyId || '';
        if (editMeta.propertyType) metadata.propertyType = editMeta.propertyType;
        if (editMeta.purchasePrice) metadata.purchasePrice = parseFloat(editMeta.purchasePrice);
        if (editMeta.purchaseDate) metadata.purchaseDate = editMeta.purchaseDate;
        if (editMeta.zipCode) metadata.zipCode = editMeta.zipCode;
        if (editMeta.initialValue) metadata.initialValue = parseFloat(editMeta.initialValue) || 0;
        if (editMeta.linkedMortgageId) {
          metadata.mortgageAccountIds = [editMeta.linkedMortgageId];
        } else {
          metadata.mortgageAccountIds = [];
        }
        metadata.syncFrequency = editMeta.syncFrequency || 'manual';
      }
      else if (editAccount.type === 'mortgage') {
        metadata.originalLoanAmount = parseFloat(editMeta.originalLoanAmount || '0');
        metadata.interestRate = parseFloat(editMeta.interestRate || '0');
        metadata.termMonths = parseInt(editMeta.termMonths || '360', 10);
        metadata.monthlyPayment = parseFloat(editMeta.monthlyPayment || '0');
        metadata.escrowAmount = parseFloat(editMeta.escrowAmount || '0');
        metadata.extraPrincipal = parseFloat(editMeta.extraPrincipal || '0');
        metadata.pmi = parseFloat(editMeta.pmi || '0');
        metadata.escrow = parseFloat(editMeta.escrow || '0');
        if (editMeta.purchaseDate) metadata.purchaseDate = editMeta.purchaseDate;
        if (editMeta.linkedPropertyId) metadata.linkedPropertyId = editMeta.linkedPropertyId;
        metadata.mortgageStatus = editMeta.mortgageStatus || 'active';
        if (editMeta.mortgageStatus === 'paid_off') {
          metadata.payoffDate = editMeta.payoffDate;
        } else if (editMeta.mortgageStatus === 'refinanced') {
          metadata.refinanceDate = editMeta.refinanceDate;
          metadata.payoffBalance = parseFloat(editMeta.payoffBalance || '0');
          metadata.refinancedByLoanId = editMeta.refinancedByLoanId || '';
        }
      }
      else if (editAccount.type === 'vehicle') {
        metadata.make = editMeta.make || '';
        metadata.model = editMeta.model || '';
        if (editMeta.year) metadata.year = parseInt(editMeta.year, 10);
        if (editMeta.purchasePrice) metadata.purchasePrice = parseFloat(editMeta.purchasePrice);
        if (editMeta.purchaseDate) metadata.purchaseDate = editMeta.purchaseDate;
      }
      else if (editAccount.type === 'crypto') {
        metadata.xpub = editMeta.xpub || '';
        metadata.syncFrequency = editMeta.syncFrequency || 'manual';
      }
      else if (editAccount.type === 'metals') {
        metadata.subType = (editMeta.subType || 'gold');
        metadata.amountOz = parseFloat(editMeta.amountOz || '0');
        if (editMeta.purchaseDate) metadata.purchaseDate = editMeta.purchaseDate;
        metadata.syncFrequency = editMeta.syncFrequency || 'manual';
      }
      else if (['loan', 'studentloan', 'autoloan', 'otherloan'].includes(editAccount.type)) {
        if (editMeta.originalLoanAmount) metadata.originalLoanAmount = parseFloat(editMeta.originalLoanAmount);
        if (editMeta.purchaseDate) metadata.purchaseDate = editMeta.purchaseDate;
      }
      else if (editAccount.type === 'otherAsset' || editAccount.type === 'cash') {
        metadata.description = editMeta.description || '';
      }

      const res = await fetch(`/api/manual-accounts/${editAccount.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ 
          name: editName, 
          metadata,
          balance: (editAccount.type === 'mortgage' && ['paid_off', 'refinanced'].includes(editMeta.mortgageStatus)) 
            ? '0' 
            : undefined,
          tagIds,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message || 'Failed to update account');
      }

      setEditAccount(null);
      await fetchAccounts();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setEditLoading(false);
    }
  };

  const canSync = (account: ManualAccount) => {
    return [...REAL_ESTATE_TYPES, 'crypto', 'metals'].includes(account.type);
  };

  const canAdjust = (account: ManualAccount) => {
    return !canSync(account) || account.type === 'metals';
  };

  const syncFrequencyField = (meta: Record<string, string>, setMeta: (m: Record<string, string>) => void) => (
    <div>
      <label className="block text-sm font-medium text-foreground mb-1">Sync Frequency</label>
      <select
        value={meta.syncFrequency || 'manual'}
        onChange={(e) => setMeta({ ...meta, syncFrequency: e.target.value })}
        className="w-full px-3 py-2 bg-background border border-input rounded-lg text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring"
      >
        {SYNC_FREQUENCIES.map((f) => (
          <option key={f.value} value={f.value}>{f.label}</option>
        ))}
      </select>
    </div>
  );

  const linkedMortgageField = (meta: Record<string, string>, setMeta: (m: Record<string, string>) => void) => {
    const alreadyLinked = new Set(
      realEstateAccounts.flatMap((re) => {
        const m = re.metadata ?? {};
        return (m as Record<string, unknown>).mortgageAccountIds as string[] ?? [];
      })
    );
    const available = allMortgageAccounts.filter((m) => !alreadyLinked.has(m.id) || meta.linkedMortgageId === m.id);
    return (
      <div>
        <label className="block text-sm font-medium text-foreground mb-1">Linked Mortgage (optional)</label>
        <select
          value={meta.linkedMortgageId || ''}
          onChange={(e) => setMeta({ ...meta, linkedMortgageId: e.target.value })}
          className="w-full px-3 py-2 bg-background border border-input rounded-lg text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring"
        >
          <option value="">None (wholly owned)</option>
          {available.map((m) => (
            <option key={m.id} value={m.id}>{m.name}</option>
          ))}
        </select>
      </div>
    );
  };

  const linkedPropertyField = (meta: Record<string, string>, setMeta: (m: Record<string, string>) => void) => {
    const alreadyLinked = new Set(
      accounts.filter((a) => a.type === 'mortgage').flatMap((m) => {
        const meta = m.metadata ?? {};
        return (meta as Record<string, unknown>).linkedPropertyId ? [(meta as Record<string, unknown>).linkedPropertyId as string] : [];
      })
    );
    const available = realEstateAccounts.filter((re) => !alreadyLinked.has(re.id) || meta.linkedPropertyId === re.id);
    return (
      <div>
        <label className="block text-sm font-medium text-foreground mb-1">Linked Property (optional)</label>
        <select
          value={meta.linkedPropertyId || ''}
          onChange={(e) => setMeta({ ...meta, linkedPropertyId: e.target.value })}
          className="w-full px-3 py-2 bg-background border border-input rounded-lg text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring"
        >
          <option value="">None</option>
          {available.map((re) => (
            <option key={re.id} value={re.id}>{re.name}</option>
          ))}
        </select>
      </div>
    );
  };

  const typeSpecificFields = () => {
    if (REAL_ESTATE_TYPES.includes(createType)) {
      return (
        <>
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">Property Type</label>
            <select
              value={createMeta.propertyType || ''}
              onChange={(e) => setCreateMeta((m) => ({ ...m, propertyType: e.target.value }))}
              className="w-full px-3 py-2 bg-background border border-input rounded-lg text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            >
              <option value="">Select property type...</option>
              {PROPERTY_TYPES.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">Redfin Property ID (optional)</label>
            <Input
              value={createMeta.propertyId || ''}
              onChange={(e) => setCreateMeta((m) => ({ ...m, propertyId: e.target.value }))}
              placeholder="e.g., 446533"
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">Purchase Price</label>
              <Input
                type="number"
                step="0.01"
                value={createMeta.purchasePrice || ''}
                onChange={(e) => setCreateMeta((m) => ({ ...m, purchasePrice: e.target.value }))}
                placeholder="e.g., 350000"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">Purchase Date</label>
              <Input
                type="date"
                value={createMeta.purchaseDate || ''}
                onChange={(e) => setCreateMeta((m) => ({ ...m, purchaseDate: e.target.value }))}
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">ZIP Code (for HPI estimation)</label>
            <Input
              value={createMeta.zipCode || ''}
              onChange={(e) => setCreateMeta((m) => ({ ...m, zipCode: e.target.value }))}
              placeholder="e.g., 94105"
            />
          </div>
          {linkedMortgageField(createMeta, setCreateMeta)}
          {syncFrequencyField(createMeta, setCreateMeta)}
        </>
      );
    }

    switch (createType) {
      case 'mortgage':
        return (
          <>
            {linkedPropertyField(createMeta, setCreateMeta)}
            <MortgageAttributesForm
              meta={createMeta}
              onChange={(m) => setCreateMeta(m)}
              allMortgages={allMortgageAccounts}
            />
          </>
        );
      case 'vehicle':
        return (
          <>
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">Make (optional)</label>
              <Input
                value={createMeta.make || ''}
                onChange={(e) => setCreateMeta((m) => ({ ...m, make: e.target.value }))}
                placeholder="e.g., Toyota"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">Model (optional)</label>
              <Input
                value={createMeta.model || ''}
                onChange={(e) => setCreateMeta((m) => ({ ...m, model: e.target.value }))}
                placeholder="e.g., Camry"
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">Purchase Price</label>
                <Input
                  type="number"
                  step="0.01"
                  value={createMeta.purchasePrice || ''}
                  onChange={(e) => setCreateMeta((m) => ({ ...m, purchasePrice: e.target.value }))}
                  placeholder="e.g., 35000"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">Purchase Date</label>
                <Input
                  type="date"
                  value={createMeta.purchaseDate || ''}
                  onChange={(e) => setCreateMeta((m) => ({ ...m, purchaseDate: e.target.value }))}
                />
              </div>
            </div>
          </>
        );
      case 'crypto':
        return (
          <>
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">Bitcoin xpub / Address</label>
              <Input
                value={createMeta.xpub || ''}
                onChange={(e) => setCreateMeta((m) => ({ ...m, xpub: e.target.value }))}
                placeholder="e.g., wpkh(xpub...)"
                required
              />
            </div>
            {syncFrequencyField(createMeta, setCreateMeta)}
          </>
        );
      case 'gold':
      case 'silver':
        return (
          <>
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">Amount (oz)</label>
              <Input
                type="number"
                step="0.01"
                value={createMeta.amountOz || ''}
                onChange={(e) => setCreateMeta((m) => ({ ...m, amountOz: e.target.value }))}
                placeholder="e.g., 10.5"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">Purchase Date (for history)</label>
              <Input
                type="date"
                value={createMeta.purchaseDate || ''}
                onChange={(e) => setCreateMeta((m) => ({ ...m, purchaseDate: e.target.value }))}
              />
            </div>
            {syncFrequencyField(createMeta, setCreateMeta)}
          </>
        );
      case 'loan':
      case 'studentloan':
      case 'autoloan':
      case 'otherloan':
        return (
          <>
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">Original Loan Amount (optional)</label>
              <Input
                type="number"
                step="0.01"
                value={createMeta.originalLoanAmount || ''}
                onChange={(e) => setCreateMeta((m) => ({ ...m, originalLoanAmount: e.target.value }))}
                placeholder="e.g., 30000"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">Origination Date (optional)</label>
              <Input
                type="date"
                value={createMeta.purchaseDate || ''}
                onChange={(e) => setCreateMeta((m) => ({ ...m, purchaseDate: e.target.value }))}
              />
            </div>
          </>
        );
      case 'otherAsset':
        return (
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">Description (optional)</label>
            <Input
              value={createMeta.description || ''}
              onChange={(e) => setCreateMeta((m) => ({ ...m, description: e.target.value }))}
              placeholder="e.g., Art collection"
            />
          </div>
        );
      case 'cash':
        return (
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">Description (optional)</label>
            <Input
              value={createMeta.description || ''}
              onChange={(e) => setCreateMeta((m) => ({ ...m, description: e.target.value }))}
              placeholder="e.g., Home savings, Emergency fund"
            />
          </div>
        );
    }
  };

  if (loading) {
    return <div className="text-muted-foreground text-sm py-4">Loading manual accounts...</div>;
  }

  return (
    <div className="p-5 bg-card border border-border rounded-xl">
      <div className="flex items-center justify-between gap-4 mb-4">
        <h2 className="text-base font-semibold text-foreground">Manual Assets & Mortgages</h2>
        <button
          onClick={() => setShowCreate(true)}
          className="px-3 py-1.5 text-xs font-medium text-primary-foreground bg-primary rounded-lg hover:opacity-90 transition-all shrink-0"
        >
          + Add
        </button>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-destructive/20 border border-destructive/30 rounded-lg">
          <p className="text-destructive text-sm">{error}</p>
        </div>
      )}

      {syncResult && (
        <div className={`mb-4 p-3 rounded-lg border ${
          syncResult.status === 'success'
                        ? 'bg-status-positive/10 border-status-positive/20'

            : 'bg-destructive/10 border-destructive/20'
        }`}>
          <p className={`text-xs font-medium ${syncResult.status === 'success' ? 'text-chart-1' : 'text-destructive'}`}>
            {syncResult.status === 'success'
              ? syncResult.changed
                ? `Value updated: ${formatCurrency(syncResult.oldBalance, 'USD').text} → ${formatCurrency(syncResult.newBalance, 'USD').text}`
                : 'Value unchanged'
              : `Sync failed${syncResult.errorMessage ? `: ${syncResult.errorMessage}` : ''}`}
          </p>
        </div>
      )}

      {accounts.length === 0 ? (
        <p className="text-muted-foreground text-sm py-4 text-center">
          No manual accounts yet. Add your first asset or mortgage to track it.
        </p>
      ) : (
        <div className="space-y-2">
          {accounts.map((account) => {
            const fmt = formatCurrency(account.balance, account.currency);
            const isLiability = isLiabilityAccount(account.type);
            const isSimpleFin = !!account.connectionId;
            const syncFrequency = canSync(account) && account.metadata
              ? String((account.metadata as Record<string, unknown>).syncFrequency ?? 'manual')
              : 'manual';
            const nextSync = computeNextSync(syncFrequency, account.balanceDate);
            const isSyncOverdue = nextSync && nextSync.getTime() <= Date.now();
            return (
              <div
                key={account.id}
                className="p-4 bg-muted/30 border border-border rounded-lg"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm shrink-0">{getAccountIcon(account)}</span>
                      <span className={`shrink-0 px-2 py-0.5 text-xs rounded-full font-medium ${getBadgeClasses(account.type)}`}>
                        {getSubTypeLabel(account)}
                      </span>
                      {isLiability && <span className="text-[10px] text-chart-5 font-medium">Liability</span>}
                      {isSimpleFin && <span className="text-[10px] text-chart-1 font-medium bg-chart-1/10 px-1.5 py-0.5 rounded">SimpleFIN</span>}
                    </div>
                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                      <span className="text-foreground font-medium text-sm truncate max-w-[160px] sm:max-w-xs">{account.name}</span>
                      {account.tags && account.tags.length > 0 && (
                        <div className="flex items-center gap-1 flex-wrap">
                          {account.tags.map((tag) => (
                            <span
                              key={tag.id}
                              className="px-1.5 py-0.2 rounded-full text-[8px] font-medium border shrink-0"
                              style={{
                                backgroundColor: `${tag.color}15`,
                                color: tag.color,
                                borderColor: `${tag.color}30`
                              }}
                            >
                              #{tag.name}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="font-mono text-sm font-semibold text-foreground blur-number">
                      {fmt.sign}{fmt.text}
                    </div>
                    <div className="text-xs text-muted-foreground/60">{account.currency}</div>
                  </div>
                </div>
                <div className="flex items-center justify-between mt-2 pt-2 border-t border-border/50">
                  <div className="text-xs text-muted-foreground">
                    Updated {formatRelativeTime(account.balanceDate)}
                  </div>
                  <div className="flex items-center gap-1.5 flex-wrap justify-end">
                    {canSync(account) && (
                      <button
                        onClick={() => handleSync(account.id)}
                        disabled={syncingId === account.id}
                        className="px-2 py-1 text-[10px] font-medium text-primary bg-primary/10 hover:bg-primary/20 rounded-lg transition-colors disabled:opacity-50"
                      >
                        {syncingId === account.id ? '...' : 'Sync'}
                      </button>
                    )}
                    {canAdjust(account) && (
                      <button
                        onClick={() => {
                          setAdjustAccount(account);
                          const meta = account.metadata ?? {};
                          setAdjustValue(
                            account.type === 'metals'
                              ? String((meta as Record<string, unknown>).amountOz ?? '0')
                              : account.balance
                          );
                          setAdjustDate(new Date().toISOString().split('T')[0]);
                          setAdjustNote('');
                        }}
                        className="px-2 py-1 text-[10px] font-medium text-muted-foreground hover:text-foreground border border-border hover:bg-muted rounded-lg transition-colors"
                      >
                        Adjust
                      </button>
                    )}
                    <button
                      onClick={() => openEdit(account)}
                      className="px-2 py-1 text-[10px] font-medium text-muted-foreground hover:text-foreground border border-border hover:bg-muted rounded-lg transition-colors"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => setDeleteAccount(account)}
                      className="px-2 py-1 text-[10px] font-medium text-destructive hover:bg-destructive/10 border border-destructive/30 rounded-lg transition-colors"
                    >
                      Delete
                    </button>
                  </div>
                </div>
                {canSync(account) && (
                  <div className="flex items-center justify-between pt-2 mt-2 border-t border-border/50">
                    <div className="text-xs text-muted-foreground">
                      {syncingId === account.id ? (
                        <span className="text-chart-1 animate-pulse">Syncing...</span>
                      ) : syncFrequency === 'manual' ? (
                        <span>Not scheduled</span>
                      ) : nextSync && nextSync.getTime() > Date.now() ? (
                        <span>Next: {formatTimeUntil(nextSync)}</span>
                      ) : (
                        <span className="text-chart-3">Overdue</span>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <label className="text-xs text-muted-foreground">Sync:</label>
                      <select
                        value={syncFrequency}
                        onChange={(e) => handleSyncFrequencyChange(account.id, e.target.value)}
                        className="text-xs bg-background border border-border rounded px-2 py-1 text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                      >
                        <option value="manual">Manual</option>
                        <option value="daily">Daily</option>
                        <option value="weekly">Weekly</option>
                        <option value="monthly">Monthly</option>
                      </select>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Create Drawer */}
      <Sheet open={showCreate} onOpenChange={(open) => { setShowCreate(open); setError(''); if (open) { setTagIds([]); setTagSearch(''); setShowTagDropdown(false); } }}>
        <SheetContent side="right" className="w-full max-w-md sm:max-w-lg overflow-y-auto">
          <SheetHeader className="pb-4">
            <SheetTitle>Add Manual Account</SheetTitle>
            <SheetDescription>Track assets or mortgages that aren't connected through SimpleFIN.</SheetDescription>
          </SheetHeader>
          <form onSubmit={handleCreate} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">Type</label>
              <select
                value={createType}
                onChange={(e) => { setCreateType(e.target.value); setCreateMeta({}); }}
                className="w-full px-3 py-2 bg-background border border-input rounded-lg text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              >
                {getGroupedOptions().map((g) => (
                  <optgroup key={g.group} label={g.group}>
                    {g.types.map((t) => (
                      <option key={t.value} value={t.value}>
                        {t.label}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">Name</label>
              <Input
                value={createName}
                onChange={(e) => setCreateName(e.target.value)}
                placeholder={createType === 'mortgage' ? "e.g., Primary Mortgage" : "e.g., My House"}
                required
              />
            </div>
            {typeSpecificFields()}
            {/* Tags Picker for Create */}
            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">Tags</label>
              <div className="relative">
                <div 
                  className="min-h-[38px] w-full flex flex-wrap gap-1 px-3 py-1.5 bg-background border border-input rounded-lg cursor-pointer" 
                  onClick={() => setShowTagDropdown(!showTagDropdown)}
                >
                  {tagIds.length === 0 && (
                    <span className="text-sm text-muted-foreground self-center">No tags selected</span>
                  )}
                  {tagIds.map((tagId) => {
                    const tag = allTags.find((t) => t.id === tagId);
                    if (!tag) return null;
                    return (
                      <span
                        key={tagId}
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium"
                        style={{ backgroundColor: `${tag.color}22`, color: tag.color, border: `1px solid ${tag.color}44` }}
                      >
                        #{tag.name}
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); setTagIds(tagIds.filter((id) => id !== tagId)); }}
                          className="ml-0.5 text-current opacity-60 hover:opacity-100"
                        >×</button>
                      </span>
                    );
                  })}
                  <span className="ml-auto self-center text-muted-foreground text-xs">▼</span>
                </div>

                {showTagDropdown && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => { setShowTagDropdown(false); setTagSearch(''); }} />
                    <div className="absolute z-50 bottom-full mb-1 left-0 right-0 bg-card border border-border rounded-lg shadow-xl max-h-56 flex flex-col">
                      <div className="relative p-2 border-b border-border">
                        <input
                          value={tagSearch}
                          onChange={(e) => setTagSearch(e.target.value)}
                          placeholder="Search tags..."
                          className="w-full px-3 py-1.5 text-xs bg-background border border-input rounded-md text-foreground placeholder-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                          autoFocus
                          onClick={(e) => e.stopPropagation()}
                        />
                      </div>
                      <div className="flex-1 overflow-y-auto">
                        {allTags.length === 0 && (
                          <div className="px-3 py-4 text-xs text-muted-foreground text-center">No tags — create them in Settings → Tags</div>
                        )}
                        {allTags
                          .filter((t) => !tagSearch || t.name.toLowerCase().includes(tagSearch.toLowerCase()))
                          .map((tag) => (
                            <button
                              key={tag.id}
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                if (tagIds.includes(tag.id)) {
                                  setTagIds(tagIds.filter((id) => id !== tag.id));
                                } else {
                                  setTagIds([...tagIds, tag.id]);
                                }
                              }}
                              className={`w-full flex items-center gap-2 px-3 py-2 text-sm transition-colors text-left ${
                                tagIds.includes(tag.id) ? 'bg-primary/10 text-primary' : 'text-foreground/80 hover:bg-muted'
                              }`}
                            >
                              <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: tag.color }} />
                              {tag.name}
                              {tagIds.includes(tag.id) && <span className="ml-auto text-xs">✓</span>}
                            </button>
                          ))}
                      </div>
                    </div>
                  </>
                )}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-foreground mb-1">
                {isLiabilityAccount(createType) ? 'Outstanding Balance (positive)' : 'Initial Value (optional)'}
              </label>
              <Input
                type="number"
                step="0.01"
                value={createInitialValue}
                onChange={(e) => setCreateInitialValue(e.target.value)}
                placeholder={isLiabilityAccount(createType) ? "e.g., 250000" : "e.g., 500000"}
              />
            </div>
            <div className="flex justify-end gap-2 pt-4">
              <SheetClose asChild>
                <button
                  type="button"
                  className="px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
                >
                  Cancel
                </button>
              </SheetClose>
              <button
                type="submit"
                disabled={createLoading}
                className="px-4 py-2 text-sm font-semibold text-primary-foreground bg-primary rounded-lg hover:opacity-90 disabled:opacity-50 transition-all"
              >
                {createLoading ? 'Creating...' : 'Create'}
              </button>
            </div>
          </form>
        </SheetContent>
      </Sheet>

      {/* Add Snapshot Dialog */}
      <Dialog open={!!adjustAccount} onOpenChange={(open) => { if (!open) setAdjustAccount(null); setError(''); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Add Balance Snapshot</DialogTitle>
            <DialogDescription>
              {isMetalsAdjust
                ? 'Record the gold/silver ounces you held at a specific point in time. The dollar value will be calculated using the spot price.'
                : 'A snapshot logs your account balance at a specific point in time. Adding historical snapshots helps build a timeline of your balances to plot your net worth history.'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">
                {isMetalsAdjust ? 'Amount (oz)' : 'Snapshot Balance'}
              </label>
              <Input
                type="number"
                step="0.01"
                value={adjustValue}
                onChange={(e) => setAdjustValue(e.target.value)}
                placeholder={isMetalsAdjust ? 'e.g., 10.5' : 'Enter balance amount'}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">Snapshot Date</label>
              <Input
                type="date"
                value={adjustDate}
                onChange={(e) => setAdjustDate(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">Note (optional)</label>
              <Input
                value={adjustNote}
                onChange={(e) => setAdjustNote(e.target.value)}
                placeholder="e.g., Year-end statement balance"
              />
            </div>
          </div>
          <DialogFooter>
            <button
              onClick={() => setAdjustAccount(null)}
              className="px-4 py-2 text-sm text-foreground bg-muted hover:bg-accent rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleAdjust}
              disabled={adjustLoading}
              className="px-4 py-2 text-sm font-semibold text-primary-foreground bg-primary rounded-lg hover:opacity-90 disabled:opacity-50 transition-all"
            >
              {adjustLoading ? 'Saving...' : 'Save'}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Drawer */}
      <Sheet open={!!editAccount} onOpenChange={(open) => { if (!open) setEditAccount(null); setError(''); }}>
        <SheetContent side="right" className="w-full max-w-md sm:max-w-lg overflow-y-auto">
          <SheetHeader className="pb-4">
            <SheetTitle>Edit Account</SheetTitle>
            <SheetDescription>Update the details for {editAccount?.name}.</SheetDescription>
          </SheetHeader>
          <form onSubmit={(e) => { e.preventDefault(); handleEdit(); }} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">Name</label>
              <Input
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                placeholder="Account name"
                required
              />
            </div>

            {editAccount && REAL_ESTATE_TYPES.includes(editAccount.type) && (
              <>
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">Property Type</label>
                  <select
                    value={editMeta.propertyType || ''}
                    onChange={(e) => setEditMeta((m) => ({ ...m, propertyType: e.target.value }))}
                    className="w-full px-3 py-2 bg-background border border-input rounded-lg text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  >
                    <option value="">Select property type...</option>
                    {PROPERTY_TYPES.map((t) => (
                      <option key={t.value} value={t.value}>{t.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">Redfin Property ID (optional)</label>
                  <Input
                    value={editMeta.propertyId || ''}
                    onChange={(e) => setEditMeta((m) => ({ ...m, propertyId: e.target.value }))}
                    placeholder="e.g., 446533"
                  />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-1">Purchase Price</label>
                    <Input
                      type="number"
                      step="0.01"
                      value={editMeta.purchasePrice || ''}
                      onChange={(e) => setEditMeta((m) => ({ ...m, purchasePrice: e.target.value }))}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-1">Purchase Date</label>
                    <Input
                      type="date"
                      value={editMeta.purchaseDate || ''}
                      onChange={(e) => setEditMeta((m) => ({ ...m, purchaseDate: e.target.value }))}
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">ZIP Code (for HPI estimation)</label>
                  <Input
                    value={editMeta.zipCode || ''}
                    onChange={(e) => setEditMeta((m) => ({ ...m, zipCode: e.target.value }))}
                    placeholder="e.g., 94105"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">Initial Value (optional)</label>
                  <Input
                    type="number"
                    step="0.01"
                    value={editMeta.initialValue || ''}
                    onChange={(e) => setEditMeta((m) => ({ ...m, initialValue: e.target.value }))}
                    placeholder="e.g., 500000"
                  />
                </div>
                {linkedMortgageField(editMeta, (m) => setEditMeta(m))}
                {syncFrequencyField(editMeta, (m) => setEditMeta(m))}
              </>
            )}

            {editAccount?.type === 'mortgage' && (
              <>
                {linkedPropertyField(editMeta, (m) => setEditMeta(m))}
                <MortgageAttributesForm
                  meta={editMeta}
                  onChange={(m) => setEditMeta(m)}
                  allMortgages={allMortgageAccounts.filter((m) => m.id !== editAccount?.id)}
                />
              </>
            )}

            {editAccount?.type === 'vehicle' && (
              <>
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">Make</label>
                  <Input
                    value={editMeta.make || ''}
                    onChange={(e) => setEditMeta((m) => ({ ...m, make: e.target.value }))}
                    placeholder="e.g., Toyota"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">Model</label>
                  <Input
                    value={editMeta.model || ''}
                    onChange={(e) => setEditMeta((m) => ({ ...m, model: e.target.value }))}
                    placeholder="e.g., Camry"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">Year</label>
                  <Input
                    type="number"
                    value={editMeta.year || ''}
                    onChange={(e) => setEditMeta((m) => ({ ...m, year: e.target.value }))}
                    placeholder="e.g., 2024"
                  />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-1">Purchase Price</label>
                    <Input
                      type="number"
                      step="0.01"
                      value={editMeta.purchasePrice || ''}
                      onChange={(e) => setEditMeta((m) => ({ ...m, purchasePrice: e.target.value }))}
                      placeholder="e.g., 35000"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-1">Purchase Date</label>
                    <Input
                      type="date"
                      value={editMeta.purchaseDate || ''}
                      onChange={(e) => setEditMeta((m) => ({ ...m, purchaseDate: e.target.value }))}
                    />
                  </div>
                </div>
              </>
            )}

            {editAccount?.type === 'crypto' && (
              <>
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">Bitcoin xpub / Address</label>
                  <Input
                    value={editMeta.xpub || ''}
                    onChange={(e) => setEditMeta((m) => ({ ...m, xpub: e.target.value }))}
                    placeholder="e.g., wpkh(xpub...)"
                  />
                </div>
                {syncFrequencyField(editMeta, (m) => setEditMeta(m))}
              </>
            )}

            {editAccount?.type === 'metals' && (
              <>
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">Amount (oz)</label>
                  <Input
                    type="number"
                    step="0.01"
                    value={editMeta.amountOz || ''}
                    onChange={(e) => setEditMeta((m) => ({ ...m, amountOz: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">Purchase Date</label>
                  <Input
                    type="date"
                    value={editMeta.purchaseDate || ''}
                    onChange={(e) => setEditMeta((m) => ({ ...m, purchaseDate: e.target.value }))}
                  />
                </div>
                {syncFrequencyField(editMeta, (m) => setEditMeta(m))}
              </>
            )}

            {editAccount && ['loan', 'studentloan', 'autoloan', 'otherloan'].includes(editAccount.type) && (
              <>
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">Original Loan Amount (optional)</label>
                  <Input
                    type="number"
                    step="0.01"
                    value={editMeta.originalLoanAmount || ''}
                    onChange={(e) => setEditMeta((m) => ({ ...m, originalLoanAmount: e.target.value }))}
                    placeholder="e.g., 30000"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">Origination Date (optional)</label>
                  <Input
                    type="date"
                    value={editMeta.purchaseDate || ''}
                    onChange={(e) => setEditMeta((m) => ({ ...m, purchaseDate: e.target.value }))}
                  />
                </div>
              </>
            )}

            {(editAccount?.type === 'otherAsset' || editAccount?.type === 'cash') && (
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">Description</label>
                <Input
                  value={editMeta.description || ''}
                  onChange={(e) => setEditMeta((m) => ({ ...m, description: e.target.value }))}
                  placeholder={editAccount?.type === 'cash' ? "e.g., Home savings" : "e.g., Art collection"}
                />
              </div>
            )}

            {/* Tags Picker for Edit */}
            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">Tags</label>
              <div className="relative">
                <div 
                  className="min-h-[38px] w-full flex flex-wrap gap-1 px-3 py-1.5 bg-background border border-input rounded-lg cursor-pointer" 
                  onClick={() => setShowEditTagDropdown(!showEditTagDropdown)}
                >
                  {tagIds.length === 0 && (
                    <span className="text-sm text-muted-foreground self-center">No tags selected</span>
                  )}
                  {tagIds.map((tagId) => {
                    const tag = allTags.find((t) => t.id === tagId);
                    if (!tag) return null;
                    return (
                      <span
                        key={tagId}
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium"
                        style={{ backgroundColor: `${tag.color}22`, color: tag.color, border: `1px solid ${tag.color}44` }}
                      >
                        #{tag.name}
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); setTagIds(tagIds.filter((id) => id !== tagId)); }}
                          className="ml-0.5 text-current opacity-60 hover:opacity-100"
                        >×</button>
                      </span>
                    );
                  })}
                  <span className="ml-auto self-center text-muted-foreground text-xs">▼</span>
                </div>

                {showEditTagDropdown && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => { setShowEditTagDropdown(false); setTagSearch(''); }} />
                    <div className="absolute z-50 top-full mt-1 left-0 right-0 bg-card border border-border rounded-lg shadow-xl max-h-56 flex flex-col">
                      <div className="relative p-2 border-b border-border">
                        <input
                          value={tagSearch}
                          onChange={(e) => setTagSearch(e.target.value)}
                          placeholder="Search tags..."
                          className="w-full px-3 py-1.5 text-xs bg-background border border-input rounded-md text-foreground placeholder-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                          autoFocus
                          onClick={(e) => e.stopPropagation()}
                        />
                      </div>
                      <div className="flex-1 overflow-y-auto">
                        {allTags.length === 0 && (
                          <div className="px-3 py-4 text-xs text-muted-foreground text-center">No tags — create them in Settings → Tags</div>
                        )}
                        {allTags
                          .filter((t) => !tagSearch || t.name.toLowerCase().includes(tagSearch.toLowerCase()))
                          .map((tag) => (
                            <button
                              key={tag.id}
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                if (tagIds.includes(tag.id)) {
                                  setTagIds(tagIds.filter((id) => id !== tag.id));
                                } else {
                                  setTagIds([...tagIds, tag.id]);
                                }
                              }}
                              className={`w-full flex items-center gap-2 px-3 py-2 text-sm transition-colors text-left ${
                                tagIds.includes(tag.id) ? 'bg-primary/10 text-primary' : 'text-foreground/80 hover:bg-muted'
                              }`}
                            >
                              <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: tag.color }} />
                              {tag.name}
                              {tagIds.includes(tag.id) && <span className="ml-auto text-xs">✓</span>}
                            </button>
                          ))}
                      </div>
                    </div>
                  </>
                )}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-foreground mb-1">
                {editAccount?.type === 'mortgage' ? 'Outstanding Balance (positive)' : 'Current Value'}
              </label>
              <Input
                type="number"
                step="0.01"
                value={editAccount?.balance || '0'}
                disabled
                className="bg-muted cursor-not-allowed"
              />
              <p className="text-[10px] text-muted-foreground mt-1">
                The balance is read-only here. Use the <strong>Add Snapshot</strong> button to record changes and maintain history.
              </p>
            </div>

            <div className="flex justify-end gap-2 pt-4">
              <SheetClose asChild>
                <button
                  type="button"
                  onClick={() => setEditAccount(null)}
                  className="px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
                >
                  Cancel
                </button>
              </SheetClose>
              <button
                type="submit"
                disabled={editLoading || !editName.trim()}
                className="px-4 py-2 text-sm font-semibold text-primary-foreground bg-primary rounded-lg hover:opacity-90 disabled:opacity-50 transition-all"
              >
                {editLoading ? 'Saving...' : 'Save'}
              </button>
            </div>
          </form>
        </SheetContent>
      </Sheet>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteAccount} onOpenChange={(open) => { if (!open) setDeleteAccount(null); setError(''); }}>
        <AlertDialogContent className="max-w-sm">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Account</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete <strong>{deleteAccount?.name}</strong>? All data including transactions and history will be permanently removed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <button
              onClick={handleDelete}
              disabled={deleteLoading}
              className="inline-flex h-9 items-center justify-center rounded-lg bg-destructive px-4 py-2 text-sm font-semibold text-destructive-foreground hover:opacity-90 transition-opacity disabled:opacity-50"
            >
              {deleteLoading ? 'Deleting...' : 'Delete'}
            </button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
