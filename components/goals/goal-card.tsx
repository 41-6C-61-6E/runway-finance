'use client';

import { useState } from 'react';
import { GoalProgressRing } from './goal-progress-ring';
import { GoalTypeIcon } from './goal-type-icon';
import { formatCurrency, getDaysRemaining, calcMonthlySavings } from '@/lib/utils/goals';
import { cn } from '@/lib/utils';
import { CheckCircle2, Target, AlertCircle, GripVertical, ArrowUp, ArrowDown } from 'lucide-react';

interface Goal {
  id: string;
  name: string;
  description: string | null;
  type: string;
  targetAmount: string;
  currentAmount: string;
  allocatedAmount?: number;
  isUnderfunded?: boolean;
  accountBalance?: number | null;
  accountName?: string | null;
  remainingOnAccount?: number | null;
  sortOrder?: number;
  targetDate: string | null;
  category: { id: string; name: string; color: string } | string | null;
  tags?: Array<{ id: string; name: string; color: string }>;
  status: string;
  linkedAccountId: string | null;
  percentage: string;
  reserve: string;
  createdAt: string;
  updatedAt: string;
}

interface GoalProjection {
  projectedFundDate: string | null;
  monthsToFund: number | null;
  isFunded: boolean;
  willFund: boolean;
}

interface GoalCardProps {
  goal: Goal;
  onEdit: (goal: Goal) => void;
  onDelete: (id: string) => void;
  percentage?: number;
  reserve?: number;
  projection?: GoalProjection | null;
  showReorderControls?: boolean;
  isFirst?: boolean;
  isLast?: boolean;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
  onDragHandleActive?: (active: boolean) => void;
  priorityIndex?: number;
}

function getStatusBadge(status: string) {
  switch (status) {
    case 'completed':
      return (
        <span 
          className="goal-pill px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider"
          style={{ '--goal-color': 'var(--status-positive)' } as React.CSSProperties}
        >
          Done
        </span>
      );
    case 'paused':
      return (
        <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-muted text-muted-foreground border border-border/50 uppercase tracking-wider">
          Paused
        </span>
      );
    case 'pending':
      return (
        <span 
          className="goal-pill px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider"
          style={{ '--goal-color': 'var(--chart-2)' } as React.CSSProperties}
        >
          Pending
        </span>
      );
    default:
      return (
        <span 
          className="goal-pill px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider"
          style={{ '--goal-color': 'var(--chart-3)' } as React.CSSProperties}
        >
          Active
        </span>
      );
  }
}

function formatProjectedDate(dateStr: string | null): string | null {
  if (!dateStr) return null;
  const d = new Date(dateStr + '-01');
  return d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
}

