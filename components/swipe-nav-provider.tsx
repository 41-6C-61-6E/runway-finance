'use client';

import React, { createContext, useRef, type ReactNode } from 'react';
import { usePathname, useRouter } from 'next/navigation';

interface SwipeNavProviderProps {
  children: ReactNode;
}

const TABS = ['/', '/accounts', '/transactions', '/flows'];

export const SwipeNavContext = createContext<null>(null);

export function SwipeNavProvider({ children }: SwipeNavProviderProps) {
  const pathname = usePathname();
  const router = useRouter();

  const startXRef = useRef<number | null>(null);
  const startYRef = useRef<number | null>(null);
  const startTimeRef = useRef<number>(0);

  const getTabIndex = (path: string): number => {
    if (path === '/') return 0;
    if (path.startsWith('/accounts')) return 1;
    if (path.startsWith('/transactions')) return 2;
    if (path.startsWith('/flows')) return 3;
    return -1;
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    // Only handle single-finger touch
    if (e.touches.length !== 1) return;

    const touch = e.touches[0];
    const target = e.target as HTMLElement;

    // Safety checks: exclude elements where horizontal swipes are functional
    if (
      target.closest('.touch-pan-y') ||
      target.closest('.scroll-contain-x') ||
      target.closest('input') ||
      target.closest('textarea') ||
      target.closest('select') ||
      target.closest('[role="dialog"]') ||
      target.closest('[role="tooltip"]') ||
      target.closest('.no-swipe') ||
      // Exclude recharts tooltip overlays or chart components
      target.closest('.recharts-wrapper') ||
      target.closest('.recharts-tooltip-wrapper')
    ) {
      startXRef.current = null;
      startYRef.current = null;
      return;
    }

    startXRef.current = touch.clientX;
    startYRef.current = touch.clientY;
    startTimeRef.current = Date.now();
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (startXRef.current === null || startYRef.current === null) return;

    const touch = e.changedTouches[0];
    const endX = touch.clientX;
    const endY = touch.clientY;
    const duration = Date.now() - startTimeRef.current;

    const dX = endX - startXRef.current;
    const dY = endY - startYRef.current;

    // Reset touch coordinates
    startXRef.current = null;
    startYRef.current = null;

    // Gesture threshold validation:
    // 1. Swipe duration is fast (under 350ms)
    // 2. Horizontal sweep distance is significant (> 90px)
    // 3. Vertical drift is low to ensure it's not a vertical scroll gesture (< 50px)
    if (duration > 350 || Math.abs(dY) > 50 || Math.abs(dX) < 90) {
      return;
    }

    const currentIndex = getTabIndex(pathname);
    if (currentIndex === -1) return;

    if (dX < -90) {
      // Swiped Left -> navigate to Next Tab (Right)
      if (currentIndex < TABS.length - 1) {
        router.push(TABS[currentIndex + 1]);
      }
    } else if (dX > 90) {
      // Swiped Right -> navigate to Previous Tab (Left)
      if (currentIndex > 0) {
        router.push(TABS[currentIndex - 1]);
      }
    }
  };

  return (
    <div
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      className="min-h-screen w-full flex flex-col"
    >
      {children}
    </div>
  );
}
