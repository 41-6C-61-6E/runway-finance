'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Check } from 'lucide-react';
import ModeToggle from '@/components/mode-toggle';
import { useSidebar, COLLAPSED_WIDTH } from '@/components/sidebar-context';
import { usePrivacyMode } from '@/components/privacy-mode-provider';
import AccountDetailDrawer from '@/components/features/accounts/AccountDetailDrawer';
import CategoriesTab from '@/components/features/settings/CategoriesTab';
import RulesTab from '@/components/features/settings/RulesTab';
import AnalyticsTab from '@/components/features/settings/AnalyticsTab';
import AccentPicker from '@/components/features/settings/AccentPicker';
import ManualAccountsSection from '@/components/features/settings/ManualAccountsSection';
import { useChartColorScheme } from '@/lib/hooks/use-chart-colors';
import { CHART_COLOR_SCHEMES, type ChartColorSchemeId } from '@/lib/utils/chart-color-schemes';

type Connection = {
  id: string;
  label: string;
  lastSyncAt: string | null;
  lastSyncStatus: string;
  lastSyncError: string | null;
  createdAt: string;
  accessUrlEncrypted?: string;
};

type Account = {
  id: string;
  name: string;
  type: string;
  balance: string;
  currency: string;
  institution: string | null;
  connectionId: string | null;
  isHidden: boolean;
  isExcludedFromNetWorth: boolean;
  balanceDate: string | null;
};

