'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { Download, Upload, FileArchive, Loader2 } from 'lucide-react';
import { SETTING_DEFINITIONS, API_KEY_FIELD_KEYS, API_KEY_DEFAULTS } from '@/config/defaults';
import { handleSignOut } from '@/components/server-actions';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

type SettingsState = Record<string, unknown>;
type DirtyMap = Record<string, true>;

function getDefaultForKey(key: string): unknown {
  const def = SETTING_DEFINITIONS.find((d) => d.key === key);
  return def ? def.defaultValue : undefined;
}

function flattenSettings(data: Record<string, unknown>): SettingsState {
  const flat: SettingsState = { ...data };
  if (data.apiKeys && typeof data.apiKeys === 'object') {
    for (const [k, v] of Object.entries(data.apiKeys as Record<string, string>)) {
      flat[k] = v;
    }
  }
  delete flat.apiKeys;
  return flat;
}

function formatDefault(value: unknown): string {
  if (value === null) return 'null';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

function packForSave(working: SettingsState): Record<string, unknown> {
  const body: Record<string, unknown> = { ...working };

  const apiKeys: Record<string, string> = {};
  let hasApiKeys = false;
  for (const k of API_KEY_FIELD_KEYS) {
    apiKeys[k] = (working[k] as string) ?? API_KEY_DEFAULTS[k] ?? '';
    hasApiKeys = true;
    delete body[k];
  }
  if (hasApiKeys) {
    body.apiKeys = apiKeys;
  }

  return body;
}

export default function AdvancedTab() {
  const [original, setOriginal] = useState<SettingsState | null>(null);
  const [working, setWorking] = useState<SettingsState | null>(null);
  const [dirty, setDirty] = useState<DirtyMap>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  // Danger zone & sharing status states
  const [currentUser, setCurrentUser] = useState<string | null>(null);
  const [sharingGroup, setSharingGroup] = useState<any>(null);
  const [loadingSharing, setLoadingSharing] = useState(true);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [confirmText, setConfirmText] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const loadSettings = useCallback(async () => {
    try {
      const res = await fetch('/api/user-settings', { credentials: 'include' });
      const data = await res.json();
      const flat = flattenSettings(data);
      setOriginal(flat);
      setWorking({ ...flat });
      setDirty({});
    } catch {
      setError('Failed to load settings');
    } finally {
      setLoading(false);
    }
  }, []);

  const loadSharingStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/sharing', { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        setSharingGroup(data.group ?? null);
      }
      const sessRes = await fetch('/api/auth/session', { credentials: 'include' });
      if (sessRes.ok) {
        const sess = await sessRes.json();
        setCurrentUser(sess?.user?.id ?? null);
      }
    } catch (err) {
      console.error('Failed to load sharing status/session:', err);
    } finally {
      setLoadingSharing(false);
    }
  }, []);

  useEffect(() => {
    loadSettings();
    loadSharingStatus();
  }, [loadSettings, loadSharingStatus]);

  const handleDeleteAccount = useCallback(async () => {
    setDeleting(true);
    setDeleteError(null);
    try {
      const res = await fetch('/api/users/me', {
        method: 'DELETE',
        credentials: 'include',
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.message || errData.error || `HTTP ${res.status}`);
      }
      await handleSignOut();
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : 'Failed to delete account');
      setDeleting(false);
      setConfirmDeleteOpen(false);
    }
  }, []);

  const updateValue = useCallback(
    (key: string, value: unknown) => {
      setWorking((prev) => (prev ? { ...prev, [key]: value } : prev));
      if (original && original[key] !== value && JSON.stringify(original[key]) !== JSON.stringify(value)) {
        setDirty((prev) => ({ ...prev, [key]: true }));
      } else {
        setDirty((prev) => {
          const next = { ...prev };
          delete next[key];
          return next;
        });
      }
    },
    [original],
  );

  const resetToDefault = useCallback((key: string) => {
    const defaultValue = getDefaultForKey(key);
    updateValue(key, defaultValue);
  }, [updateValue]);

  const resetAllDirty = useCallback(() => {
    if (!original) return;
    setWorking({ ...original });
    setDirty({});
  }, [original]);

  const applyChanges = useCallback(async () => {
    if (!working) return;
    const dirtyKeys = Object.keys(dirty);
    if (dirtyKeys.length === 0) return;

    setSaving(true);
    setError(null);
    setSuccess(false);

    try {
      const body = packForSave(working);
      const res = await fetch('/api/user-settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || errData.message || `HTTP ${res.status}`);
      }
      const updated = await res.json();
      const flat = flattenSettings(updated);
      setOriginal(flat);
      setWorking({ ...flat });
      setDirty({});
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save settings');
    } finally {
      setSaving(false);
    }
  }, [working, dirty]);

  const groups = SETTING_DEFINITIONS.reduce(
    (acc, def) => {
      (acc[def.group] ??= []).push(def);
      return acc;
    },
    {} as Record<string, typeof SETTING_DEFINITIONS>,
  );

  const totalDirty = Object.keys(dirty).length;

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [backupBusy, setBackupBusy] = useState<'export' | 'csv' | 'import' | null>(null);
  const [backupError, setBackupError] = useState<string | null>(null);
  const [backupSuccess, setBackupSuccess] = useState<string | null>(null);

  const handleExport = useCallback(async () => {
    setBackupBusy('export');
    setBackupError(null);
    setBackupSuccess(null);
    try {
      const res = await fetch('/api/backup/export', { credentials: 'include' });
      if (!res.ok) throw new Error('Export failed');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `runway-finance-backup-${new Date().toISOString().split('T')[0]}.json`;
      a.click();
      URL.revokeObjectURL(url);
      setBackupSuccess('Backup downloaded successfully.');
    } catch (err) {
      setBackupError(err instanceof Error ? err.message : 'Export failed');
    } finally {
      setBackupBusy(null);
    }
  }, []);

  const handleExportCsv = useCallback(async () => {
    setBackupBusy('csv');
    setBackupError(null);
    setBackupSuccess(null);
    try {
      const res = await fetch('/api/backup/export-csv', { credentials: 'include' });
      if (!res.ok) throw new Error('CSV export failed');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `runway-finance-export-${new Date().toISOString().split('T')[0]}.zip`;
      a.click();
      URL.revokeObjectURL(url);
      setBackupSuccess('CSV export downloaded successfully.');
    } catch (err) {
      setBackupError(err instanceof Error ? err.message : 'CSV export failed');
    } finally {
      setBackupBusy(null);
    }
  }, []);

  const handleFileSelected = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setBackupBusy('import');
    setBackupError(null);
    setBackupSuccess(null);
    try {
      const text = await file.text();
      const res = await fetch('/api/backup/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: text,
      });
      let data: any = null;
      try {
        const contentType = res.headers.get('content-type');
        if (contentType && contentType.includes('application/json')) {
          data = await res.json();
        }
      } catch {
        // Ignore JSON parse errors from non-JSON error pages
      }
      if (!res.ok) throw new Error((data && data.error) || `Import failed with status ${res.status}`);
      setBackupSuccess((data && data.message) || 'Backup restored successfully.');
    } catch (err) {
      setBackupError(err instanceof Error ? err.message : 'Import failed');
    } finally {
      setBackupBusy(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }, []);

  if (loading) {
    return <div className="text-muted-foreground py-4 text-center text-sm">Loading settings...</div>;
  }

  return (
    <div className="space-y-3 w-full min-w-0">
      {/* Backup & Restore */}
      <div className="p-4 bg-card border border-border rounded-lg space-y-3">
        <div>
          <h2 className="text-sm font-semibold text-foreground">Backup & Restore</h2>
          <p className="text-[10px] text-muted-foreground mt-0.5">
            Download a full backup of all your data and settings, or restore from a previous backup.
          </p>
        </div>

        {backupError && (
          <div className="p-2 bg-destructive/20 border border-destructive/30 rounded-lg">
            <p className="text-xs text-destructive">{backupError}</p>
          </div>
        )}

        {backupSuccess && (
          <div className="p-2 bg-chart-1/20 border border-chart-1/30 rounded-lg">
            <p className="text-xs text-chart-1">{backupSuccess}</p>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={handleExport}
            disabled={backupBusy !== null}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-medium text-foreground bg-muted hover:bg-accent border border-border rounded-lg transition-colors disabled:opacity-50"
          >
            {backupBusy === 'export' ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Download className="w-3.5 h-3.5" />
            )}
            Download Backup
          </button>

          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={backupBusy !== null}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-medium text-foreground bg-muted hover:bg-accent border border-border rounded-lg transition-colors disabled:opacity-50"
          >
            {backupBusy === 'import' ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Upload className="w-3.5 h-3.5" />
            )}
            Restore from Backup
          </button>

          <button
            onClick={handleExportCsv}
            disabled={backupBusy !== null}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-medium text-foreground bg-muted hover:bg-accent border border-border rounded-lg transition-colors disabled:opacity-50"
          >
            {backupBusy === 'csv' ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <FileArchive className="w-3.5 h-3.5" />
            )}
            Export as CSV
          </button>

          <input
            ref={fileInputRef}
            type="file"
            accept=".json"
            onChange={handleFileSelected}
            className="hidden"
          />
        </div>
      </div>

      {/* Danger Zone */}
      <div className="p-4 bg-card border border-destructive/20 rounded-lg space-y-3">
        <div>
          <h2 className="text-sm font-semibold text-destructive">Danger Zone</h2>
          <p className="text-[10px] text-muted-foreground mt-0.5">
            Permanently delete your account, login credentials, and all settings.
          </p>
        </div>

        {deleteError && (
          <div className="p-2 bg-destructive/20 border border-destructive/30 rounded-lg">
            <p className="text-xs text-destructive">{deleteError}</p>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => {
              setDeleteError(null);
              setConfirmText('');
              setConfirmDeleteOpen(true);
            }}
            disabled={loadingSharing}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-semibold text-destructive bg-destructive/10 hover:bg-destructive/20 border border-destructive/20 rounded-lg transition-colors disabled:opacity-50"
          >
            Delete Account
          </button>
        </div>
      </div>

      {/* Warning Banner */}
      <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-lg">
        <div className="flex items-start gap-2">
          <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 mt-0.5 flex-shrink-0 text-amber-500">
            <path fillRule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 6a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 6zm0 9a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
          </svg>
          <div>
            <h3 className="text-xs font-semibold text-amber-500">Warning</h3>
            <p className="text-[11px] text-amber-600/80 mt-0.5">
              Changing these settings could cause unexpected behavior. Only modify them if you know what you are doing.
            </p>
          </div>
        </div>
      </div>

      {error && (
        <div className="p-2 bg-destructive/20 border border-destructive/30 rounded-lg">
          <p className="text-xs text-destructive">{error}</p>
        </div>
      )}

      {success && (
        <div className="p-2 bg-chart-1/20 border border-chart-1/30 rounded-lg">
          <p className="text-xs text-chart-1">Settings saved successfully.</p>
        </div>
      )}

      {/* Grouped Settings */}
      {Object.entries(groups).map(([group, defs]) => (
        <div key={group} className="p-3 bg-card border border-border rounded-lg">
          <h2 className="text-sm font-semibold text-foreground mb-2">{group}</h2>

          <div className="space-y-1.5">
            {defs.map((def) => {
              const currentValue = working?.[def.key];
              const isDirty = !!dirty[def.key];
              const defaultValue = def.defaultValue;
              const isDefault = currentValue === defaultValue ||
                JSON.stringify(currentValue) === JSON.stringify(defaultValue);

              return (
                <div
                  key={def.key}
                  className={`p-2 border rounded-lg ${
                    isDirty
                      ? 'border-primary/40 bg-primary/[0.03]'
                      : 'border-border bg-muted/20'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-medium text-foreground">{def.label}</span>
                        <code className="text-[9px] text-muted-foreground/50 font-mono">{def.key}</code>
                        {isDirty && (
                          <span className="text-[9px] font-medium text-primary px-1 py-0.5 bg-primary/10 rounded">Modified</span>
                        )}
                      </div>
                      <p className="text-[10px] text-muted-foreground mt-0.5 leading-relaxed">{def.description}</p>
                      <div className="mt-1 flex items-center gap-1.5">
                        <span className="text-[9px] text-muted-foreground/60 font-mono">
                          Value:{' '}
                          {def.type === 'boolean'
                            ? currentValue ? 'true' : 'false'
                            : def.type === 'json'
                              ? JSON.stringify(currentValue)
                              : def.type === 'password'
                                ? (currentValue as string) ? '***' : '(empty)'
                                : String(currentValue ?? '(empty)')
                          }
                        </span>
                        {!isDefault && (
                          <span className="text-[9px] text-muted-foreground/30">(default: {formatDefault(def.defaultValue)})</span>
                        )}
                      </div>
                    </div>
                    <button
                      onClick={() => resetToDefault(def.key)}
                      disabled={isDefault || saving}
                      className={`px-1.5 py-0.5 text-[9px] font-medium rounded transition-colors disabled:opacity-30 ${
                        !isDefault
                          ? 'text-muted-foreground hover:text-foreground bg-muted hover:bg-accent'
                          : 'text-muted-foreground/30'
                      }`}
                      title="Reset to default"
                    >
                      Reset
                    </button>
                  </div>

                  <div className="mt-1.5">
                    {def.type === 'boolean' ? (
                      <input
                        type="text"
                        value={(currentValue as string) ?? 'false'}
                        onChange={(e) => updateValue(def.key, e.target.value)}
                        placeholder="true or false"
                        className="w-full px-2 py-1 bg-background border border-input rounded text-foreground text-[11px] font-mono focus:outline-none focus:ring-1 focus:ring-ring"
                      />
                    ) : def.type === 'json' ? (
                      <textarea
                        value={typeof currentValue === 'object' ? JSON.stringify(currentValue, null, 2) : (currentValue as string ?? '')}
                        onChange={(e) => updateValue(def.key, e.target.value)}
                        rows={3}
                        className="w-full px-2 py-1 bg-background border border-input rounded text-foreground text-[11px] font-mono focus:outline-none focus:ring-1 focus:ring-ring resize-y"
                      />
                    ) : def.type === 'number' ? (
                      <input
                        type="number"
                        value={(currentValue as number) ?? ''}
                        onChange={(e) => updateValue(def.key, e.target.value ? Number(e.target.value) : '')}
                        className="w-full px-2 py-1 bg-background border border-input rounded text-foreground text-[11px] font-mono focus:outline-none focus:ring-1 focus:ring-ring"
                      />
                    ) : (
                      <input
                        type={def.type === 'password' ? 'password' : 'text'}
                        value={(currentValue as string) ?? ''}
                        onChange={(e) => updateValue(def.key, e.target.value)}
                        placeholder={def.type === 'password' ? 'Enter API key...' : ''}
                        className="w-full px-2 py-1 bg-background border border-input rounded text-foreground text-[11px] font-mono focus:outline-none focus:ring-1 focus:ring-ring"
                      />
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}

      {/* Apply / Discard bar */}
      <div className={`sticky bottom-0 p-2 pb-[calc(0.5rem+env(safe-area-inset-bottom))] bg-card border border-border rounded-lg flex items-center justify-between gap-3 transition-opacity ${
        totalDirty > 0 ? 'opacity-100' : 'opacity-0 pointer-events-none'
      }`}>
        <span className="text-[10px] text-muted-foreground">
          {totalDirty} setting{totalDirty !== 1 ? 's' : ''} modified
        </span>
        <div className="flex items-center gap-2">
          <button
            onClick={resetAllDirty}
            disabled={saving}
            className="px-3 py-1 text-[11px] font-medium text-muted-foreground hover:text-foreground bg-muted hover:bg-accent rounded-lg transition-colors disabled:opacity-50"
          >
            Discard
          </button>
          <button
            onClick={applyChanges}
            disabled={saving || totalDirty === 0}
            className="px-3 py-1 text-[11px] font-semibold text-primary-foreground bg-primary rounded-lg hover:opacity-90 transition-all disabled:opacity-50"
          >
            {saving ? 'Applying...' : `Apply Changes (${totalDirty})`}
          </button>
        </div>
      </div>

      {/* Deletion Dialog */}
      {(() => {
        const isOwner = sharingGroup && sharingGroup.primaryUserId === currentUser;
        const isMember = sharingGroup && sharingGroup.primaryUserId !== currentUser;

        let warningTitle = 'Delete Your Account?';
        let warningDescription = 'This will permanently delete your user account, login credentials, and all settings. All financial data (connections, manual accounts, transactions, budgets, category rules) and encryption keys will be deleted forever. This action is irreversible.';
        const requiredConfirmText = currentUser || '';

        if (isOwner) {
          warningTitle = 'Delete Account & Dismantle Share Group?';
          warningDescription = 'This will permanently delete your user account and dismantle your share group. Group members will be immediately disconnected, their access to the shared financial data will be revoked, and their encryption keys will be reset (giving them empty standalone accounts). All shared financial data (connections, manual accounts, transactions, budgets, category rules) will be deleted forever. This action is irreversible.';
        } else if (isMember) {
          warningTitle = 'Delete Account & Leave Share Group?';
          warningDescription = 'This will permanently delete your user account and remove you from the shared group. Your personal settings and sync connections will be deleted. You will lose access to the shared financial data. Note: The financial data owned by the primary user (including transactions and accounts they own) will remain with the primary user. This action is irreversible.';
        }

        const isConfirmDisabled = confirmText !== requiredConfirmText || deleting;

        return (
          <AlertDialog open={confirmDeleteOpen} onOpenChange={setConfirmDeleteOpen}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle className="text-destructive">{warningTitle}</AlertDialogTitle>
                <AlertDialogDescription className="text-xs leading-relaxed text-foreground/80">
                  {warningDescription}
                </AlertDialogDescription>
              </AlertDialogHeader>
              
              <div className="space-y-3 py-2 text-foreground/80">
                <div className="p-2 bg-destructive/10 border border-destructive/20 rounded-lg">
                  <p className="text-[11px] text-destructive leading-relaxed font-medium">
                    WARNING: This action is permanent, destructive, and cannot be undone.
                  </p>
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-medium text-muted-foreground block">
                    To confirm, type your username <strong>{requiredConfirmText}</strong> below:
                  </label>
                  <input
                    type="text"
                    value={confirmText}
                    onChange={(e) => setConfirmText(e.target.value)}
                    placeholder={requiredConfirmText}
                    className="w-full px-2.5 py-1.5 bg-background border border-input rounded text-foreground text-xs focus:outline-none focus:ring-1 focus:ring-ring font-mono"
                    disabled={deleting}
                  />
                </div>
              </div>
              
              <AlertDialogFooter className="gap-2">
                <AlertDialogCancel disabled={deleting} className="text-xs">Cancel</AlertDialogCancel>
                <button
                  type="button"
                  onClick={handleDeleteAccount}
                  disabled={isConfirmDisabled}
                  className="px-3 py-2 text-xs font-semibold text-destructive-foreground bg-destructive rounded-lg hover:bg-destructive/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center gap-1.5 justify-center min-w-[120px]"
                >
                  {deleting ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      Deleting...
                    </>
                  ) : (
                    'Permanently Delete'
                  )}
                </button>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        );
      })()}
    </div>
  );
}
