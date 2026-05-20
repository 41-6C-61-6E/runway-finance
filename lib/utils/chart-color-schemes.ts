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
      'oklch(0.75 0.25 150)',
      'oklch(0.65 0.28 280)',
      'oklch(0.75 0.22 50)',
      'oklch(0.65 0.25 240)',
      'oklch(0.7 0.22 340)',
    ],
  },
  nord: {
    id: 'nord',
    name: 'Nord',
    description: 'Muted scandi palette',
    colors: [
      'oklch(0.7 0.15 240)',
      'oklch(0.75 0.18 40)',
      'oklch(0.65 0.18 180)',
      'oklch(0.6 0.12 280)',
      'oklch(0.75 0.12 80)',
    ],
  },
  earth: {
    id: 'earth',
    name: 'Earth',
    description: 'Warm browns, greens, clays',
    colors: [
      'oklch(0.7 0.2 120)',
      'oklch(0.75 0.22 60)',
      'oklch(0.6 0.18 30)',
      'oklch(0.7 0.15 200)',
      'oklch(0.6 0.2 40)',
    ],
  },
  pastel: {
    id: 'pastel',
    name: 'Pastel',
    description: 'Soft, muted pastels',
    colors: [
      'oklch(0.85 0.15 180)',
      'oklch(0.88 0.18 80)',
      'oklch(0.85 0.15 320)',
      'oklch(0.8 0.15 240)',
      'oklch(0.85 0.16 40)',
    ],
  },
  skittles: {
    id: 'skittles',
    name: 'Skittles',
    description: 'Bright rainbow candy',
    colors: [
      'oklch(0.75 0.3 25)',
      'oklch(0.8 0.3 55)',
      'oklch(0.85 0.28 90)',
      'oklch(0.75 0.28 145)',
      'oklch(0.7 0.3 300)',
    ],
  },
  fauntleroy: {
    id: 'fauntleroy',
    name: 'Fauntleroy',
    description: 'Seattle ferry greens, teals, slate',
    colors: [
      'oklch(0.55 0.2 165)',
      'oklch(0.7 0.22 195)',
      'oklch(0.8 0.18 185)',
      'oklch(0.65 0.15 255)',
      'oklch(0.9 0.05 90)',
    ],
  },
  tahoma: {
    id: 'tahoma',
    name: 'Tahoma',
    description: 'Ice, snow, rock blues',
    colors: [
      'oklch(0.8 0.12 220)',
      'oklch(0.95 0.05 240)',
      'oklch(0.6 0.08 260)',
      'oklch(0.7 0.15 210)',
      'oklch(0.45 0.08 270)',
    ],
  },
  evergreen: {
    id: 'evergreen',
    name: 'Evergreen',
    description: 'PNW pine, moss, fern',
    colors: [
      'oklch(0.4 0.3 150)',
      'oklch(0.5 0.25 130)',
      'oklch(0.45 0.2 160)',
      'oklch(0.6 0.28 140)',
      'oklch(0.35 0.25 155)',
    ],
  },
  kabosu: {
    id: 'kabosu',
    name: 'Kabosu',
    description: 'Shiba Inu dog colors - gold, white, grey',
    colors: [
      'oklch(0.75 0.25 50)',
      'oklch(0.95 0.02 0)',
      'oklch(0.6 0.05 0)',
      'oklch(0.8 0.15 40)',
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
