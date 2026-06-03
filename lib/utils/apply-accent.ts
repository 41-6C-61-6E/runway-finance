// ── Accent Color Palette ──────────────────────────────────────────────────────
// Six preset accent colors. Each provides a bold "primary" value and a pair of
// muted "accent" values for light and dark themes, so that hover backgrounds
// and subtle surfaces maintain proper contrast in either mode.

type AccentDefinition = {
  primary: string;
  accent: { light: string; dark: string };
};

const ACCENTS: Record<string, AccentDefinition> = {
  violet: {
    primary: 'oklch(0.58 0.10 280)',
    accent: { light: 'oklch(0.90 0.05 285)', dark: 'oklch(0.22 0.03 285)' },
  },
  teal: {
    primary: 'oklch(0.58 0.09 170)',
    accent: { light: 'oklch(0.90 0.04 170)', dark: 'oklch(0.22 0.03 170)' },
  },

  rose: {
    primary: 'oklch(0.50 0.11 5)',
    accent: { light: 'oklch(0.89 0.06 10)', dark: 'oklch(0.18 0.03 5)' },
  },
  sapphire: {
    primary: 'oklch(0.50 0.08 260)',
    accent: { light: 'oklch(0.89 0.04 260)', dark: 'oklch(0.18 0.03 260)' },
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

  try {
    localStorage.setItem('runway-accent', name);
  } catch { /* localStorage unavailable */ }

  const r = document.documentElement;
  const theme = r.getAttribute('data-theme');
  const isDark = theme === 'dark' || theme === 'moonlight';

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

// ── Theme→Accent Pairing ─────────────────────────────────────────────────
// When the user switches color schemes, auto-apply the paired accent.
export const THEME_ACCENT_MAP: Record<string, string> = {
  light: 'violet',
  moonlight: 'teal',
  dark: 'sapphire',
};

function darkenColor(hex: string, factor: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);

  const dr = Math.round(r * (1 - factor));
  const dg = Math.round(g * (1 - factor));
  const db = Math.round(b * (1 - factor));

  return '#' + [dr, dg, db].map((c) => c.toString(16).padStart(2, '0')).join('');
}
