/**
 * Configuration, limits, and budgets for Ask.
 */

export const ASK_CONFIG = {
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
  ] as const,
};

export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}
