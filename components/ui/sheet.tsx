'use client';

import * as React from 'react';
import * as SheetPrimitive from '@radix-ui/react-dialog';
import { cva, type VariantProps } from 'class-variance-authority';
import { X } from 'lucide-react';

const Sheet = SheetPrimitive.Root;
const SheetTrigger = SheetPrimitive.Trigger;
const SheetClose = SheetPrimitive.Close;

const SheetPortal = SheetPrimitive.Portal;

const SheetOverlay = React.forwardRef<
  React.ElementRef<typeof SheetPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof SheetPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <SheetPrimitive.Overlay
    className="fixed inset-0 z-50 bg-transparent data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0"
    {...props}
    ref={ref}
  />
));
SheetOverlay.displayName = SheetPrimitive.Overlay.displayName;

const sheetVariants = cva(
  'fixed z-50 gap-4 bg-card p-6 shadow-lg transition ease-in-out data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:duration-300 data-[state=open]:duration-500',
  {
    variants: {
      side: {
        top: 'inset-x-0 top-0 border-b border-border data-[state=closed]:slide-out-to-top data-[state=open]:slide-in-from-top',
        bottom: 'inset-x-0 bottom-0 border-t border-border data-[state=closed]:slide-out-to-bottom data-[state=open]:slide-in-from-bottom',
        left: 'inset-y-0 left-0 h-full w-full max-w-[420px] sm:max-w-sm border-r border-border data-[state=closed]:slide-out-to-left data-[state=open]:slide-in-from-left overflow-y-auto',
        right: 'inset-y-0 right-0 h-full w-full max-w-[420px] sm:max-w-sm border-l border-border data-[state=closed]:slide-out-to-right data-[state=open]:slide-in-from-right overflow-y-auto',
      },
    },
    defaultVariants: {
      side: 'right',
    },
  }
);

interface SheetContentProps
  extends React.ComponentPropsWithoutRef<typeof SheetPrimitive.Content>,
    VariantProps<typeof sheetVariants> {}

const SheetContent = React.forwardRef<
  React.ElementRef<typeof SheetPrimitive.Content>,
  SheetContentProps
