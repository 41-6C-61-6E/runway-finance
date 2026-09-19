export type AnalysisSession = {
  abortController: AbortController;
  timeoutId: NodeJS.Timeout | null;
  processedCount: number;
  totalCount: number | null;
  status: 'running' | 'completed' | 'error';
  error?: string;
  log: string[];
  startedAt?: number;
  proposalsCreated?: number;
  autoApproved?: number;
  errors?: string[];
};

/**
 * In-memory analysis sessions, keyed by user id. Canonical store —
 * `app/api/ai/state.ts` re-exports these so existing route imports keep
 * working. Lost on process restart (status falls back to `idle`).
 */
export const activeAnalysisSessions = new Map<string, AnalysisSession>();
