// ── Accent Color Palette ──────────────────────────────────────────────────────
// Six preset accent colors. Each provides a bold "primary" value and a muted
// "accent" value so that both strong surfaces (buttons, active states) and
// subtle surfaces (hover backgrounds, badges) can be themed together.

const ACCENTS: Record<string, { primary: string; accent: string }> = {
  indigo: {
    primary: 'oklch(0.65 0.18 260)',
    accent: 'oklch(0.92 0.06 260)',
  },
  violet: {
    primary: 'oklch(0.62 0.2 280)',       // current default
    accent: 'oklch(0.92 0.08 285)',
  },
  teal: {
    primary: 'oklch(0.62 0.18 170)',
    accent: 'oklch(0.92 0.06 170)',
  },
  amber: {
    primary: 'oklch(0.65 0.18 80)',
    accent: 'oklch(0.93 0.07 80)',
  },
  rose: {
    primary: 'oklch(0.6 0.2 20)',
    accent: 'oklch(0.92 0.06 20)',
  },
  slate: {
    primary: 'oklch(0.55 0.04 280)',
    accent: 'oklch(0.92 0.01 280)',
  },
};

export const ACCENT_NAMES = Object.keys(ACCENTS) as Array<keyof typeof ACCENTS>;

const isHexColor = (value: string): boolean => /^#[0-9A-Fa-f]{6}$/.test(value);

// ── Apply Accent ──────────────────────────────────────────────────────────────
// Sets CSS custom properties on <html> so that every shadcn/ui surface
// (primary, ring, sidebar-primary, sidebar-ring, accent, accent-foreground,
// sidebar-accent, sidebar-accent-foreground) reflects the chosen hue.
// Works across both light and dark themes because the properties are set
// directly on document.documentElement (overriding the static :root values).
// Accepts either a preset name ("violet", "teal", ...) or a custom hex color ("#cc66ff").

export function applyAccent(name: string) {
  // Custom hex color path
  if (isHexColor(name)) {
    const r = document.documentElement;
    r.style.setProperty('--primary', name);
    r.style.setProperty('--ring', name);
    r.style.setProperty('--sidebar-primary', name);
    r.style.setProperty('--sidebar-ring', name);
    // Derive a lighter "accent" surface from the hex
    const accent = lightenColor(name, 0.85);
    r.style.setProperty('--accent', accent);
    r.style.setProperty('--sidebar-accent', accent);
    return;
  }

  // Preset name path
  const a = ACCENTS[name] ?? ACCENTS['violet'];

  const r = document.documentElement;
  r.style.setProperty('--primary', a.primary);
  r.style.setProperty('--ring', a.primary);
  r.style.setProperty('--sidebar-primary', a.primary);
  r.style.setProperty('--sidebar-ring', a.primary);
  r.style.setProperty('--accent', a.accent);
  r.style.setProperty('--sidebar-accent', a.accent);
}

// ── Lighten Color ─────────────────────────────────────────────────────────────
// Blends a hex color toward white by a given factor (0–1).
// Used to derive a muted "accent" surface from a custom primary hex.

function lightenColor(hex: string, factor: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);

  const lr = Math.round(r + (255 - r) * factor);
  const lg = Math.round(g + (255 - g) * factor);
  const lb = Math.round(b + (255 - b) * factor);

  return (
    '#' +
    [lr, lg, lb].map((c) => c.toString(16).padStart(2, '0')).join('')
  );
}
