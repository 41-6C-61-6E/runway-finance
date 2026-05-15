'use client';

import { useState, useEffect, useCallback } from 'react';
import { GoalProgressRing } from './goal-progress-ring';
import { GoalTypeIcon } from './goal-type-icon';
import { formatCurrency, formatDate, getDaysRemaining, calcGoalProgress, calcRemaining, getProgressColorClass, getProgressBgClass, calcMonthlySavings } from '@/lib/utils/goals';

interface Goal {
  id: string;
  name: string;
  description: string | null;
  type: string;
  targetAmount: string;
  currentAmount: string;
  targetDate: string | null;
  category: string | null;
  priority: number;
  status: string;
  linkedAccountId: string | null;
  percentage: string;
  reserve: string;
  createdAt: string;
  updatedAt: string;
}

interface GoalCardProps {
  goal: Goal;
  onEdit: (goal: Goal) => void;
  onDelete: (id: string) => void;
  onSync: (id: string) => void;
  linkedAccountBalance?: number | null;
  percentage?: number;
  reserve?: number;
}

function getPriorityBadge(priority: number) {
  switch (priority) {
    case 2:
      return <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-red-500/20 text-red-400 uppercase">High</span>;
    case 1:
      return <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-yellow-500/20 text-yellow-400 uppercase">Med</span>;
    default:
      return <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-muted text-muted-foreground uppercase">Low</span>;
  }
}

function getStatusBadge(status: string) {
  switch (status) {
    case 'completed':
      return <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-chart-1/20 text-chart-1 uppercase">Done</span>;
    case 'paused':
      return <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-muted text-muted-foreground uppercase">Paused</span>;
    default:
      return <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-chart-3/20 text-chart-3 uppercase">Active</span>;
  }
}

export function GoalCard({ goal, onEdit, onDelete, onSync, linkedAccountBalance, percentage, reserve }: GoalCardProps) {
  const [showActions, setShowActions] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const target = parseFloat(goal.targetAmount);
  const current = parseFloat(goal.currentAmount);
  const progress = target > 0 ? Math.min((current / target) * 100, 100) : 0;
  const remaining = Math.max(target - current, 0);
  const days = getDaysRemaining(goal.targetDate);
  const isOverdue = days !== null && days < 0 && goal.status === 'active';
  const isCompleted = progress >= 100;
  const monthlySavings = calcMonthlySavings(remaining, days);

  const handleSync = () => {
    onSync(goal.id);
  };

  const handleDelete = () => {
    setShowDeleteConfirm(true);
  };

  const confirmDelete = () => {
    onDelete(goal.id);
  };

  return (
    <div
      className={`group relative bg-card border border-border rounded-xl p-5 shadow-sm hover:shadow-md hover:border-border/80 transition-all duration-200 ${
        isCompleted ? 'opacity-75' : ''
      } ${isOverdue ? 'border-destructive/30' : ''}`}
      onMouseEnter={() => setShowActions(true)}
      onMouseLeave={() => setShowActions(false)}
    >
      {/* Delete Confirmation */}
      {showDeleteConfirm && (
        <div className="absolute inset-0 bg-card/95 backdrop-blur-sm rounded-xl flex items-center justify-center z-10 p-4">
          <div className="text-center">
            <p className="text-sm font-medium text-foreground mb-3">Delete this goal?</p>
            <p className="text-xs text-muted-foreground mb-4">This action cannot be undone.</p>
            <div className="flex gap-2 justify-center">
              <button
                onClick={confirmDelete}
                className="px-3 py-1.5 bg-destructive text-destructive-foreground rounded-md text-xs font-medium hover:bg-destructive/90"
              >
                Delete
              </button>
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="px-3 py-1.5 bg-muted text-muted-foreground rounded-md text-xs font-medium hover:bg-muted/80"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <h4 className="text-base font-semibold text-foreground truncate">{goal.name}</h4>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <GoalTypeIcon type={goal.type} />
            {getPriorityBadge(goal.priority)}
            {getStatusBadge(goal.status)}
          </div>
        </div>

        {/* Quick Actions */}
        <div className={`flex items-center gap-1 transition-opacity duration-150 ${showActions ? 'opacity-100' : 'opacity-0'}`}>
          {goal.linkedAccountId && (
            <button
              onClick={handleSync}
              className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
              title="Sync progress"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            </button>
          )}
          <button
            onClick={() => onEdit(goal)}
            className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            title="Edit goal"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
            </svg>
          </button>
          <button
            onClick={handleDelete}
            className="p-1.5 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
            title="Delete goal"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </button>
        </div>
      </div>

      {/* Progress Ring + Details */}
      <div className="flex items-center gap-5 mb-4">
        <GoalProgressRing progress={progress} size={72} strokeWidth={5} />
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-2 mb-1">
            <span className="text-lg font-bold text-foreground">{formatCurrency(current)}</span>
            <span className="text-sm text-muted-foreground">/ {formatCurrency(target)}</span>
          </div>
          <div className="w-full bg-muted/30 rounded-full h-2 overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-700 ease-out ${
                progress >= 75 ? 'bg-chart-1' :
                progress >= 50 ? 'bg-chart-3' :
                progress >= 25 ? 'bg-yellow-500' : 'bg-destructive'
              }`}
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      </div>

      {/* Footer Info */}
      <div className="flex items-center justify-between text-xs text-muted-foreground pt-1">
        <div className="flex items-center gap-3">
          {goal.category && (
            <span className="flex items-center gap-1">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
              </svg>
              {goal.category}
            </span>
          )}
          {goal.description && (
            <span className="truncate max-w-[120px]" title={goal.description}>
              {goal.description}
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          {isOverdue && (
            <span className="text-destructive font-medium">Overdue</span>
          )}
          {days !== null && !isCompleted && monthlySavings !== null && (
            <span className={isOverdue ? 'text-destructive' : ''}>
              {days < 0 ? `${Math.abs(days)}d overdue` : `${days}d left`}
            </span>
          )}
          {isCompleted && (
            <span className="text-chart-1 font-medium">✓ Complete</span>
          )}
        </div>
      </div>

      {/* Monthly Savings Needed */}
      {!isCompleted && monthlySavings !== null && (
        <div className="mt-2 pt-2 border-t border-border/50 flex items-center gap-2 text-xs text-muted-foreground">
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span>Save {formatCurrency(monthlySavings)}/mo</span>
        </div>
      )}

      {/* Linked Account */}
      {goal.linkedAccountId && (
        <div className="mt-3 pt-3 border-t border-border/50 flex flex-col gap-1 text-xs text-muted-foreground">
          <div className="flex items-center gap-2">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
            </svg>
            <span>Linked account</span>
            {linkedAccountBalance !== null && (
              <span className="text-foreground font-medium ml-auto">{formatCurrency(linkedAccountBalance)}</span>
            )}
          </div>
          {percentage !== undefined && (
            <div className="flex items-center gap-2 pl-5.5">
              <span className="text-muted-foreground">{percentage}% of account allocated</span>
            </div>
          )}
          {reserve !== undefined && (
            <div className="flex items-center gap-2 pl-5.5">
              <span className="text-muted-foreground">{formatCurrency(reserve)} reserve</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
