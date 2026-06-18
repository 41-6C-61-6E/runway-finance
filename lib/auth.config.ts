import type { NextAuthConfig } from "next-auth";
import { checkRateLimit } from "./rate-limit";

export const authConfig = {
  pages: {
    signIn: "/signin",
    error: "/signin",
  },
  trustHost: true,
  providers: [],
  callbacks: {
    authorized({ auth, request }) {
      const isLoggedIn = !!auth?.user;
      const { pathname } = request.nextUrl;

      // Rate limit auth and registration endpoints
      if (pathname.startsWith("/api/auth") || pathname.startsWith("/api/register")) {
        const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
                  ?? request.headers.get("x-real-ip")
                  ?? "unknown";
        if (!checkRateLimit(`rl:${pathname}:${ip}`, 10, 60_000)) {
          return Response.json({ error: "Too many requests" }, { status: 429 });
        }
      }

      // API routes handle their own authentication
      if (pathname.startsWith("/api/")) return true;

      if (pathname === "/signin") {
        if (isLoggedIn) {
          return Response.redirect(new URL("/", request.nextUrl));
        }
        return true;
      }

      if (isLoggedIn) return true;

      return false;
    },
  },
  secret: process.env.NEXTAUTH_SECRET || 'dev-secret-change-in-production',
} satisfies NextAuthConfig;
