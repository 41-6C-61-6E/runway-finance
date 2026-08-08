'use client';

import React, { createContext, useContext, useState, useCallback, useMemo, type ReactNode } from 'react';

export interface SubNavTab {
  id: string;
  label: string;
}

interface MobileSubNavContextType {
  tabs: SubNavTab[];
  activeTabId: string | null;
  registerSubNav: (tabs: SubNavTab[], activeTabId: string, onSelect: (id: string) => void) => void;
  unregisterSubNav: () => void;
  setActiveTabId: (id: string) => void;
  selectTab: (id: string) => void;
}

const MobileSubNavContext = createContext<MobileSubNavContextType | null>(null);

export function MobileSubNavProvider({ children }: { children: ReactNode }) {
  const [tabs, setTabs] = useState<SubNavTab[]>([]);
  const [activeTabId, setActiveTabId] = useState<string | null>(null);
  const [onSelectCallback, setOnSelectCallback] = useState<((id: string) => void) | null>(null);

  const registerSubNav = useCallback((
    newTabs: SubNavTab[],
    currentActiveId: string,
    onSelect: (id: string) => void
  ) => {
    setTabs(newTabs);
    setActiveTabId(currentActiveId);
    setOnSelectCallback(() => onSelect);
  }, []);

  const unregisterSubNav = useCallback(() => {
    setTabs([]);
    setActiveTabId(null);
    setOnSelectCallback(null);
  }, []);

  const selectTab = useCallback((id: string) => {
    setActiveTabId(id);
    if (onSelectCallback) {
      onSelectCallback(id);
    }
  }, [onSelectCallback]);

  const value = useMemo(() => ({
    tabs,
    activeTabId,
    registerSubNav,
    unregisterSubNav,
    setActiveTabId,
    selectTab,
  }), [tabs, activeTabId, registerSubNav, unregisterSubNav, selectTab]);

  return (
    <MobileSubNavContext.Provider value={value}>
      {children}
    </MobileSubNavContext.Provider>
  );
}

export function useMobileSubNav() {
  const context = useContext(MobileSubNavContext);
  if (!context) {
    return {
      tabs: [],
      activeTabId: null,
      registerSubNav: () => {},
      unregisterSubNav: () => {},
      setActiveTabId: () => {},
      selectTab: () => {},
    };
  }
  return context;
}
