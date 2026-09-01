import { twMerge } from 'tailwind-merge';

/**
 * Merges Tailwind class names; later classes win per property (e.g. a
 * `className="h-9"` passed to a component that defaults to `h-10`).
 * Plain `clsx`-style joining would let stylesheet sort order decide instead,
 * so component-level overrides like `text-[11px]` on `text-base` controls
 * could silently lose — twMerge removes the earlier conflicting class.
 */
export function cn(...inputs: any[]) {
  return twMerge(inputs.filter(Boolean).join(' '));
}