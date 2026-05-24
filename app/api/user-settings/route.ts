import { auth } from 'auth';
import { getDb } from '@/lib/db';
import { userSettings } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { ACCENT_NAMES } from '@/lib/utils/apply-accent';
import { getSessionDEK } from '@/lib/crypto-context';
import { decryptField, encryptField } from '@/lib/crypto';
import { DEFAULTS } from '@/config/defaults';

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
      privacyMode: created?.privacyMode ?? DEFAULTS.privacyMode,
      accentColor: created?.accentColor ?? DEFAULTS.accentColor,
      chartVisibility: created?.chartVisibility ?? DEFAULTS.chartVisibility,
      chartColorScheme: created?.chartColorScheme ?? DEFAULTS.chartColorScheme,
      forecastMode: created?.forecastMode ?? DEFAULTS.forecastMode,
      forecastLookbackMonths: created?.forecastLookbackMonths ?? DEFAULTS.forecastLookbackMonths,
      hiddenPages: created?.hiddenPages ?? DEFAULTS.hiddenPages,
      cardStyle: created?.cardStyle ?? DEFAULTS.cardStyle,
      showSyntheticData: created?.showSyntheticData ?? DEFAULTS.showSyntheticData,
      defaultChartTimeRange: created?.defaultChartTimeRange ?? DEFAULTS.defaultChartTimeRange,
      defaultChartType: created?.defaultChartType ?? DEFAULTS.defaultChartType,
      reduceTransparency: created?.reduceTransparency ?? DEFAULTS.reduceTransparency,
      hideAccountSubheadings: created?.hideAccountSubheadings ?? DEFAULTS.hideAccountSubheadings,
      hideAccountsSidebarByDefault: created?.hideAccountsSidebarByDefault ?? DEFAULTS.hideAccountsSidebarByDefault,
      chartSelections: created?.chartSelections ?? DEFAULTS.chartSelections,
      showMathEnabled: created?.showMathEnabled ?? DEFAULTS.showMathEnabled,
      aiSystemPrompt: created?.aiSystemPrompt ?? DEFAULTS.aiSystemPrompt,
      aiAutoAnalyze: created?.aiAutoAnalyze ?? DEFAULTS.aiAutoAnalyze,
      aiAutoApprove: created?.aiAutoApprove ?? DEFAULTS.aiAutoApprove,
      aiAutoApproveThreshold: created?.aiAutoApproveThreshold ?? DEFAULTS.aiAutoApproveThreshold,
      aiBatchSize: created?.aiBatchSize ?? DEFAULTS.aiBatchSize,
      aiAnalysisTimeoutSeconds: created?.aiAnalysisTimeoutSeconds ?? DEFAULTS.aiAnalysisTimeoutSeconds,
      showImportedData: created?.showImportedData ?? DEFAULTS.showImportedData,
      aiActiveProviderId: created?.aiActiveProviderId ?? DEFAULTS.aiActiveProviderId,
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
    accentColor: settings[0].accentColor ?? DEFAULTS.accentColor,
    chartVisibility: settings[0].chartVisibility ?? DEFAULTS.chartVisibility,
    chartColorScheme: settings[0].chartColorScheme ?? DEFAULTS.chartColorScheme,
    forecastMode: settings[0].forecastMode ?? DEFAULTS.forecastMode,
    forecastLookbackMonths: settings[0].forecastLookbackMonths ?? DEFAULTS.forecastLookbackMonths,
    hiddenPages: settings[0].hiddenPages ?? DEFAULTS.hiddenPages,
    cardStyle: settings[0].cardStyle ?? DEFAULTS.cardStyle,
    showSyntheticData: settings[0].showSyntheticData ?? DEFAULTS.showSyntheticData,
    showImportedData: settings[0].showImportedData ?? DEFAULTS.showImportedData,
    defaultChartTimeRange: settings[0].defaultChartTimeRange ?? DEFAULTS.defaultChartTimeRange,
    defaultChartType: settings[0].defaultChartType ?? DEFAULTS.defaultChartType,
    reduceTransparency: settings[0].reduceTransparency ?? DEFAULTS.reduceTransparency,
    hideAccountSubheadings: settings[0].hideAccountSubheadings ?? DEFAULTS.hideAccountSubheadings,
    hideAccountsSidebarByDefault: settings[0].hideAccountsSidebarByDefault ?? DEFAULTS.hideAccountsSidebarByDefault,
    chartSelections: settings[0].chartSelections ?? DEFAULTS.chartSelections,
    showMathEnabled: settings[0].showMathEnabled ?? DEFAULTS.showMathEnabled,
    aiSystemPrompt: settings[0].aiSystemPrompt ?? DEFAULTS.aiSystemPrompt,
    aiAutoAnalyze: settings[0].aiAutoAnalyze ?? DEFAULTS.aiAutoAnalyze,
    aiAutoApprove: settings[0].aiAutoApprove ?? DEFAULTS.aiAutoApprove,
    aiAutoApproveThreshold: settings[0].aiAutoApproveThreshold ?? DEFAULTS.aiAutoApproveThreshold,
    aiBatchSize: settings[0].aiBatchSize ?? DEFAULTS.aiBatchSize,
    aiAnalysisTimeoutSeconds: settings[0].aiAnalysisTimeoutSeconds ?? DEFAULTS.aiAnalysisTimeoutSeconds,
    aiActiveProviderId: settings[0].aiActiveProviderId ?? DEFAULTS.aiActiveProviderId,
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
  const hideAccountsSidebarByDefault = body.hideAccountsSidebarByDefault;
  const chartSelections = body.chartSelections;
	const showMathEnabled = body.showMathEnabled;
	const aiSystemPrompt = body.aiSystemPrompt;
	const aiAutoAnalyze = body.aiAutoAnalyze;
	const aiAutoApprove = body.aiAutoApprove;
	const aiAutoApproveThreshold = body.aiAutoApproveThreshold;
	const aiBatchSize = body.aiBatchSize;
	const aiAnalysisTimeoutSeconds = body.aiAnalysisTimeoutSeconds;
	const aiActiveProviderId = body.aiActiveProviderId;
	const apiKeys = body.apiKeys;
	const showImportedData = body.showImportedData;

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

  const VALID_IMPORTED_KEYS = ['global', 'netWorth', 'realEstate', 'cashFlowProjections'];
  if (showImportedData !== undefined) {
    if (typeof showImportedData !== 'object' || showImportedData === null || Array.isArray(showImportedData)) {
      return Response.json({ error: 'Invalid showImportedData value' }, { status: 400 });
    }
    for (const key of VALID_IMPORTED_KEYS) {
      if (key in showImportedData && typeof showImportedData[key] !== 'boolean') {
        return Response.json({ error: `Invalid showImportedData.${key} value` }, { status: 400 });
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

  if (hideAccountsSidebarByDefault !== undefined && typeof hideAccountsSidebarByDefault !== 'boolean') {
    return Response.json({ error: 'Invalid hideAccountsSidebarByDefault value' }, { status: 400 });
  }

  if (chartSelections !== undefined && (typeof chartSelections !== 'object' || chartSelections === null || Array.isArray(chartSelections))) {
    return Response.json({ error: 'Invalid chartSelections value' }, { status: 400 });
  }

  if (apiKeys !== undefined && (typeof apiKeys !== 'object' || apiKeys === null || Array.isArray(apiKeys))) {
    return Response.json({ error: 'Invalid apiKeys value' }, { status: 400 });
  }

	if (showMathEnabled !== undefined && typeof showMathEnabled !== 'boolean') {
		return Response.json({ error: 'Invalid showMathEnabled value' }, { status: 400 });
	}

	if (aiSystemPrompt !== undefined && aiSystemPrompt !== null && typeof aiSystemPrompt !== 'string') {
		return Response.json({ error: 'Invalid aiSystemPrompt value' }, { status: 400 });
	}

	if (aiAutoAnalyze !== undefined && typeof aiAutoAnalyze !== 'boolean') {
		return Response.json({ error: 'Invalid aiAutoAnalyze value' }, { status: 400 });
	}

	if (aiAutoApprove !== undefined && typeof aiAutoApprove !== 'boolean') {
		return Response.json({ error: 'Invalid aiAutoApprove value' }, { status: 400 });
	}

	if (aiAutoApproveThreshold !== undefined && (typeof aiAutoApproveThreshold !== 'number' || aiAutoApproveThreshold < 0 || aiAutoApproveThreshold > 100)) {
		return Response.json({ error: 'Invalid aiAutoApproveThreshold value (must be 0-100)' }, { status: 400 });
	}

	if (aiBatchSize !== undefined && (typeof aiBatchSize !== 'number' || aiBatchSize < 1 || aiBatchSize > 200)) {
		return Response.json({ error: 'Invalid aiBatchSize value (must be 1-200)' }, { status: 400 });
	}

	if (aiAnalysisTimeoutSeconds !== undefined && (typeof aiAnalysisTimeoutSeconds !== 'number' || aiAnalysisTimeoutSeconds < 30 || aiAnalysisTimeoutSeconds > 600)) {
		return Response.json({ error: 'Invalid aiAnalysisTimeoutSeconds value (must be 30-600)' }, { status: 400 });
	}

	if (aiActiveProviderId !== undefined && aiActiveProviderId !== null && typeof aiActiveProviderId !== 'string') {
		return Response.json({ error: 'Invalid aiActiveProviderId value' }, { status: 400 });
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
        accentColor: accentColor ?? DEFAULTS.accentColor,
        chartColorScheme: chartColorScheme ?? DEFAULTS.chartColorScheme,
      })
      .returning();

    return Response.json({
      privacyMode: created?.privacyMode,
      accentColor: created?.accentColor,
      chartVisibility: created?.chartVisibility ?? DEFAULTS.chartVisibility,
      chartColorScheme: created?.chartColorScheme ?? DEFAULTS.chartColorScheme,
      forecastMode: created?.forecastMode ?? DEFAULTS.forecastMode,
      forecastLookbackMonths: created?.forecastLookbackMonths ?? DEFAULTS.forecastLookbackMonths,
      hiddenPages: created?.hiddenPages ?? DEFAULTS.hiddenPages,
      cardStyle: created?.cardStyle ?? DEFAULTS.cardStyle,
      showSyntheticData: created?.showSyntheticData ?? DEFAULTS.showSyntheticData,
      defaultChartTimeRange: created?.defaultChartTimeRange ?? DEFAULTS.defaultChartTimeRange,
      defaultChartType: created?.defaultChartType ?? DEFAULTS.defaultChartType,
      reduceTransparency: created?.reduceTransparency ?? DEFAULTS.reduceTransparency,
      hideAccountSubheadings: created?.hideAccountSubheadings ?? DEFAULTS.hideAccountSubheadings,
      hideAccountsSidebarByDefault: created?.hideAccountsSidebarByDefault ?? DEFAULTS.hideAccountsSidebarByDefault,
      chartSelections: created?.chartSelections ?? DEFAULTS.chartSelections,
      showMathEnabled: created?.showMathEnabled ?? DEFAULTS.showMathEnabled,
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
  if (showImportedData !== undefined) updates.showImportedData = showImportedData;
  if (defaultChartTimeRange !== undefined) updates.defaultChartTimeRange = defaultChartTimeRange;
  if (defaultChartType !== undefined) updates.defaultChartType = defaultChartType;
  if (reduceTransparency !== undefined) updates.reduceTransparency = reduceTransparency;
  if (hideAccountSubheadings !== undefined) updates.hideAccountSubheadings = hideAccountSubheadings;
  if (hideAccountsSidebarByDefault !== undefined) updates.hideAccountsSidebarByDefault = hideAccountsSidebarByDefault;
  if (chartSelections !== undefined) {
    const existingSelections = (settings[0].chartSelections as Record<string, any>) || {};
    updates.chartSelections = { ...existingSelections, ...chartSelections };
  }
	if (showMathEnabled !== undefined) updates.showMathEnabled = showMathEnabled;
	if (aiSystemPrompt !== undefined) updates.aiSystemPrompt = aiSystemPrompt;
	if (aiAutoAnalyze !== undefined) updates.aiAutoAnalyze = aiAutoAnalyze;
	if (aiAutoApprove !== undefined) updates.aiAutoApprove = aiAutoApprove;
	if (aiAutoApproveThreshold !== undefined) updates.aiAutoApproveThreshold = aiAutoApproveThreshold;
	if (aiBatchSize !== undefined) updates.aiBatchSize = aiBatchSize;
	if (aiAnalysisTimeoutSeconds !== undefined) updates.aiAnalysisTimeoutSeconds = aiAnalysisTimeoutSeconds;
	if (aiActiveProviderId !== undefined) updates.aiActiveProviderId = aiActiveProviderId;
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
    chartVisibility: updated.chartVisibility ?? DEFAULTS.chartVisibility,
    chartColorScheme: updated.chartColorScheme ?? DEFAULTS.chartColorScheme,
    forecastMode: updated.forecastMode ?? DEFAULTS.forecastMode,
    forecastLookbackMonths: updated.forecastLookbackMonths ?? DEFAULTS.forecastLookbackMonths,
    hiddenPages: updated.hiddenPages ?? DEFAULTS.hiddenPages,
    cardStyle: updated.cardStyle ?? DEFAULTS.cardStyle,
    showSyntheticData: updated.showSyntheticData ?? DEFAULTS.showSyntheticData,
    showImportedData: updated.showImportedData ?? DEFAULTS.showImportedData,
    defaultChartTimeRange: updated.defaultChartTimeRange ?? DEFAULTS.defaultChartTimeRange,
    defaultChartType: updated.defaultChartType ?? DEFAULTS.defaultChartType,
    reduceTransparency: updated.reduceTransparency ?? DEFAULTS.reduceTransparency,
    hideAccountSubheadings: updated.hideAccountSubheadings ?? DEFAULTS.hideAccountSubheadings,
    hideAccountsSidebarByDefault: updated.hideAccountsSidebarByDefault ?? DEFAULTS.hideAccountsSidebarByDefault,
    chartSelections: updated.chartSelections ?? DEFAULTS.chartSelections,
    showMathEnabled: updated.showMathEnabled ?? DEFAULTS.showMathEnabled,
    aiSystemPrompt: updated.aiSystemPrompt ?? DEFAULTS.aiSystemPrompt,
    aiAutoAnalyze: updated.aiAutoAnalyze ?? DEFAULTS.aiAutoAnalyze,
    aiAutoApprove: updated.aiAutoApprove ?? DEFAULTS.aiAutoApprove,
    aiAutoApproveThreshold: updated.aiAutoApproveThreshold ?? DEFAULTS.aiAutoApproveThreshold,
    aiBatchSize: updated.aiBatchSize ?? DEFAULTS.aiBatchSize,
    aiAnalysisTimeoutSeconds: updated.aiAnalysisTimeoutSeconds ?? DEFAULTS.aiAnalysisTimeoutSeconds,
    aiActiveProviderId: updated.aiActiveProviderId ?? DEFAULTS.aiActiveProviderId,
    apiKeys: updatedApiKeys,
  });
}
