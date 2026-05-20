export type ChartColorSchemeId = 'forest' | 'nord' | 'earth' | 'pastel' | 'skittles' | 'fauntleroy' | 'tahoma' | 'evergreen' | 'kabosu';

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
  skittles: {
    id: 'skittles',
    name: 'Skittles',
    description: 'Bright rainbow candy',
    colors: [
      'oklch(0.65 0.22 25)',
      'oklch(0.7 0.2 55)',
      'oklch(0.78 0.18 90)',
      'oklch(0.65 0.18 145)',
      'oklch(0.6 0.2 300)',
    ],
  },
  fauntleroy: {
    id: 'fauntleroy',
    name: 'Fauntleroy',
    description: 'Seattle ferry greens, teals, slate',
    colors: [
      'oklch(0.45 0.12 165)',
      'oklch(0.6 0.14 195)',
      'oklch(0.7 0.1 185)',
      'oklch(0.55 0.08 255)',
      'oklch(0.85 0.02 90)',
    ],
  },
  tahoma: {
    id: 'tahoma',
    name: 'Tahoma',
    description: 'Ice, snow, rock blues',
    colors: [
      'oklch(0.75 0.06 220)',
      'oklch(0.9 0.01 240)',
      'oklch(0.5 0.02 260)',
      'oklch(0.65 0.08 210)',
      'oklch(0.35 0.03 270)',
    ],
  },
  evergreen: {
    id: 'evergreen',
    name: 'Evergreen',
    description: 'PNW pine, moss, fern',
    colors: [
      'oklch(0.45 0.15 150)',
      'oklch(0.55 0.12 130)',
      'oklch(0.5 0.1 160)',
      'oklch(0.6 0.13 140)',
      'oklch(0.4 0.12 155)',
    ],
  },
  kabosu: {
    id: 'kabosu',
    name: 'Kabosu',
    description: 'Golden BTC orange, amber, gold',
    colors: [
      'oklch(0.7 0.2 65)',
      'oklch(0.75 0.18 80)',
      'oklch(0.65 0.2 55)',
      'oklch(0.8 0.15 85)',
      'oklch(0.55 0.2 45)',
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
