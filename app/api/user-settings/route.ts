import { auth } from 'auth';
import { getDb } from '@/lib/db';
import { userSettings, accounts, accountSnapshots } from '@/lib/db/schema';
import { eq, and, inArray } from 'drizzle-orm';
import { ACCENT_NAMES } from '@/lib/utils/apply-accent';
import { getSessionDEK } from '@/lib/crypto-context';
import { decryptField, encryptField, decryptRows } from '@/lib/crypto';
import { DEFAULTS } from '@/config/defaults';
import { updateMonthlyCashFlowSummaries, updateCategorySpendingSummaries, updateCategoryIncomeSummaries } from '@/lib/services/sync';

function ensureJsonObject(val: any, fallback: Record<string, any> = {}): Record<string, any> {
  if (!val) return fallback;
  if (typeof val === 'object' && !Array.isArray(val)) return val;
  if (typeof val === 'string') {
    try {
      const parsed = JSON.parse(val);
      if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
        return parsed;
      }
    } catch {}
  }
  return fallback;
}

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const db = getDb();
    const dek = await getSessionDEK().catch(() => null);

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
      currency: created?.currency ?? DEFAULTS.currency,
      locale: created?.locale ?? DEFAULTS.locale,
      dateFormat: created?.dateFormat ?? DEFAULTS.dateFormat,
      compactMode: created?.compactMode ?? DEFAULTS.compactMode,
      textSize: created?.textSize ?? DEFAULTS.textSize,
      theme: created?.theme ?? DEFAULTS.theme,
      timezone: created?.timezone ?? DEFAULTS.timezone,
      privacyMode: created?.privacyMode ?? DEFAULTS.privacyMode,
      accentColor: created?.accentColor ?? DEFAULTS.accentColor,
      chartVisibility: created?.chartVisibility ?? DEFAULTS.chartVisibility,
      chartColorScheme: created?.chartColorScheme ?? DEFAULTS.chartColorScheme,
      forecastMode: created?.forecastMode ?? DEFAULTS.forecastMode,
      forecastLookbackMonths: created?.forecastLookbackMonths ?? DEFAULTS.forecastLookbackMonths,
      hiddenPages: created?.hiddenPages ?? DEFAULTS.hiddenPages,
      showSyntheticData: created?.showSyntheticData ?? DEFAULTS.showSyntheticData,
      defaultChartTimeRange: created?.defaultChartTimeRange ?? DEFAULTS.defaultChartTimeRange,
      defaultChartType: created?.defaultChartType ?? DEFAULTS.defaultChartType,
      reduceTransparency: created?.reduceTransparency ?? DEFAULTS.reduceTransparency,
      hideAccountSubheadings: created?.hideAccountSubheadings ?? DEFAULTS.hideAccountSubheadings,
      hideAccountsSidebarByDefault: created?.hideAccountsSidebarByDefault ?? DEFAULTS.hideAccountsSidebarByDefault,
      chartSelections: created?.chartSelections ?? DEFAULTS.chartSelections,
      cardCollapsedStates: created?.cardCollapsedStates ?? DEFAULTS.cardCollapsedStates,
      paystubEnabled: created?.paystubEnabled ?? DEFAULTS.paystubEnabled,
      aiSystemPrompt: created?.aiSystemPrompt ?? DEFAULTS.aiSystemPrompt,
      aiAutoAnalyze: created?.aiAutoAnalyze ?? DEFAULTS.aiAutoAnalyze,
      aiAutoApprove: created?.aiAutoApprove ?? DEFAULTS.aiAutoApprove,
      aiAutoApproveThreshold: created?.aiAutoApproveThreshold ?? DEFAULTS.aiAutoApproveThreshold,
      aiBatchSize: created?.aiBatchSize ?? DEFAULTS.aiBatchSize,
      aiAnalysisTimeoutSeconds: created?.aiAnalysisTimeoutSeconds ?? DEFAULTS.aiAnalysisTimeoutSeconds,
      showImportedData: created?.showImportedData ?? DEFAULTS.showImportedData,
      useMarketDataForSnapshots: created?.useMarketDataForSnapshots ?? DEFAULTS.useMarketDataForSnapshots,
      aiActiveProviderId: created?.aiActiveProviderId ?? DEFAULTS.aiActiveProviderId,
      apiKeys: created?.apiKeys ?? {},
      accountTagVisibility: created?.accountTagVisibility ?? DEFAULTS.accountTagVisibility,
      budgetExclusions: created?.budgetExclusions ?? DEFAULTS.budgetExclusions,
      notifySyncErrors: created?.notifySyncErrors ?? DEFAULTS.notifySyncErrors,
      notifyBudgetAlerts: created?.notifyBudgetAlerts ?? DEFAULTS.notifyBudgetAlerts,
      notifyLargeTransactions: created?.notifyLargeTransactions ?? DEFAULTS.notifyLargeTransactions,
      largeTransactionThreshold: created?.largeTransactionThreshold ?? DEFAULTS.largeTransactionThreshold,
      birthYear: created?.birthYear ?? null,
      notifyMonthlySummary: created?.notifyMonthlySummary ?? DEFAULTS.notifyMonthlySummary,
      budgetAlertThreshold: created?.budgetAlertThreshold ?? DEFAULTS.budgetAlertThreshold,
      notifyGoalMilestones: created?.notifyGoalMilestones ?? DEFAULTS.notifyGoalMilestones,
      notifyNetWorthMilestones: created?.notifyNetWorthMilestones ?? DEFAULTS.notifyNetWorthMilestones,
      netWorthMilestoneInterval: created?.netWorthMilestoneInterval ?? DEFAULTS.netWorthMilestoneInterval,
      notifyWeeklyNetWorthChange: created?.notifyWeeklyNetWorthChange ?? DEFAULTS.notifyWeeklyNetWorthChange,
      weeklyNetWorthAlertDay: created?.weeklyNetWorthAlertDay ?? DEFAULTS.weeklyNetWorthAlertDay,
      notifyAiProposals: created?.notifyAiProposals ?? DEFAULTS.notifyAiProposals,
      maxNotificationsPerPeriod: created?.maxNotificationsPerPeriod ?? DEFAULTS.maxNotificationsPerPeriod,
      notificationLimiterPeriodMinutes: created?.notificationLimiterPeriodMinutes ?? DEFAULTS.notificationLimiterPeriodMinutes,
      recurringExclusions: created?.recurringExclusions ?? DEFAULTS.recurringExclusions,
      notifyRecurringPriceChanges: created?.notifyRecurringPriceChanges ?? DEFAULTS.notifyRecurringPriceChanges,
      notifyUpcomingBills: created?.notifyUpcomingBills ?? DEFAULTS.notifyUpcomingBills,
      upcomingBillsLeadDays: created?.upcomingBillsLeadDays ?? DEFAULTS.upcomingBillsLeadDays,
      deletePendingOlderThan30Days: created?.deletePendingOlderThan30Days ?? DEFAULTS.deletePendingOlderThan30Days,
      deletePendingDays: created?.deletePendingDays ?? DEFAULTS.deletePendingDays,
    });
  }

  let apiKeys: Record<string, string> = {};
  if (settings[0].apiKeys) {
    try {
      if (dek) {
        const decrypted = await decryptField(settings[0].apiKeys, dek);
        apiKeys = JSON.parse(decrypted);
      } else {
        apiKeys = JSON.parse(settings[0].apiKeys);
      }
    } catch { /* return empty */ }
  }

  return Response.json({
    currency: settings[0].currency ?? DEFAULTS.currency,
    locale: settings[0].locale ?? DEFAULTS.locale,
    dateFormat: settings[0].dateFormat ?? DEFAULTS.dateFormat,
    compactMode: settings[0].compactMode ?? DEFAULTS.compactMode,
    textSize: settings[0].textSize ?? DEFAULTS.textSize,
    theme: settings[0].theme ?? DEFAULTS.theme,
    timezone: settings[0].timezone,
    privacyMode: settings[0].privacyMode,
    accentColor: settings[0].accentColor ?? DEFAULTS.accentColor,
    chartVisibility: settings[0].chartVisibility ?? DEFAULTS.chartVisibility,
    chartColorScheme: settings[0].chartColorScheme ?? DEFAULTS.chartColorScheme,
    forecastMode: settings[0].forecastMode ?? DEFAULTS.forecastMode,
    forecastLookbackMonths: settings[0].forecastLookbackMonths ?? DEFAULTS.forecastLookbackMonths,
    hiddenPages: settings[0].hiddenPages ?? DEFAULTS.hiddenPages,
    showSyntheticData: settings[0].showSyntheticData ?? DEFAULTS.showSyntheticData,
    showImportedData: settings[0].showImportedData ?? DEFAULTS.showImportedData,
    useMarketDataForSnapshots: settings[0].useMarketDataForSnapshots ?? DEFAULTS.useMarketDataForSnapshots,
    defaultChartTimeRange: settings[0].defaultChartTimeRange ?? DEFAULTS.defaultChartTimeRange,
    defaultChartType: settings[0].defaultChartType ?? DEFAULTS.defaultChartType,
    reduceTransparency: settings[0].reduceTransparency ?? DEFAULTS.reduceTransparency,

    hideAccountSubheadings: settings[0].hideAccountSubheadings ?? DEFAULTS.hideAccountSubheadings,
    hideAccountsSidebarByDefault: settings[0].hideAccountsSidebarByDefault ?? DEFAULTS.hideAccountsSidebarByDefault,
    chartSelections: settings[0].chartSelections ?? DEFAULTS.chartSelections,
    cardCollapsedStates: settings[0].cardCollapsedStates ?? DEFAULTS.cardCollapsedStates,
    paystubEnabled: settings[0].paystubEnabled ?? DEFAULTS.paystubEnabled,
    aiSystemPrompt: settings[0].aiSystemPrompt ?? DEFAULTS.aiSystemPrompt,
    aiAutoAnalyze: settings[0].aiAutoAnalyze ?? DEFAULTS.aiAutoAnalyze,
    aiAutoApprove: settings[0].aiAutoApprove ?? DEFAULTS.aiAutoApprove,
    aiAutoApproveThreshold: settings[0].aiAutoApproveThreshold ?? DEFAULTS.aiAutoApproveThreshold,
    aiBatchSize: settings[0].aiBatchSize ?? DEFAULTS.aiBatchSize,
    aiAnalysisTimeoutSeconds: settings[0].aiAnalysisTimeoutSeconds ?? DEFAULTS.aiAnalysisTimeoutSeconds,
    aiActiveProviderId: settings[0].aiActiveProviderId ?? DEFAULTS.aiActiveProviderId,
    apiKeys: apiKeys,
    accountTagVisibility: settings[0].accountTagVisibility ?? DEFAULTS.accountTagVisibility,
    budgetExclusions: settings[0].budgetExclusions ?? DEFAULTS.budgetExclusions,
    notifySyncErrors: settings[0].notifySyncErrors ?? DEFAULTS.notifySyncErrors,
    notifyBudgetAlerts: settings[0].notifyBudgetAlerts ?? DEFAULTS.notifyBudgetAlerts,
    notifyLargeTransactions: settings[0].notifyLargeTransactions ?? DEFAULTS.notifyLargeTransactions,
    largeTransactionThreshold: settings[0].largeTransactionThreshold ?? DEFAULTS.largeTransactionThreshold,
    birthYear: settings[0].birthYear ?? null,
    notifyMonthlySummary: settings[0].notifyMonthlySummary ?? DEFAULTS.notifyMonthlySummary,
    budgetAlertThreshold: settings[0].budgetAlertThreshold ?? DEFAULTS.budgetAlertThreshold,
    notifyGoalMilestones: settings[0].notifyGoalMilestones ?? DEFAULTS.notifyGoalMilestones,
    notifyNetWorthMilestones: settings[0].notifyNetWorthMilestones ?? DEFAULTS.notifyNetWorthMilestones,
    netWorthMilestoneInterval: settings[0].netWorthMilestoneInterval ?? DEFAULTS.netWorthMilestoneInterval,
    notifyWeeklyNetWorthChange: settings[0].notifyWeeklyNetWorthChange ?? DEFAULTS.notifyWeeklyNetWorthChange,
    weeklyNetWorthAlertDay: settings[0].weeklyNetWorthAlertDay ?? DEFAULTS.weeklyNetWorthAlertDay,
    notifyAiProposals: settings[0].notifyAiProposals ?? DEFAULTS.notifyAiProposals,
    maxNotificationsPerPeriod: settings[0].maxNotificationsPerPeriod ?? DEFAULTS.maxNotificationsPerPeriod,
    notificationLimiterPeriodMinutes: settings[0].notificationLimiterPeriodMinutes ?? DEFAULTS.notificationLimiterPeriodMinutes,
    recurringExclusions: settings[0].recurringExclusions ?? DEFAULTS.recurringExclusions,
    notifyRecurringPriceChanges: settings[0].notifyRecurringPriceChanges ?? DEFAULTS.notifyRecurringPriceChanges,
    notifyUpcomingBills: settings[0].notifyUpcomingBills ?? DEFAULTS.notifyUpcomingBills,
    upcomingBillsLeadDays: settings[0].upcomingBillsLeadDays ?? DEFAULTS.upcomingBillsLeadDays,
    deletePendingOlderThan30Days: settings[0].deletePendingOlderThan30Days ?? DEFAULTS.deletePendingOlderThan30Days,
    deletePendingDays: settings[0].deletePendingDays ?? DEFAULTS.deletePendingDays,
  });
  } catch (err) {
    console.error('Failed to retrieve user settings:', err);
    return Response.json(
      { error: err instanceof Error ? err.message : 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function PATCH(request: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
  const currency = body.currency;
  const locale = body.locale;
  const dateFormat = body.dateFormat;
  const compactMode = body.compactMode;
  const textSize = body.textSize;
  const theme = body.theme;
  const timezone = body.timezone;
  const privacyMode = body.privacyMode;
  const accentColor = body.accentColor;
  const chartVisibility = body.chartVisibility;
  const chartColorScheme = body.chartColorScheme;
  const forecastMode = body.forecastMode;
  const forecastLookbackMonths = body.forecastLookbackMonths;
  const hiddenPages = body.hiddenPages;
  const showSyntheticData = body.showSyntheticData;
  const defaultChartTimeRange = body.defaultChartTimeRange;
  const defaultChartType = body.defaultChartType;
  const reduceTransparency = body.reduceTransparency;
  const hideAccountSubheadings = body.hideAccountSubheadings;
  const hideAccountsSidebarByDefault = body.hideAccountsSidebarByDefault;
  const chartSelections = body.chartSelections;
  const cardCollapsedStates = body.cardCollapsedStates;
	const aiSystemPrompt = body.aiSystemPrompt;
	const aiAutoAnalyze = body.aiAutoAnalyze;
	const aiAutoApprove = body.aiAutoApprove;
	const aiAutoApproveThreshold = body.aiAutoApproveThreshold;
	const aiBatchSize = body.aiBatchSize;
	const aiAnalysisTimeoutSeconds = body.aiAnalysisTimeoutSeconds;
	const aiActiveProviderId = body.aiActiveProviderId;
	const apiKeys = body.apiKeys;
	const showImportedData = body.showImportedData;
	const paystubEnabled = body.paystubEnabled;
	const accountTagVisibility = body.accountTagVisibility;
	const budgetExclusions = body.budgetExclusions;
	const useMarketDataForSnapshots = body.useMarketDataForSnapshots;
	const notifySyncErrors = body.notifySyncErrors;
	const notifyBudgetAlerts = body.notifyBudgetAlerts;
	const notifyLargeTransactions = body.notifyLargeTransactions;
	const largeTransactionThreshold = body.largeTransactionThreshold;
  const birthYear = body.birthYear;
	const notifyMonthlySummary = body.notifyMonthlySummary;
	const budgetAlertThreshold = body.budgetAlertThreshold;
	const notifyGoalMilestones = body.notifyGoalMilestones;
	const notifyNetWorthMilestones = body.notifyNetWorthMilestones;
	const netWorthMilestoneInterval = body.netWorthMilestoneInterval;
	const notifyWeeklyNetWorthChange = body.notifyWeeklyNetWorthChange;
	const weeklyNetWorthAlertDay = body.weeklyNetWorthAlertDay;
	const notifyAiProposals = body.notifyAiProposals;
	const maxNotificationsPerPeriod = body.maxNotificationsPerPeriod;
	const notificationLimiterPeriodMinutes = body.notificationLimiterPeriodMinutes;
	const deletePendingOlderThan30Days = body.deletePendingOlderThan30Days;
	const deletePendingDays = body.deletePendingDays;
	const recurringExclusions = body.recurringExclusions;
	const notifyRecurringPriceChanges = body.notifyRecurringPriceChanges;
	const notifyUpcomingBills = body.notifyUpcomingBills;
	const upcomingBillsLeadDays = body.upcomingBillsLeadDays;

  if (currency !== undefined && (typeof currency !== 'string' || !/^[A-Z]{3}$/.test(currency.toUpperCase()))) {
    return Response.json({ error: 'Invalid currency value: must be a 3-letter ISO currency code (e.g. USD, EUR)' }, { status: 400 });
  }

  if (locale !== undefined && (typeof locale !== 'string' || !/^[a-z]{2}(-[A-Za-z0-9]{2,4})?$/i.test(locale))) {
    return Response.json({ error: 'Invalid locale format (e.g. en-US, de-DE)' }, { status: 400 });
  }

  const VALID_DATE_FORMATS = ['MM/DD/YYYY', 'DD/MM/YYYY', 'YYYY-MM-DD', 'YYYY/MM/DD', 'DD.MM.YYYY'];
  if (dateFormat !== undefined && (typeof dateFormat !== 'string' || !VALID_DATE_FORMATS.includes(dateFormat))) {
    return Response.json({ error: 'Invalid dateFormat value' }, { status: 400 });
  }

  if (compactMode !== undefined && typeof compactMode !== 'boolean') {
    return Response.json({ error: 'Invalid compactMode value: must be a boolean' }, { status: 400 });
  }

  const VALID_TEXT_SIZES = ['sm', 'default', 'lg', 'base'];
  if (textSize !== undefined && (typeof textSize !== 'string' || !VALID_TEXT_SIZES.includes(textSize))) {
    return Response.json({ error: 'Invalid textSize value: must be sm, default, or lg' }, { status: 400 });
  }

  const VALID_THEMES = ['daylight', 'moonlight', 'starlight', 'dark', 'light', 'system'];
  if (theme !== undefined && (typeof theme !== 'string' || !VALID_THEMES.includes(theme))) {
    return Response.json({ error: 'Invalid theme value' }, { status: 400 });
  }

  if (typeof privacyMode !== 'boolean' && privacyMode !== undefined) {
    return Response.json({ error: 'Invalid privacyMode value' }, { status: 400 });
  }

  if (deletePendingOlderThan30Days !== undefined && typeof deletePendingOlderThan30Days !== 'boolean') {
    return Response.json({ error: 'Invalid deletePendingOlderThan30Days value' }, { status: 400 });
  }

  if (deletePendingDays !== undefined && (typeof deletePendingDays !== 'number' || deletePendingDays < 1)) {
    return Response.json({ error: 'Invalid deletePendingDays value' }, { status: 400 });
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

  const VALID_SYNTHETIC_KEYS = ['global', 'netWorth', 'investments', 'realEstate', 'cashFlowProjections'];
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

  const VALID_IMPORTED_KEYS = ['global', 'netWorth', 'investments', 'realEstate', 'cashFlowProjections'];
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

  if (cardCollapsedStates !== undefined && (typeof cardCollapsedStates !== 'object' || cardCollapsedStates === null || Array.isArray(cardCollapsedStates))) {
    return Response.json({ error: 'Invalid cardCollapsedStates value' }, { status: 400 });
  }

  if (apiKeys !== undefined && (typeof apiKeys !== 'object' || apiKeys === null || Array.isArray(apiKeys))) {
    return Response.json({ error: 'Invalid apiKeys value' }, { status: 400 });
  }

	if (paystubEnabled !== undefined && typeof paystubEnabled !== 'boolean') {
		return Response.json({ error: 'Invalid paystubEnabled value' }, { status: 400 });
	}

	if (accountTagVisibility !== undefined) {
		if (typeof accountTagVisibility !== 'object' || accountTagVisibility === null || Array.isArray(accountTagVisibility)) {
			return Response.json({ error: 'Invalid accountTagVisibility value' }, { status: 400 });
		}
		const VALID_KEYS = ['sidebar', 'transactions', 'legend', 'budgets', 'forecast', 'suggestions', 'accounts'];
		for (const key of VALID_KEYS) {
			if (key in accountTagVisibility && typeof accountTagVisibility[key] !== 'boolean') {
				return Response.json({ error: `Invalid accountTagVisibility.${key} value` }, { status: 400 });
			}
		}
		// Also validate any extra keys are booleans (forward compat)
		for (const key of Object.keys(accountTagVisibility)) {
			if (!VALID_KEYS.includes(key) && typeof accountTagVisibility[key] !== 'boolean') {
				return Response.json({ error: `Invalid accountTagVisibility.${key} value` }, { status: 400 });
			}
		}
	}

	if (budgetExclusions !== undefined) {
		if (typeof budgetExclusions !== 'object' || budgetExclusions === null || Array.isArray(budgetExclusions)) {
			return Response.json({ error: 'Invalid budgetExclusions value' }, { status: 400 });
		}
		if (budgetExclusions.categoryIds !== undefined && !Array.isArray(budgetExclusions.categoryIds)) {
			return Response.json({ error: 'Invalid budgetExclusions.categoryIds value' }, { status: 400 });
		}
		if (budgetExclusions.tagIds !== undefined && !Array.isArray(budgetExclusions.tagIds)) {
			return Response.json({ error: 'Invalid budgetExclusions.tagIds value' }, { status: 400 });
		}
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

	if (aiAnalysisTimeoutSeconds !== undefined && (typeof aiAnalysisTimeoutSeconds !== 'number' || aiAnalysisTimeoutSeconds < 60 || aiAnalysisTimeoutSeconds > 3600)) {
		return Response.json({ error: 'Invalid aiAnalysisTimeoutSeconds value (must be 60-3600)' }, { status: 400 });
	}

	if (aiActiveProviderId !== undefined && aiActiveProviderId !== null && typeof aiActiveProviderId !== 'string') {
		return Response.json({ error: 'Invalid aiActiveProviderId value' }, { status: 400 });
	}

	if (useMarketDataForSnapshots !== undefined && typeof useMarketDataForSnapshots !== 'boolean') {
		return Response.json({ error: 'Invalid useMarketDataForSnapshots value' }, { status: 400 });
	}

	if (notifySyncErrors !== undefined && typeof notifySyncErrors !== 'boolean') {
		return Response.json({ error: 'Invalid notifySyncErrors value' }, { status: 400 });
	}
	if (notifyBudgetAlerts !== undefined && typeof notifyBudgetAlerts !== 'boolean') {
		return Response.json({ error: 'Invalid notifyBudgetAlerts value' }, { status: 400 });
	}
	if (notifyLargeTransactions !== undefined && typeof notifyLargeTransactions !== 'boolean') {
		return Response.json({ error: 'Invalid notifyLargeTransactions value' }, { status: 400 });
	}
	if (largeTransactionThreshold !== undefined && (typeof largeTransactionThreshold !== 'number' || largeTransactionThreshold < 0)) {
		return Response.json({ error: 'Invalid largeTransactionThreshold value' }, { status: 400 });
	}
  if (birthYear !== undefined && birthYear !== null && (typeof birthYear !== 'number' || !Number.isInteger(birthYear) || birthYear < 1900 || birthYear > new Date().getFullYear())) {
    return Response.json({ error: 'Invalid birthYear value (must be an integer between 1900 and the current year)' }, { status: 400 });
  }
	if (notifyMonthlySummary !== undefined && typeof notifyMonthlySummary !== 'boolean') {
		return Response.json({ error: 'Invalid notifyMonthlySummary value' }, { status: 400 });
	}
	if (budgetAlertThreshold !== undefined && (typeof budgetAlertThreshold !== 'number' || budgetAlertThreshold < 0 || budgetAlertThreshold > 100)) {
		return Response.json({ error: 'Invalid budgetAlertThreshold value (must be 0-100)' }, { status: 400 });
	}
	if (notifyGoalMilestones !== undefined && typeof notifyGoalMilestones !== 'boolean') {
		return Response.json({ error: 'Invalid notifyGoalMilestones value' }, { status: 400 });
	}
	if (notifyNetWorthMilestones !== undefined && typeof notifyNetWorthMilestones !== 'boolean') {
		return Response.json({ error: 'Invalid notifyNetWorthMilestones value' }, { status: 400 });
	}
	if (netWorthMilestoneInterval !== undefined && (typeof netWorthMilestoneInterval !== 'number' || netWorthMilestoneInterval <= 0)) {
		return Response.json({ error: 'Invalid netWorthMilestoneInterval value' }, { status: 400 });
	}
	if (notifyWeeklyNetWorthChange !== undefined && typeof notifyWeeklyNetWorthChange !== 'boolean') {
		return Response.json({ error: 'Invalid notifyWeeklyNetWorthChange value' }, { status: 400 });
	}
	const VALID_DAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
	if (weeklyNetWorthAlertDay !== undefined && (typeof weeklyNetWorthAlertDay !== 'string' || !VALID_DAYS.includes(weeklyNetWorthAlertDay.toLowerCase()))) {
		return Response.json({ error: 'Invalid weeklyNetWorthAlertDay value. Expected day of week.' }, { status: 400 });
	}
	if (notifyAiProposals !== undefined && typeof notifyAiProposals !== 'boolean') {
		return Response.json({ error: 'Invalid notifyAiProposals value' }, { status: 400 });
	}
  // R6: cap limiter settings server-side so users cannot configure a limiter
  // so strict that it silently drops legitimate alerts, or so loose that it
  // becomes a no-op. (maxNotificationsPerPeriod: 1–50, period: 5–1440 min.)
  if (
    maxNotificationsPerPeriod !== undefined &&
    (typeof maxNotificationsPerPeriod !== 'number' || !Number.isFinite(maxNotificationsPerPeriod) || maxNotificationsPerPeriod < 1 || maxNotificationsPerPeriod > 50)
  ) {
    return Response.json({ error: 'Invalid maxNotificationsPerPeriod value (must be 1-50)' }, { status: 400 });
  }
  if (
    notificationLimiterPeriodMinutes !== undefined &&
    (typeof notificationLimiterPeriodMinutes !== 'number' || !Number.isFinite(notificationLimiterPeriodMinutes) || notificationLimiterPeriodMinutes < 5 || notificationLimiterPeriodMinutes > 1440)
  ) {
    return Response.json({ error: 'Invalid notificationLimiterPeriodMinutes value (must be 5-1440)' }, { status: 400 });
  }
	if (notifyRecurringPriceChanges !== undefined && typeof notifyRecurringPriceChanges !== 'boolean') {
		return Response.json({ error: 'Invalid notifyRecurringPriceChanges value' }, { status: 400 });
	}
	if (notifyUpcomingBills !== undefined && typeof notifyUpcomingBills !== 'boolean') {
		return Response.json({ error: 'Invalid notifyUpcomingBills value' }, { status: 400 });
	}
	if (upcomingBillsLeadDays !== undefined && (typeof upcomingBillsLeadDays !== 'number' || !Number.isInteger(upcomingBillsLeadDays) || upcomingBillsLeadDays < 1 || upcomingBillsLeadDays > 14)) {
		return Response.json({ error: 'Invalid upcomingBillsLeadDays value (must be 1-14)' }, { status: 400 });
	}
	if (recurringExclusions !== undefined) {
		if (typeof recurringExclusions !== 'object' || recurringExclusions === null || Array.isArray(recurringExclusions)) {
			return Response.json({ error: 'Invalid recurringExclusions value' }, { status: 400 });
		}
		if (recurringExclusions.categoryIds !== undefined && (!Array.isArray(recurringExclusions.categoryIds) || !recurringExclusions.categoryIds.every((id: unknown) => typeof id === 'string'))) {
			return Response.json({ error: 'Invalid recurringExclusions.categoryIds value' }, { status: 400 });
		}
		if (recurringExclusions.accountIds !== undefined && (!Array.isArray(recurringExclusions.accountIds) || !recurringExclusions.accountIds.every((id: unknown) => typeof id === 'string'))) {
			return Response.json({ error: 'Invalid recurringExclusions.accountIds value' }, { status: 400 });
		}
    if (recurringExclusions.accountTypes !== undefined && (!Array.isArray(recurringExclusions.accountTypes) || !recurringExclusions.accountTypes.every((t: unknown) => typeof t === 'string'))) {
      return Response.json({ error: 'Invalid recurringExclusions.accountTypes value' }, { status: 400 });
    }
		if (recurringExclusions.merchantPatterns !== undefined && (!Array.isArray(recurringExclusions.merchantPatterns) || !recurringExclusions.merchantPatterns.every((pattern: unknown) => typeof pattern === 'string'))) {
			return Response.json({ error: 'Invalid recurringExclusions.merchantPatterns value' }, { status: 400 });
		}
    if (recurringExclusions.tagIds !== undefined && (!Array.isArray(recurringExclusions.tagIds) || !recurringExclusions.tagIds.every((id: unknown) => typeof id === 'string'))) {
      return Response.json({ error: 'Invalid recurringExclusions.tagIds value' }, { status: 400 });
    }
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
        currency: currency ? currency.toUpperCase() : DEFAULTS.currency,
        locale: locale ?? DEFAULTS.locale,
        dateFormat: dateFormat ?? DEFAULTS.dateFormat,
        compactMode: compactMode ?? DEFAULTS.compactMode,
        textSize: textSize ?? DEFAULTS.textSize,
        theme: theme ?? DEFAULTS.theme,
        timezone: timezone ?? DEFAULTS.timezone,
        privacyMode: privacyMode ?? DEFAULTS.privacyMode,
        accentColor: accentColor ?? DEFAULTS.accentColor,
        chartColorScheme: chartColorScheme ?? DEFAULTS.chartColorScheme,
        chartVisibility: chartVisibility ?? DEFAULTS.chartVisibility,
        forecastMode: forecastMode ?? DEFAULTS.forecastMode,
        forecastLookbackMonths: forecastLookbackMonths ?? DEFAULTS.forecastLookbackMonths,
        hiddenPages: hiddenPages ?? DEFAULTS.hiddenPages,
        showSyntheticData: showSyntheticData ?? DEFAULTS.showSyntheticData,
        showImportedData: showImportedData ?? DEFAULTS.showImportedData,
        useMarketDataForSnapshots: useMarketDataForSnapshots ?? DEFAULTS.useMarketDataForSnapshots,
        defaultChartTimeRange: defaultChartTimeRange ?? DEFAULTS.defaultChartTimeRange,
        defaultChartType: defaultChartType ?? DEFAULTS.defaultChartType,
        reduceTransparency: reduceTransparency ?? DEFAULTS.reduceTransparency,
        hideAccountSubheadings: hideAccountSubheadings ?? DEFAULTS.hideAccountSubheadings,
        hideAccountsSidebarByDefault: hideAccountsSidebarByDefault ?? DEFAULTS.hideAccountsSidebarByDefault,
        chartSelections: chartSelections ?? DEFAULTS.chartSelections,
        cardCollapsedStates: cardCollapsedStates ?? DEFAULTS.cardCollapsedStates,
        paystubEnabled: paystubEnabled ?? DEFAULTS.paystubEnabled,
        accountTagVisibility: accountTagVisibility ?? DEFAULTS.accountTagVisibility,
        budgetExclusions: budgetExclusions ?? DEFAULTS.budgetExclusions,
        recurringExclusions: recurringExclusions ?? DEFAULTS.recurringExclusions,
      })
      .returning();

    return Response.json({
      currency: created?.currency ?? DEFAULTS.currency,
      locale: created?.locale ?? DEFAULTS.locale,
      dateFormat: created?.dateFormat ?? DEFAULTS.dateFormat,
      compactMode: created?.compactMode ?? DEFAULTS.compactMode,
      textSize: created?.textSize ?? DEFAULTS.textSize,
      theme: created?.theme ?? DEFAULTS.theme,
      timezone: created?.timezone ?? DEFAULTS.timezone,
      privacyMode: created?.privacyMode,
      accentColor: created?.accentColor,
      chartVisibility: created?.chartVisibility ?? DEFAULTS.chartVisibility,
      chartColorScheme: created?.chartColorScheme ?? DEFAULTS.chartColorScheme,
      forecastMode: created?.forecastMode ?? DEFAULTS.forecastMode,
      forecastLookbackMonths: created?.forecastLookbackMonths ?? DEFAULTS.forecastLookbackMonths,
      hiddenPages: created?.hiddenPages ?? DEFAULTS.hiddenPages,
      showSyntheticData: created?.showSyntheticData ?? DEFAULTS.showSyntheticData,
      useMarketDataForSnapshots: created?.useMarketDataForSnapshots ?? DEFAULTS.useMarketDataForSnapshots,
      defaultChartTimeRange: created?.defaultChartTimeRange ?? DEFAULTS.defaultChartTimeRange,
      defaultChartType: created?.defaultChartType ?? DEFAULTS.defaultChartType,
      reduceTransparency: created?.reduceTransparency ?? DEFAULTS.reduceTransparency,
      hideAccountSubheadings: created?.hideAccountSubheadings ?? DEFAULTS.hideAccountSubheadings,
      hideAccountsSidebarByDefault: created?.hideAccountsSidebarByDefault ?? DEFAULTS.hideAccountsSidebarByDefault,
      chartSelections: created?.chartSelections ?? DEFAULTS.chartSelections,
      cardCollapsedStates: created?.cardCollapsedStates ?? DEFAULTS.cardCollapsedStates,
      apiKeys: created?.apiKeys ?? {},
      accountTagVisibility: created?.accountTagVisibility ?? DEFAULTS.accountTagVisibility,
      notifySyncErrors: created?.notifySyncErrors ?? DEFAULTS.notifySyncErrors,
      notifyBudgetAlerts: created?.notifyBudgetAlerts ?? DEFAULTS.notifyBudgetAlerts,
      notifyLargeTransactions: created?.notifyLargeTransactions ?? DEFAULTS.notifyLargeTransactions,
      largeTransactionThreshold: created?.largeTransactionThreshold ?? DEFAULTS.largeTransactionThreshold,
      birthYear: created?.birthYear ?? null,
      notifyMonthlySummary: created?.notifyMonthlySummary ?? DEFAULTS.notifyMonthlySummary,
      budgetAlertThreshold: created?.budgetAlertThreshold ?? DEFAULTS.budgetAlertThreshold,
      notifyGoalMilestones: created?.notifyGoalMilestones ?? DEFAULTS.notifyGoalMilestones,
      notifyNetWorthMilestones: created?.notifyNetWorthMilestones ?? DEFAULTS.notifyNetWorthMilestones,
      netWorthMilestoneInterval: created?.netWorthMilestoneInterval ?? DEFAULTS.netWorthMilestoneInterval,
      notifyWeeklyNetWorthChange: created?.notifyWeeklyNetWorthChange ?? DEFAULTS.notifyWeeklyNetWorthChange,
      weeklyNetWorthAlertDay: created?.weeklyNetWorthAlertDay ?? DEFAULTS.weeklyNetWorthAlertDay,
      notifyAiProposals: created?.notifyAiProposals ?? DEFAULTS.notifyAiProposals,
      maxNotificationsPerPeriod: created?.maxNotificationsPerPeriod ?? DEFAULTS.maxNotificationsPerPeriod,
      notificationLimiterPeriodMinutes: created?.notificationLimiterPeriodMinutes ?? DEFAULTS.notificationLimiterPeriodMinutes,
      recurringExclusions: created?.recurringExclusions ?? DEFAULTS.recurringExclusions,
      notifyRecurringPriceChanges: created?.notifyRecurringPriceChanges ?? DEFAULTS.notifyRecurringPriceChanges,
      notifyUpcomingBills: created?.notifyUpcomingBills ?? DEFAULTS.notifyUpcomingBills,
      upcomingBillsLeadDays: created?.upcomingBillsLeadDays ?? DEFAULTS.upcomingBillsLeadDays,
    });
  }

  const dek = await getSessionDEK().catch(() => null);
  const updates: Record<string, any> = {};
  if (currency !== undefined) updates.currency = currency.toUpperCase();
  if (locale !== undefined) updates.locale = locale;
  if (dateFormat !== undefined) updates.dateFormat = dateFormat;
  if (compactMode !== undefined) updates.compactMode = compactMode;
  if (textSize !== undefined) updates.textSize = textSize;
  if (theme !== undefined) updates.theme = theme;
  if (timezone !== undefined) updates.timezone = timezone;
  if (privacyMode !== undefined) updates.privacyMode = privacyMode;
  if (accentColor !== undefined) updates.accentColor = accentColor;
  if (chartVisibility !== undefined) updates.chartVisibility = chartVisibility;
  if (chartColorScheme !== undefined) updates.chartColorScheme = chartColorScheme;
  if (forecastMode !== undefined) updates.forecastMode = forecastMode;
  if (forecastLookbackMonths !== undefined) updates.forecastLookbackMonths = forecastLookbackMonths;
  if (hiddenPages !== undefined) updates.hiddenPages = hiddenPages;
  if (showSyntheticData !== undefined) updates.showSyntheticData = showSyntheticData;
  if (showImportedData !== undefined) updates.showImportedData = showImportedData;
  if (defaultChartTimeRange !== undefined) updates.defaultChartTimeRange = defaultChartTimeRange;
  if (defaultChartType !== undefined) updates.defaultChartType = defaultChartType;
  if (reduceTransparency !== undefined) updates.reduceTransparency = reduceTransparency;
  if (hideAccountSubheadings !== undefined) updates.hideAccountSubheadings = hideAccountSubheadings;
  if (hideAccountsSidebarByDefault !== undefined) updates.hideAccountsSidebarByDefault = hideAccountsSidebarByDefault;
  if (chartSelections !== undefined) {
    const existingSelections = ensureJsonObject(settings[0].chartSelections, {});
    updates.chartSelections = { ...existingSelections, ...chartSelections };
  }
  if (cardCollapsedStates !== undefined) {
    const existingStates = ensureJsonObject(settings[0].cardCollapsedStates, {});
    updates.cardCollapsedStates = { ...existingStates, ...cardCollapsedStates };
  }
	if (paystubEnabled !== undefined) updates.paystubEnabled = paystubEnabled;
	if (aiSystemPrompt !== undefined) updates.aiSystemPrompt = aiSystemPrompt;
	if (aiAutoAnalyze !== undefined) updates.aiAutoAnalyze = aiAutoAnalyze;
	if (aiAutoApprove !== undefined) updates.aiAutoApprove = aiAutoApprove;
	if (aiAutoApproveThreshold !== undefined) updates.aiAutoApproveThreshold = aiAutoApproveThreshold;
	if (aiBatchSize !== undefined) updates.aiBatchSize = aiBatchSize;
	if (aiAnalysisTimeoutSeconds !== undefined) updates.aiAnalysisTimeoutSeconds = aiAnalysisTimeoutSeconds;
	if (aiActiveProviderId !== undefined) updates.aiActiveProviderId = aiActiveProviderId;
	if (useMarketDataForSnapshots !== undefined) updates.useMarketDataForSnapshots = useMarketDataForSnapshots;
	if (apiKeys !== undefined) {
		updates.apiKeys = dek ? await encryptField(JSON.stringify(apiKeys), dek) : JSON.stringify(apiKeys);
	}
	if (accountTagVisibility !== undefined) {
		const existingVisibility = ensureJsonObject(settings[0].accountTagVisibility, DEFAULTS.accountTagVisibility as Record<string, any>);
		updates.accountTagVisibility = { ...existingVisibility, ...accountTagVisibility };
	}
  if (budgetExclusions !== undefined) {
    const existingEx = ensureJsonObject(settings[0].budgetExclusions, { categoryIds: [], tagIds: [] });
    updates.budgetExclusions = {
      categoryIds: budgetExclusions.categoryIds ?? existingEx.categoryIds ?? [],
      tagIds: budgetExclusions.tagIds ?? existingEx.tagIds ?? [],
    };
  }
  if (recurringExclusions !== undefined) {
    updates.recurringExclusions = {
      categoryIds: recurringExclusions.categoryIds ?? [],
      accountIds: recurringExclusions.accountIds ?? [],
      accountTypes: recurringExclusions.accountTypes ?? [],
      merchantPatterns: recurringExclusions.merchantPatterns ?? [],
        tagIds: recurringExclusions.tagIds ?? [],
    };
  }
	if (notifySyncErrors !== undefined) updates.notifySyncErrors = notifySyncErrors;
	if (notifyBudgetAlerts !== undefined) updates.notifyBudgetAlerts = notifyBudgetAlerts;
	if (notifyLargeTransactions !== undefined) updates.notifyLargeTransactions = notifyLargeTransactions;
	if (largeTransactionThreshold !== undefined) updates.largeTransactionThreshold = largeTransactionThreshold;
  if (birthYear !== undefined) updates.birthYear = birthYear;
	if (notifyMonthlySummary !== undefined) updates.notifyMonthlySummary = notifyMonthlySummary;
	if (budgetAlertThreshold !== undefined) updates.budgetAlertThreshold = budgetAlertThreshold;
	if (notifyGoalMilestones !== undefined) updates.notifyGoalMilestones = notifyGoalMilestones;
	if (notifyNetWorthMilestones !== undefined) updates.notifyNetWorthMilestones = notifyNetWorthMilestones;
	if (netWorthMilestoneInterval !== undefined) updates.netWorthMilestoneInterval = netWorthMilestoneInterval;
	if (notifyWeeklyNetWorthChange !== undefined) updates.notifyWeeklyNetWorthChange = notifyWeeklyNetWorthChange;
	if (weeklyNetWorthAlertDay !== undefined) updates.weeklyNetWorthAlertDay = weeklyNetWorthAlertDay.toLowerCase();
	if (notifyAiProposals !== undefined) updates.notifyAiProposals = notifyAiProposals;
	if (notifyRecurringPriceChanges !== undefined) updates.notifyRecurringPriceChanges = notifyRecurringPriceChanges;
	if (notifyUpcomingBills !== undefined) updates.notifyUpcomingBills = notifyUpcomingBills;
	if (upcomingBillsLeadDays !== undefined) updates.upcomingBillsLeadDays = upcomingBillsLeadDays;
	if (maxNotificationsPerPeriod !== undefined) updates.maxNotificationsPerPeriod = maxNotificationsPerPeriod;
	if (notificationLimiterPeriodMinutes !== undefined) updates.notificationLimiterPeriodMinutes = notificationLimiterPeriodMinutes;
	if (deletePendingOlderThan30Days !== undefined) updates.deletePendingOlderThan30Days = deletePendingOlderThan30Days;
	if (deletePendingDays !== undefined) updates.deletePendingDays = deletePendingDays;
  updates.updatedAt = new Date();

  const [updated] = await db
    .update(userSettings)
    .set(updates)
    .where(eq(userSettings.userId, session.user.id))
    .returning();

  if (showSyntheticData !== undefined || useMarketDataForSnapshots !== undefined) {
    const prevSynthetic = settings[0].showSyntheticData as Record<string, boolean> | null;
    const nextSynthetic = showSyntheticData !== undefined ? (showSyntheticData as Record<string, boolean>) : (prevSynthetic || (DEFAULTS.showSyntheticData as Record<string, boolean>));

    const prevUseMarketData = settings[0].useMarketDataForSnapshots;
    const nextUseMarketData = useMarketDataForSnapshots !== undefined ? useMarketDataForSnapshots : prevUseMarketData;

    const netWorthChanged = showSyntheticData !== undefined && (prevSynthetic?.netWorth !== false) !== (nextSynthetic.netWorth !== false);
    const investmentsChanged = (showSyntheticData !== undefined && (prevSynthetic?.investments !== false) !== (nextSynthetic.investments !== false)) || (prevUseMarketData !== nextUseMarketData);
    const realEstateChanged = showSyntheticData !== undefined && (prevSynthetic?.realEstate !== false) !== (nextSynthetic.realEstate !== false);

    if (netWorthChanged || investmentsChanged || realEstateChanged) {
      const today = new Date().toISOString().split('T')[0];
      const dataUserId = (session.user as any).dataUserId ?? session.user.id;

      (async () => {
        const userAccounts = await db
          .select()
          .from(accounts)
          .where(eq(accounts.userId, dataUserId));
        const decrypted = await decryptRows('accounts', userAccounts, dek);

        const MODEL_SNAPSHOT_TYPES = [
          'realestate', 'primaryhome', 'secondaryhome', 'rentalproperty', 'commercial', 'land', 'otherrealestate',
          'single-family', 'condo', 'townhouse', 'multi-family', 'other',
          'vehicle', 'metals', 'mortgage'
        ];

        const { isInvestmentAccount } = await import('@/lib/utils/account-scope');
        const { generateHistoricalAccountSnapshots, recalculateNetWorthSnapshots, getAccountEarliestCalculationDate } = await import('@/lib/services/account-history');
        const { generateAssetHistorySnapshots } = await import('@/lib/services/asset-estimator');
        const { readApiConfig } = await import('@/lib/services/manual-accounts');

        // 1. Process Net Worth (Standard) accounts
        if (netWorthChanged) {
          const standardAccounts = decrypted.filter(acc =>
            !isInvestmentAccount(acc.type) && !MODEL_SNAPSHOT_TYPES.includes(acc.type)
          );
          const standardIds = standardAccounts.map(a => a.id);

          if (nextSynthetic.netWorth === false) {
            if (standardIds.length > 0) {
              await db.delete(accountSnapshots).where(
                and(
                  eq(accountSnapshots.userId, dataUserId),
                  eq(accountSnapshots.isSynthetic, true),
                  inArray(accountSnapshots.accountId, standardIds)
                )
              );
            }
          } else {
            for (const acc of standardAccounts) {
              try {
                const fromDate = await getAccountEarliestCalculationDate(acc.id, dataUserId, acc.metadata, dek);
                await generateHistoricalAccountSnapshots(acc.id, dataUserId, fromDate, today, dek);
              } catch (err) {
                console.error(`Failed to recalculate synthetic netWorth snapshots for ${acc.id}:`, err);
              }
            }
          }
        }

        // 2. Process Investments accounts
        if (investmentsChanged) {
          const investmentAccounts = decrypted.filter(acc => isInvestmentAccount(acc.type));
          const investmentIds = investmentAccounts.map(a => a.id);

          if (nextSynthetic.investments === false) {
            if (investmentIds.length > 0) {
              await db.delete(accountSnapshots).where(
                and(
                  eq(accountSnapshots.userId, dataUserId),
                  eq(accountSnapshots.isSynthetic, true),
                  inArray(accountSnapshots.accountId, investmentIds)
                )
              );
            }
          } else {
            for (const acc of investmentAccounts) {
              try {
                const fromDate = await getAccountEarliestCalculationDate(acc.id, dataUserId, acc.metadata, dek);
                await generateHistoricalAccountSnapshots(acc.id, dataUserId, fromDate, today, dek);
              } catch (err) {
                console.error(`Failed to recalculate synthetic investments snapshots for ${acc.id}:`, err);
              }
            }
          }
        }

        // 3. Process Real Estate (Model) accounts
        if (realEstateChanged) {
          const modelAccounts = decrypted.filter(acc => MODEL_SNAPSHOT_TYPES.includes(acc.type));
          const modelIds = modelAccounts.map(a => a.id);

          if (nextSynthetic.realEstate === false) {
            if (modelIds.length > 0) {
              await db.delete(accountSnapshots).where(
                and(
                  eq(accountSnapshots.userId, dataUserId),
                  eq(accountSnapshots.isSynthetic, true),
                  inArray(accountSnapshots.accountId, modelIds)
                )
              );
            }
          } else {
            const apiConfig = await readApiConfig(session.user.id).catch(() => undefined);
            for (const acc of modelAccounts) {
              try {
                const meta = typeof acc.metadata === 'string'
                  ? JSON.parse(acc.metadata)
                  : (typeof acc.metadata === 'object' && acc.metadata !== null ? acc.metadata : {});
                await generateAssetHistorySnapshots(acc.id, dataUserId, acc.type, meta, apiConfig, dek);
              } catch (err) {
                console.error(`Failed to recalculate synthetic realEstate snapshots for ${acc.id}:`, err);
              }
            }
          }
        }

        // 4. Rebuild Net Worth Snapshots
        await recalculateNetWorthSnapshots(dataUserId, dek);

      })().catch(e => {
        console.error('Failed to update synthetic snapshots in background settings change:', e);
      });
    }
  }

  if (paystubEnabled !== undefined) {
    Promise.all([
      updateMonthlyCashFlowSummaries(session.user.id, dek),
      updateCategorySpendingSummaries(session.user.id, dek),
      updateCategoryIncomeSummaries(session.user.id, dek),
    ]).catch((e) => {
      console.error('Failed to update summaries after toggling paystubs in background:', e);
    });
  }

  if (timezone !== undefined || weeklyNetWorthAlertDay !== undefined) {
    try {
      const { syncScheduler } = await import('@/lib/services/sync-scheduler');
      if (syncScheduler.isRunning) {
        await syncScheduler.scheduleForUser(session.user.id);
      }
    } catch (err) {
      console.error('Failed to reschedule syncs after updating alert time/timezone:', err);
    }
  }

  const resultSetting = updated || settings[0];
  if (!resultSetting) {
    return Response.json({ error: 'Failed to update user settings' }, { status: 500 });
  }

  let updatedApiKeys: Record<string, string> = {};
  if (resultSetting.apiKeys) {
    try {
      if (dek) {
        updatedApiKeys = JSON.parse(await decryptField(resultSetting.apiKeys, dek));
      } else {
        updatedApiKeys = JSON.parse(resultSetting.apiKeys);
      }
    } catch { /* return empty */ }
  }

  return Response.json({
    currency: resultSetting.currency ?? DEFAULTS.currency,
    locale: resultSetting.locale ?? DEFAULTS.locale,
    dateFormat: resultSetting.dateFormat ?? DEFAULTS.dateFormat,
    compactMode: resultSetting.compactMode ?? DEFAULTS.compactMode,
    textSize: resultSetting.textSize ?? DEFAULTS.textSize,
    theme: resultSetting.theme ?? DEFAULTS.theme,
    timezone: resultSetting.timezone,
    privacyMode: resultSetting.privacyMode,
    accentColor: resultSetting.accentColor,
    chartVisibility: resultSetting.chartVisibility ?? DEFAULTS.chartVisibility,
    chartColorScheme: resultSetting.chartColorScheme ?? DEFAULTS.chartColorScheme,
    forecastMode: resultSetting.forecastMode ?? DEFAULTS.forecastMode,
    forecastLookbackMonths: resultSetting.forecastLookbackMonths ?? DEFAULTS.forecastLookbackMonths,
    hiddenPages: resultSetting.hiddenPages ?? DEFAULTS.hiddenPages,
    showSyntheticData: resultSetting.showSyntheticData ?? DEFAULTS.showSyntheticData,
    showImportedData: resultSetting.showImportedData ?? DEFAULTS.showImportedData,
    useMarketDataForSnapshots: resultSetting.useMarketDataForSnapshots ?? DEFAULTS.useMarketDataForSnapshots,
    defaultChartTimeRange: resultSetting.defaultChartTimeRange ?? DEFAULTS.defaultChartTimeRange,
    defaultChartType: resultSetting.defaultChartType ?? DEFAULTS.defaultChartType,
    reduceTransparency: resultSetting.reduceTransparency ?? DEFAULTS.reduceTransparency,
    hideAccountSubheadings: resultSetting.hideAccountSubheadings ?? DEFAULTS.hideAccountSubheadings,
    hideAccountsSidebarByDefault: resultSetting.hideAccountsSidebarByDefault ?? DEFAULTS.hideAccountsSidebarByDefault,
    chartSelections: resultSetting.chartSelections ?? DEFAULTS.chartSelections,
    cardCollapsedStates: resultSetting.cardCollapsedStates ?? DEFAULTS.cardCollapsedStates,
    paystubEnabled: resultSetting.paystubEnabled ?? DEFAULTS.paystubEnabled,
    aiSystemPrompt: resultSetting.aiSystemPrompt ?? DEFAULTS.aiSystemPrompt,
    aiAutoAnalyze: resultSetting.aiAutoAnalyze ?? DEFAULTS.aiAutoAnalyze,
    aiAutoApprove: resultSetting.aiAutoApprove ?? DEFAULTS.aiAutoApprove,
    aiAutoApproveThreshold: resultSetting.aiAutoApproveThreshold ?? DEFAULTS.aiAutoApproveThreshold,
    aiBatchSize: resultSetting.aiBatchSize ?? DEFAULTS.aiBatchSize,
    aiAnalysisTimeoutSeconds: resultSetting.aiAnalysisTimeoutSeconds ?? DEFAULTS.aiAnalysisTimeoutSeconds,
    aiActiveProviderId: resultSetting.aiActiveProviderId ?? DEFAULTS.aiActiveProviderId,
    apiKeys: updatedApiKeys,
    accountTagVisibility: resultSetting.accountTagVisibility ?? DEFAULTS.accountTagVisibility,
    budgetExclusions: resultSetting.budgetExclusions ?? DEFAULTS.budgetExclusions,
    notifySyncErrors: resultSetting.notifySyncErrors,
    notifyBudgetAlerts: resultSetting.notifyBudgetAlerts,
    notifyLargeTransactions: resultSetting.notifyLargeTransactions,
    largeTransactionThreshold: resultSetting.largeTransactionThreshold,
    birthYear: resultSetting.birthYear ?? null,
    notifyMonthlySummary: resultSetting.notifyMonthlySummary,
    budgetAlertThreshold: resultSetting.budgetAlertThreshold,
    notifyGoalMilestones: resultSetting.notifyGoalMilestones,
    notifyNetWorthMilestones: resultSetting.notifyNetWorthMilestones,
    netWorthMilestoneInterval: resultSetting.netWorthMilestoneInterval,
    notifyWeeklyNetWorthChange: resultSetting.notifyWeeklyNetWorthChange,
    weeklyNetWorthAlertDay: resultSetting.weeklyNetWorthAlertDay,
    notifyAiProposals: resultSetting.notifyAiProposals,
    maxNotificationsPerPeriod: resultSetting.maxNotificationsPerPeriod,
    notificationLimiterPeriodMinutes: resultSetting.notificationLimiterPeriodMinutes,
    recurringExclusions: resultSetting.recurringExclusions ?? DEFAULTS.recurringExclusions,
    notifyRecurringPriceChanges: resultSetting.notifyRecurringPriceChanges ?? DEFAULTS.notifyRecurringPriceChanges,
    notifyUpcomingBills: resultSetting.notifyUpcomingBills ?? DEFAULTS.notifyUpcomingBills,
    upcomingBillsLeadDays: resultSetting.upcomingBillsLeadDays ?? DEFAULTS.upcomingBillsLeadDays,
  });
  } catch (err) {
    console.error('Failed to update user settings:', err);
    return Response.json(
      { error: err instanceof Error ? err.message : 'Internal server error' },
      { status: 500 }
    );
  }
}
