'use client';

import { useState, useRef, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useTheme } from 'next-themes';
import { Sun, Moon, Star, Key, LogOut } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { usePrivacyMode } from '@/components/privacy-mode-provider';
import { handleSignOut } from '@/components/server-actions';
import ChangePasswordDrawer from '@/components/change-password-drawer';

export default function UserDropdown() {
  const { data: session } = useSession();
  const { theme, setTheme } = useTheme();
  const { privacyMode, togglePrivacyMode, loading: privacyModeLoading } = usePrivacyMode();
  const [open, setOpen] = useState(false);
  const [changePasswordOpen, setChangePasswordOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

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

  const initial = session?.user?.name?.charAt(0)?.toUpperCase() ?? '?';

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-7 h-7 rounded-full bg-primary/20 flex items-center justify-center text-xs font-semibold text-primary hover:bg-primary/30 transition-colors"
        aria-label="User menu"
      >
        {initial}
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 w-56 py-1 bg-card border border-border rounded-lg shadow-lg z-50">
          <div className="px-3 py-2">
            <div className="text-sm font-medium text-foreground truncate">{session?.user?.name}</div>
            <div className="text-xs text-muted-foreground truncate">{session?.user?.email}</div>
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
            <span className="text-sm text-foreground">Privacy Mode</span>
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

          <form action={handleSignOut}>
            <button
              type="submit"
              className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-foreground hover:bg-muted transition-colors"
            >
              <LogOut className="w-4 h-4 text-muted-foreground" />
              Sign Out
            </button>
          </form>
        </div>
      )}

      <ChangePasswordDrawer open={changePasswordOpen} onClose={() => setChangePasswordOpen(false)} />
    </div>
  );
}
