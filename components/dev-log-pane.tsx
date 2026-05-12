'use client'

import { useState, useEffect, useRef, useCallback } from 'react'

interface LogEntry {
  id: string
  timestamp: string
  level: 'info' | 'warn' | 'error' | 'debug'
  message: string
  metadata?: Record<string, unknown>
}

const LEVEL_COLORS: Record<LogEntry['level'], string> = {
  info: 'text-chart-4',
  warn: 'text-chart-3',
  error: 'text-destructive',
  debug: 'text-muted-foreground',
}

const LEVEL_BG: Record<LogEntry['level'], string> = {
  info: 'bg-chart-4/10',
  warn: 'bg-chart-3/10',
  error: 'bg-destructive/10',
  debug: 'bg-muted-foreground/10',
}

const MIN_HEIGHT = 150
const MAX_HEIGHT = 600
const DEFAULT_HEIGHT = 384 // 24rem

export default function DevLogPane() {
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [level, setLevel] = useState<'all' | LogEntry['level']>('all')
  const [isOpen, setIsOpen] = useState(true)
  const [isConnected, setIsConnected] = useState(false)
  const [lastEntryId, setLastEntryId] = useState<string | undefined>()
  const [height, setHeight] = useState(DEFAULT_HEIGHT)
  const [isResizing, setIsResizing] = useState(false)
  const [devModeEnabled, setDevModeEnabled] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [expandedLogs, setExpandedLogs] = useState<Set<string>>(new Set())
  const startYRef = useRef(0)
  const startHeightRef = useRef(DEFAULT_HEIGHT)
  const scrollRef = useRef<HTMLDivElement>(null)
  const pollRef = useRef<ReturnType<typeof setInterval> | undefined>(undefined)

  const toggleExpand = useCallback((id: string) => {
    setExpandedLogs((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }, [])

  // Check if dev mode is enabled
  const checkDevMode = useCallback(async () => {
    try {
      const res = await fetch('/api/dev-mode', { credentials: 'include' })
      if (!res.ok) {
        setDevModeEnabled(false)
        return
      }
      const data = await res.json()
      setDevModeEnabled(data.devMode)
    } catch {
      setDevModeEnabled(false)
    }
  }, [])

  useEffect(() => {
    checkDevMode()
    const interval = setInterval(checkDevMode, 5000)
    return () => clearInterval(interval)
  }, [checkDevMode])

  // Hide pane if dev mode is disabled
  useEffect(() => {
    if (!devModeEnabled) {
      setIsOpen(false)
    }
  }, [devModeEnabled])

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    setIsResizing(true)
    startYRef.current = e.clientY
    startHeightRef.current = height
  }, [height])

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!isResizing) return
    const newHeight = Math.min(MAX_HEIGHT, Math.max(MIN_HEIGHT, startHeightRef.current - (e.clientY - startYRef.current)))
    setHeight(newHeight)
  }, [isResizing])

  const handleMouseUp = useCallback(() => {
    setIsResizing(false)
  }, [])

  useEffect(() => {
    if (isResizing) {
      window.addEventListener('mousemove', handleMouseMove)
      window.addEventListener('mouseup', handleMouseUp)
      document.body.style.cursor = 'row-resize'
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

  // Fetch logs from API
  const fetchLogs = useCallback(async (afterId?: string) => {
    if (!devModeEnabled) {
      setIsConnected(false)
      return
    }

    try {
      const params = new URLSearchParams({ limit: '100' })
      if (level !== 'all') params.set('level', level)
      if (afterId) params.set('afterId', afterId)

      const res = await fetch(`/api/dev/logs?${params}`, { credentials: 'include' })
      if (!res.ok) {
        if (res.status === 501) {
          setErrorMessage('Developer mode is disabled. Enable it in Settings.')
        } else {
          setErrorMessage(`Failed to load logs: ${res.status}`)
        }
        setIsConnected(false)
        return
      }

      const data = await res.json()
      const newLogs = data.logs || []

      if (newLogs.length > 0) {
        setLastEntryId(newLogs[newLogs.length - 1].id)
      }

      // Append to existing logs or replace if no afterId
      if (afterId) {
        setLogs((prev) => [...prev, ...newLogs])
      } else {
        setLogs(newLogs)
        setLastEntryId(newLogs.length > 0 ? newLogs[newLogs.length - 1].id : undefined)
      }

      setErrorMessage(null)
      setIsConnected(true)
    } catch {
      setErrorMessage('Unable to fetch logs. Ensure developer mode is enabled and you are signed in.')
      setIsConnected(false)
    }
  }, [level, devModeEnabled])

  // Poll for new logs (also handles initial fetch when dev mode is enabled)
  useEffect(() => {
    if (!isOpen || !devModeEnabled) return

    // Initial fetch
    fetchLogs()

    // Poll every 2 seconds
    pollRef.current = setInterval(() => {
      fetchLogs(lastEntryId)
    }, 2000)

    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current)
      }
    }
  }, [isOpen, lastEntryId, devModeEnabled, fetchLogs])

  // Auto-scroll to bottom
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [logs])

  // Clear logs
  const handleClear = async () => {
    try {
      await fetch('/api/dev/logs', { method: 'DELETE', credentials: 'include' })
      setLogs([])
      setLastEntryId(undefined)
    } catch {
      // Ignore errors
    }
  }

  // Determine indicator color based on log severity
  const getIndicatorColor = () => {
    if (logs.some((log) => log.level === 'error')) {
      return 'bg-destructive'
    }
    if (logs.some((log) => log.level === 'warn')) {
      return 'bg-chart-3'
    }
    if (isConnected) {
      return 'bg-chart-1'
    }
    return 'bg-muted-foreground'
  }

  // If dev mode is not enabled, don't render anything
  if (!devModeEnabled) {
    return null
  }

  // Render the full panel when open, or just the button when closed
  return (
    <>
      {/* Full log panel when open */}
      {isOpen && (
        <div
          className="flex flex-col bg-gray-950 border-t border-gray-800 shadow-2xl flex-shrink-0"
          style={{ height: `${height}px` }}
        >
          {/* Resizable handle */}
          <div
            onMouseDown={handleMouseDown}
            className="h-1 bg-muted hover:bg-accent cursor-row-resize transition-colors flex-shrink-0"
          />

          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-border flex-shrink-0">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-foreground">Logs</span>
              <span className={`w-2 h-2 rounded-full ${isConnected ? 'bg-chart-1' : 'bg-destructive'}`} />
            </div>
            <div className="flex items-center gap-2">
              {/* Level filter */}
              <select
                value={level}
                onChange={(e) => setLevel(e.target.value as 'all' | LogEntry['level'])}
                className="px-2 py-1 text-xs bg-muted border border-border rounded text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              >
                <option value="all">All</option>
                <option value="debug">Debug</option>
                <option value="info">Info</option>
                <option value="warn">Warn</option>
                <option value="error">Error</option>
              </select>

              {/* Clear button */}
              <button
                onClick={handleClear}
                className="px-2 py-1 text-xs bg-muted hover:bg-accent border border-border rounded text-foreground transition-colors"
              >
                Clear
              </button>

              {/* Close button */}
              <button
                onClick={() => setIsOpen(false)}
                className="px-2 py-1 text-xs bg-muted hover:bg-accent border border-border rounded text-foreground transition-colors"
              >
                Hide
              </button>
            </div>
          </div>

          {/* Error message */}
          {errorMessage && (
            <div className="px-4 py-2 bg-destructive/10 border-b border-destructive/20 text-xs text-destructive flex-shrink-0">
              {errorMessage}
            </div>
          )}

          {/* Log entries */}
          <div
            ref={scrollRef}
            className="flex-1 overflow-y-auto p-4 font-mono text-xs space-y-1"
          >
            {logs.length === 0 ? (
              <div className="text-muted-foreground italic">No logs yet...</div>
            ) : (
              logs.map((log) => {
                const isExpanded = expandedLogs.has(log.id)
                const hasMetadata = log.metadata && Object.keys(log.metadata).length > 0
                return (
                  <div key={log.id}>
                    <button
                      onClick={() => hasMetadata && toggleExpand(log.id)}
                      className={`w-full flex gap-3 py-1 px-2 rounded text-left select-text ${LEVEL_BG[log.level]} ${hasMetadata ? 'cursor-pointer hover:opacity-80' : 'cursor-default'}`}
                    >
                      <span className="text-muted-foreground shrink-0">
                        {new Date(log.timestamp).toLocaleTimeString()}
                      </span>
                      <span className={`shrink-0 font-semibold w-12 ${LEVEL_COLORS[log.level]}`}>
                        {log.level.toUpperCase()}
                      </span>
                      <span className="text-foreground break-all flex-1 min-w-0">{log.message}</span>
                      {hasMetadata && (
                        <span className="text-muted-foreground shrink-0 font-mono text-[10px]">
                          {isExpanded ? '[-]' : '[+]'}
                        </span>
                      )}
                    </button>
                    {isExpanded && hasMetadata && (
                      <pre className="ml-14 mr-4 mb-1 px-3 py-2 rounded bg-gray-900 text-[10px] text-chart-4 overflow-x-auto">
                        {JSON.stringify(log.metadata, null, 2)}
                      </pre>
                    )}
                  </div>
                )
              })
            )}
          </div>
        </div>
      )}

      {/* Logs button when panel is closed */}
      {!isOpen && (
        <button
          onClick={() => setIsOpen(true)}
          className="fixed bottom-6 right-6 px-3 py-2 text-xs font-semibold text-muted-foreground hover:text-foreground rounded-lg transition-colors shadow-lg z-40 backdrop-blur-md bg-background/80 hover:bg-muted border border-border hover:border-border flex items-center gap-2"
        >
          <span className={`w-2 h-2 rounded-full ${getIndicatorColor()}`} />
          Logs
        </button>
      )}
    </>
  )
}
