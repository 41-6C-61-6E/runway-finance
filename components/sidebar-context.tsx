'use client';

import { useState, useRef, useCallback, useEffect, createContext, useContext, type ReactNode } from 'react';
import { useUserSettings } from '@/components/user-settings-provider';

const MIN_WIDTH = 180;
const MAX_WIDTH = 512;
const DEFAULT_WIDTH = 256;
const COLLAPSED_WIDTH = 64;

const ACCOUNTS_MIN_WIDTH = 192;
const ACCOUNTS_MAX_WIDTH = 512;
const ACCOUNTS_DEFAULT_WIDTH = 256;

export const SidebarContext = createContext<{
  collapsed: boolean;
  sidebarWidth: number;
  isHovering: boolean;
  accountsWidth: number;
  setAccountsWidth: (width: number) => void;
  accountsCollapsed: boolean;
  toggleAccountsCollapsed: () => void;
  hideAccountsSidebarByDefault: boolean;
  updateHideAccountsSidebarByDefault: (val: boolean) => Promise<void>;
  handleNavResizeDown: (e: React.MouseEvent) => void;
  handleMouseEnter: () => void;
  handleMouseLeave: () => void;
}>({
  collapsed: false,
  sidebarWidth: DEFAULT_WIDTH,
  isHovering: false,
  accountsWidth: ACCOUNTS_DEFAULT_WIDTH,
  setAccountsWidth: () => {},
  accountsCollapsed: false,
  toggleAccountsCollapsed: () => {},
  hideAccountsSidebarByDefault: false,
  updateHideAccountsSidebarByDefault: async () => {},
  handleNavResizeDown: () => {},
  handleMouseEnter: () => {},
  handleMouseLeave: () => {},
});

export function useSidebar() {
  return useContext(SidebarContext);
}

function getCookie(name: string): string | undefined {
  if (typeof document === 'undefined') return undefined;
  const match = document.cookie.match(new RegExp(`(^| )${name}=([^;]+)`));
  return match ? decodeURIComponent(match[2]) : undefined;
}

function setCookie(name: string, value: string, days = 365) {
  if (typeof document === 'undefined') return;
  const expires = new Date(Date.now() + days * 864e5).toUTCString();
  document.cookie = `${name}=${encodeURIComponent(value)}; expires=${expires}; path=/; SameSite=Lax`;
}

export function SidebarProvider({ children }: { children: ReactNode }) {
  const userSettings = useUserSettings();
  const hideAccountsSidebarByDefault = userSettings?.settings?.hideAccountsSidebarByDefault === true;

  const [width, setWidth] = useState(DEFAULT_WIDTH);
  const [accountsWidth, setAccountsWidth] = useState(ACCOUNTS_DEFAULT_WIDTH);
  const [accountsCollapsed, setAccountsCollapsed] = useState(() => {
    if (typeof window !== 'undefined' && window.innerWidth < 768) return true;
    const cookieVal = getCookie('hideAccountsSidebarByDefault');
    if (cookieVal !== undefined) {
      return cookieVal === 'true';
    }
    return true;
  });
  const [hasInitializedCollapse, setHasInitializedCollapse] = useState(false);

  useEffect(() => {
    if (userSettings && !userSettings.loading && !hasInitializedCollapse) {
      setHasInitializedCollapse(true);
      setAccountsCollapsed(userSettings.settings.hideAccountsSidebarByDefault === true);
    }
  }, [userSettings, hasInitializedCollapse]);

  const updateHideAccountsSidebarByDefault = useCallback(async (val: boolean) => {
    setAccountsCollapsed(val);
    setCookie('hideAccountsSidebarByDefault', val ? 'true' : 'false');
    if (userSettings) {
      await userSettings.updateSetting('hideAccountsSidebarByDefault', val);
    }
  }, [userSettings]);
  const [isResizing, setIsResizing] = useState(false);
  const [isHovering, setIsHovering] = useState(false);
  const [forceExpanded, setForceExpanded] = useState(false);
  const startXRef = useRef(0);
  const startWidthRef = useRef(DEFAULT_WIDTH);
  const hoverEnterTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const hoverLeaveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const isExpanded = isHovering || forceExpanded;
  const sidebarWidth = isExpanded ? width : COLLAPSED_WIDTH;

  const handleMouseEnter = useCallback(() => {
    if (hoverLeaveTimeoutRef.current) clearTimeout(hoverLeaveTimeoutRef.current);
    if (hoverEnterTimeoutRef.current) clearTimeout(hoverEnterTimeoutRef.current);
    
    hoverEnterTimeoutRef.current = setTimeout(() => {
      setIsHovering(true);
    }, 1000);
  }, []);

  const handleMouseLeave = useCallback(() => {
    if (hoverEnterTimeoutRef.current) clearTimeout(hoverEnterTimeoutRef.current);
    if (hoverLeaveTimeoutRef.current) clearTimeout(hoverLeaveTimeoutRef.current);
    
    if (isResizing) return;
    
    hoverLeaveTimeoutRef.current = setTimeout(() => {
      setIsHovering(false);
    }, 150);
  }, [isResizing]);

  // Clean up timeouts on unmount
  useEffect(() => {
    return () => {
      if (hoverEnterTimeoutRef.current) clearTimeout(hoverEnterTimeoutRef.current);
      if (hoverLeaveTimeoutRef.current) clearTimeout(hoverLeaveTimeoutRef.current);
    };
  }, []);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      setIsResizing(true);
      setForceExpanded(true);
      startXRef.current = e.clientX;
      startWidthRef.current = width;
    },
    [width]
  );

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!isResizing) return;
    const newWidth = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, startWidthRef.current + (e.clientX - startXRef.current)));
    setWidth(newWidth);
  }, [isResizing]);

  const handleMouseUp = useCallback(() => {
    setIsResizing(false);
    setForceExpanded(false);
  }, []);

  useEffect(() => {
    if (isResizing) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
    } else {
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    }
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizing, handleMouseMove, handleMouseUp]);

  const toggleAccountsCollapsed = useCallback(() => {
    setAccountsCollapsed((prev) => {
      const next = !prev;
      setCookie('hideAccountsSidebarByDefault', next ? 'true' : 'false');
      if (userSettings) {
        userSettings.updateSetting('hideAccountsSidebarByDefault', next);
      }
      return next;
    });
  }, [userSettings]);

  return (
    <SidebarContext.Provider
      value={{
        collapsed: !isExpanded,
        sidebarWidth,
        isHovering,
        accountsWidth,
        setAccountsWidth,
        accountsCollapsed,
        toggleAccountsCollapsed,
        hideAccountsSidebarByDefault,
        updateHideAccountsSidebarByDefault,
        handleNavResizeDown: handleMouseDown,
        handleMouseEnter,
        handleMouseLeave,
      }}
    >
      {children}
    </SidebarContext.Provider>
  );
}

export { MIN_WIDTH, MAX_WIDTH, DEFAULT_WIDTH, COLLAPSED_WIDTH, ACCOUNTS_MIN_WIDTH, ACCOUNTS_MAX_WIDTH, ACCOUNTS_DEFAULT_WIDTH };
