'use client';

import * as React from 'react';
import { CheckCircle2, AlertCircle, AlertTriangle, Info, X } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface ActionAlertProps {
  variant?: 'success' | 'error' | 'warning' | 'info';
  title?: string;
  message?: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
  onDismiss?: () => void;
}

const variantStyles = {
  success: {
    container: 'border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
    icon: CheckCircle2,
    iconColor: 'text-emerald-500 dark:text-emerald-400',
  },
  error: {
    container: 'border-destructive/20 bg-destructive/10 text-destructive dark:text-red-400',
    icon: AlertCircle,
    iconColor: 'text-destructive dark:text-red-400',
  },
  warning: {
    container: 'border-amber-500/20 bg-amber-500/10 text-amber-800 dark:text-amber-300',
    icon: AlertTriangle,
    iconColor: 'text-amber-500 dark:text-amber-400',
  },
  info: {
    container: 'border-primary/20 bg-primary/10 text-primary dark:text-primary',
    icon: Info,
    iconColor: 'text-primary',
  },
};

export function ActionAlert({
  variant = 'info',
  title,
  message,
  children,
  className,
  onDismiss,
}: ActionAlertProps) {
  const content = message || children;
  if (!content && !title) return null;

  const style = variantStyles[variant];
  const Icon = style.icon;

  return (
    <div
      role={variant === 'error' ? 'alert' : 'status'}
      className={cn(
        'relative flex items-start gap-3 rounded-lg border p-3.5 text-sm transition-all duration-200',
        style.container,
        className
      )}
    >
      <Icon className={cn('h-5 w-5 shrink-0 mt-0.5', style.iconColor)} />
      <div className="flex-1 min-w-0">
        {title && <div className="font-semibold leading-none tracking-tight mb-1">{title}</div>}
        {content && <div className="text-xs sm:text-sm opacity-90 leading-relaxed">{content}</div>}
      </div>
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          className="shrink-0 rounded-md p-1 opacity-70 hover:opacity-100 hover:bg-black/5 dark:hover:bg-white/5 transition-opacity"
          aria-label="Dismiss alert"
        >
          <X className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}
