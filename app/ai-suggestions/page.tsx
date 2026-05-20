'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import ContentWrapper from '@/components/content-wrapper';
import AiTestProgress from '@/components/features/ai/AiTestProgress';
import { CategoryCombobox } from '@/components/budgets/category-combobox';
import { DEFAULT_TEST_PROMPT, TEST_PROMPT_STORAGE_KEY } from '@/lib/ai/prompts';
import { Sparkles, Check, X, Loader2, Brain, Tag, FileText, FlaskConical, Trash2, Clock, BarChart3, Layers, Pencil } from 'lucide-react';

type AiProposal = {
  id: string;
  type: 'categorize' | 'create_category' | 'create_rule';
  status: 'pending' | 'approved' | 'rejected';
  confidence: string | null;
  payload: any;
  explanation: string | null;
  createdAt: string;
};

function confidenceColor(confidence: number): string {
  if (confidence >= 80) return 'bg-status-positive/20 text-status-positive';
  if (confidence >= 50) return 'bg-yellow-500/20 text-yellow-500';
  return 'bg-destructive/20 text-destructive';
}

function ProposalIcon({ type }: { type: string }) {
  switch (type) {
    case 'categorize':
      return <Tag className="h-4 w-4" />;
    case 'create_category':
      return <FileText className="h-4 w-4" />;
    case 'create_rule':
      return <Brain className="h-4 w-4" />;
    default:
      return <Sparkles className="h-4 w-4" />;
  }
}

