import NextAuth from "next-auth";
import { authConfig } from "@/lib/auth.config";
import { NextResponse, type NextRequest } from "next/server";
import { checkRateLimit, checkGlobalRateLimit, getClientIp } from "@/lib/rate-limit";

// Delegate page-level authentication and routing to NextAuth
const authHandler = NextAuth(authConfig).auth(async () => {
  return NextResponse.next();
});

export default async function proxy(request: NextRequest, event?: any) {
  const { pathname } = request.nextUrl;

  // 1. Dedicated handling for /api/auth/* endpoints.
  // NextAuth Route Handlers (/api/auth/*) manage their own session and CSRF lifecycle.
  // We must NOT invoke NextAuth(authConfig).auth() middleware on these endpoints because
  // NextAuth middleware executes getSession() on every request, which generates competing
  // CSRF tokens and corrupts the double-submit cookie verification during credentials signin.
  // Rate limiting for auth endpoints is enforced here directly.
  if (pathname.startsWith('/api/auth')) {
    if (
      !pathname.startsWith('/api/auth/session') &&
      !pathname.startsWith('/api/auth/csrf') &&
      !pathname.startsWith('/api/auth/providers')
    ) {
      const ip = getClientIp(request);
      if (
        !(await checkRateLimit(`rl:${pathname}:${ip}`, 10, 60_000)) ||
        !(await checkGlobalRateLimit('auth:auth', 60, 60_000))
      ) {
        return new NextResponse(
          JSON.stringify({ error: "Too many requests" }),
          { status: 429, headers: { 'Content-Type': 'application/json' } }
        );
      }
    }
    return NextResponse.next();
  }

  // 2. Centralized CSRF check for state-changing operations on API routes.
  if (
    pathname.startsWith('/api/') &&
    ['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method)
  ) {
    const origin = request.headers.get('origin');
    const referer = request.headers.get('referer');
    const host = request.headers.get('host');
    const forwardedHost = request.headers.get('x-forwarded-host');
    const secFetchSite = request.headers.get('sec-fetch-site');

    if (!host) {
      return new NextResponse(
        JSON.stringify({ error: 'CSRF_ERROR', message: 'Missing Host header' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const allowedOrigins = new Set<string>();

    // 1. Allowed origins from Host header
    allowedOrigins.add(`http://${host}`);
    allowedOrigins.add(`https://${host}`);

    // 2. Allowed origins from NEXTAUTH_URL / APP_URL if configured
    const configuredUrls = [process.env.NEXTAUTH_URL, process.env.NEXT_PUBLIC_APP_URL, process.env.APP_URL].filter(Boolean) as string[];
    for (const urlStr of configuredUrls) {
      try {
        const parsed = new URL(urlStr);
        allowedOrigins.add(parsed.origin);
      } catch {}
    }

    // 3. In non-production, permit loopback alias variants
    if (process.env.NODE_ENV !== 'production') {
      const [hostname, port] = host.split(':');
      const portSuffix = port ? `:${port}` : '';
      const loopbacks = ['localhost', '127.0.0.1', '0.0.0.0', '[::1]'];
      if (loopbacks.includes(hostname)) {
        for (const lb of loopbacks) {
          allowedOrigins.add(`http://${lb}${portSuffix}`);
          allowedOrigins.add(`https://${lb}${portSuffix}`);
        }
      }
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

    // 3. Fall back to browser-enforced same-origin metadata ONLY (never cross-origin same-site)
    if (!verified && secFetchSite === 'same-origin') {
      verified = true;
    }

    if (!verified) {
      console.warn(
        `[CSRF Block] State-changing request blocked on ${pathname}. ` +
        `Method: ${request.method}, Origin: ${origin || 'none'}, Referer: ${referer || 'none'}, Host: ${host || 'none'}`
      );
      return new NextResponse(
        JSON.stringify({ error: 'CSRF_ERROR', message: 'Invalid or missing Origin/Referer header' }),
        { status: 403, headers: { 'Content-Type': 'application/json' } }
      );
    }
  }

  // 3. Server-side body-size cap for large upload endpoints (defense in depth —
  // the client also enforces its own limits). Rejects oversized payloads early,
  // before they reach the route handler and consume memory/CPU.
  if (
    request.method === 'POST' &&
    (pathname.startsWith('/api/import/execute') ||
     pathname.startsWith('/api/import/upload') ||
     pathname.startsWith('/api/backup/import'))
  ) {
    // M-5 (2026-08-27 security review): the cap is now LENGTH-INDEPENDENT.
    // A request without a Content-Length header (chunked transfer
    // encoding) was previously skipped entirely. If we cannot determine
    // the declared size we reject: legitimate clients always know the
    // size of their upload buffer, so chunked bodies here are a DoS
    // vector rather than a normal flow.
    const MAX_BODY_BYTES = 100 * 1024 * 1024; // 100 MB hard cap
    const contentLength = request.headers.get('content-length');
    if (contentLength) {
      const size = parseInt(contentLength, 10);
      if (isNaN(size)) {
        return new NextResponse(
          JSON.stringify({ error: 'BAD_REQUEST', message: 'Invalid Content-Length header.' }),
          { status: 400, headers: { 'Content-Type': 'application/json' } }
        );
      }
      if (size > MAX_BODY_BYTES) {
        return new NextResponse(
          JSON.stringify({ error: 'PAYLOAD_TOO_LARGE', message: 'Request body is too large.' }),
          { status: 413, headers: { 'Content-Type': 'application/json' } }
        );
      }
    } else if (request.headers.get('transfer-encoding') !== 'identity') {
      return new NextResponse(
        JSON.stringify({ error: 'PAYLOAD_TOO_LARGE', message: 'This endpoint requires a Content-Length header; chunked uploads are not supported.' }),
        { status: 413, headers: { 'Content-Type': 'application/json' } }
      );
    }
  }

  // 4. Delegate page routing and session authorization to NextAuth middleware
  return (authHandler as any)(request, event);
}

export { proxy };

export const config = {
  // Run on all paths except static files, but explicitly including api routes
  matcher: ["/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|manifest.json).*)"],
};
