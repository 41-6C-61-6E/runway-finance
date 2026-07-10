'use client';

import { useState, useEffect, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetClose } from '@/components/ui/sheet';
import { Switch } from '@/components/ui/switch';
import { MortgageAttributesForm } from '@/components/features/mortgages/mortgage-attributes-form';
import { isInvestmentAccount } from '@/lib/utils/account-scope';
import { AlertTriangle, AlertCircle, RefreshCw, BellOff, Bell, Loader2 } from 'lucide-react';

type Account = {
  id: string;
  name: string;
  type: string;
  balance: string;
  currency: string;
  institution: string | null;
  isHidden: boolean;
  isExcludedFromNetWorth: boolean;
  balanceDate: string | null;
  metadata?: Record<string, unknown> | null;
  connectionId?: string | null;
  plaidConnectionId?: string | null;
  tags?: { id: string; name: string; color: string }[];
  syncStatus?: { status: 'ok' | 'warning' | 'error'; reason?: string; lastSyncAt?: string } | null;
};

type TagItem = {
  id: string;
  name: string;
  color: string;
};

const MAJOR_TYPE_OPTIONS = [
  { value: 'banking', label: 'Banking' },
  { value: 'credit', label: 'Credit Card' },
  { value: 'investment', label: 'Investment' },
  { value: 'realestate', label: 'Real Estate' },
  { value: 'loan', label: 'Loan / Liability' },
  { value: 'asset', label: 'Other Asset' },
];

const SUB_TYPE_OPTIONS: Record<string, { value: string; label: string }[]> = {
  banking: [
    { value: 'checking', label: 'Checking' },
    { value: 'savings', label: 'Savings' },
    { value: 'hsachecking', label: 'HSA (Checking)' },
    { value: 'other', label: 'Other Banking / Cash' },
  ],
  credit: [
    { value: 'credit', label: 'Credit Card' },
  ],
  investment: [
    { value: 'investment', label: 'Taxable Brokerage' },
    { value: 'brokerage', label: 'Brokerage' },
    { value: 'retirement', label: 'Retirement (General)' },
    { value: 'rothira', label: 'Roth IRA' },
    { value: 'traditionalira', label: 'Traditional IRA' },
    { value: '401k', label: '401(k)' },
    { value: '403b', label: '403(b)' },
    { value: 'sepira', label: 'SEP IRA' },
    { value: 'simpleira', label: 'Simple IRA' },
    { value: '529', label: '529 Account' },
    { value: 'hsa', label: 'HSA (Investment)' },
    { value: 'health', label: 'HSA' },
    { value: 'otherinvestment', label: 'Other Investment' },
  ],
  realestate: [
    { value: 'primaryhome', label: 'Primary Residence' },
    { value: 'secondaryhome', label: 'Secondary / Vacation Home' },
    { value: 'rentalproperty', label: 'Rental Property' },
    { value: 'commercial', label: 'Commercial Property' },
    { value: 'land', label: 'Land / Undeveloped' },
    { value: 'otherrealestate', label: 'Other Real Estate' },
    { value: 'realestate', label: 'Real Estate (Other)' },
  ],
  loan: [
    { value: 'loan', label: 'Loan' },
    { value: 'mortgage', label: 'Mortgage' },
    { value: 'otherLiability', label: 'Other Liability' },
  ],
  asset: [
    { value: 'vehicle', label: 'Vehicle' },
    { value: 'crypto', label: 'Bitcoin / Crypto' },
    { value: 'metals', label: 'Metals' },
    { value: 'otherAsset', label: 'Other Asset' },
  ],
};

function findMajorType(type: string): string {
  const normalized = type?.toLowerCase() || '';
  for (const [major, subs] of Object.entries(SUB_TYPE_OPTIONS)) {
    if (subs.some(s => s.value.toLowerCase() === normalized)) return major;
  }
  return 'banking';
}

const invalidateAllFinanceQueries = (queryClient: any) => {
  queryClient.invalidateQueries({ queryKey: ['accounts'] });
  queryClient.invalidateQueries({ queryKey: ['account-transactions'] });
  queryClient.invalidateQueries({ queryKey: ['budgets'] });
  queryClient.invalidateQueries({ queryKey: ['budgets-chart'] });
  queryClient.invalidateQueries({ queryKey: ['cash-flow-monthly'] });
  queryClient.invalidateQueries({ queryKey: ['real-estate-properties'] });
  queryClient.invalidateQueries({ queryKey: ['investments'] });
};

