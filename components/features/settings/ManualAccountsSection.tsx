'use client';

import { useState, useEffect, useCallback } from 'react';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';

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
};

type AssetSubType = 'realestate' | 'vehicle' | 'crypto' | 'gold' | 'silver' | 'otherAsset';

const ASSET_TYPE_LABELS: Record<string, string> = {
  realestate: 'Real Estate',
  vehicle: 'Vehicle',
  crypto: 'Bitcoin',
  gold: 'Gold',
  silver: 'Silver',
  otherAsset: 'Other Asset',
};

const ASSET_TYPE_ICONS: Record<string, string> = {
  realestate: '🏠',
  vehicle: '🚗',
  crypto: '₿',
  gold: '🥇',
  silver: '🥈',
  otherAsset: '📦',
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
  return account.type;
}

const ACCOUNT_TYPE_MAP: Record<string, string> = {
  realestate: 'realestate',
  vehicle: 'vehicle',
  crypto: 'crypto',
  gold: 'metals',
  silver: 'metals',
  otherAsset: 'otherAsset',
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

export default function ManualAccountsSection() {
  const [accounts, setAccounts] = useState<ManualAccount[]>([]);
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
  const [adjustNote, setAdjustNote] = useState('');
  const [adjustLoading, setAdjustLoading] = useState(false);

  const [deleteAccount, setDeleteAccount] = useState<ManualAccount | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  const [editAccount, setEditAccount] = useState<ManualAccount | null>(null);
  const [editName, setEditName] = useState('');
  const [editMeta, setEditMeta] = useState<Record<string, string>>({});
  const [editLoading, setEditLoading] = useState(false);

  const fetchAccounts = useCallback(async () => {
    try {
      const res = await fetch('/api/manual-accounts', { credentials: 'include' });
      const data = await res.json();
      setAccounts(Array.isArray(data) ? data : []);
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
        if (metadata.make) metadata.make = metadata.make;
        if (metadata.model) metadata.model = metadata.model;
        if (metadata.year) metadata.year = parseInt(metadata.year as string, 10);
      }
      if (createType === 'gold' || createType === 'silver') {
        metadata.subType = createType;
        metadata.amountOz = parseFloat(createMeta.amountOz || '0');
      }
      if (createType === 'realestate') {
        metadata.propertyId = createMeta.propertyId || '';
      }
      if (createType === 'crypto') {
        metadata.xpub = createMeta.xpub || '';
      }
      if (createType === 'otherAsset') {
        metadata.description = createMeta.description || '';
      }

      const res = await fetch('/api/manual-accounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          name: createName,
          type: createType,
          metadata,
          initialValue: parseFloat(createInitialValue) || 0,
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

  const isMetalsAdjust = adjustAccount?.type === 'metals';

  const handleAdjust = async () => {
    if (!adjustAccount) return;
    setAdjustLoading(true);
    setError('');
    try {
      const body: Record<string, unknown> = {
        note: adjustNote || undefined,
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
        throw new Error(data.message || 'Failed to adjust value');
      }
      setAdjustAccount(null);
      setAdjustValue('');
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
    const meta = account.metadata ?? {};
    const flat: Record<string, string> = {};
    for (const [k, v] of Object.entries(meta)) {
      flat[k] = String(v ?? '');
    }
    setEditMeta(flat);
    setError('');
  };

  const handleEdit = async () => {
    if (!editAccount) return;
    setEditLoading(true);
    setError('');
    try {
      const metadata: Record<string, unknown> = { ...editMeta };
      if (editAccount.type === 'metals') {
        metadata.subType = (editMeta.subType || 'gold');
        metadata.amountOz = parseFloat(editMeta.amountOz || '0');
      }
      if (editAccount.type === 'realestate') {
        metadata.propertyId = editMeta.propertyId || '';
      }
      if (editAccount.type === 'crypto') {
        metadata.xpub = editMeta.xpub || '';
      }
      if (editAccount.type === 'otherAsset') {
        metadata.description = editMeta.description || '';
      }

      const res = await fetch(`/api/manual-accounts/${editAccount.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ name: editName, metadata }),
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
    return ['realestate', 'crypto', 'metals'].includes(account.type);
  };

  const canAdjust = (account: ManualAccount) => {
    return ['vehicle', 'otherAsset'].includes(account.type) || account.type === 'metals';
  };

  const typeSpecificFields = () => {
    switch (createType) {
      case 'realestate':
        return (
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">Redfin Property ID</label>
            <Input
              value={createMeta.propertyId || ''}
              onChange={(e) => setCreateMeta((m) => ({ ...m, propertyId: e.target.value }))}
              placeholder="e.g., 446533"
              required
            />
          </div>
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
          </>
        );
      case 'crypto':
        return (
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">Bitcoin xpub / Address</label>
            <Input
              value={createMeta.xpub || ''}
              onChange={(e) => setCreateMeta((m) => ({ ...m, xpub: e.target.value }))}
              placeholder="e.g., wpkh(xpub...)"
              required
            />
          </div>
        );
      case 'gold':
      case 'silver':
        return (
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
    }
  };

  if (loading) {
    return <div className="text-muted-foreground text-sm py-4">Loading manual accounts...</div>;
  }

  return (
    <div className="p-5 bg-card border border-border rounded-xl">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-base font-semibold text-foreground">Manual Assets</h2>
        <button
          onClick={() => setShowCreate(true)}
          className="px-3 py-1.5 text-xs font-medium text-primary-foreground bg-primary rounded-lg hover:opacity-90 transition-all"
        >
          + Add Asset
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
            ? 'bg-chart-1/10 border-chart-1/20'
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
          No manual assets yet. Add your first asset to track it alongside your bridge accounts.
        </p>
      ) : (
        <div className="space-y-2">
          {accounts.map((account) => {
            const fmt = formatCurrency(account.balance, account.currency);
            return (
              <div
                key={account.id}
                className="p-4 bg-muted/30 border border-border rounded-lg flex items-center justify-between gap-4"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm">{ASSET_TYPE_ICONS[getSubTypeLabel(account) === 'Real Estate' ? 'realestate' : getSubTypeLabel(account) === 'Vehicle' ? 'vehicle' : getSubTypeLabel(account) === 'Bitcoin' ? 'crypto' : getSubTypeLabel(account) === 'Gold' ? 'gold' : getSubTypeLabel(account) === 'Silver' ? 'silver' : 'otherAsset']}</span>
                    <span className={`px-2 py-0.5 text-xs rounded-full font-medium ${
                      account.type === 'realestate' ? 'bg-chart-3/20 text-chart-3' :
                      account.type === 'vehicle' ? 'bg-chart-4/20 text-chart-4' :
                      account.type === 'crypto' ? 'bg-chart-2/20 text-chart-2' :
                      account.type === 'metals' ? 'bg-chart-5/20 text-chart-5' :
                      'bg-muted text-muted-foreground'
                    }`}>
                      {getSubTypeLabel(account)}
                    </span>
                  </div>
                  <div className="text-foreground font-medium mt-1 text-sm truncate">{account.name}</div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    Last updated: {formatRelativeTime(account.balanceDate)}
                  </div>
                </div>
                <div className="flex items-center gap-3 flex-shrink-0">
                  <div className="text-right">
                    <div className={`font-mono text-sm font-semibold text-muted-foreground blur-number`}>
                      {fmt.sign}{fmt.text}
                    </div>
                    <div className="text-xs text-muted-foreground/60">{account.currency}</div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    {canSync(account) && (
                      <button
                        onClick={() => handleSync(account.id)}
                        disabled={syncingId === account.id}
                        className="px-2.5 py-1 text-xs font-medium text-primary bg-primary/10 hover:bg-primary/20 rounded-lg transition-colors disabled:opacity-50"
                      >
                        {syncingId === account.id ? 'Syncing...' : 'Sync'}
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
                          setAdjustNote('');
                        }}
                        className="px-2.5 py-1 text-xs font-medium text-muted-foreground hover:text-foreground border border-border hover:bg-muted rounded-lg transition-colors"
                      >
                        Adjust
                      </button>
                    )}
                    <button
                      onClick={() => openEdit(account)}
                      className="px-2.5 py-1 text-xs font-medium text-muted-foreground hover:text-foreground border border-border hover:bg-muted rounded-lg transition-colors"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => setDeleteAccount(account)}
                      className="px-2.5 py-1 text-xs font-medium text-destructive hover:bg-destructive/10 border border-destructive/30 rounded-lg transition-colors"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Create Dialog */}
      <Dialog open={showCreate} onOpenChange={(open) => { setShowCreate(open); setError(''); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Add Manual Asset</DialogTitle>
            <DialogDescription>Track assets that aren't connected through SimpleFIN.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleCreate} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">Asset Type</label>
              <select
                value={createType}
                onChange={(e) => { setCreateType(e.target.value as AssetSubType); setCreateMeta({}); }}
                className="w-full px-3 py-2 bg-background border border-input rounded-lg text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="realestate">Real Estate</option>
                <option value="vehicle">Vehicle</option>
                <option value="crypto">Bitcoin</option>
                <option value="gold">Gold</option>
                <option value="silver">Silver</option>
                <option value="otherAsset">Other Asset</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">Name</label>
              <Input
                value={createName}
                onChange={(e) => setCreateName(e.target.value)}
                placeholder="e.g., My House"
                required
              />
            </div>
            {typeSpecificFields()}
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">Initial Value (optional)</label>
              <Input
                type="number"
                step="0.01"
                value={createInitialValue}
                onChange={(e) => setCreateInitialValue(e.target.value)}
                placeholder="e.g., 500000"
              />
            </div>
            <DialogFooter>
              <button
                type="submit"
                disabled={createLoading}
                className="px-4 py-2 text-sm font-semibold text-primary-foreground bg-primary rounded-lg hover:opacity-90 disabled:opacity-50 transition-all"
              >
                {createLoading ? 'Creating...' : 'Create Asset'}
              </button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Adjust Value Dialog */}
      <Dialog open={!!adjustAccount} onOpenChange={(open) => { if (!open) setAdjustAccount(null); setError(''); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Adjust Value</DialogTitle>
            <DialogDescription>
              {isMetalsAdjust
                ? 'Update the number of ounces. The dollar value will be recalculated from the current spot price.'
                : `Update the value for ${adjustAccount?.name}.`}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">
                {isMetalsAdjust ? 'Amount (oz)' : 'New Value'}
              </label>
              <Input
                type="number"
                step={isMetalsAdjust ? '0.01' : '0.01'}
                value={adjustValue}
                onChange={(e) => setAdjustValue(e.target.value)}
                placeholder={isMetalsAdjust ? 'e.g., 10.5' : 'Enter new value'}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">Note (optional)</label>
              <Input
                value={adjustNote}
                onChange={(e) => setAdjustNote(e.target.value)}
                placeholder="e.g., Updated appraisal"
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

      {/* Edit Dialog */}
      <Dialog open={!!editAccount} onOpenChange={(open) => { if (!open) setEditAccount(null); setError(''); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Asset</DialogTitle>
            <DialogDescription>Update the details for {editAccount?.name}.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">Name</label>
              <Input
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                placeholder="Asset name"
                required
              />
            </div>

            {editAccount?.type === 'realestate' && (
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">Redfin Property ID</label>
                <Input
                  value={editMeta.propertyId || ''}
                  onChange={(e) => setEditMeta((m) => ({ ...m, propertyId: e.target.value }))}
                  placeholder="e.g., 446533"
                />
              </div>
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
              </>
            )}

            {editAccount?.type === 'crypto' && (
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">Bitcoin xpub / Address</label>
                <Input
                  value={editMeta.xpub || ''}
                  onChange={(e) => setEditMeta((m) => ({ ...m, xpub: e.target.value }))}
                  placeholder="e.g., wpkh(xpub...)"
                />
              </div>
            )}

            {editAccount?.type === 'metals' && (
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">Amount (oz)</label>
                <Input
                  type="number"
                  step="0.01"
                  value={editMeta.amountOz || ''}
                  onChange={(e) => setEditMeta((m) => ({ ...m, amountOz: e.target.value }))}
                  placeholder="e.g., 10.5"
                />
              </div>
            )}

            {editAccount?.type === 'otherAsset' && (
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">Description</label>
                <Input
                  value={editMeta.description || ''}
                  onChange={(e) => setEditMeta((m) => ({ ...m, description: e.target.value }))}
                  placeholder="e.g., Art collection"
                />
              </div>
            )}
          </div>
          <DialogFooter>
            <button
              onClick={() => setEditAccount(null)}
              className="px-4 py-2 text-sm text-foreground bg-muted hover:bg-accent rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleEdit}
              disabled={editLoading || !editName.trim()}
              className="px-4 py-2 text-sm font-semibold text-primary-foreground bg-primary rounded-lg hover:opacity-90 disabled:opacity-50 transition-all"
            >
              {editLoading ? 'Saving...' : 'Save'}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteAccount} onOpenChange={(open) => { if (!open) setDeleteAccount(null); setError(''); }}>
        <AlertDialogContent className="max-w-sm">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Asset</AlertDialogTitle>
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
