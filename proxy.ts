import { NextResponse } from "next/server";

export const proxy = async (req) => {
  const { auth } = await import("@/lib/auth");
  const session = await auth();
  const { pathname } = req.nextUrl;

  // Allow access to /signin for everyone
  if (pathname === "/signin") {
    return NextResponse.next();
  }

  // Allow access to /api/register for everyone
  if (pathname.startsWith("/api/register")) {
    return NextResponse.next();
  }


  // If no session, redirect to /signin for any protected route
  if (!session) {
    const signInUrl = new URL("/signin", req.nextUrl.origin);
    signInUrl.searchParams.set("callbackUrl", req.nextUrl.href);
    return NextResponse.redirect(signInUrl);
  }

  // If session exists and user is on /signin, redirect to /
  if (session && pathname === "/signin") {
    return NextResponse.redirect(new URL("/", req.nextUrl.origin));
  }

  return NextResponse.next();
};

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * 1. /signin (the sign-in page itself)
     * 2. /api/auth/* (NextAuth API routes)
     * 3. /api/register (public registration endpoint)
     * 4. /_next/* (Next.js internals)
     * 5. /favicon.ico, robots.txt, etc.
     */
    "/((?!_next|favicon.ico|robots.txt|sitemap.xml|manifest.json|api/auth|signin$).*)",
  ],
};
