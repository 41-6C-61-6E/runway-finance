import { NextResponse } from 'next/server';
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

export async function GET() {
  try {
    let buildNumber = process.env.NEXT_PUBLIC_BUILD_NUMBER || 'dev';
    let buildTime = process.env.NEXT_PUBLIC_BUILD_TIME || new Date().toISOString();
    let commits: string[] = [];
    let history: Array<{
      hash: string;
      fullHash: string;
      author: string;
      date: string;
      message: string;
      type: string;
    }> = [];

    // Attempt to read git log directly
    try {
      const gitLogRaw = execSync('git log -n 50 --pretty=format:"%h|%H|%an|%ad|%s" --date=iso-strict', {
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

          history.push({
            hash,
            fullHash,
            author,
            date,
            message,
            type,
          });
          commits.push(message);
        }
      });
    } catch {
      // Fallback: read version-info.json if git execution fails
    }

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
        if (history.length === 0 && Array.isArray(info.history)) {
          history = info.history;
        }
        if (commits.length === 0 && Array.isArray(info.commits)) {
          commits = info.commits;
        }
      } catch {
        // file reading error ignored
      }
    }

    return NextResponse.json({
      buildNumber,
      buildTime,
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
