'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import ResizableSidebar from '@/components/resizable-sidebar';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import ModeToggle from '@/components/mode-toggle';
import { useSidebar } from '@/components/resizable-sidebar';

type Connection = {
  id: string;
  label: string;
  lastSyncAt: string | null;
  lastSyncStatus: string;
  lastSyncError: string | null;
  createdAt: string;
  accessUrlEncrypted?: string;
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
  const [connections, setConnections] = useState<Connection[]>([]);
  const [connectionsLoading, setConnectionsLoading] = useState(true);
  const [syncingId, setSyncingId] = useState<string | null>(null);
  const [syncResult, setSyncResult] = useState<{ status: string; accountsSynced: number; transactionsFetched: number } | null>(null);
  const [detailsConn, setDetailsConn] = useState<Connection | null>(null);
  const [detailsLabel, setDetailsLabel] = useState('');
  const [deleteConn, setDeleteConn] = useState<Connection | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [editLabel, setEditLabel] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [savingLabel, setSavingLabel] = useState(false);

  // Fetch connections
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

  useEffect(() => {
    fetchConnections();
    fetch('/api/dev-mode', { credentials: 'include' })
      .then((res) => res.json())
      .then((data) => setDevMode(data.devMode))
      .catch(() => setDevMode(null));
  }, [fetchConnections]);

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
    } catch {
      // Ignore errors
    } finally {
      setDevModeLoading(false);
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

      if (!res.ok) {
        throw new Error(data.message || data.error || 'Failed to add connection');
      }

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
      if (res.ok) {
        await fetchConnections();
      }
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
        headers: { 'X-Confirm-Delete': 'true' },
        credentials: 'include',
      });
      if (res.ok) {
        await fetchConnections();
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
    } catch {
      // ignore
    }
    return 'Encrypted';
  };

  const hasConnection = connections.length > 0;

  return (
    <div className="min-h-screen w-full relative overflow-hidden">
      {/* Animated gradient background */}
      <div
        className="absolute inset-0 z-0 opacity-40 dark:opacity-20"
        style={{
          backgroundImage: `
            radial-gradient(ellipse at 20% 30%, rgba(59, 130, 246, 0.5) 0%, transparent 60%),
            radial-gradient(ellipse at 80% 70%, rgba(168, 85, 247, 0.4) 0%, transparent 70%),
            radial-gradient(ellipse at 60% 20%, rgba(236, 72, 153, 0.3) 0%, transparent 50%),
            radial-gradient(ellipse at 40% 80%, rgba(34, 197, 94, 0.3) 0%, transparent 65%)
          `,
        }}
      />

      {/* Left Sidebar */}
      <ResizableSidebar />

      {/* Content */}
      <div className="relative z-10 flex flex-col items-center justify-center mt-20 px-4 sm:px-6 lg:px-8" style={{ marginLeft: `${sidebarWidth}px` }}>
          <div className="max-w-2xl w-full space-y-8">
            {/* Heading */}
            <div className="text-center space-y-4">
              <h1 className="text-4xl sm:text-5xl font-bold tracking-tight">
                <span className="bg-linear-to-r from-blue-600 via-purple-600 to-pink-600 dark:from-blue-400 dark:via-purple-400 dark:to-pink-400 bg-clip-text text-transparent">
                  Settings
                </span>
              </h1>
              <p className="text-gray-400 dark:text-gray-500">
                Manage your SimpleFIN connections and account settings
              </p>
          </div>

          {/* Appearance */}
          <div className="p-6 bg-white/5 dark:bg-white/5 backdrop-blur-sm rounded-xl border border-white/10">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-xl font-semibold text-white">Appearance</h2>
                <p className="text-sm text-gray-400 mt-1">
                  Toggle between light and dark theme
                </p>
              </div>
              <ModeToggle />
            </div>
          </div>

          {/* Dev Mode Toggle */}
          <div className="p-6 bg-white/5 dark:bg-white/5 backdrop-blur-sm rounded-xl border border-white/10">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-xl font-semibold text-white">Developer Mode</h2>
                <p className="text-sm text-gray-400 mt-1">
                  Enable verbose application logs and debugging tools
                </p>
              </div>
              <button
                onClick={handleToggleDevMode}
                disabled={devModeLoading}
                className={`relative w-14 h-7 rounded-full transition-colors duration-200 ${
                  devMode ? 'bg-blue-600' : 'bg-gray-600'
                } disabled:opacity-50 disabled:cursor-not-allowed`}
              >
                <span
                  className={`absolute top-0.5 left-0.5 w-6 h-6 bg-white rounded-full shadow transition-transform duration-200 ${
                    devMode ? 'translate-x-7' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>
            {devMode === true && (
              <p className="mt-3 text-xs text-blue-400">
                Dev mode is active. Logs will appear in the bottom pane.
              </p>
            )}
            {devMode === false && (
              <p className="mt-3 text-xs text-gray-500">
                Dev mode is disabled. Logs are hidden.
              </p>
            )}
          </div>

          {/* Existing Connections */}
          <div className="p-6 bg-white/5 dark:bg-white/5 backdrop-blur-sm rounded-xl border border-white/10">
            <h2 className="text-xl font-semibold text-white mb-4">SimpleFIN Bridge Connection</h2>
            {connectionsLoading ? (
              <div className="text-gray-400">Loading...</div>
            ) : connections.length === 0 ? (
              <p className="text-gray-500 text-sm">No connection yet. Add one below.</p>
            ) : (
              <div className="space-y-3">
                {connections.map((conn) => (
                  <div
                    key={conn.id}
                    className="p-4 bg-white/5 border border-white/10 rounded-lg flex items-center justify-between gap-4"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${
                          conn.lastSyncStatus === 'ok' ? 'bg-emerald-400' :
                          conn.lastSyncStatus === 'error' ? 'bg-red-400' :
                          'bg-gray-500'
                        }`} />
                        {editingId === conn.id ? (
                          <div className="flex items-center gap-2">
                            <Input
                              value={editLabel}
                              onChange={(e) => setEditLabel(e.target.value)}
                              className="h-8 w-32 bg-white/10 border-white/20 text-white text-sm"
                              autoFocus
                            />
                            <button onClick={handleSaveLabel} disabled={savingLabel} className="text-xs text-blue-400 hover:text-blue-300">Save</button>
                            <button onClick={() => setEditingId(null)} className="text-xs text-gray-400 hover:text-gray-300">Cancel</button>
                          </div>
                        ) : (
                          <span
                            className="text-white font-medium cursor-pointer hover:text-blue-400 transition-colors"
                            onClick={() => { setEditingId(conn.id); setEditLabel(conn.label); }}
                          >
                            {conn.label}
                          </span>
                        )}
                      </div>
                      <div className="text-sm text-gray-400 mt-1 ml-4.5">
                        Last sync: {formatRelativeTime(conn.lastSyncAt)}
                      </div>
                      {conn.lastSyncError && (
                        <div className="text-xs text-red-400 mt-1 ml-4.5 truncate">{conn.lastSyncError}</div>
                      )}
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <span className={`px-2.5 py-1 text-xs rounded-full font-medium ${
                        conn.lastSyncStatus === 'ok'
                          ? 'bg-emerald-500/20 text-emerald-400'
                          : conn.lastSyncStatus === 'error'
                          ? 'bg-red-500/20 text-red-400'
                          : 'bg-gray-500/20 text-gray-400'
                      }`}>
                        {conn.lastSyncStatus === 'ok' ? 'Synced' : conn.lastSyncStatus === 'error' ? 'Error' : 'Pending'}
                      </span>
                      <button
                        onClick={() => handleSync(conn.id)}
                        disabled={syncingId === conn.id}
                        className="px-3 py-1.5 text-xs font-medium text-white bg-blue-600/20 hover:bg-blue-600/30 rounded-lg transition-colors disabled:opacity-50"
                      >
                        {syncingId === conn.id ? 'Syncing...' : 'Sync'}
                      </button>
                      <button
                        onClick={() => openDetails(conn)}
                        className="px-3 py-1.5 text-xs font-medium text-gray-400 hover:text-white border border-white/10 hover:border-white/20 rounded-lg transition-colors"
                      >
                        Details
                      </button>
                      <button
                        onClick={() => setDeleteConn(conn)}
                        className="px-3 py-1.5 text-xs font-medium text-red-400 hover:text-red-300 border border-red-500/20 hover:border-red-500/40 rounded-lg transition-colors"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                ))}

                {/* Sync result banner */}
                {syncResult && (
                  <div className={`p-3 rounded-lg border ${
                    syncResult.status === 'success'
                      ? 'bg-emerald-500/10 border-emerald-500/20'
                      : 'bg-red-500/10 border-red-500/20'
                  }`}>
                    <p className={`text-sm font-medium ${
                      syncResult.status === 'success' ? 'text-emerald-400' : 'text-red-400'
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

          {/* Add Connection Form */}
          {!hasConnection && (
            <div className="p-6 bg-white/5 dark:bg-white/5 backdrop-blur-sm rounded-xl border border-white/10">
              <h2 className="text-xl font-semibold text-white mb-4">Add SimpleFIN Connection</h2>
              
              {/* Instructions */}
              <div className="mb-4 p-4 bg-blue-500/10 border border-blue-500/20 rounded-lg">
                <h3 className="text-sm font-semibold text-blue-400 mb-2">How to get your SimpleFIN API key / setup token:</h3>
                <ol className="text-xs text-gray-300 space-y-1.5">
                  <li className="flex gap-2">
                    <span className="text-blue-400 font-bold">1.</span>
                    <span>Sign up for a SimpleFIN Bridge account at <a href="https://beta-bridge.simplefin.org" target="_blank" rel="noopener noreferrer" className="text-blue-400 underline hover:text-blue-300">https://beta-bridge.simplefin.org</a></span>
                  </li>
                  <li className="flex gap-2">
                    <span className="text-blue-400 font-bold">2.</span>
                    <span>After signing in, go My Account, Apps</span>
                  </li>
                  <li className="flex gap-2">
                    <span className="text-blue-400 font-bold">3.</span>
                    <span>Generate a new SimpleFIN API key or setup token by clicking New App Connection. (it will be a long base64-encoded string)</span>
                  </li>
                  <li className="flex gap-2">
                    <span className="text-blue-400 font-bold">4.</span>
                    <span>Paste the token below and click "Add Connection"</span>
                  </li>
                </ol>
              </div>

              <form onSubmit={handleAddConnection} className="space-y-4">
                <div>
                  <label htmlFor="setupToken" className="block text-sm font-medium text-gray-300 mb-1">
                    SimpleFIN API Key / Setup Token
                  </label>
                  <Input
                    id="setupToken"
                    value={setupToken}
                    onChange={(e) => setSetupToken(e.target.value)}
                    placeholder="Paste your SimpleFIN API key or setup token here..."
                    className="bg-white/10 border-white/20 text-white placeholder-gray-500"
                    required
                  />
                </div>

                <div>
                  <label htmlFor="label" className="block text-sm font-medium text-gray-300 mb-1">
                    Label (optional)
                  </label>
                  <Input
                    id="label"
                    value={label}
                    onChange={(e) => setLabel(e.target.value)}
                    placeholder="e.g., SimpleFIN Bridge"
                    className="bg-white/10 border-white/20 text-white placeholder-gray-500"
                  />
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full px-6 py-2.5 text-sm font-semibold text-white bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg shadow-md hover:shadow-lg transition-all duration-200"
                >
                  {loading ? 'Adding...' : 'Add Connection'}
                </button>
              </form>

              {error && (
                <div className="mt-4 p-3 bg-red-500/20 border border-red-500/30 rounded-lg">
                  <p className="text-red-400 text-sm">{error}</p>
                </div>
              )}

              {success && (
                <div className="mt-4 p-3 bg-green-500/20 border border-green-500/30 rounded-lg">
                  <p className="text-green-400 text-sm">{success}</p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Connection Details Dialog */}
      <Dialog open={!!detailsConn} onOpenChange={(open) => !open && setDetailsConn(null)}>
        <DialogContent className="bg-gray-950/95 border-white/10 max-w-md">
          <DialogHeader>
            <DialogTitle className="text-white">Connection Details</DialogTitle>
            <DialogDescription>
              View and manage your SimpleFIN connection.
            </DialogDescription>
          </DialogHeader>
          {detailsConn && (
            <div className="space-y-4">
              <div>
                <label className="text-sm text-gray-400">Label</label>
                <Input
                  value={detailsLabel}
                  onChange={(e) => setDetailsLabel(e.target.value)}
                  className="mt-1 bg-white/10 border-white/20 text-white"
                />
              </div>
              <div>
                <label className="text-sm text-gray-400">Status</label>
                <div className="mt-1 flex items-center gap-2">
                  <div className={`w-2.5 h-2.5 rounded-full ${
                    detailsConn.lastSyncStatus === 'ok' ? 'bg-emerald-400' :
                    detailsConn.lastSyncStatus === 'error' ? 'bg-red-400' :
                    'bg-gray-500'
                  }`} />
                  <span className="text-white text-sm">
                    {detailsConn.lastSyncStatus === 'ok' ? 'Synced' : detailsConn.lastSyncStatus === 'error' ? 'Error' : 'Pending'}
                  </span>
                </div>
              </div>
              <div>
                <label className="text-sm text-gray-400">Last Sync</label>
                <div className="mt-1 text-white text-sm">{formatRelativeTime(detailsConn.lastSyncAt)}</div>
              </div>
              <div>
                <label className="text-sm text-gray-400">Created</label>
                <div className="mt-1 text-white text-sm">{new Date(detailsConn.createdAt).toLocaleDateString()}</div>
              </div>
              <div>
                <label className="text-sm text-gray-400">Access URL</label>
                <div className="mt-1 text-gray-400 text-sm font-mono">{maskAccessUrl(detailsConn)}</div>
              </div>
              {detailsConn.lastSyncError && (
                <div>
                  <label className="text-sm text-red-400">Last Error</label>
                  <div className="mt-1 text-red-400 text-sm">{detailsConn.lastSyncError}</div>
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <button
              onClick={() => setDetailsConn(null)}
              className="px-4 py-2 text-sm text-white bg-white/10 hover:bg-white/20 rounded-lg transition-colors"
            >
              Close
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteConn} onOpenChange={(open) => !open && setDeleteConn(null)}>
        <AlertDialogContent className="bg-gray-950/95 border-white/10 max-w-sm">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-white">Delete Connection</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete <strong>{deleteConn?.label}</strong>? This will also remove all linked accounts and transactions. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {error && (
            <div className="mt-4 rounded-lg border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-300">
              {error}
            </div>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setDeleteConn(null)}>Cancel</AlertDialogCancel>
            <button
              type="button"
              onClick={handleDelete}
              disabled={deleteLoading}
              className="inline-flex h-9 items-center justify-center rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 transition-colors focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 disabled:pointer-events-none disabled:opacity-50"
            >
              {deleteLoading ? 'Deleting...' : 'Delete'}
            </button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
