'use client';

import { useState, useEffect, useCallback } from 'react';
import ContentWrapper from '@/components/content-wrapper';
import { Sparkles, Check, X, Loader2, Brain, Tag, FileText, SlidersHorizontal } from 'lucide-react';

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
  if (confidence >= 80) return 'bg-chart-2/20 text-chart-2';
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
}: {
  proposal: AiProposal;
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
  processing: string | null;
}) {
  const confidence = parseInt(proposal.confidence ?? '0');
  const payload = proposal.payload;

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

export default function AiSuggestionsPage() {
  const [proposals, setProposals] = useState<AiProposal[]>([]);
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [processing, setProcessing] = useState<string | null>(null);
  const [filterType, setFilterType] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('pending');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const showFeedback = (type: 'success' | 'error', message: string) => {
    setFeedback({ type, message });
    setTimeout(() => setFeedback(null), 4000);
  };

  const fetchProposals = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (filterStatus !== 'all') params.set('status', filterStatus);
      if (filterType !== 'all') params.set('type', filterType);
      const res = await fetch(`/api/ai/proposals?${params}`, { credentials: 'include' });
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
  }, [fetchProposals]);

  const handleAnalyze = async () => {
    setAnalyzing(true);
    setFeedback(null);
    try {
      const res = await fetch('/api/ai/analyze', {
        method: 'POST',
        credentials: 'include',
      });
      const data = await res.json();
      if (data.errors?.length) {
        showFeedback('error', `Analysis completed with ${data.errors.length} error(s). ${data.proposalsCreated} proposals created.`);
      } else {
        showFeedback('success', `Analysis complete: ${data.proposalsCreated} proposals created (${data.autoApproved} auto-approved).`);
      }
      await fetchProposals();
    } catch {
      showFeedback('error', 'Failed to run analysis.');
    }
    setAnalyzing(false);
  };

  const handleApprove = async (id: string) => {
    setProcessing(id);
    try {
      const res = await fetch(`/api/ai/proposals/${id}/approve`, {
        method: 'POST',
        credentials: 'include',
      });
      if (!res.ok) {
        const data = await res.json();
        showFeedback('error', data.error || 'Failed to approve');
      } else {
        showFeedback('success', 'Approved.');
      }
      await fetchProposals();
    } catch {
      showFeedback('error', 'Failed to approve.');
    }
    setProcessing(null);
  };

  const handleReject = async (id: string) => {
    setProcessing(id);
    try {
      await fetch(`/api/ai/proposals/${id}/reject`, {
        method: 'POST',
        credentials: 'include',
      });
      await fetchProposals();
    } catch {}
    setProcessing(null);
  };

  const handleBatchAction = async (action: 'approve' | 'reject') => {
    if (selectedIds.size === 0) return;
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
  };

  const pendingCount = proposals.filter((p) => p.status === 'pending').length;
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
              <span className={`text-xs px-2 py-1 rounded-lg ${feedback.type === 'success' ? 'bg-chart-2/20 text-chart-2' : 'bg-destructive/20 text-destructive'}`}>
                {feedback.message}
              </span>
            )}
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
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </ContentWrapper>
  );
}
