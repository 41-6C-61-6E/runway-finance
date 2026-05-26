'use client'

import { usePathname } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { useState, useRef, useCallback, useEffect } from 'react'
import { ChartSpline, Receipt, TrendingUp, Flame, Home, Wallet, Database, Target, DollarSign, Sparkles, Calculator, Landmark } from 'lucide-react'
import { useSidebar, MIN_WIDTH, MAX_WIDTH, DEFAULT_WIDTH, COLLAPSED_WIDTH } from '@/components/sidebar-context'
import { useHiddenPages, type HiddenPageKey, DEV_MODE_PAGE_KEYS } from '@/lib/hooks/use-hidden-pages'
import { useReduceTransparency } from '@/lib/hooks/use-reduce-transparency'

export { useSidebar, MIN_WIDTH, MAX_WIDTH, DEFAULT_WIDTH, COLLAPSED_WIDTH } from '@/components/sidebar-context'

const navItems: { href: string; label: string; icon: React.ComponentType<{ className?: string }>; pageKey: string }[] = [
  { href: '/', label: 'Net Worth', icon: ChartSpline, pageKey: 'netWorth' },
  { href: '/accounts', label: 'Accounts', icon: Landmark, pageKey: 'netWorth' },
  { href: '/transactions', label: 'Transactions', icon: Receipt, pageKey: 'transactions' },
  { href: '/cash-flow', label: 'Cash Flow', icon: TrendingUp, pageKey: 'cashFlow' },
  { href: '/spending', label: 'Spending', icon: DollarSign, pageKey: 'spending' },
  { href: '/budgets', label: 'Budgets', icon: Wallet, pageKey: 'budgets' },
  { href: '/real-estate', label: 'Real Estate', icon: Home, pageKey: 'realEstate' },
  { href: '/fire', label: 'FIRE', icon: Flame, pageKey: 'fire' },
  { href: '/goals', label: 'Goals', icon: Target, pageKey: 'goals' },
  { href: '/financial-logic', label: 'Financial Logic', icon: Calculator, pageKey: 'financialLogic' },
  { href: '/data', label: 'Data Explorer', icon: Database, pageKey: 'dataExplorer' },
  { href: '/ai-suggestions', label: 'Suggestions', icon: Sparkles, pageKey: 'settings' },
]

function SimpleTooltip({ children, label, show }: { children: React.ReactNode; label: string; show: boolean }) {
  if (!show) return <>{children}</>
  return (
    <div className="relative group/tooltip">
      {children}
      <div className="absolute left-full ml-2 top-1/2 -translate-y-1/2 px-2 py-1 bg-foreground/10 backdrop-blur-md text-foreground text-xs font-medium rounded-md border border-border whitespace-nowrap opacity-0 invisible group-hover/tooltip:opacity-100 group-hover/tooltip:visible transition-all duration-150 z-50 pointer-events-none shadow-lg">
        {label}
      </div>
    </div>
  )
}

