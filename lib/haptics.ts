/**
 * Haptic feedback utility for mobile interactions.
 * Safely no-ops on browsers that don't support the Vibration API.
 */

function vibrate(pattern: number | number[]): void {
  try {
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      navigator.vibrate(pattern);
    }
  } catch {
    // Silently ignore — vibration not supported
  }
}

export const haptic = {
  /** Ultra-light tap — selection changes, minor state toggles */
  light: () => vibrate(10),
  /** Medium tap — swipe navigation, pull-to-refresh threshold */
  medium: () => vibrate(25),
  /** Heavy tap — long-press activation, destructive actions */
  heavy: () => vibrate(50),
  /** Success pattern — form submissions, drag-drop completion */
  success: () => vibrate([10, 50, 20]),
};
