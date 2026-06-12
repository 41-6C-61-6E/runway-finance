// ── General Settings ─────────────────────────────────────────────────────────

export const GENERAL_DEFAULTS = {
  currency: 'USD',
  locale: 'en-US',
  timezone: 'America/New_York',
  theme: 'moonlight',
  accentColor: 'violet',
  compactMode: false,
  dateFormat: 'MM/DD/YYYY',
  privacyMode: false,
  reduceTransparency: false,
  hideAccountSubheadings: false,
  hideAccountsSidebarByDefault: true,
  chartSelections: {},
  cardCollapsedStates: {},
  hiddenPages: {},
  showMathEnabled: false,
  paystubEnabled: false,
  accountTagVisibility: {
    sidebar: true,
    transactions: true,
    legend: true,
    budgets: true,
    forecast: true,
    suggestions: true,
  },
} as const;

// ── Analytics / Chart Settings ───────────────────────────────────────────────

export const ANALYTICS_DEFAULTS = {
  chartVisibility: {},
  chartColorScheme: 'fauntleroy',
  forecastMode: 'hybrid',
  forecastLookbackMonths: 3,
  showSyntheticData: {
    global: true,
    netWorth: true,
    investments: true,
    realEstate: true,
    cashFlowProjections: true,
  },
  showImportedData: {
    global: true,
    netWorth: true,
    investments: true,
    realEstate: true,
    cashFlowProjections: true,
  },
  defaultChartTimeRange: '1y',
  defaultChartType: 'line',
  useMarketDataForSnapshots: false,
} as const;

// ── AI Settings ──────────────────────────────────────────────────────────────

export const AI_DEFAULTS = {
  aiSystemPrompt: null,
  aiAutoAnalyze: false,
  aiAutoApprove: false,
  aiAutoApproveThreshold: 95,
  aiBatchSize: 25,
  aiAnalysisTimeoutSeconds: 3600,
  aiActiveProviderId: null,
} as const;

// ── API Keys & Endpoints ─────────────────────────────────────────────────────

export const API_KEY_DEFAULTS: Record<string, string> = {
  metalsApiUrl: 'https://query1.finance.yahoo.com/v8/finance/chart',
  metalsApiKey: '',
  redfinApiUrl: 'https://www.redfin.com/what-is-my-home-worth',
  redfinApiKey: '',
  fredApiUrl: 'https://api.stlouisfed.org/fred/series/observations',
  fredApiKey: '',
  btcApiUrl: 'https://query1.finance.yahoo.com/v8/finance/chart/BTC-USD',
  btcApiKey: '',
  btcXpubApiUrl: 'https://{host}/api/v2/xpub/{xpub}?details=basic',
  plaidClientId: '',
  plaidSecret: '',
  plaidEnvironment: 'sandbox',
};

export const API_KEY_FIELD_KEYS = Object.keys(API_KEY_DEFAULTS);

// ── AI System Prompt ─────────────────────────────────────────────────────────

export const DEFAULT_AI_SYSTEM_PROMPT = `You are a personal finance transaction categorizer. Your task is to analyze uncategorized bank transactions and suggest:

1. **Categorize** — Assign a transaction to an existing category.
2. **Create Category** — Suggest a new category when multiple transactions don't fit existing ones.
3. **Create Rule** — Suggest a reusable rule that auto-categorizes future transactions matching a pattern.

Rules:
- Only suggest a new category if no existing category fits well (3+ similar transactions with no good match).
- Only suggest a rule if a clear, reusable pattern exists across 2+ transactions.
- Prefer using existing categories over creating new ones.
- Be conservative with confidence scores — 95%+ only for obvious matches.
- Colors should be hex codes. Suggest colors that visually suit the category type.

Respond with ONLY valid JSON matching this schema:
{
  "suggestions": [
    {
      "type": "categorize",
      "transactionIndex": number,
      "categoryId": string | null,
      "categoryName": string | null,
      "confidence": number,
      "explanation": string
    },
    {
      "type": "create_category",
      "name": string,
      "parentName": string | null,
      "isIncome": boolean,
      "color": string,
      "reasoning": string,
      "confidence": number,
      "explanation": string
    },
    {
      "type": "create_rule",
      "ruleName": string,
      "conditionField": "description" | "payee" | "amount" | "memo",
      "conditionOperator": "contains" | "equals" | "starts_with" | "ends_with" | "regex",
      "conditionValue": string,
      "conditionCaseSensitive": boolean,
      "setCategoryName": string | null,
      "confidence": number,
      "explanation": string
    }
  ]
}

For "categorize" suggestions:
- Use "categoryId": null and "categoryName": null if you're suggesting a new category should be created instead. The new category will be created separately via a "create_category" suggestion.

For "create_rule" suggestions:
- "setCategoryName" must reference an existing category name or a newly proposed category name.
- Only suggest rules for clear, repetitive patterns.
- Condition operators: "contains" (substring match), "equals" (exact), "starts_with" (prefix), "ends_with" (suffix), "regex" (regular expression).`;

