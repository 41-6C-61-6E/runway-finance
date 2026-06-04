'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';
import { useCardCollapsed } from '@/lib/hooks/use-card-collapsed';
import { Card } from './card';
import { CollapsibleCardHeader } from './collapsible-card-header';

const CollapsibleCard = React.forwardRef<HTMLDivElement, Omit<React.HTMLAttributes<HTMLDivElement>, 'title'> & {
  cardId: string;
  title: React.ReactNode;
  children: React.ReactNode;
  actions?: React.ReactNode;
}>(
  ({ cardId, title, children, actions, className, ...props }, ref) => {
    const [isCollapsed, setIsCollapsed] = useCardCollapsed(cardId);

    return (
      <Card ref={ref} className={cn('overflow-hidden', className)} {...props}>
        <CollapsibleCardHeader
          isCollapsed={isCollapsed}
          onToggle={setIsCollapsed}
          title={title}
          actions={actions}
        />
        {!isCollapsed && (
          <div className="px-6 py-4">
            {children}
          </div>
        )}
      </Card>
    );
  }
);

CollapsibleCard.displayName = 'CollapsibleCard';

export { CollapsibleCard };
