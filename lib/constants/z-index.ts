// ─── Standard Z-Index Scale ────────────────────────────────────────────────

export const Z_INDEX = {
  BASE: 0,
  STICKY: 30,
  DROPDOWN: 40,
  MODAL_BACKDROP: 45,
  MODAL: 50,
  DRAWER: 50,
  POPOVER: 60,
  OVERLAY: 100,
  TOOLTIP: 1000,
  TOAST: 5000,
  MAX: 10000,
} as const;

export type ZIndexLevel = keyof typeof Z_INDEX;
