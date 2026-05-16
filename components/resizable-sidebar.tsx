'use client'

import { usePathname } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { useState, useRef, useCallback, useEffect } from 'react'
import SignOutForm from '@/components/sign-out-form'
import { ChartSpline, Receipt, Settings, Key, LogOut, TrendingUp, Flame, Home, Wallet, Database, Target, DollarSign } from 'lucide-react'
import { useSidebar, MIN_WIDTH, MAX_WIDTH, DEFAULT_WIDTH, COLLAPSED_WIDTH } from '@/components/sidebar-context'
import ChangePasswordDrawer from '@/components/change-password-drawer'
import { useHiddenPages, type HiddenPageKey } from '@/lib/hooks/use-hidden-pages'
import { useReduceTransparency } from '@/lib/hooks/use-reduce-transparency'

export { useSidebar, MIN_WIDTH, MAX_WIDTH, DEFAULT_WIDTH, COLLAPSED_WIDTH } from '@/components/sidebar-context'

const navItems: { href: string; label: string; icon: React.ComponentType<{ className?: string }>; pageKey: string }[] = [
  { href: '/', label: 'Net Worth', icon: ChartSpline, pageKey: 'netWorth' },
  { href: '/transactions', label: 'Transactions', icon: Receipt, pageKey: 'transactions' },
  { href: '/cash-flow', label: 'Cash Flow', icon: TrendingUp, pageKey: 'cashFlow' },
  { href: '/spending', label: 'Spending', icon: DollarSign, pageKey: 'spending' },
  { href: '/budgets', label: 'Budgets', icon: Wallet, pageKey: 'budgets' },
  { href: '/real-estate', label: 'Real Estate', icon: Home, pageKey: 'realEstate' },
  { href: '/fire', label: 'FIRE', icon: Flame, pageKey: 'fire' },
  { href: '/goals', label: 'Goals', icon: Target, pageKey: 'goals' },
  { href: '/data', label: 'Data Explorer', icon: Database, pageKey: 'dataExplorer' },
  { href: '/settings', label: 'Settings', icon: Settings, pageKey: 'settings' },
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
  const [changePasswordOpen, setChangePasswordOpen] = useState(false)
  const { isHidden } = useHiddenPages()
  const { reduceTransparency } = useReduceTransparency()
  const [appStatus, setAppStatus] = useState<{
    connected: boolean
    lastSyncAt: string | null
    lastSyncStatus: string | null
    accounts: number
    transactions: number
  } | null>(null)

  useEffect(() => {
    const fetchStatus = async () => {
      try {
        const [connRes, acctRes, txnRes] = await Promise.all([
          fetch('/api/connections', { credentials: 'include' }),
          fetch('/api/accounts?includeHidden=true', { credentials: 'include' }),
          fetch('/api/transactions?limit=1', { credentials: 'include' }),
        ])
        const connections = connRes.ok ? await connRes.json() : []
        const accounts = acctRes.ok ? await acctRes.json() : []
        const transactions = txnRes.ok ? await txnRes.json() : []
        const latestConn = Array.isArray(connections) && connections.length > 0
          ? connections.reduce((a: any, b: any) => (!a.lastSyncAt || new Date(b.lastSyncAt) > new Date(a.lastSyncAt) ? b : a))
          : null
        setAppStatus({
          connected: Array.isArray(connections) && connections.length > 0,
          lastSyncAt: latestConn?.lastSyncAt ?? null,
          lastSyncStatus: latestConn?.lastSyncStatus ?? null,
          accounts: Array.isArray(accounts) ? accounts.length : 0,
          transactions: txnRes.ok ? (transactions.total ?? 0) : 0,
        })
      } catch {
        setAppStatus({ connected: false, lastSyncAt: null, lastSyncStatus: null, accounts: 0, transactions: 0 })
      }
    }
    fetchStatus()
  }, [])

  const formatRelativeTime = (dateStr: string | null) => {
    if (!dateStr) return 'Never'
    const diff = Date.now() - new Date(dateStr).getTime()
    const mins = Math.floor(diff / 60000)
    if (mins < 1) return 'Just now'
    if (mins < 60) return `${mins}m ago`
    const hours = Math.floor(mins / 60)
    if (hours < 24) return `${hours}h ago`
    const days = Math.floor(hours / 24)
    return `${days}d ago`
  }

  const isActive = (href: string) => pathname === href
  const isCollapsed = sidebarWidth === COLLAPSED_WIDTH

  return (
    <>
      <aside
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        className={`fixed left-0 top-0 z-20 h-screen border-r flex flex-col justify-between transition-all duration-200 border-sidebar-border ${
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
          {navItems.filter((item) => item.pageKey === 'settings' || !isHidden(item.pageKey as HiddenPageKey)).map((item) => {
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
                </a>
              </SimpleTooltip>
            )
          })}
        </nav>

        {/* Bottom section */}
        {session?.user && (
          <div className={isCollapsed ? 'space-y-2 pb-4 flex flex-col items-center' : 'space-y-3 p-3'}>
            {!isCollapsed && (
              <div className="px-3 py-2.5 rounded-lg border border-sidebar-border space-y-1.5">
                <div className="text-xs text-sidebar-foreground/50 font-medium">Status</div>
                <div className="text-xs text-sidebar-foreground/70">
                  Signed in as: {session?.user?.name}
                </div>
                {appStatus && (
                  <>
                    <div className="flex items-center gap-2">
                      <span className={`w-2 h-2 rounded-full flex-shrink-0 ${
                        appStatus.connected
                          ? appStatus.lastSyncStatus === 'ok'
                            ? 'bg-chart-1'
                            : appStatus.lastSyncStatus === 'error'
                            ? 'bg-destructive'
                            : 'bg-chart-3'
                          : 'bg-muted-foreground/50'
                      }`} />
                      <span className="text-xs text-sidebar-foreground/70">
                        {appStatus.connected ? 'Connected' : 'No bridge'}
                      </span>
                    </div>
                    {appStatus.connected && (
                      <div className="text-xs text-sidebar-foreground/50">
                        {formatRelativeTime(appStatus.lastSyncAt)}
                      </div>
                    )}
                    <div className="flex items-center gap-3 text-xs text-sidebar-foreground/50">
                      <span>{appStatus.accounts} accts</span>
                      <span>{appStatus.transactions} txns</span>
                    </div>
                  </>
                )}
              </div>
            )}

            {!isCollapsed && (
              <>
                <button
                  type="button"
                  onClick={() => setChangePasswordOpen(true)}
                  className="w-full inline-flex items-center justify-center gap-2 px-3 py-2 text-sm font-medium text-sidebar-foreground/70 hover:bg-sidebar-accent rounded-lg border border-sidebar-border transition-all"
                >
                  <Key className="h-4 w-4" />
                  Change Password
                </button>
                <SignOutForm iconOnly={false} />
              </>
            )}

            {isCollapsed && session?.user?.name && (
              <SimpleTooltip label={session.user.name} show={isCollapsed}>
                <div className="w-7 h-7 rounded-full bg-primary/20 flex items-center justify-center mb-1">
                  <span className="text-xs font-semibold text-primary">
                    {session.user.name.charAt(0).toUpperCase()}
                  </span>
                </div>
              </SimpleTooltip>
            )}
            {isCollapsed && (
              <div className="flex flex-col items-center gap-1">
                <SimpleTooltip label="Change Password" show={isCollapsed}>
                  <button
                    type="button"
                    onClick={() => setChangePasswordOpen(true)}
                    className="p-2 rounded-lg text-sidebar-foreground/50 hover:text-sidebar-foreground hover:bg-sidebar-accent transition-colors"
                  >
                    <Key className="h-4 w-4" />
                  </button>
                </SimpleTooltip>
                <SimpleTooltip label="Sign Out" show={isCollapsed}>
                  <SignOutForm iconOnly={isCollapsed} />
                </SimpleTooltip>
              </div>
            )}
          </div>
        )}
      </aside>

      {/* Resize Handle */}
      {!isCollapsed && (
        <div
          className="fixed top-0 z-30 cursor-col-resize"
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

      {/* Change Password Drawer */}
      <ChangePasswordDrawer open={changePasswordOpen} onClose={() => setChangePasswordOpen(false)} />
    </>
  )
}
