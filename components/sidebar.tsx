'use client'

import { usePathname } from 'next/navigation'

export default function Sidebar() {
  const pathname = usePathname()

  const navItems = [
    { href: '/', label: 'Dashboard' },
    { href: '/settings', label: 'Settings' },
  ]

  const isActive = (href: string) => pathname === href

  return (
    <aside className="fixed left-0 top-0 z-20 h-screen w-64 p-6 bg-sidebar/80 backdrop-blur-md border-r border-sidebar-border flex flex-col justify-between">
      <div className="space-y-6">

        {/* Navigation Links */}
        <nav className="space-y-2">
          {navItems.map((item) => (
            <a
              key={item.href}
              href={item.href}
              className={`block px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                isActive(item.href)
                  ? 'text-sidebar-primary-foreground bg-sidebar-primary'
                  : 'text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-accent'
              }`}
            >
              {item.label}
            </a>
          ))}
        </nav>
      </div>
    </aside>
  )
}
