import type { BrowserContext } from '@playwright/test';
import { encode } from 'next-auth/jwt';

/**
 * Adds a valid NextAuth v5 session cookie for `demo01` (or specified user)
 * to a Playwright BrowserContext so authenticated routes render directly.
 */
export async function authenticateContext(
  context: BrowserContext,
  options: { username?: string; tokenVersion?: number; baseUrl?: string } = {}
): Promise<void> {
  const username = options.username || process.env.UI_CAPTURE_USER || 'demo01';
  const tokenVersion = options.tokenVersion ?? 1;
  const baseUrl = options.baseUrl || process.env.BASE_URL || 'http://localhost:3001';
  const secret = process.env.NEXTAUTH_SECRET || 'dev-secret-change-in-production';
  const cookieName = 'authjs.session-token';

  const token = await encode({
    secret,
    salt: cookieName,
    token: {
      name: username,
      email: `${username}@example.com`,
      sub: username,
      tokenVersion,
    },
    maxAge: 30 * 24 * 60 * 60,
  });

  const parsed = new URL(baseUrl);
  await context.addCookies([
    {
      name: cookieName,
      value: token,
      domain: parsed.hostname,
      path: '/',
      expires: Math.floor(Date.now() / 1000) + 86400,
      httpOnly: true,
      secure: parsed.protocol === 'https:',
      sameSite: 'Lax',
    },
  ]);
}
