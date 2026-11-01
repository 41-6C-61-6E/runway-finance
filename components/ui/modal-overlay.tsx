import * as React from 'react';
import { cn } from '@/lib/utils';

export interface ClickOutsideBackdropProps extends React.HTMLAttributes<HTMLDivElement> {
  onClose?: () => void;
  transparent?: boolean;
}

export function ClickOutsideBackdrop({
  onClose,
  onClick,
  transparent = true,
  className,
  ...props
}: ClickOutsideBackdropProps) {
  return (
    <div
      aria-hidden="true"
      tabIndex={-1}
      className={cn(
        'fixed inset-0 z-40',
        transparent ? '' : 'bg-black/40 backdrop-blur-xs',
        className
      )}
      onClick={(e) => {
        onClick?.(e);
        onClose?.();
      }}
      {...props}
    />
  );
}

export interface ModalBackdropProps extends React.HTMLAttributes<HTMLDivElement> {
  onClose?: () => void;
}

export function ModalBackdrop({
  onClose,
  onClick,
  className,
  children,
  ...props
}: ModalBackdropProps) {
  return (
    <div
      className={cn(
        'fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/65 backdrop-blur-xs',
        className
      )}
      onClick={(e) => {
        onClick?.(e);
        if (e.target === e.currentTarget) {
          onClose?.();
        }
      }}
      {...props}
    >
      {children}
    </div>
  );
}
