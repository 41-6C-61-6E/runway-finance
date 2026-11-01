'use client';

import { useMediaQuery } from './use-media-query';

const MOBILE_BREAKPOINT = 768;

/**
 * Hook to reactively determine if current viewport width is below 768px (mobile).
 */
export function useIsMobile(breakpoint = MOBILE_BREAKPOINT): boolean {
  return useMediaQuery(`(max-width: ${breakpoint - 1}px)`);
}

/**
 * Hook to reactively determine if the device has a coarse pointer (touch device).
 */
export function useIsTouchDevice(): boolean {
  return useMediaQuery('(pointer: coarse)');
}

/**
 * Hook to determine if viewport is mobile or using touch interaction.
 */
export function useIsMobileOrTouch(breakpoint = MOBILE_BREAKPOINT): boolean {
  const isMobile = useIsMobile(breakpoint);
  const isTouch = useIsTouchDevice();
  return isMobile || isTouch;
}
