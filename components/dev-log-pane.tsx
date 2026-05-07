'use client'

import { useState, useEffect, useRef, useCallback } from 'react'

interface LogEntry {
  id: string
  timestamp: string
  level: 'info' | 'warn' | 'error' | 'debug'
  message: string
}

const LEVEL_COLORS: Record<LogEntry['level'], string> = {
  info: 'text-blue-400',
  warn: 'text-yellow-400',
  error: 'text-red-400',
  debug: 'text-gray-500',
}

const LEVEL_BG: Record<LogEntry['level'], string> = {
  info: 'bg-blue-500/10',
  warn: 'bg-yellow-500/10',
  error: 'bg-red-500/10',
  debug: 'bg-gray-500/10',
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
  const startYRef = useRef(0)
  const startHeightRef = useRef(DEFAULT_HEIGHT)
  const scrollRef = useRef<HTMLDivElement>(null)
  const pollRef = useRef<ReturnType<typeof setInterval> | undefined>(undefined)

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

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-4 right-4 z-50 px-4 py-2 bg-gray-800 hover:bg-gray-700 text-white text-sm rounded-lg shadow-lg border border-gray-700 transition-colors"
      >
        <span className="flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500'}`} />
          Logs ({logs.length})
        </span>
      </button>
    )
  }

  return (
    <div className="fixed bottom-0 left-64 right-0 z-40 h-96 bg-gray-950/95 backdrop-blur-sm border-t border-gray-800 flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-gray-800 bg-gray-900/50">
        <div className="flex items-center gap-4">
          <h3 className="text-sm font-semibold text-white">Dev Logs</h3>
          <span className={`text-xs ${isConnected ? 'text-green-500' : 'text-red-500'}`}>
            {isConnected ? 'Connected' : 'Disconnected'}
          </span>
        </div>
        {errorMessage && (
          <div className="mt-2 rounded-md bg-red-500/10 px-3 py-2 text-xs text-red-200">
            {errorMessage}
          </div>
        )}
        <div className="flex items-center gap-2">
          {/* Level filter */}
          <select
            value={level}
            onChange={(e) => setLevel(e.target.value as 'all' | LogEntry['level'])}
            className="px-2 py-1 text-xs bg-gray-800 border border-gray-700 rounded text-gray-300 focus:outline-none focus:ring-1 focus:ring-blue-500"
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
            className="px-2 py-1 text-xs bg-gray-800 hover:bg-gray-700 border border-gray-700 rounded text-gray-300 transition-colors"
          >
            Clear
          </button>

          {/* Close button */}
          <button
            onClick={() => setIsOpen(false)}
            className="px-2 py-1 text-xs bg-gray-800 hover:bg-gray-700 border border-gray-700 rounded text-gray-300 transition-colors"
          >
            Hide
          </button>
        </div>
      </div>

      {/* Log entries */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto p-4 font-mono text-xs space-y-1"
      >
        {logs.length === 0 ? (
          <div className="text-gray-600 italic">No logs yet...</div>
        ) : (
          logs.map((log) => (
            <div
              key={log.id}
              className={`flex gap-3 py-1 px-2 rounded ${LEVEL_BG[log.level]}`}
            >
              <span className="text-gray-500 shrink-0">
                {new Date(log.timestamp).toLocaleTimeString()}
              </span>
              <span className={`shrink-0 font-semibold w-12 ${LEVEL_COLORS[log.level]}`}>
                {log.level.toUpperCase()}
              </span>
              <span className="text-gray-300 break-all">{log.message}</span>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
