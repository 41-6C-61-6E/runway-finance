'use client';

import { useState, useEffect, useCallback, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { 
  Check, 
  Settings, 
  Landmark, 
  LayoutGrid, 
  GitBranch, 
  Tag, 
  BarChart3, 
  Sparkles, 
  UploadCloud, 
  FileText, 
  ShieldAlert,
  AlertCircle,
  Users2
} from 'lucide-react';
import ModeToggle from '@/components/mode-toggle';
import { useSidebar } from '@/components/sidebar-context';
import { usePrivacyMode } from '@/components/privacy-mode-provider';
import { isInvestmentAccount } from '@/lib/utils/account-scope';
import AccountDetailDrawer from '@/components/features/accounts/AccountDetailDrawer';
import CategoriesTab from '@/components/features/settings/CategoriesTab';
import RulesTab from '@/components/features/settings/RulesTab';
import AnalyticsTab from '@/components/features/settings/AnalyticsTab';
import AccentPicker from '@/components/features/settings/AccentPicker';
import ManualAccountsSection from '@/components/features/settings/ManualAccountsSection';
import AiTab from '@/components/features/settings/AiTab';
import AdvancedTab from '@/components/features/settings/AdvancedTab';
import ImportTab from '@/components/features/settings/ImportTab';
import PayrollTab from '@/components/features/settings/PayrollTab';
import TagsTab from '@/components/features/settings/TagsTab';
import SharingTab from '@/components/features/settings/SharingTab';
import { useChartColorScheme } from '@/lib/hooks/use-chart-colors';
import { useCardStyle } from '@/lib/hooks/use-card-style';
import { CHART_COLOR_SCHEMES, type ChartColorSchemeId } from '@/lib/utils/chart-color-schemes';
import { useHiddenPages, HIDDEN_PAGE_KEYS, DEV_MODE_PAGE_KEYS } from '@/lib/hooks/use-hidden-pages';
import { useReduceTransparency } from '@/lib/hooks/use-reduce-transparency';
import { useAccountSubheadings } from '@/lib/hooks/use-account-subheadings';

import { OnboardingChecklist } from '@/components/onboarding-checklist';
import { PageHeader } from '@/components/page-header';
import PageContent from '@/components/page-content';

type Connection = {
  id: string;
  label: string;
  syncFrequency: string;
  lastSyncAt: string | null;
  lastSyncStatus: string;
  lastSyncError: string | null;
  createdAt: string;
  userId: string;
  accessUrlEncrypted?: string;
};

const SYNC_INTERVALS: Record<string, number> = {
  manual: 0,
  hourly: 60 * 60 * 1000,
  daily: 24 * 60 * 60 * 1000,
  weekly: 7 * 24 * 60 * 60 * 1000,
  monthly: 30 * 24 * 60 * 60 * 1000,
};

function computeNextSync(syncFrequency: string, lastSyncAt: string | null): Date | null {
  if (syncFrequency === 'manual') return null;
  const interval = SYNC_INTERVALS[syncFrequency];
  if (!interval) return null;
  if (!lastSyncAt) return new Date();
  return new Date(new Date(lastSyncAt).getTime() + interval);
}

type Account = {
  id: string;
  name: string;
  type: string;
  balance: string;
  currency: string;
  institution: string | null;
  connectionId: string | null;
  externalId?: string | null;
  isHidden: boolean;
  isExcludedFromNetWorth: boolean;
  balanceDate: string | null;
  tags?: { id: string; name: string; color: string }[];
};

const SETTINGS_TABS = [
  { id: 'general' as const, label: 'General', description: 'Appearance, accent color, and layout preferences', icon: Settings },
  { id: 'accounts' as const, label: 'Accounts', description: 'Linked bank credentials and manual accounts', icon: Landmark },
  { id: 'categories' as const, label: 'Categories', description: 'Transaction category display and structure', icon: LayoutGrid },
  { id: 'rules' as const, label: 'Rules', description: 'Automatic transaction categorization rules', icon: GitBranch },
  { id: 'tags' as const, label: 'Tags', description: 'Labels for transactional tagging and filtering', icon: Tag },
  { id: 'analytics' as const, label: 'Analytics', description: 'Chart color schemes and forecasting bounds', icon: BarChart3 },
  { id: 'ai' as const, label: 'AI Suggestions', description: 'AI provider endpoints, model parameters, and keys', icon: Sparkles },
  { id: 'import' as const, label: 'Import', description: 'Manually upload statement files (CSV/OFX)', icon: UploadCloud },
  { id: 'payroll' as const, label: 'Payroll', description: 'Paystub parsing templates and forecasts', icon: FileText },
  { id: 'sharing' as const, label: 'Sharing', description: 'Invite others to share your financial data', icon: Users2 },
  { id: 'advanced' as const, label: 'Advanced', description: 'Backups, dev tools, and database settings', icon: ShieldAlert },
];

function SettingsPageBody() {
  const router = useRouter();
  const { data: session } = useSession();
  const currentUserId = session?.user?.id;
  const { sidebarWidth, hideAccountsSidebarByDefault, updateHideAccountsSidebarByDefault } = useSidebar();
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
  const [sharingGroup, setSharingGroup] = useState<any>(null);
  const [syncResult, setSyncResult] = useState<{
    status: string;
    accountsSynced: number;
    transactionsFetched: number;
    transactionsNew: number;
    transactionsUpdated: number;
    durationMs: number;
    details: Array<{
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
  } | null>(null);
  const [detailsConn, setDetailsConn] = useState<Connection | null>(null);
  const [detailsLabel, setDetailsLabel] = useState('');
  const [deleteConn, setDeleteConn] = useState<Connection | null>(null);
  const [deleteKeepData, setDeleteKeepData] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [editLabel, setEditLabel] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [savingLabel, setSavingLabel] = useState(false);

  const { scheme: chartScheme, updateScheme: updateChartScheme } = useChartColorScheme();
  const { cardStyle, updateCardStyle } = useCardStyle();
  const { isHidden, updateHidden } = useHiddenPages();
  const { reduceTransparency, updateReduceTransparency } = useReduceTransparency();
  const { hideSubheadings, updateHideSubheadings } = useAccountSubheadings();
  const searchParams = useSearchParams();
  const urlTab = searchParams.get('tab');
  const activeTab = urlTab && ['general', 'accounts', 'categories', 'rules', 'tags', 'analytics', 'ai', 'import', 'payroll', 'sharing', 'advanced'].includes(urlTab)
    ? (urlTab as 'general' | 'accounts' | 'categories' | 'rules' | 'tags' | 'analytics' | 'ai' | 'import' | 'payroll' | 'sharing' | 'advanced')
    : 'general';

  const goToTab = useCallback((tab: typeof activeTab) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set('tab', tab);
    router.replace(`/settings?${params.toString()}`, { scroll: false });
  }, [searchParams, router]);
  const [accountSubTab, setAccountSubTab] = useState<'automatic' | 'manual'>('automatic');

  const [accounts, setAccounts] = useState<Account[]>([]);
  const [accountsLoading, setAccountsLoading] = useState(true);
  const [accountFilter, setAccountFilter] = useState<'all' | 'hidden' | 'excluded'>('all');
  const [selectedAccount, setSelectedAccount] = useState<Account | null>(null);
  const [accountDrawerOpen, setAccountDrawerOpen] = useState(false);

  const [isRemapDialogOpen, setIsRemapDialogOpen] = useState(false);
  const [remapSourceId, setRemapSourceId] = useState('');
  const [remapTargetId, setRemapTargetId] = useState('');
  const [remapLoading, setRemapLoading] = useState(false);
  const [remapError, setRemapError] = useState('');
  const [remapSuccess, setRemapSuccess] = useState('');

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

  const handleRemap = useCallback(async () => {
    if (!remapSourceId || !remapTargetId) {
      setRemapError('Please select both accounts.');
      return;
    }
    setRemapLoading(true);
    setRemapError('');
    setRemapSuccess('');
    try {
      const res = await fetch('/api/accounts/remap', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sourceAccountId: remapSourceId,
          targetAccountId: remapTargetId,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || 'Failed to remap accounts');
      }
      setRemapSuccess('Accounts re-mapped successfully!');
      setRemapSourceId('');
      setRemapTargetId('');
      await fetchAccounts();
      setTimeout(() => {
        setIsRemapDialogOpen(false);
        setRemapSuccess('');
      }, 1500);
    } catch (err) {
      setRemapError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setRemapLoading(false);
    }
  }, [remapSourceId, remapTargetId, fetchAccounts]);

  const handleToggleAccount = useCallback(
    (accountId: string, field: 'isHidden' | 'isExcludedFromNetWorth') => async (e: React.MouseEvent) => {
      e.stopPropagation();
      const account = accounts.find((a) => a.id === accountId);
      if (!account) return;
      const originalValue = account[field];
      const newValue = !originalValue;
      // Optimistically update the UI state immediately
      setAccounts((prev) => prev.map((a) => (a.id === accountId ? { ...a, [field]: newValue } : a)));
      try {
        const res = await fetch(`/api/accounts/${accountId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ [field]: newValue }),
        });
        if (!res.ok) {
          throw new Error('Failed to update account');
        }
      } catch {
        // Roll back if request fails
        setAccounts((prev) => prev.map((a) => (a.id === accountId ? { ...a, [field]: originalValue } : a)));
      }
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
    fetch('/api/sharing', { credentials: 'include' })
      .then((res) => {
        if (res.ok) return res.json();
        throw new Error();
      })
      .then((data) => setSharingGroup(data.group ?? null))
      .catch(() => setSharingGroup(null));
  }, [fetchConnections, fetchAccounts]);

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail) setAccentColor(detail);
    };
    window.addEventListener('accent-changed', handler);
    return () => window.removeEventListener('accent-changed', handler);
  }, []);

  const handleAccentColorChange = useCallback(
    async (color: string) => {
      setAccentColor(color);
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

  const handleSyncFrequencyChange = useCallback(async (connectionId: string, frequency: string) => {
    try {
      await fetch(`/api/connections/${connectionId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ syncFrequency: frequency }),
      });
      setConnections((prev) =>
        prev.map((c) => (c.id === connectionId ? { ...c, syncFrequency: frequency } : c))
      );
    } catch {}
  }, []);

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
        transactionsNew: data.transactionsNew ?? 0,
        transactionsUpdated: data.transactionsUpdated ?? 0,
        durationMs: data.durationMs ?? 0,
        details: data.details ?? [],
      });
      if (res.ok) await fetchConnections();
    } catch {
      setSyncResult({ status: 'error', accountsSynced: 0, transactionsFetched: 0, transactionsNew: 0, transactionsUpdated: 0, durationMs: 0, details: [] });
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
  const hasMyConnection = connections.some((conn) => conn.userId === currentUserId);

  const orphanedAccounts = accounts.filter(
    (a) =>
      !a.connectionId &&
      a.externalId &&
      a.type !== 'paystub' &&
      !a.externalId.startsWith('manual-') &&
      !a.externalId.startsWith('adj-') &&
      !a.externalId.startsWith('virtual-')
  );

  const activeAutomaticAccounts = accounts.filter((a) => a.connectionId !== null);

  return (
    <div className="min-h-screen w-full">
      <PageHeader title="Settings" icon={Settings} />
      <PageContent className="flex flex-col items-center" maxWidth="max-w-6xl">

          {/* Setup Checklist */}
          <div className="mb-5 sm:mb-6">
            <OnboardingChecklist />
          </div>

          {/* Mobile Tab Navigation */}
          <div className="lg:hidden mb-5 sm:mb-6">
            <div className="flex flex-wrap gap-1.5">
              {SETTINGS_TABS.map((tab) => {
                const TabIcon = tab.icon;
                const isActive = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    onClick={() => goToTab(tab.id)}
                    className={`flex items-center gap-1.5 px-2 sm:px-3 py-1.5 rounded-lg text-[10px] sm:text-xs font-medium transition-colors border ${
                      isActive
                        ? 'bg-primary text-primary-foreground shadow-sm shadow-primary/20 border-transparent'
                        : 'bg-muted/60 text-muted-foreground hover:text-foreground hover:bg-muted border-border/50'
                    }`}
                  >
                    <TabIcon className="w-3.5 h-3.5" />
                    {tab.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex flex-col lg:flex-row gap-5 lg:gap-8 items-start w-full">

            {/* Desktop Navigation Sidebar */}
            <aside className="hidden lg:flex flex-col w-72 shrink-0 space-y-0.5 sticky top-24 bg-sidebar/45 backdrop-blur-md border border-border p-2 rounded-xl shadow-sm">
              <div className="px-2 pb-1.5 border-b border-border/60">
                <h3 className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/80">Settings Navigation</h3>
              </div>
              <nav className="space-y-0.5">
                {SETTINGS_TABS.map((tab) => {
                  const TabIcon = tab.icon;
                  const isActive = activeTab === tab.id;
                  return (
                    <button
                      key={tab.id}
                      onClick={() => goToTab(tab.id)}
                      className={`w-full flex items-start gap-2 py-1.5 px-2.5 rounded-lg transition-all text-left group relative border ${
                        isActive
                          ? 'bg-primary border-primary/10 text-primary-foreground shadow-sm shadow-primary/15'
                          : 'bg-transparent border-transparent text-muted-foreground hover:text-foreground hover:bg-muted/75'
                      }`}
                    >
                      <TabIcon className={`w-4 h-4 mt-0.5 shrink-0 transition-transform group-hover:scale-110 duration-200 ${isActive ? 'text-primary-foreground' : 'text-muted-foreground group-hover:text-foreground'}`} />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-semibold leading-tight">{tab.label}</div>
                        <div className={`text-[10px] leading-tight ${isActive ? 'text-primary-foreground/80' : 'text-muted-foreground/70 group-hover:text-muted-foreground'}`}>
                          {tab.description}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </nav>
            </aside>

            {/* Settings Tab Content */}
            <main className="flex-1 w-full min-w-0 max-w-3xl space-y-5 sm:space-y-6">

          {activeTab === 'general' && (
          <>

          {/* Combined Settings */}
          <div className="p-5 bg-card border border-border rounded-xl">
            <div className="space-y-5 sm:space-y-6">
              {/* Theme */}
              <div className="flex items-center justify-between gap-4 pb-5 border-b border-border">
                <div className="flex-1 min-w-0">
                  <h3 className="text-sm font-medium text-foreground">Theme</h3>
                  <p className="text-xs text-muted-foreground mt-1">Select between Daylight, Moonlight, and Starlight themes</p>
                </div>
                <ModeToggle />
              </div>

              {/* Accent Color */}
              <div className="flex items-center justify-between gap-4 pb-5 border-b border-border">
                <div className="flex-1 min-w-0">
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
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
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
                        className={`relative flex flex-col items-start gap-2 p-3 rounded-xl border transition-all ${
                          isActive
                            ? 'border-foreground bg-muted/50 shadow-sm'
                            : 'border-border hover:border-foreground/30 hover:bg-muted/20'
                        }`}
                      >
                        <div className="flex -space-x-1 mb-1">
                          {scheme.colors.map((c, i) => (
                            <div
                              key={i}
                              className="w-4 h-4 rounded-full border border-background"
                              style={{ background: c }}
                            />
                          ))}
                        </div>
                        <span className="text-xs font-semibold text-foreground">{scheme.name}</span>
                        {isActive && (
                          <Check className="w-3.5 h-3.5 text-foreground absolute top-2 right-2" />
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Card Style */}
              <div className="pb-5 border-b border-border">
                <div className="mb-3">
                  <h3 className="text-sm font-medium text-foreground">Card Style</h3>
                  <p className="text-xs text-muted-foreground mt-1">Adjust the corner radius of cards throughout the app</p>
                </div>
                <div className="flex gap-2">
                  {([
                    { id: 'rounded' as const, label: 'More Round', radius: 'rounded-full' },
                    { id: 'default' as const, label: 'Default', radius: 'rounded-md' },
                    { id: 'square' as const, label: 'More Square', radius: 'rounded-none' },
                  ]).map((option) => {
                    const isActive = cardStyle === option.id;
                    return (
                      <button
                        key={option.id}
                        type="button"
                        onClick={() => updateCardStyle(option.id)}
                        className={`flex-1 flex items-center justify-center gap-2 p-2 border transition-all ${
                          isActive
                            ? 'border-foreground bg-muted/50'
                            : 'border-border hover:border-foreground/30 hover:bg-muted/20'
                        }`}
                      >
                        <div className={`w-5 h-5 border-2 border-foreground/40 ${option.radius}`} />
                        <span className="text-xs text-foreground">{option.label}</span>
                        {isActive && (
                          <Check className="w-3 h-3 text-primary" />
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Privacy Mode */}
              <div className="flex items-center justify-between gap-4 pb-5 border-b border-border">
                <div className="flex-1 min-w-0">
                  <h3 className="text-sm font-medium text-foreground">Privacy Mode</h3>
                  <p className="text-xs text-muted-foreground mt-1">Blur financial data when showing the app to others</p>
                </div>
                <Switch
                  checked={privacyMode ?? false}
                  onCheckedChange={togglePrivacyMode}
                  disabled={privacyModeLoading}
                />
              </div>

              {/* Reduce Transparency */}
              <div className="flex items-center justify-between gap-4 pb-5 border-b border-border">
                <div className="flex-1 min-w-0">
                  <h3 className="text-sm font-medium text-foreground">Reduce Transparency</h3>
                  <p className="text-xs text-muted-foreground mt-1">Use solid backgrounds for the sidebar instead of glass/transparent</p>
                </div>
                <Switch
                  checked={reduceTransparency}
                  onCheckedChange={updateReduceTransparency}
                />
              </div>

              {/* Hide Account Subheadings */}
              <div className="flex items-center justify-between gap-4 pb-5 border-b border-border">
                <div className="flex-1 min-w-0">
                  <h3 className="text-sm font-medium text-foreground">Hide Account Subheadings</h3>
                  <p className="text-xs text-muted-foreground mt-1">Group accounts by major category only (e.g. Banking, Credit)</p>
                </div>
                <Switch
                  checked={hideSubheadings}
                  onCheckedChange={updateHideSubheadings}
                />
              </div>

              {/* Hide Accounts Sidebar by Default */}
              <div className="flex items-center justify-between gap-4 pb-5 border-b border-border">
                <div className="flex-1 min-w-0">
                  <h3 className="text-sm font-medium text-foreground">Hide Accounts Sidebar by Default</h3>
                  <p className="text-xs text-muted-foreground mt-1">Start with the accounts sidebar collapsed on all pages</p>
                </div>
                <Switch
                  checked={hideAccountsSidebarByDefault}
                  onCheckedChange={updateHideAccountsSidebarByDefault}
                />
              </div>

              {/* Dev Mode */}
              <div className="flex items-center justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <h3 className="text-sm font-medium text-foreground">Developer Mode</h3>
                  <p className="text-xs text-muted-foreground mt-1">Enable developer tools such as the Financial Logic and Data Explorer pages</p>
                </div>
                <Switch
                  checked={devMode ?? false}
                  onCheckedChange={handleToggleDevMode}
                  disabled={devModeLoading}
                />
              </div>
              {devMode === true && (
                <p className="text-xs text-primary pt-1">Dev mode is active. Financial Logic and Data Explorer pages are visible in the nav.</p>
              )}
              {devMode === false && (
                <p className="text-xs text-muted-foreground pt-1">Dev mode is disabled. Developer tools are hidden from the nav.</p>
              )}
            </div>
          </div>

          {/* Navigation Visibility */}
          <div className="p-5 bg-card border border-border rounded-xl">
            <div className="space-y-5 sm:space-y-6">
              <div>
                <h2 className="text-base font-semibold text-foreground">Navigation</h2>
                <p className="text-xs text-muted-foreground mt-1">
                  Show or hide pages in the sidebar navigation. Hidden pages can still be accessed via direct URL.
                </p>
              </div>

              <div className="space-y-2">
                {HIDDEN_PAGE_KEYS.filter((pageKey) => {
                  const isDevModePage = (DEV_MODE_PAGE_KEYS as readonly string[]).includes(pageKey)
                  return !isDevModePage || devMode === true
                }).map((pageKey) => {
                  const pageLabel =
                    pageKey === 'netWorth' ? 'Net Worth' :
                    pageKey === 'transactions' ? 'Transactions' :
                    pageKey === 'cashFlow' ? 'Cash Flow' :
                    pageKey === 'budgets' ? 'Budgets' :
                    pageKey === 'realEstate' ? 'Real Estate' :

                    pageKey === 'dataExplorer' ? 'Data Explorer' :
                    pageKey === 'financialLogic' ? 'Financial Logic' :
                    pageKey === 'goals' ? 'Goals' :
                    pageKey === 'spending' ? 'Spending' :
                    pageKey;

                  return (
                    <div key={pageKey} className="flex items-center justify-between p-3 bg-muted/30 border border-border rounded-lg">
                      <span className="text-sm text-foreground">{pageLabel}</span>
                      <Switch
                        checked={!isHidden(pageKey)}
                        onCheckedChange={(checked) => updateHidden(pageKey, !checked)}
                      />
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

        </>
      )}

      {activeTab === 'categories' && (
        <div className="p-5 bg-card border border-border rounded-xl min-h-[400px]">
          <CategoriesTab />
        </div>
      )}

      {activeTab === 'tags' && (
        <div className="p-5 bg-card border border-border rounded-xl min-h-[400px]">
          <TagsTab />
        </div>
      )}

      {activeTab === 'accounts' && (
        <>
          {/* Sub-tab toggle */}
          <div className="flex flex-wrap rounded-lg bg-card border border-border overflow-hidden">
            <button
              onClick={() => setAccountSubTab('automatic')}
              className={`flex-1 min-w-0 px-2 sm:px-4 py-2 text-[11px] sm:text-sm font-medium transition-colors ${
                accountSubTab === 'automatic' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground hover:bg-muted'
              }`}
            >
              Automatic Accounts
            </button>
            <button
              onClick={() => setAccountSubTab('manual')}
              className={`flex-1 min-w-0 px-2 sm:px-4 py-2 text-[11px] sm:text-sm font-medium transition-colors ${
                accountSubTab === 'manual' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground hover:bg-muted'
              }`}
            >
              Manual Accounts
            </button>
          </div>

          {accountSubTab === 'automatic' && (
        <>
          {orphanedAccounts.length > 0 && (
            <div className="p-4 bg-amber-500/10 border border-amber-500/25 rounded-xl mb-5 sm:mb-6 flex flex-col sm:flex-row items-start gap-3 animate-in fade-in slide-in-from-top-2 duration-300">
              <div className="flex items-start gap-3 flex-1 min-w-0 w-full sm:w-auto">
                <AlertCircle className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <h3 className="text-sm font-semibold text-amber-500">Unlinked Accounts Detected</h3>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    You have {orphanedAccounts.length} automatic account{orphanedAccounts.length !== 1 ? 's' : ''} no longer linked to a bank connection. Re-map {orphanedAccounts.length === 1 ? 'it' : 'them'} to a currently active synced account to preserve its full history.
                  </p>
                </div>
              </div>
              <button
                onClick={() => {
                  setRemapSourceId(orphanedAccounts[0]?.id || '');
                  setRemapTargetId(activeAutomaticAccounts[0]?.id || '');
                  setIsRemapDialogOpen(true);
                }}
                className="px-3 py-1.5 text-xs font-semibold text-foreground bg-muted hover:bg-accent border border-border rounded-lg transition-colors flex-shrink-0"
              >
                Re-map Account
              </button>
            </div>
          )}
          {/* Existing Connections */}
          {hasConnection && (
            <div className="p-5 bg-card border border-border rounded-xl mb-5 sm:mb-6">
              <h2 className="text-base font-semibold text-foreground mb-4">SimpleFIN Bridge Connection</h2>
              {connectionsLoading ? (
                <div className="text-muted-foreground text-sm">Loading...</div>
              ) : (
                <div className="space-y-3">
                  {connections.map((conn) => {
                    const nextSync = computeNextSync(conn.syncFrequency, conn.lastSyncAt);
                    const isSyncOverdue = nextSync && nextSync.getTime() <= Date.now();
                    return (
                    <div
                      key={conn.id}
                      className="p-4 bg-muted/30 border border-border rounded-lg space-y-2"
                    >
                      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                        <div className="flex items-center gap-2 min-w-0 w-full sm:w-auto">
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
                              className={`text-foreground font-medium transition-colors text-sm truncate ${
                                currentUserId && conn.userId === currentUserId
                                  ? 'cursor-pointer hover:text-primary'
                                  : 'cursor-default'
                              }`}
                              onClick={() => {
                                if (currentUserId && conn.userId === currentUserId) {
                                  setEditingId(conn.id);
                                  setEditLabel(conn.label);
                                }
                              }}
                            >
                              {conn.label}
                            </span>
                          )}
                          <span className="text-[10px] text-muted-foreground bg-muted border border-border px-1.5 py-0.5 rounded shrink-0 font-medium ml-1">
                            {conn.userId === currentUserId ? 'You' : conn.userId}
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5 flex-shrink-0 flex-wrap">
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
                            disabled={syncingId === conn.id || (currentUserId !== undefined && conn.userId !== currentUserId)}
                            className="px-2 py-1 text-[11px] font-medium text-primary bg-primary/10 hover:bg-primary/20 rounded-lg transition-colors disabled:opacity-50"
                          >
                            {syncingId === conn.id ? 'Syncing...' : 'Sync'}
                          </button>
                          <button
                            onClick={() => openDetails(conn)}
                            className="px-2 py-1 text-[11px] font-medium text-muted-foreground hover:text-foreground border border-border hover:bg-muted rounded-lg transition-colors"
                          >
                            Details
                          </button>
                          <button
                            onClick={() => { setDeleteKeepData(false); setDeleteConn(conn); }}
                            disabled={currentUserId !== undefined && conn.userId !== currentUserId}
                            className="px-2 py-1 text-[11px] font-medium text-destructive hover:bg-destructive/10 border border-destructive/30 rounded-lg transition-colors disabled:opacity-50 disabled:hover:bg-transparent"
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                      <div className="flex items-center justify-between">
                        <div className="text-xs text-muted-foreground">
                          Last sync: {formatRelativeTime(conn.lastSyncAt)}
                        </div>
                      </div>
                      {conn.lastSyncError && (
                        <div className="text-xs text-destructive truncate">{conn.lastSyncError}</div>
                      )}
                      <div className="flex items-center justify-between pt-2 border-t border-border">
                        <div className="flex items-center gap-2">
                          <label className="text-xs text-muted-foreground">Sync frequency:</label>
                          <select
                            value={conn.syncFrequency}
                            disabled={currentUserId !== undefined && conn.userId !== currentUserId}
                            onChange={(e) => handleSyncFrequencyChange(conn.id, e.target.value)}
                            className="text-xs bg-background border border-border rounded px-2 py-1 text-foreground focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-50"
                          >
                            <option value="manual">Manual</option>
                            <option value="hourly">Hourly</option>
                            <option value="daily">Daily</option>
                            <option value="weekly">Weekly</option>
                            <option value="monthly">Monthly</option>
                          </select>
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {syncingId === conn.id ? (
                            <span className="text-chart-1 animate-pulse">Syncing...</span>
                          ) : conn.syncFrequency === 'manual' ? (
                            <span>Not scheduled</span>
                          ) : nextSync && nextSync.getTime() > Date.now() ? (
                            <span>Next sync: {formatTimeUntil(nextSync)}</span>
                          ) : (
                            <span className="text-chart-3">Next sync: Overdue</span>
                          )}
                        </div>
                      </div>
                    </div>
                    )
                  })}

                  <div className="p-3 bg-muted/45 border border-border/65 text-muted-foreground text-xs rounded-lg flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                    <div>
                      All bank connections in this shared account are visible to all members, but a connection can only be modified, manually synced, or deleted by its respective owner.
                    </div>
                  </div>

                  {syncResult && (
                    <div className={`p-4 rounded-lg border space-y-3 ${
                      syncResult.status === 'success'
                        ? 'bg-chart-1/10 border-chart-1/20'
                        : 'bg-destructive/10 border-destructive/20'
                    }`}>
                      {/* Header */}
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className={`text-xs font-semibold ${
                            syncResult.status === 'success' ? 'text-chart-1' : 'text-destructive'
                          }`}>
                            {syncResult.status === 'success' ? 'Sync Complete' : 'Sync Failed'}
                          </span>
                          {syncResult.durationMs > 0 && (
                            <span className={`text-[10px] ${
                              syncResult.status === 'success' ? 'text-chart-1/70' : 'text-destructive/70'
                            }`}>
                              in {(syncResult.durationMs / 1000).toFixed(1)}s
                            </span>
                          )}
                        </div>
                        {syncResult.status === 'success' && (
                          <span className={`text-[10px] ${
                            syncResult.status === 'success' ? 'text-chart-1/70' : 'text-destructive/70'
                          }`}>
                            {syncResult.accountsSynced} account{syncResult.accountsSynced !== 1 ? 's' : ''}
                          </span>
                        )}
                      </div>

                      {/* Summary */}
                      {syncResult.status === 'success' && (
                        <div className={`text-[10px] ${
                          syncResult.status === 'success' ? 'text-chart-1/80' : 'text-destructive/80'
                        }`}>
                          {syncResult.transactionsFetched} transaction{syncResult.transactionsFetched !== 1 ? 's' : ''} fetched
                          {syncResult.transactionsNew > 0 && <> · <span className="font-medium">{syncResult.transactionsNew} new</span></>}
                          {syncResult.transactionsUpdated > 0 && <> · {syncResult.transactionsUpdated} updated</>}
                          {syncResult.details.some((d: any) => d.transactionsPending > 0) && (
                            <> · <span className="font-medium">{syncResult.details.reduce((s: number, d: any) => s + d.transactionsPending, 0)} pending</span></>
                          )}
                          {syncResult.details.some((d: any) => d.wasNewAccount) && (
                            <> · <span className="font-medium">{syncResult.details.filter((d: any) => d.wasNewAccount).length} new account{syncResult.details.filter((d: any) => d.wasNewAccount).length !== 1 ? 's' : ''}</span></>
                          )}
                        </div>
                      )}

                      {/* Per-account breakdown */}
                      {syncResult.status === 'success' && syncResult.details.length > 0 && (
                        <div className={`space-y-1 ${
                          syncResult.status === 'success' ? '' : ''
                        }`}>
                          {syncResult.details.map((acct: any) => (
                            <div
                              key={acct.externalId}
                              className={`flex items-center justify-between py-1.5 px-2 rounded ${
                                syncResult.status === 'success' ? 'bg-chart-1/5' : ''
                              }`}
                            >
                              <div className="flex items-center gap-1.5 min-w-0">
                                <span className={`text-xs font-medium truncate ${
                                  syncResult.status === 'success' ? 'text-chart-1' : 'text-destructive'
                                }`}>
                                  {acct.name}
                                </span>
                                <span className={`text-[10px] px-1 rounded ${
                                  syncResult.status === 'success' ? 'bg-chart-1/10 text-chart-1/70' : ''
                                }`}>
                                  {acct.type}
                                </span>
                                {acct.wasNewAccount && (
                                  <span className="text-[10px] font-semibold text-chart-1 bg-chart-1/15 px-1 rounded">
                                    NEW
                                  </span>
                                )}
                              </div>
                              <div className={`text-[10px] ${
                                syncResult.status === 'success' ? 'text-chart-1/70' : ''
                              }`}>
                                {acct.transactionsNew > 0 && (
                                  <span className="font-medium">{acct.transactionsNew} new · </span>
                                )}
                                {acct.transactionsFetched} txns
                                {acct.transactionsPending > 0 && (
                                  <span className="text-chart-1/50"> · {acct.transactionsPending} pending</span>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Error message */}
                      {syncResult.status === 'error' && (
                        <p className="text-[10px] text-destructive/80">
                          Sync could not be completed. Check the connection details for more information.
                        </p>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Add Connection Form - shown when no bridge is connected */}
          {/* Add Connection Form - shown when no bridge is connected for this user */}
          {!hasMyConnection && (
            <div className="p-5 bg-card border border-border rounded-xl mb-5 sm:mb-6">
              <h2 className="text-base font-semibold text-foreground mb-4">Add SimpleFIN Connection</h2>

              {sharingGroup && (
                <div className="mb-4 p-3 bg-amber-500/10 border border-amber-500/20 text-amber-600 dark:text-amber-400 text-xs rounded-lg font-medium flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                  <div>
                    <strong className="block text-amber-700 dark:text-amber-300 font-semibold mb-0.5">Shared Visibility Warning</strong>
                    Your SimpleFIN connection and its sync status will be visible to the primary user and other members of this shared account, but only you will be able to edit or delete it.
                  </div>
                </div>
              )}

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
              <p className="text-xs text-muted-foreground mb-4">
                <strong>Hide</strong> completely removes the account from lists, charts, and transaction histories. 
                <strong> Exclude</strong> removes the account from all dashboard pages, lists, and net worth calculations. It will only remain visible here in the automatic accounts list to allow configuration.
              </p>

              <div className="flex items-center gap-2 mb-4">
                <div className="flex rounded-lg bg-muted border border-border">
                  {(['all', 'hidden', 'excluded'] as const).map((filter) => (
                    <button
                      key={filter}
                      onClick={() => setAccountFilter(filter)}
                      className={`px-3 py-1.5 text-xs font-medium transition-colors shrink-0 ${
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
                            className={`p-4 bg-muted/30 border border-border rounded-lg cursor-pointer group hover:bg-muted/50 transition-colors ${
                              account.isHidden || account.isExcludedFromNetWorth ? 'opacity-60' : ''
                            }`}
                            onClick={() => handleOpenAccountDrawer(account)}
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className={`shrink-0 px-2 py-0.5 text-xs rounded-full font-medium ${
                                    account.type === 'checking' ? 'bg-chart-4 text-white' :
                                    account.type === 'savings' ? 'bg-chart-1 text-white' :
                                    account.type === 'credit' ? 'bg-chart-2 text-white' :
                                    isInvestmentAccount(account.type) ? 'bg-chart-3 text-white' :
                                    account.type === 'loan' ? 'bg-chart-5 text-white' :
                                    account.type === 'mortgage' ? 'bg-chart-5 text-white' :
                                    'bg-muted text-muted-foreground'
                                  }`}>
                                    {account.type}
                                  </span>
                                  {account.isHidden && (
                                    <span className="shrink-0 px-2 py-0.5 text-xs rounded-full bg-muted text-muted-foreground">Hidden</span>
                                  )}
                                  {account.isExcludedFromNetWorth && (
                                    <span className="shrink-0 px-2 py-0.5 text-xs rounded-full bg-muted text-muted-foreground">Excluded</span>
                                  )}
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
                                {account.institution && (
                                  <div className="text-xs text-muted-foreground mt-0.5">{account.institution}</div>
                                )}
                              </div>
                              <div className="text-right shrink-0">
                                <div className="font-mono text-sm text-foreground blur-number">{formatted}</div>
                                <div className="text-xs text-muted-foreground/60">{account.currency}</div>
                              </div>
                            </div>
                            <div className="flex items-center justify-end gap-3 mt-3 pt-3 border-t border-border/50 flex-wrap">
                              <div className="flex items-center gap-1.5">
                                <button
                                  onClick={handleToggleAccount(account.id, 'isHidden')}
                                  className={`relative w-9 h-4 rounded-full transition-colors ${
                                    account.isHidden ? 'bg-primary' : 'bg-muted-foreground/30'
                                  }`}
                                  title={account.isHidden ? 'Show account' : 'Hide account'}
                                >
                                  <span
                                    className={`absolute top-0.5 left-0.5 w-3 h-3 bg-background rounded-full shadow transition-transform ${
                                      account.isHidden ? 'translate-x-5' : 'translate-x-0'
                                    }`}
                                  />
                                </button>
                                <span className="text-[10px] text-muted-foreground">{account.isHidden ? 'Hidden' : 'Visible'}</span>
                              </div>
                              <div className="flex items-center gap-1.5">
                                <button
                                  onClick={handleToggleAccount(account.id, 'isExcludedFromNetWorth')}
                                  className={`relative w-9 h-4 rounded-full transition-colors ${
                                      account.isExcludedFromNetWorth ? 'bg-primary' : 'bg-muted-foreground/30'
                                  }`}
                                  title={account.isExcludedFromNetWorth ? 'Include in net worth' : 'Exclude from net worth'}
                                >
                                  <span
                                    className={`absolute top-0.5 left-0.5 w-3 h-3 bg-background rounded-full shadow transition-transform ${
                                      account.isExcludedFromNetWorth ? 'translate-x-5' : 'translate-x-0'
                                    }`}
                                  />
                                </button>
                                <span className="text-[10px] text-muted-foreground">{account.isExcludedFromNetWorth ? 'Excluded' : 'Included'}</span>
                              </div>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleOpenAccountDrawer(account);
                                }}
                                className="px-2 py-1 text-[10px] font-medium text-muted-foreground hover:text-foreground border border-border hover:bg-muted rounded-lg transition-colors"
                              >
                                Edit
                              </button>
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
        <div className="p-3 sm:p-5 bg-card border border-border rounded-xl min-h-[400px]">
          <RulesTab />
        </div>
      )}

      {activeTab === 'analytics' && (
        <div className="p-5 bg-card border border-border rounded-xl min-h-[400px]">
          <AnalyticsTab />
        </div>
      )}

      {activeTab === 'sharing' && (
        <div className="p-4 sm:p-5 bg-card border border-border rounded-xl min-h-[400px]">
          <SharingTab />
        </div>
      )}

      {activeTab === 'advanced' && (
        <div className="p-3 sm:p-5 bg-card border border-border rounded-xl min-h-[400px]">
          <AdvancedTab />
        </div>
      )}

      {activeTab === 'ai' && (
        <div className="p-5 bg-card border border-border rounded-xl min-h-[400px]">
          <AiTab />
        </div>
      )}

      {activeTab === 'import' && (
        <ImportTab />
      )}

      {activeTab === 'payroll' && (
        <PayrollTab />
      )}

            </main>
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
                    <label className="text-sm text-muted-foreground">Sync Frequency</label>
                    <div className="mt-1 text-foreground text-sm capitalize">{detailsConn.syncFrequency}</div>
                  </div>
                  <div>
                    <label className="text-sm text-muted-foreground">Last Sync</label>
                    <div className="mt-1 text-foreground text-sm">{formatRelativeTime(detailsConn.lastSyncAt)}</div>
                  </div>
                  <div>
                    <label className="text-sm text-muted-foreground">Next Sync</label>
                    <div className="mt-1 text-foreground text-sm">
                      {detailsConn.syncFrequency === 'manual'
                        ? 'Not scheduled'
                        : (() => {
                            const ns = computeNextSync(detailsConn.syncFrequency, detailsConn.lastSyncAt);
                            if (!ns) return 'Not scheduled';
                            if (ns.getTime() <= Date.now()) return 'Overdue';
                            return formatRelativeTime(ns.toISOString());
                          })()
                      }
                    </div>
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

          {/* Re-mapping Dialog */}
          <Dialog open={isRemapDialogOpen} onOpenChange={setIsRemapDialogOpen}>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>Re-map Unlinked Account</DialogTitle>
                <DialogDescription>
                  Reconnect an orphaned automatic account to an active synced account to preserve all history.
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4 py-2">
                <div>
                  <label className="text-sm font-medium text-foreground block mb-1">
                    Orphaned Account (Source)
                  </label>
                  <p className="text-xs text-muted-foreground mb-2">
                    The original account with all your historical transactions and balance snapshots.
                  </p>
                  <select
                    value={remapSourceId}
                    onChange={(e) => setRemapSourceId(e.target.value)}
                    className="w-full text-sm bg-background border border-border rounded-lg px-3 py-2 text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                  >
                    <option value="">Select orphaned account...</option>
                    {orphanedAccounts.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name} ({a.institution || 'Unknown Bank'})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-sm font-medium text-foreground block mb-1">
                    Active Synced Account (Target)
                  </label>
                  <p className="text-xs text-muted-foreground mb-2">
                    The newly synced duplicate account that you want to merge into the old account.
                  </p>
                  <select
                    value={remapTargetId}
                    onChange={(e) => setRemapTargetId(e.target.value)}
                    className="w-full text-sm bg-background border border-border rounded-lg px-3 py-2 text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                  >
                    <option value="">Select active synced account...</option>
                    {activeAutomaticAccounts.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name} ({a.institution || 'Unknown Bank'})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg flex items-start gap-2.5">
                  <AlertCircle className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    <strong className="text-foreground">Important:</strong> Any new transactions on the target account will be moved to the source account, its external credentials will be updated, and the duplicate target account record will be deleted.
                  </p>
                </div>

                {remapError && (
                  <div className="p-3 bg-destructive/20 border border-destructive/30 rounded-lg text-sm text-destructive">
                    {remapError}
                  </div>
                )}

                {remapSuccess && (
                  <div className="p-3 bg-chart-1/20 border border-chart-1/30 rounded-lg text-sm text-chart-1">
                    {remapSuccess}
                  </div>
                )}
              </div>

              <DialogFooter>
                <button
                  onClick={() => setIsRemapDialogOpen(false)}
                  disabled={remapLoading}
                  className="px-4 py-2 text-sm text-foreground bg-muted hover:bg-accent rounded-lg transition-colors disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleRemap}
                  disabled={remapLoading || !remapSourceId || !remapTargetId}
                  className="px-4 py-2 text-sm font-semibold text-primary-foreground bg-primary hover:opacity-90 rounded-lg transition-opacity disabled:opacity-50"
                >
                  {remapLoading ? 'Re-mapping...' : 'Re-map Account'}
                </button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {/* Account Detail Drawer */}
          <AccountDetailDrawer
            account={selectedAccount}
            open={accountDrawerOpen}
            onClose={handleCloseAccountDrawer}
            onSuccess={handleAccountDrawerSuccess}
          />
      </PageContent>
    </div>
  );
}

export default function SettingsPage() {
  return (
    <Suspense fallback={null}>
      <SettingsPageBody />
    </Suspense>
  );
}