export function GoalCard({ 
  goal, 
  onEdit, 
  onDelete, 
  percentage, 
  reserve, 
  projection,
  showReorderControls = false,
  isFirst = false,
  isLast = false,
  onMoveUp,
  onMoveDown,
  onDragHandleActive,
  priorityIndex
}: GoalCardProps) {
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const target = parseFloat(goal.targetAmount);
  // Use allocatedAmount for linked accounts (considers priority allocation), fall back to currentAmount
  const current = parseFloat(goal.allocatedAmount?.toString() ?? goal.currentAmount);
  const progress = target > 0 ? Math.min((current / target) * 100, 100) : 0;
  const barColor = progress >= 75 ? 'bg-chart-1' :
                   progress >= 50 ? 'bg-chart-3' :
                   progress >= 25 ? 'bg-status-warning' : 'bg-destructive';
  const barBg = progress >= 75 ? 'bg-chart-1/20' :
                progress >= 50 ? 'bg-chart-3/20' :
                progress >= 25 ? 'bg-status-warning/20' : 'bg-destructive/20';
  const remaining = Math.max(target - current, 0);
  const days = getDaysRemaining(goal.targetDate);
  const isOverdue = days !== null && days < 0 && goal.status === 'active';
  const isCompleted = progress >= 100 || goal.status === 'completed';
  const monthlySavings = calcMonthlySavings(remaining, days);

  const handleDelete = () => {
    setShowDeleteConfirm(true);
  };

  const confirmDelete = () => {
    onDelete(goal.id);
  };

  const categoryName = goal.category && typeof goal.category === 'object' && 'name' in goal.category ? goal.category.name : (typeof goal.category === 'string' ? goal.category : null);
  const categoryColor = goal.category && typeof goal.category === 'object' && 'color' in goal.category ? goal.category.color : '#6366f1';

  return (
    <div
      className={`relative bg-muted hover:bg-muted/85 rounded-xl border border-border transition-all duration-200 p-5 ${
        isCompleted ? 'opacity-80' : ''
      } ${isOverdue ? 'border-destructive/50 shadow-sm shadow-destructive/5' : ''}`}
    >
      {/* Delete Confirmation */}
      {showDeleteConfirm && (
        <div className="absolute inset-0 bg-background/95 backdrop-blur-sm rounded-xl flex items-center justify-center z-10 p-4">
          <div className="text-center">
            <p className="text-sm font-medium text-foreground mb-3">Delete this goal?</p>
            <p className="text-xs text-muted-foreground mb-4">This action cannot be undone.</p>
            <div className="flex gap-2 justify-center">
              <button onClick={confirmDelete} className="px-3 py-1.5 bg-destructive text-destructive-foreground rounded-md text-xs font-medium hover:bg-destructive/90">Delete</button>
              <button onClick={() => setShowDeleteConfirm(false)} className="px-3 py-1.5 bg-muted text-muted-foreground rounded-md text-xs font-medium hover:bg-muted/80">Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* Edit & Delete Quick Actions in top right */}
      <div className="absolute top-4 right-4 flex items-center gap-1 z-10">
        <button
          onClick={() => onEdit(goal)}
          className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-background transition-colors border border-transparent hover:border-border/60"
          title="Edit goal"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
          </svg>
        </button>
        <button
          onClick={handleDelete}
          className="p-2 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors border border-transparent hover:border-destructive/20"
          title="Delete goal"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
          </svg>
        </button>
      </div>

      <div className={cn("flex items-center", showReorderControls ? "gap-2" : "gap-4")}>
        {/* Reorder controls on the left when sorting by sortOrder */}
        {showReorderControls && (
          <div className="flex flex-col items-center justify-center gap-1 shrink-0 text-muted-foreground mr-0.5 border-r border-border/50 pr-2 my-1">
            <div
              onMouseDown={() => onDragHandleActive?.(true)}
              onMouseUp={() => onDragHandleActive?.(false)}
              onMouseLeave={() => onDragHandleActive?.(false)}
              className="cursor-grab active:cursor-grabbing py-3 px-0.5 hover:text-foreground hover:bg-background rounded transition-colors"
              title="Drag to reorder"
            >
              <GripVertical className="w-4 h-4" />
            </div>
            <div className="flex flex-col gap-0.5">
              <button
                onClick={(e) => { e.stopPropagation(); onMoveUp?.(); }}
                disabled={isFirst}
                className="py-3 px-0.5 hover:text-foreground hover:bg-background rounded disabled:opacity-30 disabled:pointer-events-none transition-colors"
                title="Move up"
              >
                <ArrowUp className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); onMoveDown?.(); }}
                disabled={isLast}
                className="py-3 px-0.5 hover:text-foreground hover:bg-background rounded disabled:opacity-30 disabled:pointer-events-none transition-colors"
                title="Move down"
              >
                <ArrowDown className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}

        {/* Responsive Horizontal Layout */}
        <div className="flex-1 min-w-0 flex flex-col md:flex-row md:items-center justify-between gap-5">
          {/* Column 1: Info (Name, Description, Metadata) + Progress Ring */}
          <div className="flex items-center gap-4 min-w-0 flex-[1.5] pr-16 md:pr-0">
            <div className="shrink-0">
              <GoalProgressRing progress={isCompleted ? 100 : progress} size={56} strokeWidth={4} />
            </div>
            <div className="min-w-0 flex-1 space-y-1.5">
              <div className="flex items-center gap-2 flex-wrap">
                {goal.status !== 'completed' && priorityIndex !== undefined && (
                  <span 
                    className="text-[10px] font-bold text-muted-foreground bg-muted-foreground/10 px-1.5 py-0.5 rounded border border-border/30"
                    title="Funding priority order"
                  >
                    #{priorityIndex}
                  </span>
                )}
                <h4 className="text-base font-semibold text-foreground truncate leading-snug">{goal.name}</h4>
                {getStatusBadge(goal.status)}
              </div>

              {goal.description && (
                <p className="text-xs text-muted-foreground line-clamp-1">{goal.description}</p>
              )}

              <div className="flex items-center gap-2.5 flex-wrap text-xs text-muted-foreground">
                <GoalTypeIcon type={goal.type} />
                
                {categoryName && (
                  <span className="flex items-center gap-1 bg-muted/65 px-1.5 py-0.5 rounded border border-border/30">
                    <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: categoryColor }} />
                    {categoryName}
                  </span>
                )}

                {goal.tags && goal.tags.length > 0 && (
                  <div className="flex items-center gap-1 flex-wrap">
                    {goal.tags.map((tag) => (
                      <span
                        key={tag.id}
                        className="px-1.5 py-0.2 rounded-full text-[9px] font-medium border"
                        style={{
                          backgroundColor: `${tag.color}15`,
                          color: tag.color,
                          borderColor: `${tag.color}30`
                        }}
                      >
                        #{tag.name}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Column 2: Allocation & Progress Bars */}
          <div className="flex-1 min-w-[200px] space-y-1.5">
            <div className="flex items-baseline justify-between text-xs">
              <span className="font-bold text-foreground blur-number">{formatCurrency(current)}</span>
              <span className="text-muted-foreground blur-number">/ {formatCurrency(target)}</span>
            </div>

            <div className={`w-full ${isCompleted ? 'bg-status-positive/20' : barBg} rounded-full h-2 overflow-hidden`}>
              <div
                className={`h-full rounded-full transition-all duration-700 ease-out ${isCompleted ? 'bg-status-positive' : barColor}`}
                style={{ width: `${isCompleted ? 100 : progress}%` }}
              />
            </div>

            {goal.linkedAccountId && (
              <div className="text-[10px] text-muted-foreground flex flex-col gap-0.5">
                <div className="truncate">
                  Linked: <span className="text-foreground font-medium">{goal.accountName}</span>
                </div>
                <div className="flex gap-2">
                  <span>{percentage}% allocated</span>
                  <span>•</span>
                  <span className="blur-number">{formatCurrency(parseFloat(goal.reserve))} reserve</span>
                </div>
              </div>
            )}
          </div>

          {/* Column 3: Stats, Timeline & Savings Needed */}
          <div className="flex flex-row md:flex-col items-center md:items-end justify-between md:justify-center gap-1 text-xs shrink-0 md:text-right md:pr-16">
            {isCompleted ? (
              <span className="text-status-positive font-semibold uppercase tracking-wider text-[10px] flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5" />
                Fully Funded
              </span>
            ) : (
              <>
                {days !== null && (
                  <span className={cn("font-medium", isOverdue ? "text-destructive" : "text-foreground")}>
                    {isOverdue ? "Overdue" : `${days} days left`}
                  </span>
                )}
                {monthlySavings !== null && (
                  <span className="text-muted-foreground blur-number">Save {formatCurrency(monthlySavings)}/mo</span>
                )}
                
                {projection && (
                  <div className="flex flex-col items-center md:items-end gap-0.5 mt-1 border-t border-border/30 md:border-t-0 pt-1 md:pt-0">
                    {projection.isFunded ? (
                      <div className="flex items-center gap-1 text-status-positive text-[10px] font-semibold">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>{projection.projectedFundDate ? formatProjectedDate(projection.projectedFundDate) : 'Funded'} (Now)</span>
                      </div>
                    ) : projection.willFund && projection.projectedFundDate ? (
                      <div className="flex flex-col items-center md:items-end">
                        <div className="flex items-center gap-1 text-chart-2 text-[10px] font-semibold">
                          <Target className="w-3.5 h-3.5" />
                          <span>Projected: {formatProjectedDate(projection.projectedFundDate)}</span>
                        </div>
                        {projection.monthsToFund !== null && (
                          <span className="text-[9px] text-muted-foreground">
                            In {projection.monthsToFund === 0 ? 'Now' : `${projection.monthsToFund}mo`}
                          </span>
                        )}
                      </div>
                    ) : (
                      <div className="flex items-center gap-1 text-amber-500 text-[10px] font-medium">
                        <AlertCircle className="w-3.5 h-3.5" />
                        <span>5+ yrs at current rate</span>
                      </div>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
