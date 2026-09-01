'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { invalidateAfterAccountChange } from '@/lib/query-invalidation';
import { usePlaidLink } from 'react-plaid-link';
import { 
  Check, 
  Landmark, 
  BarChart3, 
  Sparkles, 
  AlertCircle, 
  AlertTriangle, 
  Info, 
  X, 
  ChevronDown, 
  ChevronUp, 
  BellOff 
} from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Switch } from '@/components/ui/switch';
import { SectionHeading } from '@/components/ui/section-heading';
import { Input } from '@/components/ui/input';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { getBadgeClasses } from '@/lib/utils/account-badge';
import { isInvestmentAccount } from '@/lib/utils/account-scope';
import { useUserSettings } from '@/components/user-settings-provider';
import { useRouter } from 'next/navigation';
import type { SettingsAccount, SettingsConnection } from './OrphanedAccountsSection';

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

interface AutomaticAccountsSectionProps {
  accounts: SettingsAccount[];
  accountsLoading: boolean;
  connections: SettingsConnection[];
  connectionsLoading: boolean;
  /** 'transactions' = transaction settings + bank connections (Settings > Accounts > Connections
   *  tab); 'management' = account management table (Settings > Accounts > Automatic Accounts tab). */
  accountView?: 'transactions' | 'management';
  currentUserId?: string;
  sharingGroup: any;
  fetchAccounts: () => Promise<void>;
  fetchConnections: () => Promise<void>;
  onOpenAccountDrawer: (account: SettingsAccount) => void;
}

