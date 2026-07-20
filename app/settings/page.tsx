'use client';

import { useState, useEffect, useCallback, Suspense, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { usePlaidLink } from 'react-plaid-link';
import { useQueryClient } from '@tanstack/react-query';
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
  Users2,
  Info,
  AlertTriangle,
  X,
  ChevronDown,
  ChevronUp,
  Link2,
  ArrowUpDown,
  Bell,
  BellOff
} from 'lucide-react';
import ModeToggle from '@/components/mode-toggle';
import { useSidebar } from '@/components/sidebar-context';
import { usePrivacyMode } from '@/components/privacy-mode-provider';
import { useUserSettings } from '@/components/user-settings-provider';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { isInvestmentAccount } from '@/lib/utils/account-scope';
import AccountDetailDrawer from '@/components/features/accounts/AccountDetailDrawer';
import { getBadgeClasses } from '@/lib/utils/account-badge';
import CategoriesTab from '@/components/features/settings/CategoriesTab';
import RulesTab from '@/components/features/settings/RulesTab';
import AnalyticsTab from '@/components/features/settings/AnalyticsTab';
import AccentPicker from '@/components/features/settings/AccentPicker';
import ManualAccountsSection from '@/components/features/settings/ManualAccountsSection';
import AiTab from '@/components/features/settings/AiTab';
import AdvancedTab from '@/components/features/settings/AdvancedTab';
import NotificationsTab from '@/components/features/settings/NotificationsTab';
import ImportTab from '@/components/features/settings/ImportTab';
import PayrollTab from '@/components/features/settings/PayrollTab';
import TagsTab from '@/components/features/settings/TagsTab';
import SharingTab from '@/components/features/settings/SharingTab';
import { useChartColorScheme } from '@/lib/hooks/use-chart-colors';
import { CHART_COLOR_SCHEMES, type ChartColorSchemeId } from '@/lib/utils/chart-color-schemes';
import { useHiddenPages, HIDDEN_PAGE_KEYS, DEV_MODE_PAGE_KEYS } from '@/lib/hooks/use-hidden-pages';
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
  provider?: string;
  disabledAccounts?: string[];
};

const SYNC_INTERVALS: Record<string, number> = {
  manual: 0,
  hourly: 60 * 60 * 1000,
  daily: 24 * 60 * 60 * 1000,
  weekly: 7 * 24 * 60 * 60 * 1000,
  margin: 0,
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
  plaidConnectionId?: string | null;
  externalId?: string | null;
  isHidden: boolean;
  isExcludedFromNetWorth: boolean;
  balanceDate: string | null;
  tags?: { id: string; name: string; color: string }[];
  metadata?: Record<string, any> | string | null;
  syncStatus?: { status: 'ok' | 'warning' | 'error'; reason?: string; lastSyncAt?: string } | null;
};

const SETTINGS_TABS = [
  { id: 'general' as const, label: 'General', description: 'Appearance, accent color, and layout preferences', icon: Settings },
  { id: 'accounts' as const, label: 'Accounts', description: 'Configure visible accounts, manual accounts, and bank connections', icon: Landmark },
  { id: 'categories' as const, label: 'Categories', description: 'Transaction category display and structure', icon: LayoutGrid },
  { id: 'rules' as const, label: 'Rules', description: 'Automatic transaction categorization rules', icon: GitBranch },
  { id: 'tags' as const, label: 'Tags', description: 'Labels for transactional tagging and filtering', icon: Tag },
  { id: 'analytics' as const, label: 'Analytics', description: 'Chart color schemes and forecasting bounds', icon: BarChart3 },
  { id: 'ai' as const, label: 'AI Suggestions', description: 'AI provider endpoints, model parameters, and keys', icon: Sparkles },
  { id: 'import' as const, label: 'Import', description: 'Manually upload statement files (CSV/OFX)', icon: UploadCloud },
  { id: 'payroll' as const, label: 'Payroll', description: 'Paystub parsing templates and forecasts', icon: FileText },
  { id: 'sharing' as const, label: 'Sharing', description: 'Invite others to share your financial data', icon: Users2 },
  { id: 'notifications' as const, label: 'Notifications', description: 'Configure push notifications and alert preferences', icon: Bell },
  { id: 'advanced' as const, label: 'Advanced', description: 'Backups, dev tools, and database settings', icon: ShieldAlert },
];

const invalidateAllFinanceQueries = (queryClient: any) => {
  queryClient.invalidateQueries({ queryKey: ['accounts'] });
  queryClient.invalidateQueries({ queryKey: ['account-transactions'] });
  queryClient.invalidateQueries({ queryKey: ['budgets'] });
  queryClient.invalidateQueries({ queryKey: ['budgets-chart'] });
  queryClient.invalidateQueries({ queryKey: ['cash-flow-monthly'] });
  queryClient.invalidateQueries({ queryKey: ['real-estate-properties'] });
  queryClient.invalidateQueries({ queryKey: ['investments'] });
};

interface PlaidLinkHandlerProps {
  token: string;
  onSuccess: (publicToken: string, metadata: any) => void;
  onExit: () => void;
}

function PlaidLinkHandler({ token, onSuccess, onExit }: PlaidLinkHandlerProps) {
  const { open, ready } = usePlaidLink({
    token,
    onSuccess,
    onExit,
  });

  const openedRef = useRef(false);

  useEffect(() => {
    if (ready && !openedRef.current) {
      openedRef.current = true;
      open();
    }
  }, [ready, open]);

  return null;
}

