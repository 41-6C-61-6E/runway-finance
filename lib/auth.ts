import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { findUser, addUser } from "./users";
import { debugLog, debugInfo, debugWarn, debugError } from "./debug";
import { initDb } from "./db";

// Initialize database on startup
initDb().catch(err => debugError('Auth: failed to initialize database:', err));

export const { handlers, signIn, signOut, auth } = NextAuth({
  secret: process.env.NEXTAUTH_SECRET || 'dev-secret-change-in-production',
  trustHost: true,
  providers: [
    Credentials({
      name: 'Credentials',
      credentials: {
        username: { label: "Username", type: "text" },
        password: { label: "Password", type: "password" }
      },
      async authorize(credentials) {
        debugLog('Auth: authorize called with username:', credentials?.username)
        if (!credentials?.username || !credentials?.password) {
          debugWarn('Auth: missing credentials')
          return null;
        }
        const username = credentials.username as string;
        const password = credentials.password as string;
        const user = await findUser(username);
        if (user && await bcrypt.compare(password, user.password_hash)) {
          debugInfo('Auth: successful login for user:', user.username)
          return { id: user.username, name: user.username, email: user.email };
        }
        debugWarn('Auth: failed login attempt for username:', username)
        return null;
      }
    })
  ],
  callbacks: {
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.sub;
      }
      return session;
    },
    async jwt({ token, user }) {
      if (user) {
        token.sub = user.id;
      }
      return token;
    }
  },
  pages: {
    signIn: '/signin',
    error: '/signin'
  }
});
