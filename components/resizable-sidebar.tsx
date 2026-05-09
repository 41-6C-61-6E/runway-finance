'use client'

import { usePathname } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { useState, useRef, useCallback, useEffect } from 'react'
import SignOutForm from '@/components/sign-out-form'
import { Home, Receipt, Settings, Key } from 'lucide-react'
import { useSidebar, MIN_WIDTH, MAX_WIDTH, DEFAULT_WIDTH, COLLAPSED_WIDTH } from '@/components/sidebar-context'
import ChangePasswordDrawer from '@/components/change-password-drawer'

// Export hooks for backward compatibility
export { useSidebar, MIN_WIDTH, MAX_WIDTH, DEFAULT_WIDTH, COLLAPSED_WIDTH } from '@/components/sidebar-context'

const navItems = [
  { href: '/', label: 'Dashboard', icon: Home },
  { href: '/transactions', label: 'Transactions', icon: Receipt },
  { href: '/settings', label: 'Settings', icon: Settings },
]

export default function ResizableSidebar() {
  const pathname = usePathname()
  const { sidebarWidth, isHovering, handleNavResizeDown, handleMouseEnter, handleMouseLeave } = useSidebar()
  const [isResizing, setIsResizing] = useState(false)
  const { data: session } = useSession()
  const [changePasswordOpen, setChangePasswordOpen] = useState(false)
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

  return (
    <>
      <aside
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        className="fixed left-0 top-0 z-20 h-screen bg-black/20 backdrop-blur-md border-r border-white/10 flex flex-col justify-between transition-all duration-200"
        style={{ width: `${sidebarWidth}px` }}
      >
        <div className="space-y-6">
          {/* Navigation Links */}
          <nav className="space-y-2 px-2 pt-4">
            {navItems.map((item) => {
              const Icon = item.icon
              const isActiveItem = isActive(item.href)
              return (
                <a
                  key={item.href}
                  href={item.href}
                  className={`flex items-center gap-3 rounded-lg transition-colors ${
                    sidebarWidth === COLLAPSED_WIDTH
                      ? 'justify-center px-2 py-2'
                      : `px-3 py-2 text-sm font-medium ${
                          isActiveItem
                            ? 'text-white bg-white/10'
                            : 'text-gray-300 hover:text-white hover:bg-white/10'
                        }`
                  } ${
                    isActiveItem && sidebarWidth === COLLAPSED_WIDTH
                      ? 'text-white bg-white/10'
                      : isActiveItem && sidebarWidth !== COLLAPSED_WIDTH
                      ? 'text-white bg-white/10'
                      : 'text-gray-300 hover:text-white hover:bg-white/10'
                  }`}
                  title={item.label}
                >
                  <Icon className="h-5 w-5 flex-shrink-0" />
                  {sidebarWidth !== COLLAPSED_WIDTH && <span className="truncate">{item.label}</span>}
                </a>
              )
            })}
          </nav>
        </div>

        {/* App Status */}
        {session?.user && sidebarWidth !== COLLAPSED_WIDTH && (
          <div className="space-y-4 p-6">
            <div className="px-3 py-2 bg-white/5 rounded-lg border border-white/10 space-y-2">
              <div className="text-xs text-gray-500 font-medium">App Status</div>
              {appStatus && (
                <>
                  <div className="flex items-center gap-2">
                    <span className={`w-2 h-2 rounded-full flex-shrink-0 ${
                      appStatus.connected
                        ? appStatus.lastSyncStatus === 'ok'
                          ? 'bg-emerald-400'
                          : appStatus.lastSyncStatus === 'error'
                          ? 'bg-red-400'
                          : 'bg-yellow-400'
                        : 'bg-gray-600'
                    }`} />
                    <span className="text-xs text-gray-400">
                      {appStatus.connected ? 'Bridge connected' : 'No bridge'}
                    </span>
                  </div>
                  {appStatus.connected && (
                    <div className="text-xs text-gray-500 pl-4">Last sync: {formatRelativeTime(appStatus.lastSyncAt)}</div>
                  )}
                  <div className="flex items-center gap-4 pl-4">
                    <span className="text-xs text-gray-500">{appStatus.accounts} accounts</span>
                    <span className="text-xs text-gray-500">{appStatus.transactions} transactions</span>
                  </div>
                </>
              )}
            </div>
            <div className="px-3 py-2 bg-white/5 rounded-lg border border-white/10">
              <div className="text-xs text-gray-500">Signed in as</div>
              <div className="text-sm text-white truncate">{session.user.email}</div>
            </div>
            <button
              type="button"
              onClick={() => setChangePasswordOpen(true)}
              className="w-full inline-flex items-center justify-center gap-2 px-6 py-2.5 text-sm font-semibold text-gray-900 dark:text-white bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg border border-gray-300 dark:border-gray-600 shadow-md hover:shadow-lg transition-all duration-200"
            >
              <Key className="h-4 w-4" />
              Change Password
            </button>
            <SignOutForm />
          </div>
        )}
      </aside>

      {/* Resize Handle */}
      {sidebarWidth !== COLLAPSED_WIDTH && (
        <div
          className="fixed top-0 z-30 cursor-col-resize"
          style={{
            left: `${sidebarWidth}px`,
            width: '6px',
            height: '100vh',
            marginLeft: '-3px',
            background: isResizing ? 'rgba(59, 130, 246, 0.3)' : 'transparent',
          }}
          onMouseDown={(e) => {
            setIsResizing(true);
            handleNavResizeDown(e);
          }}
          onMouseUp={() => setIsResizing(false)}
        >
          <div className="w-1 h-full mx-auto bg-white/10 hover:bg-blue-500/50 transition-colors" />
        </div>
      )}

      {/* Change Password Drawer */}
      <ChangePasswordDrawer open={changePasswordOpen} onClose={() => setChangePasswordOpen(false)} />
    </>
  )
}
