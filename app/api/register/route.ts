import { NextResponse } from 'next/server';
import { addUser, findUser, createUserEncryptionKeys, rewrapDekForUser } from '@/lib/users';
import { logger } from '@/lib/logger';
import { timingSafeEqual } from 'crypto';
import { getDb, getPool } from '@/lib/db';
import { drizzle } from 'drizzle-orm/node-postgres';
import * as schema from '@/lib/db/schema';
import { userSettings } from '@/lib/db/schema';
import { DEFAULTS } from '@/config/defaults';
import { seedUserCategories } from '@/lib/db/seed-categories';
import { seedUserDefaultRules } from '@/lib/db/seed-default-rules';
import { seedUserAiProviders } from '@/lib/db/seed-ai-providers';
import { validateInvitation, validateJoinToken, acceptInvitation } from '@/lib/sharing';
import { logShareAudit, SHARE_AUDIT_ACTIONS } from '@/lib/share-audit';
import { checkRateLimit, getClientIp } from '@/lib/rate-limit';

export async function POST(request: Request) {
  try {
    const ip = getClientIp(request);

    if (!(await checkRateLimit(`register:${ip}`, 5, 60_000))) {
      logger.warn('Register API: rate limit exceeded', { ip });
      return NextResponse.json(
        { message: 'Too many registration attempts. Please try again in a minute.' },
        { status: 429 }
      );
    }

    const body = await request.json();
    let { username, password, email, pin, sharingEmail, sharingPin, joinToken, timezone } = body;

    if (email && typeof email === 'string') {
      email = email.trim().normalize('NFKC');
    }
    if (sharingEmail && typeof sharingEmail === 'string') {
      sharingEmail = sharingEmail.trim().normalize('NFKC').toLowerCase();
    }
    if (joinToken && typeof joinToken === 'string') {
      joinToken = joinToken.trim();
    }

    logger.debug('Register API: request received', { username, email, isSharedJoin: !!(joinToken || (sharingEmail && sharingPin)) });

    if (!username || !password) {
      logger.warn('Register API: missing username or password');
      return NextResponse.json({ message: 'Username and password are required' }, { status: 400 });
    }

    // ── Shared account join path ────────────────────────────────────────────
    // Two delivery mechanisms for the same invitation: a one-time join token
    // (from a shareable link) or an email + 8-digit PIN (out-of-band fallback).
    // This path intentionally bypasses ALLOW_REGISTRATION.
    if (joinToken || (sharingEmail && sharingPin)) {
      const existingUser = await findUser(username);
      if (existingUser) {
        logger.warn('Register API: username already taken in sharing path', { username });
        return NextResponse.json({ message: 'Registration failed' }, { status: 400 });
      }

      let invitationId: string;
      let inviterUserId: string;
      let inviteEmail: string;

      if (joinToken) {
        const result = await validateJoinToken(joinToken);
        if (result.valid === false) {
          logger.warn('Register API: join token validation failed');
          return NextResponse.json({ message: 'Registration failed' }, { status: 400 });
        }
        invitationId = result.invitationId;
        inviterUserId = result.inviterUserId;
        inviteEmail = result.inviteeEmail;
      } else {
        const result = await validateInvitation(sharingEmail, sharingPin);
        if (result.valid === false) {
          logger.warn('Register API: sharing invitation validation failed', { sharingEmail });
          return NextResponse.json({ message: 'Registration failed' }, { status: 400 });
        }
        invitationId = result.invitationId;
        inviterUserId = result.inviterUserId;
        inviteEmail = sharingEmail;
      }

      await completeSharingJoin({
        username,
        password,
        email: email || inviteEmail,
        invitationId,
        inviterUserId,
        timezone,
      });

      return NextResponse.json({ message: 'User created successfully' }, { status: 201 });
    }

    // ── Standard registration path ──────────────────────────────────────────

    if (process.env.ALLOW_REGISTRATION === 'false') {
      logger.warn('Register API: registration is disabled');
      return NextResponse.json({ message: 'Registration failed' }, { status: 400 });
    }

    const requiredPin = process.env.REGISTRATION_PIN;
    if (requiredPin && requiredPin.length > 0) {
      if (!pin) {
        logger.warn('Register API: missing registration PIN');
        return NextResponse.json({ message: 'Registration failed' }, { status: 400 });
      }
      const pinBuffer = Buffer.from(pin);
      const requiredPinBuffer = Buffer.from(requiredPin);
      if (pinBuffer.length !== requiredPinBuffer.length || !timingSafeEqual(pinBuffer, requiredPinBuffer)) {
        logger.warn('Register API: invalid registration PIN');
        return NextResponse.json({ message: 'Registration failed' }, { status: 400 });
      }
    }

    const existingUser = await findUser(username);
    if (existingUser) {
      logger.warn('Register API: user already exists', { username });
      return NextResponse.json({ message: 'Registration failed' }, { status: 400 });
    }

    await addUser({ username, password, email });
    await createUserEncryptionKeys(username, password);
    await seedUserCategories(username);
    await seedUserDefaultRules(username);
    await seedUserAiProviders(username);

    const db = getDb();
    await db.insert(userSettings).values({
      userId: username,
      currency: DEFAULTS.currency,
      locale: DEFAULTS.locale,
      timezone: timezone || DEFAULTS.timezone,
      theme: DEFAULTS.theme,
      accentColor: DEFAULTS.accentColor,
      compactMode: DEFAULTS.compactMode,
      dateFormat: DEFAULTS.dateFormat,
      privacyMode: DEFAULTS.privacyMode,
      chartVisibility: DEFAULTS.chartVisibility,
      chartColorScheme: DEFAULTS.chartColorScheme,
      forecastMode: DEFAULTS.forecastMode,
      forecastLookbackMonths: DEFAULTS.forecastLookbackMonths,
      hiddenPages: DEFAULTS.hiddenPages,
      showSyntheticData: DEFAULTS.showSyntheticData,
      defaultChartTimeRange: DEFAULTS.defaultChartTimeRange,
      defaultChartType: DEFAULTS.defaultChartType,
      reduceTransparency: DEFAULTS.reduceTransparency,
      hideAccountSubheadings: DEFAULTS.hideAccountSubheadings,
      hideAccountsSidebarByDefault: DEFAULTS.hideAccountsSidebarByDefault,
      chartSelections: DEFAULTS.chartSelections,
    });

    logger.info('Register API: user created', { username });
    return NextResponse.json({ message: 'User created successfully' }, { status: 201 });
  } catch (error) {
    logger.error('Register API: error', { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json({ message: 'Internal server error' }, { status: 500 });
  }
}

/**
 * Complete a sharing join: create the user account, wrap the primary's DEK
 * for the new member, and record the membership — all in ONE transaction so
 * a crash cannot leave a "ghost member" (a key row pointing at the primary
 * with no membership row). Then write the audit row and seed the member's
 * personal-only settings.
 */
async function completeSharingJoin(params: {
  username: string;
  password: string;
  email?: string;
  invitationId: string;
  inviterUserId: string;
  timezone?: string;
}): Promise<void> {
  const { username, password, email, invitationId, inviterUserId, timezone } = params;

  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    await addUser({ username, password, email }, client);
    const txDb = drizzle(client, { schema });
    await rewrapDekForUser(username, password, inviterUserId, txDb);
    const acceptResult = await acceptInvitation(invitationId, inviterUserId, username, txDb);
    if (acceptResult && 'error' in acceptResult) {
      throw new Error(acceptResult.error);
    }
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }

  await logShareAudit(inviterUserId, username, SHARE_AUDIT_ACTIONS.MEMBER_JOINED, 'account_share_members');

  // Seed only AI providers and personal settings (NOT categories/rules — they share the primary's)
  await seedUserAiProviders(username);

  const db = getDb();
  await db.insert(userSettings).values({
    userId: username,
    currency: DEFAULTS.currency,
    locale: DEFAULTS.locale,
    timezone: timezone || DEFAULTS.timezone,
    theme: DEFAULTS.theme,
    accentColor: DEFAULTS.accentColor,
    compactMode: DEFAULTS.compactMode,
    dateFormat: DEFAULTS.dateFormat,
    privacyMode: DEFAULTS.privacyMode,
    chartVisibility: DEFAULTS.chartVisibility,
    chartColorScheme: DEFAULTS.chartColorScheme,
    forecastMode: DEFAULTS.forecastMode,
    forecastLookbackMonths: DEFAULTS.forecastLookbackMonths,
    hiddenPages: DEFAULTS.hiddenPages,
    showSyntheticData: DEFAULTS.showSyntheticData,
    defaultChartTimeRange: DEFAULTS.defaultChartTimeRange,
    defaultChartType: DEFAULTS.defaultChartType,
    reduceTransparency: DEFAULTS.reduceTransparency,
    hideAccountSubheadings: DEFAULTS.hideAccountSubheadings,
    hideAccountsSidebarByDefault: DEFAULTS.hideAccountsSidebarByDefault,
    chartSelections: DEFAULTS.chartSelections,
  });

  logger.info('Register API: shared account member created', { username, inviterUserId });
}
