import { NextResponse } from 'next/server';
import { addUser, findUser, createUserEncryptionKeys } from '@/lib/users';
import { logger } from '@/lib/logger';
import { timingSafeEqual } from 'crypto';
import { getDb } from '@/lib/db';
import { userSettings } from '@/lib/db/schema';
import { DEFAULTS } from '@/config/defaults';
import { seedUserCategories } from '@/lib/db/seed-categories';
import { seedUserDefaultRules } from '@/lib/db/seed-default-rules';
import { seedUserAiProviders } from '@/lib/db/seed-ai-providers';
import { checkGlobalRateLimit, checkRateLimit, getClientIp } from '@/lib/rate-limit';
import { checkPasswordPolicy } from '@/lib/password-policy';

export async function POST(request: Request) {
  try {
    const ip = getClientIp(request);

    if (
      !(await checkRateLimit(`register:${ip}`, 5, 60_000)) ||
      // Non-identity backstop (H-1): caps total registrations even under IP rotation.
      !(await checkGlobalRateLimit('register', 30, 60_000))
    ) {
      logger.warn('Register API: rate limit exceeded', { ip });
      return NextResponse.json(
        { message: 'Too many registration attempts. Please try again in a minute.' },
        { status: 429 }
      );
    }

    const body = await request.json();
    let { username, password, email, pin, timezone } = body;

    if (email && typeof email === 'string') {
      email = email.trim().normalize('NFKC');
    }

    logger.debug('Register API: request received', { username, email });

    if (!username || !password) {
      logger.warn('Register API: missing username or password');
      return NextResponse.json({ message: 'Username and password are required' }, { status: 400 });
    }

    // M-2: server-side password policy.
    const policy = checkPasswordPolicy(password);
    if (!policy.ok) {
      logger.warn('Register API: password failed policy');
      return NextResponse.json({ message: policy.message ?? 'Weak password' }, { status: 400 });
    }

    // M-3: registration is CLOSED BY DEFAULT — it only opens when
    // ALLOW_REGISTRATION is explicitly set to "true". (Was: open unless
    // explicitly "false". Unset env ⇒ open.)
    if (process.env.ALLOW_REGISTRATION !== 'true') {
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

    // M-3: the configured PIN itself must meet a minimum bar — weak,
    // guessable PINs (dates, repeated digits) defeat the gate.
    if (requiredPin && requiredPin.length > 0) {
      if (requiredPin.length < 8 || /^(.)\1+$/.test(requiredPin)) {
        logger.error('Register API: REGISTRATION_PIN is too weak (need >=8 chars, not a repeated character). Change it and restart.');
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

    await seedUserAiProviders(username);

    logger.info('Register API: user created', { username });
    return NextResponse.json({ message: 'User created successfully' }, { status: 201 });
  } catch (error) {
    logger.error('Register API: error', { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json({ message: 'Internal server error' }, { status: 500 });
  }
}
