'use client';

import { useState, useRef, useEffect } from 'react';
import { useSession, signOut } from 'next-auth/react';
import { useTheme } from 'next-themes';
import { Sun, Moon, Star, Key, LogOut, RefreshCw } from 'lucide-react';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { Switch } from '@/components/ui/switch';
import { SEMANTIC } from '@/lib/colors/palette';
import { usePrivacyMode } from '@/components/privacy-mode-provider';
import ChangePasswordDrawer from '@/components/change-password-drawer';
import { toast } from 'sonner';

interface UserDropdownProps {
  onOpenChange?: (open: boolean) => void;
}

export default function UserDropdown({ onOpenChange }: UserDropdownProps = {}) {
  const { data: session } = useSession();
  const { theme, setTheme } = useTheme();
  const { privacyMode, togglePrivacyMode, loading: privacyModeLoading, shortcutLabel } = usePrivacyMode();
  const [open, setOpen] = useState(false);
  const [changePasswordOpen, setChangePasswordOpen] = useState(false);
  const [connections, setConnections] = useState<any[]>([]);
  const [manualAccounts, setManualAccounts] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const formatBuildTime = (dateStr?: string) => {
    if (!dateStr) return 'Unknown';
    try {
      const date = new Date(dateStr);
      const mm = String(date.getMonth() + 1).padStart(2, '0');
      const dd = String(date.getDate()).padStart(2, '0');
      const yyyy = date.getFullYear();
      const hh = String(date.getHours()).padStart(2, '0');
      const min = String(date.getMinutes()).padStart(2, '0');
      return `${mm}/${dd}/${yyyy} ${hh}:${min}`;
    } catch {
      return dateStr;
    }
  };

  useEffect(() => {
    if (!open) return;
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function handleEscape(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [open]);

  const onOpenChangeRef = useRef(onOpenChange);
  useEffect(() => {
    onOpenChangeRef.current = onOpenChange;
  }, [onOpenChange]);

  useEffect(() => {
    onOpenChangeRef.current?.(open);
  }, [open]);

  const fetchSyncData = async () => {
    setLoading(true);
    try {
      const [connRes, accRes] = await Promise.all([
        fetch('/api/connections'),
        fetch('/api/manual-accounts'),
      ]);
      if (connRes.ok) {
        const connData = await connRes.json();
        setConnections(connData);
      }
      if (accRes.ok) {
        const accData = await accRes.json();
        setManualAccounts(accData);
      }
    } catch (err) {
      console.error('Failed to fetch sync data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) {
      fetchSyncData();
    }
  }, [open]);

  const syncableManualAccounts = manualAccounts.filter((acc: any) => {
    const type = acc.type;
    const meta = acc.metadata || {};

    const isRealEstate = [
      'realestate', 'primaryhome', 'secondaryhome', 'rentalproperty', 'commercial', 'land', 'otherrealestate',
      'single-family', 'condo', 'townhouse', 'multi-family'
    ].includes(type);
    if (isRealEstate && meta.address) return true;
    if (type === 'crypto' && meta.xpub) return true;
    if (type === 'metals' && meta.amountOz && parseFloat(meta.amountOz) > 0) return true;

    return false;
  });

  const getLatestSyncTime = () => {
    const connTimes = connections
      .map((c) => (c.lastSyncAt ? new Date(c.lastSyncAt).getTime() : 0))
      .filter((t) => t > 0);
    const accTimes = syncableManualAccounts
      .map((a) => (a.balanceDate ? new Date(a.balanceDate).getTime() : 0))
      .filter((t) => t > 0);
    const allTimes = [...connTimes, ...accTimes];
    if (allTimes.length === 0) return null;
    return new Date(Math.max(...allTimes));
  };

  const lastSyncTime = getLatestSyncTime();

  const formatRelativeTime = (dateInput: Date | null) => {
    if (!dateInput) return 'Never';
    const now = new Date();
    const diffMs = now.getTime() - dateInput.getTime();

    if (diffMs < 0) {
      return 'Just now';
    }

    const diffSecs = Math.floor(diffMs / 1000);
    const diffMins = Math.floor(diffSecs / 60);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffSecs < 60) {
      return 'Just now';
    } else if (diffMins < 60) {
      return `${diffMins}m ago`;
    } else if (diffHours < 24) {
      return `${diffHours}h ago`;
    } else if (diffDays === 1) {
      return 'Yesterday';
    } else {
      return dateInput.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    }
  };

  const handleSyncAll = async () => {
    if (isSyncing) return;
    setIsSyncing(true);
    const toastId = toast.loading('Syncing all connections...');
    try {
      const res = await fetch('/api/connections/sync', {
        method: 'POST',
      });
      const data = await res.json();
      if (res.ok && data.status !== 'error') {
        if (data.status === 'partial') {
          toast.warning('Sync completed with some errors.', { id: toastId });
        } else {
          toast.success('Successfully synced all connections!', { id: toastId });
        }
        await fetchSyncData();
      } else {
        toast.error(data.message || 'Failed to sync connections', { id: toastId });
      }
    } catch (err) {
      toast.error('An error occurred during sync', { id: toastId });
    } finally {
      setIsSyncing(false);
    }
  };

  const initial = session?.user?.name?.charAt(0)?.toUpperCase() ?? '?';

  return (
    <div className="relative" ref={ref}>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            onClick={() => setOpen(!open)}
            className="w-7 h-7 rounded-full bg-primary/20 flex items-center justify-center text-xs font-semibold text-primary hover:bg-primary/30 transition-colors"
            aria-label="User menu"
          >
            {initial}
          </button>
        </TooltipTrigger>
        <TooltipContent side="bottom">User menu</TooltipContent>
      </Tooltip>
      {open && (
        <div className="absolute right-[-12px] sm:right-0 top-full mt-1 w-56 py-1 bg-card border border-border rounded-lg shadow-lg z-50 animate-in fade-in zoom-in-95 duration-100 ease-out origin-top-right">
          <div className="px-3 py-2 flex flex-col gap-2">
            <div className="text-sm font-medium text-foreground truncate">{session?.user?.name}</div>
            
            <div className="flex items-center justify-between text-xs border-t border-border/40 pt-2 mt-0.5">
              <div className="flex flex-col gap-0.5">
                <span className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider">Last sync</span>
                <span className="text-foreground font-medium">
                  {loading ? (
                    <span className="text-muted-foreground/50 animate-pulse">Loading...</span>
                  ) : (
                    formatRelativeTime(lastSyncTime)
                  )}
                </span>
              </div>
              {connections.length > 0 || syncableManualAccounts.length > 0 ? (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      onClick={handleSyncAll}
                      disabled={isSyncing || loading}
                      className="w-7 h-7 rounded-full bg-primary/10 text-primary hover:bg-primary/20 flex items-center justify-center transition-colors disabled:opacity-50 disabled:pointer-events-none cursor-pointer"
                      aria-label="Sync All"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="left">Sync All</TooltipContent>
                </Tooltip>
              ) : (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      disabled
                      className="w-7 h-7 rounded-full bg-muted text-muted-foreground opacity-50 flex items-center justify-center cursor-not-allowed"
                      aria-label="No Connections"
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="left">No syncable connections</TooltipContent>
                </Tooltip>
              )}
            </div>
          </div>

          <div className="h-px bg-border mx-2" />

          <div className="px-3 py-2">
            <div className="text-xs font-medium text-muted-foreground mb-2">Theme</div>
            <div className="flex rounded-md border border-border overflow-hidden">
              <button
                type="button"
                onClick={() => setTheme('light')}
                className={`flex-1 flex items-center justify-center py-1.5 text-sm transition-colors ${
                  theme === 'light' ? 'bg-primary text-primary-foreground' : 'text-foreground hover:bg-muted'
                }`}
                aria-label="Light Theme"
              >
                <Sun className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => setTheme('moonlight')}
                className={`flex-1 flex items-center justify-center py-1.5 text-sm transition-colors border-x border-border ${
                  theme === 'moonlight' ? 'bg-primary text-primary-foreground' : 'text-foreground hover:bg-muted'
                }`}
                aria-label="Moonlight Theme"
              >
                <Moon className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => setTheme('dark')}
                className={`flex-1 flex items-center justify-center py-1.5 text-sm transition-colors ${
                  theme === 'dark' ? 'bg-primary text-primary-foreground' : 'text-foreground hover:bg-muted'
                }`}
                aria-label="Dark Theme"
              >
                <Star className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div className="h-px bg-border mx-2" />

          <div className="px-3 py-1.5 flex items-center justify-between">
            <div className="flex flex-col">
              <span className="text-sm text-foreground">Privacy Mode</span>
              <span className="text-[10px] text-muted-foreground/60">{shortcutLabel}</span>
            </div>
            <Switch
              checked={privacyMode ?? false}
              onCheckedChange={togglePrivacyMode}
              disabled={privacyModeLoading}
            />
          </div>



          <div className="h-px bg-border mx-2" />

          <button
            type="button"
            onClick={() => { setOpen(false); setChangePasswordOpen(true); }}
            className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-foreground hover:bg-muted transition-colors"
          >
            <Key className="w-4 h-4 text-muted-foreground" />
            Change Password
          </button>

          <div className="h-px bg-border mx-2" />

          <button
            type="button"
            onClick={() => signOut({ redirectTo: '/signin' })}
            className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-foreground hover:bg-muted transition-colors"
          >
            <LogOut className="w-4 h-4 text-muted-foreground" />
            Sign Out
          </button>

          <div className="h-px bg-border mx-2" />

          <div className="px-3 py-2 text-[10px] text-muted-foreground space-y-1 bg-muted/20">
            <div className="flex justify-between items-center gap-2 font-mono">
              <span className="opacity-55">Build:</span>
              <div className="flex items-center gap-1.5 truncate max-w-[70%]">
                {(() => {
                  const buildNumber = process.env.NEXT_PUBLIC_BUILD_NUMBER || 'dev';
                  const bs = SEMANTIC.buildStatus;
                  let status = bs.production;
                  if (buildNumber.endsWith('.dev')) {
                    status = bs.development;
                  } else if (buildNumber.endsWith('.local')) {
                    status = bs.local;
                  }
                  let buildLabel = 'Production Release';
                  if (buildNumber.endsWith('.dev')) buildLabel = 'Development';
                  else if (buildNumber.endsWith('.local')) buildLabel = 'Local Production';
                  const dotClass = `${status.dot} shadow-[0_0_4px_${status.glow}]`;
                  return (
                    <>
                      <span className={`w-1.5 h-1.5 rounded-full ${dotClass}`} title={buildLabel} />
                      <span className="text-right truncate" title={`${buildNumber} (${buildLabel})`}>
                        {buildNumber}
                      </span>
                    </>
                  );
                })()}
              </div>
            </div>
            <div className="flex justify-between gap-2 font-mono">
              <span className="opacity-55">Built:</span>
              <span className="text-right truncate max-w-[70%]" title={process.env.NEXT_PUBLIC_BUILD_TIME}>
                {formatBuildTime(process.env.NEXT_PUBLIC_BUILD_TIME)}
              </span>
            </div>
          </div>
        </div>
      )}

      <ChangePasswordDrawer open={changePasswordOpen} onClose={() => setChangePasswordOpen(false)} />
    </div>
  );
}