export default function SettingsPage() {
  const router = useRouter();
  const { sidebarWidth } = useSidebar();
  const [setupToken, setSetupToken] = useState('');
  const [label, setLabel] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [devMode, setDevMode] = useState<boolean | null>(null);
  const [devModeLoading, setDevModeLoading] = useState(false);
  const [accentColor, setAccentColor] = useState('violet');
  const [accentColorLoading, setAccentColorLoading] = useState(false);
  const { privacyMode, togglePrivacyMode, loading: privacyModeLoading } = usePrivacyMode();
  const [connections, setConnections] = useState<Connection[]>([]);
  const [connectionsLoading, setConnectionsLoading] = useState(true);
  const [syncingId, setSyncingId] = useState<string | null>(null);
  const [syncResult, setSyncResult] = useState<{ status: string; accountsSynced: number; transactionsFetched: number } | null>(null);
  const [detailsConn, setDetailsConn] = useState<Connection | null>(null);
  const [detailsLabel, setDetailsLabel] = useState('');
  const [deleteConn, setDeleteConn] = useState<Connection | null>(null);
  const [deleteKeepData, setDeleteKeepData] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [editLabel, setEditLabel] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [savingLabel, setSavingLabel] = useState(false);

  const { scheme: chartScheme, updateScheme: updateChartScheme } = useChartColorScheme();

  const [activeTab, setActiveTab] = useState<'general' | 'accounts' | 'categories' | 'rules' | 'analytics'>('general');
  const [accountSubTab, setAccountSubTab] = useState<'automatic' | 'manual'>('automatic');

  const [accounts, setAccounts] = useState<Account[]>([]);
  const [accountsLoading, setAccountsLoading] = useState(true);
  const [accountFilter, setAccountFilter] = useState<'all' | 'hidden' | 'excluded'>('all');
  const [togglingAccount, setTogglingAccount] = useState<string | null>(null);
  const [selectedAccount, setSelectedAccount] = useState<Account | null>(null);
  const [accountDrawerOpen, setAccountDrawerOpen] = useState(false);

  const fetchConnections = useCallback(async () => {
    try {
      const res = await fetch('/api/connections', { credentials: 'include' });
      const data = await res.json();
      setConnections(Array.isArray(data) ? data : []);
    } catch {
      setConnections([]);
    } finally {
      setConnectionsLoading(false);
    }
  }, []);

  const fetchAccounts = useCallback(async () => {
    try {
      const res = await fetch('/api/accounts?includeHidden=true', { credentials: 'include' });
      const data = await res.json();
      setAccounts(Array.isArray(data) ? data : []);
    } catch {
      setAccounts([]);
    } finally {
      setAccountsLoading(false);
    }
  }, []);

  const handleToggleAccount = useCallback(
    (accountId: string, field: 'isHidden' | 'isExcludedFromNetWorth') => async (e: React.MouseEvent) => {
      e.stopPropagation();
      setTogglingAccount(accountId);
      const account = accounts.find((a) => a.id === accountId);
      if (!account) return;
      try {
        await fetch(`/api/accounts/${accountId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ [field]: !account[field] }),
        });
        setAccounts((prev) => prev.map((a) => (a.id === accountId ? { ...a, [field]: !a[field] } : a)));
      } catch {}
      setTogglingAccount(null);
    },
    [accounts]
  );

  const handleOpenAccountDrawer = useCallback((account: Account) => {
    setSelectedAccount(account);
    setAccountDrawerOpen(true);
  }, []);

  const handleCloseAccountDrawer = useCallback(() => {
    setAccountDrawerOpen(false);
  }, []);

  const handleAccountDrawerSuccess = useCallback(() => {
    setAccountDrawerOpen(false);
    fetchAccounts();
  }, [fetchAccounts]);

  useEffect(() => {
    fetchConnections();
    fetchAccounts();
    fetch('/api/dev-mode', { credentials: 'include' })
      .then((res) => res.json())
      .then((data) => setDevMode(data.devMode))
      .catch(() => setDevMode(null));
    fetch('/api/user-settings', { credentials: 'include' })
      .then((res) => res.json())
      .then((data) => setAccentColor(data.accentColor ?? 'violet'))
      .catch(() => setAccentColor('violet'));
  }, [fetchConnections, fetchAccounts]);

  const handleAccentColorChange = useCallback(
    async (color: string) => {
      setAccentColorLoading(true);
      try {
        await fetch('/api/user-settings', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ accentColor: color }),
        });
      } catch {}
      setAccentColorLoading(false);
    },
    []
  );

  const handleToggleDevMode = async () => {
    setDevModeLoading(true);
    try {
      const res = await fetch('/api/dev-mode', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ enabled: !devMode }),
      });
      const data = await res.json();
      setDevMode(data.devMode);
    } catch {}
    setDevModeLoading(false);
  };

  const handleAddConnection = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setSuccess('');
    try {
      const res = await fetch('/api/connections', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          setupToken: setupToken.trim(),
          label: label.trim() || 'Primary',
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || data.error || 'Failed to add connection');
      setSuccess('Connection added successfully!');
      setSetupToken('');
      setLabel('');
      await fetchConnections();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  const handleSync = async (connId: string) => {
    setSyncingId(connId);
    setSyncResult(null);
    try {
      const res = await fetch(`/api/connections/${connId}/sync`, {
        method: 'POST',
        credentials: 'include',
      });
      const data = await res.json();
      setSyncResult({
        status: data.status,
        accountsSynced: data.accountsSynced ?? 0,
        transactionsFetched: data.transactionsFetched ?? 0,
      });
      if (res.ok) await fetchConnections();
    } catch {
      setSyncResult({ status: 'error', accountsSynced: 0, transactionsFetched: 0 });
    } finally {
      setSyncingId(null);
    }
  };

  const handleDelete = async () => {
    if (!deleteConn) return;
    setDeleteLoading(true);
    setError('');
    setSuccess('');
    try {
      const res = await fetch(`/api/connections/${deleteConn.id}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json', 'X-Confirm-Delete': 'true' },
        credentials: 'include',
        body: JSON.stringify({ keepData: deleteKeepData }),
      });
      if (res.ok) {
        await fetchConnections();
        await fetchAccounts();
        setDeleteConn(null);
      } else {
        const data = await res.json();
        setError(data.message || 'Failed to delete connection');
      }
    } catch {
      setError('Failed to delete connection');
    } finally {
      setDeleteLoading(false);
    }
  };

  const handleSaveLabel = async () => {
    if (!editingId) return;
    setSavingLabel(true);
    try {
      await fetch(`/api/connections/${editingId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ label: editLabel }),
      });
      await fetchConnections();
      setEditingId(null);
    } catch {
      setError('Failed to update label');
    } finally {
      setSavingLabel(false);
    }
  };

  const openDetails = (conn: Connection) => {
    setDetailsConn(conn);
    setDetailsLabel(conn.label);
  };

  const formatRelativeTime = (dateStr: string | null) => {
    if (!dateStr) return 'Never';
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'Just now';
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  };

  const maskAccessUrl = (conn: Connection) => {
    try {
      const decoded = Buffer.from(conn.accessUrlEncrypted || '', 'base64').toString('utf8');
      if (decoded.startsWith('http')) {
        const url = new URL(decoded);
        return `${url.protocol}//${url.host.substring(0, 10)}...`;
      }
    } catch {}
    return 'Encrypted';
  };

  const hasConnection = connections.length > 0;

  return (
    <div className="min-h-screen w-full">
      <div className="relative z-10 flex flex-col items-center px-4 sm:px-6 lg:px-8 py-6" style={{ marginLeft: `${COLLAPSED_WIDTH}px` }}>
        <div className="max-w-2xl w-full space-y-6">
          <h1 className="text-xl font-semibold text-foreground">Settings</h1>

          {/* Tab Bar */}
          <div className="flex rounded-lg bg-card border border-border overflow-hidden">
            <button
              onClick={() => setActiveTab('general')}
              className={`flex-1 px-4 py-2 text-sm font-medium transition-colors ${
                activeTab === 'general' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground hover:bg-muted'
              }`}
            >
              General
            </button>
            <button
              onClick={() => setActiveTab('accounts')}
              className={`flex-1 px-4 py-2 text-sm font-medium transition-colors ${
                activeTab === 'accounts' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground hover:bg-muted'
              }`}
            >
              Accounts
            </button>
            <button
              onClick={() => setActiveTab('categories')}
              className={`flex-1 px-4 py-2 text-sm font-medium transition-colors ${
                activeTab === 'categories' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground hover:bg-muted'
              }`}
            >
              Categories
            </button>
            <button
              onClick={() => setActiveTab('rules')}
              className={`flex-1 px-4 py-2 text-sm font-medium transition-colors ${
                activeTab === 'rules' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground hover:bg-muted'
              }`}
            >
              Rules
            </button>
            <button
              onClick={() => setActiveTab('analytics')}
              className={`flex-1 px-4 py-2 text-sm font-medium transition-colors ${
                activeTab === 'analytics' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground hover:bg-muted'
              }`}
            >
              Analytics
            </button>
          </div>

          {activeTab === 'general' && (
          <>

          {/* Combined Settings */}
          <div className="p-5 bg-card border border-border rounded-xl">
            <div className="space-y-5">
              {/* Theme */}
              <div className="flex items-center justify-between pb-5 border-b border-border">
                <div>
                  <h3 className="text-sm font-medium text-foreground">Theme</h3>
                  <p className="text-xs text-muted-foreground mt-1">Toggle between light and dark theme</p>
                </div>
                <ModeToggle />
              </div>

              {/* Accent Color */}
              <div className="flex items-center justify-between pb-5 border-b border-border">
                <div>
                  <h3 className="text-sm font-medium text-foreground">Accent Color</h3>
                  <p className="text-xs text-muted-foreground mt-1">Choose the accent color used throughout the app</p>
                </div>
                <AccentPicker
                  value={accentColor}
                  onChange={handleAccentColorChange}
                />
              </div>

              {/* Chart Color Scheme */}
              <div className="pb-5 border-b border-border">
                <div className="mb-3">
                  <h3 className="text-sm font-medium text-foreground">Chart Color Scheme</h3>
                  <p className="text-xs text-muted-foreground mt-1">Choose a color palette for all charts and graphs</p>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {(Object.keys(CHART_COLOR_SCHEMES) as ChartColorSchemeId[]).map((id) => {
                    const scheme = CHART_COLOR_SCHEMES[id];
                    const isActive = chartScheme === id;
                    return (
                      <button
                        key={id}
                        type="button"
                        title={scheme.description}
                        aria-label={`Select ${scheme.name} chart color scheme`}
                        onClick={() => updateChartScheme(id)}
                        className={`relative flex items-center gap-1.5 p-2 rounded-lg border transition-all ${
                          isActive
                            ? 'border-foreground bg-muted/50'
                            : 'border-border hover:border-foreground/30 hover:bg-muted/20'
                        }`}
                      >
                        <div className="flex -space-x-1">
                          {scheme.colors.map((c, i) => (
                            <div
                              key={i}
                              className="w-4 h-4 rounded-full border border-border/30"
                              style={{ background: c }}
                            />
                          ))}
                        </div>
                        <span className="text-xs text-foreground ml-1">{scheme.name}</span>
                        {isActive && (
                          <Check className="w-3 h-3 text-foreground absolute top-0.5 right-0.5" />
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Privacy Mode */}
              <div className="flex items-center justify-between pb-5 border-b border-border">
                <div>
                  <h3 className="text-sm font-medium text-foreground">Privacy Mode</h3>
                  <p className="text-xs text-muted-foreground mt-1">Blur financial data when showing the app to others</p>
                </div>
                <Switch
                  checked={privacyMode ?? false}
                  onCheckedChange={togglePrivacyMode}
                  disabled={privacyModeLoading}
                />
              </div>

              {/* Dev Mode */}
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-medium text-foreground">Developer Mode</h3>
                  <p className="text-xs text-muted-foreground mt-1">Enable verbose application logs and debugging tools</p>
                </div>
                <Switch
                  checked={devMode ?? false}
                  onCheckedChange={handleToggleDevMode}
                  disabled={devModeLoading}
                />
              </div>
              {devMode === true && (
                <p className="text-xs text-primary pt-1">Dev mode is active. Logs will appear in the bottom pane.</p>
              )}
              {devMode === false && (
                <p className="text-xs text-muted-foreground pt-1">Dev mode is disabled. Logs are hidden.</p>
              )}
            </div>
          </div>

        </>
      )}

      {activeTab === 'categories' && (
        <div className="p-5 bg-card border border-border rounded-xl min-h-[400px]">
          <CategoriesTab />
        </div>
      )}

      {activeTab === 'accounts' && (
        <>
          {/* Sub-tab toggle */}
          <div className="flex rounded-lg bg-card border border-border overflow-hidden">
            <button
              onClick={() => setAccountSubTab('automatic')}
              className={`flex-1 px-4 py-2 text-sm font-medium transition-colors ${
                accountSubTab === 'automatic' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground hover:bg-muted'
              }`}
            >
              Automatic Accounts
            </button>
            <button
              onClick={() => setAccountSubTab('manual')}
              className={`flex-1 px-4 py-2 text-sm font-medium transition-colors ${
                accountSubTab === 'manual' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground hover:bg-muted'
              }`}
            >
              Manual Accounts
            </button>
          </div>

          {accountSubTab === 'automatic' && (
        <>
          {/* Existing Connections */}
          {hasConnection && (
            <div className="p-5 bg-card border border-border rounded-xl mb-4">
              <h2 className="text-base font-semibold text-foreground mb-4">SimpleFIN Bridge Connection</h2>
              {connectionsLoading ? (
                <div className="text-muted-foreground text-sm">Loading...</div>
              ) : (
                <div className="space-y-3">
                  {connections.map((conn) => (
                    <div
                      key={conn.id}
                      className="p-4 bg-muted/30 border border-border rounded-lg flex items-center justify-between gap-4"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <div className={`w-2 h-2 rounded-full flex-shrink-0 ${
                            conn.lastSyncStatus === 'ok' ? 'bg-chart-1' :
                            conn.lastSyncStatus === 'error' ? 'bg-destructive' :
                            'bg-muted-foreground/50'
                          }`} />
                          {editingId === conn.id ? (
                            <div className="flex items-center gap-2">
                              <Input
                                value={editLabel}
                                onChange={(e) => setEditLabel(e.target.value)}
                                className="h-7 w-28"
                                autoFocus
                              />
                              <button onClick={handleSaveLabel} disabled={savingLabel} className="text-xs text-primary hover:text-primary/80">Save</button>
                              <button onClick={() => setEditingId(null)} className="text-xs text-muted-foreground hover:text-foreground">Cancel</button>
                            </div>
                          ) : (
                            <span
                              className="text-foreground font-medium cursor-pointer hover:text-primary transition-colors text-sm"
                              onClick={() => { setEditingId(conn.id); setEditLabel(conn.label); }}
                            >
                              {conn.label}
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-muted-foreground mt-1 ml-4">
                          Last sync: {formatRelativeTime(conn.lastSyncAt)}
                        </div>
                        {conn.lastSyncError && (
                          <div className="text-xs text-destructive mt-1 ml-4 truncate">{conn.lastSyncError}</div>
                        )}
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <span className={`px-2 py-0.5 text-xs rounded-full font-medium ${
                          conn.lastSyncStatus === 'ok'
                            ? 'bg-chart-1/20 text-chart-1'
                            : conn.lastSyncStatus === 'error'
                            ? 'bg-destructive/20 text-destructive'
                            : 'bg-muted text-muted-foreground'
                        }`}>
                          {conn.lastSyncStatus === 'ok' ? 'Synced' : conn.lastSyncStatus === 'error' ? 'Error' : 'Pending'}
                        </span>
                        <button
                          onClick={() => handleSync(conn.id)}
                          disabled={syncingId === conn.id}
                          className="px-2.5 py-1 text-xs font-medium text-primary bg-primary/10 hover:bg-primary/20 rounded-lg transition-colors disabled:opacity-50"
                        >
                          {syncingId === conn.id ? 'Syncing...' : 'Sync'}
                        </button>
                        <button
                          onClick={() => openDetails(conn)}
                          className="px-2.5 py-1 text-xs font-medium text-muted-foreground hover:text-foreground border border-border hover:bg-muted rounded-lg transition-colors"
                        >
                          Details
                        </button>
                        <button
                          onClick={() => { setDeleteKeepData(false); setDeleteConn(conn); }}
                          className="px-2.5 py-1 text-xs font-medium text-destructive hover:bg-destructive/10 border border-destructive/30 rounded-lg transition-colors"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  ))}

                  {syncResult && (
                    <div className={`p-3 rounded-lg border ${
                      syncResult.status === 'success'
                        ? 'bg-chart-1/10 border-chart-1/20'
                        : 'bg-destructive/10 border-destructive/20'
                    }`}>
                      <p className={`text-xs font-medium ${
                        syncResult.status === 'success' ? 'text-chart-1' : 'text-destructive'
                      }`}>
                        {syncResult.status === 'success'
                          ? `Sync complete: ${syncResult.accountsSynced} accounts, ${syncResult.transactionsFetched} transactions`
                          : 'Sync failed'}
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Add Connection Form - shown when no bridge is connected */}
          {!hasConnection && (
            <div className="p-5 bg-card border border-border rounded-xl mb-4">
              <h2 className="text-base font-semibold text-foreground mb-4">Add SimpleFIN Connection</h2>

              <div className="mb-4 p-4 bg-primary/5 border border-primary/20 rounded-lg">
                <h3 className="text-sm font-semibold text-primary mb-2">How to get your SimpleFIN API key / setup token:</h3>
                <ol className="text-xs text-muted-foreground space-y-1.5">
                  <li className="flex gap-2">
                    <span className="text-primary font-bold">1.</span>
                    <span>Sign up for a SimpleFIN Bridge account at <a href="https://beta-bridge.simplefin.org" target="_blank" rel="noopener noreferrer" className="text-primary underline hover:text-primary/80">https://beta-bridge.simplefin.org</a></span>
                  </li>
                  <li className="flex gap-2">
                    <span className="text-primary font-bold">2.</span>
                    <span>After signing in, go My Account, Apps</span>
                  </li>
                  <li className="flex gap-2">
                    <span className="text-primary font-bold">3.</span>
                    <span>Generate a new SimpleFIN API key or setup token by clicking New App Connection.</span>
                  </li>
                  <li className="flex gap-2">
                    <span className="text-primary font-bold">4.</span>
                    <span>Paste the token below and click "Add Connection"</span>
                  </li>
                </ol>
              </div>

              <form onSubmit={handleAddConnection} className="space-y-4">
                <div>
                  <label htmlFor="setupToken" className="block text-sm font-medium text-foreground mb-1">
                    SimpleFIN API Key / Setup Token
                  </label>
                  <Input
                    id="setupToken"
                    value={setupToken}
                    onChange={(e) => setSetupToken(e.target.value)}
                    placeholder="Paste your SimpleFIN API key or setup token here..."
                    required
                  />
                </div>

                <div>
                  <label htmlFor="label" className="block text-sm font-medium text-foreground mb-1">
                    Label (optional)
                  </label>
                  <Input
                    id="label"
                    value={label}
                    onChange={(e) => setLabel(e.target.value)}
                    placeholder="e.g., SimpleFIN Bridge"
                  />
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full px-5 py-2.5 text-sm font-semibold text-primary-foreground bg-primary rounded-lg hover:opacity-90 disabled:opacity-50 transition-all"
                >
                  {loading ? 'Adding...' : 'Add Connection'}
                </button>
              </form>

              {error && (
                <div className="mt-4 p-3 bg-destructive/20 border border-destructive/30 rounded-lg">
                  <p className="text-destructive text-sm">{error}</p>
                </div>
              )}

              {success && (
                <div className="mt-4 p-3 bg-chart-1/20 border border-chart-1/30 rounded-lg">
                  <p className="text-chart-1 text-sm">{success}</p>
                </div>
              )}
            </div>
          )}

          {/* Account Management - only shown when a connection exists */}
          {hasConnection && (
            <div className="p-5 bg-card border border-border rounded-xl">
              <h2 className="text-base font-semibold text-foreground mb-1">Account Management</h2>
              <p className="text-xs text-muted-foreground mb-4">Manage hidden accounts and net worth exclusions.</p>

              <div className="flex items-center gap-2 mb-4">
                <div className="flex rounded-lg bg-muted border border-border overflow-hidden">
                  {(['all', 'hidden', 'excluded'] as const).map((filter) => (
                    <button
                      key={filter}
                      onClick={() => setAccountFilter(filter)}
                      className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                        accountFilter === filter
                          ? 'bg-primary text-primary-foreground'
                          : 'text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      {filter === 'all' ? 'All' : filter === 'hidden' ? 'Hidden' : 'Excluded'}
                    </button>
                  ))}
                </div>
              </div>

              {accountsLoading ? (
                <div className="text-muted-foreground text-sm">Loading...</div>
              ) : accounts.length === 0 ? (
                <p className="text-muted-foreground text-sm">No accounts yet. Connect a financial institution first.</p>
              ) : (() => {
                  const filteredAccounts = accounts.filter((a) => {
                    // Only show automatic accounts (have a connectionId)
                    if (!a.connectionId) return false;
                    if (accountFilter === 'hidden') return a.isHidden;
                    if (accountFilter === 'excluded') return a.isExcludedFromNetWorth;
                    return true;
                  });
                  const hasHiddenOrExcluded = accounts.filter((a) => a.connectionId).some((a) => a.isHidden || a.isExcludedFromNetWorth);

                  if (filteredAccounts.length === 0 && accountFilter !== 'all') {
                    return (
                      <div className="p-4 bg-muted/30 border border-border rounded-lg text-center">
                        <p className="text-muted-foreground text-sm">No accounts match the filter.</p>
                      </div>
                    );
                  }

                  return (
                    <div className="space-y-2">
                      {filteredAccounts.map((account) => {
                        const num = parseFloat(account.balance);
                        const formatted = new Intl.NumberFormat('en-US', {
                          style: 'currency',
                          currency: account.currency || 'USD',
                          minimumFractionDigits: 2,
                        }).format(Math.abs(num));

                        return (
                          <div
                            key={account.id}
                            className={`p-4 bg-muted/30 border border-border rounded-lg flex items-center justify-between gap-4 cursor-pointer group hover:bg-muted/50 transition-colors ${
                              account.isHidden || account.isExcludedFromNetWorth ? 'opacity-60' : ''
                            }`}
                            onClick={() => handleOpenAccountDrawer(account)}
                          >
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <span className={`px-2 py-0.5 text-xs rounded-full font-medium ${
                                  account.type === 'checking' ? 'bg-chart-4/20 text-chart-4' :
                                  account.type === 'savings' ? 'bg-chart-1/20 text-chart-1' :
                                  account.type === 'credit' ? 'bg-chart-2/20 text-chart-2' :
                                  account.type === 'investment' ? 'bg-chart-3/20 text-chart-3' :
                                  account.type === 'loan' ? 'bg-chart-5/20 text-chart-5' :
                                  'bg-muted text-muted-foreground'
                                }`}>
                                  {account.type}
                                </span>
                                {account.isHidden && (
                                  <span className="px-2 py-0.5 text-xs rounded-full bg-muted text-muted-foreground">Hidden</span>
                                )}
                                {account.isExcludedFromNetWorth && (
                                  <span className="px-2 py-0.5 text-xs rounded-full bg-destructive/20 text-destructive">Excluded</span>
                                )}
                              </div>
                              <div className="text-foreground font-medium mt-1 text-sm truncate">{account.name}</div>
                              {account.institution && (
                                <div className="text-xs text-muted-foreground mt-0.5">{account.institution}</div>
                              )}
                            </div>
                            <div className="flex items-center gap-3 flex-shrink-0">
                              <div className="text-right">
                                <div className={`font-mono text-sm text-muted-foreground blur-number`}>
                                  {formatted}
                                </div>
                                <div className="text-xs text-muted-foreground/60">{account.currency}</div>
                              </div>
                              <div className="flex flex-col gap-1.5">
                                <div className="flex items-center gap-2">
                                  <button
                                    onClick={handleToggleAccount(account.id, 'isHidden')}
                                    disabled={togglingAccount === account.id}
                                    className={`relative w-10 h-5 rounded-full transition-colors ${
                                      account.isHidden ? 'bg-primary' : 'bg-muted-foreground/30'
                                    } disabled:opacity-50`}
                                    title={account.isHidden ? 'Show account' : 'Hide account'}
                                  >
                                    <span
                                      className={`absolute top-0.5 left-0.5 w-4 h-4 bg-background rounded-full shadow transition-transform ${
                                        account.isHidden ? 'translate-x-5' : 'translate-x-0'
                                      }`}
                                    />
                                  </button>
                                  <span className="text-xs text-muted-foreground whitespace-nowrap">{account.isHidden ? 'Show' : 'Hide'}</span>
                                </div>
                                <div className="flex items-center gap-2">
                                  <button
                                    onClick={handleToggleAccount(account.id, 'isExcludedFromNetWorth')}
                                    disabled={togglingAccount === account.id}
                                    className={`relative w-10 h-5 rounded-full transition-colors ${
                                      account.isExcludedFromNetWorth ? 'bg-primary' : 'bg-muted-foreground/30'
                                    } disabled:opacity-50`}
                                    title={account.isExcludedFromNetWorth ? 'Include in net worth' : 'Exclude from net worth'}
                                  >
                                    <span
                                      className={`absolute top-0.5 left-0.5 w-4 h-4 bg-background rounded-full shadow transition-transform ${
                                        account.isExcludedFromNetWorth ? 'translate-x-5' : 'translate-x-0'
                                      }`}
                                    />
                                  </button>
                                  <span className="text-xs text-muted-foreground whitespace-nowrap">{account.isExcludedFromNetWorth ? 'Include' : 'Exclude'}</span>
                                </div>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                      {hasHiddenOrExcluded && (
                        <p className="text-xs text-muted-foreground pt-1">Some accounts are hidden or excluded. Use the tabs above to filter.</p>
                      )}
                    </div>
                  );
                })()}
            </div>
          )}
        </>
          )}

          {accountSubTab === 'manual' && (
            <ManualAccountsSection />
          )}
        </>
      )}

      {activeTab === 'rules' && (
        <div className="p-5 bg-card border border-border rounded-xl min-h-[400px]">
          <RulesTab />
        </div>
      )}

      {activeTab === 'analytics' && (
        <div className="p-5 bg-card border border-border rounded-xl min-h-[400px]">
          <AnalyticsTab />
        </div>
      )}
    </div>
  </div>

  {/* Connection Details Dialog */}
  <Dialog open={!!detailsConn} onOpenChange={(open) => !open && setDetailsConn(null)}>
    <DialogContent className="max-w-md">
      <DialogHeader>
        <DialogTitle>Connection Details</DialogTitle>
        <DialogDescription>View and manage your SimpleFIN connection.</DialogDescription>
      </DialogHeader>
      {detailsConn && (
        <div className="space-y-4">
          <div>
            <label className="text-sm text-muted-foreground">Label</label>
            <Input
              value={detailsLabel}
              onChange={(e) => setDetailsLabel(e.target.value)}
              className="mt-1"
            />
          </div>
          <div>
            <label className="text-sm text-muted-foreground">Status</label>
            <div className="mt-1 flex items-center gap-2">
              <div className={`w-2.5 h-2.5 rounded-full ${
                detailsConn.lastSyncStatus === 'ok' ? 'bg-chart-1' :
                detailsConn.lastSyncStatus === 'error' ? 'bg-destructive' :
                'bg-muted-foreground/50'
              }`} />
              <span className="text-foreground text-sm">
                {detailsConn.lastSyncStatus === 'ok' ? 'Synced' : detailsConn.lastSyncStatus === 'error' ? 'Error' : 'Pending'}
              </span>
            </div>
          </div>
          <div>
            <label className="text-sm text-muted-foreground">Last Sync</label>
            <div className="mt-1 text-foreground text-sm">{formatRelativeTime(detailsConn.lastSyncAt)}</div>
          </div>
          <div>
            <label className="text-sm text-muted-foreground">Created</label>
            <div className="mt-1 text-foreground text-sm">{new Date(detailsConn.createdAt).toLocaleDateString()}</div>
          </div>
          <div>
            <label className="text-sm text-muted-foreground">Access URL</label>
            <div className="mt-1 text-muted-foreground text-sm font-mono">{maskAccessUrl(detailsConn)}</div>
          </div>
          {detailsConn.lastSyncError && (
            <div>
              <label className="text-sm text-destructive">Last Error</label>
              <div className="mt-1 text-destructive text-sm">{detailsConn.lastSyncError}</div>
            </div>
          )}
        </div>
      )}
      <DialogFooter>
        <button
          onClick={() => setDetailsConn(null)}
          className="px-4 py-2 text-sm text-foreground bg-muted hover:bg-accent rounded-lg transition-colors"
        >
          Close
        </button>
      </DialogFooter>
    </DialogContent>
  </Dialog>

  {/* Delete Confirmation */}
  <AlertDialog open={!!deleteConn} onOpenChange={(open) => !open && setDeleteConn(null)}>
    <AlertDialogContent className="max-w-sm">
      <AlertDialogHeader>
        <AlertDialogTitle>Delete Connection</AlertDialogTitle>
        <AlertDialogDescription>
          Are you sure you want to delete <strong>{deleteConn?.label}</strong>?
        </AlertDialogDescription>
      </AlertDialogHeader>

      <div className="space-y-3 py-2">
        <label className="flex items-start gap-3 p-3 rounded-lg border border-border cursor-pointer transition-colors bg-muted/30 hover:bg-muted">
          <input
            type="radio"
            name="deleteData"
            checked={!deleteKeepData}
            onChange={() => setDeleteKeepData(false)}
            className="mt-0.5 accent-destructive"
          />
          <div className="flex-1 min-w-0">
            <span className="text-sm font-medium text-foreground">Delete all data</span>
            <p className="text-xs text-muted-foreground mt-0.5">
              Permanently remove this connection and all linked accounts and transactions.
            </p>
          </div>
        </label>
        <label className="flex items-start gap-3 p-3 rounded-lg border border-border cursor-pointer transition-colors bg-muted/30 hover:bg-muted">
          <input
            type="radio"
            name="deleteData"
            checked={deleteKeepData}
            onChange={() => setDeleteKeepData(true)}
            className="mt-0.5 accent-primary"
          />
          <div className="flex-1 min-w-0">
            <span className="text-sm font-medium text-foreground">Keep existing data</span>
            <p className="text-xs text-muted-foreground mt-0.5">
              Remove the bridge connection only. All accounts, transactions, and history will be preserved.
            </p>
          </div>
        </label>
      </div>

      {error && (
        <div className="rounded-lg border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      )}
      <AlertDialogFooter>
        <AlertDialogCancel>Cancel</AlertDialogCancel>
        <button
          type="button"
          onClick={handleDelete}
          disabled={deleteLoading}
          className="inline-flex h-9 items-center justify-center rounded-lg bg-destructive px-4 py-2 text-sm font-semibold text-destructive-foreground hover:opacity-90 transition-opacity focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none disabled:opacity-50"
        >
          {deleteLoading ? 'Deleting...' : deleteKeepData ? 'Remove Connection' : 'Delete All'}
        </button>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>

  {/* Account Detail Drawer */}
  <AccountDetailDrawer
    account={selectedAccount}
    open={accountDrawerOpen}
    onClose={handleCloseAccountDrawer}
    onSuccess={handleAccountDrawerSuccess}
  />
</div>
);
}
