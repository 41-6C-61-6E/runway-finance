'use client';

import * as React from 'react';
import * as TooltipPrimitive from '@radix-ui/react-tooltip';
import { cn } from '@/lib/utils';

interface TooltipContextType {
  open: boolean;
  setOpen: (open: boolean) => void;
  isMobile: boolean;
}

const TooltipContext = React.createContext<TooltipContextType>({
  open: false,
  setOpen: () => {},
  isMobile: false,
});

const TooltipProvider = TooltipPrimitive.Provider;

function useIsMobileOrTouch() {
  const [isMobile, setIsMobile] = React.useState(false);

  React.useEffect(() => {
    const check = () => {
      setIsMobile(
        typeof window !== 'undefined' &&
        (window.innerWidth < 768 || (typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches) || 'ontouchstart' in window)
      );
    };
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  return isMobile;
}

function Tooltip({
  open: controlledOpen,
  onOpenChange,
  children,
  ...props
}: React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Root>) {
  const isMobile = useIsMobileOrTouch();
  const [uncontrolledOpen, setUncontrolledOpen] = React.useState(false);
  const isControlled = controlledOpen !== undefined;
  // On mobile (< 768px) and touch devices, tooltips are NEVER open
  const open = isMobile ? false : (isControlled ? controlledOpen : uncontrolledOpen);

  const handleOpenChange = React.useCallback((nextOpen: boolean) => {
    if (isMobile) {
      return;
    }
    if (!isControlled) {
      setUncontrolledOpen(nextOpen);
    }
    onOpenChange?.(nextOpen);
  }, [isControlled, isMobile, onOpenChange]);

  const setOpen = React.useCallback((nextOpen: boolean) => {
    handleOpenChange(nextOpen);
  }, [handleOpenChange]);

  // App-wide mobile touch listener to dismiss open tooltips when tapping anywhere or scrolling
  React.useEffect(() => {
    if (!open) return;

    const handleGlobalScroll = () => {
      setOpen(false);
    };

    window.addEventListener('scroll', handleGlobalScroll, { passive: true, capture: true });

    const timer = setTimeout(() => {
      const handleGlobalDismiss = () => {
        setOpen(false);
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
      <TooltipContext.Provider value={{ open, setOpen, isMobile }}>
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
  const { setOpen, isMobile } = React.useContext(TooltipContext);

  const handleClick = (e: React.MouseEvent<HTMLElement>) => {
    if (isMobile) {
      setOpen(false);
    }
    onClick?.(e as any);
  };

  const handleTouchStart = (e: React.TouchEvent<HTMLElement>) => {
    onTouchStart?.(e as any);
    if (isMobile) {
      setOpen(false);
    }
  };

  return (
    <TooltipPrimitive.Trigger
      ref={ref}
      onTouchStart={handleTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      onClick={handleClick}
      {...props}
    />
  );
});
TooltipTrigger.displayName = TooltipPrimitive.Trigger.displayName;

const TooltipContent = React.forwardRef<
  React.ElementRef<typeof TooltipPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Content>
>(({ className, sideOffset = 6, collisionPadding = 12, onClick, onPointerDown, ...props }, ref) => {
  const { setOpen, isMobile } = React.useContext(TooltipContext);

  // In mobile views (< 768px) and touch devices, never render any tooltip content
  if (isMobile) {
    return null;
  }

  const handleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    onClick?.(e);
    setOpen(false);
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    onPointerDown?.(e);
    setOpen(false);
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
          "hidden md:block [@media(hover:hover)]:block z-[100] max-w-[calc(100vw-24px)] sm:max-w-xs overflow-hidden rounded-xl border border-border bg-popover px-3 py-2 text-xs font-medium text-popover-foreground shadow-xl cursor-pointer select-none animate-in fade-in-0 zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[side=bottom]:slide-in-from-top-1 data-[side=left]:slide-in-from-right-1 data-[side=right]:slide-in-from-left-1 data-[side=top]:slide-in-from-bottom-1 break-words",
          className
        )}
        {...props}
      />
    </TooltipPrimitive.Portal>
  );
});
TooltipContent.displayName = TooltipPrimitive.Content.displayName;

export { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider };
