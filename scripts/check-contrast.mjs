import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

// Parse OKLCH string
function parseOklch(str) {
  if (!str) return null;
  const match = str.match(/oklch\(\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*\)/);
  if (!match) return null;
  return {
    l: parseFloat(match[1]),
    c: parseFloat(match[2]),
    h: parseFloat(match[3])
  };
}

// Convert OKLCH to linear sRGB
function oklchToLinearSrgb(l, c, h) {
  const hRad = (h * Math.PI) / 180;
  const a = c * Math.cos(hRad);
  const b = c * Math.sin(hRad);

  const l_ = l + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = l - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = l - 0.0894841775 * a - 1.2914855480 * b;

  const l3 = Math.pow(l_, 3);
  const m3 = Math.pow(m_, 3);
  const s3 = Math.pow(s_, 3);

  const r = 4.0767416621 * l3 - 3.3077115913 * m3 + 0.2309699292 * s3;
  const g = -1.2684380046 * l3 + 2.6097574011 * m3 - 0.3413193965 * s3;
  const b_rgb = -0.0041960863 * l3 - 0.7034186147 * m3 + 1.7076147010 * s3;

  return {
    r: Math.max(0, Math.min(1, r)),
    g: Math.max(0, Math.min(1, g)),
    b: Math.max(0, Math.min(1, b_rgb))
  };
}

// Parse Hex to linear sRGB
function hexToLinearSrgb(hex) {
  const cleanHex = hex.replace('#', '');
  const r = parseInt(cleanHex.substring(0, 2), 16) / 255;
  const g = parseInt(cleanHex.substring(2, 4), 16) / 255;
  const b = parseInt(cleanHex.substring(4, 6), 16) / 255;

  const toLinear = (val) => {
    return val <= 0.03928 ? val / 12.92 : Math.pow((val + 0.055) / 1.055, 2.4);
  };

  return {
    r: toLinear(r),
    g: toLinear(g),
    b: toLinear(b)
  };
}

// Calculate relative luminance Y
function relativeLuminance(rgb) {
  return 0.2126 * rgb.r + 0.7152 * rgb.g + 0.0722 * rgb.b;
}

// Calculate contrast ratio
function contrastRatio(l1, l2) {
  const brightest = Math.max(l1, l2);
  const darkest = Math.min(l1, l2);
  return (brightest + 0.05) / (darkest + 0.05);
}

// Convert any color to linear sRGB
function toLinearSrgb(colorStr) {
  if (colorStr.startsWith('oklch')) {
    const oklch = parseOklch(colorStr);
    if (!oklch) return null;
    return oklchToLinearSrgb(oklch.l, oklch.c, oklch.h);
  } else if (colorStr.startsWith('#')) {
    return hexToLinearSrgb(colorStr);
  }
  return null;
}

// Mix two linear RGB colors
function colorMix(c1, c2, weight1) {
  return {
    r: c1.r * weight1 + c2.r * (1 - weight1),
    g: c1.g * weight1 + c2.g * (1 - weight1),
    b: c1.b * weight1 + c2.b * (1 - weight1)
  };
}

// Main execution
const palette = JSON.parse(readFileSync(join(ROOT, 'lib/colors/palette.json'), 'utf-8'));
let exitCode = 0;

console.log('=== Automated WCAG AA Contrast Audit ===');

