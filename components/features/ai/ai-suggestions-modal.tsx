'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { useUserSettings } from '@/components/user-settings-provider';
import { Skeleton } from '@/components/ui/skeleton';
import { Sparkles, Check, X, Brain, Tag, FolderPlus, ArrowRight, Clock, BarChart3, Layers, AlertTriangle, RefreshCw, ChevronDown, Search } from 'lucide-react';
import { Spinner } from '@/components/ui/loading-spinner';
import { Select } from '@/components/ui/select';

import type { AiProposal, Category } from './suggestions/types';
import { ProposalCard } from './suggestions/proposal-card';

const STATUS_KEY = 'ai_analysis_status';
const ANALYSIS_TIMEOUT_MS = 70 * 60 * 1000;

type AnalysisStatus = { status: 'running' | 'completed' | 'error'; message: string; startedAt?: number; totalToAnalyze?: number | null } | null;

export interface AiSuggestionsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onProposalsUpdated?: () => void;
}

export default function AiSuggestionsModal({ open, onOpenChange, onProposalsUpdated }: AiSuggestionsModalProps) {
  const [proposals, setProposals] = useState<AiProposal[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [processing, setProcessing] = useState<string | null>(null);
  const [filterType, setFilterType] = useState<string>('all');
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [startTime, setStartTime] = useState<number | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [processedCount, setProcessedCount] = useState(0);
  const [totalToAnalyze, setTotalToAnalyze] = useState<number | null>(null);
  const [newProposalsCount, setNewProposalsCount] = useState(0);
  const [newTxnsCount, setNewTxnsCount] = useState(0);
  const [newCategoriesCount, setNewCategoriesCount] = useState(0);
  const [newRulesCount, setNewRulesCount] = useState(0);
  const [lastBatchAt, setLastBatchAt] = useState<number | null>(null);
  const [lastBatchDuration, setLastBatchDuration] = useState<number | null>(null);
  const [batchSize, setBatchSize] = useState(25);
  const [confirmModalConfig, setConfirmModalConfig] = useState<{ title: string; description: string; actionLabel: string; onConfirm: () => void; isDestructive?: boolean } | null>(null);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [categories, setCategories] = useState<Category[]>([]);
  const analyzingRef = useRef(false);
  const logsContainerRef = useRef<HTMLDivElement>(null);

  const [savedStatus, setSavedStatus] = useState<AnalysisStatus>(null);
  const [analysisLogs, setAnalysisLogs] = useState<string[]>([]);
  const [showLogs, setShowLogs] = useState(false);
  const [currentStep, setCurrentStep] = useState<string>('Initializing...');

  useEffect(() => {
    if (showLogs && logsContainerRef.current) {
      logsContainerRef.current.scrollTop = logsContainerRef.current.scrollHeight;
    }
  }, [analysisLogs, showLogs]);

  const showFeedback = (type: 'success' | 'error', message: string) => {
    setFeedback({ type, message });
    setTimeout(() => setFeedback(null), 4000);
  };

  useEffect(() => {
    fetch('/api/user-settings', { credentials: 'include' })
      .then((r) => r.json())
      .then((data) => setBatchSize(data.aiBatchSize ?? 25))
      .catch(() => setBatchSize(25));
  }, []);

  const fetchProposals = useCallback(async () => {
    setLoadError(null);
    try {
      const params = new URLSearchParams();
      params.set('status', 'pending');
      params.set('_t', Date.now().toString());
      const res = await fetch(`/api/ai/proposals?${params.toString()}`, { credentials: 'include', cache: 'no-store' });
      if (!res.ok) {
        setLoadError(`HTTP ${res.status}`);
        setProposals([]);
        return;
      }
      const data = await res.json();
      setProposals(Array.isArray(data) ? data : []);
    } catch {
      setProposals([]);
      setLoadError('network error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return undefined;
    fetchProposals();
    fetch('/api/categories', { credentials: 'include' })
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) setCategories(data);
      })
      .catch(() => {});

    try {
      const raw = localStorage.getItem(STATUS_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as NonNullable<AnalysisStatus>;
        if (parsed.status === 'running' && parsed.startedAt) {
          const elapsed = Date.now() - parsed.startedAt;
          if (elapsed > ANALYSIS_TIMEOUT_MS) {
            const timeoutMsg = `Analysis timed out after 10 minutes. Please try running the analysis again.`;
            setSavedStatus({ status: 'error', message: timeoutMsg, startedAt: parsed.startedAt });
            localStorage.setItem(STATUS_KEY, JSON.stringify({ status: 'error', message: timeoutMsg, startedAt: parsed.startedAt }));
            return undefined;
          }
        }

        setSavedStatus(parsed);
        if (parsed.status === 'running') {
          setStartTime(parsed.startedAt || null);
          setTotalToAnalyze(parsed.totalToAnalyze ?? null);
          setAnalyzing(true);
        }
      }
    } catch { /* ignore */ }

    fetch('/api/ai/status', { credentials: 'include' })
      .then(async (res) => {
        if (res.ok) {
          const data = await res.json();
          if (data.status === 'running') {
            const startedAt = data.startedAt || Date.now() - (data.elapsedSeconds || 0) * 1000;
            setStartTime(startedAt);
            setTotalToAnalyze(data.totalCount || null);
            setProcessedCount(data.processedCount ?? 0);
            if (data.log) setAnalysisLogs(data.log);
            setAnalyzing(true);
            analyzingRef.current = true;

            const statusWithTimestamp = {
              status: 'running' as const,
              message: 'Analysis running...',
              startedAt,
              totalToAnalyze: data.totalCount,
            };
            setSavedStatus(statusWithTimestamp);
            localStorage.setItem(STATUS_KEY, JSON.stringify(statusWithTimestamp));
          } else if (data.status === 'completed' || data.status === 'error') {
            const msg = data.status === 'completed'
              ? `Analysis complete: ${data.proposalsCreated} proposals created.`
              : (data.error || 'Failed to run analysis.');
            const finalStatus: AnalysisStatus = { status: data.status, message: msg };

            setSavedStatus(finalStatus);
            localStorage.setItem(STATUS_KEY, JSON.stringify(finalStatus));

            setAnalyzing(false);
            analyzingRef.current = false;
            fetchProposals();
          } else if (data.status === 'idle') {
            const raw = localStorage.getItem(STATUS_KEY);
            if (raw) {
              const parsed = JSON.parse(raw);
              if (parsed?.status === 'running') {
                setSavedStatus(null);
                localStorage.removeItem(STATUS_KEY);
                setAnalyzing(false);
                analyzingRef.current = false;
              }
            }
          }
        }
      })
      .catch(() => {});

    return () => {
      analyzingRef.current = false;
    };
  }, [open, fetchProposals]);

  useEffect(() => {
    if (!analyzing || !savedStatus?.startedAt) return undefined;
    const checkTimeout = setInterval(() => {
      const elapsed = Date.now() - (savedStatus.startedAt || 0);
      if (elapsed > ANALYSIS_TIMEOUT_MS) {
        const timeoutMsg = `Analysis timed out after 10 minutes. Please try running the analysis again.`;
        persistStatus({ status: 'error', message: timeoutMsg, startedAt: savedStatus.startedAt });
        setAnalyzing(false);
        showFeedback('error', timeoutMsg);
        clearInterval(checkTimeout);
      }
    }, 30000);
    return () => clearInterval(checkTimeout);
  }, [analyzing, savedStatus?.startedAt]);

  useEffect(() => {
    if (!analyzing || !startTime) {
      setElapsedSeconds(0);
      return undefined;
    }
    const timer = setInterval(() => {
      setElapsedSeconds(Math.floor((Date.now() - startTime) / 1000));
    }, 1000);
    return () => clearInterval(timer);
  }, [analyzing, startTime]);

  useEffect(() => {
    if (!analyzing || !open) return undefined;
    const interval = setInterval(() => {
      fetch(`/api/ai/proposals?status=pending&_t=${Date.now()}`, { credentials: 'include', cache: 'no-store' })
        .then((r) => r.json())
        .then((data) => {
          if (Array.isArray(data)) {
            if (startTime) {
              const sessionProposals = data.filter((p: AiProposal) =>
                new Date(p.createdAt).getTime() >= startTime
              );

              if (sessionProposals.length > newProposalsCount) {
                const now = Date.now();
                const reference = lastBatchAt || startTime;
                setLastBatchDuration(Math.floor((now - reference) / 1000));
                setLastBatchAt(now);
              }
              setNewProposalsCount(sessionProposals.length);
              setNewTxnsCount(sessionProposals.filter((p: AiProposal) => p.type === 'categorize').length);
              setNewCategoriesCount(sessionProposals.filter((p: AiProposal) => p.type === 'create_category').length);
              setNewRulesCount(sessionProposals.filter((p: AiProposal) => p.type === 'create_rule').length);
            }

            setProposals((prev) => {
              const prevIds = new Set(prev.map((p) => p.id));
              const currentIds = new Set(data.map((p: any) => p.id));
              const hasChanges = data.length !== prev.length ||
                                data.some((p: any) => !prevIds.has(p.id)) ||
                                prev.some((p) => !currentIds.has(p.id));
              if (hasChanges) {
                return [...data].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
              }
              return prev;
            });
          }
        })
        .catch(() => {});
    }, 3000);
    return () => clearInterval(interval);
  }, [analyzing, startTime, open, newProposalsCount, lastBatchAt]);

  useEffect(() => {
    if (!analyzing || !open) {
      if (!analyzing) {
        setProcessedCount(0);
        setAnalysisLogs([]);
        setCurrentStep('Initializing...');
      }
      return undefined;
    }
    const interval = setInterval(async () => {
      try {
        const res = await fetch('/api/ai/status', { credentials: 'include' });
        if (res.ok) {
          const data = await res.json();
          if (data.status === 'running') {
            setProcessedCount(data.processedCount ?? 0);
            if (data.totalCount) setTotalToAnalyze(data.totalCount);
            if (data.log) {
              setAnalysisLogs(data.log);
              if (data.log.length > 0) {
                const rawLastLog = data.log[data.log.length - 1];
                setCurrentStep(rawLastLog);
              }
            }
          } else if (data.status === 'completed') {
            setProcessedCount(data.processedCount ?? 0);
            if (data.log) setAnalysisLogs(data.log);
            setCurrentStep('Analysis complete.');

            const msg = `Analysis complete: ${data.proposalsCreated} proposals created.`;
            const finalStatus: AnalysisStatus = { status: 'completed', message: msg };
            persistStatus(finalStatus);

            setAnalyzing(false);
            analyzingRef.current = false;
            showFeedback('success', msg);
            await fetchProposals();
            onProposalsUpdated?.();
          } else if (data.status === 'error') {
            setProcessedCount(data.processedCount ?? 0);
            if (data.log) setAnalysisLogs(data.log);
            setCurrentStep(`Error: ${data.error}`);

            const msg = data.error || 'Failed to run analysis.';
            const finalStatus: AnalysisStatus = { status: 'error', message: msg };
            persistStatus(finalStatus);

            setAnalyzing(false);
            analyzingRef.current = false;
            showFeedback('error', msg);
            await fetchProposals();
            onProposalsUpdated?.();
          } else if (data.status === 'idle') {
            setAnalyzing(false);
            analyzingRef.current = false;
            persistStatus(null);
            await fetchProposals();
            onProposalsUpdated?.();
          }
        }
      } catch { /* ignore */ }
    }, 1500);
    return () => clearInterval(interval);
  }, [analyzing, fetchProposals, open, onProposalsUpdated]);

  const persistStatus = (status: AnalysisStatus) => {
    setSavedStatus(status);
    if (status) {
      const statusWithTimestamp = status.status === 'running' && !status.startedAt
        ? { ...status, startedAt: Date.now() }
        : status;
      localStorage.setItem(STATUS_KEY, JSON.stringify(statusWithTimestamp));
    } else {
      localStorage.removeItem(STATUS_KEY);
    }
  };

  const handleAnalyze = async () => {
    setAnalyzing(true);
    analyzingRef.current = true;
    const startedAt = Date.now();
    setAnalysisLogs([]);
    setCurrentStep('Initializing...');

    const txnRes = await fetch('/api/transactions?countOnly=true&uncategorized=true', { credentials: 'include' }).catch(() => null);
    const txnCount = txnRes?.ok ? (await txnRes.json()).count : null;

    setTotalToAnalyze(txnCount);
    setStartTime(startedAt);
    setLastBatchAt(null);
    setLastBatchDuration(null);
    setNewProposalsCount(0);
    setNewTxnsCount(0);
    setNewCategoriesCount(0);
    setNewRulesCount(0);
    setElapsedSeconds(0);
    persistStatus({
      status: 'running',
      message: 'Analysis started — running in the background.',
      startedAt,
      totalToAnalyze: txnCount,
    });
    setFeedback(null);

    try {
      const res = await fetch('/api/ai/analyze', {
        method: 'POST',
        credentials: 'include',
        keepalive: true,
      });

      const data = await res.json().catch(() => ({ error: 'Invalid response from server' }));

      if (!res.ok) {
        const finalStatus: AnalysisStatus = {
          status: 'error',
          message: data.error || 'Failed to run analysis.',
        };
        persistStatus(finalStatus);
        if (analyzingRef.current) {
          showFeedback('error', finalStatus.message);
          setAnalyzing(false);
          analyzingRef.current = false;
        }
      }
    } catch {
      const errorStatus: AnalysisStatus = { status: 'error', message: 'Failed to run analysis. Please try again.' };
      persistStatus(errorStatus);
      if (analyzingRef.current) {
        showFeedback('error', errorStatus.message);
        setAnalyzing(false);
        analyzingRef.current = false;
      }
    }
  };

  const dismissStatus = () => {
    persistStatus(null);
    setAnalyzing(false);
    setStartTime(null);
    setNewProposalsCount(0);
    setNewTxnsCount(0);
    setNewCategoriesCount(0);
    setNewRulesCount(0);
    setTotalToAnalyze(null);
    setLastBatchAt(null);
    setLastBatchDuration(null);
    setAnalysisLogs([]);
    setCurrentStep('Initializing...');
  };

  const confirmAction = (config: { title: string; description: string; actionLabel: string; onConfirm: () => void; isDestructive?: boolean }) => {
    setConfirmModalConfig(config);
    setShowConfirmModal(true);
  };

  const handleCancel = async () => {
    confirmAction({
      title: 'Stop Analysis',
      description: 'Are you sure you want to stop the current analysis? Suggestions created so far will remain.',
      actionLabel: 'Stop Analysis',
      isDestructive: true,
      onConfirm: async () => {
        analyzingRef.current = false;
        try {
          await fetch('/api/ai/cancel', { method: 'POST', credentials: 'include' });
        } catch { /* fallback */ }
        finally {
          dismissStatus();
          showFeedback('success', 'Analysis stopped.');
        }
      },
    });
  };

  const handleCategoryChange = (proposalId: string, categoryId: string, categoryName: string) => {
    setProposals((prev) =>
      prev.map((p) => {
        if (p.id !== proposalId) return p;
        if (p.type === 'categorize') {
          return {
            ...p,
            payload: {
              ...p.payload,
              proposedCategoryId: categoryId,
              proposedCategoryName: categoryName,
            },
          };
        } else if (p.type === 'create_rule') {
          return {
            ...p,
            payload: {
              ...p.payload,
              setCategoryId: categoryId,
              setCategoryName: categoryName,
            },
          };
        }
        return p;
      })
    );
  };

  const handleCategoryCreated = (newCategory: Category) => {
    setCategories((prev) => {
      if (prev.some((c) => c.id === newCategory.id)) return prev;
      return [...prev, newCategory];
    });
  };

  const handleApprove = async (id: string) => {
    const proposal = proposals.find((p) => p.id === id);
    setProcessing(id);
    setProposals((prev) => prev.filter((p) => p.id !== id));

    try {
      const body = proposal ? { payload: proposal.payload } : {};
      const res = await fetch(`/api/ai/proposals/${id}/approve`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = await res.json();
        showFeedback('error', data.error || 'Failed to approve suggestion');
        await fetchProposals();
      } else {
        showFeedback('success', 'Approved.');
        onProposalsUpdated?.();
      }
    } catch {
      showFeedback('error', 'Failed to approve.');
      await fetchProposals();
    } finally {
      setProcessing(null);
    }
  };

  const handleReject = async (id: string) => {
    setProcessing(id);
    setProposals((prev) => prev.filter((p) => p.id !== id));

    try {
      const res = await fetch(`/api/ai/proposals/${id}/reject`, { method: 'POST', credentials: 'include' });
      if (!res.ok) {
        const data = await res.json();
        showFeedback('error', data.error || 'Failed to dismiss suggestion');
        await fetchProposals();
      } else {
        showFeedback('success', 'Dismissed.');
        onProposalsUpdated?.();
      }
    } catch {
      showFeedback('error', 'Failed to dismiss suggestion.');
      await fetchProposals();
    } finally {
      setProcessing(null);
    }
  };

  const countCategorize = proposals.filter((p) => p.type === 'categorize').length;
  const countRules = proposals.filter((p) => p.type === 'create_rule').length;
  const countCategories = proposals.filter((p) => p.type === 'create_category').length;

  const filteredProposals = proposals.filter((p) => {
    if (filterType === 'all') return true;
    return p.type === filterType;
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl w-full max-h-[85vh] p-4 sm:p-6 font-sans flex flex-col">
        <DialogHeader className="border-b border-border pb-3 mb-2 shrink-0">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 pr-8 sm:pr-0">
              <div className="p-2 rounded-xl bg-primary/10 text-primary">
                <Sparkles className="h-5 w-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <DialogTitle className="text-lg font-bold">AI Suggestions</DialogTitle>
                  {proposals.length > 0 && (
                    <span className="px-2 py-0.5 text-xs font-semibold bg-primary/15 text-primary rounded-full">
                      {proposals.length} pending
                    </span>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  Review and approve categorization and rule suggestions.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 flex-wrap sm:justify-end sm:mr-8 mr-8">
              {feedback && (
                <span className={`text-xs px-2.5 py-1 rounded-lg font-medium ${feedback.type === 'success' ? 'bg-status-positive/20 text-status-positive' : 'bg-destructive/20 text-destructive'}`}>
                  {feedback.message}
                </span>
              )}
              {analyzing && (
                <span className="text-xs px-2.5 py-1 rounded-lg bg-primary/10 text-primary animate-pulse whitespace-nowrap font-medium flex items-center gap-1.5">
                  <Spinner size="xs" />
                  Analyzing...
                </span>
              )}
              <button
                type="button"
                onClick={handleAnalyze}
                disabled={analyzing}
                className="flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-primary-foreground bg-primary hover:opacity-90 rounded-lg transition-all disabled:opacity-50 shadow-xs cursor-pointer"
              >
                {analyzing ? (
                  <Spinner size="sm" />
                ) : (
                  <Sparkles className="h-3.5 w-3.5" />
                )}
                {analyzing ? 'Analyzing...' : 'Run'}
              </button>
            </div>
          </div>
          <DialogDescription className="sr-only">
            Review and approve AI categorization suggestions and rules.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-4 pr-1">
          {/* Persistent analysis status banner */}
          {(analyzing || savedStatus) && (
            <div className={`p-4 rounded-xl border flex flex-col gap-3 ${
              savedStatus?.status === 'completed' ? 'bg-chart-2/10 border-chart-2/30' :
              savedStatus?.status === 'error' ? 'bg-destructive/10 border-destructive/30' :
              'bg-primary/5 border-primary/20'
            }`}>
              <div className="flex items-start gap-3">
                {(analyzing || savedStatus?.status === 'running') ? (
                  <Spinner size="sm" className="text-primary shrink-0 mt-0.5" />
                ) : (
                  <div className="h-4 w-4 shrink-0" />
                )}
                <div className="flex-1 text-sm text-foreground space-y-2">
                  {(analyzing || savedStatus?.status === 'running') ? (
                    <div className="space-y-2.5">
                      <p className="font-semibold text-sm">AI analysis in progress</p>
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <BarChart3 className="h-3.5 w-3.5" />
                          Prompted: {processedCount}{totalToAnalyze !== null ? ` / ${totalToAnalyze}` : ''}
                        </span>
                        <span className="flex items-center gap-1">
                          <Tag className="h-3.5 w-3.5" />
                          Categorized: {newTxnsCount}
                        </span>
                        <span className="flex items-center gap-1">
                          <Brain className="h-3.5 w-3.5" />
                          Rules: {newRulesCount}
                        </span>
                        <span className="flex items-center gap-1">
                          <Layers className="h-3.5 w-3.5" />
                          Batch: {batchSize || 25}
                        </span>
                        {lastBatchDuration !== null && (
                          <span className="flex items-center gap-1">
                            <Clock className="h-3.5 w-3.5" />
                            Last batch: {lastBatchDuration}s
                          </span>
                        )}
                        <span className="flex items-center gap-1 font-mono">
                          Elapsed: {Math.floor(elapsedSeconds / 60)}:{(elapsedSeconds % 60).toString().padStart(2, '0')}
                        </span>
                      </div>
                      {currentStep && (
                        <p className="text-[11px] font-mono text-primary bg-primary/10 px-2.5 py-1.5 rounded-lg border border-primary/20 select-none animate-pulse flex items-center gap-1.5">
                          <span className="relative flex h-2 w-2">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
                            <span className="relative inline-flex rounded-full h-2 w-2 bg-primary"></span>
                          </span>
                          Status: {currentStep}
                        </p>
                      )}
                      <div className="pt-1">
                        <button
                          type="button"
                          onClick={() => setShowLogs(!showLogs)}
                          className="inline-flex items-center gap-1 text-[11px] font-semibold text-primary hover:text-primary/80 transition-colors bg-primary/10 px-2 py-1 rounded-md cursor-pointer"
                        >
                          {showLogs ? 'Hide live progress log' : 'Show live progress log'}
                          <span className="text-[10px] opacity-60">({analysisLogs.length} entries)</span>
                        </button>
                      </div>
                    </div>
                  ) : savedStatus?.status === 'error' ? (
                    <>
                      <p className="font-semibold text-destructive">{savedStatus.message}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Check your AI provider settings in Settings &gt; AI and try again.
                      </p>
                    </>
                  ) : (
                    <p className="text-sm font-medium">{savedStatus?.message}</p>
                  )}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {(analyzing || savedStatus?.status === 'running') && (
                    <button
                      type="button"
                      onClick={handleCancel}
                      className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-destructive hover:bg-destructive/10 border border-destructive/20 rounded-lg transition-all shrink-0 cursor-pointer"
                    >
                      <X className="h-3 w-3" />
                      Cancel
                    </button>
                  )}
                  {savedStatus?.status === 'error' && (
                    <button
                      type="button"
                      onClick={handleAnalyze}
                      disabled={analyzing}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-primary-foreground bg-primary hover:opacity-90 rounded-lg transition-all disabled:opacity-50 cursor-pointer"
                    >
                      <Sparkles className="h-3 w-3" />
                      Retry
                    </button>
                  )}
                  {!(analyzing || savedStatus?.status === 'running') && (
                    <button
                      type="button"
                      onClick={dismissStatus}
                      className="text-muted-foreground hover:text-foreground cursor-pointer"
                      title="Dismiss"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  )}
                </div>
              </div>

              {showLogs && (analyzing || savedStatus?.status === 'running') && (
                <div 
                  ref={logsContainerRef}
                  className="border border-border/50 rounded-lg bg-zinc-950/80 p-3 font-mono text-[11px] text-zinc-300 overflow-y-auto max-h-48 space-y-1 shadow-inner select-text"
                >
                  {analysisLogs.length === 0 ? (
                    <p className="italic text-zinc-500 animate-pulse">Initializing log stream...</p>
                  ) : (
                    analysisLogs.map((log, idx) => (
                      <div key={idx} className="flex gap-2 py-0.5 px-1 hover:bg-white/5 rounded">
                        <span className="text-zinc-600 select-none">[{idx + 1}]</span>
                        <span className="whitespace-pre-wrap">{log}</span>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          )}

          {/* Type Filter Pills */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs">
            {[
              { value: 'all', label: `All (${proposals.length})` },
              { value: 'categorize', label: `Categorize (${countCategorize})` },
              { value: 'create_rule', label: `New Rules (${countRules})` },
              { value: 'create_category', label: `New Categories (${countCategories})` },
            ].map((t) => (
              <button
                key={t.value}
                type="button"
                onClick={() => setFilterType(t.value)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all whitespace-nowrap cursor-pointer ${
                  filterType === t.value
                    ? 'bg-primary/15 text-primary border border-primary/25 shadow-xs'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted/60 border border-transparent'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          {/* Proposal Cards List */}
          {loading ? (
            <div className="space-y-3" role="status" aria-live="polite">
              {[0, 1, 2].map((i) => (
                <div key={i} className="flex items-start gap-3 border border-border/60 rounded-xl p-4 bg-card/40">
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-3.5 w-1/3" />
                    <Skeleton className="h-3 w-1/2" />
                    <Skeleton className="h-8 w-full" />
                  </div>
                  <Skeleton className="h-8 w-20" />
                </div>
              ))}
              <span className="sr-only">Loading AI suggestions…</span>
            </div>
          ) : loadError ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <AlertTriangle className="h-8 w-8 text-destructive mb-3" />
              <p className="text-muted-foreground text-sm mb-4">
                Couldn't load AI suggestions ({loadError}).
              </p>
              <button
                type="button"
                onClick={fetchProposals}
                className="flex items-center gap-1.5 px-4 py-2 text-sm font-semibold text-primary-foreground bg-primary hover:opacity-90 rounded-lg transition-all cursor-pointer"
              >
                <RefreshCw className="h-4 w-4" />
                Retry
              </button>
            </div>
          ) : filteredProposals.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Sparkles className="h-8 w-8 text-muted-foreground/60 mb-3" />
              <p className="text-muted-foreground text-sm mb-4">
                {proposals.length === 0
                  ? 'No pending AI suggestions.'
                  : 'No suggestions match this type filter.'}
              </p>
              {proposals.length === 0 && (
                <button
                  type="button"
                  onClick={handleAnalyze}
                  disabled={analyzing}
                  className="flex items-center gap-1.5 px-4 py-2 text-sm font-semibold text-primary-foreground bg-primary hover:opacity-90 rounded-lg transition-all disabled:opacity-50 shadow-xs cursor-pointer"
                >
                  <Sparkles className="h-4 w-4" />
                  Run Analysis Now
                </button>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              {filteredProposals.map((proposal) => (
                <ProposalCard
                  key={proposal.id}
                  proposal={proposal}
                  categories={categories}
                  onApprove={handleApprove}
                  onReject={handleReject}
                  onCategoryChange={handleCategoryChange}
                  onCategoryCreated={handleCategoryCreated}
                  processing={processing}
                />
              ))}
            </div>
          )}

          {/* Confirmation Modal (e.g. Stop Analysis) */}
          <Dialog open={showConfirmModal} onOpenChange={(o) => { if (!o) setShowConfirmModal(false); }}>
            <DialogContent className="max-w-sm p-6">
              <DialogHeader>
                <DialogTitle className="text-base">{confirmModalConfig?.title}</DialogTitle>
                <DialogDescription className="text-sm">{confirmModalConfig?.description}</DialogDescription>
              </DialogHeader>
              <DialogFooter className="flex-row gap-3 sm:justify-end">
                <button
                  type="button"
                  onClick={() => setShowConfirmModal(false)}
                  className="flex-1 px-3 py-2 text-sm font-medium text-foreground bg-muted hover:bg-accent border border-border rounded-lg transition-all cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowConfirmModal(false);
                    confirmModalConfig?.onConfirm();
                  }}
                  className={`flex-1 px-3 py-2 text-sm font-medium text-white rounded-lg transition-all cursor-pointer ${
                    confirmModalConfig?.isDestructive ? 'bg-destructive hover:opacity-90' : 'bg-primary hover:opacity-90'
                  }`}
                >
                  {confirmModalConfig?.actionLabel}
                </button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </DialogContent>
    </Dialog>
  );
}