function SettingsPageBody() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { data: session } = useSession();
  const currentUserId = session?.user?.id;
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

  const settingsContext = useUserSettings();
  const settings = settingsContext?.settings || {};
  const updateSetting = settingsContext?.updateSetting;
  const deletePendingOlderThan30Days = settings.deletePendingOlderThan30Days ?? true;
  const deletePendingDays = settings.deletePendingDays ?? 10;
  const [savingDeletePending, setSavingDeletePending] = useState(false);
  const [savingDeletePendingDays, setSavingDeletePendingDays] = useState(false);
  const [localDays, setLocalDays] = useState<string>('10');

  useEffect(() => {
    if (settings.deletePendingDays !== undefined) {
      setLocalDays(settings.deletePendingDays.toString());
    }
  }, [settings.deletePendingDays]);

  const handleToggleDeletePending = useCallback(async (checked: boolean) => {
    setSavingDeletePending(true);
    try {
      if (updateSetting) {
        await updateSetting('deletePendingOlderThan30Days', checked);
      }
    } catch (e) {
      console.error('Failed to toggle deletePendingOlderThan30Days', e);
    } finally {
      setSavingDeletePending(false);
    }
  }, [updateSetting]);

  const handleDeletePendingDaysChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setLocalDays(e.target.value);
  }, []);

  const handleDeletePendingDaysBlur = useCallback(async () => {
    let val = parseInt(localDays) || 10;
    if (val < 1) val = 1;
    setLocalDays(val.toString());
    
    if (updateSetting) {
      setSavingDeletePendingDays(true);
      try {
        await updateSetting('deletePendingDays', val);
      } catch (e) {
        console.error('Failed to update deletePendingDays', e);
      } finally {
        setSavingDeletePendingDays(false);
      }
    }
  }, [localDays, updateSetting]);
  const [connections, setConnections] = useState<Connection[]>([]);
  const [connectionsLoading, setConnectionsLoading] = useState(true);
  const [syncingId, setSyncingId] = useState<string | null>(null);
  const [fullResyncId, setFullResyncId] = useState<string | null>(null);
  const [fullResyncConn, setFullResyncConn] = useState<Connection | null>(null);
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

  const [plaidLinkToken, setPlaidLinkToken] = useState<string | null>(null);
  const [plaidLoading, setPlaidLoading] = useState(false);
  const [plaidLinkError, setPlaidLinkError] = useState('');
  const [plaidLinkSuccess, setPlaidLinkSuccess] = useState('');
  const [showSimpleFinForm, setShowSimpleFinForm] = useState(false);
  const [isPlaidCredentialsDialogOpen, setIsPlaidCredentialsDialogOpen] = useState(false);
  const [plaidClientId, setPlaidClientId] = useState('');
  const [plaidSecret, setPlaidSecret] = useState('');
  const [plaidEnvironment, setPlaidEnvironment] = useState('sandbox');
  const [savingPlaidCredentials, setSavingPlaidCredentials] = useState(false);
  const [dismissedPlaidHourlyWarnings, setDismissedPlaidHourlyWarnings] = useState<string[]>([]);
  const [isPricingExpanded, setIsPricingExpanded] = useState(false);
  const [isAddConnectionExpanded, setIsAddConnectionExpanded] = useState(true);
  const [isSyncFeesExpanded, setIsSyncFeesExpanded] = useState(false);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('dismissed_plaid_hourly');
      if (saved) {
        try {
          setDismissedPlaidHourlyWarnings(JSON.parse(saved));
        } catch (e) {}
      }
    }
  }, []);

  const dismissPlaidHourlyWarning = (connId: string) => {
    const updated = [...dismissedPlaidHourlyWarnings, connId];
    setDismissedPlaidHourlyWarnings(updated);
    localStorage.setItem('dismissed_plaid_hourly', JSON.stringify(updated));
  };

  const handleExchangePublicToken = async (publicToken: string, metadata: any) => {
    setLoading(true);
    setPlaidLinkError('');
    setPlaidLinkSuccess('');
    try {
      const res = await fetch('/api/plaid/exchange-public-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          publicToken,
          institutionName: metadata.institution?.name || 'Plaid Bank',
          institutionId: metadata.institution?.institution_id || null,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setPlaidLinkSuccess(`Successfully connected bank via Plaid!`);
        await fetchConnections();
        await fetchAccounts();
      } else {
        setPlaidLinkError(data.message || 'Failed to exchange public token');
      }
    } catch {
      setPlaidLinkError('Failed to exchange public token');
    } finally {
      setLoading(false);
      setPlaidLinkToken(null);
    }
  };

  const handleConnectPlaid = async () => {
    setPlaidLoading(true);
    setPlaidLinkError('');
    setPlaidLinkSuccess('');
    try {
      const res = await fetch('/api/plaid/create-link-token', {
        method: 'POST',
        credentials: 'include',
      });
      const data = await res.json();
      if (res.ok && data.link_token) {
        setPlaidLinkToken(data.link_token);
      } else if (data.error === 'not_configured') {
        try {
          const settingsRes = await fetch('/api/user-settings', { credentials: 'include' });
          if (settingsRes.ok) {
            const settingsData = await settingsRes.json();
            setPlaidClientId(settingsData.apiKeys?.plaidClientId || '');
            setPlaidSecret(settingsData.apiKeys?.plaidSecret || '');
            setPlaidEnvironment(settingsData.apiKeys?.plaidEnvironment || 'sandbox');
          }
        } catch {}
        setIsPlaidCredentialsDialogOpen(true);
      } else {
        setPlaidLinkError(data.message || 'Failed to initialize Plaid Link.');
      }
    } catch {
      setPlaidLinkError('Failed to initialize Plaid Link');
    } finally {
      setPlaidLoading(false);
    }
  };

  const handleResetPlaidKeys = async () => {
    setPlaidLinkError('');
    setPlaidLinkSuccess('');
    try {
      const settingsRes = await fetch('/api/user-settings', { credentials: 'include' });
      if (settingsRes.ok) {
        const settingsData = await settingsRes.json();
        setPlaidClientId(settingsData.apiKeys?.plaidClientId || '');
        setPlaidSecret(settingsData.apiKeys?.plaidSecret || '');
        setPlaidEnvironment(settingsData.apiKeys?.plaidEnvironment || 'sandbox');
      }
    } catch {}
    setIsPlaidCredentialsDialogOpen(true);
  };

  const handleSavePlaidCredentials = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingPlaidCredentials(true);
    setPlaidLinkError('');
    setPlaidLinkSuccess('');
    try {
      const settingsRes = await fetch('/api/user-settings', { credentials: 'include' });
      if (!settingsRes.ok) throw new Error('Failed to retrieve current settings');
      const settingsData = await settingsRes.json();

      const currentApiKeys = settingsData.apiKeys || {};
      const mergedApiKeys = {
        ...currentApiKeys,
        plaidClientId: plaidClientId.trim(),
        plaidSecret: plaidSecret.trim(),
        plaidEnvironment,
      };

      const saveRes = await fetch('/api/user-settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ apiKeys: mergedApiKeys }),
      });

      if (!saveRes.ok) {
        const errorData = await saveRes.json();
        throw new Error(errorData.error || 'Failed to save settings');
      }

      setIsPlaidCredentialsDialogOpen(false);
      setPlaidLinkSuccess('Plaid credentials saved successfully.');
      
      // Auto-retry Plaid Link initiation after dialog closes
      setTimeout(() => {
        handleConnectPlaid();
      }, 300);
    } catch (err: any) {
      setPlaidLinkError(err.message || 'Failed to save Plaid credentials');
    } finally {
      setSavingPlaidCredentials(false);
    }
  };

  const { scheme: chartScheme, updateScheme: updateChartScheme } = useChartColorScheme();
  const { isHidden, updateHidden } = useHiddenPages();
  const { hideSubheadings, updateHideSubheadings } = useAccountSubheadings();
  const searchParams = useSearchParams();
  const urlTab = searchParams.get('tab');
  const activeTab = urlTab && ['general', 'accounts', 'categories', 'rules', 'tags', 'analytics', 'ai', 'import', 'payroll', 'sharing', 'notifications', 'advanced'].includes(urlTab)
    ? (urlTab as 'general' | 'accounts' | 'categories' | 'rules' | 'tags' | 'analytics' | 'ai' | 'import' | 'payroll' | 'sharing' | 'notifications' | 'advanced')
    : 'general';

  const goToTab = useCallback((tab: typeof activeTab, subTab?: string) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set('tab', tab);
    if (subTab) {
      params.set('sub', subTab);
    } else {
      params.delete('sub');
    }
    router.replace(`/settings?${params.toString()}`, { scroll: false });
  }, [searchParams, router]);
  const [accountSubTab, setAccountSubTab] = useState<'automatic' | 'manual' | 'connections'>('connections');

  const urlSub = searchParams.get('sub');

  useEffect(() => {
    if (urlSub && ['automatic', 'manual', 'connections'].includes(urlSub)) {
      setAccountSubTab(urlSub as 'automatic' | 'manual' | 'connections');
    }
  }, [urlSub]);

  const [accounts, setAccounts] = useState<Account[]>([]);
  const [accountsLoading, setAccountsLoading] = useState(true);
  const [mutingAccountId, setMutingAccountId] = useState<string | null>(null);
  const [accountFilter, setAccountFilter] = useState<'all' | 'visible' | 'included' | 'hidden' | 'excluded' | 'plaid' | 'simplefin'>('all');
  const [selectedAccount, setSelectedAccount] = useState<Account | null>(null);
  const [accountDrawerOpen, setAccountDrawerOpen] = useState(false);

  const [isRemapDialogOpen, setIsRemapDialogOpen] = useState(false);
  const [remapSourceId, setRemapSourceId] = useState('');
  const [remapTargetId, setRemapTargetId] = useState('');
  const [remapLoading, setRemapLoading] = useState(false);
  const [remapError, setRemapError] = useState('');
  const [remapSuccess, setRemapSuccess] = useState('');

  const [isRelinkDialogOpen, setIsRelinkDialogOpen] = useState(false);
  const [relinkAccount, setRelinkAccount] = useState<Account | null>(null);
  const [relinkTargetConnectionId, setRelinkTargetConnectionId] = useState('');
  const [relinkLoading, setRelinkLoading] = useState(false);
  const [relinkError, setRelinkError] = useState('');
  const [relinkSuccess, setRelinkSuccess] = useState('');

  const [isManageSyncDialogOpen, setIsManageSyncDialogOpen] = useState(false);
  const [manageSyncConn, setManageSyncConn] = useState<Connection | null>(null);
  const [manageSyncAccounts, setManageSyncAccounts] = useState<Array<{ id: string; name: string; institution: string; balance: string; currency: string }>>([]);
  const [manageSyncLoading, setManageSyncLoading] = useState(false);
  const [manageSyncSaving, setManageSyncSaving] = useState(false);
  const [manageSyncError, setManageSyncError] = useState('');
  const [tempDisabledAccounts, setTempDisabledAccounts] = useState<string[]>([]);

  const [accountToDelete, setAccountToDelete] = useState<Account | null>(null);
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
  const [isDeleteLoading, setIsDeleteLoading] = useState(false);
  const [deleteError, setDeleteError] = useState('');

  const [accountToConvert, setAccountToConvert] = useState<Account | null>(null);
  const [isConvertConfirmOpen, setIsConvertConfirmOpen] = useState(false);
  const [isConvertLoading, setIsConvertLoading] = useState(false);
  const [convertError, setConvertError] = useState('');



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

  const handleMuteSyncAlerts = useCallback(async (account: Account) => {
    setMutingAccountId(account.id);
    try {
      let currentMetadata: Record<string, any> = {};
      const rawMeta = account.metadata as any;
      if (typeof rawMeta === 'string' && rawMeta.trim() !== '') {
        try {
          currentMetadata = JSON.parse(rawMeta);
        } catch {}
      } else if (typeof rawMeta === 'object' && rawMeta !== null) {
        currentMetadata = rawMeta;
      }

      const payload = {
        metadata: {
          ...currentMetadata,
          muteSyncWarnings: true,
        }
      };

      const res = await fetch(`/api/accounts/${account.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload),
      });

      if (!res.ok) throw new Error('Failed to mute sync alerts');
      
      // Reload accounts list
      fetchAccounts();
    } catch (err: any) {
      alert(err.message || 'An error occurred');
    } finally {
      setMutingAccountId(null);
    }
  }, [fetchAccounts]);

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
      invalidateAllFinanceQueries(queryClient);
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

  const handleSwapRemapAccounts = useCallback(() => {
    const temp = remapSourceId;
    setRemapSourceId(remapTargetId);
    setRemapTargetId(temp);
  }, [remapSourceId, remapTargetId]);

  const handleRelink = useCallback(async () => {
    if (!relinkAccount || !relinkTargetConnectionId) {
      setRelinkError('Please select a sync connection.');
      return;
    }
    setRelinkLoading(true);
    setRelinkError('');
    setRelinkSuccess('');
    try {
      const conn = connections.find((c) => c.id === relinkTargetConnectionId);
      if (!conn) {
        throw new Error('Selected connection not found.');
      }

      const isPlaid = conn.provider !== 'simplefin';
      const body = {
        connectionId: isPlaid ? null : conn.id,
        plaidConnectionId: isPlaid ? conn.id : null,
      };

      const res = await fetch(`/api/accounts/${relinkAccount.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || 'Failed to re-link account');
      }
      setRelinkSuccess('Account re-linked successfully!');
      await fetchAccounts();
      invalidateAllFinanceQueries(queryClient);
      setTimeout(() => {
        setIsRelinkDialogOpen(false);
        setRelinkAccount(null);
        setRelinkTargetConnectionId('');
        setRelinkSuccess('');
      }, 1500);
    } catch (err) {
      setRelinkError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setRelinkLoading(false);
    }
  }, [relinkAccount, relinkTargetConnectionId, connections, fetchAccounts]);

  const openManageSync = useCallback(async (conn: Connection) => {
    setManageSyncConn(conn);
    setIsManageSyncDialogOpen(true);
    setManageSyncLoading(true);
    setManageSyncError('');
    setManageSyncAccounts([]);
    setTempDisabledAccounts([]);
    try {
      const res = await fetch(`/api/connections/${conn.id}/accounts`);
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || 'Failed to fetch accounts');
      }
      setManageSyncAccounts(data.accounts || []);
      setTempDisabledAccounts(data.disabledAccounts || []);
    } catch (err) {
      setManageSyncError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setManageSyncLoading(false);
    }
  }, []);

  const handleSaveDisabledAccounts = useCallback(async () => {
    if (!manageSyncConn) return;
    setManageSyncSaving(true);
    setManageSyncError('');
    try {
      const res = await fetch(`/api/connections/${manageSyncConn.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          disabledAccounts: tempDisabledAccounts,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || 'Failed to save settings');
      }
      setIsManageSyncDialogOpen(false);
      await fetchConnections();
      await fetchAccounts();
      invalidateAllFinanceQueries(queryClient);
    } catch (err) {
      setManageSyncError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setManageSyncSaving(false);
    }
  }, [manageSyncConn, tempDisabledAccounts, fetchConnections, fetchAccounts]);

  const handleDeleteAccount = useCallback(async () => {
    if (!accountToDelete) return;
    setIsDeleteLoading(true);
    setDeleteError('');
    try {
      const res = await fetch(`/api/accounts/${accountToDelete.id}`, {
        method: 'DELETE',
        headers: {
          'X-Confirm-Delete': 'true',
        },
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || 'Failed to delete account');
      }
      setIsDeleteConfirmOpen(false);
      setAccountToDelete(null);
      await fetchAccounts();
      await fetchConnections();
      invalidateAllFinanceQueries(queryClient);
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setIsDeleteLoading(false);
    }
  }, [accountToDelete, fetchAccounts, fetchConnections]);


  const handleConvertToManual = useCallback(async () => {
    if (!accountToConvert) return;
    setIsConvertLoading(true);
    setConvertError('');
    try {
      const res = await fetch(`/api/accounts/${accountToConvert.id}/convert-to-manual`, {
        method: 'POST',
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || 'Failed to convert account to manual');
      }
      setIsConvertConfirmOpen(false);
      setAccountToConvert(null);
      await fetchAccounts();
      await fetchConnections();
      invalidateAllFinanceQueries(queryClient);
    } catch (err) {
      setConvertError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setIsConvertLoading(false);
    }
  }, [accountToConvert, fetchAccounts, fetchConnections]);



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
        invalidateAllFinanceQueries(queryClient);
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
      await fetchAccounts();
      invalidateAllFinanceQueries(queryClient);
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
      if (res.ok) {
        await fetchConnections();
        await fetchAccounts();
        invalidateAllFinanceQueries(queryClient);
      }
    } catch {
      setSyncResult({ status: 'error', accountsSynced: 0, transactionsFetched: 0, transactionsNew: 0, transactionsUpdated: 0, durationMs: 0, details: [] });
    } finally {
      setSyncingId(null);
    }
  };

  const handleFullResync = async () => {
    if (!fullResyncConn) return;
    const connId = fullResyncConn.id;
    setFullResyncConn(null);
    setFullResyncId(connId);
    setSyncResult(null);
    try {
      const res = await fetch(`/api/connections/${connId}/reset-cursor`, {
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
      if (res.ok) {
        await fetchConnections();
        await fetchAccounts();
        invalidateAllFinanceQueries(queryClient);
      }
    } catch {
      setSyncResult({ status: 'error', accountsSynced: 0, transactionsFetched: 0, transactionsNew: 0, transactionsUpdated: 0, durationMs: 0, details: [] });
    } finally {
      setFullResyncId(null);
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
        invalidateAllFinanceQueries(queryClient);
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
    if (conn.provider === 'plaid') {
      return 'Plaid Item (Encrypted Access Token)';
    }
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
  const hasMySimpleFin = connections.some((conn) => conn.userId === currentUserId && conn.provider === 'simplefin');

  const orphanedAccounts = accounts.filter(
    (a) =>
      !a.connectionId &&
      !a.plaidConnectionId &&
      a.externalId &&
      a.type !== 'paystub' &&
      !a.externalId.startsWith('manual-') &&
      !a.externalId.startsWith('adj-') &&
      !a.externalId.startsWith('virtual-')
  );

  const activeAutomaticAccounts = accounts.filter((a) => a.connectionId !== null || a.plaidConnectionId !== null);

  const calculateConnectionCost = (conn: Connection) => {
    if (conn.provider === 'simplefin') {
      return {
        baseFee: 1.50,
        refreshCost: 0,
        total: 1.50,
      };
    }

    const hasInvestments = accounts.some(
      (acc) => acc.plaidConnectionId === conn.id && isInvestmentAccount(acc.type)
    );

    const baseFee = 0.30 + (hasInvestments ? 0.30 : 0);

    let refreshesPerMonth = 0;
    if (conn.syncFrequency === 'hourly') {
      refreshesPerMonth = 24 * 30;
    } else if (conn.syncFrequency === 'daily') {
      refreshesPerMonth = 1 * 30;
    } else if (conn.syncFrequency === 'weekly') {
      refreshesPerMonth = 4.3;
    } else if (conn.syncFrequency === 'monthly') {
      refreshesPerMonth = 1;
    }

    const refreshCost = refreshesPerMonth * 0.08;
    const total = baseFee + refreshCost;
    return {
      baseFee,
      refreshCost,
      total,
    };
  };


  const renderOrphanedAccountsAlert = () => {
    if (orphanedAccounts.length === 0) return null;

    return (
      <div className="p-4 bg-amber-500/10 border border-amber-500/25 rounded-xl mb-5 sm:mb-6 flex flex-col gap-3.5 animate-in fade-in slide-in-from-top-2 duration-300">
        <div className="flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-semibold text-amber-500">Unlinked Accounts Detected</h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              The following automatic accounts are no longer connected to a bank integration. You can re-map them to an active connection to resume sync, convert them to manual accounts to manage them yourself while preserving historical data, or delete them to permanently remove them.
            </p>
          </div>
        </div>

        <div className="divide-y divide-border/40 border border-border/60 rounded-lg overflow-hidden bg-background/40 backdrop-blur-xs">
          {orphanedAccounts.map((a) => (
            <div key={a.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 text-xs">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-semibold text-foreground truncate">{a.name}</span>
                  <span className="px-1.5 py-0.5 text-[10px] font-medium rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
                    Unlinked
                  </span>
                  {a.institution && (
                    <span className="text-muted-foreground truncate flex-1 min-w-0">· {a.institution}</span>
                  )}
                </div>
                <div className="text-[10px] text-muted-foreground mt-0.5 flex items-center gap-1.5">
                  <span>Balance: {parseFloat(a.balance || '0').toLocaleString('en-US', { style: 'currency', currency: a.currency || 'USD' })}</span>
                  <span>·</span>
                  <span>Type: {a.type}</span>
                </div>
              </div>
              <div className="flex items-center gap-2 self-end sm:self-center flex-shrink-0">
                <button
                  onClick={() => {
                    setRelinkAccount(a);
                    setRelinkTargetConnectionId(connections[0]?.id || '');
                    setIsRelinkDialogOpen(true);
                  }}
                  className="px-2.5 py-1.5 text-[11px] font-semibold text-foreground bg-muted hover:bg-accent border border-border rounded-md transition-colors"
                >
                  Re-link
                </button>
                <button
                  onClick={() => {
                    setRemapSourceId(a.id);
                    setRemapTargetId(activeAutomaticAccounts[0]?.id || '');
                    setIsRemapDialogOpen(true);
                  }}
                  className="px-2.5 py-1.5 text-[11px] font-semibold text-foreground bg-muted hover:bg-accent border border-border rounded-md transition-colors"
                >
                  Re-map
                </button>
                <button
                  onClick={() => {
                    setAccountToConvert(a);
                    setIsConvertConfirmOpen(true);
                  }}
                  className="px-2.5 py-1.5 text-[11px] font-semibold text-foreground bg-muted hover:bg-accent border border-border rounded-md transition-colors"
                >
                  Convert to Manual
                </button>
                <button
                  onClick={() => {
                    setAccountToDelete(a);
                    setIsDeleteConfirmOpen(true);
                  }}
                  className="px-2.5 py-1.5 text-[11px] font-semibold text-destructive hover:bg-destructive/10 border border-destructive/20 rounded-md transition-colors"
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  };

  return (

    <div className="min-h-screen w-full">
      {plaidLinkToken && (
        <PlaidLinkHandler
          token={plaidLinkToken}
          onSuccess={(publicToken, metadata) => {
            handleExchangePublicToken(publicToken, metadata);
          }}
          onExit={() => {
            setPlaidLinkToken(null);
          }}
        />
      )}
      <PageHeader title="Settings" icon={Settings} />
      <PageContent className="flex flex-col items-center" maxWidth="max-w-6xl">

          {/* Setup Checklist */}
          <div className="mb-5 sm:mb-6">
            <OnboardingChecklist />
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
                          ? 'bg-primary border-primary/30 text-primary-foreground shadow-sm shadow-primary/15'
                          : 'bg-transparent border-border/20 text-muted-foreground hover:text-foreground hover:bg-muted/75'
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
          <div className="p-3 sm:p-5 bg-card border border-border rounded-xl">
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

              {/* Privacy Mode */}
              <div className="flex items-center justify-between gap-4 pb-5 border-b border-border">
                <div className="flex-1 min-w-0">
                  <h3 className="text-sm font-medium text-foreground">Privacy Mode</h3>
                  <p className="text-xs text-muted-foreground mt-1">Pixelate financial data when showing the app to others</p>
                </div>
                <Switch
                  checked={privacyMode ?? false}
                  onCheckedChange={togglePrivacyMode}
                  disabled={privacyModeLoading}
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

              {/* Dev Mode */}
              <div className="flex items-center justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <h3 className="text-sm font-medium text-foreground">Developer Tools</h3>
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
          <div className="p-3 sm:p-5 bg-card border border-border rounded-xl">
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
                    pageKey === 'flows' ? 'Flows' :
                    pageKey === 'budgets' ? 'Budgets' :
                    pageKey === 'realEstate' ? 'Real Estate' :
                    pageKey === 'investments' ? 'Investments' :

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
        <div className="p-3 sm:p-5 bg-card border border-border rounded-xl min-h-[400px]">
          <CategoriesTab />
        </div>
      )}

      {activeTab === 'tags' && (
        <div className="p-3 sm:p-5 bg-card border border-border rounded-xl min-h-[400px]">
          <TagsTab />
        </div>
      )}

      {activeTab === 'accounts' && (
        <>
          {/* Sub-tab toggle */}
          <div className="flex border-b border-border/60 w-full gap-6 mb-5 sm:mb-6">
            <button
              onClick={() => {
                setAccountSubTab('connections');
                const params = new URLSearchParams(searchParams.toString());
                params.set('sub', 'connections');
                router.replace(`/settings?${params.toString()}`, { scroll: false });
              }}
              className={`pb-2 px-1 text-xs font-semibold transition-all border-b-2 -mb-px cursor-pointer ${
                accountSubTab === 'connections'
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              Connections
            </button>
            <button
              onClick={() => {
                setAccountSubTab('automatic');
                const params = new URLSearchParams(searchParams.toString());
                params.set('sub', 'automatic');
                router.replace(`/settings?${params.toString()}`, { scroll: false });
              }}
              className={`pb-2 px-1 text-xs font-semibold transition-all border-b-2 -mb-px cursor-pointer ${
                accountSubTab === 'automatic'
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              Automatic Accounts
            </button>
            <button
              onClick={() => {
                setAccountSubTab('manual');
                const params = new URLSearchParams(searchParams.toString());
                params.set('sub', 'manual');
                router.replace(`/settings?${params.toString()}`, { scroll: false });
              }}
              className={`pb-2 px-1 text-xs font-semibold transition-all border-b-2 -mb-px cursor-pointer ${
                accountSubTab === 'manual'
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              Manual Accounts
            </button>
          </div>

          {accountSubTab === 'automatic' && (
        <>
          {(() => {
            const staleAccounts = accounts.filter(
              (acc) => acc.syncStatus && acc.syncStatus.status !== 'ok'
            );
            if (staleAccounts.length === 0) return null;

            return (
              <div className="mb-6 bg-amber-500/10 dark:bg-amber-500/5 border border-amber-500/25 rounded-xl p-4 flex gap-3 text-sm">
                <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
                <div className="flex-1 space-y-1">
                  <h4 className="font-bold text-amber-800 dark:text-amber-400">
                    Some accounts may not be updating properly ({staleAccounts.length})
                  </h4>
                  <p className="text-xs text-muted-foreground">
                    We detected sync errors or stale balances. This can happen if credentials expired or data providers returned cached data.
                  </p>
                  <ul className="text-xs text-amber-700/90 dark:text-amber-300/80 list-disc pl-4 space-y-1 mt-2">
                    {staleAccounts.slice(0, 3).map((acc) => (
                      <li key={acc.id} className="flex items-center flex-wrap gap-x-2">
                        <span className="font-semibold text-foreground">{acc.name}</span>
                        <span className="text-muted-foreground">({acc.institution || 'Manual'})</span>
                        <span className="text-foreground">— {acc.syncStatus?.reason}</span>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleMuteSyncAlerts(acc);
                          }}
                          disabled={mutingAccountId === acc.id}
                          className="text-[10px] text-amber-600 dark:text-amber-400 hover:underline hover:text-amber-700 font-semibold cursor-pointer inline-flex items-center gap-0.5 ml-1"
                        >
                          <BellOff className="w-2.5 h-2.5" />
                          {mutingAccountId === acc.id ? 'Muting...' : 'Mute alerts'}
                        </button>
                      </li>
                    ))}
                    {staleAccounts.length > 3 && (
                      <li className="text-muted-foreground">and {staleAccounts.length - 3} other accounts...</li>
                    )}
                  </ul>
                </div>
              </div>
            );
          })()}
          {/* Transaction Settings Section */}
          <div className="mb-6 pb-6 border-b border-border/60">
            <h2 className="text-base font-semibold text-foreground mb-1">Transaction Settings</h2>
            <p className="text-xs text-muted-foreground mb-4 font-normal">
              Configure cleanup policies and rules for your bank-synced transactions.
            </p>
            
            <div className="p-4 bg-muted/30 border border-border rounded-xl">
              <div className="flex items-center justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <h3 className="text-sm font-medium text-foreground">Automatically Delete Old Pending Transactions</h3>
                  <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                    Automatically delete pending bank transactions older than a configured number of days during account synchronization. 
                    Sometimes financial institutions fail to clear pending transactions, causing duplicate or outdated entries to linger indefinitely.
                  </p>
                </div>
                <Switch
                  checked={deletePendingOlderThan30Days}
                  onCheckedChange={handleToggleDeletePending}
                  disabled={savingDeletePending}
                  id="toggle-delete-pending-old-tx"
                />
              </div>

              {deletePendingOlderThan30Days && (
                <div className="mt-4 pt-4 border-t border-border/40 flex flex-col sm:flex-row sm:items-center justify-between gap-3 animate-in slide-in-from-top-2 duration-200">
                  <div className="space-y-0.5">
                    <label htmlFor="delete-pending-days" className="text-xs font-semibold text-foreground">
                      Retention Period (Days)
                    </label>
                    <p className="text-[11px] text-muted-foreground">
                      Pending transactions older than this will be permanently removed.
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Input
                      id="delete-pending-days"
                      type="number"
                      min={1}
                      max={365}
                      value={localDays}
                      onChange={handleDeletePendingDaysChange}
                      onBlur={handleDeletePendingDaysBlur}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.currentTarget.blur();
                        }
                      }}
                      disabled={savingDeletePendingDays}
                      className="w-20 text-center h-8 text-xs font-mono"
                    />
                    <span className="text-xs text-muted-foreground">days</span>
                  </div>
                </div>
              )}
            </div>
          </div>

          {!hasConnection && (
            <div className="p-8 text-center">
              <Landmark className="w-10 h-10 text-muted-foreground/60 mx-auto mb-3" />
              <h3 className="text-sm font-semibold text-foreground">No Synced Accounts</h3>
              <p className="text-xs text-muted-foreground mt-1 mb-4">
                Connect your bank or investment accounts to automatically sync transactions and balances.
              </p>
              <button
                onClick={() => {
                  setAccountSubTab('connections');
                  const params = new URLSearchParams(searchParams.toString());
                  params.set('sub', 'connections');
                  router.replace(`/settings?${params.toString()}`, { scroll: false });
                }}
                className="px-4 py-2 text-xs font-semibold text-primary-foreground bg-primary rounded-lg hover:opacity-95 transition-opacity"
              >
                Go to Connections
              </button>
            </div>
          )}
          {renderOrphanedAccountsAlert()}


          {/* Account Management - only shown when a connection exists */}
          {hasConnection && (
            <div className="p-0">
              <h2 className="text-base font-semibold text-foreground mb-1">Account Management</h2>
              <p className="text-xs text-muted-foreground mb-4">
                <strong>Hide</strong> completely removes the account from lists, charts, and transaction histories. 
                <strong> Exclude</strong> removes the account from all dashboard pages, lists, and net worth calculations. It will only remain visible here in the automatic accounts list to allow configuration.
              </p>

              <div className="flex flex-wrap gap-2 mb-4">
                {(['all', 'visible', 'included', 'hidden', 'excluded', 'plaid', 'simplefin'] as const).map((filter) => (
                  <button
                    key={filter}
                    onClick={() => setAccountFilter(filter)}
                    className={`px-3 py-1.5 text-xs font-medium transition-colors rounded-lg border ${
                      accountFilter === filter
                        ? 'bg-primary text-primary-foreground border-primary/30'
                        : 'bg-muted text-muted-foreground hover:text-foreground hover:bg-muted/80 border-border/50'
                    }`}
                  >
                      {filter === 'all' ? 'All' :
                       filter === 'visible' ? 'Visible' :
                       filter === 'included' ? 'Included' :
                       filter === 'hidden' ? 'Hidden' :
                       filter === 'excluded' ? 'Excluded' :
                       filter === 'plaid' ? 'Plaid' :
                       'SimpleFIN'}
                    </button>
                  ))}
              </div>

              {accountsLoading ? (
                <div className="text-muted-foreground text-sm">Loading...</div>
              ) : accounts.length === 0 ? (
                <p className="text-muted-foreground text-sm">No accounts yet. Connect a financial institution first.</p>
              ) : (() => {
                  const filteredAccounts = accounts.filter((a) => {
                    // Only show automatic accounts (have a connectionId or plaidConnectionId)
                    if (!a.connectionId && !a.plaidConnectionId) return false;
                    if (accountFilter === 'hidden') return a.isHidden;
                    if (accountFilter === 'excluded') return a.isExcludedFromNetWorth;
                    if (accountFilter === 'visible') return !a.isHidden;
                    if (accountFilter === 'included') return !a.isExcludedFromNetWorth;
                    if (accountFilter === 'plaid') return !!a.plaidConnectionId;
                    if (accountFilter === 'simplefin') return !!a.connectionId;
                    return true;
                  });
                  const hasHiddenOrExcluded = accounts.filter((a) => a.connectionId || a.plaidConnectionId).some((a) => a.isHidden || a.isExcludedFromNetWorth);

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
                            className={`px-3 sm:px-4 py-4 sm:py-5 cursor-pointer group bg-muted border border-border rounded-xl hover:opacity-90 transition-opacity`}
                            onClick={() => handleOpenAccountDrawer(account)}
                          >
                            <div className="flex items-start justify-between gap-2 sm:gap-3">
                              <div className={`min-w-0 flex-1 ${
                                account.isHidden || account.isExcludedFromNetWorth ? 'opacity-60' : ''
                              }`}>
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className={getBadgeClasses(account.type)}>
                                    {account.type}
                                  </span>
                                  {account.plaidConnectionId && (
                                    <span className="badge-pill badge-plaid">Plaid</span>
                                  )}
                                  {account.connectionId && (
                                    <span className="badge-pill badge-simplefin">SimpleFIN</span>
                                  )}
                                  {account.isHidden && (
                                    <span className="badge-pill badge-hidden">Hidden</span>
                                  )}
                                  {account.isExcludedFromNetWorth && (
                                    <span className="badge-pill badge-excluded">Excluded</span>
                                  )}
                                </div>
                                <div className="flex items-center gap-2 mt-1 flex-wrap">
                                  <span className="text-foreground font-medium text-sm truncate max-w-[120px] sm:max-w-xs">{account.name}</span>
                                  {account.syncStatus && account.syncStatus.status !== 'ok' && (
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <span 
                                          className="flex-shrink-0 cursor-help"
                                          onClick={(e) => e.stopPropagation()}
                                        >
                                          {account.syncStatus.status === 'error' ? (
                                            <AlertCircle className="w-3.5 h-3.5 text-destructive shrink-0" />
                                          ) : (
                                            <AlertTriangle className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                                          )}
                                        </span>
                                      </TooltipTrigger>
                                      <TooltipContent side="top" className="max-w-[240px]">
                                        <p className="font-semibold">{account.syncStatus.status === 'error' ? 'Connection Error' : 'Sync Warning'}</p>
                                        <p className="text-[11px] text-muted-foreground mt-0.5">{account.syncStatus.reason}</p>
                                      </TooltipContent>
                                    </Tooltip>
                                  )}
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
                              <div className="shrink-0 flex flex-col items-end gap-1 sm:gap-1.5">
                                <div className="text-right">
                                  <div className="font-mono text-[11px] sm:text-sm text-foreground blur-number">{formatted}</div>
                                  <div className="text-[10px] sm:text-xs text-muted-foreground/60">{account.currency}</div>
                                </div>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleOpenAccountDrawer(account);
                                  }}
                                  className="px-2 py-0.5 sm:py-1 text-[9px] sm:text-[10px] font-medium text-muted-foreground hover:text-foreground border border-border hover:bg-muted rounded-lg transition-colors whitespace-nowrap"
                                >
                                  Edit
                                </button>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                      {hasHiddenOrExcluded && (
                        <p className="text-xs text-muted-foreground pt-3 px-4 pb-1">Some accounts are hidden or excluded. Use the tabs above to filter.</p>
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

          {accountSubTab === 'connections' && (
            <div className="space-y-5 sm:space-y-6">
              {renderOrphanedAccountsAlert()}



          {/* Add Connection Options */}
          <div className="p-0">
            <button
              type="button"
              onClick={() => setIsAddConnectionExpanded(!isAddConnectionExpanded)}
              className="w-full flex items-center justify-between text-base font-semibold text-foreground hover:text-primary transition-colors focus:outline-none"
            >
              <span>Add Bank Connection</span>
              {isAddConnectionExpanded ? (
                <ChevronUp className="w-5 h-5 text-muted-foreground" />
              ) : (
                <ChevronDown className="w-5 h-5 text-muted-foreground" />
              )}
            </button>

            {isAddConnectionExpanded && (
              <div className="mt-4 space-y-4 animate-in fade-in duration-200">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                  {/* Option A: Plaid Link */}
                  <div className="p-4 bg-muted/20 border border-border rounded-lg flex flex-col justify-between space-y-3">
                    <div>
                      <div className="flex items-center justify-between gap-2">
                        <h3 className="text-sm font-semibold text-foreground">Connect via Plaid</h3>
                        {connections.some((c) => c.provider === 'plaid') && (
                          <button
                            type="button"
                            onClick={handleResetPlaidKeys}
                            className="text-[10px] font-medium text-muted-foreground hover:text-foreground border border-border hover:bg-muted px-2 py-0.5 rounded-md transition-colors flex-shrink-0"
                          >
                            Edit Keys
                          </button>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">
                        Connect your bank accounts securely in seconds using Plaid. Supports most major institutions.
                      </p>
                      
                      {!connections.some((c) => c.provider === 'plaid') && (
                        <div className="mt-3 p-2.5 bg-primary/5 border border-primary/15 text-primary text-[10px] leading-normal rounded-lg space-y-1.5">
                          <div className="font-semibold flex items-center gap-1">
                            <span>💡 Setting up Plaid Self-Hosted Keys:</span>
                          </div>
                          <ol className="list-decimal pl-3.5 space-y-1 text-muted-foreground">
                            <li>
                              Sign up for a free developer account at{' '}
                              <a
                                href="https://dashboard.plaid.com"
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-primary hover:underline font-semibold"
                              >
                                dashboard.plaid.com
                              </a>.
                            </li>
                            <li>
                              Go to <strong>Platform &gt; Developers &gt; Keys</strong>.
                            </li>
                            <li>
                              Copy your <strong>Client ID</strong> and the corresponding secret (use the <strong>Production Secret</strong> for your actual accounts, or <strong>Sandbox Secret</strong> for testing).
                            </li>
                          </ol>
                          <p className="text-[9px] text-muted-foreground/80 italic mt-0.5">
                            * Clicking the link button below will prompt you to enter these keys securely.
                          </p>
                        </div>
                      )}

                      {plaidLinkError && (
                        <div className="mt-3 p-2.5 bg-destructive/15 border border-destructive/25 rounded-lg flex items-start gap-2">
                          <AlertCircle className="w-3.5 h-3.5 text-destructive shrink-0 mt-0.5" />
                          <p className="text-[11px] text-destructive leading-normal">{plaidLinkError}</p>
                        </div>
                      )}

                      {plaidLinkSuccess && (
                        <div className="mt-3 p-2.5 bg-chart-1/15 border border-chart-1/25 rounded-lg flex items-start gap-2">
                          <Check className="w-3.5 h-3.5 text-chart-1 shrink-0 mt-0.5" />
                          <p className="text-[11px] text-chart-1 leading-normal">{plaidLinkSuccess}</p>
                        </div>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={handleConnectPlaid}
                      disabled={plaidLoading || loading}
                      className="w-full px-4 py-2 text-xs font-semibold text-primary-foreground bg-primary hover:opacity-90 disabled:opacity-50 rounded-lg transition-colors flex items-center justify-center gap-1.5 animate-shimmer"
                    >
                      {plaidLoading ? 'Initializing Plaid...' : 'Connect via Plaid'}
                    </button>
                  </div>

                  {/* Option B: SimpleFIN (MX) */}
                  <div className="p-4 bg-muted/20 border border-border rounded-lg flex flex-col justify-between space-y-3">
                    <div>
                      <h3 className="text-sm font-semibold text-foreground">Connect via SimpleFIN (MX)</h3>
                      <p className="text-xs text-muted-foreground mt-1">
                        Import transactions from your bank using a SimpleFIN setup token/API key.
                      </p>
                    </div>
                    {hasMySimpleFin ? (
                      <div className="space-y-3">
                        <div className="text-[11px] text-muted-foreground font-medium bg-muted/40 border border-border/50 px-2.5 py-1.5 rounded-lg">
                          SimpleFIN connection already linked. Delete it first if you need to reconnect.
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            const conn = connections.find((c) => c.userId === currentUserId && c.provider === 'simplefin');
                            if (conn) openManageSync(conn);
                          }}
                          className="w-full px-4 py-2 text-xs font-semibold text-primary-foreground bg-primary hover:opacity-90 disabled:opacity-50 rounded-lg transition-colors flex items-center justify-center gap-1.5"
                        >
                          Manage SimpleFIN (MX) Institutions
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setShowSimpleFinForm(!showSimpleFinForm)}
                        className={`w-full px-4 py-2 text-xs font-semibold rounded-lg transition-colors flex items-center justify-center gap-1.5 ${
                          showSimpleFinForm
                            ? 'text-foreground bg-muted hover:bg-accent border border-border'
                            : 'text-primary-foreground bg-primary hover:opacity-90 disabled:opacity-50 animate-shimmer'
                        }`}
                      >
                        {showSimpleFinForm ? 'Hide SimpleFIN Form' : 'Connect via SimpleFIN (MX)'}
                      </button>
                    )}
                  </div>
                </div>

                {/* Sync Service Pricing Information */}
                <div className="mt-5 pt-4 border-t border-border/65 space-y-4">
                  <button
                    type="button"
                    onClick={() => setIsPricingExpanded(!isPricingExpanded)}
                    className="w-full flex items-center justify-between text-xs font-semibold text-foreground hover:text-primary transition-colors focus:outline-none"
                  >
                    <span className="flex items-center gap-1.5">
                      <Info className="w-3.5 h-3.5 text-primary" /> Sync Service Pricing & Cost Comparison
                    </span>
                    {isPricingExpanded ? (
                      <ChevronUp className="w-4 h-4 text-muted-foreground" />
                    ) : (
                      <ChevronDown className="w-4 h-4 text-muted-foreground" />
                    )}
                  </button>

                  {isPricingExpanded && (
                    <div className="space-y-4 animate-in fade-in duration-200">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 text-xs">
                        <div className="space-y-1.5 p-3 bg-muted/10 border border-border/40 rounded-lg">
                          <h4 className="font-semibold text-foreground text-[11px] uppercase tracking-wider text-muted-foreground">Plaid (Self-Hosted Keys)</h4>
                          <ul className="text-muted-foreground list-disc pl-4 space-y-1 text-[11px] leading-relaxed">
                            <li><strong className="text-emerald-500 font-semibold">Free</strong> for the first 10 lifetime production institutions (Plaid "Items", not a rolling window).</li>
                            <li>Billed per connected <strong className="text-foreground">Institution (Item)</strong>, not per individual account.</li>
                            <li>Pay-as-you-go Base: ~$0.30/mo for Transactions, ~$0.30/mo for Investments.</li>
                            <li>Pay-as-you-go Refresh: ~$0.08 per request (e.g., daily sync = ~$2.40/mo, hourly sync = ~$57.60/mo per institution).</li>
                            <li><strong className="text-foreground">PAYG Account Conversion:</strong> Linking an 11th unique lifetime Item converts the entire developer account to Pay-as-you-go billing, making all Items (including the first 10) billable.</li>
                            <li>Requires registering your own Plaid developer credentials.</li>
                          </ul>
                        </div>
                        <div className="space-y-1.5 p-3 bg-muted/10 border border-border/40 rounded-lg">
                          <h4 className="font-semibold text-foreground text-[11px] uppercase tracking-wider text-muted-foreground">SimpleFIN Bridge</h4>
                          <ul className="text-muted-foreground list-disc pl-4 space-y-1 text-[11px] leading-relaxed">
                            <li>Flat rate of <strong className="text-foreground">$1.50/mo</strong> or <strong className="text-foreground">$15.00/yr</strong></li>
                            <li>Supports up to 25 linked accounts and apps</li>
                            <li>Simple setup, no developer configuration required</li>
                          </ul>
                        </div>
                      </div>
                      
                      {/* Item vs Account Explanation */}
                      <div className="p-3 bg-muted/20 border border-border/40 rounded-lg text-[11px] leading-relaxed space-y-2">
                        <div className="font-semibold text-foreground flex items-center gap-1">
                          <span>💡 How Plaid Billing Works: "Items" vs. "Accounts"</span>
                        </div>
                        <p className="text-muted-foreground">
                          Plaid bills subscription products (Transactions, Investments) per <strong className="text-foreground">institution login (Item)</strong>. 
                          If you have 10 bank accounts under one login (e.g., Chase) and 10 brokerage accounts under another (e.g., Fidelity), 
                          this counts as only <strong className="text-foreground">2 Items</strong>. Under the 10-Item limit (specifically, the first 10 unique Items ever linked, not a rolling window of 10 active items) in Plaid's Trial/Development tier, 
                          this is <strong className="text-emerald-500 font-semibold">100% Free</strong>. <strong className="text-foreground">Note:</strong> Once you exceed 10 lifetime Items, your entire Plaid account converts to Pay-as-you-go billing, and all Items (including the first 10) will begin incurring fees.
                        </p>
                      </div>

                      {/* Example monthly cost breakdown */}
                      <div className="p-3 bg-primary/[0.03] border border-primary/10 rounded-lg text-[11px] leading-relaxed">
                        <span className="font-semibold text-foreground block mb-2">Example Cost Breakdown: 10 Bank & 10 Brokerage Accounts</span>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                          <div className="p-2.5 bg-muted/30 border border-border/40 rounded space-y-1">
                            <span className="text-emerald-500 block text-[9px] uppercase font-bold">Plaid Free Tier (Development)</span>
                            <div className="text-[10px] text-muted-foreground">
                              If these 20 accounts are under <strong className="text-foreground">10 or fewer institutions</strong> (and within the first 10 lifetime Items linked):
                            </div>
                            <div className="font-bold text-foreground text-xs mt-1">Cost: $0.00 / month (all refreshes are free)</div>
                          </div>
                          <div className="p-2.5 bg-muted/30 border border-border/40 rounded space-y-1">
                            <span className="text-primary block text-[9px] uppercase font-bold">Plaid Pay-as-you-go (Over 10 Items)</span>
                            <div className="text-[10px] text-muted-foreground">
                              If you exceed the first 10 lifetime institutions linked (base fee + refreshes depending on sync frequency):
                            </div>
                            <div className="font-bold text-foreground text-xs mt-1">Cost: Base (~$0.30 - $0.60) + Refresh fee (~$2.40/mo for Daily, or ~$57.60/mo for Hourly) per extra institution</div>
                          </div>
                        </div>
                        <div className="mt-2 pt-2 border-t border-border/30 text-[10px] text-muted-foreground flex justify-between items-center">
                          <span>Compared to SimpleFIN: <strong>$1.50/mo</strong> (Flat fee for up to 25 accounts/connections)</span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* Estimated Sync Fees Section */}
                {connections.length > 0 && (
                  <div className="mt-4 pt-4 border-t border-border/65 space-y-4">
                    <button
                      type="button"
                      onClick={() => setIsSyncFeesExpanded(!isSyncFeesExpanded)}
                      className="w-full flex items-center justify-between text-xs font-semibold text-foreground hover:text-primary transition-colors focus:outline-none"
                    >
                      <span className="flex items-center gap-1.5">
                        <BarChart3 className="w-3.5 h-3.5 text-primary" /> Estimated Monthly Sync Fees (Pay-as-you-go)
                      </span>
                      {isSyncFeesExpanded ? (
                        <ChevronUp className="w-4 h-4 text-muted-foreground" />
                      ) : (
                        <ChevronDown className="w-4 h-4 text-muted-foreground" />
                      )}
                    </button>

                    {isSyncFeesExpanded && (
                      <div className="mt-4 space-y-3 animate-in fade-in duration-200">
                        <p className="text-xs text-muted-foreground leading-normal">
                          Based on your active connections and their configured sync frequencies, here is your estimated monthly Pay-as-you-go cost:
                        </p>
                        <div className="overflow-x-auto border border-border/40 rounded-lg">
                          <table className="w-full text-[11px] text-left border-collapse">
                            <thead>
                              <tr className="bg-muted/30 border-b border-border/40 text-[9px] uppercase tracking-wider text-muted-foreground">
                                <th className="p-2 font-semibold">Connection</th>
                                <th className="p-2 font-semibold text-center">Provider</th>
                                <th className="p-2 font-semibold text-center">Frequency</th>
                                <th className="p-2 font-semibold text-right">Base Sub</th>
                                <th className="p-2 font-semibold text-right">Est. Refresh Cost</th>
                                <th className="p-2 font-semibold text-right">Est. Total</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-border/30 text-foreground">
                              {(() => {
                                let totalMonthlyCost = 0;
                                let hasSimpleFin = false;
                                
                                const rows = connections.map((conn) => {
                                  const cost = calculateConnectionCost(conn);
                                  
                                  if (conn.provider === 'simplefin') {
                                    hasSimpleFin = true;
                                  } else {
                                    totalMonthlyCost += cost.total;
                                  }
                                  
                                  return (
                                    <tr key={conn.id} className="hover:bg-muted/10">
                                      <td className="p-2 font-medium truncate max-w-[150px]">{conn.label || 'Unnamed Connection'}</td>
                                      <td className="p-2 text-center capitalize">{conn.provider || 'Plaid'}</td>
                                      <td className="p-2 text-center capitalize">{conn.syncFrequency}</td>
                                      <td className="p-2 text-right">
                                        {conn.provider === 'simplefin' ? '$1.50*' : `$${cost.baseFee.toFixed(2)}`}
                                      </td>
                                      <td className="p-2 text-right">
                                        {conn.provider === 'simplefin' ? '$0.00' : `$${cost.refreshCost.toFixed(2)}`}
                                      </td>
                                      <td className="p-2 text-right font-semibold">
                                        {conn.provider === 'simplefin' ? '$1.50*' : `$${cost.total.toFixed(2)}`}
                                      </td>
                                    </tr>
                                  );
                                });

                                // Add SimpleFIN flat fee to total exactly once (as it is a flat user subscription)
                                if (hasSimpleFin) {
                                  totalMonthlyCost += 1.50;
                                }

                                return (
                                  <>
                                    {rows}
                                    <tr className="bg-muted/20 font-bold border-t border-border/50 text-foreground">
                                      <td colSpan={5} className="p-2 text-right">Total Est. Monthly Cost:</td>
                                      <td className="p-2 text-right text-xs text-primary">${totalMonthlyCost.toFixed(2)}/mo</td>
                                    </tr>
                                  </>
                                );
                              })()}
                            </tbody>
                          </table>
                        </div>
                        <div className="text-[10px] text-muted-foreground leading-normal space-y-1.5 p-2.5 bg-muted/20 border border-border/40 rounded-lg">
                          <div>
                            * <strong>SimpleFIN Pricing Note</strong>: SimpleFIN charges a flat $1.50/mo subscription paid directly by you, which covers all your linked SimpleFIN connections (up to 25 accounts total).
                          </div>
                          <div className="p-3 bg-emerald-500/15 dark:bg-emerald-500/10 border border-emerald-500/35 dark:border-emerald-500/25 text-emerald-700 dark:text-emerald-300 rounded-lg text-xs leading-relaxed font-medium">
                            💡 <strong>Plaid Pricing Note</strong>: Plaid includes the <strong>first 10 unique connected institutions (Items) for free</strong> (lifetime limit, not a rolling window of 10 active items) in its Trial/Development tier. Linking an 11th unique lifetime Item converts the entire developer account to Pay-as-you-go billing, and all connections will incur fees. If your total lifetime Plaid connections is fewer than 10, your actual Plaid cost is <strong className="text-emerald-900 dark:text-emerald-100 font-extrabold underline decoration-emerald-500/50">$0.00</strong>. This estimate assumes Pay-as-you-go rates apply to all items.
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Collapsible SimpleFIN Form */}
                {!hasMySimpleFin && showSimpleFinForm && (
                  <div className="mt-4 p-4 border border-border/80 rounded-lg bg-muted/10 space-y-4 animate-in fade-in slide-in-from-top-2 duration-200">
                    {sharingGroup && (
                      <div className="p-3 bg-amber-500/10 border border-amber-500/20 text-amber-600 dark:text-amber-400 text-xs rounded-lg font-medium flex items-start gap-2">
                        <AlertCircle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                        <div>
                          <strong className="block text-amber-700 dark:text-amber-300 font-semibold mb-0.5">Shared Visibility Warning</strong>
                          Your SimpleFIN connection and its sync status will be visible to the primary user and other members of this shared account, but only you will be able to edit or delete it.
                        </div>
                      </div>
                    )}

                    <div className="p-3 bg-primary/5 border border-primary/20 rounded-lg">
                      <h3 className="text-xs font-semibold text-primary mb-1">How to get your SimpleFIN API key / setup token:</h3>
                      <ol className="text-[11px] text-muted-foreground space-y-1">
                        <li className="flex gap-1.5">
                          <span className="text-primary font-bold">1.</span>
                          <span>Sign up at <a href="https://beta-bridge.simplefin.org" target="_blank" rel="noopener noreferrer" className="text-primary underline hover:text-primary/80">https://beta-bridge.simplefin.org</a></span>
                        </li>
                        <li className="flex gap-1.5">
                          <span className="text-primary font-bold">2.</span>
                          <span>After signing in, go My Account → Apps</span>
                        </li>
                        <li className="flex gap-1.5">
                          <span className="text-primary font-bold">3.</span>
                          <span>Generate a token by clicking New App Connection.</span>
                        </li>
                        <li className="flex gap-1.5">
                          <span className="text-primary font-bold">4.</span>
                          <span>Paste the token below and click "Add Connection"</span>
                        </li>
                      </ol>
                    </div>

                    <form onSubmit={handleAddConnection} className="space-y-3">
                      <div>
                        <label htmlFor="setupToken" className="block text-xs font-medium text-foreground mb-1">
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
                        <label htmlFor="label" className="block text-xs font-medium text-foreground mb-1">
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
                        className="w-full px-4 py-2.5 text-xs font-semibold text-primary-foreground bg-primary rounded-lg hover:opacity-90 disabled:opacity-50 transition-all"
                      >
                        {loading ? 'Adding...' : 'Add Connection'}
                      </button>
                    </form>
                  </div>
                )}

                {error && (
                  <div className="mt-4 p-3 bg-destructive/20 border border-destructive/30 rounded-lg">
                    <p className="text-destructive text-sm">{error}</p>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Existing Connections */}
          {hasConnection && (
            <div className="p-0">
              <h2 className="text-base font-semibold text-foreground mb-4">Automatic Bank Connections</h2>
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
                      className="p-4 bg-muted border border-border rounded-xl space-y-2"
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
                          <span className={`text-[10px] border px-1.5 py-0.5 rounded shrink-0 font-semibold ml-1 ${
                            conn.provider === 'plaid' 
                              ? 'bg-chart-2/15 border-chart-2/30 text-chart-2' 
                              : 'bg-primary/15 border-primary/30 text-primary'
                          }`}>
                            {conn.provider === 'plaid' ? 'Plaid' : 'SimpleFIN'}
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
                            disabled={syncingId === conn.id || fullResyncId === conn.id || (currentUserId !== undefined && conn.userId !== currentUserId)}
                            className="px-2 py-1 text-[11px] font-medium text-primary bg-primary/10 hover:bg-primary/20 rounded-lg transition-colors disabled:opacity-50"
                          >
                            {syncingId === conn.id ? 'Syncing...' : 'Sync'}
                          </button>
                          {conn.provider === 'plaid' && (
                            <button
                              onClick={() => setFullResyncConn(conn)}
                              disabled={syncingId === conn.id || fullResyncId === conn.id || (currentUserId !== undefined && conn.userId !== currentUserId)}
                              className="px-2 py-1 text-[11px] font-medium text-amber-600 dark:text-amber-400 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/20 rounded-lg transition-colors disabled:opacity-50"
                              title="Clear sync cursor and re-pull full history (up to 2 years)"
                            >
                              {fullResyncId === conn.id ? 'Re-syncing...' : 'Full Re-sync'}
                            </button>
                          )}
                          {conn.provider === 'simplefin' && (
                            <button
                              onClick={() => openManageSync(conn)}
                              disabled={syncingId === conn.id || (currentUserId !== undefined && conn.userId !== currentUserId)}
                              className="px-2 py-1 text-[11px] font-medium text-primary bg-primary/10 hover:bg-primary/20 rounded-lg transition-colors disabled:opacity-50"
                            >
                              Manage Sync
                            </button>
                          )}
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
                      <div className="flex items-center justify-between pt-1.5">
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
                      {conn.provider === 'plaid' && conn.syncFrequency === 'hourly' && !dismissedPlaidHourlyWarnings.includes(conn.id) && (
                        <div className="mt-2.5 p-2 bg-amber-500/10 border border-amber-500/20 text-amber-600 dark:text-amber-400 rounded-lg text-[10px] leading-normal flex items-start gap-2 pr-6 relative">
                          <AlertTriangle className="w-3.5 h-3.5 text-amber-500 shrink-0 mt-0.5" />
                          <div>
                            <strong className="font-semibold block mb-0.5 text-amber-700 dark:text-amber-300">Plaid Hourly Cost Warning</strong>
                            Syncing Plaid hourly triggers frequent bank refreshes. On a Pay-as-you-go developer plan, these manual refreshes incur per-request fees (e.g. ~$0.08 per request) which can accumulate to <strong>$50+/month per connection</strong>. We recommend Daily or Manual syncs unless you are on a free trial tier or custom contract.
                          </div>
                          <button
                            onClick={() => dismissPlaidHourlyWarning(conn.id)}
                            className="absolute top-2 right-2 text-amber-500 hover:text-amber-600 dark:hover:text-amber-300 focus:outline-none"
                            title="Dismiss warning"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      )}
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
                        <div className="space-y-1">
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
        </div>
      )}
        </>
      )}

      {activeTab === 'rules' && (
        <div className="p-3 sm:p-5 bg-card border border-border rounded-xl min-h-[400px]">
          <RulesTab />
        </div>
      )}

      {activeTab === 'analytics' && (
        <div className="p-3 sm:p-5 bg-card border border-border rounded-xl min-h-[400px]">
          <AnalyticsTab />
        </div>
      )}

      {activeTab === 'sharing' && (
        <div className="p-3 sm:p-5 bg-card border border-border rounded-xl min-h-[400px]">
          <SharingTab />
        </div>
      )}

      {activeTab === 'advanced' && (
        <div className="p-3 sm:p-5 bg-card border border-border rounded-xl min-h-[400px]">
          <AdvancedTab />
        </div>
      )}

      {activeTab === 'notifications' && (
        <div className="p-3 sm:p-5 bg-card border border-border rounded-xl min-h-[400px]">
          <NotificationsTab />
        </div>
      )}

      {activeTab === 'ai' && (
        <div className="p-3 sm:p-5 bg-card border border-border rounded-xl min-h-[400px]">
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

      {/* Plaid Credentials Dialog */}
      <Dialog open={isPlaidCredentialsDialogOpen} onOpenChange={setIsPlaidCredentialsDialogOpen}>
        <DialogContent className="max-w-md max-h-[85dvh] flex flex-col gap-0 p-0 overflow-hidden">
          <DialogHeader className="p-6 pb-4 border-b border-border">
            <DialogTitle>
              {connections.some((c) => c.provider === 'plaid') ? 'Update Plaid API Credentials' : 'Configure Plaid API Credentials'}
            </DialogTitle>
            <DialogDescription>
              {connections.some((c) => c.provider === 'plaid')
                ? 'Update your stored Plaid API keys. New credentials will be used for all future sync operations.'
                : 'Enter your Plaid API keys to link bank accounts securely. Credentials are encrypted at rest.'}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSavePlaidCredentials} className="flex-1 flex flex-col overflow-hidden">
            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              <div>
                <label htmlFor="plaidClientId" className="block text-sm font-medium text-foreground mb-1">
                  Plaid Client ID
                </label>
                <Input
                  id="plaidClientId"
                  value={plaidClientId}
                  onChange={(e) => setPlaidClientId(e.target.value)}
                  placeholder="Enter Plaid Client ID..."
                  required
                />
              </div>
              <div>
                <label htmlFor="plaidSecret" className="block text-sm font-medium text-foreground mb-1">
                  Plaid Secret
                </label>
                <Input
                  id="plaidSecret"
                  type="password"
                  value={plaidSecret}
                  onChange={(e) => setPlaidSecret(e.target.value)}
                  placeholder="Enter Plaid Secret..."
                  required
                />
                <p className="text-[10px] text-muted-foreground mt-1 leading-normal">
                  Use your Plaid <strong>Production Secret</strong> if linking actual bank accounts, or <strong>Sandbox Secret</strong> for testing.
                </p>
              </div>
              <div>
                <label htmlFor="plaidEnvironment" className="block text-sm font-medium text-foreground mb-1">
                  Plaid Environment
                </label>
                <select
                  id="plaidEnvironment"
                  value={plaidEnvironment}
                  onChange={(e) => setPlaidEnvironment(e.target.value)}
                  className="w-full text-sm bg-background border border-border rounded-lg px-3 py-2 text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  <option value="sandbox">Sandbox (Mock data)</option>
                  <option value="production">Production / Pay-as-you-go (Real bank connections)</option>
                </select>
                <p className="text-[10px] text-muted-foreground mt-1.5 leading-normal">
                  Choose <strong>Production / Pay-as-you-go</strong> to connect your actual accounts. It includes 10 free connections, and can exceed this limit via pay-as-you-go billing. Sandbox is for simulated testing only.
                </p>
              </div>
            </div>
            <DialogFooter className="p-6 pt-4 border-t border-border bg-muted/10 gap-2">
              <button
                type="button"
                onClick={() => setIsPlaidCredentialsDialogOpen(false)}
                className="px-4 py-2 text-xs font-semibold text-foreground bg-muted hover:bg-accent border border-border rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={savingPlaidCredentials}
                className="px-4 py-2 text-xs font-semibold text-primary-foreground bg-primary rounded-lg hover:opacity-90 disabled:opacity-50 transition-all"
              >
                {savingPlaidCredentials ? 'Saving...' : connections.some((c) => c.provider === 'plaid') ? 'Save Keys' : 'Save & Link'}
              </button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Connection Details Dialog */}
          <Dialog open={!!detailsConn} onOpenChange={(open) => !open && setDetailsConn(null)}>
            <DialogContent className="max-w-md max-h-[85dvh] flex flex-col gap-0 p-0 overflow-hidden">
              <DialogHeader className="p-6 pb-4 border-b border-border">
                <DialogTitle>Connection Details</DialogTitle>
                <DialogDescription>View and manage your SimpleFIN connection.</DialogDescription>
              </DialogHeader>
              <div className="flex-1 overflow-y-auto p-6 space-y-4">
                {detailsConn && (
                  <div className="space-y-4">
                    <div>
                      <label className="text-xs text-muted-foreground font-medium">Label</label>
                      <Input
                        value={detailsLabel}
                        onChange={(e) => setDetailsLabel(e.target.value)}
                        className="mt-1"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground font-medium">Status</label>
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
                      <label className="text-xs text-muted-foreground font-medium">Sync Frequency</label>
                      <div className="mt-1 text-foreground text-sm capitalize">{detailsConn.syncFrequency}</div>
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground font-medium">Last Sync</label>
                      <div className="mt-1 text-foreground text-sm">{formatRelativeTime(detailsConn.lastSyncAt)}</div>
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground font-medium">Next Sync</label>
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
                      <label className="text-xs text-muted-foreground font-medium">Created</label>
                      <div className="mt-1 text-foreground text-sm">{new Date(detailsConn.createdAt).toLocaleDateString()}</div>
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground font-medium">Access URL</label>
                      <div className="mt-1 text-muted-foreground text-sm font-mono truncate">{maskAccessUrl(detailsConn)}</div>
                    </div>
                    {detailsConn.lastSyncError && (
                      <div>
                        <label className="text-xs text-destructive font-medium">Last Error</label>
                        <div className="mt-1 text-destructive text-sm leading-normal">{detailsConn.lastSyncError}</div>
                      </div>
                    )}
                  </div>
                )}
              </div>
              <DialogFooter className="p-6 pt-4 border-t border-border bg-muted/10">
                <button
                  type="button"
                  onClick={() => setDetailsConn(null)}
                  className="px-4 py-2 text-sm text-foreground bg-muted hover:bg-accent rounded-lg transition-colors"
                >
                  Close
                </button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {/* Full Re-sync Confirmation */}
          <AlertDialog open={!!fullResyncConn} onOpenChange={(open) => !open && setFullResyncConn(null)}>
            <AlertDialogContent className="max-w-sm">
              <AlertDialogHeader>
                <AlertDialogTitle>Full Historical Re-sync</AlertDialogTitle>
                <AlertDialogDescription>
                  This will clear the sync cursor for <strong>{fullResyncConn?.label}</strong> and re-pull up to <strong>2 years</strong> of transaction history from Plaid. Existing transactions will not be duplicated.
                  <br /><br />
                  This may take a minute or two depending on account history. Your Plaid Item is <strong>not</strong> affected — this does not consume another of your 10 free connections.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <button
                  type="button"
                  onClick={handleFullResync}
                  className="inline-flex h-9 items-center justify-center rounded-lg bg-amber-600 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-700 transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                >
                  Re-sync Full History
                </button>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>

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
            <DialogContent className="max-w-md max-h-[85dvh] flex flex-col gap-0 p-0 overflow-hidden">
              <DialogHeader className="p-6 pb-4 border-b border-border">
                <DialogTitle>Re-map Unlinked Account</DialogTitle>
                <DialogDescription>
                  Reconnect an orphaned automatic account to an active synced account to preserve all history.
                </DialogDescription>
              </DialogHeader>

              <div className="flex-1 overflow-y-auto p-6 space-y-4">
                <div>
                  <label className="text-sm font-medium text-foreground block mb-1">
                    Account to Keep (Preserves History & Settings)
                  </label>
                  <p className="text-xs text-muted-foreground mb-2">
                    The account you want to keep. It retains all history, settings, and its ID.
                  </p>
                  <select
                    value={remapSourceId}
                    onChange={(e) => {
                      setRemapSourceId(e.target.value);
                      if (e.target.value === remapTargetId) {
                        setRemapTargetId('');
                      }
                    }}
                    className="w-full text-sm bg-background border border-border rounded-lg px-3 py-2 text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                  >
                    <option value="">Select account to keep...</option>
                    {orphanedAccounts.length > 0 && (
                      <optgroup label="Orphaned Accounts (Unlinked)">
                        {orphanedAccounts.map((a) => (
                          <option key={a.id} value={a.id} disabled={a.id === remapTargetId}>
                            {a.name} ({a.institution || 'Unknown Bank'})
                          </option>
                        ))}
                      </optgroup>
                    )}
                    {activeAutomaticAccounts.length > 0 && (
                      <optgroup label="Active Synced Accounts">
                        {activeAutomaticAccounts.map((a) => (
                          <option key={a.id} value={a.id} disabled={a.id === remapTargetId}>
                            {a.name} ({a.institution || 'Unknown Bank'})
                          </option>
                        ))}
                      </optgroup>
                    )}
                  </select>
                </div>

                <div className="flex justify-center my-1">
                  <button
                    type="button"
                    onClick={handleSwapRemapAccounts}
                    className="p-1.5 rounded-full border border-border bg-background hover:bg-muted text-muted-foreground hover:text-foreground transition-colors focus:outline-none focus:ring-1 focus:ring-ring"
                    title="Swap Keep and Merge accounts"
                  >
                    <ArrowUpDown className="w-4.5 h-4.5" />
                  </button>
                </div>

                <div>
                  <label className="text-sm font-medium text-foreground block mb-1">
                    Account to Merge & Delete (New Sync & Duplicate)
                  </label>
                  <p className="text-xs text-muted-foreground mb-2">
                    The duplicate account to merge. Its new transactions and sync credentials will be transferred, and then this record will be deleted.
                  </p>
                  <select
                    value={remapTargetId}
                    onChange={(e) => {
                      setRemapTargetId(e.target.value);
                      if (e.target.value === remapSourceId) {
                        setRemapSourceId('');
                      }
                    }}
                    className="w-full text-sm bg-background border border-border rounded-lg px-3 py-2 text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                  >
                    <option value="">Select account to merge & delete...</option>
                    {orphanedAccounts.length > 0 && (
                      <optgroup label="Orphaned Accounts (Unlinked)">
                        {orphanedAccounts.map((a) => (
                          <option key={a.id} value={a.id} disabled={a.id === remapSourceId}>
                            {a.name} ({a.institution || 'Unknown Bank'})
                          </option>
                        ))}
                      </optgroup>
                    )}
                    {activeAutomaticAccounts.length > 0 && (
                      <optgroup label="Active Synced Accounts">
                        {activeAutomaticAccounts.map((a) => (
                          <option key={a.id} value={a.id} disabled={a.id === remapSourceId}>
                            {a.name} ({a.institution || 'Unknown Bank'})
                          </option>
                        ))}
                      </optgroup>
                    )}
                  </select>
                </div>

                <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg flex items-start gap-2.5">
                  <AlertCircle className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    <strong className="text-foreground">Important:</strong> Any new transactions on the merged account will be moved to the kept account, its sync connection/credentials will be updated to the new credentials, and the duplicate merged account record will be deleted.
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

              <DialogFooter className="p-6 pt-4 border-t border-border bg-muted/10">
                <button
                  type="button"
                  onClick={() => setIsRemapDialogOpen(false)}
                  disabled={remapLoading}
                  className="px-4 py-2 text-sm text-foreground bg-muted hover:bg-accent rounded-lg transition-colors disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleRemap}
                  disabled={remapLoading || !remapSourceId || !remapTargetId}
                  className="px-4 py-2 text-sm font-semibold text-primary-foreground bg-primary hover:opacity-90 rounded-lg transition-opacity disabled:opacity-50"
                >
                  {remapLoading ? 'Re-mapping...' : 'Re-map Account'}
                </button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {/* Re-linking Dialog */}
          <Dialog open={isRelinkDialogOpen} onOpenChange={setIsRelinkDialogOpen}>
            <DialogContent className="max-w-md max-h-[85dvh] flex flex-col gap-0 p-0 overflow-hidden">
              <DialogHeader className="p-6 pb-4 border-b border-border">
                <DialogTitle>Re-link to Sync Connection</DialogTitle>
                <DialogDescription>
                  Reconnect this unlinked account to one of your active sync connections.
                </DialogDescription>
              </DialogHeader>

              <div className="flex-1 overflow-y-auto p-6 space-y-4">
                <div>
                  <label className="text-sm font-medium text-foreground block mb-1">
                    Select Connection
                  </label>
                  <p className="text-xs text-muted-foreground mb-2">
                    Choose the sync connection to link this account back to. Sync will resume on the next update.
                  </p>
                  <select
                    value={relinkTargetConnectionId}
                    onChange={(e) => setRelinkTargetConnectionId(e.target.value)}
                    className="w-full text-sm bg-background border border-border rounded-lg px-3 py-2 text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                  >
                    <option value="">Select sync connection...</option>
                    {connections.length > 0 ? (
                      connections.map((conn) => (
                        <option key={conn.id} value={conn.id}>
                          {conn.label || (conn.provider === 'simplefin' ? 'SimpleFIN Connection' : 'Plaid Connection')} ({conn.provider === 'simplefin' ? 'SimpleFIN' : 'Plaid'})
                        </option>
                      ))
                    ) : (
                      <option disabled>No connections found</option>
                    )}
                  </select>
                </div>

                <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg flex items-start gap-2.5">
                  <AlertCircle className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    <strong className="text-foreground">Important:</strong> This will restore sync for the account. The next sync run will update its balance and pull any missing transactions.
                  </p>
                </div>

                {relinkError && (
                  <div className="p-3 bg-destructive/20 border border-destructive/30 rounded-lg text-sm text-destructive">
                    {relinkError}
                  </div>
                )}

                {relinkSuccess && (
                  <div className="p-3 bg-chart-1/20 border border-chart-1/30 rounded-lg text-sm text-chart-1">
                    {relinkSuccess}
                  </div>
                )}
              </div>

              <DialogFooter className="p-6 pt-4 border-t border-border bg-muted/10">
                <button
                  type="button"
                  onClick={() => setIsRelinkDialogOpen(false)}
                  disabled={relinkLoading}
                  className="px-4 py-2 text-sm text-foreground bg-muted hover:bg-accent rounded-lg transition-colors disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleRelink}
                  disabled={relinkLoading || !relinkTargetConnectionId}
                  className="px-4 py-2 text-sm font-semibold text-primary-foreground bg-primary hover:opacity-90 rounded-lg transition-opacity disabled:opacity-50"
                >
                  {relinkLoading ? 'Re-linking...' : 'Re-link Account'}
                </button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {/* Manage Sync Dialog */}
          <Dialog open={isManageSyncDialogOpen} onOpenChange={setIsManageSyncDialogOpen}>
            <DialogContent className="max-w-md max-h-[85dvh] flex flex-col gap-0 p-0 overflow-hidden">
              <DialogHeader className="p-6 pb-4 border-b border-border">
                <DialogTitle>Manage Sync Accounts</DialogTitle>
                <DialogDescription>
                  Configure which accounts retrieved from SimpleFIN are actively syncing data to this application.
                </DialogDescription>
              </DialogHeader>

              <div className="flex-1 overflow-y-auto p-6 space-y-4">
                <div className="p-3 bg-muted/40 border border-border/80 rounded-lg text-xs text-muted-foreground leading-relaxed">
                  <span className="font-semibold text-foreground block mb-0.5">Sync Disabled vs. Exclude from Net Worth</span>
                  Disabling sync blocks these accounts at the SimpleFIN integration level. No new transactions or balances will be fetched, and the account won't be auto-created. This is different from "Exclude from Net Worth", which keeps syncing data in the background but hides the account from your net worth totals.
                </div>

                {manageSyncError && (
                  <div className="p-3 bg-destructive/20 border border-destructive/30 rounded-lg text-sm text-destructive">
                    {manageSyncError}
                  </div>
                )}

                {manageSyncLoading ? (
                  <div className="text-sm text-muted-foreground text-center py-4">
                    Fetching accounts from SimpleFIN...
                  </div>
                ) : (
                  <div className="space-y-2.5">
                    {manageSyncAccounts.length === 0 ? (
                      <div className="text-sm text-muted-foreground text-center py-4">
                        No accounts found in this SimpleFIN connection.
                      </div>
                    ) : (
                      manageSyncAccounts.map((acc) => {
                        const isDisabled = tempDisabledAccounts.includes(acc.id);
                        return (
                          <label
                            key={acc.id}
                            className="flex items-start gap-3 p-3 rounded-lg border border-border cursor-pointer transition-colors bg-muted/30 hover:bg-muted"
                          >
                            <input
                              type="checkbox"
                              checked={!isDisabled}
                              onChange={(e) => {
                                  if (e.target.checked) {
                                    setTempDisabledAccounts(prev => prev.filter(id => id !== acc.id));
                                  } else {
                                    setTempDisabledAccounts(prev => [...prev, acc.id]);
                                  }
                              }}
                              className="mt-1 accent-primary"
                            />
                            <div className="flex-1 min-w-0">
                              <span className="text-sm font-medium text-foreground block truncate">
                                {acc.name}
                              </span>
                              <span className="text-xs text-muted-foreground block truncate">
                                {acc.institution} · {parseFloat(acc.balance).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {acc.currency}
                              </span>
                              {isDisabled && (
                                <p className="text-[10px] text-amber-600 dark:text-amber-400 font-medium mt-1">
                                  ⚠️ Sync disabled. This account will be unlinked locally and won't sync.
                                </p>
                              )}
                            </div>
                          </label>
                        );
                      })
                    )}
                  </div>
                )}
              </div>

              <DialogFooter className="p-6 pt-4 border-t border-border bg-muted/10">
                <button
                  type="button"
                  onClick={() => setIsManageSyncDialogOpen(false)}
                  disabled={manageSyncSaving}
                  className="px-4 py-2 text-sm text-foreground bg-muted hover:bg-accent rounded-lg transition-colors disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSaveDisabledAccounts}
                  disabled={manageSyncLoading || manageSyncSaving}
                  className="px-4 py-2 text-sm font-semibold text-primary-foreground bg-primary hover:opacity-90 rounded-lg transition-opacity disabled:opacity-50"
                >
                  {manageSyncSaving ? 'Saving...' : 'Save Settings'}
                </button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {/* Convert Orphaned Account to Manual Confirmation Dialog */}
          <AlertDialog open={isConvertConfirmOpen} onOpenChange={(open) => !open && !isConvertLoading && setIsConvertConfirmOpen(false)}>
            <AlertDialogContent className="max-w-md">
              <AlertDialogHeader>
                <AlertDialogTitle>Convert to Manual Account</AlertDialogTitle>
                <AlertDialogDescription className="space-y-3">
                  <span className="block">
                    Are you sure you want to convert <strong className="text-foreground">{accountToConvert?.name}</strong> to a manual account?
                  </span>
                  <span className="block text-xs bg-primary/5 border border-primary/10 rounded-lg p-3 text-muted-foreground leading-relaxed font-normal">
                    💡 <strong>What this does:</strong>
                    <ul className="list-disc pl-4 mt-1.5 space-y-1.5">
                      <li>Disconnects the account from all automated bank integrations.</li>
                      <li>Moves the account to the <strong>Manual Accounts</strong> list.</li>
                      <li><strong className="text-foreground">Preserves all history:</strong> No transactions, balances, or snapshots will be lost.</li>
                      <li>Allows you to manually update the balance moving forward.</li>
                    </ul>
                  </span>
                </AlertDialogDescription>
              </AlertDialogHeader>
              {convertError && (
                <div className="p-3 bg-destructive/20 border border-destructive/30 rounded-lg text-sm text-destructive mt-2">
                  {convertError}
                </div>
              )}
              <AlertDialogFooter className="mt-4">
                <AlertDialogCancel disabled={isConvertLoading} onClick={() => {
                  setIsConvertConfirmOpen(false);
                  setAccountToConvert(null);
                  setConvertError('');
                }}>
                  Cancel
                </AlertDialogCancel>
                <button
                  disabled={isConvertLoading}
                  onClick={handleConvertToManual}
                  className="px-4 py-2 text-sm font-semibold text-primary-foreground bg-primary rounded-lg hover:opacity-90 disabled:opacity-50 transition-opacity flex items-center justify-center gap-1.5"
                >
                  {isConvertLoading ? 'Converting...' : 'Convert to Manual'}
                </button>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>

          {/* Delete Orphaned Account Confirmation Dialog */}
          <AlertDialog open={isDeleteConfirmOpen} onOpenChange={(open) => !open && !isDeleteLoading && setIsDeleteConfirmOpen(false)}>
            <AlertDialogContent className="max-w-md">
              <AlertDialogHeader>
                <AlertDialogTitle className="text-destructive">Delete Unlinked Account</AlertDialogTitle>
                <AlertDialogDescription className="space-y-3">
                  <span className="block">
                    Are you sure you want to permanently delete the account <strong className="text-foreground">{accountToDelete?.name}</strong>?
                  </span>
                  <span className="block text-xs bg-destructive/10 border border-destructive/20 rounded-lg p-3 text-destructive leading-relaxed font-normal">
                    ⚠️ <strong>This action cannot be undone.</strong> Deleting this account will permanently remove all of its historical balances, snapshots, and <strong>every associated transaction</strong>.
                  </span>
                </AlertDialogDescription>
              </AlertDialogHeader>
              {deleteError && (
                <div className="p-3 bg-destructive/20 border border-destructive/30 rounded-lg text-xs text-destructive mt-2">
                  {deleteError}
                </div>
              )}
              <AlertDialogFooter className="mt-4">
                <AlertDialogCancel disabled={isDeleteLoading} onClick={() => {
                  setIsDeleteConfirmOpen(false);
                  setAccountToDelete(null);
                  setDeleteError('');
                }}>
                  Cancel
                </AlertDialogCancel>
                <button
                  disabled={isDeleteLoading}
                  onClick={handleDeleteAccount}
                  className="px-4 py-2 text-sm font-semibold text-white bg-destructive rounded-lg hover:bg-destructive/90 disabled:opacity-50 transition-colors flex items-center justify-center gap-1.5"
                >
                  {isDeleteLoading ? 'Deleting...' : 'Permanently Delete'}
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