for (const [themeName, colors] of Object.entries(palette.themes)) {
  const isDark = themeName === 'dark' || themeName === 'moonlight';
  console.log(`\nTheme: ${themeName.toUpperCase()}`);
  console.log('-----------------------------');

  const check = (name1, name2, label, minRatio = 4.5) => {
    const c1 = colors[name1];
    const c2 = colors[name2];
    const rgb1 = toLinearSrgb(c1);
    const rgb2 = toLinearSrgb(c2);
    if (!rgb1 || !rgb2) {
      console.error(`[FAIL] ${label}: Missing or invalid colors`);
      exitCode = 1;
      return;
    }
    const ratio = contrastRatio(relativeLuminance(rgb1), relativeLuminance(rgb2));
    if (ratio >= minRatio) {
      console.log(`[PASS] ${label.padEnd(30)}: ${ratio.toFixed(2)} (>= ${minRatio})`);
    } else {
      console.error(`[FAIL] ${label.padEnd(30)}: ${ratio.toFixed(2)} (< ${minRatio})`);
      exitCode = 1;
    }
  };

  // 1. Text elements on background
  check('foreground', 'background', 'foreground on background');
  check('card-foreground', 'card', 'card-foreground on card');
  check('primary-foreground', 'primary', 'primary-fg on primary');
  check('secondary-foreground', 'secondary', 'secondary-fg on secondary');
  check('muted-foreground', 'background', 'muted-fg on background');
  check('accent-foreground', 'accent', 'accent-fg on accent');
  check('destructive-foreground', 'destructive', 'destructive-fg on destructive');

  // 2. Direct text display on page background
  check('primary', 'background', 'primary text on background');
  check('destructive', 'background', 'destructive text on background', 3.0);
  check('status-positive', 'background', 'status-positive on background');
  check('status-warning', 'background', 'status-warning on background');

  // 3. Mixed badge text contrast checks
  // Badge background is 15% color tint mixed with page background.
  // Badge text is color mixed with 45% black (light theme) or 30% white (dark themes).
  const checkBadge = (colorName, label, minRatio = 4.5) => {
    const fgStr = colors[colorName];
    const bgStr = colors['background'];
    const fg = toLinearSrgb(fgStr);
    const bg = toLinearSrgb(bgStr);
    if (!fg || !bg) return;

    // Simulate badge background: 15% tint
    const badgeBg = colorMix(fg, bg, 0.15);

    // Simulate badge text: mixed with black/white depending on theme
    const mixColor = isDark ? { r: 1, g: 1, b: 1 } : { r: 0, g: 0, b: 0 };
    const mixWeight = isDark ? 0.70 : 0.35; // 30% white on dark, 65% black on light
    const badgeFg = colorMix(fg, mixColor, mixWeight);

    const ratio = contrastRatio(relativeLuminance(badgeFg), relativeLuminance(badgeBg));
    if (ratio >= minRatio) {
      console.log(`[PASS] ${label.padEnd(30)}: ${ratio.toFixed(2)} (>= ${minRatio})`);
    } else {
      console.error(`[FAIL] ${label.padEnd(30)}: ${ratio.toFixed(2)} (< ${minRatio})`);
      exitCode = 1;
    }
  };

  checkBadge('status-positive', 'status-positive badge text');
  checkBadge('status-warning', 'status-warning badge text');
  checkBadge('primary', 'primary badge text');
  checkBadge('destructive', 'destructive badge text');

  for (let i = 1; i <= 5; i++) {
    checkBadge(`chart-${i}`, `chart-${i} badge text`);
  }

  // 4. Goal badge checks (simulated on card bg-muted)
  const checkGoalBadge = (colorNameOrVal, label, minRatio = 4.5) => {
    const fgStr = (typeof colorNameOrVal === 'string' && (colorNameOrVal.startsWith('oklch') || colorNameOrVal.startsWith('#')))
      ? colorNameOrVal
      : colors[colorNameOrVal];
    const bgStr = colors['muted'];
    const fg = toLinearSrgb(fgStr);
    const bg = toLinearSrgb(bgStr);
    if (!fg || !bg) return;

    // Simulate goal badge background: 12% tint
    const badgeBg = colorMix(fg, bg, 0.12);

    // Simulate goal badge text: mixed with black/white depending on theme
    const mixColor = isDark ? { r: 1, g: 1, b: 1 } : { r: 0, g: 0, b: 0 };
    const mixWeight = isDark ? 0.60 : 0.25; // 40% white on dark, 75% black on light
    const badgeFg = colorMix(fg, mixColor, mixWeight);

    const ratio = contrastRatio(relativeLuminance(badgeFg), relativeLuminance(badgeBg));
    if (ratio >= minRatio) {
      console.log(`[PASS] ${label.padEnd(30)}: ${ratio.toFixed(2)} (>= ${minRatio})`);
    } else {
      console.error(`[FAIL] ${label.padEnd(30)}: ${ratio.toFixed(2)} (< ${minRatio})`);
      exitCode = 1;
    }
  };

  console.log('\nGoal Badges (Default Theme Colors):');
  checkGoalBadge('chart-1', 'Goal Savings (Default)');
  checkGoalBadge('chart-3', 'Goal Active/Investment (Default)');
  checkGoalBadge('chart-4', 'Goal Other (Default)');
  checkGoalBadge('chart-5', 'Goal Payoff (Default)');
  checkGoalBadge('status-positive', 'Goal Done (Default)');
  checkGoalBadge('chart-2', 'Goal Pending (Default)');

  console.log('\nGoal Badges across all Chart Schemes:');
  for (const [schemeName, schemeColors] of Object.entries(palette.chartSchemes)) {
    checkGoalBadge(schemeColors['chart-1'], `Goal Savings (${schemeName} scheme)`);
    checkGoalBadge(schemeColors['chart-3'], `Goal Active (${schemeName} scheme)`);
  }
}

console.log('\n=======================================');
if (exitCode === 0) {
  console.log('🎉 All contrast audits passed successfully!');
} else {
  console.error('❌ Contrast audit failures detected. Please adjust colors.');
}

process.exit(exitCode);
