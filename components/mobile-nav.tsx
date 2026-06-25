'use client';

import React, { useState, useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { 
  Landmark, 
  Receipt, 
  TrendingUp, 
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
} from 'lucide-react';
import { useHiddenPages, type HiddenPageKey, DEV_MODE_PAGE_KEYS } from '@/lib/hooks/use-hidden-pages';

const mainNavItems = [
  { href: '/', label: 'Net Worth', icon: ChartSpline },
  { href: '/accounts', label: 'Accounts', icon: Landmark },
  { href: '/transactions', label: 'Transactions', icon: Receipt },
  { href: '/cash-flow', label: 'Cash Flow', icon: TrendingUp },
];

const drawerItems = [
  { href: '/spending', label: 'Spending', icon: DollarSign, pageKey: 'spending' },
  { href: '/budgets', label: 'Budgets', icon: Wallet, pageKey: 'budgets' },
  { href: '/real-estate', label: 'Real Estate', icon: Home, pageKey: 'realEstate' },
  { href: '/investments', label: 'Investments', icon: CandlestickChart, pageKey: 'investments' },
  { href: '/goals', label: 'Goals', icon: Target, pageKey: 'goals' },
  { href: '/financial-logic', label: 'Financial Logic', icon: Calculator, pageKey: 'financialLogic' },
  { href: '/data', label: 'Data Explorer', icon: Database, pageKey: 'dataExplorer' },
  { href: '/ai-suggestions', label: 'Suggestions', icon: Sparkles, pageKey: 'settings' },
];

const planningDrawerItems = [
  { href: '/plans', label: 'Plans', icon: LayoutDashboard, pageKey: 'plans' },
];

export function MobileNav() {
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [devMode, setDevMode] = useState<boolean | null>(null);
  const [pendingHref, setPendingHref] = useState<string | null>(null);
  const { isHidden } = useHiddenPages();

  // Drawer drag-to-dismiss states
  const [dragOffset, setDragOffset] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const startYRef = useRef(0);
  const currentYRef = useRef(0);

  useEffect(() => {
    if (!isOpen) {
      setDragOffset(0);
      setIsDragging(false);
    }
  }, [isOpen]);

  const handlePointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    const target = e.target as HTMLElement;
    // Don't initiate drag if clicking interactive targets
    if (target.closest('a') || target.closest('button')) {
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
    fetch('/api/dev-mode', { credentials: 'include' })
      .then(res => res.json())
      .then(data => setDevMode(data.devMode))
      .catch(() => setDevMode(false));
  }, []);

  const isActive = (href: string) => {
    if (href === '/') {
      return pathname === '/';
    }
    return pathname.startsWith(href);
  };

  if (!mounted) return null;

  const visibleDrawerItems = drawerItems.filter((item) => {
    const isDevModePage = (DEV_MODE_PAGE_KEYS as readonly string[]).includes(item.pageKey);
    if (isDevModePage && devMode !== true) return false;
    return item.pageKey === 'settings' || !isHidden(item.pageKey as HiddenPageKey);
  });

  const backdropClasses = `fixed inset-0 z-30 bg-transparent transition-opacity duration-300 ${
    isOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
  }`;

  const drawerClasses = `fixed bottom-0 left-0 right-0 z-50 bg-sidebar/45 backdrop-blur-xl border-t border-sidebar-border/30 rounded-t-[2rem] p-6 transition-transform duration-300 ease-out shadow-[0_-8px_32px_rgba(0,0,0,0.15)] ${
    isOpen ? 'translate-y-0 pointer-events-auto' : 'translate-y-full pointer-events-none'
  }`;

  return (
    <>
      <nav
        className="fixed bottom-2 left-4 right-4 z-40 bg-sidebar/35 backdrop-blur-2xl border border-sidebar-border/25 flex items-center justify-around py-2 px-4 md:hidden shadow-[0_8px_32px_rgba(0,0,0,0.15)] rounded-full transition-all duration-300 max-w-lg mx-auto"
        style={{
          bottom: 'calc(env(safe-area-inset-bottom) * 0.3 + 8px)',
        }}
      >
        {mainNavItems.map((item) => {
          const Icon = item.icon;
          const active = pendingHref ? pendingHref === item.href : (isActive(item.href) && !isOpen);

          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setPendingHref(item.href)}
              onTouchStart={() => {}}
              className={`flex flex-col items-center justify-center p-3 rounded-full transition-all duration-200 active:scale-95 group border ${
                active
                  ? 'text-primary bg-primary/20 border-primary/25 shadow-[inset_0_1.5px_0_rgba(255,255,255,0.15),0_1.5px_3px_rgba(0,0,0,0.1)] font-semibold'
                  : 'text-sidebar-foreground/65 hover:text-sidebar-foreground hover:bg-sidebar-foreground/5 border-transparent'
              }`}
            >
              <Icon className="h-5 w-5 flex-shrink-0" />
            </Link>
          );
        })}

        {/* Hamburger Menu Toggle Button */}
        <button
          onClick={() => setIsOpen(!isOpen)}
          className={`flex flex-col items-center justify-center p-3 rounded-full transition-all duration-200 active:scale-95 group border ${
            isOpen
              ? 'text-primary bg-primary/20 border-primary/25 shadow-[inset_0_1.5px_0_rgba(255,255,255,0.15),0_1.5px_3px_rgba(0,0,0,0.1)] font-semibold'
              : 'text-sidebar-foreground/65 hover:text-sidebar-foreground hover:bg-sidebar-foreground/5 border-transparent'
          }`}
        >
          {isOpen ? <X className="h-5 w-5 flex-shrink-0" /> : <Menu className="h-5 w-5 flex-shrink-0" />}
        </button>
      </nav>

      {/* Slide-up Menu Drawer Backdrop */}
      <div className={backdropClasses} onClick={() => setIsOpen(false)} />

      {/* Slide-up Menu Drawer */}
      <div 
        className={drawerClasses} 
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        style={{ 
          paddingBottom: 'calc(env(safe-area-inset-bottom) + 24px)',
          transform: isOpen 
            ? `translateY(${dragOffset}px)` 
            : 'translateY(100%)',
          transition: isDragging ? 'none' : 'transform 300ms cubic-bezier(0.2, 0.8, 0.2, 1)',
          touchAction: 'none'
        }}
      >
        {/* Drag handle pill */}
        <div className="w-12 h-1 bg-muted-foreground/20 rounded-full mx-auto mb-6" />

        {/* Header */}
        <div className="flex items-center justify-end mb-6">
          <button 
            onClick={() => setIsOpen(false)}
            className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Finances Section */}
        <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/50 mb-3 px-1">
          Finances
        </div>
        <div className="grid grid-cols-4 gap-y-5 gap-x-2">
          {visibleDrawerItems.map((item) => {
            const Icon = item.icon;
            const active = pendingHref ? pendingHref === item.href : isActive(item.href);

            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => {
                  setPendingHref(item.href);
                  setIsOpen(false);
                }}
                onTouchStart={() => {}}
                className="flex flex-col items-center gap-1.5 p-2 rounded-xl transition-all duration-150 active:scale-95 group"
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

        {/* Separator */}
        <div className="my-6 border-t border-border/60" />

        {/* Planning Section */}
        <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/50 mb-3 px-1">
          Planning
        </div>
        <div className="grid grid-cols-4 gap-y-5 gap-x-2">
          {planningDrawerItems.map((item) => {
            const Icon = item.icon;
            const active = pendingHref ? pendingHref === item.href : isActive(item.href);

            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => {
                  setPendingHref(item.href);
                  setIsOpen(false);
                }}
                onTouchStart={() => {}}
                className="flex flex-col items-center gap-1.5 p-2 rounded-xl transition-all duration-150 active:scale-95 group"
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
    </>
  );
}