export default function ResizableSidebar() {
  const pathname = usePathname()
  const { sidebarWidth, isHovering, handleNavResizeDown, handleMouseEnter, handleMouseLeave } = useSidebar()
  const [isResizing, setIsResizing] = useState(false)
  const { data: session } = useSession()
  const [mounted, setMounted] = useState(false)

  const { isHidden } = useHiddenPages()
  const { reduceTransparency } = useReduceTransparency()
  const [devMode, setDevMode] = useState<boolean | null>(null)
  const [pendingAiCount, setPendingAiCount] = useState<number>(0)

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    // Check for pending AI proposals
    fetch('/api/ai/proposals?status=pending', { credentials: 'include' })
      .then(r => r.json())
      .then(data => setPendingAiCount(Array.isArray(data) ? data.length : 0))
      .catch(() => {})

    fetch('/api/dev-mode', { credentials: 'include' })
      .then(res => res.json())
      .then(data => setDevMode(data.devMode))
      .catch(() => setDevMode(false))
  }, [])

  const isActive = (href: string) => pathname === href
  const isCollapsed = sidebarWidth === COLLAPSED_WIDTH

  // Return null or a simple skeleton on server/initial hydration to avoid mismatch
  if (!mounted) return null

  return (
    <>
      <aside
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        className={`fixed left-0 top-0 z-45 h-screen border-r flex flex-col justify-between transition-all duration-200 border-sidebar-border hidden md:flex ${
          reduceTransparency
            ? 'bg-sidebar'
            : 'backdrop-blur-md bg-sidebar/40 dark:bg-sidebar/40'
        }`}
        style={{ width: `${sidebarWidth}px` }}
      >
        {/* Logo / Brand */}
        <div className={isCollapsed ? 'flex justify-center pt-4 pb-2' : 'px-4 pt-4 pb-3'}>
          {isCollapsed ? (
            <div className="w-8 h-8 rounded-lg bg-primary/20 flex items-center justify-center">
              <span className="text-primary font-bold text-sm">$</span>
            </div>
          ) : (
            <div className="flex items-center gap-2.5">
              <div className="w-7 h-7 rounded-lg bg-primary/20 flex items-center justify-center">
                <span className="text-primary font-bold text-xs">$</span>
              </div>
            </div>
          )}
        </div>

        {/* Navigation Links */}
        <nav className={`flex-1 ${isCollapsed ? 'px-2 space-y-0.5' : 'px-2 space-y-0.5'}`}>
          {navItems.filter((item) => {
            const isDevModePage = (DEV_MODE_PAGE_KEYS as readonly string[]).includes(item.pageKey)
            if (isDevModePage && devMode !== true) return false
            return item.pageKey === 'settings' || !isHidden(item.pageKey as HiddenPageKey)
          }).map((item) => {
            const Icon = item.icon
            const active = isActive(item.href)
            return (
              <SimpleTooltip key={item.href} label={item.label} show={isCollapsed}>
                <a
                  href={item.href}
                  className={`flex items-center rounded-lg transition-all duration-150 ${
                    isCollapsed
                      ? 'justify-center py-2'
                      : 'px-3 py-2 gap-3'
                  } ${
                    active
                      ? 'bg-primary/15 text-primary font-medium'
                      : 'text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-accent'
                  }`}
                  title={isCollapsed ? item.label : undefined}
                >
                  <Icon className={`h-5 w-5 flex-shrink-0 ${active ? 'text-primary' : ''}`} />
                  {!isCollapsed && <span className="text-sm truncate">{item.label}</span>}
                  {item.href === '/ai-suggestions' && pendingAiCount > 0 && (
                    isCollapsed ? (
                      <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-primary" />
                    ) : (
                      <span className="ml-auto px-1.5 py-0.5 text-[10px] font-medium bg-primary/20 text-primary rounded-full">
                        {pendingAiCount}
                      </span>
                    )
                  )}
                </a>
              </SimpleTooltip>
            )
          })}
        </nav>

        {/* Bottom section */}
        {session?.user && (
          <div className={isCollapsed ? 'space-y-2 pb-4 flex flex-col items-center' : 'space-y-3 p-3'}>
            {isCollapsed && session?.user?.name && (
              <SimpleTooltip label={session.user.name} show={isCollapsed}>
                <div className="w-7 h-7 rounded-full bg-primary/20 flex items-center justify-center mb-1">
                  <span className="text-xs font-semibold text-primary">
                    {session.user.name.charAt(0).toUpperCase()}
                  </span>
                </div>
              </SimpleTooltip>
            )}
          </div>
        )}
      </aside>

      {/* Resize Handle */}
      {!isCollapsed && (
        <div
          className="fixed top-0 z-46 cursor-col-resize hidden md:block"
          style={{
            left: `${sidebarWidth}px`,
            width: '6px',
            height: '100vh',
            marginLeft: '-3px',
            background: isResizing ? 'var(--color-ring)' : 'transparent',
          }}
          onMouseDown={(e) => {
            setIsResizing(true);
            handleNavResizeDown(e);
          }}
          onMouseUp={() => setIsResizing(false)}
        >
          <div className="w-1 h-full mx-auto bg-sidebar-border hover:bg-ring/50 transition-colors" />
        </div>
      )}

    </>
  )
}
