'use client'

import { usePathname } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { useState, useRef, useCallback, useEffect, createContext, useContext } from 'react'
import SignOutForm from '@/components/sign-out-form'
import { Home, Wallet, Receipt, Settings, ChevronLeft, ChevronRight } from 'lucide-react'

const MIN_WIDTH = 180
const MAX_WIDTH = 500
const DEFAULT_WIDTH = 256
const COLLAPSED_WIDTH = 64

const navItems = [
  { href: '/', label: 'Dashboard', icon: Home },
  { href: '/accounts', label: 'Accounts', icon: Wallet },
  { href: '/transactions', label: 'Transactions', icon: Receipt },
  { href: '/settings', label: 'Settings', icon: Settings },
]

// Context for sidebar state
export const SidebarContext = createContext<{
  collapsed: boolean
  sidebarWidth: number
}>({
  collapsed: false,
  sidebarWidth: DEFAULT_WIDTH,
})

export function useSidebar() {
  return useContext(SidebarContext)
}

export default function ResizableSidebar() {
  const pathname = usePathname()
  const [width, setWidth] = useState(DEFAULT_WIDTH)
  const [isResizing, setIsResizing] = useState(false)
  const [collapsed, setCollapsed] = useState(false)
  const startXRef = useRef(0)
  const startWidthRef = useRef(DEFAULT_WIDTH)
  const { data: session } = useSession()
  const [appStatus, setAppStatus] = useState<{
    connected: boolean
    lastSyncAt: string | null
    lastSyncStatus: string | null
    accounts: number
    transactions: number
  } | null>(null)

  const sidebarWidth = collapsed ? COLLAPSED_WIDTH : width

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

  const handleCollapseToggle = useCallback(() => {
    setCollapsed((prev) => !prev)
  }, [])

  const isActive = (href: string) => pathname === href

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    setIsResizing(true)
    startXRef.current = e.clientX
    startWidthRef.current = width
  }, [width])

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!isResizing) return
    const newWidth = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, startWidthRef.current + (e.clientX - startXRef.current)))
    setWidth(newWidth)
  }, [isResizing])

  const handleMouseUp = useCallback(() => {
    setIsResizing(false)
  }, [])

  useEffect(() => {
    if (isResizing) {
      window.addEventListener('mousemove', handleMouseMove)
      window.addEventListener('mouseup', handleMouseUp)
      document.body.style.cursor = 'col-resize'
      document.body.style.userSelect = 'none'
    } else {
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }
    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }
  }, [isResizing, handleMouseMove, handleMouseUp])

  return (
    <SidebarContext.Provider value={{ collapsed, sidebarWidth }}>
      <aside
        className="fixed left-0 top-0 z-20 h-screen bg-black/20 backdrop-blur-md border-r border-white/10 flex flex-col justify-between transition-all duration-200"
        style={{ width: `${sidebarWidth}px` }}
      >
        <div className="space-y-6">
          {/* Collapse Toggle */}
          <div className="flex justify-center pt-4">
            <button
              onClick={handleCollapseToggle}
              className="inline-flex items-center justify-center rounded-lg p-2 text-gray-400 hover:text-white hover:bg-white/10 transition-colors"
              aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            >
              {collapsed ? <ChevronRight className="h-5 w-5" /> : <ChevronLeft className="h-5 w-5" />}
            </button>
          </div>

          {/* Navigation Links */}
          <nav className="space-y-2 px-2">
            {navItems.map((item) => {
              const Icon = item.icon
              const isActiveItem = isActive(item.href)
              return (
                <a
                  key={item.href}
                  href={item.href}
                  className={`flex items-center gap-3 rounded-lg transition-colors ${
                    collapsed
                      ? 'justify-center px-2 py-2'
                      : `px-3 py-2 text-sm font-medium ${
                          isActiveItem
                            ? 'text-white bg-white/10'
                            : 'text-gray-300 hover:text-white hover:bg-white/10'
                        }`
                  } ${
                    isActiveItem && !collapsed
                      ? 'text-white bg-white/10'
                      : isActiveItem && collapsed
                      ? 'text-white bg-white/10'
                      : 'text-gray-300 hover:text-white hover:bg-white/10'
                  }`}
                  title={item.label}
                >
                  <Icon className="h-5 w-5 flex-shrink-0" />
                  {!collapsed && <span className="truncate">{item.label}</span>}
                </a>
              )
            })}
          </nav>
        </div>

        {/* App Status */}
        {session?.user && !collapsed && (
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
            <SignOutForm />
          </div>
        )}
      </aside>

      {/* Resize Handle */}
      {!collapsed && (
        <div
          className="fixed top-0 z-30 cursor-col-resize"
          style={{
            left: `${sidebarWidth}px`,
            width: '6px',
            height: '100vh',
            marginLeft: '-3px',
            background: isResizing ? 'rgba(59, 130, 246, 0.3)' : 'transparent',
          }}
          onMouseDown={handleMouseDown}
        >
          <div className="w-1 h-full mx-auto bg-white/10 hover:bg-blue-500/50 transition-colors" />
        </div>
      )}
    </SidebarContext.Provider>
  )
}
