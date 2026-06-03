import palette from './palette.json';

export type ThemeId = keyof typeof palette.themes;
export type AccentId = keyof typeof palette.accents;
export type ChartSchemeId = keyof typeof palette.chartSchemes;

export const ACCENT_NAMES = Object.keys(palette.accents) as AccentId[];

export const ACCENTS = palette.accents;

export const CHART_COLOR_SCHEMES = palette.chartSchemes;

export const THEME_ACCENT_MAP = palette.themeAccentMap;

export const CATEGORY_COLORS = palette.categories.palette;

export const CATEGORY_PARENT_PALETTE = palette.categories.parentPalette;

export const TAG_PRESETS = palette.tags.presets;

export const SEMANTIC = palette.semantic;

export function getTheme(theme: ThemeId) {
  return palette.themes[theme];
}

export function getAccent(name: AccentId) {
  return palette.accents[name];
}

export function getChartSchemeColors(id: ChartSchemeId) {
  return palette.chartSchemes[id];
}