interface AccountDetailDrawerProps {
  account: Account | null;
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export default function AccountDetailDrawer({ account, open, onClose, onSuccess }: AccountDetailDrawerProps) {
  const queryClient = useQueryClient();
  const [name, setName] = useState(account?.name ?? '');
  const [type, setType] = useState(account?.type ?? '');
  const [majorType, setMajorType] = useState('banking');
  const [isHidden, setIsHidden] = useState(account?.isHidden ?? false);
  const [isExcludedFromNetWorth, setIsExcludedFromNetWorth] = useState(account?.isExcludedFromNetWorth ?? false);
  const [saving, setSaving] = useState(false);
  const [unlinking, setUnlinking] = useState(false);
  const [mortgageMeta, setMortgageMeta] = useState<Record<string, string>>({});
  const [ignoreSettlementTransactions, setIgnoreSettlementTransactions] = useState(false);
  const [allAccounts, setAllAccounts] = useState<any[]>([]);
  const [tagIds, setTagIds] = useState<string[]>(account?.tags?.map((t) => t.id) ?? []);
  const [allTags, setAllTags] = useState<TagItem[]>([]);
  const [tagSearch, setTagSearch] = useState('');
  const [showTagDropdown, setShowTagDropdown] = useState(false);

  const [syncingConnection, setSyncingConnection] = useState(false);
  const [resyncingConnection, setResyncingConnection] = useState(false);
  const [syncingAccount, setSyncingAccount] = useState(false);
  const [muteSyncWarnings, setMuteSyncWarnings] = useState(false);

  let metaObj: Record<string, any> = {};
  if (account) {
    const rawMeta = account.metadata as any;
    if (typeof rawMeta === 'string' && rawMeta.trim() !== '') {
      try {
        metaObj = JSON.parse(rawMeta);
      } catch {}
    } else if (typeof rawMeta === 'object' && rawMeta !== null) {
      metaObj = rawMeta;
    }
  }
  const isCryptoApi = account?.type === 'crypto' && typeof metaObj.xpub === 'string' && metaObj.xpub.trim() !== '';
  const isMetalsApi = account?.type === 'metals' && typeof metaObj.amountOz !== 'undefined' && parseFloat(String(metaObj.amountOz)) > 0;
  const isRealEstateApi = [
    'realestate', 'primaryhome', 'secondaryhome', 'rentalproperty', 'commercial', 'land', 'otherrealestate',
    'single-family', 'condo', 'townhouse', 'multi-family'
  ].includes(account?.type || '') && typeof metaObj.address === 'string' && metaObj.address.trim() !== '';
  const isApiDrivenManual = isCryptoApi || isMetalsApi || isRealEstateApi;

  const handleSyncConnection = async () => {
    const connId = account?.connectionId || account?.plaidConnectionId;
    if (!connId) return;
    setSyncingConnection(true);
    try {
      const res = await fetch(`/api/connections/${connId}/sync`, {
        method: 'POST',
        credentials: 'include',
      });
      if (!res.ok) throw new Error('Failed to sync connection');
      invalidateAllFinanceQueries(queryClient);
      onSuccess();
    } catch (err: any) {
      alert(err.message || 'An error occurred during sync');
    } finally {
      setSyncingConnection(false);
    }
  };

  const handleFullResync = async () => {
    const connId = account?.plaidConnectionId;
    if (!connId) return;
    if (!confirm('This will clear the sync cursor and trigger a full re-sync of up to 2 years of history. Are you sure?')) return;
    setResyncingConnection(true);
    try {
      const res = await fetch(`/api/connections/${connId}/reset-cursor`, {
        method: 'POST',
        credentials: 'include',
      });
      if (!res.ok) throw new Error('Failed to start full re-sync');
      invalidateAllFinanceQueries(queryClient);
      onSuccess();
    } catch (err: any) {
      alert(err.message || 'An error occurred');
    } finally {
      setResyncingConnection(false);
    }
  };

  const handleSyncAccount = async () => {
    if (!account) return;
    setSyncingAccount(true);
    try {
      const res = await fetch(`/api/manual-accounts/${account.id}/sync`, {
        method: 'POST',
        credentials: 'include',
      });
      if (!res.ok) throw new Error('Failed to sync account');
      invalidateAllFinanceQueries(queryClient);
      onSuccess();
    } catch (err: any) {
      alert(err.message || 'An error occurred');
    } finally {
      setSyncingAccount(false);
    }
  };

  const handleUnlink = useCallback(async () => {
    if (!account) return;
    if (
      !confirm(
        `Are you sure you want to unlink "${account.name}" from bank sync? It will become a manual/orphaned account, allowing you to re-map it to another synced account or delete it permanently.`
      )
    ) {
      return;
    }
    setUnlinking(true);
    try {
      const res = await fetch(`/api/accounts/${account.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ connectionId: null, plaidConnectionId: null }),
      });
      if (!res.ok) {
        throw new Error('Failed to unlink account');
      }
      invalidateAllFinanceQueries(queryClient);
      onSuccess();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setUnlinking(false);
    }
  }, [account, onSuccess, queryClient]);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (open && allTags.length === 0) {
      fetch('/api/tags', { credentials: 'include' })
        .then((res) => res.json())
        .then((data) => setAllTags(Array.isArray(data) ? data : []))
        .catch(() => setAllTags([]));
    }
  }, [open, allTags.length]);

  const handleDeleteAccount = useCallback(async () => {
    if (!account) return;
    if (
      !confirm(
        `Are you sure you want to permanently delete "${account.name}"? All transaction history and balance snapshots will be lost forever.`
      )
    ) {
      return;
    }
    setDeleting(true);
    try {
      const res = await fetch(`/api/manual-accounts/${account.id}`, {
        method: 'DELETE',
        headers: {
          'X-Confirm-Delete': 'true',
        },
        credentials: 'include',
      });
      if (!res.ok) {
        throw new Error('Failed to delete account');
      }
      invalidateAllFinanceQueries(queryClient);
      onSuccess();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setDeleting(false);
    }
  }, [account, onSuccess, queryClient]);
  useEffect(() => {
    if (!account || !open) return;
    setName(account.name);
    setType(account.type);
    setMajorType(findMajorType(account.type));
    setIsHidden(account.isHidden);
    setIsExcludedFromNetWorth(account.isExcludedFromNetWorth);
    setTagIds(account.tags?.map((t) => t.id) ?? []);

    let mObj: Record<string, any> = {};
    const rawMeta = account.metadata as any;
    if (typeof rawMeta === 'string') {
      try {
        mObj = JSON.parse(rawMeta);
      } catch {}
    } else if (typeof rawMeta === 'object' && rawMeta !== null) {
      mObj = rawMeta;
    }
    setMuteSyncWarnings(!!mObj.muteSyncWarnings);

    if (account.type === 'mortgage') {
      const meta = account.metadata ?? {};
      const flat: Record<string, string> = {};
      Object.entries(meta).forEach(([k, v]) => {
        if (v !== undefined && v !== null) flat[k] = String(v);
      });
      setMortgageMeta(flat);

      fetch('/api/accounts?includeHidden=true', { credentials: 'include' })
        .then((res) => (res.ok ? res.json() : []))
        .then((data) => {
          setAllAccounts(Array.isArray(data) ? data : []);
        })
        .catch(() => {});
    } else {
      setMortgageMeta({});
      setAllAccounts([]);
    }

    if (isInvestmentAccount(account.type)) {
      const meta = account.metadata ?? {};
      setIgnoreSettlementTransactions(!!meta.ignoreSettlementTransactions);
    } else {
      setIgnoreSettlementTransactions(false);
    }
  }, [account, open]);

  const handleSave = useCallback(async () => {
    if (!account) return;
    setSaving(true);
    try {
      const payload: Record<string, any> = {
        name,
        type,
        isHidden,
        isExcludedFromNetWorth,
        tagIds,
      };

      let currentMetadata: Record<string, any> = {};
      const rawMeta = account.metadata as any;
      if (typeof rawMeta === 'string' && rawMeta.trim() !== '') {
        try {
          currentMetadata = JSON.parse(rawMeta);
        } catch {}
      } else if (typeof rawMeta === 'object' && rawMeta !== null) {
        currentMetadata = rawMeta;
      }

      const baseMetadata = {
        ...currentMetadata,
        muteSyncWarnings,
      };

      if (type === 'mortgage') {
        const metadata: Record<string, unknown> = {
          ...baseMetadata,
          originalLoanAmount: parseFloat(mortgageMeta.originalLoanAmount || '0'),
          interestRate: parseFloat(mortgageMeta.interestRate || '0'),
          termMonths: parseInt(mortgageMeta.termMonths || '360', 10),
          monthlyPayment: parseFloat(mortgageMeta.monthlyPayment || '0'),
          escrowAmount: parseFloat(mortgageMeta.escrowAmount || '0'),
          extraPrincipal: parseFloat(mortgageMeta.extraPrincipal || '0'),
          pmi: parseFloat(mortgageMeta.pmi || '0'),
          escrow: parseFloat(mortgageMeta.escrow || '0'),
          mortgageStatus: mortgageMeta.mortgageStatus || 'active',
        };
        if (mortgageMeta.purchaseDate) {
          metadata.purchaseDate = mortgageMeta.purchaseDate;
        }
        if (mortgageMeta.linkedPropertyId) {
          metadata.linkedPropertyId = mortgageMeta.linkedPropertyId;
        }
        if (mortgageMeta.mortgageStatus === 'paid_off') {
          metadata.payoffDate = mortgageMeta.payoffDate;
        } else if (mortgageMeta.mortgageStatus === 'refinanced') {
          metadata.refinanceDate = mortgageMeta.refinanceDate;
          metadata.payoffBalance = parseFloat(mortgageMeta.payoffBalance || '0');
          metadata.refinancedByLoanId = mortgageMeta.refinancedByLoanId || '';
        }
        payload.metadata = metadata;

        if (['paid_off', 'refinanced'].includes(mortgageMeta.mortgageStatus)) {
          payload.balance = '0';
        }
      } else if (isInvestmentAccount(type)) {
        payload.metadata = {
          ...baseMetadata,
          ignoreSettlementTransactions,
        };
      } else {
        payload.metadata = baseMetadata;
      }

      onSuccess();
      fetch(`/api/accounts/${account.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload),
      })
        .then(() => {
          invalidateAllFinanceQueries(queryClient);
        })
        .catch((err) => {
          console.error('Failed to update account details in background:', err);
        });
    } finally {
      setSaving(false);
    }
  }, [account, name, type, isHidden, isExcludedFromNetWorth, tagIds, mortgageMeta, ignoreSettlementTransactions, muteSyncWarnings, onSuccess, queryClient]);

