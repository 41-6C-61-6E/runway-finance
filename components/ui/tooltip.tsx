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

  // App-wide mobile touch listener to dismiss open tooltips when tapping anywhere
  React.useEffect(() => {
    if (!open) return;

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

const TooltipTrigger = TooltipPrimitive.Trigger;

const TooltipContent = React.forwardRef<
  React.ElementRef<typeof TooltipPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Content>
>(({ className, sideOffset = 6, collisionPadding = 16, onClick, onPointerDown, ...props }, ref) => {
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
        collisionPadding={collisionPadding}
        onClick={handleClick}
        onPointerDown={handlePointerDown}
        onPointerDownOutside={(e) => {
          props.onPointerDownOutside?.(e);
          setOpen(false);
        }}
        className={cn(
          "z-[100] max-w-xs overflow-hidden rounded-xl border border-border bg-popover px-3 py-2 text-xs font-medium text-popover-foreground shadow-xl cursor-pointer select-none animate-in fade-in-0 zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[side=bottom]:slide-in-from-top-1 data-[side=left]:slide-in-from-right-1 data-[side=right]:slide-in-from-left-1 data-[side=top]:slide-in-from-bottom-1",
          className
        )}
        {...props}
      />
    </TooltipPrimitive.Portal>
  );
});
TooltipContent.displayName = TooltipPrimitive.Content.displayName;

export { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider };
