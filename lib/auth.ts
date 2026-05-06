import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { findUser, addUser } from "./users";

export const { handlers, signIn, signOut, auth } = NextAuth({
  providers: [
    Credentials({
      name: 'Credentials',
      credentials: {
        username: { label: "Username", type: "text" },
        password: { label: "Password", type: "password" }
      },
      async authorize(credentials) {
        const user = await findUser(credentials.username as string);
        if (user && user.password === credentials.password) {
          return { id: user.username, name: user.username, email: user.email };
        }
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