export default function AutomaticAccountsSection({
  accounts,
  accountsLoading,
  connections,
  connectionsLoading,
  accountView = 'management',
  currentUserId,
  sharingGroup,
  fetchAccounts,
  fetchConnections,
  onOpenAccountDrawer,
}: AutomaticAccountsSectionProps) {
  const queryClient = useQueryClient();
  const router = useRouter();
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

  const [setupToken, setSetupToken] = useState('');
  const [label, setLabel] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [syncingId, setSyncingId] = useState<string | null>(null);
  const [fullResyncId, setFullResyncId] = useState<string | null>(null);
  const [fullResyncConn, setFullResyncConn] = useState<SettingsConnection | null>(null);
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

  const [detailsConn, setDetailsConn] = useState<SettingsConnection | null>(null);
  const [detailsLabel, setDetailsLabel] = useState('');
  const [deleteConn, setDeleteConn] = useState<SettingsConnection | null>(null);
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
  const [plaidDialogError, setPlaidDialogError] = useState('');
  const [dismissedPlaidHourlyWarnings, setDismissedPlaidHourlyWarnings] = useState<string[]>([]);
  const [isPricingExpanded, setIsPricingExpanded] = useState(false);
  const [isAddConnectionExpanded, setIsAddConnectionExpanded] = useState(true);
  const [isSyncFeesExpanded, setIsSyncFeesExpanded] = useState(false);

  const [accountFilter, setAccountFilter] = useState<'all' | 'visible' | 'included' | 'hidden' | 'excluded' | 'plaid' | 'simplefin'>('all');
  const [mutingAccountId, setMutingAccountId] = useState<string | null>(null);

  const [isManageSyncDialogOpen, setIsManageSyncDialogOpen] = useState(false);
  const [manageSyncConn, setManageSyncConn] = useState<SettingsConnection | null>(null);
  const [manageSyncAccounts, setManageSyncAccounts] = useState<Array<{ id: string; name: string; institution: string; balance: string; currency: string }>>([]);
  const [manageSyncLoading, setManageSyncLoading] = useState(false);
  const [manageSyncSaving, setManageSyncSaving] = useState(false);
  const [manageSyncError, setManageSyncError] = useState('');
  const [tempDisabledAccounts, setTempDisabledAccounts] = useState<string[]>([]);

  const [isSimpleFinRotateDialogOpen, setIsSimpleFinRotateDialogOpen] = useState(false);
  const [simpleFinRotateConn, setSimpleFinRotateConn] = useState<SettingsConnection | null>(null);
  const [simpleFinRotateToken, setSimpleFinRotateToken] = useState('');
  const [simpleFinRotateLoading, setSimpleFinRotateLoading] = useState(false);
  const [simpleFinRotateError, setSimpleFinRotateError] = useState('');

  const openRotateSimpleFin = (conn: SettingsConnection) => {
    setSimpleFinRotateConn(conn);
    setSimpleFinRotateToken('');
    setSimpleFinRotateError('');
    setIsSimpleFinRotateDialogOpen(true);
  };

  const handleRotateSimpleFin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!simpleFinRotateConn) return;
    setSimpleFinRotateLoading(true);
    setSimpleFinRotateError('');
    try {
      const res = await fetch(`/api/connections/${simpleFinRotateConn.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          setupToken: simpleFinRotateToken.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || data.error || 'Failed to update SimpleFIN access URL');
      }
      setIsSimpleFinRotateDialogOpen(false);
      setSuccess('SimpleFIN access URL updated successfully!');
      await fetchConnections();
      invalidateAllFinanceQueries();
    } catch (err: any) {
      setSimpleFinRotateError(err.message || 'Failed to update SimpleFIN access URL');
    } finally {
      setSimpleFinRotateLoading(false);
    }
  };

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('dismissed_plaid_hourly');
      if (saved) {
        try {
          setDismissedPlaidHourlyWarnings(JSON.parse(saved));
        } catch {}
      }
    }
  }, []);

  const dismissPlaidHourlyWarning = (connId: string) => {
    const updated = [...dismissedPlaidHourlyWarnings, connId];
    setDismissedPlaidHourlyWarnings(updated);
    localStorage.setItem('dismissed_plaid_hourly', JSON.stringify(updated));
  };

  const invalidateAllFinanceQueries = () => {
    invalidateAfterAccountChange(queryClient);
  };

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
    setPlaidDialogError('');
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
    setPlaidDialogError('');
    setPlaidLinkError('');
    setPlaidLinkSuccess('');
    try {
      // 1. Validate credentials with Plaid validate endpoint
      const validateRes = await fetch('/api/plaid/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          clientId: plaidClientId.trim(),
          secret: plaidSecret.trim(),
          environment: plaidEnvironment,
        }),
      });

      const validateData = await validateRes.json();
      if (!validateRes.ok || !validateData.valid) {
        throw new Error(validateData.error || 'Invalid Plaid credentials');
      }

      // 2. Save valid credentials to user settings
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
      setPlaidLinkSuccess('Plaid API credentials saved and validated successfully. They will be used for future sync operations.');
    } catch (err: any) {
      setPlaidDialogError(err.message || 'Failed to save Plaid credentials');
      setPlaidLinkError(err.message || 'Failed to save Plaid credentials');
    } finally {
      setSavingPlaidCredentials(false);
    }
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
      invalidateAllFinanceQueries();
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
      await fetchConnections();
    } catch {}
  }, [fetchConnections]);

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
        invalidateAllFinanceQueries();
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
        invalidateAllFinanceQueries();
      }
    } catch {
      setSyncResult({ status: 'error', accountsSynced: 0, transactionsFetched: 0, transactionsNew: 0, transactionsUpdated: 0, durationMs: 0, details: [] });
    } finally {
      setFullResyncId(null);
    }
  };

  const handleDeleteConnection = async () => {
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
        invalidateAllFinanceQueries();
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

  const openDetails = (conn: SettingsConnection) => {
    setDetailsConn(conn);
    setDetailsLabel(conn.label);
  };

  const openManageSync = useCallback(async (conn: SettingsConnection) => {
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
      invalidateAllFinanceQueries();
    } catch (err) {
      setManageSyncError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setManageSyncSaving(false);
    }
  }, [manageSyncConn, tempDisabledAccounts, fetchConnections, fetchAccounts]);

  const handleMuteSyncAlerts = useCallback(async (account: SettingsAccount) => {
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
      fetchAccounts();
    } catch (err: any) {
      alert(err.message || 'An error occurred');
    } finally {
      setMutingAccountId(null);
    }
  }, [fetchAccounts]);

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

  const maskAccessUrl = (conn: SettingsConnection) => {
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

  const calculateConnectionCost = (conn: SettingsConnection) => {
    if (conn.provider === 'simplefin') {
      return { baseFee: 1.50, refreshCost: 0, total: 1.50 };
    }

    const hasInvestments = accounts.some(
      (acc) => acc.plaidConnectionId === conn.id && isInvestmentAccount(acc.type)
    );

    const baseFee = 0.30 + (hasInvestments ? 0.30 : 0);
    let refreshesPerMonth = 0;
    if (conn.syncFrequency === 'hourly') refreshesPerMonth = 24 * 30;
    else if (conn.syncFrequency === 'daily') refreshesPerMonth = 1 * 30;
    else if (conn.syncFrequency === 'weekly') refreshesPerMonth = 4.3;
    else if (conn.syncFrequency === 'monthly') refreshesPerMonth = 1;

    const refreshCost = refreshesPerMonth * 0.08;
    const total = baseFee + refreshCost;
    return { baseFee, refreshCost, total };
  };

  const view: 'transactions' | 'management' = accountView === 'transactions' ? 'transactions' : 'management';
  const hasConnection = connections.length > 0;
  const hasMySimpleFin = connections.some((conn) => conn.userId === currentUserId && conn.provider === 'simplefin');

  const staleAccounts = accounts.filter(
    (acc) => acc.syncStatus && acc.syncStatus.status !== 'ok'
  );

  return (
    <>
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

      {view === 'transactions' && staleAccounts.length > 0 && (
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
      )}

      {/* Transaction Settings Section */}
      {view === 'transactions' && (
        <div className="mb-6 pb-6 border-b border-border/60">
          <SectionHeading className="mb-1">Transaction Settings</SectionHeading>
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
      )}

      {/* Add Connection Options */}
      {view === 'transactions' && (
      <div className="p-0 mb-6">
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
                  className="w-full px-4 py-2 text-xs font-semibold text-primary-foreground bg-primary hover:opacity-90 disabled:opacity-50 rounded-lg transition-colors flex items-center justify-center gap-1.5"
                >
                  {plaidLoading ? 'Initializing Plaid...' : 'Connect via Plaid'}
                </button>
              </div>

              {/* Option B: SimpleFIN */}
              <div className="p-4 bg-muted/20 border border-border rounded-lg flex flex-col justify-between space-y-3">
                <div>
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="text-sm font-semibold text-foreground">Connect via SimpleFIN (MX)</h3>
                    {hasMySimpleFin && (
                      <button
                        type="button"
                        onClick={() => {
                          const conn = connections.find((c) => c.userId === currentUserId && c.provider === 'simplefin');
                          if (conn) openRotateSimpleFin(conn);
                        }}
                        className="text-[10px] font-medium text-muted-foreground hover:text-foreground border border-border hover:bg-muted px-2 py-0.5 rounded-md transition-colors flex-shrink-0 cursor-pointer"
                      >
                        Edit Keys
                      </button>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    Import transactions from your bank using a SimpleFIN setup token/API key.
                  </p>
                </div>
                {hasMySimpleFin ? (
                  <button
                    type="button"
                    onClick={() => {
                      const conn = connections.find((c) => c.userId === currentUserId && c.provider === 'simplefin');
                      if (conn) openManageSync(conn);
                    }}
                    className="w-full px-4 py-2 text-xs font-semibold text-primary-foreground bg-primary hover:opacity-90 disabled:opacity-50 rounded-lg transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    Manage SimpleFIN (MX) Institutions
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => setShowSimpleFinForm(!showSimpleFinForm)}
                    className={`w-full px-4 py-2 text-xs font-semibold rounded-lg transition-colors flex items-center justify-center gap-1.5 cursor-pointer ${
                      showSimpleFinForm
                        ? 'text-foreground bg-muted hover:bg-accent border border-border'
                        : 'text-primary-foreground bg-primary hover:opacity-90 disabled:opacity-50'
                    }`}
                  >
                    {showSimpleFinForm ? 'Hide SimpleFIN Form' : 'Connect via SimpleFIN (MX)'}
                  </button>
                )}
              </div>
            </div>

            {/* Collapsible SimpleFIN Form */}
            {!hasMySimpleFin && showSimpleFinForm && (
              <div className="p-4 border border-border/80 rounded-lg bg-muted/10 space-y-4 animate-in fade-in slide-in-from-top-2 duration-200">
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
            </div>
          )}
      </div>
      )}

      {/* Existing Connections */}
      {view === 'transactions' && hasConnection && (
        <div className="p-0 mb-6">
          <SectionHeading className="mb-4">Automatic Bank Connections</SectionHeading>
          {connectionsLoading ? (
            <div className="text-muted-foreground text-sm">Loading...</div>
          ) : (
            <div className="space-y-3">
              {connections.map((conn) => {
                const nextSync = computeNextSync(conn.syncFrequency, conn.lastSyncAt);
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
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Account Management Table */}
      {view === 'management' && (
      <div className="p-0">
          <SectionHeading className="mb-1">Account Management</SectionHeading>
          <p className="text-xs text-muted-foreground mb-4">
            Manage your connected bank and brokerage accounts.
          </p>

          {!hasConnection ? (
            <div className="p-4 sm:p-5 bg-muted/30 border border-border rounded-xl text-center">
              <p className="text-sm font-medium text-foreground">No bank connections yet</p>
              <p className="text-xs text-muted-foreground mt-1">
                Connect a bank via Plaid or SimpleFIN in the Connections tab to manage your synchronized accounts here.
              </p>
              <button
                type="button"
                onClick={() => router.replace('/settings?tab=accounts&sub=connections')}
                className="mt-3 px-3 py-1.5 text-xs font-semibold text-primary-foreground bg-primary hover:opacity-90 rounded-lg transition-colors"
              >
                Go to Connections
              </button>
            </div>
          ) : (
            <>
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
              if (!a.connectionId && !a.plaidConnectionId) return false;
              if (accountFilter === 'hidden') return a.isHidden;
              if (accountFilter === 'excluded') return a.isExcludedFromNetWorth;
              if (accountFilter === 'visible') return !a.isHidden;
              if (accountFilter === 'included') return !a.isExcludedFromNetWorth;
              if (accountFilter === 'plaid') return !!a.plaidConnectionId;
              if (accountFilter === 'simplefin') return !!a.connectionId;
              return true;
            });

            if (filteredAccounts.length === 0) {
              return (
                <div className="p-4 bg-muted/30 border border-border rounded-lg text-center">
                  <p className="text-muted-foreground text-sm">
                    {accountFilter === 'all'
                      ? 'No connected accounts found. Enable accounts via Manage Sync, or run a Sync from the Connections tab.'
                      : 'No accounts match the filter.'}
                  </p>
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
                      onClick={() => onOpenAccountDrawer(account)}
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
                              onOpenAccountDrawer(account);
                            }}
                            className="px-2 py-0.5 sm:py-1 text-micro sm:text-[10px] font-medium text-muted-foreground hover:text-foreground border border-border hover:bg-muted rounded-lg transition-colors whitespace-nowrap"
                          >
                            Edit
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })()}
          </>
          )}
          </div>
          )}

      {/* Plaid Credentials Dialog */}
      <Dialog open={isPlaidCredentialsDialogOpen} onOpenChange={setIsPlaidCredentialsDialogOpen}>
        <DialogContent className="max-w-md max-h-[90dvh] sm:max-h-[85dvh] flex flex-col gap-0 p-0">
          <DialogHeader className="p-4 sm:p-6 pb-4 border-b border-border shrink-0">
            <DialogTitle>
              {connections.some((c) => c.provider === 'plaid') ? 'Update Plaid API Credentials' : 'Configure Plaid API Credentials'}
            </DialogTitle>
            <DialogDescription>
              {connections.some((c) => c.provider === 'plaid')
                ? 'Update your stored Plaid API keys. New credentials will be validated and saved for future sync operations.'
                : 'Enter your Plaid API keys to link bank accounts securely. Credentials are encrypted at rest.'}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSavePlaidCredentials} className="flex-1 flex flex-col overflow-hidden">
            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              {plaidDialogError && (
                <div className="p-3 bg-destructive/15 border border-destructive/25 rounded-lg flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 text-destructive shrink-0 mt-0.5" />
                  <p className="text-xs text-destructive leading-normal">{plaidDialogError}</p>
                </div>
              )}
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
              </div>
            </div>
            <DialogFooter className="p-6 pt-4 border-t border-border bg-muted/10 gap-2">
              <button
                type="button"
                onClick={() => setIsPlaidCredentialsDialogOpen(false)}
                className="px-4 py-2 text-xs font-semibold text-foreground bg-muted hover:bg-accent border border-border rounded-lg transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={savingPlaidCredentials}
                className="px-4 py-2 text-xs font-semibold text-primary-foreground bg-primary rounded-lg hover:opacity-90 disabled:opacity-50 transition-all cursor-pointer flex items-center justify-center gap-1.5"
              >
                {savingPlaidCredentials ? 'Validating & Saving...' : 'Save Keys'}
              </button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* SimpleFIN Rotate Access URL Dialog */}
      <Dialog open={isSimpleFinRotateDialogOpen} onOpenChange={setIsSimpleFinRotateDialogOpen}>
        <DialogContent className="max-w-md max-h-[90dvh] sm:max-h-[85dvh] flex flex-col gap-0 p-0">
          <DialogHeader className="p-4 sm:p-6 pb-4 border-b border-border shrink-0">
            <DialogTitle>Rotate SimpleFIN Access URL</DialogTitle>
            <DialogDescription>
              Update or replace your SimpleFIN access URL or setup token. Stored accounts and transaction history will remain intact.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleRotateSimpleFin} className="flex-1 flex flex-col overflow-hidden">
            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              {simpleFinRotateError && (
                <div className="p-3 bg-destructive/15 border border-destructive/25 rounded-lg flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 text-destructive shrink-0 mt-0.5" />
                  <p className="text-xs text-destructive leading-normal">{simpleFinRotateError}</p>
                </div>
              )}
              <div>
                <label htmlFor="rotateSetupToken" className="block text-sm font-medium text-foreground mb-1">
                  New SimpleFIN Setup Token or Access URL
                </label>
                <Input
                  id="rotateSetupToken"
                  value={simpleFinRotateToken}
                  onChange={(e) => setSimpleFinRotateToken(e.target.value)}
                  placeholder="Paste setup token or https://... access URL"
                  required
                  autoFocus
                />
                <p className="text-[11px] text-muted-foreground mt-1.5">
                  Generate a setup token on beta-bridge.simplefin.org or paste your full SimpleFIN access URL.
                </p>
              </div>
            </div>
            <DialogFooter className="p-6 pt-4 border-t border-border bg-muted/10 gap-2">
              <button
                type="button"
                onClick={() => setIsSimpleFinRotateDialogOpen(false)}
                className="px-4 py-2 text-xs font-semibold text-foreground bg-muted hover:bg-accent border border-border rounded-lg transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={simpleFinRotateLoading || !simpleFinRotateToken.trim()}
                className="px-4 py-2 text-xs font-semibold text-primary-foreground bg-primary rounded-lg hover:opacity-90 disabled:opacity-50 transition-all cursor-pointer flex items-center justify-center gap-1.5"
              >
                {simpleFinRotateLoading ? 'Updating URL...' : 'Update Access URL'}
              </button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Connection Details Dialog */}
      <Dialog open={!!detailsConn} onOpenChange={(open) => !open && setDetailsConn(null)}>
        <DialogContent className="max-w-md max-h-[90dvh] sm:max-h-[85dvh] flex flex-col gap-0 p-0">
          <DialogHeader className="p-4 sm:p-6 pb-4 border-b border-border shrink-0">
            <DialogTitle>Connection Details</DialogTitle>
            <DialogDescription>View and manage your sync connection.</DialogDescription>
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
                  <label className="text-xs text-muted-foreground font-medium">Created</label>
                  <div className="mt-1 text-foreground text-sm">{new Date(detailsConn.createdAt).toLocaleDateString()}</div>
                </div>
                <div>
                  <div className="flex items-center justify-between">
                    <label className="text-xs text-muted-foreground font-medium">Access URL</label>
                    {detailsConn.provider === 'simplefin' && (
                      <button
                        type="button"
                        onClick={() => {
                          const c = detailsConn;
                          setDetailsConn(null);
                          openRotateSimpleFin(c);
                        }}
                        className="text-[10px] font-semibold text-primary hover:underline cursor-pointer"
                      >
                        Rotate / Update URL
                      </button>
                    )}
                  </div>
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
              className="px-4 py-2 text-sm text-foreground bg-muted hover:bg-accent rounded-lg transition-colors cursor-pointer"
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
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <button
              type="button"
              onClick={handleFullResync}
              className="inline-flex h-9 items-center justify-center rounded-lg bg-amber-600 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-700 transition-colors"
            >
              Re-sync Full History
            </button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Connection Confirmation */}
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

          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <button
              type="button"
              onClick={handleDeleteConnection}
              disabled={deleteLoading}
              className="inline-flex h-9 items-center justify-center rounded-lg bg-destructive px-4 py-2 text-sm font-semibold text-destructive-foreground hover:opacity-90 transition-opacity"
            >
              {deleteLoading ? 'Deleting...' : deleteKeepData ? 'Remove Connection' : 'Delete All'}
            </button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Manage Sync Dialog */}
      <Dialog open={isManageSyncDialogOpen} onOpenChange={setIsManageSyncDialogOpen}>
        <DialogContent className="max-w-md max-h-[90dvh] sm:max-h-[85dvh] flex flex-col gap-0 p-0">
          <DialogHeader className="p-4 sm:p-6 pb-4 border-b border-border shrink-0">
            <DialogTitle>Manage Sync Accounts</DialogTitle>
            <DialogDescription>
              Configure which accounts retrieved from SimpleFIN are actively syncing data.
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto p-6 space-y-4">
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
    </>
  );
}
