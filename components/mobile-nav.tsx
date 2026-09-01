'use client';

import React, { useState, useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { 
  Landmark, 
  Receipt, 
  DollarSign, 
  Menu, 
  X,
  ChartSpline,
  Wallet,
  Home,
  Target,
  Calculator,
  Database,
  Sparkles,
  LayoutDashboard,
  CandlestickChart,
  Minus,
  ArrowLeftRight,
  Flame,
  Settings,
  Bug,
  ChevronLeft,
  ChevronRight,
  WifiOff,
} from 'lucide-react';
import { useHiddenPages, type HiddenPageKey, DEV_MODE_PAGE_KEYS } from '@/lib/hooks/use-hidden-pages';
import { haptic } from '@/lib/haptics';
import { useMobileSubNav } from '@/components/mobile-subnav-context';
import type { SubNavLevel } from '@/components/mobile-subnav-context';
import { useQuery } from '@tanstack/react-query';
import { glassBar, glassSurface, glassItemBase, glassItemActive, glassItemInactive } from '@/components/ui/seg-pill';
import { useScrollFades, ScrollFadeOverlays } from '@/components/ui/scroll-fade';

interface NavItem {
  id: string;
  href: string;
  label: string;
  icon: React.ComponentType<any>;
  pageKey?: string;
  category: 'finances' | 'planning';
}

const ALL_NAV_ITEMS: NavItem[] = [
  { id: 'net-worth', href: '/', label: 'Net Worth', icon: ChartSpline, pageKey: 'netWorth', category: 'finances' },
  { id: 'accounts', href: '/accounts', label: 'Accounts', icon: Landmark, pageKey: 'accounts', category: 'finances' },
  { id: 'transactions', href: '/transactions', label: 'Transactions', icon: Receipt, pageKey: 'transactions', category: 'finances' },
  { id: 'flows', href: '/flows', label: 'Flows', icon: ArrowLeftRight, pageKey: 'flows', category: 'finances' },
  { id: 'spending', href: '/spending', label: 'Spending', icon: DollarSign, pageKey: 'spending', category: 'finances' },
  { id: 'budgets', href: '/budgets', label: 'Budgets', icon: Wallet, pageKey: 'budgets', category: 'finances' },
  { id: 'real-estate', href: '/real-estate', label: 'Real Estate', icon: Home, pageKey: 'realEstate', category: 'finances' },
  { id: 'investments', href: '/investments', label: 'Investments', icon: CandlestickChart, pageKey: 'investments', category: 'finances' },
  { id: 'goals', href: '/goals', label: 'Goals', icon: Target, pageKey: 'goals', category: 'finances' },
  { id: 'financial-logic', href: '/financial-logic', label: 'Financial Logic Explorer', icon: Calculator, pageKey: 'financialLogic', category: 'finances' },
  { id: 'data-explorer', href: '/data', label: 'Data Explorer', icon: Database, pageKey: 'dataExplorer', category: 'finances' },
  { id: 'plans', href: '/plans', label: 'FIRE', icon: Flame, pageKey: 'plans', category: 'planning' },
  {
    id: 'offline',
    href: '/offline',
    label: 'Offline mode (preview)',
    icon: WifiOff,
    category: 'planning',
  },
];

export function MobileNav() {
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const { data: devModeData } = useQuery<{ devMode: boolean }>({
    queryKey: ['dev-mode'],
    queryFn: async () => {
      const res = await fetch('/api/dev-mode', { credentials: 'include' });
      if (!res.ok) return { devMode: false };
      return res.json();
    },
    staleTime: 10 * 60 * 1000,
  });
  const devMode = devModeData?.devMode ?? null;
  const [pendingHref, setPendingHref] = useState<string | null>(null);
  const { isHidden } = useHiddenPages();

  const { tabs, activeTabId, navLevels, selectTabAtLevel, activeTabIndex, nextTab, prevTab } = useMobileSubNav();
  const hasSubNav = tabs.length > 0;

  // Scroll detection state for floating subnav smart auto-dimming
  const [isScrollingDown, setIsScrollingDown] = useState(false);
  const lastScrollYRef = useRef(0);
  const subNavTouchStartXRef = useRef<number | null>(null);
  const subNavTouchStartYRef = useRef<number | null>(null);

  useEffect(() => {
    const handleScroll = () => {
      const currentScrollY = window.scrollY;
      if (currentScrollY > lastScrollYRef.current + 15 && currentScrollY > 60) {
        setIsScrollingDown(true);
      } else if (currentScrollY < lastScrollYRef.current - 15 || currentScrollY < 30) {
        setIsScrollingDown(false);
      }
      lastScrollYRef.current = currentScrollY;
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const handleSubNavTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 1) {
      subNavTouchStartXRef.current = e.touches[0].clientX;
      subNavTouchStartYRef.current = e.touches[0].clientY;
    }
  };

  const handleSubNavTouchEnd = (e: React.TouchEvent) => {
    if (subNavTouchStartXRef.current === null || subNavTouchStartYRef.current === null) return;
    const touchEndX = e.changedTouches[0].clientX;
    const touchEndY = e.changedTouches[0].clientY;
    const deltaX = touchEndX - subNavTouchStartXRef.current;
    const deltaY = touchEndY - subNavTouchStartYRef.current;
    subNavTouchStartXRef.current = null;
    subNavTouchStartYRef.current = null;

    if (Math.abs(deltaX) > Math.abs(deltaY) && Math.abs(deltaX) > 35) {
      if (deltaX < -35) {
        haptic.light();
        nextTab();
      } else if (deltaX > 35) {
        haptic.light();
        prevTab();
      }
    }
  };


  // Custom home items (minimized bottom nav items)
  const [homeItemIds, setHomeItemIds] = useState<string[]>(['net-worth', 'accounts', 'transactions', 'cash-flow']);
  const [isEditing, setIsEditing] = useState(false);
  
  // Default pages the user explicitly removed in Edit Layout mode — the
  // auto-fill must not add them back to the home bar.
  const [excludedHomeIds, setExcludedHomeIds] = useState<string[]>([]);

  // How many page buttons the bottom bar can fit at the current viewport width:
  // the bar spans `viewport - 32px` (16px margin per side) capped at max-w-lg
  // (512px), minus 12px horizontal padding per side and a 1px border.
  //
  // Every button (page buttons and the hamburger) has a min-w-11 (44px)
  // minimum. The rendered row is N page buttons + the hamburger, i.e.
  // N + 1 buttons, which fits while (N+1) × 44 + N × gap ≤ contentWidth.
  // We take the largest such N (floor of 3) so the row can never overflow
  // and the hamburger always keeps its slot. The buttons are flex-1 (see
  // the nav below), so they share the leftover space equally and the
  // spacing redistributes automatically whenever items are added or
  // removed — nothing ever gets clipped.
  const HOME_BAR_ITEM_GAP_PX = 8;
  const HOME_BUTTON_MIN_WIDTH_PX = 44;
  const MD_BREAKPOINT_PX = 768;
  const [homeNavSlotCount, setHomeNavSlotCount] = useState(3);
  useEffect(() => {
    // md (768px) matches the desktop sidebar breakpoint (hidden md:flex):
    // at md and wider the left sidebar owns navigation and the bottom bar
    // is hidden, so no slots are computed there.
    const computeHomeNavSlots = () => {
      if (window.innerWidth >= MD_BREAKPOINT_PX) {
        setHomeNavSlotCount(0);
        return;
      }
      const barWidth = Math.max(240, Math.min(window.innerWidth - 32, 512));
      const contentWidth = barWidth - 24 - 2;
      // The rendered row is N page buttons PLUS the hamburger, so the total
      // is N + 1 buttons — solve (N+1) × 44 + N × gap ≤ contentWidth for N.
      const totalButtons = Math.floor(
        (contentWidth + HOME_BAR_ITEM_GAP_PX) /
          (HOME_BUTTON_MIN_WIDTH_PX + HOME_BAR_ITEM_GAP_PX)
      );
      // Floor of 3 page buttons keeps the bar from regressing below the old
      // fixed layout on narrow phones (3 + hamburger fits the 240px min bar).
      setHomeNavSlotCount(Math.max(3, totalButtons - 1));
    };
    computeHomeNavSlots();
    window.addEventListener('resize', computeHomeNavSlots);
    return () => window.removeEventListener('resize', computeHomeNavSlots);
  }, []);

  // Custom Drag and Drop states
  const [draggedItem, setDraggedItem] = useState<NavItem | null>(null);
  const [dragCurrentPos, setDragCurrentPos] = useState({ x: 0, y: 0 });
  const [hoveredSlotIndex, setHoveredSlotIndex] = useState<number | null>(null);

  const longPressTimerRef = useRef<NodeJS.Timeout | null>(null);
  const pointerStartPosRef = useRef({ x: 0, y: 0 });
  const dragOffsetRef = useRef({ x: 0, y: 0 });

  // Drawer drag-to-dismiss states
  const [dragOffset, setDragOffset] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const startYRef = useRef(0);
  const currentYRef = useRef(0);

  useEffect(() => {
    if (!isOpen) {
      setDragOffset(0);
      setIsDragging(false);
      setIsEditing(false); // Reset edit mode when drawer closes
    }
  }, [isOpen]);

  const handlePointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    if (draggedItem) return; // Prevent drawer dragging when item is being dragged
    const target = e.target as HTMLElement;
    // Don't initiate drag if clicking interactive targets
    if (target.closest('a') || target.closest('button') || target.closest('[data-slot-index]')) {
      return;
    }
    setIsDragging(true);
    startYRef.current = e.clientY;
    currentYRef.current = e.clientY;
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isDragging) return;
    currentYRef.current = e.clientY;
    const deltaY = currentYRef.current - startYRef.current;
    if (deltaY > 0) {
      setDragOffset(deltaY);
    } else {
      setDragOffset(0);
    }
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (!isDragging) return;
    setIsDragging(false);
    e.currentTarget.releasePointerCapture(e.pointerId);
    if (dragOffset > 100) {
      setIsOpen(false);
    } else {
      setDragOffset(0);
    }
  };

  useEffect(() => {
    setPendingHref(null);
  }, [pathname]);

  useEffect(() => {
    setMounted(true);

    // Load custom bottom nav items
    const saved = localStorage.getItem('mobile-home-nav-items');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length >= 1 && parsed.length <= 12) {
          setHomeItemIds(parsed);
        }
      } catch (e) {
        console.error('Failed to parse mobile nav items', e);
      }
    }

    // Load pages excluded from the home bar auto-fill
    const excluded = localStorage.getItem('mobile-home-nav-excluded');
    if (excluded) {
      try {
        const parsed = JSON.parse(excluded);
        if (Array.isArray(parsed)) {
          setExcludedHomeIds(parsed.filter((id): id is string => typeof id === 'string'));
        }
      } catch (e) {
        console.error('Failed to parse mobile nav exclusions', e);
      }
    }
  }, []);


  const updateHomeItems = (newIds: string[]) => {
    setHomeItemIds(newIds);
    localStorage.setItem('mobile-home-nav-items', JSON.stringify(newIds));
  };

  const isActive = (href: string) => {
    if (href === '/') {
      return pathname === '/';
    }
    return pathname.startsWith(href);
  };

  const isItemVisible = (item: NavItem) => {
    if (!item.pageKey) return true;
    const isDevModePage = (DEV_MODE_PAGE_KEYS as readonly string[]).includes(item.pageKey);
    if (isDevModePage && devMode !== true) return false;
    if (item.pageKey === 'settings') return true;
    return !isHidden(item.pageKey as HiddenPageKey);
  };

  // Resolve customized home nav items (ensuring they are visible, fallback if not)
  let activeHomeNavItems = homeItemIds
    .map(id => ALL_NAV_ITEMS.find(item => item.id === id))
    .filter((item): item is NavItem => !!item && isItemVisible(item));

  // Limit the bar to the number of slots that fit at the current width
  // (extra saved items stay in localStorage and reappear at wider sizes).
  activeHomeNavItems = activeHomeNavItems.slice(0, homeNavSlotCount);
  if (homeNavSlotCount === 0) activeHomeNavItems = [];

  // Pages used to auto-fill the bar (dev-mode and preview pages are
  // never added to the home bar automatically).
  const defaultHomeFill: NavItem[] = ALL_NAV_ITEMS.filter(
    (item) =>
      item.id !== 'offline' &&
      !(item.pageKey && (DEV_MODE_PAGE_KEYS as readonly string[]).includes(item.pageKey))
  );

  // Show saved items first (user's order/choice), then fill any remaining
  // capacity with the default pages so the bar grows with the viewport.
  const shownHomeNavItems =
    activeHomeNavItems.length >= homeNavSlotCount
      ? activeHomeNavItems
      : [
          ...activeHomeNavItems,
          ...defaultHomeFill
            .filter((item) => !activeHomeNavItems.some((a) => a.id === item.id))
            .filter((item) => !excludedHomeIds.includes(item.id))
            .filter((item) => isItemVisible(item)),
        ].slice(0, homeNavSlotCount);

  // What "Edit Layout" manages: every saved home item, capped to what the
  // widest phone can show. Extra defaults used to auto-fill the bar at some
  // widths are intentionally not listed here — they are implicit and can be
  // removed live from the bar itself.
  const HOME_BAR_MAX_ITEMS = 10;
  const homeNavEditItems = homeItemIds
    .map((id) => ALL_NAV_ITEMS.find((item) => item.id === id))
    .filter((item): item is NavItem => !!item)
    .slice(0, HOME_BAR_MAX_ITEMS);
  // Pointer event handlers for custom drag and drop
  const handleItemPointerMove = (e: React.PointerEvent) => {
    if (!isEditing) {
      const dx = e.clientX - pointerStartPosRef.current.x;
      const dy = e.clientY - pointerStartPosRef.current.y;
      if (Math.sqrt(dx * dx + dy * dy) > 10) {
        if (longPressTimerRef.current) {
          clearTimeout(longPressTimerRef.current);
          longPressTimerRef.current = null;
        }
      }
    }
  };

  const handleItemPointerUp = () => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  };

  const handleItemPointerCancel = () => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  };

  const handleItemPointerDown = (item: NavItem) => (e: React.PointerEvent) => {
    if (e.button !== 0) return;

    if (isEditing) {
      e.preventDefault();

      const x = e.clientX;
      const y = e.clientY;
      pointerStartPosRef.current = { x, y };

      const rect = e.currentTarget.getBoundingClientRect();
      dragOffsetRef.current = {
        x: x - rect.left,
        y: y - rect.top,
      };

      setDraggedItem(item);
      setDragCurrentPos({ x, y });
    } else {
      const x = e.clientX;
      const y = e.clientY;
      pointerStartPosRef.current = { x, y };

      const rect = e.currentTarget.getBoundingClientRect();
      dragOffsetRef.current = {
        x: x - rect.left,
        y: y - rect.top,
      };

      longPressTimerRef.current = setTimeout(() => {
        if (navigator.vibrate) {
          try {
            haptic.heavy();
          } catch (_) {}
        }
        setIsEditing(true);
        setDraggedItem(item);
        setDragCurrentPos({ x, y });
      }, 500);
    }
  };

  // Global window pointer/touch move and up handlers when dragging an item
  useEffect(() => {
    if (!draggedItem) return;

    const handleMove = (clientX: number, clientY: number) => {
      setDragCurrentPos({ x: clientX, y: clientY });

      const element = document.elementFromPoint(clientX, clientY);
      const slotElement = element?.closest('[data-slot-index]');
      if (slotElement) {
        const index = parseInt(slotElement.getAttribute('data-slot-index') || '', 10);
        setHoveredSlotIndex(index);
      } else {
        setHoveredSlotIndex(null);
      }
    };

    const handleGlobalPointerMove = (e: PointerEvent) => {
      if (e.pointerType === 'touch') return;
      handleMove(e.clientX, e.clientY);
    };

    const handleGlobalTouchMove = (e: TouchEvent) => {
      const touch = e.touches[0] || e.changedTouches[0];
      if (touch) {
        handleMove(touch.clientX, touch.clientY);
      }
    };

    const handleDrop = () => {
      if (longPressTimerRef.current) {
        clearTimeout(longPressTimerRef.current);
        longPressTimerRef.current = null;
      }

      if (hoveredSlotIndex !== null) {
        const currentHomeIds = homeNavEditItems.map(item => item.id);
        const oldIndex = currentHomeIds.indexOf(draggedItem.id);
        
        let newIds = [...currentHomeIds];
        
        if (oldIndex !== -1) {
          if (hoveredSlotIndex < newIds.length) {
            const temp = newIds[hoveredSlotIndex];
            newIds[hoveredSlotIndex] = draggedItem.id;
            newIds[oldIndex] = temp;
          } else {
            newIds = newIds.filter(id => id !== draggedItem.id);
            newIds.push(draggedItem.id);
          }
        } else {
          if (hoveredSlotIndex < newIds.length) {
            newIds[hoveredSlotIndex] = draggedItem.id;
          } else {
            newIds.push(draggedItem.id);
          }
        }
        
        const uniqueIds = Array.from(new Set(newIds)).slice(0, homeNavSlotCount);
        updateHomeItems(uniqueIds);
        setExcludedHomeIds((prev) => prev.filter((id) => id !== draggedItem.id));
        haptic.success();
      }

      setDraggedItem(null);
      setHoveredSlotIndex(null);
    };

    window.addEventListener('pointermove', handleGlobalPointerMove);
    window.addEventListener('pointerup', handleDrop);
    window.addEventListener('pointercancel', handleDrop);

    window.addEventListener('touchmove', handleGlobalTouchMove, { passive: true });
    window.addEventListener('touchend', handleDrop);
    window.addEventListener('touchcancel', handleDrop);

    return () => {
      window.removeEventListener('pointermove', handleGlobalPointerMove);
      window.removeEventListener('pointerup', handleDrop);
      window.removeEventListener('pointercancel', handleDrop);

      window.removeEventListener('touchmove', handleGlobalTouchMove);
      window.removeEventListener('touchend', handleDrop);
      window.removeEventListener('touchcancel', handleDrop);
    };
  }, [draggedItem, hoveredSlotIndex, homeItemIds, homeNavSlotCount]);

  const handleItemClick = (e: React.MouseEvent) => {
    if (isEditing) {
      e.preventDefault();
      e.stopPropagation();
    }
  };

  const handleRemoveSlot = (indexToRemove: number) => {
    const item = homeNavEditItems[indexToRemove];
    if (!item || homeNavEditItems.length <= 1) return; // Keep at least 1 item
    const newIds = homeNavEditItems
      .filter((_, idx) => idx !== indexToRemove)
      .map(navItem => navItem.id);
    updateHomeItems(newIds);
    setExcludedHomeIds((prev) => (prev.includes(item.id) ? prev : [...prev, item.id]));
  };

  const getWiggleClass = (index: number) => {
    if (!isEditing) return '';
    return index % 2 === 0 ? 'animate-wiggle-even' : 'animate-wiggle-odd';
  };

  const backdropClasses = `fixed inset-0 z-30 bg-transparent transition-opacity duration-300 ${
    isOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
  }`;

  const drawerClasses = `fixed bottom-0 left-0 right-0 z-50 bg-sidebar/45 backdrop-blur-xl border-t border-sidebar-border/30 rounded-t-[2rem] px-6 py-4 transition-transform duration-300 ease-out shadow-[0_-8px_32px_rgba(0,0,0,0.15)] ${
    isOpen ? 'translate-y-0 pointer-events-auto' : 'translate-y-full pointer-events-none'
  }`;

  if (!mounted) return null;

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes wiggle {
          0% { transform: rotate(-1deg); }
          50% { transform: rotate(1deg); }
          100% { transform: rotate(-1deg); }
        }
        .animate-wiggle-even {
          animation: wiggle 0.28s ease-in-out infinite;
        }
        .animate-wiggle-odd {
          animation: wiggle 0.28s ease-in-out infinite;
          animation-delay: -0.14s;
        }
      ` }} />

      {/* Decoupled Floating Sub-Navigation Capsule (View & Swipe Control) */}
      {hasSubNav && !isOpen && (
        <div
          className={`fixed left-0 right-0 z-40 flex justify-center pointer-events-none md:hidden transition-all duration-300 ${
            isScrollingDown ? 'opacity-55 hover:opacity-100 scale-95' : 'opacity-100 scale-100'
          }`}
          style={{
            bottom: 'calc(env(safe-area-inset-bottom) * 0.3 + 68px)',
          }}
        >
          <div
            onTouchStart={handleSubNavTouchStart}
            onTouchEnd={handleSubNavTouchEnd}
            className="pointer-events-auto flex items-center justify-center gap-1 max-w-[92vw] w-[calc(100vw-1rem)] select-none"
          >
            {/* Nested sub-navigation: parent menu > child menu. */}
            <div className="flex items-center justify-center gap-1 min-w-0 w-full">
              {navLevels.map((level, levelIndex) => (
                <React.Fragment key={level.id}>
                  {levelIndex > 0 && (
                    <ChevronRight className="w-3 h-3 shrink-0 text-sidebar-foreground/55" aria-hidden="true" />
                  )}
                  <SubNavCapsule level={level} onSelect={(tabId) => selectTabAtLevel(level.id, tabId)} />
                </React.Fragment>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Main Single-Row Floating Bottom Navigation Bar */}
      <nav
          className={`fixed bottom-2 left-4 right-4 z-40 flex items-center gap-2 md:hidden transition-all duration-300 max-w-lg mx-auto rounded-full py-1 px-3 overflow-hidden ${glassBar}`}
        style={{
          bottom: 'calc(env(safe-area-inset-bottom) * 0.3 + 8px)',
        }}
        >
        {shownHomeNavItems.map((item) => {
          const Icon = item.icon;
          const active = pendingHref ? pendingHref === item.href : (isActive(item.href) && !isOpen);

          return (
            <Link
              key={item.href}
              href={item.href}
              aria-label={item.label}
              onClick={() => setPendingHref(item.href)}
                className={`flex flex-1 flex-col items-center justify-center p-2.5 min-w-11 min-h-11 group transition-all duration-300 ${glassItemBase} ${
                  active ? glassItemActive : glassItemInactive
                }`}
            >
              <Icon className="h-5 w-5 flex-shrink-0" />
            </Link>
          );
        })}

        {/* Hamburger Menu Toggle Button */}
        <button
          type="button"
          aria-label={isOpen ? "Close navigation menu" : "Open navigation menu"}
          onClick={() => setIsOpen(!isOpen)}
            className={`flex flex-1 flex-col items-center justify-center p-2.5 min-w-11 min-h-11 group transition-all duration-300 ${glassItemBase} ${
              isOpen ? glassItemActive : glassItemInactive
            }`}
        >
          {isOpen ? <X className="h-5 w-5 flex-shrink-0" /> : <Menu className="h-5 w-5 flex-shrink-0" />}
        </button>
      </nav>

      {/* Slide-up Menu Drawer Backdrop */}
      <div className={backdropClasses} onClick={() => setIsOpen(false)} />

      {/* Slide-up Menu Drawer */}
      <div 
        className={`${drawerClasses} max-h-[85vh] overflow-y-auto overscroll-contain`} 
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        style={{ 
          paddingBottom: 'calc(env(safe-area-inset-bottom) + 16px)',
          transform: isOpen 
            ? `translateY(${dragOffset}px)` 
            : 'translateY(100%)',
          transition: isDragging ? 'none' : 'transform 300ms cubic-bezier(0.2, 0.8, 0.2, 1)',
          touchAction: isDragging ? 'none' : 'pan-y'
        }}
      >

        {/* Drag handle pill */}
        <div className="w-12 h-1 bg-muted-foreground/20 rounded-full mx-auto mb-4" />

        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <button
            onClick={() => setIsEditing(!isEditing)}
            className="text-xs font-semibold px-2.5 py-0.5 rounded-full transition-all bg-primary/15 hover:bg-primary/25 text-primary border border-primary/20 active:scale-95 flex items-center gap-1 shadow-sm"
          >
            {isEditing ? 'Done' : 'Edit Layout'}
          </button>
          <button 
            onClick={() => setIsOpen(false)}
            className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* HOME Section at the top (Only shown when Edit Layout is active) */}
        {isEditing && (
          <>
            <div className="flex items-center justify-between mb-3 px-1">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/50">
                Home (Bottom Nav)
              </div>
            </div>
            <div className="flex items-start justify-around gap-2 mb-4 border border-sidebar-border/20 bg-sidebar-foreground/3 rounded-3xl p-3">
              {homeNavEditItems.map((item, index) => {
                const isHoveredSlot = hoveredSlotIndex === index;
                const Icon = item.icon;
                const active = pendingHref ? pendingHref === item.href : (isActive(item.href) && !isOpen);
                const isCurrentlyDragged = draggedItem?.id === item.id;

                return (
                  <div
                    key={`home-slot-${index}`}
                    data-slot-index={index}
                    className={`relative flex flex-col items-center gap-1.5 p-2 min-w-11 rounded-xl transition-all duration-200 ${
                      isHoveredSlot
                        ? 'bg-primary/10 border border-primary/30 scale-105 shadow-[0_0_8px_rgba(var(--primary-rgb),0.15)]'
                        : 'border border-transparent'
                    } ${getWiggleClass(index)}`}
                    style={{
                      opacity: isCurrentlyDragged ? 0.3 : 1,
                    }}
                  >
                    <div
                      onPointerDown={handleItemPointerDown(item)}
                      onPointerMove={handleItemPointerMove}
                      onPointerUp={handleItemPointerUp}
                      onPointerCancel={handleItemPointerCancel}
                      onClick={handleItemClick}
                      className={`p-2.5 min-w-11 min-h-11 rounded-full flex items-center justify-center relative transition-all duration-200 cursor-grab active:cursor-grabbing select-none ${
                        active 
                          ? 'bg-primary/20 text-primary' 
                          : 'bg-sidebar-foreground/8 text-sidebar-foreground/65'
                      }`}
                      style={{
                        touchAction: 'none'
                      }}
                    >
                      <Icon className="h-5 w-5 flex-shrink-0" />
                    </div>
                    
                    {isEditing && (
                      <button
                        type="button"
                        onPointerDown={(e) => e.stopPropagation()}
                        onMouseDown={(e) => e.stopPropagation()}
                        onClick={(e) => {
                          e.stopPropagation();
                          e.preventDefault();
                          haptic.medium();
                          handleRemoveSlot(index);
                        }}
                        className="absolute -top-1 -right-1 bg-destructive text-destructive-foreground rounded-full p-1.5 shadow-md active:scale-90 z-20 cursor-pointer min-touch-target-inline"
                      >
                        <Minus className="h-3 w-3" />
                      </button>
                    )}

                    <span className={`text-[10px] tracking-wide text-center truncate w-full transition-colors select-none ${
                      active ? 'text-primary font-semibold' : 'text-sidebar-foreground/65'
                    }`}>{item.label}</span>
                  </div>
                );
              })}
            </div>

            {/* Separator */}
            <div className="my-3 border-t border-border/60" />
          </>
        )}

        {/* Main Section (Includes all visible nav items: Net Worth, Accounts, Transactions, Flows, Spending, Budgets, Real Estate, Investments, Goals, Logic, Data, FIRE) */}
        <div className="grid grid-cols-4 gap-y-3 gap-x-2">
          {ALL_NAV_ITEMS.filter(item => isItemVisible(item)).map((item) => {
            const Icon = item.icon;
            const active = pendingHref ? pendingHref === item.href : isActive(item.href);
            const globalIndex = ALL_NAV_ITEMS.findIndex(i => i.id === item.id);
            const isCurrentlyDragged = draggedItem?.id === item.id;

            return (
              <Link
                key={item.href}
                href={item.href}
                draggable="false"
                onClick={(e) => {
                  if (isEditing) {
                    e.preventDefault();
                    e.stopPropagation();
                    return;
                  }
                  setPendingHref(item.href);
                  setIsOpen(false);
                }}
                onPointerDown={handleItemPointerDown(item)}
                onPointerMove={handleItemPointerMove}
                onPointerUp={handleItemPointerUp}
                onPointerCancel={handleItemPointerCancel}
                className={`flex flex-col items-center gap-1.5 p-2 rounded-xl transition-all duration-150 active:scale-95 group select-none cursor-grab ${
                  isEditing ? 'cursor-grab active:cursor-grabbing' : ''
                } ${getWiggleClass(globalIndex)}`}
                style={{
                  opacity: isCurrentlyDragged ? 0.3 : 1,
                  touchAction: isEditing ? 'none' : 'pan-y'
                }}
              >
                <div className={`p-3 rounded-2xl transition-colors ${
                  active ? 'bg-primary/20 text-primary' : 'bg-sidebar-foreground/8 group-hover:bg-sidebar-foreground/15 text-sidebar-foreground/65 group-hover:text-sidebar-foreground'
                }`}>
                  <Icon className="h-5 w-5 flex-shrink-0" />
                </div>
                <span className={`text-[10px] tracking-wide text-center truncate w-full transition-colors ${
                  active ? 'text-primary font-semibold' : 'text-sidebar-foreground/65 group-hover:text-sidebar-foreground'
                }`}>{item.label}</span>
              </Link>
            );
          })}
        </div>
      </div>

      {/* Floating Dragged Item Preview */}
      {draggedItem && (
        <div
          className="fixed pointer-events-none z-[100] select-none scale-110 opacity-80 flex flex-col items-center gap-1.5 p-2 bg-sidebar border border-primary/30 rounded-2xl shadow-2xl"
          style={{
            left: dragCurrentPos.x - dragOffsetRef.current.x,
            top: dragCurrentPos.y - dragOffsetRef.current.y,
            width: 72,
            height: 72,
          }}
        >
          <div className="p-3 rounded-2xl bg-primary/20 text-primary">
            <draggedItem.icon className="h-5 w-5 flex-shrink-0" />
          </div>
        </div>
      )}
    </>
  );
}

/**
 * One scrollable level of the floating sub-nav.
 *
 * Each level is a single-row glass capsule whose items never shrink or
 * truncate — when the row exceeds the available width it scrolls, and the
 * shared edge fades (see `scroll-fade`) hint that it can be dragged.
 */
function SubNavCapsule({ level, onSelect }: { level: SubNavLevel; onSelect: (tabId: string) => void }) {
  const { fadeRef, fades, update } = useScrollFades<HTMLDivElement>();

  // Keep the active tab visible when it isn't the current scroll anchor.
  React.useLayoutEffect(() => {
    const scroller = fadeRef.current;
    if (!scroller) return;
    const active = scroller.querySelector<HTMLButtonElement>('[data-active="true"]');
    if (!active) return;
    const start = active.offsetLeft - scroller.scrollLeft;
    if (start < 0 || start > scroller.clientWidth - active.offsetWidth) {
      active.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' });
    }
  }, [level.activeTabId]);

  return (
    <div className="relative min-w-0 shrink max-w-full">
      <div
        ref={fadeRef}
        onScroll={update}
        className={`flex items-center gap-1 p-1 overflow-x-auto no-scrollbar scroll-contain-x touch-pan-x rounded-full max-w-full w-fit ${glassSurface}`}
      >
        {level.tabs.map((tab) => {
          const isActiveTab = tab.id === level.activeTabId;
          return (
            <button
              key={`${level.id}-${tab.id}`}
              type="button"
              data-active={isActiveTab || undefined}
              onClick={() => {
                if (!isActiveTab) {
                  haptic.light();
                  onSelect(tab.id);
                }
              }}
              className={`flex shrink-0 items-center justify-center gap-1.5 py-1 px-2 min-h-9 text-xs whitespace-nowrap ${glassItemBase} ${
                isActiveTab ? glassItemActive : glassItemInactive
              }`}
            >
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>
      <ScrollFadeOverlays {...fades} />
    </div>
  );
}
