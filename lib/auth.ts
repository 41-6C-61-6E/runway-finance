import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { findUser } from "./users";
import { deriveKeyFromPassword, unwrapKey, getServerKey, generateDEK, wrapKey } from "./crypto";
import { getDb } from "./db";
import { userEncryptionKeys } from "./db/schema";
import { eq } from "drizzle-orm";
import { logger } from "@/lib/logger";
import { authConfig } from "./auth.config";

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('');
}

function hexToBytes(hex: string): Uint8Array {
  return new Uint8Array(hex.match(/.{2}/g)!.map((c) => parseInt(c, 16)));
}

export const { handlers, signIn, signOut, auth } = NextAuth({
  ...authConfig,
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

          let dek: Uint8Array;

          try {
            const db = getDb();
            const [keyRow] = await db
              .select()
              .from(userEncryptionKeys)
              .where(eq(userEncryptionKeys.userId, user.username))
              .limit(1);

            if (keyRow) {
              const salt = hexToBytes(keyRow.salt);

              if (keyRow.serverWrappedDek && keyRow.serverWrappingIv && keyRow.serverWrappingTag) {
                const serverKey = getServerKey();
                dek = await unwrapKey({
                  ciphertext: keyRow.serverWrappedDek,
                  iv: keyRow.serverWrappingIv,
                  tag: keyRow.serverWrappingTag,
                }, serverKey);

                const kek = await deriveKeyFromPassword(password, salt);
                const pwdWrapped = await wrapKey(dek, kek);

                await db.update(userEncryptionKeys).set({
                  wrappedDek: pwdWrapped.ciphertext,
                  wrappingIv: pwdWrapped.iv,
                  wrappingTag: pwdWrapped.tag,
                  serverWrappedDek: null,
                  serverWrappingIv: null,
                  serverWrappingTag: null,
                  updatedAt: new Date(),
                }).where(eq(userEncryptionKeys.userId, user.username));
              } else {
                const kek = await deriveKeyFromPassword(password, salt);
                dek = await unwrapKey({
                  ciphertext: keyRow.wrappedDek,
                  iv: keyRow.wrappingIv,
                  tag: keyRow.wrappingTag,
                }, kek);
              }
            } else {
              dek = generateDEK();
              const salt = crypto.getRandomValues(new Uint8Array(32));
              const kek = await deriveKeyFromPassword(password, salt);
              const pwdWrapped = await wrapKey(dek, kek);
              const serverKey = getServerKey();
              const serverWrapped = await wrapKey(dek, serverKey);

              await db.insert(userEncryptionKeys).values({
                userId: user.username,
                wrappedDek: pwdWrapped.ciphertext,
                wrappingIv: pwdWrapped.iv,
                wrappingTag: pwdWrapped.tag,
                serverWrappedDek: serverWrapped.ciphertext,
                serverWrappingIv: serverWrapped.iv,
                serverWrappingTag: serverWrapped.tag,
                salt: bytesToHex(salt),
              });
            }
          } catch (err) {
            logger.error('Auth: DEK unwrap failed', { error: err instanceof Error ? err.message : String(err) });
            return null;
          }

          return {
            id: user.username,
            name: user.username,
            email: user.email,
            dek: bytesToHex(dek),
          };
        }
        logger.warn('Auth: failed login attempt', { username })
        return null;
      }
    })
  ],
  callbacks: {
    ...authConfig.callbacks,
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.sub;
        (session.user as any).dek = token.dek;
      }
      return session;
    },
    async jwt({ token, user }) {
      if (user) {
        token.sub = user.id;
        token.dek = (user as any).dek;
      }
      return token;
    }
  },
});
