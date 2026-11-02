'use client';

import React from 'react';
import { AlertCircle } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import type { SettingsConnection } from '../orphaned-accounts-section';

export interface PlaidCredentialsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  connections: SettingsConnection[];
  plaidClientId: string;
  setPlaidClientId: (val: string) => void;
  plaidSecret: string;
  setPlaidSecret: (val: string) => void;
  plaidEnvironment: string;
  setPlaidEnvironment: (val: string) => void;
  plaidDialogError: string;
  savingPlaidCredentials: boolean;
  handleSavePlaidCredentials: (e: React.FormEvent) => void;
}

export function PlaidCredentialsDialog({
  open,
  onOpenChange,
  connections,
  plaidClientId,
  setPlaidClientId,
  plaidSecret,
  setPlaidSecret,
  plaidEnvironment,
  setPlaidEnvironment,
  plaidDialogError,
  savingPlaidCredentials,
  handleSavePlaidCredentials,
}: PlaidCredentialsDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
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
              <Select
                id="plaidEnvironment"
                value={plaidEnvironment}
                onChange={(e) => setPlaidEnvironment(e.target.value)}
              >
                <option value="sandbox">Sandbox (Mock data)</option>
                <option value="production">Production / Pay-as-you-go (Real bank connections)</option>
              </Select>
            </div>
          </div>
          <DialogFooter className="p-6 pt-4 border-t border-border bg-muted/10 gap-2">
            <button
              type="button"
              onClick={() => onOpenChange(false)}
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
  );
}

export interface SimpleFinRotateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  simpleFinRotateToken: string;
  setSimpleFinRotateToken: (val: string) => void;
  simpleFinRotateError: string;
  simpleFinRotateLoading: boolean;
  handleRotateSimpleFin: (e: React.FormEvent) => void;
}

export function SimpleFinRotateDialog({
  open,
  onOpenChange,
  simpleFinRotateToken,
  setSimpleFinRotateToken,
  simpleFinRotateError,
  simpleFinRotateLoading,
  handleRotateSimpleFin,
}: SimpleFinRotateDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
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
              onClick={() => onOpenChange(false)}
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
  );
}

export interface ConnectionDetailsDialogProps {
  detailsConn: SettingsConnection | null;
  onClose: () => void;
  detailsLabel: string;
  setDetailsLabel: (val: string) => void;
  formatRelativeTime: (date: string | null) => string;
  maskAccessUrl: (conn: SettingsConnection) => string;
  openRotateSimpleFin: (conn: SettingsConnection) => void;
}

export function ConnectionDetailsDialog({
  detailsConn,
  onClose,
  detailsLabel,
  setDetailsLabel,
  formatRelativeTime,
  maskAccessUrl,
  openRotateSimpleFin,
}: ConnectionDetailsDialogProps) {
  return (
    <Dialog open={!!detailsConn} onOpenChange={(open) => !open && onClose()}>
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
                <label className="text-xs text-muted-foreground font-medium">Balance Preference</label>
                <div className="mt-1 text-foreground text-sm">
                  {detailsConn.balanceSource === 'available' ? 'Available Balance (Pending-adjusted)' : 'Current Balance (Ledger)'}
                </div>
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
                        onClose();
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
            onClick={onClose}
            className="px-4 py-2 text-sm text-foreground bg-muted hover:bg-accent rounded-lg transition-colors cursor-pointer"
          >
            Close
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export interface FullResyncDialogProps {
  fullResyncConn: SettingsConnection | null;
  onClose: () => void;
  handleFullResync: () => void;
}

export function FullResyncDialog({
  fullResyncConn,
  onClose,
  handleFullResync,
}: FullResyncDialogProps) {
  return (
    <AlertDialog open={!!fullResyncConn} onOpenChange={(open) => !open && onClose()}>
      <AlertDialogContent className="max-w-sm">
        <AlertDialogHeader>
          <AlertDialogTitle>Full Historical Re-sync</AlertDialogTitle>
          <AlertDialogDescription>
            This will clear the sync cursor for <strong>{fullResyncConn?.label}</strong> and re-pull up to <strong>2 years</strong> of transaction history from Plaid. Existing transactions will not be duplicated.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={onClose}>Cancel</AlertDialogCancel>
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
  );
}

export interface DeleteConnectionDialogProps {
  deleteConn: SettingsConnection | null;
  onClose: () => void;
  deleteKeepData: boolean;
  setDeleteKeepData: (val: boolean) => void;
  deleteLoading: boolean;
  handleDeleteConnection: () => void;
}

export function DeleteConnectionDialog({
  deleteConn,
  onClose,
  deleteKeepData,
  setDeleteKeepData,
  deleteLoading,
  handleDeleteConnection,
}: DeleteConnectionDialogProps) {
  return (
    <AlertDialog open={!!deleteConn} onOpenChange={(open) => !open && onClose()}>
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
          <AlertDialogCancel onClick={onClose}>Cancel</AlertDialogCancel>
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
  );
}

export interface ManageSyncAccountsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  manageSyncLoading: boolean;
  manageSyncSaving: boolean;
  manageSyncAccounts: { id: string; name: string; institution?: string; balance: string; currency: string }[];
  tempDisabledAccounts: string[];
  setTempDisabledAccounts: React.Dispatch<React.SetStateAction<string[]>>;
  handleSaveDisabledAccounts: () => void;
}

export function ManageSyncAccountsDialog({
  open,
  onOpenChange,
  manageSyncLoading,
  manageSyncSaving,
  manageSyncAccounts,
  tempDisabledAccounts,
  setTempDisabledAccounts,
  handleSaveDisabledAccounts,
}: ManageSyncAccountsDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
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
                            setTempDisabledAccounts((prev) => prev.filter((id) => id !== acc.id));
                          } else {
                            setTempDisabledAccounts((prev) => [...prev, acc.id]);
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
                            ⚠️ Sync disabled. This account will be unlinked locally and won&apos;t sync.
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
            onClick={() => onOpenChange(false)}
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
  );
}
