import NextAuth from "next-auth";
import { authConfig } from "@/lib/auth.config";
import { NextResponse } from "next/server";

export default NextAuth(authConfig).auth(async (request) => {
  const { pathname } = request.nextUrl;

  // 1. Centralized CSRF check for state-changing operations on API routes.
  // Exclude internal Auth.js endpoints under /api/auth which manage their own CSRF checks.
  if (
    pathname.startsWith('/api/') &&
    !pathname.startsWith('/api/auth/') &&
    ['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method)
  ) {
    const origin = request.headers.get('origin');
    const referer = request.headers.get('referer');
    const host = request.headers.get('host');
    const forwardedHost = request.headers.get('x-forwarded-host');
    const secFetchSite = request.headers.get('sec-fetch-site');

    if (!host && !forwardedHost) {
      return new NextResponse(
        JSON.stringify({ error: 'CSRF_ERROR', message: 'Missing Host header' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Determine allowed origins dynamically based on Host and X-Forwarded-Host
    const allowedOrigins = new Set<string>();

    const rawHosts: string[] = [];
    if (host) rawHosts.push(host);
    if (forwardedHost) {
      forwardedHost.split(',').forEach((h) => rawHosts.push(h.trim()));
    }

    for (const h of rawHosts) {
      if (!h) continue;
      allowedOrigins.add(`http://${h}`);
      allowedOrigins.add(`https://${h}`);

      // Handle loopback alias hostnames/IPs (localhost, 127.0.0.1, 0.0.0.0, [::1])
      const [hostname, port] = h.split(':');
      const portSuffix = port ? `:${port}` : '';
      const loopbacks = ['localhost', '127.0.0.1', '0.0.0.0', '[::1]'];
      if (loopbacks.includes(hostname)) {
        for (const lb of loopbacks) {
          allowedOrigins.add(`http://${lb}${portSuffix}`);
          allowedOrigins.add(`https://${lb}${portSuffix}`);
        }
      }
    }

    // Fallback/additional check using NEXTAUTH_URL if configured
    const nextAuthUrl = process.env.NEXTAUTH_URL;
    if (nextAuthUrl) {
      try {
        const parsed = new URL(nextAuthUrl);
        allowedOrigins.add(parsed.origin);
      } catch {}
    }

    let verified = false;

    // 1. Verify against Origin header first (if present and not 'null')
    if (origin && origin !== 'null') {
      if (allowedOrigins.has(origin)) {
        verified = true;
      }
    }

    // 2. Fall back to Referer header if Origin is absent, 'null', or not matched
    if (!verified && referer && referer !== 'null') {
      try {
        const refererUrl = new URL(referer);
        if (allowedOrigins.has(refererUrl.origin)) {
          verified = true;
        }
      } catch {}
    }

    // 3. Fall back to Sec-Fetch-Site header (browser-enforced same-site metadata)
    if (!verified && (secFetchSite === 'same-origin' || secFetchSite === 'same-site')) {
      verified = true;
    }

    if (!verified) {
      console.warn(
        `[CSRF Block] State-changing request blocked on ${pathname}. ` +
        `Method: ${request.method}, Origin: ${origin || 'none'}, Referer: ${referer || 'none'}, Host: ${host || 'none'}, Forwarded-Host: ${forwardedHost || 'none'}`
      );
      return new NextResponse(
        JSON.stringify({ error: 'CSRF_ERROR', message: 'Invalid or missing Origin/Referer header' }),
        { status: 403, headers: { 'Content-Type': 'application/json' } }
      );
    }
  }

  return NextResponse.next();
});

export const config = {
  // Run on all paths except static files, but explicitly including api routes
  matcher: ["/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|manifest.json).*)"],
};
