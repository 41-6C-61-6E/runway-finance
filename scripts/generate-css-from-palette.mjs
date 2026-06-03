import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

const palette = JSON.parse(readFileSync(join(ROOT, 'lib/colors/palette.json'), 'utf-8'));

function cssVar(key) {
  return `--${key}`;
}

function formatVarDeclarations(obj) {
  return Object.entries(obj)
    .map(([key, value]) => `  ${cssVar(key)}: ${value};`)
    .join('\n');
}

let css = `/* ── AUTO-GENERATED FROM lib/colors/palette.json ──────────────────────────── */
/* Do not edit directly. Run \`npm run generate-colors\` to regenerate. */

`;

// Light theme (:root)
css += `:root {\n`;
css += formatVarDeclarations(palette.themes.light);
css += `\n}\n\n`;

// Dark theme
css += `[data-theme=dark] {\n`;
css += formatVarDeclarations(palette.themes.dark);
css += `\n}\n\n`;

// Moonlight theme
css += `[data-theme=moonlight] {\n`;
css += formatVarDeclarations(palette.themes.moonlight);
css += `\n}\n\n`;

// Chart color schemes
for (const [schemeId, colors] of Object.entries(palette.chartSchemes)) {
  css += `[data-chart-scheme="${schemeId}"] {\n`;
  css += formatVarDeclarations(colors);
  css += `\n}\n`;
  if (schemeId !== 'vashon') css += '\n';
}

css += '\n';

writeFileSync(join(ROOT, 'styles/generated-palette.css'), css, 'utf-8');
console.log('Generated styles/generated-palette.css');
