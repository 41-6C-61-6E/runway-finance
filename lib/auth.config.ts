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
      const isOnSignin = nextUrl.pathname === "/signin";

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
