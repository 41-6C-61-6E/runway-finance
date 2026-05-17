import { auth } from 'auth';
import { getDb } from '@/lib/db';
import { userSettings } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { ACCENT_NAMES } from '@/lib/utils/apply-accent';
import { getSessionDEK } from '@/lib/crypto-context';
import { decryptField, encryptField } from '@/lib/crypto';

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const db = getDb();
  const dek = await getSessionDEK();

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
      showMathEnabled: created?.showMathEnabled ?? false,
      aiEndpoint: created?.aiEndpoint ?? null,
      aiModel: created?.aiModel ?? null,
      aiSystemPrompt: created?.aiSystemPrompt ?? null,
      aiAutoAnalyze: created?.aiAutoAnalyze ?? false,
      aiAutoApproveThreshold: created?.aiAutoApproveThreshold ?? 95,
      aiBatchSize: created?.aiBatchSize ?? 25,
      apiKeys: created?.apiKeys ?? {},
    });
  }

  let apiKeys: Record<string, string> = {};
  if (settings[0].apiKeys) {
    try {
      const decrypted = await decryptField(settings[0].apiKeys, dek);
      apiKeys = JSON.parse(decrypted);
    } catch { /* return empty */ }
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
    showMathEnabled: settings[0].showMathEnabled ?? false,
    aiEndpoint: settings[0].aiEndpoint ?? null,
    aiModel: settings[0].aiModel ?? null,
    aiSystemPrompt: settings[0].aiSystemPrompt ?? null,
    aiAutoAnalyze: settings[0].aiAutoAnalyze ?? false,
    aiAutoApproveThreshold: settings[0].aiAutoApproveThreshold ?? 95,
    aiBatchSize: settings[0].aiBatchSize ?? 25,
    apiKeys,
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
	const showMathEnabled = body.showMathEnabled;
	const aiEndpoint = body.aiEndpoint;
	const aiModel = body.aiModel;
	const aiSystemPrompt = body.aiSystemPrompt;
	const aiAutoAnalyze = body.aiAutoAnalyze;
	const aiAutoApproveThreshold = body.aiAutoApproveThreshold;
	const aiBatchSize = body.aiBatchSize;
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

	if (showMathEnabled !== undefined && typeof showMathEnabled !== 'boolean') {
		return Response.json({ error: 'Invalid showMathEnabled value' }, { status: 400 });
	}

	if (aiEndpoint !== undefined && typeof aiEndpoint !== 'string') {
		return Response.json({ error: 'Invalid aiEndpoint value' }, { status: 400 });
	}

	if (aiModel !== undefined && typeof aiModel !== 'string') {
		return Response.json({ error: 'Invalid aiModel value' }, { status: 400 });
	}

	if (aiSystemPrompt !== undefined && typeof aiSystemPrompt !== 'string') {
		return Response.json({ error: 'Invalid aiSystemPrompt value' }, { status: 400 });
	}

	if (aiAutoAnalyze !== undefined && typeof aiAutoAnalyze !== 'boolean') {
		return Response.json({ error: 'Invalid aiAutoAnalyze value' }, { status: 400 });
	}

	if (aiAutoApproveThreshold !== undefined && (typeof aiAutoApproveThreshold !== 'number' || aiAutoApproveThreshold < 0 || aiAutoApproveThreshold > 100)) {
		return Response.json({ error: 'Invalid aiAutoApproveThreshold value (must be 0-100)' }, { status: 400 });
	}

	if (aiBatchSize !== undefined && (typeof aiBatchSize !== 'number' || aiBatchSize < 1 || aiBatchSize > 200)) {
		return Response.json({ error: 'Invalid aiBatchSize value (must be 1-200)' }, { status: 400 });
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
      showMathEnabled: created?.showMathEnabled ?? false,
      apiKeys: created?.apiKeys ?? {},
    });
  }

  const dek = await getSessionDEK();
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
	if (showMathEnabled !== undefined) updates.showMathEnabled = showMathEnabled;
	if (aiEndpoint !== undefined) updates.aiEndpoint = aiEndpoint;
	if (aiModel !== undefined) updates.aiModel = aiModel;
	if (aiSystemPrompt !== undefined) updates.aiSystemPrompt = aiSystemPrompt;
	if (aiAutoAnalyze !== undefined) updates.aiAutoAnalyze = aiAutoAnalyze;
	if (aiAutoApproveThreshold !== undefined) updates.aiAutoApproveThreshold = aiAutoApproveThreshold;
	if (aiBatchSize !== undefined) updates.aiBatchSize = aiBatchSize;
	if (apiKeys !== undefined) updates.apiKeys = await encryptField(JSON.stringify(apiKeys), dek);
  updates.updatedAt = new Date();

  const [updated] = await db
    .update(userSettings)
    .set(updates)
    .where(eq(userSettings.userId, session.user.id))
    .returning();

  let updatedApiKeys: Record<string, string> = {};
  if (updated.apiKeys) {
    try {
      updatedApiKeys = JSON.parse(await decryptField(updated.apiKeys, dek));
    } catch { /* return empty */ }
  }

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
    showMathEnabled: updated.showMathEnabled ?? false,
    aiEndpoint: updated.aiEndpoint ?? null,
    aiModel: updated.aiModel ?? null,
    aiSystemPrompt: updated.aiSystemPrompt ?? null,
    aiAutoAnalyze: updated.aiAutoAnalyze ?? false,
    aiAutoApproveThreshold: updated.aiAutoApproveThreshold ?? 95,
    aiBatchSize: updated.aiBatchSize ?? 25,
    apiKeys: updatedApiKeys,
  });
}
