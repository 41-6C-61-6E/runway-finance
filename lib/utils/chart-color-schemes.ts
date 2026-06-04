import { CHART_COLOR_SCHEMES as PALETTE_SCHEMES } from '@/lib/colors/palette';

export type ChartColorSchemeId = keyof typeof PALETTE_SCHEMES;

const SCHEME_META: Record<ChartColorSchemeId, { name: string; description: string }> = {
  fauntleroy: { name: 'Fauntleroy', description: 'Cream, navy, teal, sky blue, and coral rose' },
  kingston: { name: 'Kingston', description: 'Mint green, deep navy-indigo, warm bronze-gold, light purple, and coral rose' },
  seattle: { name: 'Seattle', description: 'Teal, indigo, cream, sage, and sunset orange' },
  vashon: { name: 'Vashon', description: 'Warm and vibrant cyan, violet, gold, lime, and peach' },
};

export const CHART_COLOR_SCHEMES: Record<ChartColorSchemeId, {
  id: ChartColorSchemeId;
  name: string;
  description: string;
  colors: [string, string, string, string, string];
}> = Object.fromEntries(
  (Object.keys(PALETTE_SCHEMES) as ChartColorSchemeId[]).map((id) => {
    const schemeColors = PALETTE_SCHEMES[id];
    return [
      id,
      {
        id,
        ...SCHEME_META[id],
        colors: [
          schemeColors['chart-1'],
          schemeColors['chart-2'],
          schemeColors['chart-3'],
          schemeColors['chart-4'],
          schemeColors['chart-5'],
        ] as [string, string, string, string, string],
      },
    ];
  }),
) as Record<ChartColorSchemeId, {
  id: ChartColorSchemeId;
  name: string;
  description: string;
  colors: [string, string, string, string, string];
}>;

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
