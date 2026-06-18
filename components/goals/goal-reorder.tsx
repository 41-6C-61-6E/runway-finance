'use client';

import { useState, useCallback, useRef } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { CollapsibleCardHeader } from '@/components/ui/collapsible-card-header';
import { useCardCollapsed } from '@/lib/hooks/use-card-collapsed';
import { GripVertical, Save, X, ArrowUp, ArrowDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { apiFetch } from '@/lib/utils/api-client';

interface GoalForReorder {
  id: string;
  name: string;
  sortOrder: number;
  status: string;
  linkedAccountId: string | null;
}

interface GoalReorderProps {
  goals: GoalForReorder[];
  accountId?: string;
  onReorder?: () => void;
}

export function GoalReorder({ goals: initialGoals, accountId, onReorder }: GoalReorderProps) {
  const [collapsed, setCollapsed] = useCardCollapsed('goalReorder');
  const [goals, setGoals] = useState<GoalForReorder[]>(
    [...initialGoals].sort((a, b) => a.sortOrder - b.sortOrder)
  );
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [hasChanges, setHasChanges] = useState(false);
  const dragIndexRef = useRef<number | null>(null);

  // Keep ref in sync with state
  dragIndexRef.current = dragIndex;

  const filteredGoals = accountId
    ? goals.filter((g) => g.linkedAccountId === accountId)
    : goals;

  const handleDragStart = useCallback((index: number) => {
    dragIndexRef.current = index;
    setDragIndex(index);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent, newIndex: number) => {
    e.preventDefault();
    e.stopPropagation();
    const currentDragIndex = dragIndexRef.current;
    if (currentDragIndex === null || currentDragIndex === newIndex) return;

    setGoals((prev) => {
      const slice = accountId
        ? prev.filter((g) => g.linkedAccountId === accountId)
        : [...prev];
      
      const [draggedItem] = slice.splice(currentDragIndex, 1);
      slice.splice(newIndex, 0, draggedItem);
      
      if (accountId) {
        let sliceIdx = 0;
        return prev.map((g) => {
          if (g.linkedAccountId === accountId) {
            return slice[sliceIdx++];
          }
          return g;
        });
      }
      return slice;
    });
    dragIndexRef.current = newIndex;
    setDragIndex(newIndex);
    setHasChanges(true);
  }, [accountId]);

  const handleDragEnd = useCallback(() => {
    dragIndexRef.current = null;
    setDragIndex(null);
  }, []);

  const moveUp = useCallback((index: number) => {
    if (index === 0) return;
    setGoals((prev) => {
      const slice = accountId
        ? prev.filter((g) => g.linkedAccountId === accountId)
        : [...prev];
      if (index <= 0 || index >= slice.length) return prev;
      [slice[index - 1], slice[index]] = [slice[index], slice[index - 1]];
      if (accountId) {
        let sliceIdx = 0;
        return prev.map((g) => {
          if (g.linkedAccountId === accountId) {
            return slice[sliceIdx++];
          }
          return g;
        });
      }
      return slice;
    });
    setHasChanges(true);
  }, [accountId]);

  const moveDown = useCallback((index: number) => {
    setGoals((prev) => {
      const slice = accountId
        ? prev.filter((g) => g.linkedAccountId === accountId)
        : [...prev];
      if (index >= slice.length - 1) return prev;
      [slice[index], slice[index + 1]] = [slice[index + 1], slice[index]];
      if (accountId) {
        let sliceIdx = 0;
        return prev.map((g) => {
          if (g.linkedAccountId === accountId) {
            return slice[sliceIdx++];
          }
          return g;
        });
      }
      return slice;
    });
    setHasChanges(true);
  }, [accountId]);

  const handleSave = async () => {
    try {
      const updates = filteredGoals.map((goal, index) => ({
        id: goal.id,
        sortOrder: index,
      }));

      await apiFetch('/api/goals/bulk-reorder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ updates }),
      });

      setHasChanges(false);
      toast.success('Goal order updated');
      onReorder?.();
    } catch (err) {
      toast.error('Failed to update goal order');
      console.error('Failed to save goal order reorder:', err);
    }
  };

  const handleCancel = () => {
    setGoals((prev) =>
      [...initialGoals].sort((a, b) => a.sortOrder - b.sortOrder)
    );
    setHasChanges(false);
  };

  if (filteredGoals.length <= 1) {
    return null;
  }

  return (
    <Card>
      <CollapsibleCardHeader
        isCollapsed={collapsed}
        onToggle={setCollapsed}
        title={
          <div className="flex items-center gap-2">
            <GripVertical className="w-4 h-4 text-primary shrink-0" />
            <span>Goal Priority Order</span>
            {hasChanges && (
              <span className="text-xs text-amber-500 ml-2">(unsaved changes)</span>
            )}
          </div>
        }
      />
      {!collapsed && (
        <CardContent>
          <p className="text-xs text-muted-foreground mb-4">
            Drag to reorder or use arrows. Goals higher in the list get allocated funds first.
          </p>

          <div className="space-y-2">
            {filteredGoals.map((goal, index) => (
              <div
                key={goal.id}
                draggable
                onDragStart={() => handleDragStart(index)}
                onDragOver={(e) => handleDragOver(e, index)}
                onDragEnd={handleDragEnd}
                className={`flex items-center gap-3 p-3 rounded-lg border border-border bg-card cursor-grab active:cursor-grabbing transition-all ${
                  dragIndex === index ? 'opacity-50' : 'opacity-100'
                }`}
              >
                <GripVertical className="w-4 h-4 text-muted-foreground shrink-0" />
                
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">#{index + 1}</span>
                    <span className="text-sm font-medium truncate">{goal.name}</span>
                    {goal.status === 'completed' && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-status-positive/20 text-status-positive">
                        Done
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-[10px] text-muted-foreground">
                      Order: #{goal.sortOrder}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="w-6 h-6 p-0"
                    onClick={() => moveUp(index)}
                    disabled={index === 0}
                  >
                    <ArrowUp className="w-3 h-3" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="w-6 h-6 p-0"
                    onClick={() => moveDown(index)}
                    disabled={index === filteredGoals.length - 1}
                  >
                    <ArrowDown className="w-3 h-3" />
                  </Button>
                </div>
              </div>
            ))}
          </div>

          {hasChanges && (
            <div className="flex items-center justify-end gap-2 mt-4 pt-4 border-t border-border">
              <Button variant="outline" size="sm" onClick={handleCancel}>
                <X className="w-3 h-3 mr-1" />
                Cancel
              </Button>
              <Button size="sm" onClick={handleSave}>
                <Save className="w-3 h-3 mr-1" />
                Save Order
              </Button>
            </div>
          )}
        </CardContent>
      )}
    </Card>
  );
}
