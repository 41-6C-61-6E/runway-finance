import { twMerge } from 'tailwind-merge';

/**
 * Merges Tailwind class names; later classes win per property (e.g. a
 * `className="h-9"` passed to a component that defaults to `h-10`).
 * Plain `clsx`-style joining would let stylesheet sort order decide instead,
 * so component-level overrides like `text-[11px]` on `text-base` controls
 * could silently lose — twMerge removes the earlier conflicting class.
 */
export type ClassValue = ClassArray | ClassDictionary | string | number | null | boolean | undefined;
export type ClassDictionary = Record<string, any>;
export type ClassArray = ClassValue[];

function toVal(mix: ClassValue): string {
  let str = '';
  if (typeof mix === 'string' || typeof mix === 'number') {
    str += mix;
  } else if (typeof mix === 'object' && mix !== null) {
    if (Array.isArray(mix)) {
      const len = mix.length;
      for (let k = 0; k < len; k++) {
        if (mix[k]) {
          const y = toVal(mix[k]);
          if (y) {
            str && (str += ' ');
            str += y;
          }
        }
      }
    } else {
      for (const k in mix) {
        if ((mix as ClassDictionary)[k]) {
          str && (str += ' ');
          str += k;
        }
      }
    }
  }
  return str;
}

/**
 * Merges Tailwind class names; later classes win per property (e.g. a
 * `className="h-9"` passed to a component that defaults to `h-10`).
 * Supports strings, nested arrays, and conditional object maps.
 */
export function cn(...inputs: ClassValue[]): string {
  let str = '';
  for (let i = 0; i < inputs.length; i++) {
    const tmp = inputs[i];
    if (tmp) {
      const x = toVal(tmp);
      if (x) {
        str && (str += ' ');
        str += x;
      }
    }
  }
  return twMerge(str);
}