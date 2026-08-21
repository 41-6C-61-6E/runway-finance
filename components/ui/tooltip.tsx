'use client';

import * as React from 'react';
import * as TooltipPrimitive from '@radix-ui/react-tooltip';

import { cn } from '@/lib/utils';

interface TooltipContextType {
  open: boolean;
  setOpen: (open: boolean) => void;
}

const TooltipContext = React.createContext<TooltipContextType>({
  open: false,
  setOpen: () => {},
});

const TooltipProvider = TooltipPrimitive.Provider;

function Tooltip({
  open: controlledOpen,
  onOpenChange,
  children,
  ...props
}: React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Root>) {
  const [uncontrolledOpen, setUncontrolledOpen] = React.useState(false);
  const isControlled = controlledOpen !== undefined;
  const open = isControlled ? controlledOpen : uncontrolledOpen;

  const handleOpenChange = React.useCallback((nextOpen: boolean) => {
    if (!isControlled) {
      setUncontrolledOpen(nextOpen);
    }
    onOpenChange?.(nextOpen);
  }, [isControlled, onOpenChange]);

  const setOpen = React.useCallback((nextOpen: boolean) => {
    handleOpenChange(nextOpen);
  }, [handleOpenChange]);

  // App-wide mobile touch listener to dismiss open tooltips when tapping anywhere or scrolling
  React.useEffect(() => {
    if (!open) return;

    const handleGlobalScroll = () => {
      if (typeof window !== 'undefined' && (window.innerWidth < 768 || 'ontouchstart' in window)) {
        setOpen(false);
      }
    };

    window.addEventListener('scroll', handleGlobalScroll, { passive: true, capture: true });

    const timer = setTimeout(() => {
      const handleGlobalDismiss = () => {
        if (typeof window !== 'undefined' && (window.innerWidth < 768 || 'ontouchstart' in window)) {
          setOpen(false);
        }
      };

      window.addEventListener('pointerdown', handleGlobalDismiss, { capture: true, once: true });
      window.addEventListener('touchstart', handleGlobalDismiss, { capture: true, once: true });
    }, 50);

    return () => {
      clearTimeout(timer);
      window.removeEventListener('scroll', handleGlobalScroll, true);
    };
  }, [open, setOpen]);

  return (
    <TooltipPrimitive.Provider delayDuration={200}>
      <TooltipContext.Provider value={{ open, setOpen }}>
        <TooltipPrimitive.Root open={open} onOpenChange={handleOpenChange} {...props}>
          {children}
        </TooltipPrimitive.Root>
      </TooltipContext.Provider>
    </TooltipPrimitive.Provider>
  );
}

const TooltipTrigger = React.forwardRef<
  React.ElementRef<typeof TooltipPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Trigger>
>(({ onTouchStart, onTouchMove, onTouchEnd, onClick, ...props }, ref) => {
  const { open, setOpen } = React.useContext(TooltipContext);
  const touchStartRef = React.useRef<{ x: number; y: number; time: number } | null>(null);
  const isDraggingRef = React.useRef(false);

  const handleTouchStart = (e: React.TouchEvent<HTMLElement>) => {
    onTouchStart?.(e as any);
    if (e.touches.length !== 1) return;
    const touch = e.touches[0];
    touchStartRef.current = { x: touch.clientX, y: touch.clientY, time: Date.now() };
    isDraggingRef.current = false;
  };

  const handleTouchMove = (e: React.TouchEvent<HTMLElement>) => {
    onTouchMove?.(e as any);
    if (!touchStartRef.current || e.touches.length !== 1) return;
    const touch = e.touches[0];
    const dx = touch.clientX - touchStartRef.current.x;
    const dy = touch.clientY - touchStartRef.current.y;
    if (Math.hypot(dx, dy) > 8) {
      isDraggingRef.current = true;
    }
  };

  const handleTouchEnd = (e: React.TouchEvent<HTMLElement>) => {
    onTouchEnd?.(e as any);
    if (!touchStartRef.current) return;
    const elapsed = Date.now() - touchStartRef.current.time;
    const wasDragging = isDraggingRef.current;
    touchStartRef.current = null;
    isDraggingRef.current = false;

    // If user dragged to scroll, don't toggle tooltip
    if (wasDragging) return;

    // Short tap (< 300ms) toggles tooltip on mobile
    if (elapsed < 300 && typeof window !== 'undefined' && (window.innerWidth < 768 || 'ontouchstart' in window)) {
      setOpen(!open);
    }
  };

  return (
    <TooltipPrimitive.Trigger
      ref={ref}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onClick={onClick}
      {...props}
    />
  );
});
TooltipTrigger.displayName = TooltipPrimitive.Trigger.displayName;

const TooltipContent = React.forwardRef<
  React.ElementRef<typeof TooltipPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Content>
>(({ className, sideOffset = 6, collisionPadding = 12, onClick, onPointerDown, ...props }, ref) => {
  const { setOpen } = React.useContext(TooltipContext);

  const handleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    onClick?.(e);
    // Clicking/tapping directly on an open tooltip clears it immediately
    setOpen(false);
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    onPointerDown?.(e);
    // On mobile touch view, pointerdown directly on tooltip content dismisses it immediately
    if (typeof window !== 'undefined' && (window.innerWidth < 768 || e.pointerType === 'touch')) {
      setOpen(false);
    }
  };

  return (
    <TooltipPrimitive.Portal>
      <TooltipPrimitive.Content
        ref={ref}
        sideOffset={sideOffset}
        avoidCollisions={true}
        collisionPadding={collisionPadding}
        onClick={handleClick}
        onPointerDown={handlePointerDown}
        onPointerDownOutside={(e) => {
          props.onPointerDownOutside?.(e);
          setOpen(false);
        }}
        className={cn(
          "z-[100] max-w-[calc(100vw-24px)] sm:max-w-xs overflow-hidden rounded-xl border border-border bg-popover px-3 py-2 text-xs font-medium text-popover-foreground shadow-xl cursor-pointer select-none animate-in fade-in-0 zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[side=bottom]:slide-in-from-top-1 data-[side=left]:slide-in-from-right-1 data-[side=right]:slide-in-from-left-1 data-[side=top]:slide-in-from-bottom-1 break-words",
          className
        )}
        {...props}
      />
    </TooltipPrimitive.Portal>
  );
});
TooltipContent.displayName = TooltipPrimitive.Content.displayName;

export { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider };
