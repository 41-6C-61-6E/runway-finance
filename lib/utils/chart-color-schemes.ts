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

let currentSchemeId: ChartColorSchemeId | null = null;
let themeObserver: MutationObserver | null = null;

function initThemeObserver() {
  if (typeof window === 'undefined' || themeObserver) return;
  themeObserver = new MutationObserver(() => {
    if (currentSchemeId) {
      applyChartColorScheme(currentSchemeId);
    }
  });
  themeObserver.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['data-theme'],
  });
}

function parseOklch(str: string) {
  if (!str) return null;
  const match = str.match(/oklch\(\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*\)/);
  if (!match) return null;
  return {
    l: parseFloat(match[1]),
    c: parseFloat(match[2]),
    h: parseFloat(match[3]),
  };
}

function adjustColorForTheme(colorStr: string, isDark: boolean): string {
  const oklch = parseOklch(colorStr);
  if (!oklch) return colorStr;
  let { l, c, h } = oklch;

  if (isDark) {
    if (l < 0.65) {
      l = 0.65 + l * 0.12;
    }
  } else {
    if (l > 0.60) {
      l = 0.60 - (1.0 - l) * 0.15;
    }
  }
  return `oklch(${l.toFixed(3)} ${c.toFixed(3)} ${h.toFixed(1)})`;
}

export function applyChartColorScheme(id: ChartColorSchemeId) {
  currentSchemeId = id;
  initThemeObserver();

  const scheme = CHART_COLOR_SCHEMES[id] || CHART_COLOR_SCHEMES['fauntleroy'];
  if (!scheme) return;

  if (typeof window === 'undefined') return;
  const r = document.documentElement;
  const theme = r.getAttribute('data-theme');
  const isDark = theme === 'dark' || theme === 'moonlight';

  r.setAttribute('data-chart-scheme', scheme.id);
  scheme.colors.forEach((color, i) => {
    const adjusted = adjustColorForTheme(color, isDark);
    r.style.setProperty(`--chart-${i + 1}`, adjusted);
  });

  const baseColorAdjusted = adjustColorForTheme(scheme.colors[0], isDark);
  r.style.setProperty('--chart-synthetic', muteOklchColor(baseColorAdjusted));
  r.style.setProperty('--destructive-synthetic', isDark ? 'oklch(0.72 0.12 25)' : 'oklch(0.5 0.12 25)');
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
  currentSchemeId = null;
  if (typeof window === 'undefined') return;
  const r = document.documentElement;
  for (let i = 1; i <= 5; i++) {
    r.style.removeProperty(`--chart-${i}`);
  }
  r.style.removeProperty('--chart-synthetic');
  r.style.removeProperty('--destructive-synthetic');
}