function ProposalCard({
  proposal,
  onApprove,
  onReject,
  processing,
  editingId,
  editPayload,
  onEdit,
  onCancelEdit,
  onEditField,
  categories,
}: {
  proposal: AiProposal;
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
  processing: string | null;
  editingId: string | null;
  editPayload: any;
  onEdit: (id: string) => void;
  onCancelEdit: () => void;
  onEditField: (field: string, value: any) => void;
  categories: { id: string; name: string; isIncome: boolean; parentId: string | null; color: string }[];
}) {
  const confidence = parseInt(proposal.confidence ?? '0');
  const payload = proposal.payload;
  const isEditing = editingId === proposal.id;

  if (isEditing) {
    const renderField = (label: string, field: string, type: 'text' | 'select' | 'checkbox', options?: string[]) => (
      <div key={field} className="flex items-center gap-2 text-sm">
        <span className="text-muted-foreground shrink-0">{label}:</span>
        {type === 'text' ? (
          <input
            value={editPayload[field] ?? ''}
            onChange={(e) => onEditField(field, e.target.value)}
            className="flex-1 px-2 py-1 bg-background border border-input rounded text-xs font-mono focus:outline-none focus:ring-1 focus:ring-ring"
          />
        ) : type === 'checkbox' ? (
          <input
            type="checkbox"
            checked={!!editPayload[field]}
            onChange={(e) => onEditField(field, e.target.checked)}
            className="accent-primary"
          />
        ) : (
          <select
            value={editPayload[field] ?? ''}
            onChange={(e) => onEditField(field, e.target.value)}
            className="flex-1 px-2 py-1 bg-background border border-input rounded text-xs font-mono focus:outline-none focus:ring-1 focus:ring-ring"
          >
            {options?.map((o) => <option key={o} value={o}>{o}</option>)}
          </select>
        )}
      </div>
    );

    const categoryComboboxField = (label: string, nameField: string) => {
      const catId = categories.find((c) => c.name === editPayload[nameField])?.id ?? '';
      return (
        <div key={nameField} className="flex items-center gap-2 text-sm">
          <span className="text-muted-foreground shrink-0">{label}:</span>
          <div className="flex-1">
            <CategoryCombobox
              categories={categories}
              value={catId}
              onSelect={(id) => {
                const cat = categories.find((c) => c.id === id);
                onEditField(nameField, cat?.name ?? '');
              }}
            />
          </div>
        </div>
      );
    };

    let fields: { label: string; field: string; type: 'text' | 'select' | 'checkbox'; options?: string[] }[] = [];
    switch (proposal.type) {
      case 'categorize':
        return (
          <div className="p-4 bg-card border border-primary/40 rounded-lg">
            <div className="flex items-center justify-between gap-3 mb-3">
              <div className="flex items-center gap-2">
                <div className="p-1.5 rounded-lg bg-muted text-muted-foreground">
                  <ProposalIcon type={proposal.type} />
                </div>
                <span className="text-xs font-medium text-muted-foreground uppercase">Categorize</span>
                <span className="text-[10px] font-medium text-amber-500 bg-amber-500/20 px-1.5 py-0.5 rounded-full">Editing</span>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <button onClick={() => onApprove(proposal.id)} disabled={processing === proposal.id}
                  className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-chart-2 bg-chart-2/10 hover:bg-chart-2/20 rounded-lg transition-all disabled:opacity-50"
                  title="Approve with edits">
                  {processing === proposal.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                  Save & Approve
                </button>
                <button onClick={onCancelEdit} disabled={processing === proposal.id}
                  className="p-1.5 text-muted-foreground hover:text-foreground rounded-lg transition-colors" title="Cancel editing">
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>
            {categoryComboboxField('Category', 'proposedCategoryName')}
            {proposal.explanation && <p className="text-xs text-muted-foreground italic mt-2">{proposal.explanation}</p>}
          </div>
        );
      case 'create_category':
        fields = [
          { label: 'Name', field: 'name', type: 'text' },
          { label: 'Parent', field: 'parentName', type: 'text' },
          { label: 'Color', field: 'color', type: 'text' },
          { label: 'Income', field: 'isIncome', type: 'checkbox' },
        ];
        break;
      case 'create_rule':
        return (
          <div className="p-4 bg-card border border-primary/40 rounded-lg">
            <div className="flex items-center justify-between gap-3 mb-3">
              <div className="flex items-center gap-2">
                <div className="p-1.5 rounded-lg bg-muted text-muted-foreground">
                  <ProposalIcon type={proposal.type} />
                </div>
                <span className="text-xs font-medium text-muted-foreground uppercase">New Rule</span>
                <span className="text-[10px] font-medium text-amber-500 bg-amber-500/20 px-1.5 py-0.5 rounded-full">Editing</span>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <button onClick={() => onApprove(proposal.id)} disabled={processing === proposal.id}
                  className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-chart-2 bg-chart-2/10 hover:bg-chart-2/20 rounded-lg transition-all disabled:opacity-50"
                  title="Approve with edits">
                  {processing === proposal.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                  Save & Approve
                </button>
                <button onClick={onCancelEdit} disabled={processing === proposal.id}
                  className="p-1.5 text-muted-foreground hover:text-foreground rounded-lg transition-colors" title="Cancel editing">
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>
            <div className="space-y-2 mb-2">
              {renderField('Name', 'ruleName', 'text')}
              {renderField('Field', 'conditionField', 'select', ['description', 'payee', 'amount', 'memo'])}
              {renderField('Operator', 'conditionOperator', 'select', ['contains', 'equals', 'starts_with', 'ends_with', 'regex'])}
              {renderField('Value', 'conditionValue', 'text')}
              {categoryComboboxField('Category', 'setCategoryName')}
              {renderField('Case sensitive', 'conditionCaseSensitive', 'checkbox')}
            </div>
            {proposal.explanation && <p className="text-xs text-muted-foreground italic mt-2">{proposal.explanation}</p>}
          </div>
        );
    }

    return (
      <div className="p-4 bg-card border border-primary/40 rounded-lg">
        <div className="flex items-center justify-between gap-3 mb-3">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-muted text-muted-foreground">
              <ProposalIcon type={proposal.type} />
            </div>
            <span className="text-xs font-medium text-muted-foreground uppercase">New Category</span>
            <span className="text-[10px] font-medium text-amber-500 bg-amber-500/20 px-1.5 py-0.5 rounded-full">Editing</span>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <button onClick={() => onApprove(proposal.id)} disabled={processing === proposal.id}
              className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-chart-2 bg-chart-2/10 hover:bg-chart-2/20 rounded-lg transition-all disabled:opacity-50"
              title="Approve with edits">
              {processing === proposal.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
              Save & Approve
            </button>
            <button onClick={onCancelEdit} disabled={processing === proposal.id}
              className="p-1.5 text-muted-foreground hover:text-foreground rounded-lg transition-colors" title="Cancel editing">
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="space-y-2 mb-2">
          {fields.map((f) => renderField(f.label, f.field, f.type, f.options))}
        </div>

        {proposal.explanation && <p className="text-xs text-muted-foreground italic mt-2">{proposal.explanation}</p>}
      </div>
    );
  }

  const detailLines: string[] = [];
  switch (proposal.type) {
    case 'categorize':
      detailLines.push(`Transaction: ${payload.transactionDescription ?? 'Unknown'}`);
      if (payload.proposedCategoryName) {
        detailLines.push(`→ Category: ${payload.proposedCategoryName}`);
      }
      break;
    case 'create_category':
      detailLines.push(`New category: ${payload.name}`);
      if (payload.parentName) detailLines.push(`Parent: ${payload.parentName}`);
      break;
    case 'create_rule':
      detailLines.push(`Rule: ${payload.ruleName ?? 'Unnamed'}`);
      detailLines.push(`If ${payload.conditionField} ${payload.conditionOperator} "${payload.conditionValue}"`);
      if (payload.setCategoryName) detailLines.push(`→ ${payload.setCategoryName}`);
      break;
  }

  return (
    <div className="p-4 bg-card border border-border rounded-lg">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-center gap-2 min-w-0">
          <div className="p-1.5 rounded-lg bg-muted text-muted-foreground">
            <ProposalIcon type={proposal.type} />
          </div>
          <span className="text-xs font-medium text-muted-foreground uppercase">
            {proposal.type === 'categorize' ? 'Categorize' : proposal.type === 'create_category' ? 'New Category' : 'New Rule'}
          </span>
          <div className={`px-1.5 py-0.5 text-[10px] font-medium rounded-full ${confidenceColor(confidence)}`}>
            {confidence}%
          </div>
        </div>
        {proposal.status === 'pending' && (
          <div className="flex items-center gap-1 shrink-0">
            <button
              onClick={() => onEdit(proposal.id)}
              className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-colors"
              title="Edit before approving"
            >
              <Pencil className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={() => onApprove(proposal.id)}
              disabled={processing === proposal.id}
              className="p-1.5 text-chart-2 hover:bg-chart-2/10 rounded-lg transition-colors disabled:opacity-50"
              title="Approve"
            >
              {processing === proposal.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
            </button>
            <button
              onClick={() => onReject(proposal.id)}
              disabled={processing === proposal.id}
              className="p-1.5 text-destructive hover:bg-destructive/10 rounded-lg transition-colors disabled:opacity-50"
              title="Reject"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )}
        {proposal.status === 'approved' && (
          <span className="text-[10px] font-medium text-chart-2 bg-chart-2/20 px-1.5 py-0.5 rounded-full">Approved</span>
        )}
        {proposal.status === 'rejected' && (
          <span className="text-[10px] font-medium text-destructive bg-destructive/20 px-1.5 py-0.5 rounded-full">Rejected</span>
        )}
      </div>

      <div className="space-y-1 mb-2">
        {detailLines.map((line, i) => (
          <p key={i} className="text-sm text-foreground font-mono">{line}</p>
        ))}
      </div>

      {proposal.explanation && (
        <p className="text-xs text-muted-foreground italic">{proposal.explanation}</p>
      )}
    </div>
  );
}

const STATUS_KEY = 'ai_analysis_status';
const ANALYSIS_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes

type AnalysisStatus = { status: 'running' | 'completed' | 'error'; message: string; startedAt?: number; totalToAnalyze?: number | null } | null;

export default function AiSuggestionsPage() {
  const [proposals, setProposals] = useState<AiProposal[]>([]);
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [processing, setProcessing] = useState<string | null>(null);
  const [clearing, setClearing] = useState(false);
  const [filterType, setFilterType] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('pending');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
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
  const [pendingProposalsCount, setPendingProposalsCount] = useState(0);
  const [batchSize, setBatchSize] = useState(25);
  const [showTestProgress, setShowTestProgress] = useState(false);
  const [confirmModalConfig, setConfirmModalConfig] = useState<{ title: string; description: string; actionLabel: string; onConfirm: () => void; isDestructive?: boolean } | null>(null);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editPayload, setEditPayload] = useState<any>(null);
  const [categories, setCategories] = useState<{ id: string; name: string; isIncome: boolean; parentId: string | null; color: string }[]>([]);
  const analyzingRef = useRef(false);

  const [savedStatus, setSavedStatus] = useState<AnalysisStatus>(null);

  const showFeedback = (type: 'success' | 'error', message: string) => {
    setFeedback({ type, message });
    setTimeout(() => setFeedback(null), 4000);
  };

  useEffect(() => {
    // Fetch batch size for display in status banner
    fetch('/api/user-settings', { credentials: 'include' })
      .then(r => r.json())
      .then(data => setBatchSize(data.aiBatchSize ?? 25))
      .catch(() => setBatchSize(25));
  }, []);

  const fetchProposals = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (filterStatus !== 'all') params.set('status', filterStatus);
      if (filterType !== 'all') params.set('type', filterType);
      params.set('_t', Date.now().toString()); // Cache busting
      const res = await fetch(`/api/ai/proposals?${params.toString()}`, { credentials: 'include', cache: 'no-store' });
      const data = await res.json();
      setProposals(Array.isArray(data) ? data : []);
    } catch {
      setProposals([]);
    } finally {
      setLoading(false);
    }
  }, [filterStatus, filterType]);

  useEffect(() => {
    fetchProposals();
    fetch('/api/categories', { credentials: 'include' })
      .then((r) => r.json())
      .then((data) => { if (Array.isArray(data)) setCategories(data); })
      .catch(() => {});
    // Restore analysis status from localStorage (survives navigation and reload)
    try {
      const raw = localStorage.getItem(STATUS_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as NonNullable<AnalysisStatus>;
        
        // Check if analysis has timed out
        if (parsed.status === 'running' && parsed.startedAt) {
          const elapsed = Date.now() - parsed.startedAt;
          if (elapsed > ANALYSIS_TIMEOUT_MS) {
            // Analysis has been running too long, mark as failed
            const timeoutMsg = 'Analysis appears to have timed out. Please try running the analysis again.';
            setSavedStatus({ status: 'error', message: timeoutMsg, startedAt: parsed.startedAt });
            localStorage.setItem(STATUS_KEY, JSON.stringify({ status: 'error', message: timeoutMsg, startedAt: parsed.startedAt }));
            return;
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

    return () => {
      // When navigating away, mark as not analyzing in this component instance
      analyzingRef.current = false;
    };
  }, [fetchProposals]);

  // Check for analysis timeout periodically
  useEffect(() => {
    if (!analyzing || !savedStatus?.startedAt) return;
    const checkTimeout = setInterval(() => {
      const elapsed = Date.now() - (savedStatus.startedAt || 0);
      if (elapsed > ANALYSIS_TIMEOUT_MS) {
        const timeoutMsg = 'Analysis appears to have timed out. Please try running the analysis again.';
        persistStatus({ status: 'error', message: timeoutMsg, startedAt: savedStatus.startedAt });
        setAnalyzing(false);
        showFeedback('error', timeoutMsg);
        clearInterval(checkTimeout);
      }
    }, 30000); // Check every 30 seconds
    return () => clearInterval(checkTimeout);
  }, [analyzing, savedStatus?.startedAt]);

  useEffect(() => {
    if (!analyzing || !startTime) {
      setElapsedSeconds(0);
      return;
    }
    const timer = setInterval(() => {
      setElapsedSeconds(Math.floor((Date.now() - startTime) / 1000));
    }, 1000);
    return () => clearInterval(timer);
  }, [analyzing, startTime]);

  useEffect(() => {
    if (!analyzing) return;
    const interval = setInterval(() => {
      const params = new URLSearchParams();
      if (filterStatus !== 'all') params.set('status', filterStatus);
      if (filterType !== 'all') params.set('type', filterType);
      params.set('_t', Date.now().toString());

      fetch(`/api/ai/proposals?${params.toString()}`, { credentials: 'include', cache: 'no-store' })
        .then((r) => r.json())
        .then((data) => {
          if (Array.isArray(data)) {
            setPendingProposalsCount(data.filter((p: AiProposal) => p.status === 'pending').length);

            let displayData = data;
            if (filterStatus !== 'all') displayData = displayData.filter(p => p.status === filterStatus);
            if (filterType !== 'all') displayData = displayData.filter(p => p.type === filterType);

            if (startTime) {
              const sessionProposals = data.filter((p: AiProposal) => 
                new Date(p.createdAt).getTime() >= startTime
              );
              
              // Track batch timing if we received more items
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
              const currentIds = new Set(displayData.map((p: any) => p.id));
              const hasChanges = displayData.length !== prev.length || 
                                displayData.some((p: any) => !prevIds.has(p.id)) ||
                                prev.some(p => !currentIds.has(p.id));
              if (hasChanges) {
                return [...displayData].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
              }
              return prev;
            });
          }
        })
        .catch(() => {});
    }, 3000);
    return () => clearInterval(interval);
  }, [analyzing, startTime, filterStatus, filterType]);

  // Poll backend status for live progress (processedCount/totalCount)
  useEffect(() => {
    if (!analyzing) {
      setProcessedCount(0);
      return;
    }
    const interval = setInterval(async () => {
      try {
        const res = await fetch('/api/ai/status', { credentials: 'include' });
        const data = await res.json();
        if (data.status === 'running' || data.status === 'completed') {
          setProcessedCount(data.processedCount ?? 0);
        }
      } catch { /* ignore */ }
    }, 2000);
    return () => clearInterval(interval);
  }, [analyzing]);

  const persistStatus = (status: AnalysisStatus) => {
    setSavedStatus(status);
    if (status) {
      // Add timestamp when status is running
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
    
    // Get initial count of items to analyze
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
      message: 'Analysis started — you can navigate away, it will continue in the background.',
      startedAt,
      totalToAnalyze: txnCount
    });
    setFeedback(null);

    try {
      const res = await fetch('/api/ai/analyze', { 
        method: 'POST', 
        credentials: 'include',
        keepalive: true // Ensures the request completes even if page is navigated
      });
      
      const data = await res.json().catch(() => ({ error: 'Invalid response from server' }));
      
      let finalStatus: AnalysisStatus;
      if (!res.ok) {
        finalStatus = { 
          status: 'error', 
          message: data.error || 'Failed to run analysis. Please check your AI provider configuration.' 
        };
      } else {
        const msg = data.errors?.length
          ? `Analysis completed with ${data.errors.length} error(s): ${data.errors.join('; ')}. ${data.proposalsCreated} proposals created.`
          : `Analysis complete: ${data.proposalsCreated} proposals created (${data.autoApproved} auto-approved).`;
        finalStatus = { status: data.errors?.length ? 'error' : 'completed', message: msg };
      }

      // Always persist the outcome so it is visible upon return
      localStorage.setItem(STATUS_KEY, JSON.stringify(finalStatus));

      if (analyzingRef.current) {
        setSavedStatus(finalStatus);
        showFeedback(finalStatus.status === 'completed' ? 'success' : 'error', finalStatus.message);
        await fetchProposals();
      }
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') return;

      const errorStatus: AnalysisStatus = { status: 'error', message: 'Failed to run analysis. Please try again or check your connection.' };
      localStorage.setItem(STATUS_KEY, JSON.stringify(errorStatus));
      if (analyzingRef.current) {
        setSavedStatus(errorStatus);
        showFeedback('error', errorStatus.message);
      }
    } finally {
      if (analyzingRef.current) {
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
          // Signal the backend to abort the background process
          await fetch('/api/ai/cancel', { method: 'POST', credentials: 'include' });
        } catch {
          // Fallback if endpoint not found, we still want to stop local state
        } finally {
          dismissStatus();
          showFeedback('success', 'Analysis stopped.');
        }
      }
    });
  };

  const handleTestProvider = () => {
    setShowTestProgress(true);
  };

  const handleEdit = (id: string) => {
    const proposal = proposals.find((p) => p.id === id);
    if (!proposal) return;
    setEditingId(id);
    setEditPayload({ ...proposal.payload });
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setEditPayload(null);
  };

  const handleEditField = (field: string, value: any) => {
    setEditPayload((prev: any) => ({ ...prev, [field]: value }));
  };

  const handleApprove = async (id: string) => {
    const isEditing = editingId === id;
    const modifiedPayload = isEditing ? editPayload : undefined;

    confirmAction({
      title: 'Approve Suggestion',
      description: isEditing
        ? 'Are you sure you want to approve this suggestion with your edits? This will apply the change to your financial data.'
        : 'Are you sure you want to approve this AI suggestion? This will apply the change to your financial data.',
      actionLabel: 'Approve',
      onConfirm: async () => {
        setProcessing(id);
        try {
          const body = modifiedPayload ? { payload: modifiedPayload } : {};
          const res = await fetch(`/api/ai/proposals/${id}/approve`, {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
          });
          if (!res.ok) {
            const data = await res.json();
            showFeedback('error', data.error || 'Failed to approve suggestion');
          } else {
            showFeedback('success', 'Approved.');
          }
          setEditingId(null);
          setEditPayload(null);
          await fetchProposals();
        } catch {
          showFeedback('error', 'Failed to approve.');
        } finally {
          setProcessing(null);
        }
      }
    });
  };

  const handleReject = async (id: string) => {
    confirmAction({
      title: 'Reject Suggestion',
      description: 'Are you sure you want to reject this suggestion? It will be hidden and moved to your history.',
      actionLabel: 'Reject',
      isDestructive: true,
      onConfirm: async () => {
        setProcessing(id);
        try {
          const res = await fetch(`/api/ai/proposals/${id}/reject`, { method: 'POST', credentials: 'include' });
          if (!res.ok) {
            const data = await res.json();
            showFeedback('error', data.error || 'Failed to reject suggestion');
          }
          await fetchProposals();
        } catch {
          showFeedback('error', 'Failed to reject suggestion.');
        } finally {
          setProcessing(null);
        }
      }
    });
  };

  const handleClearHistory = async () => {
    confirmAction({
      title: 'Clear Suggestion History',
      description: 'Are you sure you want to clear all approved and rejected suggestions? This cannot be undone.',
      actionLabel: 'Clear History',
      isDestructive: true,
      onConfirm: async () => {
        setClearing(true);
        try {
          // Try the most likely endpoints: /api/ai/proposals/clear or DELETE on /api/ai/proposals
          const res = await fetch('/api/ai/proposals/clear', {
            method: 'POST',
            credentials: 'include', 
            headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' } 
          });

          if (!res.ok) {
            let errorMessage = 'Failed to clear history';
            if (res.status === 404) {
              errorMessage = 'Clear history API endpoint not found (/api/ai/proposals/clear). Please ensure the server-side route exists.';
            } else {
              try {
                const data = await res.json();
                errorMessage = data.error || errorMessage;
              } catch {
                errorMessage = `Server error (${res.status})`;
              }
            }
            showFeedback('error', errorMessage);
          } else {
            // Clear locally immediately for better UX
            setProposals(prev => prev.filter(p => p.status === 'pending'));
            setSelectedIds(new Set());
            showFeedback('success', 'History cleared.');
          }
        } catch (err) {
          const msg = err instanceof Error ? err.message : 'Failed to clear history.';
          showFeedback('error', msg);
        } finally {
          setClearing(false);
        }
      }
    });
  };

  const handleBatchAction = async (action: 'approve' | 'reject') => {
    if (selectedIds.size === 0) return;
    confirmAction({
      title: action === 'approve' ? 'Batch Approve' : 'Batch Reject',
      description: `Are you sure you want to ${action} all ${selectedIds.size} selected suggestion(s)?`,
      actionLabel: action === 'approve' ? 'Approve All' : 'Reject All',
      isDestructive: action === 'reject',
      onConfirm: async () => {
        try {
          const res = await fetch('/api/ai/proposals/batch', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ ids: Array.from(selectedIds), action }),
          });
          if (!res.ok) {
            const data = await res.json();
            showFeedback('error', data.error || 'Batch action failed');
          } else {
            showFeedback('success', `${action === 'approve' ? 'Approved' : 'Rejected'} ${selectedIds.size} proposal(s).`);
            setSelectedIds(new Set());
          }
          await fetchProposals();
        } catch {
          showFeedback('error', 'Batch action failed.');
        }
      }
    });
  };

  const pendingCount = proposals.filter((p) => p.status === 'pending').length;
  const hasHistory = proposals.some((p) => p.status !== 'pending');
  const allPendingIds = proposals.filter((p) => p.status === 'pending').map((p) => p.id);

  return (
    <ContentWrapper>
      <div className="max-w-3xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-semibold text-foreground">AI Suggestions</h1>
            {pendingCount > 0 && (
              <span className="px-2 py-0.5 text-xs font-medium bg-primary/20 text-primary rounded-full">
                {pendingCount} pending
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {feedback && (
               <span className={`text-xs px-2 py-1 rounded-lg ${feedback.type === 'success' ? 'bg-status-positive/20 text-status-positive' : 'bg-destructive/20 text-destructive'}`}>

                {feedback.message}
              </span>
            )}
            {analyzing && (
              <span className="text-xs px-2 py-1 rounded-lg bg-primary/10 text-primary animate-pulse whitespace-nowrap">
                <Loader2 className="h-3 w-3 inline mr-1 animate-spin" />
                Running...
              </span>
            )}
            <button
              onClick={handleTestProvider}
              disabled={showTestProgress}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-foreground bg-muted hover:bg-accent border border-border rounded-lg transition-all disabled:opacity-50"
            >
              <FlaskConical className="h-3.5 w-3.5" />
              Test Provider
            </button>
            <button
              onClick={handleAnalyze}
              disabled={analyzing}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-primary-foreground bg-primary hover:opacity-90 rounded-lg transition-all disabled:opacity-50"
            >
              {analyzing ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Sparkles className="h-3.5 w-3.5" />
              )}
              {analyzing ? 'Analyzing...' : 'Run Analysis'}
            </button>
          </div>
        </div>

        {/* Persistent analysis status banner — survives navigation */}
        {(analyzing || savedStatus) && (
          <div className={`p-3 rounded-lg flex items-center gap-3 border ${
            savedStatus?.status === 'completed' ? 'bg-chart-2/10 border-chart-2/30' :
            savedStatus?.status === 'error' ? 'bg-destructive/10 border-destructive/30' :
            'bg-primary/5 border-primary/20'
          }`}>
            {(analyzing || savedStatus?.status === 'running') ? (
              <Loader2 className="h-4 w-4 animate-spin text-primary shrink-0" />
            ) : (
              <div className="h-4 w-4 shrink-0" />
            )}
            <div className="flex-1 text-sm text-foreground">
              {(analyzing || savedStatus?.status === 'running') ? (
                <div className="space-y-1.5">
                  <p className="font-medium">AI analysis in progress</p>
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1" title="Transactions prompted to the AI model so far">
                      <BarChart3 className="h-3.5 w-3.5" />
                      Prompted: {processedCount}{totalToAnalyze !== null ? ` / ${totalToAnalyze}` : ''}
                    </span>
                    <span className="flex items-center gap-1" title="Categorization suggestions created">
                      <Tag className="h-3.5 w-3.5" />
                      Categorized: {newTxnsCount}
                    </span>
                    <span className="flex items-center gap-1" title="Category suggestions created">
                      <FileText className="h-3.5 w-3.5" />
                      Categories: {newCategoriesCount}
                    </span>
                    <span className="flex items-center gap-1" title="Rule suggestions created">
                      <Brain className="h-3.5 w-3.5" />
                      Rules: {newRulesCount}
                    </span>
                    <span className="flex items-center gap-1" title="Suggestions waiting for your review">
                      <Layers className="h-3.5 w-3.5" />
                      Pending: {pendingProposalsCount}
                    </span>
                    <span className="flex items-center gap-1" title="Number of transactions processed per AI call">
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
                  <div className="text-[10px] text-muted-foreground space-y-0.5">
                    <p>
                      The AI is analyzing your uncategorized transactions in batches of {batchSize || 25},
                      considering your existing categories and rules to suggest categorizations, new categories, and rules.
                    </p>
                    <p className="opacity-70">
                      You can navigate away — analysis continues in the background. New proposals appear here automatically.
                    </p>
                  </div>
                </div>
              ) : savedStatus?.status === 'error' ? (
                <>
                  <p className="font-medium text-destructive">{savedStatus.message}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Check your AI provider settings and try again. If the issue persists, verify your AI provider endpoint and API key.
                  </p>
                </>
              ) : (
                <p className="text-sm">{savedStatus?.message}</p>
              )}
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {(analyzing || savedStatus?.status === 'running') && (
                <button
                  onClick={handleCancel}
                  className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-destructive hover:bg-destructive/10 border border-destructive/20 rounded-lg transition-all shrink-0"
                >
                  <X className="h-3 w-3" />
                  Cancel
                </button>
              )}
              {savedStatus?.status === 'error' && (
                <button
                  onClick={handleAnalyze}
                  disabled={analyzing}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-primary-foreground bg-primary hover:opacity-90 rounded-lg transition-all disabled:opacity-50"
                >
                  <Sparkles className="h-3 w-3" />
                  Retry
                </button>
              )}
              {!(analyzing || savedStatus?.status === 'running') && (
                <button
                  onClick={dismissStatus}
                  className="text-muted-foreground hover:text-foreground"
                  title="Dismiss"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
          </div>
        )}

        {/* Filters */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 rounded-lg bg-muted p-1">
            {['all', 'pending', 'approved', 'rejected'].map((s) => (
              <button
                key={s}
                onClick={() => setFilterStatus(s)}
                className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors ${
                  filterStatus === s ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {s === 'all' ? 'All' : s.charAt(0).toUpperCase() + s.slice(1)}
              </button>
            ))}
          </div>
          <div className="w-px h-5 bg-border" />
          <div className="flex items-center gap-1.5 rounded-lg bg-muted p-1">
            {[
              { value: 'all', label: 'All Types' },
              { value: 'categorize', label: 'Categorize' },
              { value: 'create_category', label: 'New Categories' },
              { value: 'create_rule', label: 'New Rules' },
            ].map((t) => (
              <button
                key={t.value}
                onClick={() => setFilterType(t.value)}
                className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors ${
                  filterType === t.value ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* Clear History button */}
        {hasHistory && (
          <div className="flex justify-end">
            <button
              onClick={handleClearHistory}
              disabled={clearing}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-destructive hover:bg-destructive/10 border border-destructive/20 rounded-lg transition-all disabled:opacity-50"
            >
              <Trash2 className="h-3.5 w-3.5" />
              {clearing ? 'Clearing...' : 'Clear History'}
            </button>
          </div>
        )}

        {/* Batch actions */}
        {selectedIds.size > 0 && (
          <div className="flex items-center gap-2 p-3 bg-muted/30 border border-border rounded-lg">
            <span className="text-xs text-muted-foreground">{selectedIds.size} selected</span>
            <button
              onClick={() => handleBatchAction('approve')}
              className="flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-chart-2 bg-chart-2/10 hover:bg-chart-2/20 rounded-lg transition-colors"
            >
              <Check className="h-3 w-3" /> Approve All
            </button>
            <button
              onClick={() => handleBatchAction('reject')}
              className="flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-destructive bg-destructive/10 hover:bg-destructive/20 rounded-lg transition-colors"
            >
              <X className="h-3 w-3" /> Reject All
            </button>
            <button
              onClick={() => setSelectedIds(new Set())}
              className="px-2.5 py-1 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
            >
              Clear
            </button>
          </div>
        )}

        {/* Content */}
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : proposals.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <Sparkles className="h-8 w-8 text-muted-foreground mb-3" />
            <p className="text-muted-foreground text-sm mb-4">
              {filterStatus !== 'pending' ? 'No proposals match the current filters.' : 'No pending AI suggestions.'}
            </p>
            {filterStatus === 'pending' && (
              <button
                onClick={handleAnalyze}
                disabled={analyzing}
                className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-primary-foreground bg-primary hover:opacity-90 rounded-lg transition-all disabled:opacity-50"
              >
                <Sparkles className="h-4 w-4" />
                Run Analysis Now
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-2">
            <div className="flex items-center gap-2 mb-1">
              <input
                type="checkbox"
                checked={selectedIds.size === pendingCount && pendingCount > 0}
                onChange={(e) => {
                  if (e.target.checked) setSelectedIds(new Set(allPendingIds));
                  else setSelectedIds(new Set());
                }}
                className="accent-primary"
              />
              <span className="text-xs text-muted-foreground">Select all pending</span>
            </div>
            {proposals.map((proposal) => (
              <div key={proposal.id} className="flex items-start gap-3">
                {proposal.status === 'pending' && (
                  <div className="pt-4">
                    <input
                      type="checkbox"
                      checked={selectedIds.has(proposal.id)}
                      onChange={(e) => {
                        const next = new Set(selectedIds);
                        if (e.target.checked) next.add(proposal.id);
                        else next.delete(proposal.id);
                        setSelectedIds(next);
                      }}
                      className="accent-primary"
                    />
                  </div>
                )}
                <div className="flex-1">
                  <ProposalCard
                    proposal={proposal}
                    onApprove={handleApprove}
                    onReject={handleReject}
                    processing={processing}
                    editingId={editingId}
                    editPayload={editPayload}
                    onEdit={handleEdit}
                    onCancelEdit={handleCancelEdit}
                    onEditField={handleEditField}
                    categories={categories}
                  />
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Test Provider Progress */}
        {showTestProgress && (
          <AiTestProgress
            title="Test AI Provider"
            testFn={async (signal) => {
              let prompt: string | undefined;
              try {
                prompt = localStorage.getItem(TEST_PROMPT_STORAGE_KEY) ?? undefined;
              } catch { /* ignore */ }
              const res = await fetch('/api/ai/providers/test-active', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: prompt ? JSON.stringify({ prompt }) : undefined,
                signal,
              });
              const data = await res.json();
              return {
                ok: data.ok,
                message: data.message || (data.ok ? 'Connected' : 'Failed'),
                response: data.response,
              };
            }}
            onClose={() => setShowTestProgress(false)}
          />
        )}

        {/* Confirmation Modal */}
        {showConfirmModal && confirmModalConfig && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setShowConfirmModal(false)}>
            <div
              className="bg-card border border-border rounded-xl p-6 max-w-sm w-full shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <h2 className="text-base font-semibold text-foreground mb-2">
                {confirmModalConfig.title}
              </h2>
              <p className="text-sm text-muted-foreground mb-6">
                {confirmModalConfig.description}
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => setShowConfirmModal(false)}
                  className="flex-1 px-3 py-2 text-sm font-medium text-foreground bg-muted hover:bg-accent border border-border rounded-lg transition-all"
                >
                  Cancel
                </button>
                <button
                  onClick={() => {
                    setShowConfirmModal(false);
                    confirmModalConfig.onConfirm();
                  }}
                  className={`flex-1 px-3 py-2 text-sm font-medium text-white rounded-lg transition-all ${
                    confirmModalConfig.isDestructive ? 'bg-destructive hover:opacity-90' : 'bg-primary hover:opacity-90'
                  }`}
                >
                  {confirmModalConfig.actionLabel}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </ContentWrapper>
  );
}