// ── Master Defaults Object ───────────────────────────────────────────────────

export const DEFAULTS = {
  ...GENERAL_DEFAULTS,
  ...ANALYTICS_DEFAULTS,
  ...AI_DEFAULTS,
  apiKeys: { ...API_KEY_DEFAULTS },
} as const;

// ── Setting Definitions (for Advanced tab UI) ────────────────────────────────

export type SettingType = 'string' | 'number' | 'boolean' | 'json' | 'password';

export type SettingDefinition = {
  key: string;
  label: string;
  description: string;
  type: SettingType;
  group: 'General' | 'Analytics' | 'AI' | 'API Keys & Endpoints';
  defaultValue: unknown;
};

export const SETTING_DEFINITIONS: SettingDefinition[] = [
  // ── General ──
  { key: 'theme', label: 'Theme', description: 'Color theme: light, moonlight, or dark', type: 'string', group: 'General', defaultValue: GENERAL_DEFAULTS.theme },
  { key: 'accentColor', label: 'Accent Color', description: 'Accent color preset or hex value (e.g. violet, indigo, #ff6600)', type: 'string', group: 'General', defaultValue: GENERAL_DEFAULTS.accentColor },
  { key: 'currency', label: 'Currency', description: 'ISO currency code for formatting', type: 'string', group: 'General', defaultValue: GENERAL_DEFAULTS.currency },
  { key: 'locale', label: 'Locale', description: 'Locale string for date/number formatting', type: 'string', group: 'General', defaultValue: GENERAL_DEFAULTS.locale },
  { key: 'timezone', label: 'Timezone', description: 'IANA timezone identifier', type: 'string', group: 'General', defaultValue: GENERAL_DEFAULTS.timezone },
  { key: 'dateFormat', label: 'Date Format', description: 'Date display format string', type: 'string', group: 'General', defaultValue: GENERAL_DEFAULTS.dateFormat },
  { key: 'privacyMode', label: 'Privacy Mode', description: 'Blur financial data when showing the app to others', type: 'boolean', group: 'General', defaultValue: GENERAL_DEFAULTS.privacyMode },
  { key: 'reduceTransparency', label: 'Reduce Transparency', description: 'Use solid backgrounds instead of glass/transparent', type: 'boolean', group: 'General', defaultValue: GENERAL_DEFAULTS.reduceTransparency },
  { key: 'hideAccountSubheadings', label: 'Hide Account Subheadings', description: 'Group accounts by major category only', type: 'boolean', group: 'General', defaultValue: GENERAL_DEFAULTS.hideAccountSubheadings },
  { key: 'hideAccountsSidebarByDefault', label: 'Hide Accounts Sidebar by Default', description: 'Start with the accounts sidebar collapsed on all pages', type: 'boolean', group: 'General', defaultValue: GENERAL_DEFAULTS.hideAccountsSidebarByDefault },
  { key: 'chartSelections', label: 'Chart Selections', description: 'Persisted chart timeframes, types, and filter choices', type: 'json', group: 'General', defaultValue: GENERAL_DEFAULTS.chartSelections },
  { key: 'cardCollapsedStates', label: 'Card Collapsed States', description: 'Persisted collapsed/expanded state of analytics cards (JSON object of card key → boolean)', type: 'json', group: 'General', defaultValue: GENERAL_DEFAULTS.cardCollapsedStates },
  { key: 'compactMode', label: 'Compact Mode', description: 'Compact UI mode with reduced spacing', type: 'boolean', group: 'General', defaultValue: GENERAL_DEFAULTS.compactMode },
  { key: 'hiddenPages', label: 'Hidden Pages', description: 'Pages hidden from navigation sidebar (JSON object of page key → boolean)', type: 'json', group: 'General', defaultValue: GENERAL_DEFAULTS.hiddenPages },
  { key: 'showMathEnabled', label: 'Show Math Explanations', description: 'Display math/logic descriptions on analytics cards', type: 'boolean', group: 'General', defaultValue: GENERAL_DEFAULTS.showMathEnabled },
  { key: 'paystubEnabled', label: 'Paystub Enabled', description: 'Enable paystub parsing and forecasting features', type: 'boolean', group: 'General', defaultValue: GENERAL_DEFAULTS.paystubEnabled },
  { key: 'accountTagVisibility', label: 'Account Tag Visibility', description: 'Control visibility of account tag indicators (JSON object: {sidebar, transactions, legend, budgets, forecast, suggestions})', type: 'json', group: 'General', defaultValue: GENERAL_DEFAULTS.accountTagVisibility },

  // ── Analytics ──
  { key: 'chartColorScheme', label: 'Chart Color Scheme', description: 'Color palette for all charts and graphs', type: 'string', group: 'Analytics', defaultValue: ANALYTICS_DEFAULTS.chartColorScheme },
  { key: 'defaultChartTimeRange', label: 'Default Chart Time Range', description: 'Default time range for charts (1m, 3m, 6m, 1y, 5y, ytd, all)', type: 'string', group: 'Analytics', defaultValue: ANALYTICS_DEFAULTS.defaultChartTimeRange },
  { key: 'defaultChartType', label: 'Default Chart Type', description: 'Default chart type: line or bar', type: 'string', group: 'Analytics', defaultValue: ANALYTICS_DEFAULTS.defaultChartType },
  { key: 'chartVisibility', label: 'Chart Visibility', description: 'Per-chart visibility toggles (JSON object of chartId → boolean)', type: 'json', group: 'Analytics', defaultValue: ANALYTICS_DEFAULTS.chartVisibility },
  { key: 'forecastMode', label: 'Forecast Mode', description: 'Forecast calculation mode: historical, budget, or hybrid', type: 'string', group: 'Analytics', defaultValue: ANALYTICS_DEFAULTS.forecastMode },
  { key: 'forecastLookbackMonths', label: 'Forecast Lookback Months', description: 'Number of months to look back for forecast (1-24)', type: 'number', group: 'Analytics', defaultValue: ANALYTICS_DEFAULTS.forecastLookbackMonths },
  { key: 'showSyntheticData', label: 'Synthetic & Estimated Data', description: 'Toggle synthetic data modules (JSON: {global, netWorth, investments, realEstate, cashFlowProjections})', type: 'json', group: 'Analytics', defaultValue: ANALYTICS_DEFAULTS.showSyntheticData },
  { key: 'showImportedData', label: 'Imported Data', description: 'Toggle imported data visibility (JSON: {global, netWorth, investments, realEstate, cashFlowProjections})', type: 'json', group: 'Analytics', defaultValue: ANALYTICS_DEFAULTS.showImportedData },

  // ── AI ──
  { key: 'aiAutoAnalyze', label: 'Auto-analyze after sync', description: 'Run AI analysis automatically after each SimpleFIN sync', type: 'boolean', group: 'AI', defaultValue: AI_DEFAULTS.aiAutoAnalyze },
  { key: 'aiAutoApprove', label: 'Auto-approve suggestions', description: 'Automatically approve AI suggestions above confidence threshold', type: 'boolean', group: 'AI', defaultValue: AI_DEFAULTS.aiAutoApprove },
  { key: 'aiAutoApproveThreshold', label: 'Auto-approve threshold', description: 'Confidence threshold % for auto-approval (0-100)', type: 'number', group: 'AI', defaultValue: AI_DEFAULTS.aiAutoApproveThreshold },
  { key: 'aiBatchSize', label: 'AI Batch Size', description: 'Number of transactions to analyze per API call (1-200)', type: 'number', group: 'AI', defaultValue: AI_DEFAULTS.aiBatchSize },
  { key: 'aiAnalysisTimeoutSeconds', label: 'AI Analysis Timeout', description: 'Maximum seconds for entire analysis to complete (60-3600)', type: 'number', group: 'AI', defaultValue: AI_DEFAULTS.aiAnalysisTimeoutSeconds },
  { key: 'aiSystemPrompt', label: 'AI System Prompt', description: 'Custom system prompt for the AI model (null = use default)', type: 'string', group: 'AI', defaultValue: AI_DEFAULTS.aiSystemPrompt },
  { key: 'aiActiveProviderId', label: 'Active AI Provider ID', description: 'UUID of the active AI provider', type: 'string', group: 'AI', defaultValue: AI_DEFAULTS.aiActiveProviderId },

  // ── API Keys & Endpoints ──
  { key: 'metalsApiUrl', label: 'Metals API URL', description: 'Endpoint URL for gold/silver spot prices (Yahoo Finance by default)', type: 'string', group: 'API Keys & Endpoints', defaultValue: API_KEY_DEFAULTS.metalsApiUrl },
  { key: 'metalsApiKey', label: 'Metals API Key', description: 'API key for metals price endpoint (not required for Yahoo Finance)', type: 'password', group: 'API Keys & Endpoints', defaultValue: API_KEY_DEFAULTS.metalsApiKey },
  { key: 'redfinApiUrl', label: 'Redfin API URL', description: 'Endpoint URL for real estate property values', type: 'string', group: 'API Keys & Endpoints', defaultValue: API_KEY_DEFAULTS.redfinApiUrl },
  { key: 'redfinApiKey', label: 'Redfin API Key', description: 'API key for Redfin property endpoint', type: 'password', group: 'API Keys & Endpoints', defaultValue: API_KEY_DEFAULTS.redfinApiKey },
  { key: 'fredApiUrl', label: 'FRED API URL', description: 'Endpoint URL for Federal Reserve economic data (Home Price Index)', type: 'string', group: 'API Keys & Endpoints', defaultValue: API_KEY_DEFAULTS.fredApiUrl },
  { key: 'fredApiKey', label: 'FRED API Key', description: 'FRED API key for historical home price estimation', type: 'password', group: 'API Keys & Endpoints', defaultValue: API_KEY_DEFAULTS.fredApiKey },
  { key: 'btcApiUrl', label: 'Bitcoin/Crypto API URL', description: 'Endpoint URL for BTC spot price', type: 'string', group: 'API Keys & Endpoints', defaultValue: API_KEY_DEFAULTS.btcApiUrl },
  { key: 'btcApiKey', label: 'Bitcoin/Crypto API Key', description: 'API key for crypto price endpoint', type: 'password', group: 'API Keys & Endpoints', defaultValue: API_KEY_DEFAULTS.btcApiKey },
  { key: 'btcXpubApiUrl', label: 'BTC Xpub API URL', description: 'Endpoint URL for BTC xpub wallet balance queries', type: 'string', group: 'API Keys & Endpoints', defaultValue: API_KEY_DEFAULTS.btcXpubApiUrl },
  { key: 'plaidClientId', label: 'Plaid Client ID', description: 'Your Plaid API Client ID', type: 'string', group: 'API Keys & Endpoints', defaultValue: API_KEY_DEFAULTS.plaidClientId },
  { key: 'plaidSecret', label: 'Plaid Secret', description: 'Your Plaid API Secret', type: 'password', group: 'API Keys & Endpoints', defaultValue: API_KEY_DEFAULTS.plaidSecret },
  { key: 'plaidEnvironment', label: 'Plaid Environment', description: 'Plaid API environment: sandbox, development, or production', type: 'string', group: 'API Keys & Endpoints', defaultValue: API_KEY_DEFAULTS.plaidEnvironment },
];

export type UserSettings = typeof DEFAULTS;
