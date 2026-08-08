'use client';

import React, { createContext, useContext, useState, useCallback, useMemo, type ReactNode } from 'react';

export interface SubNavTab {
  id: string;
  label: string;
}

interface MobileSubNavContextType {
  tabs: SubNavTab[];
  activeTabId: string | null;
  activeTabIndex: number;
  registerSubNav: (tabs: SubNavTab[], activeTabId: string, onSelect: (id: string) => void) => void;
  unregisterSubNav: () => void;
  setActiveTabId: (id: string) => void;
  selectTab: (id: string) => void;
  nextTab: () => void;
  prevTab: () => void;
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

  const activeTabIndex = useMemo(() => {
    if (!activeTabId || tabs.length === 0) return -1;
    return tabs.findIndex(t => t.id === activeTabId);
  }, [tabs, activeTabId]);

  const nextTab = useCallback(() => {
    if (tabs.length === 0) return;
    const current = tabs.findIndex(t => t.id === activeTabId);
    if (current >= 0 && current < tabs.length - 1) {
      selectTab(tabs[current + 1].id);
    }
  }, [tabs, activeTabId, selectTab]);

  const prevTab = useCallback(() => {
    if (tabs.length === 0) return;
    const current = tabs.findIndex(t => t.id === activeTabId);
    if (current > 0) {
      selectTab(tabs[current - 1].id);
    }
  }, [tabs, activeTabId, selectTab]);

  const value = useMemo(() => ({
    tabs,
    activeTabId,
    activeTabIndex,
    registerSubNav,
    unregisterSubNav,
    setActiveTabId,
    selectTab,
    nextTab,
    prevTab,
  }), [tabs, activeTabId, activeTabIndex, registerSubNav, unregisterSubNav, selectTab, nextTab, prevTab]);

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
      activeTabIndex: -1,
      registerSubNav: () => {},
      unregisterSubNav: () => {},
      setActiveTabId: () => {},
      selectTab: () => {},
      nextTab: () => {},
      prevTab: () => {},
    };
  }
  return context;
}
