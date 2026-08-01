'use client';

import { useState, useEffect, useMemo } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { History, Search, Sparkles, Wrench, Bug, GitCommit, Calendar, RefreshCw, X } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface CommitItem {
  hash: string;
  fullHash?: string;
  author: string;
  date: string;
  message: string;
  type: string;
}

interface ChangelogData {
  buildNumber: string;
  buildTime?: string;
  commits: string[];
  history: CommitItem[];
}

interface ChangelogModalProps {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export function ChangelogModal({ open: externalOpen, onOpenChange }: ChangelogModalProps) {
  const [internalOpen, setInternalOpen] = useState(false);
  const isControlled = externalOpen !== undefined;
  const isOpen = isControlled ? externalOpen : internalOpen;

  const setIsOpen = (nextOpen: boolean) => {
    if (!isControlled) {
      setInternalOpen(nextOpen);
    }
    onOpenChange?.(nextOpen);
  };

  const [data, setData] = useState<ChangelogData | null>(null);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedType, setSelectedType] = useState<string>('all');

  // Listen to custom open-changelog window event
  useEffect(() => {
    const handleOpen = () => setIsOpen(true);
    window.addEventListener('open-changelog', handleOpen);
    return () => window.removeEventListener('open-changelog', handleOpen);
  }, []);

  // Fetch changelog data when modal opens
  useEffect(() => {
    if (!isOpen) return;
    setLoading(true);
    fetch('/api/changelog')
      .then((res) => {
        if (!res.ok) throw new Error('Failed to fetch changelog');
        return res.json();
      })
      .then((json) => {
        setData(json);
      })
      .catch(() => {
        // Fallback to version-info.json directly
        fetch('/version-info.json')
          .then((res) => res.json())
          .then((json) => setData(json))
          .catch(() => {});
      })
      .finally(() => setLoading(false));
  }, [isOpen]);

  const filteredHistory = useMemo(() => {
    if (!data?.history) return [];

    return data.history.filter((item) => {
      const matchesSearch =
        item.message.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.author.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.hash.toLowerCase().includes(searchQuery.toLowerCase());

      if (!matchesSearch) return false;

      if (selectedType === 'all') return true;
      if (selectedType === 'feat') return item.type === 'feat';
      if (selectedType === 'fix') return item.type === 'fix';
      if (selectedType === 'refactor') return item.type === 'refactor';
      if (selectedType === 'other')
        return !['feat', 'fix', 'refactor'].includes(item.type);

      return true;
    });
  }, [data?.history, searchQuery, selectedType]);

  const getTypeBadge = (type: string) => {
    switch (type.toLowerCase()) {
      case 'feat':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
            <Sparkles className="w-3 h-3" />
            Feature
          </span>
        );
      case 'fix':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold bg-rose-500/15 text-rose-600 dark:text-rose-400 border border-rose-500/20">
            <Bug className="w-3 h-3" />
            Fix
          </span>
        );
      case 'refactor':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold bg-purple-500/15 text-purple-600 dark:text-purple-400 border border-purple-500/20">
            <Wrench className="w-3 h-3" />
            Refactor
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold bg-blue-500/15 text-blue-600 dark:text-blue-400 border border-blue-500/20">
            <GitCommit className="w-3 h-3" />
            {type.toUpperCase()}
          </span>
        );
    }
  };

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return '';
    try {
      const d = new Date(dateStr);
      return d.toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return dateStr;
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col p-0 gap-0 overflow-hidden border-border bg-card shadow-2xl rounded-xl">
        <DialogHeader className="p-6 pb-4 border-b border-border/60 bg-muted/30">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
                <History className="w-5 h-5" />
              </div>
              <div>
                <DialogTitle className="text-lg font-bold text-foreground">
                  Changelog & Recent Releases
                </DialogTitle>
                <DialogDescription className="text-xs text-muted-foreground mt-0.5">
                  See recent features, enhancements, and fixes across app builds.
                </DialogDescription>
              </div>
            </div>
          </div>

          {data && (
            <div className="flex flex-wrap items-center gap-2 mt-4 text-xs font-mono">
              <span className="px-2.5 py-1 rounded-md bg-muted text-muted-foreground border border-border">
                Build: <strong className="text-foreground">{data.buildNumber}</strong>
              </span>
              {data.buildTime && (
                <span className="px-2.5 py-1 rounded-md bg-muted text-muted-foreground border border-border flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5 opacity-60" />
                  {formatDate(data.buildTime)}
                </span>
              )}
            </div>
          )}
        </DialogHeader>

        {/* Filter Controls */}
        <div className="p-4 border-b border-border/40 bg-muted/10 flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between">
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="text"
              placeholder="Search changes, authors, or commits..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 h-9 text-xs bg-background"
            />
          </div>

          <div className="flex items-center gap-1 overflow-x-auto pb-1 sm:pb-0">
            {[
              { id: 'all', label: 'All' },
              { id: 'feat', label: 'Features' },
              { id: 'fix', label: 'Fixes' },
              { id: 'refactor', label: 'Refactors' },
              { id: 'other', label: 'Other' },
            ].map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setSelectedType(tab.id)}
                className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors whitespace-nowrap ${
                  selectedType === tab.id
                    ? 'bg-primary text-primary-foreground shadow-sm'
                    : 'bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* Commit List / Changelog Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground gap-2">
              <RefreshCw className="w-6 h-6 animate-spin text-primary" />
              <span className="text-xs font-medium">Loading changelog data...</span>
            </div>
          ) : filteredHistory.length > 0 ? (
            <div className="relative pl-6 border-l-2 border-border/50 space-y-6">
              {filteredHistory.map((item, index) => (
                <div key={item.hash + index} className="relative group">
                  <div className="absolute -left-[31px] top-1.5 w-3 h-3 rounded-full bg-border group-hover:bg-primary transition-colors border-2 border-card" />
                  
                  <div className="flex flex-col gap-1.5 bg-muted/20 hover:bg-muted/40 p-3.5 rounded-lg border border-border/50 transition-colors">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        {getTypeBadge(item.type)}
                        <span className="font-mono text-[11px] text-muted-foreground px-1.5 py-0.5 rounded bg-muted">
                          #{item.hash}
                        </span>
                      </div>
                      <span className="text-[11px] text-muted-foreground font-medium">
                        {formatDate(item.date)}
                      </span>
                    </div>

                    <p className="text-xs font-medium text-foreground leading-relaxed mt-0.5">
                      {item.message}
                    </p>

                    {item.author && (
                      <div className="text-[11px] text-muted-foreground/75 font-mono pt-1 border-t border-border/30 flex items-center justify-between">
                        <span>By {item.author}</span>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : data?.commits && data.commits.length > 0 ? (
            <div className="space-y-2">
              <span className="text-xs font-semibold text-muted-foreground">Recent Changes:</span>
              <ul className="space-y-2">
                {data.commits
                  .filter((msg) => msg.toLowerCase().includes(searchQuery.toLowerCase()))
                  .map((msg, index) => (
                    <li
                      key={index}
                      className="text-xs p-3 rounded-lg bg-muted/30 border border-border/40 text-foreground font-medium"
                    >
                      {msg}
                    </li>
                  ))}
              </ul>
            </div>
          ) : (
            <div className="text-center py-12 text-muted-foreground text-xs">
              No recent changes found matching your search criteria.
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="p-4 border-t border-border/60 bg-muted/30 flex items-center justify-between">
          <span className="text-[11px] text-muted-foreground">
            Personal Finance Dashboard • Version History
          </span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setIsOpen(false)}
            className="text-xs"
          >
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
