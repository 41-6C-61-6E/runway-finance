'use client';

import * as React from 'react';

export interface SliderProps {
  min: number;
  max: number;
  step?: number;
  value: number;
  onChange?: (value: number) => void;
  onValueChange?: (value: number) => void;
  onRelease?: (value: number) => void;
  onPointerUp?: (e: React.PointerEvent<HTMLInputElement>) => void;
  onTouchEnd?: (e: React.TouchEvent<HTMLInputElement>) => void;
  onMouseUp?: (e: React.MouseEvent<HTMLInputElement>) => void;
  className?: string;
  disabled?: boolean;
  accentClass?: string;
  ariaLabel?: string;
  id?: string;
}

export function Slider({
  min,
  max,
  step = 1,
  value,
  onChange,
  onValueChange,
  onRelease,
  onPointerUp,
  onTouchEnd,
  onMouseUp,
  className = '',
  disabled = false,
  accentClass = 'accent-primary',
  ariaLabel,
  id,
}: SliderProps) {
  // Percentage for progress track calculation
  const percentage = Math.max(0, Math.min(100, ((value - min) / (max - min || 1)) * 100));

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value);
    if (!isNaN(val)) {
      onChange?.(val);
      onValueChange?.(val);
    }
  };

  const handleRelease = (val: number) => {
    onRelease?.(val);
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLInputElement>) => {
    onPointerUp?.(e);
    handleRelease(value);
  };

  const handleTouchEnd = (e: React.TouchEvent<HTMLInputElement>) => {
    onTouchEnd?.(e);
    handleRelease(value);
  };

  const handleMouseUp = (e: React.MouseEvent<HTMLInputElement>) => {
    onMouseUp?.(e);
    handleRelease(value);
  };

  // Determine active track fill color based on accentClass
  const isPurple = accentClass.includes('purple');
  const isPink = accentClass.includes('pink');
  const isRose = accentClass.includes('rose');
  const activeColor = isPurple
    ? '#a855f7'
    : isPink
    ? '#ec4899'
    : isRose
    ? '#f43f5e'
    : 'var(--primary)';

  return (
    <div className="relative flex items-center w-full touch-pan-y py-1 select-none">
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        aria-label={ariaLabel}
        onChange={handleChange}
        onPointerUp={handlePointerUp}
        onTouchEnd={handleTouchEnd}
        onMouseUp={handleMouseUp}
        style={{
          background: `linear-gradient(to right, ${activeColor} 0%, ${activeColor} ${percentage}%, var(--muted) ${percentage}%, var(--muted) 100%)`,
        }}
        className={`w-full h-2 rounded-lg cursor-pointer ${accentClass} ${disabled ? 'opacity-50 cursor-not-allowed' : ''} ${className}`}
      />
    </div>
  );
}
