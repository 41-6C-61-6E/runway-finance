import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { findUser, addUser } from "./users";
import { logger } from "./logger";
import { initDb } from "./db";

initDb().catch(err => logger.error('Auth: failed to initialize database:', { error: err instanceof Error ? err.message : String(err) }));

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
        logger.debug('Auth: authorize called', { username: credentials?.username })
        if (!credentials?.username || !credentials?.password) {
          logger.warn('Auth: missing credentials')
          return null;
        }
        const username = credentials.username as string;
        const password = credentials.password as string;
        const user = await findUser(username);
        if (user && await bcrypt.compare(password, user.password_hash)) {
          logger.info('Auth: successful login', { username: user.username })
          return { id: user.username, name: user.username, email: user.email };
        }
        logger.warn('Auth: failed login attempt', { username })
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
