'use client';

import * as React from 'react';

export interface SliderTick {
  value: number;
  label?: string;
}

export interface SliderProps {
  min: number;
  max: number;
  step?: number;
  value: number;
  ticks?: (number | SliderTick)[];
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
  ticks,
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

  const normalizedTicks = ticks?.map((t) =>
    typeof t === 'number' ? { value: t, label: String(t) } : t
  );

  return (
    <div className="flex flex-col w-full select-none">
      <div className="relative flex items-center w-full touch-pan-y py-1">
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

      {normalizedTicks && normalizedTicks.length > 0 && (
        <div className="relative w-full h-4 mt-0.5 pointer-events-none overflow-hidden">
          {normalizedTicks.map((t) => {
            const pct = Math.max(0, Math.min(100, ((t.value - min) / (max - min || 1)) * 100));
            const ratio = pct / 100;

            const style: React.CSSProperties = {
              left: `calc(12px + (100% - 24px) * ${ratio})`,
              transform: `translateX(-${pct}%)`,
            };

            const isCurrent = Math.abs(value - t.value) < 0.001;

            return (
              <span
                key={t.value}
                style={style}
                className={`absolute text-[10px] font-mono whitespace-nowrap transition-colors ${
                  isCurrent ? 'font-bold text-foreground' : 'text-muted-foreground'
                }`}
              >
                {t.label ?? t.value}
              </span>
            );
          })}
        </div>
      )}
    </div>
  );
}
