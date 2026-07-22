'use client';

import * as React from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

interface CollapsibleCardHeaderProps extends Omit<React.HTMLAttributes<HTMLDivElement>, 'title' | 'onToggle'> {
  isCollapsed?: boolean;
  onToggle?: (collapsed: boolean) => void;
  title?: React.ReactNode;
  description?: React.ReactNode;
  icon?: React.ElementType;
  actions?: React.ReactNode;
}

const CollapsibleCardHeader = React.forwardRef<HTMLDivElement, CollapsibleCardHeaderProps>(
  ({ isCollapsed = false, onToggle, title, description, icon: Icon, actions, className, children, ...props }, ref) => {
    const showActions = actions && !isCollapsed;

    return (
      <div
        ref={ref}
        className={cn(
          'flex sm:flex-row sm:items-center justify-between px-4 sm:px-6 transition-all duration-200',
          showActions ? 'flex-col gap-2.5 py-4' : 'flex-row gap-4 py-3',
          className
        )}
        {...props}
      >
        <div className="flex items-center justify-between w-full sm:w-auto gap-3 min-w-0">
          <div className="flex items-center gap-3 flex-1 min-w-0">
            {Icon && <Icon className="w-4 h-4 text-primary shrink-0" />}
            <div className="min-w-0 flex-1">
              {title && (
                typeof title === 'string' ? (
                  <h3 className="font-bold truncate text-foreground text-sm sm:text-base">{title}</h3>
                ) : (
                  <div className="min-w-0 flex-1 text-sm sm:text-base text-foreground font-bold">{title}</div>
                )
              )}
              {description && (
                <p className="text-xs text-muted-foreground font-normal leading-tight mt-0.5">{description}</p>
              )}
            </div>
            {children}
          </div>
          <button
            onClick={() => onToggle?.(!isCollapsed)}
            className="p-1 rounded hover:bg-accent transition-colors cursor-pointer shrink-0 text-muted-foreground hover:text-foreground sm:hidden"
            aria-label={isCollapsed ? 'Expand card' : 'Collapse card'}
            type="button"
          >
            <ChevronDown
              size={20}
              className={cn(
                'transition-transform duration-200',
                !isCollapsed && 'rotate-180'
              )}
            />
          </button>
        </div>

        <div
          className={cn(
            'items-center gap-3 justify-end flex-wrap sm:flex-nowrap',
            showActions ? 'flex w-full sm:w-auto' : 'hidden sm:flex sm:w-auto'
          )}
        >
          {showActions && (
            <div className="flex items-center gap-2 flex-wrap">
              {actions}
            </div>
          )}
          <button
            onClick={() => onToggle?.(!isCollapsed)}
            className="p-1 rounded hover:bg-accent transition-colors cursor-pointer shrink-0 text-muted-foreground hover:text-foreground hidden sm:block"
            aria-label={isCollapsed ? 'Expand card' : 'Collapse card'}
            type="button"
          >
            <ChevronDown
              size={20}
              className={cn(
                'transition-transform duration-200',
                !isCollapsed && 'rotate-180'
              )}
            />
          </button>
        </div>
      </div>
    );
  }
);

CollapsibleCardHeader.displayName = 'CollapsibleCardHeader';

export { CollapsibleCardHeader };