>(({ side = 'right', className, children, onOpenAutoFocus, onCloseAutoFocus, ...props }, ref) => {
  const isSidePanel = side === 'left' || side === 'right';
  const isBottomMobileSheet = isSidePanel || side === 'bottom';
  const contentRef = React.useRef<React.ElementRef<typeof SheetPrimitive.Content> | null>(null);

  const mergedRef = React.useCallback(
    (node: React.ElementRef<typeof SheetPrimitive.Content> | null) => {
      contentRef.current = node;
      if (typeof ref === 'function') {
        ref(node);
      } else if (ref) {
        ref.current = node;
      }
    },
    [ref],
  );

  React.useEffect(() => {
    if (!isBottomMobileSheet || typeof window === 'undefined') return undefined;
    if (window.innerWidth >= 768) return undefined;

    const vv = window.visualViewport;
    let focusScrollTimer: number | null = null;
    let baselineHeight = Math.max(window.innerHeight, vv?.height ?? 0);
    let lastInnerWidth = window.innerWidth;

    const updateViewportVars = () => {
      const node = contentRef.current;
      if (!node || !vv) return;

      if (window.innerWidth !== lastInnerWidth) {
        lastInnerWidth = window.innerWidth;
        baselineHeight = Math.max(window.innerHeight, vv.height);
      } else if (vv.height > baselineHeight) {
        baselineHeight = vv.height;
      }

      const layoutHeight = window.innerHeight || document.documentElement.clientHeight;
      const bottomInset = Math.max(0, layoutHeight - (vv.offsetTop + vv.height));
      const heightShrink = Math.max(0, baselineHeight - vv.height);
      const keyboardVisible = bottomInset > 80 || heightShrink > 80;

      if (keyboardVisible) {
        node.style.setProperty('--sheet-vv-bottom', `${Math.round(bottomInset)}px`);
        node.style.setProperty(
          '--sheet-vv-max-height',
          `${Math.max(200, Math.floor(vv.height - 16))}px`,
        );
      } else {
        node.style.removeProperty('--sheet-vv-bottom');
        node.style.removeProperty('--sheet-vv-max-height');
      }
    };

    const handleFocusIn = (e: FocusEvent) => {
      const target = e.target;
      if (
        !(
          target instanceof HTMLInputElement ||
          target instanceof HTMLTextAreaElement ||
          target instanceof HTMLSelectElement
        )
      ) {
        return;
      }
      if (focusScrollTimer !== null) {
        window.clearTimeout(focusScrollTimer);
      }
      focusScrollTimer = window.setTimeout(() => {
        if (typeof target.scrollIntoView === 'function') {
          target.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        }
      }, 150);
    };

    updateViewportVars();
    vv?.addEventListener('resize', updateViewportVars);
    vv?.addEventListener('scroll', updateViewportVars);
    const node = contentRef.current;
    node?.addEventListener('focusin', handleFocusIn);

    return () => {
      vv?.removeEventListener('resize', updateViewportVars);
      vv?.removeEventListener('scroll', updateViewportVars);
      node?.removeEventListener('focusin', handleFocusIn);
      if (focusScrollTimer !== null) {
        window.clearTimeout(focusScrollTimer);
      }
      if (contentRef.current) {
        contentRef.current.style.removeProperty('--sheet-vv-bottom');
        contentRef.current.style.removeProperty('--sheet-vv-max-height');
      }
    };
  }, [isBottomMobileSheet]);

  const handleOpenAutoFocus = (event: Event) => {
    onOpenAutoFocus?.(event);
    if (event.defaultPrevented || typeof window === 'undefined') return;

    const isMobileViewport =
      window.innerWidth < 768 ||
      (typeof window.matchMedia === 'function' &&
        window.matchMedia('(pointer: coarse)').matches);

    if (isMobileViewport) {
      event.preventDefault();
      contentRef.current?.focus({ preventScroll: true });
    }
  };

  const handleCloseAutoFocus = (event: Event) => {
    if (typeof document !== 'undefined') {
      const active = document.activeElement;
      if (active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement) {
        active.blur();
      }
    }

    onCloseAutoFocus?.(event);
    if (event.defaultPrevented) return;

    if (typeof window !== 'undefined') {
      const isMobileViewport =
        window.innerWidth < 768 ||
        (typeof window.matchMedia === 'function' &&
          window.matchMedia('(pointer: coarse)').matches);

      if (isMobileViewport) {
        event.preventDefault();
      }
    }
  };

  return (
    <SheetPortal>
      <SheetOverlay />
      <SheetPrimitive.Content
        ref={mergedRef}
        tabIndex={-1}
        onOpenAutoFocus={handleOpenAutoFocus}
        onCloseAutoFocus={handleCloseAutoFocus}
        className={`${isSidePanel ? 'sheet-mobile-bottom' : ''} ${side === 'bottom' ? 'sheet-bottom-mobile' : ''} focus:outline-none ${sheetVariants({ side, className })}`}
        {...props}
      >
        {/* Drag handle — visible on mobile for side panels that become bottom sheets */}
        {isSidePanel && (
          <div className="w-10 h-1 bg-muted-foreground/20 rounded-full mx-auto mb-3 md:hidden flex-shrink-0" />
        )}
        {children}
        <SheetPrimitive.Close className="absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none">
          <X className="h-4 w-4 text-muted-foreground" />
          <span className="sr-only">Close</span>
        </SheetPrimitive.Close>
      </SheetPrimitive.Content>
    </SheetPortal>
  );
});
SheetContent.displayName = SheetPrimitive.Content.displayName;

const SheetHeader = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className="flex flex-col space-y-2 text-center sm:text-left" {...props} />
);
SheetHeader.displayName = 'SheetHeader';

const SheetFooter = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className="flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2" {...props} />
);
SheetFooter.displayName = 'SheetFooter';

const SheetTitle = React.forwardRef<
  React.ElementRef<typeof SheetPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof SheetPrimitive.Title>
>(({ className, ...props }, ref) => (
  <SheetPrimitive.Title
    ref={ref}
    className="text-lg font-semibold text-foreground"
    {...props}
  />
));
SheetTitle.displayName = SheetPrimitive.Title.displayName;

const SheetDescription = React.forwardRef<
  React.ElementRef<typeof SheetPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof SheetPrimitive.Description>
>(({ className, ...props }, ref) => (
  <SheetPrimitive.Description
    ref={ref}
    className="text-sm text-muted-foreground"
    {...props}
  />
));
SheetDescription.displayName = SheetPrimitive.Description.displayName;

export {
  Sheet,
  SheetPortal,
  SheetOverlay,
  SheetTrigger,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetFooter,
  SheetTitle,
  SheetDescription,
};
