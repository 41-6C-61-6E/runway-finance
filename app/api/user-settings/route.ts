import { handleUserSettingsPatch } from '@/lib/services/user-settings/patch-handler';
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

/**
 * Strips values that can't survive a JSON round-trip and enforces a sane depth.
 *
 * `chartSelections` is an untyped key→value map merged shallowly into whatever is
 * already stored, so a value of the wrong shape (e.g. a non-array for a key whose
 * consumers call `.includes`) would otherwise persist indefinitely. There is no
 * per-key schema to validate against, so we reject the structurally impossible
 * rather than guess each key's type; `usePersistentState` also guards on restore.
 */
function sanitizeChartSelections(
  input: Record<string, unknown>,
  maxDepth = 8
): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(input)) {
    if (value === undefined || typeof value === 'function' || typeof value === 'symbol') continue;

    if (value === null || typeof value === 'boolean' || typeof value === 'string') {
      result[key] = value;
      continue;
    }

    if (typeof value === 'number') {
      if (Number.isFinite(value)) result[key] = value;
      continue;
    }

    if (maxDepth <= 0) continue;

    if (Array.isArray(value)) {
      result[key] = value.filter(
        (item) =>
          item === null ||
          ['boolean', 'string', 'number'].includes(typeof item) ||
          (typeof item === 'object' && sanitizeChartSelections({ v: item }, maxDepth - 1).v !== undefined)
      );
      continue;
    }

    if (typeof value === 'object') {
      result[key] = sanitizeChartSelections(value as Record<string, unknown>, maxDepth - 1);
    }
  }

  return result;
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
      aiEnabled: created?.aiEnabled ?? DEFAULTS.aiEnabled,
      aiSuggestionsEnabled: created?.aiSuggestionsEnabled ?? DEFAULTS.aiSuggestionsEnabled,
      aiAdviceEnabled: created?.aiAdviceEnabled ?? DEFAULTS.aiAdviceEnabled,
      aiAdviceModel: created?.aiAdviceModel ?? null,
      aiAdviceIncludeAccountNames: created?.aiAdviceIncludeAccountNames ?? DEFAULTS.aiAdviceIncludeAccountNames,
      aiAdviceConsentHost: created?.aiAdviceConsentHost ?? null,
      aiAdviceConsentAt: created?.aiAdviceConsentAt ?? null,
      aiAdviceTokenProfile: created?.aiAdviceTokenProfile ?? DEFAULTS.aiAdviceTokenProfile,
      aiAskEnabled: created?.aiAdviceEnabled ?? DEFAULTS.aiAdviceEnabled,
      aiAskModel: created?.aiAdviceModel ?? null,
      aiAskIncludeAccountNames: created?.aiAdviceIncludeAccountNames ?? DEFAULTS.aiAdviceIncludeAccountNames,
      aiAskConsentHost: created?.aiAdviceConsentHost ?? null,
      aiAskConsentAt: created?.aiAdviceConsentAt ?? null,
      aiAskTokenProfile: created?.aiAdviceTokenProfile ?? DEFAULTS.aiAdviceTokenProfile,
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
      notifyAppUpdates: (created as any)?.notifyAppUpdates ?? DEFAULTS.notifyAppUpdates,
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
    aiEnabled: settings[0].aiEnabled ?? DEFAULTS.aiEnabled,
    aiSuggestionsEnabled: settings[0].aiSuggestionsEnabled ?? DEFAULTS.aiSuggestionsEnabled,
    aiAdviceEnabled: settings[0].aiAdviceEnabled ?? DEFAULTS.aiAdviceEnabled,
    aiAdviceModel: settings[0].aiAdviceModel ?? null,
    aiAdviceIncludeAccountNames: settings[0].aiAdviceIncludeAccountNames ?? DEFAULTS.aiAdviceIncludeAccountNames,
    aiAdviceConsentHost: settings[0].aiAdviceConsentHost ?? null,
    aiAdviceConsentAt: settings[0].aiAdviceConsentAt ?? null,
    aiAdviceTokenProfile: settings[0].aiAdviceTokenProfile ?? DEFAULTS.aiAdviceTokenProfile,
    aiAskEnabled: settings[0].aiAdviceEnabled ?? DEFAULTS.aiAdviceEnabled,
    aiAskModel: settings[0].aiAdviceModel ?? null,
    aiAskIncludeAccountNames: settings[0].aiAdviceIncludeAccountNames ?? DEFAULTS.aiAdviceIncludeAccountNames,
    aiAskConsentHost: settings[0].aiAdviceConsentHost ?? null,
    aiAskConsentAt: settings[0].aiAdviceConsentAt ?? null,
    aiAskTokenProfile: settings[0].aiAdviceTokenProfile ?? DEFAULTS.aiAdviceTokenProfile,
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
    notifyAppUpdates: (settings[0] as any).notifyAppUpdates ?? DEFAULTS.notifyAppUpdates,
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
    return await handleUserSettingsPatch(session.user.id, body);
  } catch (err) {
    console.error('Failed to update user settings:', err);
    return Response.json(
      { error: err instanceof Error ? err.message : 'Internal server error' },
      { status: 500 }
    );
  }
}
