'use client'

import { usePathname } from 'next/navigation'
import { useState, useRef, useCallback, useEffect } from 'react'
import { ChartSpline, Receipt, TrendingUp, Home, Wallet, Database, Target, DollarSign, Sparkles, Calculator, Landmark, ChevronDown, ChevronRight, LayoutDashboard } from 'lucide-react'
import { useSidebar, MIN_WIDTH, MAX_WIDTH, DEFAULT_WIDTH, COLLAPSED_WIDTH } from '@/components/sidebar-context'
import { useHiddenPages, type HiddenPageKey, DEV_MODE_PAGE_KEYS } from '@/lib/hooks/use-hidden-pages'
import { useReduceTransparency } from '@/lib/hooks/use-reduce-transparency'
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip'

export { useSidebar, MIN_WIDTH, MAX_WIDTH, DEFAULT_WIDTH, COLLAPSED_WIDTH } from '@/components/sidebar-context'

const navItems: { href: string; label: string; icon: React.ComponentType<{ className?: string }>; pageKey: string }[] = [
  { href: '/', label: 'Net Worth', icon: ChartSpline, pageKey: 'netWorth' },
  { href: '/accounts', label: 'Accounts', icon: Landmark, pageKey: 'settings' },
  { href: '/transactions', label: 'Transactions', icon: Receipt, pageKey: 'transactions' },
  { href: '/cash-flow', label: 'Cash Flow', icon: TrendingUp, pageKey: 'cashFlow' },
  { href: '/spending', label: 'Spending', icon: DollarSign, pageKey: 'spending' },
  { href: '/budgets', label: 'Budgets', icon: Wallet, pageKey: 'budgets' },
  { href: '/real-estate', label: 'Real Estate', icon: Home, pageKey: 'realEstate' },
  { href: '/goals', label: 'Goals', icon: Target, pageKey: 'goals' },
  { href: '/financial-logic', label: 'Financial Logic', icon: Calculator, pageKey: 'financialLogic' },
  { href: '/data', label: 'Data Explorer', icon: Database, pageKey: 'dataExplorer' },
  { href: '/ai-suggestions', label: 'Suggestions', icon: Sparkles, pageKey: 'settings' },
]

const planningItems: { href: string; label: string; icon: React.ComponentType<{ className?: string }>; pageKey: string }[] = [
  { href: '/plans', label: 'Plans', icon: LayoutDashboard, pageKey: 'plans' },
]

export default function ResizableSidebar() {
  const pathname = usePathname()
  const { sidebarWidth, isHovering, handleNavResizeDown, handleMouseEnter, handleMouseLeave } = useSidebar()
  const [isResizing, setIsResizing] = useState(false)
  const [mounted, setMounted] = useState(false)

  const { isHidden } = useHiddenPages()
  const { reduceTransparency } = useReduceTransparency()
  const [devMode, setDevMode] = useState<boolean | null>(null)
  const [pendingAiCount, setPendingAiCount] = useState<number>(0)

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
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

  if (!mounted) return null

  const renderNavLink = (
    href: string,
    label: string,
    Icon: React.ComponentType<{ className?: string }>,
    active: boolean,
    showLabel: boolean,
  ) => (
    <a
      href={href}
      className={`flex items-center rounded-lg transition-all duration-150 ${
        !showLabel
          ? 'justify-center py-2'
          : 'px-3 py-2 gap-3'
      } ${
        active
          ? 'bg-primary/20 text-primary font-semibold'
          : 'text-sidebar-foreground/65 hover:text-sidebar-foreground hover:bg-sidebar-foreground/8'
      }`}
    >
      <Icon className={`h-5 w-5 flex-shrink-0 ${active ? 'text-primary' : ''}`} />
      {showLabel && <span className="text-sm truncate">{label}</span>}
    </a>
  )

  return (
    <>
      <aside
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        className="fixed left-0 top-0 z-45 h-screen flex flex-col justify-between transition-all duration-200 hidden md:flex"
        style={{ width: `${sidebarWidth}px` }}
      >
        {/* Dynamic Sidebar Background Panel */}
        <div className="absolute inset-0 -z-10 transition-all duration-200 border-r border-sidebar-border bg-sidebar" />
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
        <nav className={`flex-1 overflow-y-auto ${isCollapsed ? 'px-2 space-y-0.5' : 'px-2 space-y-0.5'}`}>
          {/* ── Finances Section ── */}
          {!isCollapsed && (
            <div className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-wider text-sidebar-foreground/40">
              Finances
            </div>
          )}
          {navItems.filter((item) => {
            const isDevModePage = (DEV_MODE_PAGE_KEYS as readonly string[]).includes(item.pageKey)
            if (isDevModePage && devMode !== true) return false
            return item.pageKey === 'settings' || !isHidden(item.pageKey as HiddenPageKey)
          }).map((item) => {
            const Icon = item.icon
            const active = isActive(item.href)
            const link = renderNavLink(item.href, item.label, Icon, active, !isCollapsed)
            return isCollapsed ? (
              <Tooltip key={item.href}>
                <TooltipTrigger asChild>{link}</TooltipTrigger>
                <TooltipContent side="right">{item.label}</TooltipContent>
              </Tooltip>
            ) : (
              <div key={item.href}>{link}</div>
            )
          })}

          {/* Separator */}
          <div className="my-3 border-t border-sidebar-border/50" />

          {/* ── Planning Section ── */}
          {!isCollapsed && (
            <div className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-wider text-sidebar-foreground/40">
              Planning
            </div>
          )}
          {planningItems.map((item) => {
            const Icon = item.icon
            const active = isActive(item.href)
            const link = renderNavLink(item.href, item.label, Icon, active, !isCollapsed)
            return isCollapsed ? (
              <Tooltip key={item.href}>
                <TooltipTrigger asChild>{link}</TooltipTrigger>
                <TooltipContent side="right">{item.label}</TooltipContent>
              </Tooltip>
            ) : (
              <div key={item.href}>{link}</div>
            )
          })}
        </nav>

      </aside>



    </>
  )
}
