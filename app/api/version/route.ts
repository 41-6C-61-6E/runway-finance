import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export async function GET() {
  let buildNumber = process.env.NEXT_PUBLIC_BUILD_NUMBER || process.env.BUILD_NUMBER || 'dev';
  let buildTime = process.env.NEXT_PUBLIC_BUILD_TIME || process.env.BUILD_TIME || new Date().toISOString();
  let hash = process.env.NEXT_PUBLIC_COMMIT_HASH || '';

  const versionInfoPath = path.join(process.cwd(), 'lib', 'generated', 'version-info.json');
  if (fs.existsSync(versionInfoPath)) {
    try {
      const data = JSON.parse(fs.readFileSync(versionInfoPath, 'utf8'));
      if (data.buildNumber && buildNumber === 'dev') {
        buildNumber = data.buildNumber;
      }
      if (data.buildTime) {
        buildTime = data.buildTime;
      }
      if (data.hash && !hash) {
        hash = data.hash;
      }
    } catch {}
  }

  return NextResponse.json({
    buildNumber,
    buildTime,
    hash,
  });
}
