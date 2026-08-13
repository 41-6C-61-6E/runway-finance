'use client';

import React, { useState } from 'react';
import {
  Calendar,
  ListFilter,
  Plus,
  Tv,
  Zap,
  Briefcase,
  Layers,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { UpcomingTimelineView } from './UpcomingTimelineView';
import { RecurringManagerTable } from './RecurringManagerTable';
import { RecurringStreamDrawer } from './RecurringStreamDrawer';
import type { RecurringStreamItem, Account } from '../account-types';

interface RecurringStreamsHubProps {
  streams: RecurringStreamItem[];
  accounts: Account[];
  onSaveStream: (data: Partial<RecurringStreamItem>) => Promise<void>;
  onToggleActive: (stream: RecurringStreamItem) => Promise<void>;
  onDeleteStream: (stream: RecurringStreamItem) => Promise<void>;
  accountNames?: Record<string, string>;
}

type SubView = 'timeline' | 'manager';

export function RecurringStreamsHub({
  streams,
  accounts,
  onSaveStream,
  onToggleActive,
  onDeleteStream,
  accountNames = {},
}: RecurringStreamsHubProps) {
  const [activeSubView, setActiveSubView] = useState<SubView>('timeline');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selectedStream, setSelectedStream] = useState<RecurringStreamItem | null>(null);

  const handleOpenAdd = () => {
    setSelectedStream(null);
    setDrawerOpen(true);
  };

  const handleOpenEdit = (stream: RecurringStreamItem) => {
    setSelectedStream(stream);
    setDrawerOpen(true);
  };

  return (
    <Card className="border-border/50 bg-card/60 backdrop-blur-sm shadow-xs overflow-hidden">
      {/* ── Sub-view Header & Switcher ── */}
      <div className="p-4 sm:p-5 border-b border-border/40 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
            <Calendar className="w-4 h-4" />
          </div>
          <div>
            <h3 className="font-semibold text-sm sm:text-base text-foreground">
              Bills, Subscriptions & Salary Schedule
            </h3>
          </div>
        </div>

        {/* Sub-view Switcher & Add Button */}
        <div className="flex items-center gap-2">
          <div className="inline-flex items-center p-0.5 rounded-lg bg-muted/60 border border-border/40 text-xs">
            <button
              onClick={() => setActiveSubView('timeline')}
              className={`px-3 py-1 rounded-md font-medium transition-all ${
                activeSubView === 'timeline'
                  ? 'bg-background text-foreground shadow-xs font-semibold'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              Timeline Feed
            </button>
            <button
              onClick={() => setActiveSubView('manager')}
              className={`px-3 py-1 rounded-md font-medium transition-all ${
                activeSubView === 'manager'
                  ? 'bg-background text-foreground shadow-xs font-semibold'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              Stream Manager
            </button>
          </div>

          <Button size="sm" onClick={handleOpenAdd} className="h-8 text-xs gap-1.5 shrink-0">
            <Plus className="w-3.5 h-3.5" />
            <span>Add Item</span>
          </Button>
        </div>
      </div>

      <CardContent className="p-4 sm:p-5">
        {activeSubView === 'timeline' ? (
          <UpcomingTimelineView
            streams={streams}
            onEditStream={handleOpenEdit}
            onToggleActive={onToggleActive}
            accountNames={accountNames}
          />
        ) : (
          <RecurringManagerTable
            streams={streams}
            onEditStream={handleOpenEdit}
            onToggleActive={onToggleActive}
            onDeleteStream={onDeleteStream}
            onAddStream={handleOpenAdd}
            accountNames={accountNames}
          />
        )}
      </CardContent>

      {/* Edit / Create Drawer Modal */}
      <RecurringStreamDrawer
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        stream={selectedStream}
        accounts={accounts}
        onSave={onSaveStream}
      />
    </Card>
  );
}
