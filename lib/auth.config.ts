import type { NextAuthConfig } from "next-auth";

export const authConfig = {
  pages: {
    signIn: "/signin",
    error: "/signin",
  },
  trustHost: true,
  providers: [],
  callbacks: {
    authorized({ auth, request: { nextUrl } }) {
      const isLoggedIn = !!auth?.user;
      const { pathname } = nextUrl;
      const isOnSignin = pathname === "/signin";
      
      // Allow access to dev-mode and dev-log APIs without a session
      if (pathname.startsWith("/api/dev-")) {
        return true;
      }

      if (isOnSignin) {
        if (isLoggedIn) {
          return Response.redirect(new URL("/", nextUrl));
        }
        return true;
      }

      if (isLoggedIn) return true;

      return false;
    },
  },
  secret: process.env.NEXTAUTH_SECRET || 'dev-secret-change-in-production',
} satisfies NextAuthConfig;
