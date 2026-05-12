// ── Accent Color Palette ──────────────────────────────────────────────────────
// Six preset accent colors. Each provides a bold "primary" value and a pair of
// muted "accent" values for light and dark themes, so that hover backgrounds
// and subtle surfaces maintain proper contrast in either mode.

type AccentDefinition = {
  primary: string;
  accent: { light: string; dark: string };
};

const ACCENTS: Record<string, AccentDefinition> = {
  indigo: {
    primary: 'oklch(0.65 0.18 260)',
    accent: { light: 'oklch(0.92 0.06 260)', dark: 'oklch(0.2 0.06 260)' },
  },
  violet: {
    primary: 'oklch(0.62 0.2 280)',
    accent: { light: 'oklch(0.92 0.08 285)', dark: 'oklch(0.2 0.04 285)' },
  },
  teal: {
    primary: 'oklch(0.62 0.18 170)',
    accent: { light: 'oklch(0.92 0.06 170)', dark: 'oklch(0.2 0.05 170)' },
  },
  amber: {
    primary: 'oklch(0.65 0.18 80)',
    accent: { light: 'oklch(0.93 0.07 80)', dark: 'oklch(0.25 0.06 80)' },
  },
  rose: {
    primary: 'oklch(0.6 0.2 20)',
    accent: { light: 'oklch(0.92 0.06 20)', dark: 'oklch(0.2 0.06 20)' },
  },
  slate: {
    primary: 'oklch(0.55 0.04 280)',
    accent: { light: 'oklch(0.92 0.01 280)', dark: 'oklch(0.2 0.02 280)' },
  },
};

export const ACCENT_NAMES = Object.keys(ACCENTS) as Array<keyof typeof ACCENTS>;

const isHexColor = (value: string): boolean => /^#[0-9A-Fa-f]{6}$/.test(value);

// ── Theme-Aware Accent Application ────────────────────────────────────────────
// Reads the current theme (<html data-theme="dark">) and applies the matching
// accent values so that hover surfaces remain readable in both light and dark
// modes. Also watches for data-theme changes to re-apply the accent.

let currentAccent: string | null = null;
let themeObserver: MutationObserver | null = null;

function initThemeObserver() {
  if (themeObserver) return;
  themeObserver = new MutationObserver(() => {
    if (currentAccent) {
      applyAccent(currentAccent);
    }
  });
  themeObserver.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['data-theme'],
  });
}

export function applyAccent(name: string) {
  currentAccent = name;
  initThemeObserver();

  const r = document.documentElement;
  const isDark = r.getAttribute('data-theme') === 'dark';

  // Custom hex color path
  if (isHexColor(name)) {
    r.style.setProperty('--primary', name);
    r.style.setProperty('--ring', name);
    r.style.setProperty('--sidebar-primary', name);
    r.style.setProperty('--sidebar-ring', name);
    const accent = isDark ? darkenColor(name, 0.85) : lightenColor(name, 0.85);
    r.style.setProperty('--accent', accent);
    r.style.setProperty('--sidebar-accent', accent);
    return;
  }

  // Preset name path
  const a = ACCENTS[name] ?? ACCENTS['violet'];

  r.style.setProperty('--primary', a.primary);
  r.style.setProperty('--ring', a.primary);
  r.style.setProperty('--sidebar-primary', a.primary);
  r.style.setProperty('--sidebar-ring', a.primary);
  r.style.setProperty('--accent', isDark ? a.accent.dark : a.accent.light);
  r.style.setProperty('--sidebar-accent', isDark ? a.accent.dark : a.accent.light);
}

// ── Color Helpers ─────────────────────────────────────────────────────────────
// Derive a muted accent surface from a hex color.
// Light mode: blend toward white. Dark mode: blend toward black.

function lightenColor(hex: string, factor: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);

  const lr = Math.round(r + (255 - r) * factor);
  const lg = Math.round(g + (255 - g) * factor);
  const lb = Math.round(b + (255 - b) * factor);

  return '#' + [lr, lg, lb].map((c) => c.toString(16).padStart(2, '0')).join('');
}

function darkenColor(hex: string, factor: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);

  const dr = Math.round(r * (1 - factor));
  const dg = Math.round(g * (1 - factor));
  const db = Math.round(b * (1 - factor));

  return '#' + [dr, dg, db].map((c) => c.toString(16).padStart(2, '0')).join('');
}
