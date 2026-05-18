export type AnalysisSession = {
  abortController: AbortController;
  timeoutId: NodeJS.Timeout | null;
  processedCount: number;
  totalCount: number | null;
  status: 'running' | 'completed' | 'error';
  error?: string;
};

export const activeAnalysisSessions = new Map<string, AnalysisSession>();
