export type ChartColorSchemeId = 'fauntleroy' | 'kingston' | 'lopez' | 'vashon';

export interface ChartColorScheme {
  id: ChartColorSchemeId;
  name: string;
  description: string;
  colors: [string, string, string, string, string];
}

export const CHART_COLOR_SCHEMES: Record<ChartColorSchemeId, ChartColorScheme> = {
  fauntleroy: {
    id: 'fauntleroy',
    name: 'Fauntleroy',
    description: 'Cream, navy, teal, sky blue, and coral rose',
    colors: [
      'oklch(0.97 0.01 85)',
      'oklch(0.374 0.059 259.9)',
      'oklch(0.475 0.089 172.7)',
      'oklch(0.549 0.05 249.8)',
      'oklch(0.6 0.14 25)',
    ],
  },
  kingston: {
    id: 'kingston',
    name: 'Kingston',
    description: 'Deep navy-indigo, mint green, warm bronze-gold, and coral rose',
    colors: [
      'oklch(0.55 0.18 275)',
      'oklch(0.78 0.15 155)',
      'oklch(0.72 0.15 70)',
      'oklch(0.65 0.17 25)',
      'oklch(0.68 0.08 290)',
    ],
  },
  lopez: {
    id: 'lopez',
    name: 'Lopez',
    description: 'High-contrast frosty cyan, polar purple, and sunset orange',
    colors: [
      'oklch(0.68 0.14 200)',
      'oklch(0.72 0.14 140)',
      'oklch(0.64 0.12 300)',
      'oklch(0.68 0.15 45)',
      'oklch(0.76 0.08 220)',
    ],
  },
  vashon: {
    id: 'vashon',
    name: 'Vashon',
    description: 'Warm and vibrant sunset tones, violet, peach, gold, and cyan',
    colors: [
      'oklch(0.58 0.18 290)',
      'oklch(0.62 0.19 330)',
      'oklch(0.74 0.15 50)',
      'oklch(0.78 0.15 80)',
      'oklch(0.70 0.15 200)',
    ],
  },
};

export const CHART_SCHEME_NAMES = Object.keys(CHART_COLOR_SCHEMES) as ChartColorSchemeId[];

export function applyChartColorScheme(id: ChartColorSchemeId) {
  const scheme = CHART_COLOR_SCHEMES[id] || CHART_COLOR_SCHEMES['kingston'];
  if (!scheme) return;
  const r = document.documentElement;
  r.setAttribute('data-chart-scheme', scheme.id);
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
