'use client';

import React, { createContext, type ReactNode } from 'react';

interface SwipeNavProviderProps {
  children: ReactNode;
}

export const SwipeNavContext = createContext<null>(null);

/**
 * SwipeNavProvider wrapper.
 * Global page-to-page router swipe navigation has been replaced by
 * component-level view swiping (`MobileViewSwitcher`) on pages with summary panels.
 */
export function SwipeNavProvider({ children }: SwipeNavProviderProps) {
  return (
    <div className="min-h-screen w-full flex flex-col">
      {children}
    </div>
  );
}
