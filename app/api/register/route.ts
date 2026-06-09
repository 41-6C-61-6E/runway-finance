import { NextResponse } from 'next/server';
import { addUser, findUser, createUserEncryptionKeys, rewrapDekForUser } from '@/lib/users';
import { logger } from '@/lib/logger';
import { timingSafeEqual } from 'crypto';
import { getDb } from '@/lib/db';
import { userSettings } from '@/lib/db/schema';
import { DEFAULTS } from '@/config/defaults';
import { seedUserCategories } from '@/lib/db/seed-categories';
import { seedUserDefaultRules } from '@/lib/db/seed-default-rules';
import { seedUserAiProviders } from '@/lib/db/seed-ai-providers';
import { validateInvitation, acceptInvitation } from '@/lib/sharing';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { username, password, email, pin, sharingEmail, sharingPin } = body;

    logger.debug('Register API: request received', { username, email, isSharedJoin: !!(sharingEmail && sharingPin) });

    if (!username || !password) {
      logger.warn('Register API: missing username or password');
      return NextResponse.json({ message: 'Username and password are required' }, { status: 400 });
    }

    // ── Shared account join path ────────────────────────────────────────────
    if (sharingEmail && sharingPin) {
      const existingUser = await findUser(username);
      if (existingUser) {
        logger.warn('Register API: username already taken in sharing path', { username });
        return NextResponse.json({ message: 'Registration failed' }, { status: 400 });
      }

      const result = await validateInvitation(sharingEmail, sharingPin);
      if (result.valid === false) {
        logger.warn('Register API: sharing invitation validation failed', { sharingEmail });
        return NextResponse.json({ message: 'Registration failed' }, { status: 400 });
      }

      const { invitationId, inviterUserId } = result;

      // Create the user account
      await addUser({ username, password, email: email || sharingEmail });

      // Wrap the primary user's DEK for the new member — no new DEK generated
      await rewrapDekForUser(username, password, inviterUserId);

      // Accept invitation and create share-member record
      await acceptInvitation(invitationId, inviterUserId, username);

      // Seed only AI providers and personal settings (NOT categories/rules — they share the primary's)
      await seedUserAiProviders(username);

      const db = getDb();
      await db.insert(userSettings).values({
        userId: username,
        currency: DEFAULTS.currency,
        locale: DEFAULTS.locale,
        timezone: DEFAULTS.timezone,
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
        showMathEnabled: DEFAULTS.showMathEnabled,
      });

      logger.info('Register API: shared account member created', { username, inviterUserId });
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
      timezone: DEFAULTS.timezone,
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
      showMathEnabled: DEFAULTS.showMathEnabled,
    });

    logger.info('Register API: user created', { username });
    return NextResponse.json({ message: 'User created successfully' }, { status: 201 });
  } catch (error) {
    logger.error('Register API: error', { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json({ message: 'Internal server error' }, { status: 500 });
  }
}
