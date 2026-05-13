import { auth } from 'auth';
import { getDb } from '@/lib/db';
import { userSettings } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { ACCENT_NAMES } from '@/lib/utils/apply-accent';

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const db = getDb();

  let settings = await db
    .select()
    .from(userSettings)
    .where(eq(userSettings.userId, session.user.id))
    .limit(1);

  if (!settings || settings.length === 0) {
    // Create default settings if none exist
    const [created] = await db
      .insert(userSettings)
      .values({
        userId: session.user.id,
      })
      .returning();

    return Response.json({
      privacyMode: created?.privacyMode ?? false,
      accentColor: created?.accentColor ?? 'violet',
      chartVisibility: created?.chartVisibility ?? {},
      chartColorScheme: created?.chartColorScheme ?? 'forest',
      forecastMode: created?.forecastMode ?? 'hybrid',
      forecastLookbackMonths: created?.forecastLookbackMonths ?? 3,
    });
  }

  return Response.json({
    privacyMode: settings[0].privacyMode,
    accentColor: settings[0].accentColor ?? 'violet',
    chartVisibility: settings[0].chartVisibility ?? {},
    chartColorScheme: settings[0].chartColorScheme ?? 'forest',
    forecastMode: settings[0].forecastMode ?? 'hybrid',
    forecastLookbackMonths: settings[0].forecastLookbackMonths ?? 3,
  });
}

export async function PATCH(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json();
  const privacyMode = body.privacyMode;
  const accentColor = body.accentColor;
  const chartVisibility = body.chartVisibility;
  const chartColorScheme = body.chartColorScheme;
  const forecastMode = body.forecastMode;
  const forecastLookbackMonths = body.forecastLookbackMonths;

  if (typeof privacyMode !== 'boolean' && privacyMode !== undefined) {
    return Response.json({ error: 'Invalid privacyMode value' }, { status: 400 });
  }

  if (accentColor !== undefined && !ACCENT_NAMES.includes(accentColor) && !/^#[0-9A-Fa-f]{6}$/.test(accentColor)) {
    return Response.json({ error: 'Invalid accentColor value' }, { status: 400 });
  }

  if (chartVisibility !== undefined && (typeof chartVisibility !== 'object' || chartVisibility === null)) {
    return Response.json({ error: 'Invalid chartVisibility value' }, { status: 400 });
  }

  if (chartColorScheme !== undefined && typeof chartColorScheme !== 'string') {
    return Response.json({ error: 'Invalid chartColorScheme value' }, { status: 400 });
  }

  const VALID_FORECAST_MODES = ['historical', 'budget', 'hybrid'];
  if (forecastMode !== undefined && !VALID_FORECAST_MODES.includes(forecastMode)) {
    return Response.json({ error: 'Invalid forecastMode value' }, { status: 400 });
  }

  if (forecastLookbackMonths !== undefined && (typeof forecastLookbackMonths !== 'number' || forecastLookbackMonths < 1 || forecastLookbackMonths > 24)) {
    return Response.json({ error: 'Invalid forecastLookbackMonths value (must be 1-24)' }, { status: 400 });
  }

  const db = getDb();

  let settings = await db
    .select()
    .from(userSettings)
    .where(eq(userSettings.userId, session.user.id))
    .limit(1);

  if (!settings || settings.length === 0) {
    const [created] = await db
      .insert(userSettings)
      .values({
        userId: session.user.id,
        privacyMode,
        accentColor: accentColor ?? 'violet',
        chartColorScheme: chartColorScheme ?? 'forest',
      })
      .returning();

    return Response.json({
      privacyMode: created?.privacyMode,
      accentColor: created?.accentColor,
      chartVisibility: created?.chartVisibility ?? {},
      chartColorScheme: created?.chartColorScheme ?? 'forest',
      forecastMode: created?.forecastMode ?? 'hybrid',
      forecastLookbackMonths: created?.forecastLookbackMonths ?? 3,
    });
  }

  const updates: Record<string, any> = {};
  if (privacyMode !== undefined) updates.privacyMode = privacyMode;
  if (accentColor !== undefined) updates.accentColor = accentColor;
  if (chartVisibility !== undefined) updates.chartVisibility = chartVisibility;
  if (chartColorScheme !== undefined) updates.chartColorScheme = chartColorScheme;
  if (forecastMode !== undefined) updates.forecastMode = forecastMode;
  if (forecastLookbackMonths !== undefined) updates.forecastLookbackMonths = forecastLookbackMonths;
  updates.updatedAt = new Date();

  const [updated] = await db
    .update(userSettings)
    .set(updates)
    .where(eq(userSettings.userId, session.user.id))
    .returning();

  return Response.json({
    privacyMode: updated.privacyMode,
    accentColor: updated.accentColor,
    chartVisibility: updated.chartVisibility ?? {},
    chartColorScheme: updated.chartColorScheme ?? 'forest',
    forecastMode: updated.forecastMode ?? 'hybrid',
    forecastLookbackMonths: updated.forecastLookbackMonths ?? 3,
  });
}
