export type ChartColorSchemeId = 'fauntleroy' | 'kingston' | 'seattle' | 'vashon';

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
      'oklch(0.475 0.089 172.7)',
      'oklch(0.374 0.059 259.9)',
      'oklch(0.94 0.015 75)',
      'oklch(0.549 0.05 249.8)',
      'oklch(0.6 0.14 25)',
    ],
  },
  kingston: {
    id: 'kingston',
    name: 'Kingston',
    description: 'Mint green, deep navy-indigo, warm bronze-gold, light purple, and coral rose',
    colors: [
      'oklch(0.78 0.15 155)',
      'oklch(0.55 0.18 275)',
      'oklch(0.72 0.15 70)',
      'oklch(0.68 0.08 290)',
      'oklch(0.65 0.17 25)',
    ],
  },
  seattle: {
    id: 'seattle',
    name: 'Seattle',
    description: 'Teal, indigo, cream, sage, and sunset orange',
    colors: [
      'oklch(0.726 0.093 216.6)',
      'oklch(0.450 0.092 275.2)',
      'oklch(0.947 0.038 72.4)',
      'oklch(0.785 0.023 145.4)',
      'oklch(0.788 0.167 67.5)',
    ],
  },
  vashon: {
    id: 'vashon',
    name: 'Vashon',
    description: 'Warm and vibrant lime, violet, gold, cyan, and peach',
    colors: [
      'oklch(0.78 0.15 80)',
      'oklch(0.58 0.18 290)',
      'oklch(0.74 0.15 50)',
      'oklch(0.70 0.15 200)',
      'oklch(0.62 0.19 330)',
    ],
  },
};

export const CHART_SCHEME_NAMES = Object.keys(CHART_COLOR_SCHEMES) as ChartColorSchemeId[];

export function applyChartColorScheme(id: ChartColorSchemeId) {
  const scheme = CHART_COLOR_SCHEMES[id] || CHART_COLOR_SCHEMES['fauntleroy'];
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
