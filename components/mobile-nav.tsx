'use client';

import React, { useState, useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { 
  Landmark, 
  Receipt, 
  DollarSign, 
  Menu, 
  X,
  ChartSpline,
  Wallet,
  Home,
  Target,
  Calculator,
  Database,
  Sparkles,
  LayoutDashboard,
  CandlestickChart,
  Minus,
  ArrowLeftRight,
  Flame,
} from 'lucide-react';
import { useHiddenPages, type HiddenPageKey, DEV_MODE_PAGE_KEYS } from '@/lib/hooks/use-hidden-pages';

interface NavItem {
  id: string;
  href: string;
  label: string;
  icon: React.ComponentType<any>;
  pageKey?: string;
  category: 'finances' | 'planning';
}

const ALL_NAV_ITEMS: NavItem[] = [
  { id: 'net-worth', href: '/', label: 'Net Worth', icon: ChartSpline, pageKey: 'netWorth', category: 'finances' },
  { id: 'accounts', href: '/accounts', label: 'Accounts', icon: Landmark, pageKey: 'accounts', category: 'finances' },
  { id: 'transactions', href: '/transactions', label: 'Transactions', icon: Receipt, pageKey: 'transactions', category: 'finances' },
  { id: 'flows', href: '/flows', label: 'Flows', icon: ArrowLeftRight, pageKey: 'flows', category: 'finances' },
  { id: 'spending', href: '/spending', label: 'Spend / Save', icon: DollarSign, pageKey: 'spending', category: 'finances' },
  { id: 'budgets', href: '/budgets', label: 'Budgets', icon: Wallet, pageKey: 'budgets', category: 'finances' },
  { id: 'real-estate', href: '/real-estate', label: 'Real Estate', icon: Home, pageKey: 'realEstate', category: 'finances' },
  { id: 'investments', href: '/investments', label: 'Investments', icon: CandlestickChart, pageKey: 'investments', category: 'finances' },
  { id: 'goals', href: '/goals', label: 'Goals', icon: Target, pageKey: 'goals', category: 'finances' },
  { id: 'financial-logic', href: '/financial-logic', label: 'Financial Logic', icon: Calculator, pageKey: 'financialLogic', category: 'finances' },
  { id: 'data-explorer', href: '/data', label: 'Data Explorer', icon: Database, pageKey: 'dataExplorer', category: 'finances' },
  { id: 'plans', href: '/plans', label: 'FIRE', icon: Flame, pageKey: 'plans', category: 'planning' },
];

export function MobileNav() {
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [devMode, setDevMode] = useState<boolean | null>(null);
  const [pendingHref, setPendingHref] = useState<string | null>(null);
  const { isHidden } = useHiddenPages();

  // Custom home items (minimized bottom nav items)
  const [homeItemIds, setHomeItemIds] = useState<string[]>(['net-worth', 'accounts', 'transactions', 'cash-flow']);
  const [isEditing, setIsEditing] = useState(false);
  
  // Custom Drag and Drop states
  const [draggedItem, setDraggedItem] = useState<NavItem | null>(null);
  const [dragCurrentPos, setDragCurrentPos] = useState({ x: 0, y: 0 });
  const [hoveredSlotIndex, setHoveredSlotIndex] = useState<number | null>(null);

  const longPressTimerRef = useRef<NodeJS.Timeout | null>(null);
  const pointerStartPosRef = useRef({ x: 0, y: 0 });
  const dragOffsetRef = useRef({ x: 0, y: 0 });

  // Drawer drag-to-dismiss states
  const [dragOffset, setDragOffset] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const startYRef = useRef(0);
  const currentYRef = useRef(0);

  useEffect(() => {
    if (!isOpen) {
      setDragOffset(0);
      setIsDragging(false);
      setIsEditing(false); // Reset edit mode when drawer closes
    }
  }, [isOpen]);

  const handlePointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    if (draggedItem) return; // Prevent drawer dragging when item is being dragged
    const target = e.target as HTMLElement;
    // Don't initiate drag if clicking interactive targets
    if (target.closest('a') || target.closest('button') || target.closest('[data-slot-index]')) {
      return;
    }
    setIsDragging(true);
    startYRef.current = e.clientY;
    currentYRef.current = e.clientY;
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isDragging) return;
    currentYRef.current = e.clientY;
    const deltaY = currentYRef.current - startYRef.current;
    if (deltaY > 0) {
      setDragOffset(deltaY);
    } else {
      setDragOffset(0);
    }
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (!isDragging) return;
    setIsDragging(false);
    e.currentTarget.releasePointerCapture(e.pointerId);
    if (dragOffset > 100) {
      setIsOpen(false);
    } else {
      setDragOffset(0);
    }
  };

  useEffect(() => {
    setPendingHref(null);
  }, [pathname]);

  useEffect(() => {
    setMounted(true);
    fetch('/api/dev-mode', { credentials: 'include' })
      .then(res => res.json())
      .then(data => setDevMode(data.devMode))
      .catch(() => setDevMode(false));

    // Load custom bottom nav items
    const saved = localStorage.getItem('mobile-home-nav-items');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length === 4) {
          setHomeItemIds(parsed);
        }
      } catch (e) {
        console.error('Failed to parse mobile nav items', e);
      }
    }
  }, []);

  const updateHomeItems = (newIds: string[]) => {
    setHomeItemIds(newIds);
    localStorage.setItem('mobile-home-nav-items', JSON.stringify(newIds));
  };

  const isActive = (href: string) => {
    if (href === '/') {
      return pathname === '/';
    }
    return pathname.startsWith(href);
  };

  const isItemVisible = (item: NavItem) => {
    if (!item.pageKey) return true;
    const isDevModePage = (DEV_MODE_PAGE_KEYS as readonly string[]).includes(item.pageKey);
    if (isDevModePage && devMode !== true) return false;
    if (item.pageKey === 'settings') return true;
    return !isHidden(item.pageKey as HiddenPageKey);
  };

  // Resolve customized home nav items (ensuring they are visible, fallback if not)
  let activeHomeNavItems = homeItemIds
    .map(id => ALL_NAV_ITEMS.find(item => item.id === id))
    .filter((item): item is NavItem => !!item && isItemVisible(item));

  // Limit to max 4 items
  activeHomeNavItems = activeHomeNavItems.slice(0, 4);

  // Pointer event handlers for custom drag and drop
  const handleItemPointerMove = (e: React.PointerEvent) => {
    if (!isEditing) {
      const dx = e.clientX - pointerStartPosRef.current.x;
      const dy = e.clientY - pointerStartPosRef.current.y;
      if (Math.sqrt(dx * dx + dy * dy) > 10) {
        if (longPressTimerRef.current) {
          clearTimeout(longPressTimerRef.current);
          longPressTimerRef.current = null;
        }
      }
    }
  };

  const handleItemPointerUp = () => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  };

  const handleItemPointerCancel = () => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  };

  const handleItemPointerDown = (item: NavItem) => (e: React.PointerEvent) => {
    if (e.button !== 0) return;

    if (isEditing) {
      e.preventDefault();

      const x = e.clientX;
      const y = e.clientY;
      pointerStartPosRef.current = { x, y };

      const rect = e.currentTarget.getBoundingClientRect();
      dragOffsetRef.current = {
        x: x - rect.left,
        y: y - rect.top,
      };

      setDraggedItem(item);
      setDragCurrentPos({ x, y });
    } else {
      const x = e.clientX;
      const y = e.clientY;
      pointerStartPosRef.current = { x, y };

      const rect = e.currentTarget.getBoundingClientRect();
      dragOffsetRef.current = {
        x: x - rect.left,
        y: y - rect.top,
      };

      longPressTimerRef.current = setTimeout(() => {
        if (navigator.vibrate) {
          try {
            navigator.vibrate(50);
          } catch (_) {}
        }
        setIsEditing(true);
        setDraggedItem(item);
        setDragCurrentPos({ x, y });
      }, 500);
    }
  };

  // Global window pointer/touch move and up handlers when dragging an item
  useEffect(() => {
    if (!draggedItem) return;

    const handleMove = (clientX: number, clientY: number) => {
      setDragCurrentPos({ x: clientX, y: clientY });

      const element = document.elementFromPoint(clientX, clientY);
      const slotElement = element?.closest('[data-slot-index]');
      if (slotElement) {
        const index = parseInt(slotElement.getAttribute('data-slot-index') || '', 10);
        setHoveredSlotIndex(index);
      } else {
        setHoveredSlotIndex(null);
      }
    };

    const handleGlobalPointerMove = (e: PointerEvent) => {
      if (e.pointerType === 'touch') return;
      handleMove(e.clientX, e.clientY);
    };

    const handleGlobalTouchMove = (e: TouchEvent) => {
      const touch = e.touches[0] || e.changedTouches[0];
      if (touch) {
        handleMove(touch.clientX, touch.clientY);
      }
    };

    const handleDrop = () => {
      if (longPressTimerRef.current) {
        clearTimeout(longPressTimerRef.current);
        longPressTimerRef.current = null;
      }

      if (hoveredSlotIndex !== null) {
        const currentHomeIds = activeHomeNavItems.map(item => item.id);
        const oldIndex = currentHomeIds.indexOf(draggedItem.id);
        
        let newIds = [...currentHomeIds];
        
        if (oldIndex !== -1) {
          if (hoveredSlotIndex < newIds.length) {
            const temp = newIds[hoveredSlotIndex];
            newIds[hoveredSlotIndex] = draggedItem.id;
            newIds[oldIndex] = temp;
          } else {
            newIds = newIds.filter(id => id !== draggedItem.id);
            newIds.push(draggedItem.id);
          }
        } else {
          if (hoveredSlotIndex < newIds.length) {
            newIds[hoveredSlotIndex] = draggedItem.id;
          } else {
            newIds.push(draggedItem.id);
          }
        }
        
        const uniqueIds = Array.from(new Set(newIds)).slice(0, 4);
        updateHomeItems(uniqueIds);
      }

      setDraggedItem(null);
      setHoveredSlotIndex(null);
    };

    window.addEventListener('pointermove', handleGlobalPointerMove);
    window.addEventListener('pointerup', handleDrop);
    window.addEventListener('pointercancel', handleDrop);

    window.addEventListener('touchmove', handleGlobalTouchMove, { passive: true });
    window.addEventListener('touchend', handleDrop);
    window.addEventListener('touchcancel', handleDrop);

    return () => {
      window.removeEventListener('pointermove', handleGlobalPointerMove);
      window.removeEventListener('pointerup', handleDrop);
      window.removeEventListener('pointercancel', handleDrop);

      window.removeEventListener('touchmove', handleGlobalTouchMove);
      window.removeEventListener('touchend', handleDrop);
      window.removeEventListener('touchcancel', handleDrop);
    };
  }, [draggedItem, hoveredSlotIndex, activeHomeNavItems]);

  const handleItemClick = (e: React.MouseEvent) => {
    if (isEditing) {
      e.preventDefault();
      e.stopPropagation();
    }
  };

  const handleRemoveSlot = (indexToRemove: number) => {
    if (activeHomeNavItems.length <= 1) return; // Keep at least 1 item
    const newIds = activeHomeNavItems
      .filter((_, idx) => idx !== indexToRemove)
      .map(item => item.id);
    updateHomeItems(newIds);
  };

  const getWiggleClass = (index: number) => {
    if (!isEditing) return '';
    return index % 2 === 0 ? 'animate-wiggle-even' : 'animate-wiggle-odd';
  };

  const backdropClasses = `fixed inset-0 z-30 bg-transparent transition-opacity duration-300 ${
    isOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
  }`;

  const drawerClasses = `fixed bottom-0 left-0 right-0 z-50 bg-sidebar/45 backdrop-blur-xl border-t border-sidebar-border/30 rounded-t-[2rem] px-6 py-4 transition-transform duration-300 ease-out shadow-[0_-8px_32px_rgba(0,0,0,0.15)] ${
    isOpen ? 'translate-y-0 pointer-events-auto' : 'translate-y-full pointer-events-none'
  }`;

  if (!mounted) return null;

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes wiggle {
          0% { transform: rotate(-1deg); }
          50% { transform: rotate(1deg); }
          100% { transform: rotate(-1deg); }
        }
        .animate-wiggle-even {
          animation: wiggle 0.28s ease-in-out infinite;
        }
        .animate-wiggle-odd {
          animation: wiggle 0.28s ease-in-out infinite;
          animation-delay: -0.14s;
        }
      ` }} />

      <nav
        className="fixed bottom-2 left-4 right-4 z-40 bg-sidebar/35 backdrop-blur-2xl border border-sidebar-border/25 flex items-center justify-around py-2 px-4 md:hidden shadow-[0_8px_32px_rgba(0,0,0,0.15)] rounded-full transition-colors duration-300 max-w-lg mx-auto"
        style={{
          bottom: 'calc(env(safe-area-inset-bottom) * 0.3 + 8px)',
        }}
      >
        {activeHomeNavItems.map((item) => {
          const Icon = item.icon;
          const active = pendingHref ? pendingHref === item.href : (isActive(item.href) && !isOpen);

          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setPendingHref(item.href)}
              onTouchStart={() => {}}
              className={`flex flex-col items-center justify-center p-3 rounded-full transition-all duration-200 active:scale-95 group border ${
                active
                  ? 'text-primary bg-primary/20 border-primary/25 shadow-[inset_0_1.5px_0_rgba(255,255,255,0.15),0_1.5px_3px_rgba(0,0,0,0.1)] font-semibold'
                  : 'text-sidebar-foreground/65 hover:text-sidebar-foreground hover:bg-sidebar-foreground/5 border-transparent'
              }`}
            >
              <Icon className="h-5 w-5 flex-shrink-0" />
            </Link>
          );
        })}

        {/* Hamburger Menu Toggle Button */}
        <button
          onClick={() => setIsOpen(!isOpen)}
          className={`flex flex-col items-center justify-center p-3 rounded-full transition-all duration-200 active:scale-95 group border ${
            isOpen
              ? 'text-primary bg-primary/20 border-primary/25 shadow-[inset_0_1.5px_0_rgba(255,255,255,0.15),0_1.5px_3px_rgba(0,0,0,0.1)] font-semibold'
              : 'text-sidebar-foreground/65 hover:text-sidebar-foreground hover:bg-sidebar-foreground/5 border-transparent'
          }`}
        >
          {isOpen ? <X className="h-5 w-5 flex-shrink-0" /> : <Menu className="h-5 w-5 flex-shrink-0" />}
        </button>
      </nav>

      {/* Slide-up Menu Drawer Backdrop */}
      <div className={backdropClasses} onClick={() => setIsOpen(false)} />

      {/* Slide-up Menu Drawer */}
      <div 
        className={drawerClasses} 
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        style={{ 
          paddingBottom: 'calc(env(safe-area-inset-bottom) + 16px)',
          transform: isOpen 
            ? `translateY(${dragOffset}px)` 
            : 'translateY(100%)',
          transition: isDragging ? 'none' : 'transform 300ms cubic-bezier(0.2, 0.8, 0.2, 1)',
          touchAction: 'none'
        }}
      >
        {/* Drag handle pill */}
        <div className="w-12 h-1 bg-muted-foreground/20 rounded-full mx-auto mb-4" />

        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <span className="text-sm font-semibold tracking-wide text-sidebar-foreground/80">Menu Settings</span>
          <button 
            onClick={() => setIsOpen(false)}
            className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* HOME Section at the top */}
        <div className="flex items-center justify-between mb-3 px-1">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/50">
            Home (Bottom Nav)
          </div>
          <button
            onClick={() => setIsEditing(!isEditing)}
            className="text-xs font-semibold px-2.5 py-0.5 rounded-full transition-all bg-primary/15 hover:bg-primary/25 text-primary border border-primary/20 active:scale-95 flex items-center gap-1 shadow-sm"
          >
            {isEditing ? 'Done' : 'Edit Layout'}
          </button>
        </div>
        <div className="grid grid-cols-4 gap-y-3 gap-x-2 mb-4 border border-sidebar-border/20 bg-sidebar-foreground/3 rounded-3xl p-3">
          {[0, 1, 2, 3].map((index) => {
            const item = activeHomeNavItems[index];
            const isHoveredSlot = hoveredSlotIndex === index;

            if (item) {
              const Icon = item.icon;
              const active = pendingHref ? pendingHref === item.href : (isActive(item.href) && !isOpen);
              const isCurrentlyDragged = draggedItem?.id === item.id;

              return (
                <div
                  key={`home-slot-${index}`}
                  data-slot-index={index}
                  className={`relative flex flex-col items-center gap-1.5 p-2 rounded-xl transition-all duration-200 ${
                    isHoveredSlot
                      ? 'bg-primary/10 border border-primary/30 scale-105 shadow-[0_0_8px_rgba(var(--primary-rgb),0.15)]'
                      : 'border border-transparent'
                  } ${getWiggleClass(index)}`}
                  style={{
                    opacity: isCurrentlyDragged ? 0.3 : 1,
                  }}
                >
                  <div
                    onPointerDown={handleItemPointerDown(item)}
                    onPointerMove={handleItemPointerMove}
                    onPointerUp={handleItemPointerUp}
                    onPointerCancel={handleItemPointerCancel}
                    onClick={handleItemClick}
                    className={`p-3 rounded-2xl relative transition-all duration-200 cursor-grab active:cursor-grabbing select-none ${
                      active 
                        ? 'bg-primary/20 text-primary' 
                        : 'bg-sidebar-foreground/8 text-sidebar-foreground/65'
                    }`}
                    style={{
                      touchAction: 'none'
                    }}
                  >
                    <Icon className="h-5 w-5 flex-shrink-0" />
                  </div>
                  
                  {isEditing && (
                    <button
                      type="button"
                      onPointerDown={(e) => e.stopPropagation()}
                      onMouseDown={(e) => e.stopPropagation()}
                      onClick={(e) => {
                        e.stopPropagation();
                        e.preventDefault();
                        handleRemoveSlot(index);
                      }}
                      className="absolute top-1 right-2 bg-destructive text-destructive-foreground rounded-full p-0.5 shadow-md active:scale-90 z-20 cursor-pointer"
                    >
                      <Minus className="h-3 w-3" />
                    </button>
                  )}

                  <span className={`text-[10px] tracking-wide text-center truncate w-full transition-colors select-none ${
                    active ? 'text-primary font-semibold' : 'text-sidebar-foreground/65'
                  }`}>{item.label}</span>
                </div>
              );
            } else {
              return (
                <div
                  key={`home-slot-empty-${index}`}
                  data-slot-index={index}
                  className={`relative flex flex-col items-center gap-1.5 p-2 rounded-xl border border-dashed transition-all duration-200 ${
                    isHoveredSlot
                      ? 'border-primary/50 bg-primary/10 scale-105'
                      : 'border-muted-foreground/20 bg-transparent'
                  }`}
                  style={{
                    touchAction: 'none'
                  }}
                >
                  <div
                    className="p-3 rounded-2xl flex items-center justify-center text-muted-foreground/30"
                    style={{
                      width: 46,
                      height: 46,
                    }}
                  >
                    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                    </svg>
                  </div>
                  <span className="text-[10px] tracking-wide text-center text-muted-foreground/30 select-none">
                    Empty
                  </span>
                </div>
              );
            }
          })}
        </div>

        {/* Separator */}
        <div className="my-3 border-t border-border/60" />

        {/* Finances Section */}
        <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/50 mb-3 px-1">
          Finances
        </div>
        <div className="grid grid-cols-4 gap-y-3 gap-x-2">
          {ALL_NAV_ITEMS.filter(item => item.category === 'finances' && isItemVisible(item)).map((item) => {
            const Icon = item.icon;
            const active = pendingHref ? pendingHref === item.href : isActive(item.href);
            const globalIndex = ALL_NAV_ITEMS.findIndex(i => i.id === item.id);
            const isCurrentlyDragged = draggedItem?.id === item.id;

            return (
              <Link
                key={item.href}
                href={item.href}
                draggable="false"
                onClick={(e) => {
                  if (isEditing) {
                    e.preventDefault();
                    e.stopPropagation();
                    return;
                  }
                  setPendingHref(item.href);
                  setIsOpen(false);
                }}
                onPointerDown={handleItemPointerDown(item)}
                onPointerMove={handleItemPointerMove}
                onPointerUp={handleItemPointerUp}
                onPointerCancel={handleItemPointerCancel}
                className={`flex flex-col items-center gap-1.5 p-2 rounded-xl transition-all duration-150 active:scale-95 group select-none cursor-grab ${
                  isEditing ? 'cursor-grab active:cursor-grabbing' : ''
                } ${getWiggleClass(globalIndex)}`}
                style={{
                  opacity: isCurrentlyDragged ? 0.3 : 1,
                  touchAction: isEditing ? 'none' : 'pan-y'
                }}
              >
                <div className={`p-3 rounded-2xl transition-colors ${
                  active ? 'bg-primary/20 text-primary' : 'bg-sidebar-foreground/8 group-hover:bg-sidebar-foreground/15 text-sidebar-foreground/65 group-hover:text-sidebar-foreground'
                }`}>
                  <Icon className="h-5 w-5 flex-shrink-0" />
                </div>
                <span className={`text-[10px] tracking-wide text-center truncate w-full transition-colors ${
                  active ? 'text-primary font-semibold' : 'text-sidebar-foreground/65 group-hover:text-sidebar-foreground'
                }`}>{item.label}</span>
              </Link>
            );
          })}
        </div>

        {/* Separator */}
        <div className="my-3 border-t border-border/60" />

        {/* Planning Section */}
        <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/50 mb-3 px-1">
          Planning
        </div>
        <div className="grid grid-cols-4 gap-y-3 gap-x-2">
          {ALL_NAV_ITEMS.filter(item => item.category === 'planning' && isItemVisible(item)).map((item) => {
            const Icon = item.icon;
            const active = pendingHref ? pendingHref === item.href : isActive(item.href);
            const globalIndex = ALL_NAV_ITEMS.findIndex(i => i.id === item.id);
            const isCurrentlyDragged = draggedItem?.id === item.id;

            return (
              <Link
                key={item.href}
                href={item.href}
                draggable="false"
                onClick={(e) => {
                  if (isEditing) {
                    e.preventDefault();
                    e.stopPropagation();
                    return;
                  }
                  setPendingHref(item.href);
                  setIsOpen(false);
                }}
                onPointerDown={handleItemPointerDown(item)}
                onPointerMove={handleItemPointerMove}
                onPointerUp={handleItemPointerUp}
                onPointerCancel={handleItemPointerCancel}
                className={`flex flex-col items-center gap-1.5 p-2 rounded-xl transition-all duration-150 active:scale-95 group select-none cursor-grab ${
                  isEditing ? 'cursor-grab active:cursor-grabbing' : ''
                } ${getWiggleClass(globalIndex)}`}
                style={{
                  opacity: isCurrentlyDragged ? 0.3 : 1,
                  touchAction: isEditing ? 'none' : 'pan-y'
                }}
              >
                <div className={`p-3 rounded-2xl transition-colors ${
                  active ? 'bg-primary/20 text-primary' : 'bg-sidebar-foreground/8 group-hover:bg-sidebar-foreground/15 text-sidebar-foreground/65 group-hover:text-sidebar-foreground'
                }`}>
                  <Icon className="h-5 w-5 flex-shrink-0" />
                </div>
                <span className={`text-[10px] tracking-wide text-center truncate w-full transition-colors ${
                  active ? 'text-primary font-semibold' : 'text-sidebar-foreground/65 group-hover:text-sidebar-foreground'
                }`}>{item.label}</span>
              </Link>
            );
          })}
        </div>
      </div>

      {/* Floating Dragged Item Preview */}
      {draggedItem && (
        <div
          className="fixed pointer-events-none z-[100] select-none scale-110 opacity-80 flex flex-col items-center gap-1.5 p-2 bg-sidebar border border-primary/30 rounded-2xl shadow-2xl"
          style={{
            left: dragCurrentPos.x - dragOffsetRef.current.x,
            top: dragCurrentPos.y - dragOffsetRef.current.y,
            width: 72,
            height: 72,
          }}
        >
          <div className="p-3 rounded-2xl bg-primary/20 text-primary">
            <draggedItem.icon className="h-5 w-5 flex-shrink-0" />
          </div>
        </div>
      )}
    </>
  );
}

