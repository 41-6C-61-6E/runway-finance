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

    if (!host) {
      return new NextResponse(
        JSON.stringify({ error: 'CSRF_ERROR', message: 'Missing Host header' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Determine allowed origins dynamically based on the current Host
    const allowedOrigins = new Set<string>();
    allowedOrigins.add(`http://${host}`);
    allowedOrigins.add(`https://${host}`);

    // Fallback/additional check using NEXTAUTH_URL if configured
    const nextAuthUrl = process.env.NEXTAUTH_URL;
    if (nextAuthUrl) {
      try {
        const parsed = new URL(nextAuthUrl);
        allowedOrigins.add(parsed.origin);
      } catch {}
    }

    let verified = false;

    // Verify against Origin header first (if present)
    if (origin) {
      if (allowedOrigins.has(origin)) {
        verified = true;
      }
    } 
    // Fall back to Referer header if Origin is absent
    else if (referer) {
      try {
        const refererUrl = new URL(referer);
        if (allowedOrigins.has(refererUrl.origin)) {
          verified = true;
        }
      } catch {}
    }

    if (!verified) {
      console.warn(
        `[CSRF Block] State-changing request blocked on ${pathname}. ` +
        `Method: ${request.method}, Origin: ${origin || 'none'}, Referer: ${referer || 'none'}, Host: ${host}`
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
