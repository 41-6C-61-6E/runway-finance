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
    description: 'Sage green, fern green, blackberry, spruce, wild blueberry',
    colors: [
      'oklch(0.68 0.22 140)',
      'oklch(0.76 0.18 110)',
      'oklch(0.62 0.22 315)',
      'oklch(0.65 0.18 190)',
      'oklch(0.60 0.18 270)',
    ],
  },
  nord: {
    id: 'nord',
    name: 'Nord',
    description: 'Nordic scandinavian frost and aurora tones',
    colors: [
      'oklch(0.66 0.12 225)',
      'oklch(0.75 0.14 135)',
      'oklch(0.76 0.12 205)',
      'oklch(0.65 0.13 315)',
      'oklch(0.74 0.08 180)',
    ],
  },
  earth: {
    id: 'earth',
    name: 'Earth',
    description: 'Clay ochre, sage leaf, raw gold, copper patina, cocoa bark',
    colors: [
      'oklch(0.64 0.13 36)',
      'oklch(0.68 0.10 125)',
      'oklch(0.74 0.13 82)',
      'oklch(0.58 0.09 195)',
      'oklch(0.58 0.11 345)',
    ],
  },
  pastel: {
    id: 'pastel',
    name: 'Pastel',
    description: 'Soft sage, blush rose, periwinkle, soft apricot, lavender mist',
    colors: [
      'oklch(0.78 0.08 150)',
      'oklch(0.75 0.10 18)',
      'oklch(0.76 0.09 255)',
      'oklch(0.79 0.10 65)',
      'oklch(0.74 0.08 300)',
    ],
  },
  skittles: {
    id: 'skittles',
    name: 'Skittles',
    description: 'Candy red, mango slice, lemon-lime, electric cyan, grape violet',
    colors: [
      'oklch(0.66 0.22 28)',
      'oklch(0.74 0.21 62)',
      'oklch(0.80 0.19 115)',
      'oklch(0.72 0.19 198)',
      'oklch(0.64 0.21 315)',
    ],
  },
  fauntleroy: {
    id: 'fauntleroy',
    name: 'Fauntleroy',
    description: 'Ferry evergreen, cabin teal, sound deep blue, Seattle lavender slate, coho salmon',
    colors: [
      'oklch(0.62 0.20 160)',
      'oklch(0.72 0.16 195)',
      'oklch(0.58 0.18 240)',
      'oklch(0.66 0.10 290)',
      'oklch(0.74 0.15 30)',
    ],
  },
  tahoma: {
    id: 'tahoma',
    name: 'Tahoma',
    description: 'Glacier snow, pure snow white, glacial water, basalt rock, lupine violet',
    colors: [
      'oklch(0.80 0.06 220)',
      'oklch(0.92 0.02 210)',
      'oklch(0.70 0.15 210)',
      'oklch(0.48 0.03 240)',
      'oklch(0.63 0.18 285)',
    ],
  },
  evergreen: {
    id: 'evergreen',
    name: 'Evergreen',
    description: 'Old growth pine, bright fern, moss lichen, red cedar, huckleberry',
    colors: [
      'oklch(0.52 0.12 145)',
      'oklch(0.68 0.14 130)',
      'oklch(0.75 0.12 105)',
      'oklch(0.58 0.09 50)',
      'oklch(0.55 0.08 280)',
    ],
  },
  kabosu: {
    id: 'kabosu',
    name: 'Kabosu',
    description: 'Bitcoin orange, Shiba gold, Kabosu lime, dark sesame, blockchain silver',
    colors: [
      'oklch(0.68 0.18 45)',
      'oklch(0.75 0.14 70)',
      'oklch(0.77 0.15 115)',
      'oklch(0.52 0.04 65)',
      'oklch(0.68 0.05 220)',
    ],
  },
};

export const CHART_SCHEME_NAMES = Object.keys(CHART_COLOR_SCHEMES) as ChartColorSchemeId[];

export function applyChartColorScheme(id: ChartColorSchemeId) {
  const scheme = CHART_COLOR_SCHEMES[id];
  if (!scheme) return;
  const r = document.documentElement;
  r.setAttribute('data-chart-scheme', id);
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
