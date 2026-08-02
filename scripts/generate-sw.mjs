import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

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

  // Generate version-info.json with rich commit history
  let gitHistory = [];
  try {
    const gitLogRaw = execSync('git log -n 200 --pretty=format:"%h|%H|%an|%ad|%s" --date=iso-strict', { encoding: 'utf8' });
    const lines = gitLogRaw.split('\n').filter(Boolean);
    
    lines.forEach((line) => {
      const parts = line.split('|');
      if (parts.length >= 5) {
        const hash = parts[0];
        const fullHash = parts[1];
        const author = parts[2];
        const date = parts[3];
        const message = parts.slice(4).join('|');

        // Extract conventional commit type
        let type = 'other';
        const match = message.match(/^([a-z]+)(\(.*\))?:/i);
        if (match) {
          type = match[1].toLowerCase();
        }

        gitHistory.push({
          hash,
          fullHash,
          author,
          date,
          message,
          type,
        });
      }
    });
  } catch (err) {
    console.warn('Failed to retrieve git commits for version info:', err.message);
  }

  let fileHistory = [];
  try {
    const existingInfoPath = path.join(__dirname, '../public/version-info.json');
    if (fs.existsSync(existingInfoPath)) {
      const existingInfo = JSON.parse(fs.readFileSync(existingInfoPath, 'utf8'));
      if (existingInfo && Array.isArray(existingInfo.history)) {
        fileHistory = existingInfo.history;
      }
    }
  } catch (readErr) {
    console.warn('Failed to read existing version-info.json:', readErr.message);
  }

  // Merge gitHistory and fileHistory so shallow clones or CI build environments don't truncate history
  const mergedHistory = [...gitHistory];
  const knownHashes = new Set();

  mergedHistory.forEach((item) => {
    if (item.hash) knownHashes.add(item.hash.toLowerCase());
    if (item.fullHash) knownHashes.add(item.fullHash.toLowerCase());
    if (item.message && item.date) knownHashes.add(`${item.message.toLowerCase()}|${item.date}`);
  });

  fileHistory.forEach((item) => {
    const hashKey = item.hash ? item.hash.toLowerCase() : null;
    const fullHashKey = item.fullHash ? item.fullHash.toLowerCase() : null;
    const msgDateKey = item.message && item.date ? `${item.message.toLowerCase()}|${item.date}` : null;

    const isKnown =
      (hashKey && knownHashes.has(hashKey)) ||
      (fullHashKey && knownHashes.has(fullHashKey)) ||
      (msgDateKey && knownHashes.has(msgDateKey));

    if (!isKnown) {
      if (hashKey) knownHashes.add(hashKey);
      if (fullHashKey) knownHashes.add(fullHashKey);
      if (msgDateKey) knownHashes.add(msgDateKey);
      mergedHistory.push(item);
    }
  });

  const history = mergedHistory.slice(0, 200);
  const commits = history.map((item) => item.message);

  const versionInfo = {
    buildNumber: buildNum,
    buildTime: now.toISOString(),
    commits,
    history,
  };

  fs.writeFileSync(
    path.join(__dirname, '../public/version-info.json'),
    JSON.stringify(versionInfo, null, 2),
    'utf8'
  );
  console.log('Successfully generated version-info.json');
} catch (err) {
  console.error('Error generating sw.js:', err);
  process.exit(1);
}
