'use client'

import { usePathname } from 'next/navigation'
import { useState, useRef, useCallback, useEffect } from 'react'

const MIN_WIDTH = 180
const MAX_WIDTH = 500
const DEFAULT_WIDTH = 256

export default function ResizableSidebar() {
  const pathname = usePathname()
  const [width, setWidth] = useState(DEFAULT_WIDTH)
  const [isResizing, setIsResizing] = useState(false)
  const startXRef = useRef(0)
  const startWidthRef = useRef(DEFAULT_WIDTH)

  const navItems = [
    { href: '/', label: 'Dashboard' },
    { href: '/accounts', label: 'Accounts' },
    { href: '/transactions', label: 'Transactions' },
    { href: '/settings', label: 'Settings' },
  ]

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
    <>
      <aside
        className="fixed left-0 top-0 z-20 h-screen bg-black/20 backdrop-blur-md border-r border-white/10 flex flex-col justify-between"
        style={{ width: `${width}px` }}
      >
        <div className="space-y-6 p-6">


          {/* Navigation Links */}
          <nav className="space-y-2">
            {navItems.map((item) => (
              <a
                key={item.href}
                href={item.href}
                className={`block px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  isActive(item.href)
                    ? 'text-white bg-white/10'
                    : 'text-gray-300 hover:text-white hover:bg-white/10'
                }`}
              >
                {item.label}
              </a>
            ))}
          </nav>
        </div>
      </aside>

      {/* Resize Handle */}
      <div
        className="fixed top-0 z-30 cursor-col-resize"
        style={{
          left: `${width}px`,
          width: '6px',
          height: '100vh',
          marginLeft: '-3px',
          background: isResizing ? 'rgba(59, 130, 246, 0.3)' : 'transparent',
        }}
        onMouseDown={handleMouseDown}
      >
        <div className="w-1 h-full mx-auto bg-white/10 hover:bg-blue-500/50 transition-colors" />
      </div>
    </>
  )
}
