/**
 * Configuration, limits, and budgets for Advice.
 */

export const ADVICE_CONFIG = {
  // Input token budget
  INPUT_TOKEN_BUDGET: 8000,
  SYSTEM_PROMPT_BUDGET: 900,
  SNAPSHOT_BUDGET: 1500,
  PACKS_BUDGET: 3500,
  HISTORY_BUDGET: 2000,
  QUESTION_BUDGET: 1000,

  // Output token budget
  OUTPUT_MAX_TOKENS: 1200,
  DEFAULT_TEMPERATURE: 0.3,

  // App rate limits
  RATE_LIMIT_SHORT_MAX: 15,
  RATE_LIMIT_SHORT_WINDOW_MS: 10 * 60 * 1000, // 10 minutes
  RATE_LIMIT_DAY_MAX: 100,
  RATE_LIMIT_DAY_WINDOW_MS: 24 * 60 * 60 * 1000, // 24 hours

  // Snapshot cache TTL (5 minutes)
  SNAPSHOT_CACHE_TTL_MS: 5 * 60 * 1000,

  // Allowlisted in-app paths for markdown links and context routing
  ALLOWLISTED_PATHS: [
    '/',
    '/spending',
    '/budgets',
    '/goals',
    '/investments',
    '/plans',
    '/flows',
    '/transactions',
    '/settings',
    '/recurring',
    '/accounts',
    '/reports',
    '/tax',
    '/rules',
    '/sharing',
    '/sync',
  ] as const,
};

export const ASK_CONFIG = ADVICE_CONFIG;

export type TokenBudgetProfile = 'local' | 'modest' | 'balanced' | 'frontier';

export interface TokenBudgets {
  packsBudget: number;
  historyBudget: number;
  inputTokenBudget: number;
  outputMaxTokens: number;
}

export const TOKEN_BUDGET_PROFILES: Record<TokenBudgetProfile, TokenBudgets> = {
  local: {
    packsBudget: 1800,
    historyBudget: 1000,
    inputTokenBudget: 4000,
    outputMaxTokens: 800,
  },
  modest: {
    packsBudget: 3500,
    historyBudget: 2000,
    inputTokenBudget: 8000,
    outputMaxTokens: 1500,
  },
  balanced: {
    packsBudget: 3500,
    historyBudget: 2000,
    inputTokenBudget: 8000,
    outputMaxTokens: 1500,
  },
  frontier: {
    packsBudget: 7000,
    historyBudget: 4000,
    inputTokenBudget: 16000,
    outputMaxTokens: 3000,
  },
};

export function getTokenBudgets(profile?: string | null): TokenBudgets {
  if (profile === 'local') return TOKEN_BUDGET_PROFILES.local;
  if (profile === 'frontier') return TOKEN_BUDGET_PROFILES.frontier;
  return TOKEN_BUDGET_PROFILES.balanced;
}

export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}
