'use client';

import React, { useState, useEffect } from 'react';
import { usePathname } from 'next/navigation';
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
  const { isHidden } = useHiddenPages();

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

  const backdropClasses = `fixed inset-0 z-40 bg-background/60 backdrop-blur-sm transition-opacity duration-300 ${
    isOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
  }`;

  const drawerClasses = `fixed bottom-0 left-0 right-0 z-50 bg-card/95 backdrop-blur-xl border-t border-border rounded-t-[2rem] p-6 transition-transform duration-300 ease-out shadow-2xl ${
    isOpen ? 'translate-y-0 pointer-events-auto' : 'translate-y-full pointer-events-none'
  }`;

  return (
    <>
      {/* Bottom Nav Bar */}
      <nav
        className="fixed bottom-0 left-0 right-0 z-40 bg-card/90 backdrop-blur-md border-t border-border flex items-center justify-around pt-2 px-2 pb-2 md:hidden shadow-lg"
        style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 8px)' }}
      >
        {mainNavItems.map((item) => {
          const Icon = item.icon;
          const active = isActive(item.href) && !isOpen;

          return (
            <a
              key={item.href}
              href={item.href}
              className={`flex flex-col items-center gap-1 py-1 px-3 rounded-xl transition-all duration-150 active:scale-95 ${
                active
                  ? 'text-primary font-semibold'
                  : 'text-muted-foreground/80 hover:text-foreground'
              }`}
            >
              <div className={`p-1.5 rounded-lg transition-colors ${
                active ? 'bg-primary/10' : ''
              }`}>
                <Icon className="h-5 w-5 flex-shrink-0" />
              </div>
              <span className="text-[10px] tracking-wide">{item.label}</span>
            </a>
          );
        })}

        {/* Hamburger Menu Toggle Button */}
        <button
          onClick={() => setIsOpen(!isOpen)}
          className={`flex flex-col items-center gap-1 py-1 px-3 rounded-xl transition-all duration-150 active:scale-95 ${
            isOpen
              ? 'text-primary font-semibold'
              : 'text-muted-foreground/80 hover:text-foreground'
          }`}
        >
          <div className={`p-1.5 rounded-lg transition-colors ${
            isOpen ? 'bg-primary/10' : ''
          }`}>
            {isOpen ? <X className="h-5 w-5 flex-shrink-0" /> : <Menu className="h-5 w-5 flex-shrink-0" />}
          </div>
          <span className="text-[10px] tracking-wide">{isOpen ? 'Close' : 'Menu'}</span>
        </button>
      </nav>

      {/* Slide-up Menu Drawer Backdrop */}
      <div className={backdropClasses} onClick={() => setIsOpen(false)} />

      {/* Slide-up Menu Drawer */}
      <div className={drawerClasses} style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 24px)' }}>
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
            const active = isActive(item.href);

            return (
              <a
                key={item.href}
                href={item.href}
                onClick={() => setIsOpen(false)}
                className={`flex flex-col items-center gap-1.5 p-2 rounded-xl transition-all duration-150 active:scale-95 ${
                  active ? 'text-primary font-semibold' : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <div className={`p-3 rounded-2xl transition-colors ${
                  active ? 'bg-primary/15' : 'bg-muted/40 hover:bg-muted/70'
                }`}>
                  <Icon className="h-6 w-6 flex-shrink-0" />
                </div>
                <span className="text-[10px] tracking-wide text-center truncate w-full">{item.label}</span>
              </a>
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
            const active = isActive(item.href);

            return (
              <a
                key={item.href}
                href={item.href}
                onClick={() => setIsOpen(false)}
                className={`flex flex-col items-center gap-1.5 p-2 rounded-xl transition-all duration-150 active:scale-95 ${
                  active ? 'text-primary font-semibold' : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <div className={`p-3 rounded-2xl transition-colors ${
                  active ? 'bg-primary/15' : 'bg-muted/40 hover:bg-muted/70'
                }`}>
                  <Icon className="h-6 w-6 flex-shrink-0" />
                </div>
                <span className="text-[10px] tracking-wide text-center truncate w-full">{item.label}</span>
              </a>
            );
          })}
        </div>
      </div>
    </>
  );
}
