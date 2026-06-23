import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const templatePath = path.join(__dirname, '../public/sw.template.js');
const outputPath = path.join(__dirname, '../public/sw.js');

try {
  let template = fs.readFileSync(templatePath, 'utf8');

  // Generate build number: YY.MM.timestamp
  const now = new Date();
  const yy = String(now.getFullYear()).slice(-2);
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const buildNum = process.env.BUILD_NUMBER || `${yy}.${mm}.${now.getTime()}`;

  const result = template.replace(/\{\{BUILD_NUMBER\}\}/g, buildNum);
  fs.writeFileSync(outputPath, result, 'utf8');
  console.log(`Successfully generated sw.js with BUILD_NUMBER=${buildNum}`);
} catch (err) {
  console.error('Error generating sw.js:', err);
  process.exit(1);
}
