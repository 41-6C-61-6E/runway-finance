'use client';

import React from 'react';
import { usePathname } from 'next/navigation';
import { ChartSpline, Landmark, Receipt, DollarSign, Wallet } from 'lucide-react';

const mobileNavItems = [
  { href: '/', label: 'Net Worth', icon: ChartSpline },
  { href: '/accounts', label: 'Accounts', icon: Landmark },
  { href: '/transactions', label: 'Transactions', icon: Receipt },
  { href: '/spending', label: 'Spending', icon: DollarSign },
  { href: '/budgets', label: 'Budgets', icon: Wallet },
];

export function MobileNav() {
  const pathname = usePathname();

  const isActive = (href: string) => {
    if (href === '/') {
      return pathname === '/';
    }
    return pathname.startsWith(href);
  };

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-50 bg-card/90 backdrop-blur-md border-t border-border flex items-center justify-around pt-2 px-2 pb-2 md:hidden shadow-lg"
      style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 8px)' }}
    >
      {mobileNavItems.map((item) => {
        const Icon = item.icon;
        const active = isActive(item.href);

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
    </nav>
  );
}
