/**
 * Shared state for active AI analysis sessions.
 * Using a Map to track abort controllers and timeouts for each user.
 */
export const activeAnalysisSessions = new Map<string, { 
  abortController: AbortController; 
  timeoutId: NodeJS.Timeout | null 
}>();