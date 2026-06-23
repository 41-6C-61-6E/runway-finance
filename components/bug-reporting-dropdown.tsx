'use client';

import { useState, useRef, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { 
  Bug, 
  Sparkles, 
  Trash2, 
  Loader2, 
  X, 
  MessageSquare, 
  Check, 
  ChevronDown, 
  ChevronUp 
} from 'lucide-react';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { toast } from 'sonner';

interface Issue {
  id: string;
  userId: string;
  type: 'bug' | 'feature';
  title: string;
  description: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  reporterName: string | null;
}

const statuses = {
  bug: ['reported', 'in work', 'fixed', 'closed'],
  feature: ['requested', 'in work', 'added', 'closed']
};

export default function BugReportingDropdown() {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<'report' | 'track'>('report');
  
  // Form State
  const [formType, setFormType] = useState<'bug' | 'feature'>('bug');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  
  // Tracking State
  const [expandedIssueId, setExpandedIssueId] = useState<string | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [showClosed, setShowClosed] = useState(false);

  const ref = useRef<HTMLDivElement>(null);

  // 1. Query Config
  const { data: config } = useQuery({
    queryKey: ['bug-reporting-config'],
    queryFn: async () => {
      const res = await fetch('/api/bug-reporting/config');
      if (!res.ok) return { enabled: false };
      return res.json() as Promise<{ enabled: boolean }>;
    },
  });

  // 2. Query Issues List
  const { data: issuesList = [], refetch, isLoading: listLoading } = useQuery<Issue[]>({
    queryKey: ['issues'],
    queryFn: async () => {
      const res = await fetch('/api/bug-reporting');
      if (!res.ok) return [];
      return res.json() as Promise<Issue[]>;
    },
    enabled: !!config?.enabled,
    refetchInterval: 1000 * 30, // Poll every 30 seconds
    refetchOnWindowFocus: true,
  });

  // 3. Mutation: Create
  const createMutation = useMutation({
    mutationFn: async (newIssue: { type: 'bug' | 'feature'; title: string; description: string }) => {
      const res = await fetch('/api/bug-reporting', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newIssue),
      });
      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || errorData.details ? JSON.stringify(errorData.details) : 'Failed to submit report');
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['issues'] });
      toast.success(`${formType === 'bug' ? 'Bug report' : 'Feature request'} submitted successfully!`);
      setTitle('');
      setDescription('');
      setTab('track');
    },
    onError: (error: any) => {
      try {
        const parsed = JSON.parse(error.message);
        if (typeof parsed === 'object') {
          const firstError = Object.values(parsed)[0];
          if (Array.isArray(firstError)) {
            toast.error(firstError[0]);
            return;
          }
        }
      } catch {}
      toast.error(error.message || 'Something went wrong');
    },
  });

  // 4. Mutation: Update Status
  const updateStatusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const res = await fetch(`/api/bug-reporting/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) {
        throw new Error('Failed to update status');
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['issues'] });
      toast.success('Status updated successfully!');
    },
    onError: (error: any) => {
      toast.error(error.message || 'Failed to update status');
    },
  });

  // 5. Mutation: Delete
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/bug-reporting/${id}`, {
        method: 'DELETE',
      });
      if (!res.ok) {
        throw new Error('Failed to delete report');
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['issues'] });
      toast.success('Report deleted successfully!');
      setDeleteConfirmId(null);
    },
    onError: (error: any) => {
      toast.error(error.message || 'Failed to delete report');
      setDeleteConfirmId(null);
    },
  });

  // Handle outside click & escape key
  useEffect(() => {
    if (!open) return;
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function handleEscape(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [open]);

  // Reset delete confirmation timer
  useEffect(() => {
    if (!deleteConfirmId) return;
    const timer = setTimeout(() => {
      setDeleteConfirmId(null);
    }, 4000);
    return () => clearTimeout(timer);
  }, [deleteConfirmId]);

  if (!config?.enabled) {
    return null;
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || title.length < 3) {
      toast.error('Title must be at least 3 characters');
      return;
    }
    if (!description.trim() || description.length < 5) {
      toast.error('Description must be at least 5 characters');
      return;
    }
    createMutation.mutate({
      type: formType,
      title: title.trim(),
      description: description.trim(),
    });
  };

  const getStatusStyles = (status: string) => {
    switch (status) {
      case 'reported':
        return 'bg-red-500/10 text-red-500 border-red-500/20';
      case 'requested':
        return 'bg-purple-500/10 text-purple-500 border-purple-500/20';
      case 'in work':
        return 'bg-amber-500/10 text-amber-500 border-amber-500/20';
      case 'fixed':
      case 'added':
        return 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20';
      case 'closed':
      default:
        return 'bg-muted text-muted-foreground border-border/30';
    }
  };

  const formatTimeAgo = (dateStr: string) => {
    try {
      const date = new Date(dateStr);
      const now = new Date();
      const diffMs = now.getTime() - date.getTime();
      const diffMins = Math.floor(diffMs / 60000);
      const diffHours = Math.floor(diffMins / 60);
      const diffDays = Math.floor(diffHours / 24);

      if (diffMins < 1) return 'just now';
      if (diffMins < 60) return `${diffMins}m ago`;
      if (diffHours < 24) return `${diffHours}h ago`;
      return `${diffDays}d ago`;
    } catch {
      return '';
    }
  };

  const openIssues = issuesList.filter((issue) => issue.status !== 'closed');
  const closedIssuesCount = issuesList.length - openIssues.length;
  const displayedIssues = showClosed ? issuesList : openIssues;

  const hasActiveIssues = issuesList.some(
    (issue) => issue.status === 'reported' || issue.status === 'requested'
  );

  return (
    <div className="relative" ref={ref}>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            onClick={() => setOpen(!open)}
            className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors relative"
            aria-label="Submit Feedback / Track issues"
          >
            <MessageSquare className="w-5 h-5" />
            {hasActiveIssues && (
              <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 bg-destructive rounded-full ring-2 ring-background" />
            )}
          </button>
        </TooltipTrigger>
        <TooltipContent side="bottom">Bugs & Feedback</TooltipContent>
      </Tooltip>

      {open && (
        <div className="absolute right-0 top-full mt-1 w-80 sm:w-96 p-4 bg-card border border-border rounded-xl shadow-xl z-50 animate-in fade-in zoom-in-95 duration-100 ease-out origin-top-right">
          {/* Header Tab Buttons */}
          <div className="flex p-0.5 rounded-lg bg-muted mb-4">
            <button
              type="button"
              onClick={() => setTab('report')}
              className={`flex-1 py-1.5 text-xs font-medium rounded-md transition-all ${
                tab === 'report' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              Report Issue
            </button>
            <button
              type="button"
              onClick={() => setTab('track')}
              className={`flex-1 py-1.5 text-xs font-medium rounded-md transition-all ${
                tab === 'track' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              Open Issues ({openIssues.length})
            </button>
          </div>

          {/* Tab Content: Report Form */}
          {tab === 'report' ? (
            <form onSubmit={handleSubmit} className="space-y-3.5">
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setFormType('bug')}
                  className={`flex items-center justify-center gap-2 p-2 rounded-lg border text-xs font-medium transition-all cursor-pointer ${
                    formType === 'bug'
                      ? 'border-destructive/40 bg-destructive/10 text-destructive'
                      : 'border-border bg-card hover:bg-muted text-muted-foreground hover:text-foreground'
                  }`}
                >
                  <Bug className="w-3.5 h-3.5" />
                  Bug Report
                </button>
                <button
                  type="button"
                  onClick={() => setFormType('feature')}
                  className={`flex items-center justify-center gap-2 p-2 rounded-lg border text-xs font-medium transition-all cursor-pointer ${
                    formType === 'feature'
                      ? 'border-primary/40 bg-primary/10 text-primary'
                      : 'border-border bg-card hover:bg-muted text-muted-foreground hover:text-foreground'
                  }`}
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  Feature Request
                </button>
              </div>

              <div className="space-y-1.5">
                <label htmlFor="issue-title" className="text-xs font-medium text-muted-foreground">Title</label>
                <input
                  id="issue-title"
                  type="text"
                  placeholder={formType === 'bug' ? 'e.g. Plaid login errors out' : 'e.g. Add dark purple accent theme'}
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full px-3 py-1.5 text-sm bg-muted/30 border border-border rounded-lg focus:outline-none focus:ring-1 focus:ring-ring focus:border-ring transition-all"
                  required
                />
              </div>

              <div className="space-y-1.5">
                <label htmlFor="issue-desc" className="text-xs font-medium text-muted-foreground">Description</label>
                <textarea
                  id="issue-desc"
                  placeholder="Provide details about the bug or the requested feature..."
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full px-3 py-1.5 text-sm bg-muted/30 border border-border rounded-lg focus:outline-none focus:ring-1 focus:ring-ring focus:border-ring transition-all min-h-[100px] resize-none"
                  required
                />
              </div>

              <button
                type="submit"
                disabled={createMutation.isPending}
                className="w-full py-2 bg-primary text-primary-foreground hover:bg-primary/90 font-medium rounded-lg text-sm transition-all flex items-center justify-center gap-1.5 shadow-sm disabled:opacity-50 disabled:pointer-events-none cursor-pointer"
              >
                {createMutation.isPending ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Submitting...
                  </>
                ) : (
                  'Submit Report'
                )}
              </button>
            </form>
          ) : (
            /* Tab Content: Track List */
            <div className="space-y-3">
              {listLoading ? (
                <div className="flex flex-col items-center justify-center py-10 space-y-2 text-muted-foreground">
                  <Loader2 className="w-6 h-6 animate-spin" />
                  <span className="text-xs">Loading issues...</span>
                </div>
              ) : issuesList.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-10 space-y-2 border border-dashed border-border rounded-lg text-muted-foreground bg-muted/10">
                  <MessageSquare className="w-6 h-6 opacity-30" />
                  <span className="text-xs">No bugs or features reported yet.</span>
                </div>
              ) : (
                <div className="max-h-[320px] overflow-y-auto pr-1 space-y-3 no-scrollbar flex flex-col justify-between">
                  <div>
                    {displayedIssues.length === 0 ? (
                      <div className="flex flex-col items-center justify-center py-8 space-y-2 border border-dashed border-border rounded-lg text-muted-foreground bg-muted/10">
                        <MessageSquare className="w-5 h-5 opacity-20" />
                        <span className="text-xs">No open issues.</span>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {displayedIssues.map((issue) => {
                          const isExpanded = expandedIssueId === issue.id;
                          const isConfirmingDelete = deleteConfirmId === issue.id;
                          return (
                            <div 
                              key={issue.id} 
                              className="p-3 border border-border/60 bg-muted/20 hover:bg-muted/30 transition-all rounded-lg space-y-2 flex flex-col justify-between"
                            >
                              {/* Upper Section */}
                              <div className="flex items-start gap-2.5 justify-between">
                                <div className="flex-shrink-0 mt-0.5">
                                  {issue.type === 'bug' ? (
                                    <Bug className="w-4 h-4 text-destructive" />
                                  ) : (
                                    <Sparkles className="w-4 h-4 text-primary" />
                                  )}
                                </div>

                                <div className="flex-1 min-w-0">
                                  <h4 
                                    onClick={() => setExpandedIssueId(isExpanded ? null : issue.id)}
                                    className="text-xs font-semibold text-foreground truncate cursor-pointer hover:underline flex items-center justify-between gap-1"
                                  >
                                    <span className="truncate">{issue.title}</span>
                                    {isExpanded ? (
                                      <ChevronUp className="w-3 h-3 text-muted-foreground flex-shrink-0" />
                                    ) : (
                                      <ChevronDown className="w-3 h-3 text-muted-foreground flex-shrink-0" />
                                    )}
                                  </h4>

                                  <p 
                                    className={`text-[11px] text-muted-foreground leading-relaxed mt-0.5 ${
                                      isExpanded ? 'whitespace-pre-wrap break-words' : 'line-clamp-2'
                                    }`}
                                  >
                                    {issue.description}
                                  </p>

                                  <div className="flex items-center gap-1.5 mt-2 text-[10px] text-muted-foreground">
                                    <span>by {issue.reporterName || 'Unknown'}</span>
                                    <span>•</span>
                                    <span>{formatTimeAgo(issue.createdAt)}</span>
                                  </div>
                                </div>
                              </div>

                              {/* Lower Actions Section */}
                              <div className="flex items-center justify-between pt-2 border-t border-border/40 mt-1">
                                {/* Status Badge Dropdown */}
                                <div className="relative flex items-center">
                                  <select
                                    value={issue.status}
                                    onChange={(e) => updateStatusMutation.mutate({ id: issue.id, status: e.target.value })}
                                    className={`text-[10px] font-semibold px-2 py-0.5 rounded border cursor-pointer focus:outline-none appearance-none pr-5 relative transition-all ${getStatusStyles(issue.status)}`}
                                    aria-label="Change issue status"
                                  >
                                    {(issue.type === 'bug' ? statuses.bug : statuses.feature).map((st) => (
                                      <option key={st} value={st} className="bg-card text-foreground">
                                        {st}
                                      </option>
                                    ))}
                                  </select>
                                  <ChevronDown className="w-3 h-3 text-current absolute right-1.5 pointer-events-none" />
                                </div>

                                {/* Delete Button */}
                                <div className="flex items-center">
                                  {isConfirmingDelete ? (
                                    <button
                                      type="button"
                                      onClick={() => deleteMutation.mutate(issue.id)}
                                      disabled={deleteMutation.isPending}
                                      className="flex items-center gap-0.5 text-[10px] font-bold text-destructive hover:bg-destructive/10 border border-destructive/20 rounded px-1.5 py-0.5 transition-all cursor-pointer"
                                    >
                                      {deleteMutation.isPending ? (
                                        <Loader2 className="w-3 h-3 animate-spin" />
                                      ) : (
                                        <>
                                          <Check className="w-3 h-3" />
                                          Confirm
                                        </>
                                      )}
                                    </button>
                                  ) : (
                                    <button
                                      type="button"
                                      onClick={() => setDeleteConfirmId(issue.id)}
                                      className="p-1 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/5 transition-all cursor-pointer"
                                      title="Delete report"
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                  )}
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {/* Show/Hide Closed Issues Toggle Button */}
                  {closedIssuesCount > 0 && (
                    <button
                      type="button"
                      onClick={() => setShowClosed(!showClosed)}
                      className="w-full py-2 mt-2 text-[10px] font-semibold text-muted-foreground hover:text-foreground hover:bg-muted border border-dashed border-border rounded-lg transition-colors cursor-pointer flex items-center justify-center gap-1.5"
                    >
                      {showClosed ? 'Hide Closed Issues' : `Show Closed Issues (${closedIssuesCount})`}
                    </button>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
