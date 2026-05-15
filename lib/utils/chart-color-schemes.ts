export type ChartColorSchemeId = 'forest' | 'ocean' | 'sunset' | 'nord' | 'synthwave' | 'monochrome' | 'candy' | 'earth' | 'pastel';

export interface ChartColorScheme {
  id: ChartColorSchemeId;
  name: string;
  description: string;
  colors: [string, string, string, string, string];
}

export const CHART_COLOR_SCHEMES: Record<ChartColorSchemeId, ChartColorScheme> = {
  forest: {
    id: 'forest',
    name: 'Forest',
    description: 'Greens, purples, ambers',
    colors: [
      'oklch(0.7 0.18 150)',
      'oklch(0.62 0.2 280)',
      'oklch(0.7 0.15 50)',
      'oklch(0.6 0.18 240)',
      'oklch(0.65 0.15 340)',
    ],
  },
  ocean: {
    id: 'ocean',
    name: 'Ocean',
    description: 'Blues, teals, indigos',
    colors: [
      'oklch(0.6 0.15 220)',
      'oklch(0.65 0.12 190)',
      'oklch(0.55 0.18 260)',
      'oklch(0.7 0.1 170)',
      'oklch(0.5 0.12 240)',
    ],
  },
  sunset: {
    id: 'sunset',
    name: 'Sunset',
    description: 'Oranges, reds, roses',
    colors: [
      'oklch(0.65 0.18 40)',
      'oklch(0.6 0.2 20)',
      'oklch(0.7 0.15 80)',
      'oklch(0.55 0.15 350)',
      'oklch(0.6 0.12 60)',
    ],
  },
  nord: {
    id: 'nord',
    name: 'Nord',
    description: 'Muted scandi palette',
    colors: [
      'oklch(0.65 0.08 240)',
      'oklch(0.7 0.1 40)',
      'oklch(0.6 0.12 180)',
      'oklch(0.55 0.06 280)',
      'oklch(0.7 0.08 80)',
    ],
  },
  synthwave: {
    id: 'synthwave',
    name: 'Synthwave',
    description: 'Neon pinks, purples, cyan',
    colors: [
      'oklch(0.65 0.25 330)',
      'oklch(0.6 0.22 290)',
      'oklch(0.7 0.2 60)',
      'oklch(0.6 0.2 200)',
      'oklch(0.6 0.25 10)',
    ],
  },
  monochrome: {
    id: 'monochrome',
    name: 'Monochrome',
    description: 'Single-hue progression',
    colors: [
      'oklch(0.7 0.05 260)',
      'oklch(0.6 0.08 260)',
      'oklch(0.5 0.1 260)',
      'oklch(0.4 0.12 260)',
      'oklch(0.3 0.14 260)',
    ],
  },
  candy: {
    id: 'candy',
    name: 'Candy',
    description: 'Bright pinks, purples, oranges',
    colors: [
      'oklch(0.7 0.22 350)',
      'oklch(0.65 0.2 300)',
      'oklch(0.72 0.18 30)',
      'oklch(0.68 0.15 280)',
      'oklch(0.7 0.2 10)',
    ],
  },
  earth: {
    id: 'earth',
    name: 'Earth',
    description: 'Warm browns, greens, clays',
    colors: [
      'oklch(0.6 0.12 120)',
      'oklch(0.65 0.14 60)',
      'oklch(0.55 0.1 30)',
      'oklch(0.6 0.08 200)',
      'oklch(0.5 0.15 40)',
    ],
  },
  pastel: {
    id: 'pastel',
    name: 'Pastel',
    description: 'Soft, muted pastels',
    colors: [
      'oklch(0.78 0.08 180)',
      'oklch(0.8 0.1 80)',
      'oklch(0.82 0.08 320)',
      'oklch(0.78 0.07 240)',
      'oklch(0.8 0.09 40)',
    ],
  },
};

export const CHART_SCHEME_NAMES = Object.keys(CHART_COLOR_SCHEMES) as ChartColorSchemeId[];

export function applyChartColorScheme(id: ChartColorSchemeId) {
  const scheme = CHART_COLOR_SCHEMES[id];
  if (!scheme) return;
  const r = document.documentElement;
  scheme.colors.forEach((color, i) => {
    r.style.setProperty(`--chart-${i + 1}`, color);
  });
  r.style.setProperty('--chart-synthetic', muteOklchColor(scheme.colors[0]));
  r.style.setProperty('--destructive-synthetic', 'oklch(0.65 0.1 25)');
}

function muteOklchColor(color: string): string {
  const match = color.match(/oklch\(([\d.]+)\s+([\d.]+)\s+([\d.]+)\)/);
  if (!match) return color;
  const l = parseFloat(match[1]);
  const c = parseFloat(match[2]);
  const h = parseFloat(match[3]);
  const newL = Math.min(l + 0.15, 0.95);
  const newC = Math.max(c * 0.5, 0.05);
  return `oklch(${newL.toFixed(3)} ${newC.toFixed(3)} ${h.toFixed(0)})`;
}

export function resetChartColorScheme() {
  const r = document.documentElement;
  for (let i = 1; i <= 5; i++) {
    r.style.removeProperty(`--chart-${i}`);
  }
  r.style.removeProperty('--chart-synthetic');
  r.style.removeProperty('--destructive-synthetic');
}
