'use client';

import { useState, useRef, useCallback, useEffect, createContext, useContext, ReactNode } from 'react';

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
  handleNavResizeDown: () => {},
  handleMouseEnter: () => {},
  handleMouseLeave: () => {},
});

export function useSidebar() {
  return useContext(SidebarContext);
}

export function SidebarProvider({ children }: { children: ReactNode }) {
  const [width, setWidth] = useState(DEFAULT_WIDTH);
  const [accountsWidth, setAccountsWidth] = useState(ACCOUNTS_DEFAULT_WIDTH);
  const [accountsCollapsed, setAccountsCollapsed] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const [isHovering, setIsHovering] = useState(false);
  const [forceExpanded, setForceExpanded] = useState(false);
  const startXRef = useRef(0);
  const startWidthRef = useRef(DEFAULT_WIDTH);
  const hoverTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const isExpanded = isHovering || forceExpanded;
  const sidebarWidth = isExpanded ? width : COLLAPSED_WIDTH;

  const handleMouseEnter = useCallback(() => {
    if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
    setIsHovering(true);
  }, []);

  const handleMouseLeave = useCallback(() => {
    if (isResizing) return;
    if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
    hoverTimeoutRef.current = setTimeout(() => {
      setIsHovering(false);
    }, 150);
  }, [isResizing]);

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
    setAccountsCollapsed((prev) => !prev);
  }, []);

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
