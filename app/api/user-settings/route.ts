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
      hiddenPages: created?.hiddenPages ?? {},
      cardStyle: created?.cardStyle ?? 'default',
      showSyntheticData: created?.showSyntheticData ?? { global: true, netWorth: true, realEstate: true, cashFlowProjections: true },
      defaultChartTimeRange: created?.defaultChartTimeRange ?? '1y',
      defaultChartType: created?.defaultChartType ?? 'line',
      reduceTransparency: created?.reduceTransparency ?? false,
      hideAccountSubheadings: created?.hideAccountSubheadings ?? false,
      apiKeys: created?.apiKeys ?? {},
    });
  }

  return Response.json({
    privacyMode: settings[0].privacyMode,
    accentColor: settings[0].accentColor ?? 'violet',
    chartVisibility: settings[0].chartVisibility ?? {},
    chartColorScheme: settings[0].chartColorScheme ?? 'forest',
    forecastMode: settings[0].forecastMode ?? 'hybrid',
    forecastLookbackMonths: settings[0].forecastLookbackMonths ?? 3,
    hiddenPages: settings[0].hiddenPages ?? {},
    cardStyle: settings[0].cardStyle ?? 'default',
    showSyntheticData: settings[0].showSyntheticData ?? { global: true, netWorth: true, realEstate: true, cashFlowProjections: true },
    defaultChartTimeRange: settings[0].defaultChartTimeRange ?? '1y',
    defaultChartType: settings[0].defaultChartType ?? 'line',
    reduceTransparency: settings[0].reduceTransparency ?? false,
    hideAccountSubheadings: settings[0].hideAccountSubheadings ?? false,
    apiKeys: settings[0].apiKeys ?? {},
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
  const hiddenPages = body.hiddenPages;
  const cardStyle = body.cardStyle;
  const showSyntheticData = body.showSyntheticData;
  const defaultChartTimeRange = body.defaultChartTimeRange;
  const defaultChartType = body.defaultChartType;
  const reduceTransparency = body.reduceTransparency;
  const hideAccountSubheadings = body.hideAccountSubheadings;
  const apiKeys = body.apiKeys;

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

  if (hiddenPages !== undefined && (typeof hiddenPages !== 'object' || hiddenPages === null)) {
    return Response.json({ error: 'Invalid hiddenPages value' }, { status: 400 });
  }

  const VALID_CARD_STYLES = ['rounded', 'default', 'square'];
  if (cardStyle !== undefined && !VALID_CARD_STYLES.includes(cardStyle)) {
    return Response.json({ error: 'Invalid cardStyle value' }, { status: 400 });
  }

  const VALID_SYNTHETIC_KEYS = ['global', 'netWorth', 'realEstate', 'cashFlowProjections'];
  if (showSyntheticData !== undefined) {
    if (typeof showSyntheticData !== 'object' || showSyntheticData === null || Array.isArray(showSyntheticData)) {
      return Response.json({ error: 'Invalid showSyntheticData value' }, { status: 400 });
    }
    for (const key of VALID_SYNTHETIC_KEYS) {
      if (key in showSyntheticData && typeof showSyntheticData[key] !== 'boolean') {
        return Response.json({ error: `Invalid showSyntheticData.${key} value` }, { status: 400 });
      }
    }
  }

  const VALID_CHART_TIME_RANGES = ['1m', '3m', '6m', '1y', '5y', 'ytd', 'all'];
  if (defaultChartTimeRange !== undefined && !VALID_CHART_TIME_RANGES.includes(defaultChartTimeRange)) {
    return Response.json({ error: 'Invalid defaultChartTimeRange value' }, { status: 400 });
  }

  const VALID_CHART_TYPES = ['line', 'bar'];
  if (defaultChartType !== undefined && !VALID_CHART_TYPES.includes(defaultChartType)) {
    return Response.json({ error: 'Invalid defaultChartType value' }, { status: 400 });
  }

  if (reduceTransparency !== undefined && typeof reduceTransparency !== 'boolean') {
    return Response.json({ error: 'Invalid reduceTransparency value' }, { status: 400 });
  }

  if (hideAccountSubheadings !== undefined && typeof hideAccountSubheadings !== 'boolean') {
    return Response.json({ error: 'Invalid hideAccountSubheadings value' }, { status: 400 });
  }

  if (apiKeys !== undefined && (typeof apiKeys !== 'object' || apiKeys === null || Array.isArray(apiKeys))) {
    return Response.json({ error: 'Invalid apiKeys value' }, { status: 400 });
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
      hiddenPages: created?.hiddenPages ?? {},
      cardStyle: created?.cardStyle ?? 'default',
      showSyntheticData: created?.showSyntheticData ?? { global: true, netWorth: true, realEstate: true, cashFlowProjections: true },
      defaultChartTimeRange: created?.defaultChartTimeRange ?? '1y',
      defaultChartType: created?.defaultChartType ?? 'line',
      reduceTransparency: created?.reduceTransparency ?? false,
      hideAccountSubheadings: created?.hideAccountSubheadings ?? false,
      apiKeys: created?.apiKeys ?? {},
    });
  }

  const updates: Record<string, any> = {};
  if (privacyMode !== undefined) updates.privacyMode = privacyMode;
  if (accentColor !== undefined) updates.accentColor = accentColor;
  if (chartVisibility !== undefined) updates.chartVisibility = chartVisibility;
  if (chartColorScheme !== undefined) updates.chartColorScheme = chartColorScheme;
  if (forecastMode !== undefined) updates.forecastMode = forecastMode;
  if (forecastLookbackMonths !== undefined) updates.forecastLookbackMonths = forecastLookbackMonths;
  if (hiddenPages !== undefined) updates.hiddenPages = hiddenPages;
  if (cardStyle !== undefined) updates.cardStyle = cardStyle;
  if (showSyntheticData !== undefined) updates.showSyntheticData = showSyntheticData;
  if (defaultChartTimeRange !== undefined) updates.defaultChartTimeRange = defaultChartTimeRange;
  if (defaultChartType !== undefined) updates.defaultChartType = defaultChartType;
  if (reduceTransparency !== undefined) updates.reduceTransparency = reduceTransparency;
  if (hideAccountSubheadings !== undefined) updates.hideAccountSubheadings = hideAccountSubheadings;
  if (apiKeys !== undefined) updates.apiKeys = apiKeys;
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
    hiddenPages: updated.hiddenPages ?? {},
    cardStyle: updated.cardStyle ?? 'default',
    showSyntheticData: updated.showSyntheticData ?? { global: true, netWorth: true, realEstate: true, cashFlowProjections: true },
    defaultChartTimeRange: updated.defaultChartTimeRange ?? '1y',
    defaultChartType: updated.defaultChartType ?? 'line',
    reduceTransparency: updated.reduceTransparency ?? false,
    hideAccountSubheadings: updated.hideAccountSubheadings ?? false,
    apiKeys: updated.apiKeys ?? {},
  });
}