  if (!account || !open) return null;

  const handleMajorTypeChange = (newMajor: string) => {
    setMajorType(newMajor);
    const firstSub = SUB_TYPE_OPTIONS[newMajor]?.[0]?.value || 'other';
    setType(firstSub);
  };

  const formatBalance = (balance: string, currency: string) => {
    const num = parseFloat(balance);
    return {
      text: new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: currency || 'USD',
        minimumFractionDigits: 2,
      }).format(Math.abs(num)),
    };
  };

  const renderLinkedPropertyField = () => {
    const realEstateAccounts = allAccounts.filter((a) => a.type === 'realestate');
    const alreadyLinked = new Set(
      allAccounts
        .filter((a) => a.type === 'mortgage' && a.id !== account?.id)
        .flatMap((m) => {
          const meta = m.metadata ?? {};
          return meta.linkedPropertyId ? [meta.linkedPropertyId as string] : [];
        })
    );
    const available = realEstateAccounts.filter((re) => !alreadyLinked.has(re.id) || mortgageMeta.linkedPropertyId === re.id);
    return (
      <div>
        <label className="block text-sm font-medium text-foreground mb-1">Linked Property (optional)</label>
        <select
          value={mortgageMeta.linkedPropertyId || ''}
          onChange={(e) => setMortgageMeta({ ...mortgageMeta, linkedPropertyId: e.target.value })}
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

  const { text } = formatBalance(account.balance, account.currency);

  return (
    <Sheet open={open} onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="right" className="overflow-y-auto">
        <SheetHeader className="mb-6">
          <SheetTitle>Account Details</SheetTitle>
        </SheetHeader>

        <div className="space-y-5">
          {/* Balance display */}
          <div className="p-4 bg-card border border-border rounded-xl">
            <div className="flex items-center justify-between">
              <div className="text-xs text-muted-foreground">Current Balance</div>
              {account.connectionId && (
                <span className="text-[10px] text-chart-1 font-medium bg-chart-1/10 px-1.5 py-0.5 rounded">SimpleFIN synced</span>
              )}
              {account.plaidConnectionId && (
                <span className="text-[10px] text-primary font-medium bg-primary/10 px-1.5 py-0.5 rounded">Plaid synced</span>
              )}
            </div>
            <div className={`font-mono text-2xl font-bold mt-1 text-foreground financial-value`}>{text}</div>
            <div className="text-xs text-muted-foreground mt-1">{account.currency}</div>
          </div>

          {/* Sync Health & Actions */}
          {(account.connectionId || account.plaidConnectionId || isCryptoApi || isMetalsApi || isRealEstateApi) && (
            <div className="p-4 bg-muted/40 border border-border rounded-xl space-y-3 text-sm">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-foreground text-xs uppercase tracking-wider">Sync Status & Actions</span>
                <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                  account.syncStatus?.status === 'ok' ? 'bg-chart-1/10 text-chart-1' :
                  account.syncStatus?.status === 'error' ? 'bg-destructive/10 text-destructive' :
                  'bg-amber-500/10 text-amber-600 dark:text-amber-500'
                }`}>
                  {account.syncStatus?.status === 'ok' ? 'Healthy' :
                   account.syncStatus?.status === 'error' ? 'Error' : 'Warning'}
                </span>
              </div>

              {account.syncStatus && account.syncStatus.status !== 'ok' && (
                <div className={`p-3 rounded-lg border text-xs flex gap-2 ${
                  account.syncStatus.status === 'error'
                    ? 'bg-destructive/5 text-destructive border-destructive/10'
                    : 'bg-amber-500/5 text-amber-600 dark:text-amber-500 border-amber-500/10'
                }`}>
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-semibold">{account.syncStatus.status === 'error' ? 'Sync Error: ' : 'Sync Warning: '}</span>
                    <span className="text-muted-foreground">{account.syncStatus.reason}</span>
                  </div>
                </div>
              )}

              <div className="space-y-2 pt-1 border-t border-border/40">
                {/* Plaid / SimpleFIN manual sync connection buttons */}
                {(account.connectionId || account.plaidConnectionId) && (
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={handleSyncConnection}
                      disabled={syncingConnection}
                      className="px-3 py-1.5 text-xs font-semibold text-primary bg-primary/10 hover:bg-primary/20 rounded-lg transition-colors flex items-center gap-1.5 disabled:opacity-50"
                    >
                      {syncingConnection ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <RefreshCw className="w-3.5 h-3.5" />
                      )}
                      Sync Connection
                    </button>

                    {account.plaidConnectionId && (
                      <button
                        type="button"
                        onClick={handleFullResync}
                        disabled={resyncingConnection}
                        className="px-3 py-1.5 text-xs font-semibold text-amber-600 dark:text-amber-400 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/20 rounded-lg transition-colors flex items-center gap-1.5 disabled:opacity-50"
                        title="Clear sync cursor and re-pull full history"
                      >
                        {resyncingConnection ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <RefreshCw className="w-3.5 h-3.5" />
                        )}
                        Full Re-sync
                      </button>
                    )}
                  </div>
                )}

                {/* API driven manual accounts sync button */}
                {isApiDrivenManual && !account.connectionId && !account.plaidConnectionId && (
                  <button
                    type="button"
                    onClick={handleSyncAccount}
                    disabled={syncingAccount}
                    className="px-3 py-1.5 text-xs font-semibold text-primary bg-primary/10 hover:bg-primary/20 rounded-lg transition-colors flex items-center gap-1.5 disabled:opacity-50"
                  >
                    {syncingAccount ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <RefreshCw className="w-3.5 h-3.5" />
                    )}
                    Sync Account Now
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Editable fields */}
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">Name</label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-3 py-2 bg-background border border-input rounded-lg text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">Group</label>
                <select
                  value={majorType}
                  onChange={(e) => handleMajorTypeChange(e.target.value)}
                  className="w-full px-3 py-2 bg-background border border-input rounded-lg text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  {MAJOR_TYPE_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">Type</label>
                <select
                  value={type}
                  onChange={(e) => setType(e.target.value)}
                  className="w-full px-3 py-2 bg-background border border-input rounded-lg text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  {SUB_TYPE_OPTIONS[majorType]?.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Tags Picker */}
            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">Tags</label>
              <div className="relative">
                <div className="min-h-[38px] w-full flex flex-wrap gap-1 px-3 py-1.5 bg-background border border-input rounded-lg cursor-pointer" onClick={() => setShowTagDropdown(!showTagDropdown)}>
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
                    <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-card border border-border rounded-lg shadow-xl max-h-56 flex flex-col">
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

            {/* Info fields (read-only) */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <div className="text-xs text-muted-foreground">Institution</div>
                <div className="text-sm text-foreground mt-0.5">{account.institution || '—'}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Balance Date</div>
                <div className="text-sm text-foreground mt-0.5">
                  {account.balanceDate ? new Date(account.balanceDate).toLocaleDateString() : '—'}
                </div>
              </div>
            </div>

            {/* Mortgage attributes form */}
            {type === 'mortgage' && (
              <>
                {renderLinkedPropertyField()}
                <MortgageAttributesForm
                  meta={mortgageMeta}
                  onChange={setMortgageMeta}
                  allMortgages={allAccounts.filter((a) => a.type === 'mortgage' && a.id !== account.id)}
                />
              </>
            )}

            {/* Metadata display for manual accounts */}
            {type !== 'mortgage' && account.metadata && Object.keys(account.metadata).length > 0 && (
              <div className="p-3 bg-muted/30 border border-border rounded-lg">
                <div className="text-xs text-muted-foreground mb-1">Asset Details</div>
                {Object.entries(account.metadata).map(([key, value]) => (
                  <div key={key} className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground capitalize">{key.replace(/([A-Z])/g, ' $1').trim()}</span>
                    <span className="text-foreground font-mono text-xs">{String(value)}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Toggles */}
            <div className="space-y-4 pt-1">
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-foreground/80">Hide from list</span>
                  <Switch
                    checked={isHidden}
                    onCheckedChange={setIsHidden}
                  />
                </div>
                <p className="text-[11px] text-muted-foreground leading-normal">
                  Completely removes the account from dashboards, filters, and lists. Its transactions and data are hidden globally.
                </p>
              </div>

              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-foreground/80">Exclude from net worth</span>
                  <Switch
                    checked={isExcludedFromNetWorth}
                    onCheckedChange={setIsExcludedFromNetWorth}
                  />
                </div>
                <p className="text-[11px] text-muted-foreground leading-normal">
                  Removes the account from all dashboard pages, lists, and net worth calculations. It will only remain visible in the automatic accounts settings tab to allow configuration/re-inclusion.
                </p>
              </div>

              {isInvestmentAccount(type) && (
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-foreground/80">Ignore settlement transactions</span>
                    <Switch
                      checked={ignoreSettlementTransactions}
                      onCheckedChange={setIgnoreSettlementTransactions}
                    />
                  </div>
                  <p className="text-[11px] text-muted-foreground leading-normal">
                    When generating daily estimated balance snapshots, ignore matching positive/negative transaction pairs on the same date (e.g. money market settlement sweeps).
                  </p>
                </div>
              )}

              {(account.connectionId || account.plaidConnectionId || isCryptoApi || isMetalsApi || isRealEstateApi) && (
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-foreground/80">Mute sync alerts</span>
                    <Switch
                      checked={muteSyncWarnings}
                      onCheckedChange={setMuteSyncWarnings}
                    />
                  </div>
                  <p className="text-[11px] text-muted-foreground leading-normal">
                    Mute warnings about connection failures, sync delays, or stagnant balances for this account.
                  </p>
                </div>
              )}
            </div>

            {(account.connectionId || account.plaidConnectionId) && (
              <div className="pt-4 border-t border-border space-y-2">
                <h4 className="text-sm font-semibold text-foreground">Unlink Sync Connection</h4>
                <p className="text-[11px] text-muted-foreground leading-normal">
                  Disconnect this account from bank sync. It will become a manual account. This allows you to permanently delete it, or re-map it to another active bank sync account to preserve history.
                </p>
                <button
                  type="button"
                  onClick={handleUnlink}
                  disabled={unlinking}
                  className="w-full px-4 py-2 text-xs font-semibold text-destructive hover:bg-destructive/10 border border-destructive/30 rounded-lg transition-colors disabled:opacity-50"
                >
                  {unlinking ? 'Unlinking...' : 'Unlink from Bank Sync'}
                </button>
              </div>
            )}

            {!account.connectionId && !account.plaidConnectionId && (
              <div className="pt-4 border-t border-border space-y-2">
                <h4 className="text-sm font-semibold text-destructive">Delete Account</h4>
                <p className="text-[11px] text-muted-foreground leading-normal">
                  Permanently delete this account and all associated transactions and snapshots. This action cannot be undone.
                </p>
                <button
                  type="button"
                  onClick={handleDeleteAccount}
                  disabled={deleting}
                  className="w-full px-4 py-2 text-xs font-semibold text-white bg-destructive hover:bg-destructive/90 rounded-lg transition-colors disabled:opacity-50"
                >
                  {deleting ? 'Deleting...' : 'Delete Account'}
                </button>
              </div>
            )}
          </div>

          {/* Save button */}
          <button
            onClick={handleSave}
            disabled={saving}
            className="w-full px-4 py-2.5 text-sm font-semibold text-primary-foreground bg-primary rounded-lg hover:opacity-90 disabled:opacity-50 transition-all"
          >
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
