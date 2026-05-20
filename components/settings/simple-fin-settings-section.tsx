'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { formatRelativeTime } from '@/lib/utils/date';

interface Connection {
  id: string;
  label: string;
  lastSyncAt: string | null;
  lastSyncStatus: string;
  lastSyncError: string | null;
  createdAt: string;
  accessUrlEncrypted?: string;
  syncFrequency: string;
  nextSyncAt: string | null;
}

interface SimpleFinSettingsSectionProps {
  connections: Connection[] | null;
  connectionsLoading: boolean;
  syncingId: string | null;
  handleSync: (id: string) => void;
  handleSyncFrequencyChange: (id: string, frequency: string) => void;
  editingId: string | null;
  setEditingId: (id: string | null) => void;
  editLabel: string;
  setEditLabel: (label: string) => void;
  handleSaveLabel: () => void;
  savingLabel: boolean;
}

export function SimpleFinSettingsSection({
  connections,
  connectionsLoading,
  syncingId,
  handleSync,
  handleSyncFrequencyChange,
  editingId,
  editLabel,
  setEditLabel,
  setEditingId,
  handleSaveLabel,
  savingLabel
}: SimpleFinSettingsSectionProps) {
  if (!connections || connectionsLoading) {
    return <div className="p-4">Loading...</div>;
  }

  return (
    <div className="p-5 bg-card border border-border rounded-xl mb-4">
      <h2 className="text-base font-semibold text-foreground mb-4">SimpleFIN Bridge Connection</h2>
      
      {connections.map((conn) => (
        <div key={conn.id} className="border border-border rounded-lg overflow-hidden mb-4">
          {/* Connection Info */}
          <div className="p-4 bg-muted/30">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className={`w-2 h-2 rounded-full flex-shrink-0 ${
                  conn.lastSyncStatus === 'ok' ? 'bg-status-positive' :
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
                    <Button 
                      onClick={handleSaveLabel} 
                      disabled={savingLabel} 
                      variant="ghost" 
                      size="sm"
                      className="text-xs text-primary hover:text-primary/80"
                    >
                      Save
                    </Button>
                    <Button 
                      onClick={() => setEditingId(null)} 
                      variant="ghost" 
                      size="sm"
                      className="text-xs text-muted-foreground hover:text-foreground"
                    >
                      Cancel
                    </Button>
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
              <div className="flex items-center gap-2">
                <span className={`px-2 py-0.5 text-xs rounded-full font-medium ${
                  conn.lastSyncStatus === 'ok'
                    ? 'bg-status-positive/20 text-status-positive'
                    : conn.lastSyncStatus === 'error'
                    ? 'bg-destructive/20 text-destructive'
                    : 'bg-muted text-muted-foreground'
                }`}>
                {conn.lastSyncStatus === 'ok' ? 'Synced' : conn.lastSyncStatus === 'error' ? 'Error' : 'Pending'}
              </span>
                <Button
                  onClick={() => handleSync(conn.id)}
                  disabled={syncingId === conn.id}
                  variant="outline"
                  size="sm"
                  className="px-2.5 py-1 text-xs font-medium"
                >
                  {syncingId === conn.id ? 'Syncing...' : 'Sync'}
                </Button>
              </div>
            </div>
            <div className="text-xs text-muted-foreground mt-1">
              Last sync: {conn.lastSyncAt ? formatRelativeTime(conn.lastSyncAt) : 'Never'}
            </div>
            {conn.lastSyncError && (
              <div className="text-xs text-destructive mt-1 truncate">{conn.lastSyncError}</div>
            )}
          </div>
          
          {/* Sync Summary */}
          <div className="p-4 border-t border-border">
            <h3 className="text-sm font-semibold text-foreground mb-2">Sync Settings</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm">Sync Frequency</span>
                  <select 
                    value={conn.syncFrequency}
                    onChange={(e) => handleSyncFrequencyChange(conn.id, e.target.value)}
                    className="text-xs border rounded p-1"
                  >
                    <option value="manual">Manual</option>
                    <option value="hourly">Hourly</option>
                    <option value="daily">Daily</option>
                    <option value="weekly">Weekly</option>
                  </select>
                </div>
                <div className="text-xs text-muted-foreground">
                  How often your data is automatically synced
                </div>
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm">Next Sync</span>
                  <span className="text-sm">
                    {conn.nextSyncAt ? new Date(conn.nextSyncAt).toLocaleDateString() : 'Not scheduled'}
                  </span>
                </div>
                <div className="text-xs text-muted-foreground">
                  When the next automatic sync will occur
                </div>
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}