'use client';

import React, { createContext, useContext, useState, useCallback, useMemo, type ReactNode } from 'react';

export interface SubNavTab {
  id: string;
  label: string;
}

export interface SubNavLevel {
  id: number;
  tabs: SubNavTab[];
  activeTabId: string;
}

interface MobileSubNavContextType {
  tabs: SubNavTab[];
  activeTabId: string | null;
  activeTabIndex: number;
  navLevels: SubNavLevel[];
  registerSubNav: (tabs: SubNavTab[], activeTabId: string, onSelect: (id: string) => void, ownerId: string, priority?: number) => () => void;
  setActiveTabId: (id: string) => void;
  selectTab: (id: string) => void;
  selectTabAtLevel: (levelId: number, id: string) => void;
  nextTab: () => void;
  prevTab: () => void;
}

const MobileSubNavContext = createContext<MobileSubNavContextType | null>(null);

export function MobileSubNavProvider({ children }: { children: ReactNode }) {
  const [registrations, setRegistrations] = useState<Array<{
    id: number;
    ownerId: string;
    priority: number;
    tabs: SubNavTab[];
    activeTabId: string;
    onSelect: (id: string) => void;
  }>>([]);
  const nextRegistrationId = React.useRef(0);

  const activeRegistration = registrations.reduce<typeof registrations[number] | undefined>(
    (active, registration) => !active || registration.priority >= active.priority ? registration : active,
    undefined
  );
  const tabs = activeRegistration?.tabs || [];
  const activeTabId = activeRegistration?.activeTabId || null;
  // Keep the route-level menu on the left and nested view menus on the right,
  // even when a child registration is refreshed after a parent rerender.
  const navLevels = [...registrations]
    .sort((a, b) => a.priority - b.priority || a.id - b.id)
    .map(({ id, tabs, activeTabId: levelActiveTabId }) => ({
      id,
      tabs,
      activeTabId: levelActiveTabId,
    }));

  const registerSubNav = useCallback((
    newTabs: SubNavTab[],
    currentActiveId: string,
    onSelect: (id: string) => void,
    ownerId: string,
    priority = 0
  ) => {
    const id = nextRegistrationId.current++;
    setRegistrations((current) => {
      const existingIndex = current.findIndex((registration) => registration.ownerId === ownerId);
      if (existingIndex === -1) {
        return [...current, { id, ownerId, priority, tabs: newTabs, activeTabId: currentActiveId, onSelect }];
      }

      return current.map((registration, index) => index === existingIndex
        ? { ...registration, priority, tabs: newTabs, activeTabId: currentActiveId, onSelect }
        : registration
      );
    });
    return () => setRegistrations((current) => current.filter((registration) => registration.ownerId !== ownerId));
  }, []);

  const selectTab = useCallback((id: string) => {
    const registration = activeRegistration;
    if (!registration) return;
    setRegistrations((current) => current.map((item) => item.id === registration.id ? { ...item, activeTabId: id } : item));
    registration.onSelect(id);
  }, [activeRegistration]);

  const setActiveTabId = useCallback((id: string) => {
    setRegistrations((current) => {
      const active = current.reduce<typeof current[number] | undefined>(
        (top, item) => !top || item.priority >= top.priority ? item : top,
        undefined
      );
      return current.map((item) => item.id === active?.id ? { ...item, activeTabId: id } : item);
    });
  }, []);

  const selectTabAtLevel = useCallback((levelId: number, id: string) => {
    const registration = registrations.find((item) => item.id === levelId);
    if (!registration) return;
    setRegistrations((current) => current.map((item) => item.id === levelId ? { ...item, activeTabId: id } : item));
    registration.onSelect(id);
  }, [registrations]);

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
    navLevels,
    registerSubNav,
    setActiveTabId,
    selectTab,
    selectTabAtLevel,
    nextTab,
    prevTab,
  }), [tabs, activeTabId, activeTabIndex, navLevels, registerSubNav, setActiveTabId, selectTab, selectTabAtLevel, nextTab, prevTab]);

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
      navLevels: [],
      registerSubNav: () => () => {},
      setActiveTabId: () => {},
      selectTab: () => {},
      selectTabAtLevel: () => {},
      nextTab: () => {},
      prevTab: () => {},
    };
  }
  return context;
}
