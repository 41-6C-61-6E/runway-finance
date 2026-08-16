'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';

export interface FormFieldProps {
  label?: React.ReactNode;
  required?: boolean;
  error?: string | null;
  hint?: string;
  htmlFor?: string;
  className?: string;
  children: React.ReactNode;
}

export function FormField({
  label,
  required,
  error,
  hint,
  htmlFor,
  className,
  children,
}: FormFieldProps) {
  return (
    <div className={cn('space-y-1.5', className)}>
      {label && (
        <div className="flex items-center justify-between">
          <label
            htmlFor={htmlFor}
            className="block text-xs font-medium text-muted-foreground uppercase tracking-wider"
          >
            {label}
            {required && <span className="text-destructive ml-1">*</span>}
          </label>
          {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
        </div>
      )}
      {children}
      {error && <p className="text-xs text-destructive mt-1 font-medium">{error}</p>}
    </div>
  );
}
