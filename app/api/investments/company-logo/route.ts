import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';

/**
 * Proxies company logos / favicons from a domain (e.g. "stokespace.com") or direct image URL
 * so that images are served from 'self' and comply with the app's strict CSP (`img-src 'self' blob: data:`).
 */
export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return new NextResponse('Unauthorized', { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const rawQuery = (searchParams.get('q') || '').trim();
  if (!rawQuery) {
    return new NextResponse('Missing query', { status: 400 });
  }

  // Determine whether `q` is a direct image URL or a company domain / website URL
  let domain: string | null = null;
  let directImageUrl: string | null = null;

  if (/^https?:\/\//i.test(rawQuery)) {
    try {
      const parsed = new URL(rawQuery);
      if (/\.(png|jpe?g|svg|webp|gif|ico)(\?.*)?$/i.test(parsed.pathname)) {
        directImageUrl = parsed.toString();
      } else {
        domain = parsed.hostname.replace(/^www\./i, '');
      }
    } catch {
      return new NextResponse('Invalid URL', { status: 400 });
    }
  } else {
    // Strip any accidental protocol/path and extract hostname
    const cleaned = rawQuery
      .replace(/^https?:\/\//i, '')
      .replace(/^www\./i, '')
      .split('/')[0]
      .trim()
      .toLowerCase();
    if (/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(cleaned)) {
      domain = cleaned;
    }
  }

  const candidateUrls: string[] = [];
  if (directImageUrl) {
    candidateUrls.push(directImageUrl);
  }
  if (domain) {
    candidateUrls.push(
      `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=128`,
      `https://icons.duckduckgo.com/ip3/${encodeURIComponent(domain)}.ico`
    );
  }

  for (const url of candidateUrls) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);
      const res = await fetch(url, {
        signal: controller.signal,
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; RunwayFinance/1.0)',
          Accept: 'image/*,*/*;q=0.8',
        },
      });
      clearTimeout(timeout);

      if (!res.ok) continue;
      const contentType = res.headers.get('content-type') || 'image/png';
      if (!contentType.startsWith('image/') && !contentType.includes('icon')) {
        continue;
      }
      const buffer = await res.arrayBuffer();
      if (buffer.byteLength === 0 || buffer.byteLength > 2 * 1024 * 1024) {
        continue;
      }

      return new NextResponse(buffer, {
        status: 200,
        headers: {
          'Content-Type': contentType,
          'Cache-Control': 'public, max-age=86400, stale-while-revalidate=604800',
        },
      });
    } catch {
      // Try next candidate
    }
  }

  return new NextResponse('Logo not found', { status: 404 });
}

