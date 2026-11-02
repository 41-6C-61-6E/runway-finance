'use client';

import React from 'react';
import { useUserSettings } from '@/components/user-settings-provider';
import { Tag, FolderPlus, Brain, Sparkles, Check, X, ArrowRight } from 'lucide-react';
import { Spinner } from '@/components/ui/loading-spinner';
import { CategoryPillSelector } from './category-pill-selector';
import type { AiProposal, Category } from './types';

export function confidenceColor(confidence: number): string {
  if (confidence >= 80) return 'bg-status-positive/20 text-status-positive';
  if (confidence >= 50) return 'bg-yellow-500/20 text-yellow-500';
  return 'bg-destructive/20 text-destructive';
}

export function ProposalIcon({ type }: { type: string }) {
  switch (type) {
    case 'categorize':
      return <Tag className="h-4 w-4 text-primary" />;
    case 'create_category':
      return <FolderPlus className="h-4 w-4 text-amber-500" />;
    case 'create_rule':
      return <Brain className="h-4 w-4 text-purple-400" />;
    default:
      return <Sparkles className="h-4 w-4" />;
  }
}

interface ProposalCardProps {
  proposal: AiProposal;
  categories: Category[];
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
  onCategoryChange: (proposalId: string, categoryId: string, categoryName: string) => void;
  onCategoryCreated?: (newCategory: Category) => void;
  processing: string | null;
}

export function ProposalCard({
  proposal,
  categories,
  onApprove,
  onReject,
  onCategoryChange,
  onCategoryCreated,
  processing,
}: ProposalCardProps) {
  const confidence = parseInt(proposal.confidence ?? '0');
  const payload = proposal.payload;

  const settingsContext = useUserSettings();
  const showSuggestionsTags = settingsContext?.settings?.accountTagVisibility?.suggestions !== false;

  return (
    <div className="relative bg-card/60 hover:bg-card/90 rounded-xl border border-border/70 hover:border-border transition-all duration-200 p-4 sm:p-5 shadow-xs">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-center gap-2 min-w-0">
          <div className="p-1.5 rounded-lg bg-muted text-muted-foreground">
            <ProposalIcon type={proposal.type} />
          </div>
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            {proposal.type === 'categorize' ? 'Categorize' : proposal.type === 'create_category' ? 'New Category' : 'New Rule'}
          </span>
          <div className={`px-2 py-0.5 text-[10px] font-bold rounded-full ${confidenceColor(confidence)}`}>
            {confidence}%
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={() => onApprove(proposal.id)}
            disabled={processing === proposal.id}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/25 rounded-lg transition-all disabled:opacity-50 shadow-xs cursor-pointer"
            title="Approve suggestion"
            aria-label="Approve suggestion"
          >
            {processing === proposal.id ? (
              <Spinner size="sm" />
            ) : (
              <Check className="h-3.5 w-3.5" />
            )}
            <span>Approve</span>
          </button>
          <button
            type="button"
            onClick={() => onReject(proposal.id)}
            disabled={processing === proposal.id}
            className="p-1.5 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-lg transition-colors disabled:opacity-50 cursor-pointer"
            title="Dismiss suggestion"
            aria-label="Dismiss suggestion"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {proposal.type === 'create_rule' && (
        <div className="space-y-2 mb-2">
          <div className="font-semibold text-sm text-foreground">
            {payload.ruleName || 'Auto-rule'}
          </div>
          <div className="flex flex-wrap items-center gap-1.5 text-xs py-2 px-3 rounded-lg bg-background/50 border border-border/50">
            <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/70">When</span>
            <span className="px-2 py-0.5 rounded bg-muted font-medium text-foreground capitalize">
              {payload.conditionField || 'description'}
            </span>
            <span className="text-muted-foreground font-medium">
              {payload.conditionOperator || 'contains'}
            </span>
            <span className="px-2 py-0.5 rounded bg-muted/80 font-mono font-semibold text-foreground">
              &quot;{payload.conditionValue}&quot;
            </span>
            <ArrowRight className="h-3.5 w-3.5 text-muted-foreground shrink-0 mx-0.5" />
            <CategoryPillSelector
              currentCategoryName={payload.setCategoryName}
              categories={categories}
              onSelectCategory={(catId, catName) => {
                onCategoryChange(proposal.id, catId, catName);
              }}
              onCategoryCreated={onCategoryCreated}
            />
          </div>
        </div>
      )}

      {proposal.type === 'categorize' && (
        <div className="space-y-2.5 mb-2">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5">
            <div className="min-w-0">
              <div className="font-semibold text-sm text-foreground truncate">
                {proposal.transactionDetails?.payee || payload.transactionDescription || 'Transaction'}
              </div>
              <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                {proposal.transactionDetails?.date && (
                  <span>
                    {new Date(proposal.transactionDetails.date).toLocaleDateString(undefined, {
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric',
                    })}
                  </span>
                )}
                {proposal.transactionDetails?.accountName && (
                  <>
                    <span>•</span>
                    <span className="flex items-center gap-1">
                      {proposal.transactionDetails.accountName}
                      {showSuggestionsTags && proposal.transactionDetails.accountTags && proposal.transactionDetails.accountTags.length > 0 && (
                        <span className="flex items-center gap-1 ml-1">
                          {proposal.transactionDetails.accountTags.map((tag) => (
                            <span
                              key={tag.id}
                              className="w-1.5 h-1.5 rounded-full"
                              style={{ backgroundColor: tag.color }}
                              title={tag.name}
                            />
                          ))}
                        </span>
                      )}
                    </span>
                  </>
                )}
              </div>
            </div>
            {proposal.transactionDetails?.amount && (
              <div className={`text-sm font-semibold font-mono sm:text-right shrink-0 ${
                Number(proposal.transactionDetails.amount) < 0 ? 'text-foreground' : 'text-status-positive'
              }`}>
                {new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Number(proposal.transactionDetails.amount))}
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs py-2 px-3 rounded-lg bg-background/50 border border-border/50">
            <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/70">Suggests</span>
            <ArrowRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            <CategoryPillSelector
              currentCategoryName={payload.proposedCategoryName}
              categories={categories}
              onSelectCategory={(catId, catName) => {
                onCategoryChange(proposal.id, catId, catName);
              }}
              onCategoryCreated={onCategoryCreated}
            />
          </div>
        </div>
      )}

      {proposal.type === 'create_category' && (
        <div className="space-y-2 mb-2">
          <div className="flex flex-wrap items-center gap-2 text-xs py-2 px-3 rounded-lg bg-background/50 border border-border/50">
            <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/70">New Category</span>
            <ArrowRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            <span
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border"
              style={{
                backgroundColor: `${payload.color || '#6366f1'}18`,
                color: payload.color || '#6366f1',
                borderColor: `${payload.color || '#6366f1'}35`,
              }}
            >
              <span
                className="w-2 h-2 rounded-full shrink-0"
                style={{ backgroundColor: payload.color || '#6366f1' }}
              />
              {payload.parentName ? `${payload.parentName} > ${payload.name}` : payload.name}
            </span>
          </div>
        </div>
      )}

      {proposal.explanation && (
        <p className="text-xs text-muted-foreground italic mt-1">{proposal.explanation}</p>
      )}
    </div>
  );
}

