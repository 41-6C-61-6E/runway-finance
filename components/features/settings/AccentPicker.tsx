'use client';

import { useState, useRef, useEffect } from 'react';
import { Check, Plus } from 'lucide-react';
import { ACCENTS } from '@/lib/colors/palette';
import { ACCENT_NAMES, applyAccent } from '@/lib/utils/apply-accent';

const SWATCH_COLORS: Record<string, string> = {
  violet: ACCENTS.violet.swatch,
  teal: ACCENTS.teal.swatch,
  rose: ACCENTS.rose.swatch,
  sapphire: ACCENTS.sapphire.swatch,
};

const SWATCH_LABELS: Record<string, string> = {
  violet: 'Violet',
  teal: 'Teal',
  rose: 'Rose',
  sapphire: 'Sapphire',
};

const isHexColor = (value: string): boolean => /^#[0-9A-Fa-f]{6}$/.test(value);

export default function AccentPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (color: string) => void;
}) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [tempColor, setTempColor] = useState('#6f73b4');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (pickerOpen) {
      if (isHexColor(value)) {
        setTempColor(value);
      } else {
        setTempColor(SWATCH_COLORS[value] || '#6f73b4');
      }
    }
  }, [pickerOpen, value]);

  const handleSelect = (color: string) => {
    applyAccent(color);
    onChange(color);
  };

  const handleCustomApply = () => {
    handleSelect(tempColor);
    setPickerOpen(false);
  };

  const handleCustomCancel = () => {
    setPickerOpen(false);
  };

  return (
    <div className="flex items-center gap-2">
      {ACCENT_NAMES.map((color) => {
        const isActive = value === color;
        return (
          <button
            key={color}
            type="button"
            title={SWATCH_LABELS[color]}
            aria-label={`Select ${SWATCH_LABELS[color]} accent color`}
            className={`relative w-7 h-7 rounded-full border-2 transition-all ${
              isActive
                ? 'border-foreground scale-110'
                : 'border-transparent hover:scale-105'
            }`}
            style={{ backgroundColor: SWATCH_COLORS[color] }}
            onClick={() => handleSelect(color)}
          >
            {isActive && (
              <Check className="w-3.5 h-3.5 text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.5)] absolute inset-0 m-auto" />
            )}
          </button>
        );
      })}

      {/* Custom Color Button */}
      <div className="relative">
        <button
          type="button"
          title="Custom color"
          aria-label="Pick custom accent color"
          className={`relative w-7 h-7 rounded-full border-2 transition-all flex items-center justify-center ${
            isHexColor(value)
              ? 'border-foreground scale-110'
              : 'border-border hover:border-foreground/50 hover:scale-105'
          }`}
          style={{ backgroundColor: isHexColor(value) ? value : 'transparent' }}
          onClick={() => setPickerOpen(true)}
        >
          <Plus className={`w-3.5 h-3.5 ${isHexColor(value) ? 'text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.5)]' : 'text-muted-foreground'}`} />
        </button>

        {/* Color Picker Popup */}
        {pickerOpen && (
          <div className="absolute right-0 top-10 z-50 p-3 bg-popover border border-border rounded-lg shadow-lg">
            <div className="flex flex-col gap-2">
              <input
                ref={inputRef}
                type="color"
                value={tempColor}
                onChange={(e) => setTempColor(e.target.value)}
                className="w-20 h-20 cursor-pointer rounded border border-border"
              />
              <div className="flex items-center justify-center gap-2 mt-1">
                <div
                  className="w-6 h-6 rounded-full border border-border"
                  style={{ backgroundColor: tempColor }}
                />
                <span className="text-xs text-muted-foreground font-mono uppercase">
                  {tempColor}
                </span>
              </div>
              <div className="flex gap-2 mt-1">
                <button
                  type="button"
                  onClick={handleCustomCancel}
                  className="flex-1 text-xs py-1.5 rounded-md border border-border text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleCustomApply}
                  className="flex-1 text-xs py-1.5 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
                >
                  Apply
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
