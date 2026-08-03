import { NextResponse } from 'next/server';
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

export async function GET() {
  try {
    let buildNumber = process.env.NEXT_PUBLIC_BUILD_NUMBER || 'dev';
    let buildTime = process.env.NEXT_PUBLIC_BUILD_TIME || new Date().toISOString();
    let gitHistory: Array<{
      hash: string;
      fullHash: string;
      author: string;
      date: string;
      message: string;
      type: string;
    }> = [];

    // Attempt to read git log directly
    try {
      const gitLogRaw = execSync('git log -n 200 --pretty=format:"%h|%H|%an|%ad|%s" --date=iso-strict', {
        encoding: 'utf8',
      });
      const lines = gitLogRaw.split('\n').filter(Boolean);

      lines.forEach((line) => {
        const parts = line.split('|');
        if (parts.length >= 5) {
          const hash = parts[0];
          const fullHash = parts[1];
          const author = parts[2];
          const date = parts[3];
          const message = parts.slice(4).join('|');

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
    } catch {
      // Fallback: git execution failed
    }

    let fileHistory: typeof gitHistory = [];

    // Read version-info.json for fallback history or extra build details
    const versionInfoPath = path.join(process.cwd(), 'public', 'version-info.json');
    if (fs.existsSync(versionInfoPath)) {
      try {
        const fileContent = fs.readFileSync(versionInfoPath, 'utf8');
        const info = JSON.parse(fileContent);
        if (info.buildNumber && buildNumber === 'dev') {
          buildNumber = info.buildNumber;
        }
        if (info.buildTime) {
          buildTime = info.buildTime;
        }
        if (Array.isArray(info.history)) {
          fileHistory = info.history;
        }
      } catch {
        // file reading error ignored
      }
    }

    // Merge gitHistory and fileHistory, prioritizing gitHistory but preserving fileHistory for shallow clones
    const mergedHistory = [...gitHistory];
    const knownHashes = new Set<string>();

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

    return NextResponse.json({
      buildNumber,
      buildTime,
      hash: history[0]?.hash || '',
      fullHash: history[0]?.fullHash || '',
      commits,
      history,
    });
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to retrieve changelog' },
      { status: 500 }
    );
  }
}
