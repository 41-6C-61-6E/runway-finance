'use client';

import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { LucideIcon, Plus } from 'lucide-react';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

export const actionButtonVariants = cva(
  'inline-flex items-center justify-center font-medium transition-all shrink-0 cursor-pointer select-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 disabled:opacity-50 disabled:pointer-events-none',
  {
    variants: {
      variant: {
        // Refined aesthetic matching the Budgets card Add button
        default: 'text-foreground bg-accent hover:bg-accent/80 border border-border/80',
        primary: 'bg-primary text-primary-foreground hover:bg-primary/90 border border-transparent shadow-xs',
        outline: 'text-muted-foreground hover:text-foreground bg-transparent hover:bg-accent border border-border',
        ghost: 'text-muted-foreground hover:text-foreground hover:bg-accent border border-transparent',
      },
      size: {
        default: 'h-8 px-2.5 sm:px-3 text-xs rounded-lg gap-1.5',
        sm: 'h-8 px-2.5 text-xs rounded-lg gap-1',
        xs: 'h-7 px-2 text-[11px] rounded-md gap-1',
        lg: 'h-9 px-3.5 text-xs rounded-lg gap-1.5',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  }
);

export interface ActionButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof actionButtonVariants> {
  asChild?: boolean;
  /**
   * Optional icon component to render (e.g. Plus, Sliders, Play).
   */
  icon?: LucideIcon | React.ComponentType<{ className?: string }>;
  /**
   * Position of the icon relative to button content.
   * Defaults to 'left'. Set to 'right' to place icon after label (like Budgets card `Add +`).
   */
  iconPosition?: 'left' | 'right';
  /**
   * Optional tooltip text or element. If provided, the button is wrapped in a Tooltip.
   */
  tooltip?: React.ReactNode;
  /**
   * Side to display the tooltip on. Defaults to 'bottom'.
   */
  tooltipSide?: 'top' | 'bottom' | 'left' | 'right';
  /**
   * Optional className for the tooltip content popup.
   */
  tooltipClassName?: string;
}

export const ActionButton = React.forwardRef<HTMLButtonElement, ActionButtonProps>(
  (
    {
      className,
      variant,
      size,
      asChild = false,
      icon: Icon,
      iconPosition = 'left',
      tooltip,
      tooltipSide = 'bottom',
      tooltipClassName,
      children,
      type = 'button',
      ...props
    },
    ref
  ) => {
    const Comp = asChild ? Slot : 'button';

    const iconElement = Icon ? (
      <Icon className="w-3.5 h-3.5 shrink-0" />
    ) : null;

    // In asChild mode the caller's element (e.g. a Next.js Link) IS the slotted
    // content. Radix Slot only merges props into a single element child, so in
    // that mode the button's own icon/label markup is skipped — embed any icon
    // you need inside the child element itself.
    const buttonContent = asChild ? children : (
      <>
        {iconPosition === 'left' && iconElement}
        {children !== undefined && children !== null && (
          typeof children === 'string' ? <span>{children}</span> : children
        )}
        {iconPosition === 'right' && iconElement}
      </>
    );

    const button = (
      <Comp
        ref={ref}
        type={asChild ? undefined : type}
        className={cn(actionButtonVariants({ variant, size, className }))}
        {...props}
      >
        {buttonContent}
      </Comp>
    );

    if (tooltip) {
      return (
        <Tooltip>
          <TooltipTrigger asChild>{button}</TooltipTrigger>
          <TooltipContent side={tooltipSide} className={cn('text-xs', tooltipClassName)}>
            {tooltip}
          </TooltipContent>
        </Tooltip>
      );
    }

    return button;
  }
);

ActionButton.displayName = 'ActionButton';

/**
 * Convenience wrapper pre-configured with the Plus icon.
 */
export const AddButton = React.forwardRef<HTMLButtonElement, ActionButtonProps>(
  ({ icon = Plus, children = 'Add', ...props }, ref) => (
    <ActionButton ref={ref} icon={icon} {...props}>
      {children}
    </ActionButton>
  )
);

AddButton.displayName = 'AddButton';
