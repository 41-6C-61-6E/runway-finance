'use client';

import React from 'react';
import { SectionHeading } from '@/components/ui/section-heading';
import { Select } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Eye, RotateCcw } from 'lucide-react';

interface AiFeatureTogglesProps {
  aiEnabled: boolean;
  setAiEnabled: (v: boolean) => void;
  aiSuggestionsEnabled: boolean;
  setAiSuggestionsEnabled: (v: boolean) => void;
  adviceEnabled: boolean;
  setAdviceEnabled: (v: boolean) => void;
  adviceModel: string;
  setAdviceModel: (v: string) => void;
  adviceIncludeAccountNames: boolean;
  setAdviceIncludeAccountNames: (v: boolean) => void;
  adviceTokenProfile: 'local' | 'modest' | 'balanced' | 'frontier';
  setAdviceTokenProfile: (v: 'local' | 'modest' | 'balanced' | 'frontier') => void;
  primaryModel: string;
  consentHost: string | null;
  setConsentHost: (v: string | null) => void;
  consentResetMessage: string | null;
  setConsentResetMessage: (v: string | null) => void;
  onReviewShared: () => void;
  saveSetting: (patch: Record<string, unknown>) => Promise<void>;
}

export function AiFeatureToggles({
  aiEnabled,
  setAiEnabled,
  aiSuggestionsEnabled,
  setAiSuggestionsEnabled,
  adviceEnabled,
  setAdviceEnabled,
  adviceModel,
  setAdviceModel,
  adviceIncludeAccountNames,
  setAdviceIncludeAccountNames,
  adviceTokenProfile,
  setAdviceTokenProfile,
  primaryModel,
  consentHost,
  setConsentHost,
  consentResetMessage,
  setConsentResetMessage,
  onReviewShared,
  saveSetting,
}: AiFeatureTogglesProps) {
  return (
    <div className="bg-card border border-border rounded-xl p-5 shadow-2xs space-y-5">
      <div>
        <SectionHeading>
          AI Features
        </SectionHeading>
        <p className="text-xs text-muted-foreground leading-relaxed mt-1">
          Control which AI-powered features are active. You can turn off all AI capabilities with the master switch or toggle individual features below.
        </p>
      </div>

      {/* Master Toggle */}
      <div className="p-4 rounded-xl bg-muted/40 border border-border space-y-3">
        <div className="flex items-center justify-between gap-4">
          <div className="flex-1 min-w-0">
            <span className="text-sm font-semibold text-foreground flex items-center gap-2">
              Enable AI Features
              {!aiEnabled && (
                <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-destructive/10 text-destructive border border-destructive/20">
                  Off
                </span>
              )}
            </span>
            <p className="text-xs text-muted-foreground mt-0.5">
              Master switch for all AI capabilities in Runway Finance. When turned off, both AI Suggestions and Advice are completely disabled.
            </p>
          </div>
          <label className="relative inline-flex items-center cursor-pointer shrink-0">
            <input
              type="checkbox"
              checked={aiEnabled}
              onChange={(e) => {
                const val = e.target.checked;
                setAiEnabled(val);
                saveSetting({ aiEnabled: val });
              }}
              className="sr-only peer"
            />
            <div className="w-9 h-5 bg-muted rounded-full peer peer-checked:bg-primary after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-card after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:after:translate-x-full"></div>
          </label>
        </div>

        {!aiEnabled && (
          <div className="text-xs text-amber-600 dark:text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-lg p-2.5">
            All AI features are globally disabled. No prompts, analysis runs, or background LLM requests will be made.
          </div>
        )}
      </div>

      {/* Individual Feature Toggles */}
      <div className={`space-y-4 pt-1 transition-opacity ${!aiEnabled ? 'opacity-50 pointer-events-none' : ''}`}>
        {/* Feature 1: AI Suggestions */}
        <div className="flex items-center justify-between gap-4 py-2 border-b border-border">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-foreground">Enable AI Suggestions</span>
              {!aiSuggestionsEnabled && aiEnabled && (
                <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-muted text-muted-foreground border border-border">
                  Off
                </span>
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              Automatically analyze uncategorized transactions, propose category rules, and suggest new spending categories.
            </p>
          </div>
          <label className="relative inline-flex items-center cursor-pointer shrink-0">
            <input
              type="checkbox"
              checked={aiSuggestionsEnabled}
              disabled={!aiEnabled}
              onChange={(e) => {
                const val = e.target.checked;
                setAiSuggestionsEnabled(val);
                saveSetting({ aiSuggestionsEnabled: val });
              }}
              className="sr-only peer"
            />
            <div className="w-9 h-5 bg-muted rounded-full peer peer-checked:bg-primary after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-card after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:after:translate-x-full"></div>
          </label>
        </div>

        {/* Feature 2: Advice */}
        <div className="space-y-4 pt-1">
          <div className="flex items-center justify-between gap-4">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-foreground">Enable Advice</span>
                {!adviceEnabled && aiEnabled && (
                  <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-muted text-muted-foreground border border-border">
                    Off
                  </span>
                )}
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                Show the Advice button in the navigation header to answer questions about your finances using read-only summaries.
              </p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer shrink-0">
              <input
                type="checkbox"
                checked={adviceEnabled}
                disabled={!aiEnabled}
                onChange={(e) => {
                  const val = e.target.checked;
                  setAdviceEnabled(val);
                  saveSetting({ aiAdviceEnabled: val, aiAskEnabled: val });
                }}
                className="sr-only peer"
              />
              <div className="w-9 h-5 bg-muted rounded-full peer peer-checked:bg-primary after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-card after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:after:translate-x-full"></div>
            </label>
          </div>

          {/* Advice Detail Settings */}
          <div className={`space-y-4 pt-1 pl-3 border-l-2 border-border/60 transition-opacity ${!adviceEnabled || !aiEnabled ? 'opacity-50 pointer-events-none' : ''}`}>
            <div>
              <label className="block text-xs font-medium text-foreground mb-1">
                Model override (optional)
              </label>
              <input
                type="text"
                value={adviceModel}
                disabled={!adviceEnabled || !aiEnabled}
                onChange={(e) => setAdviceModel(e.target.value)}
                onBlur={(e) => {
                  const val = e.target.value.trim() || null;
                  saveSetting({ aiAdviceModel: val, aiAskModel: val });
                }}
                placeholder={primaryModel ? `Default (${primaryModel})` : 'Leave blank to use primary AI provider model'}
                className="w-full px-3 py-2 bg-background border border-input rounded-lg text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Uses the same endpoint and API key as your AI provider, but calls a different model for Advice questions.
              </p>
            </div>

            <div className="flex items-center justify-between gap-4">
              <div className="flex-1 min-w-0">
                <span className="text-sm font-medium text-foreground">Include account names</span>
                <p className="text-xs text-muted-foreground mt-0.5">
                  When disabled, Advice uses generic labels like &quot;Checking #1&quot; or &quot;401(k) (spouse)&quot; instead of real account names.
                </p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer shrink-0">
                <input
                  type="checkbox"
                  checked={adviceIncludeAccountNames}
                  disabled={!adviceEnabled || !aiEnabled}
                  onChange={(e) => {
                    setAdviceIncludeAccountNames(e.target.checked);
                    saveSetting({ aiAdviceIncludeAccountNames: e.target.checked, aiAskIncludeAccountNames: e.target.checked });
                  }}
                  className="sr-only peer"
                />
                <div className="w-9 h-5 bg-muted rounded-full peer peer-checked:bg-primary after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-card after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:after:translate-x-full"></div>
              </label>
            </div>

            <div>
              <label className="block text-xs font-medium text-foreground mb-1">
                Context & Token Budget Profile
              </label>
              <Select
                value={adviceTokenProfile}
                disabled={!adviceEnabled || !aiEnabled}
                onChange={(e) => {
                  const val = e.target.value as 'local' | 'modest' | 'balanced' | 'frontier';
                  setAdviceTokenProfile(val);
                  saveSetting({ aiAdviceTokenProfile: val, aiAskTokenProfile: val });
                }}
              >
                <option value="balanced">Balanced / Modest (Default: 3,500 data / 1,500 output tokens)</option>
                <option value="local">Local / Fast (Compact: 1,800 data / 800 output tokens — fits small context)</option>
                <option value="frontier">Frontier / Deep (Expanded: 7,000 data / 3,000 output tokens — reasoning models)</option>
              </Select>
              <p className="text-xs text-muted-foreground mt-1">
                Controls how much financial context and token history are included. Use &quot;Frontier&quot; for advanced or reasoning models (DeepSeek-R1, Claude 3.5), and &quot;Local&quot; for smaller local models (Ollama 8B).
              </p>
            </div>

            <div className="pt-2 border-t border-border flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={!adviceEnabled || !aiEnabled}
                  onClick={onReviewShared}
                  className="text-xs h-8 flex items-center gap-1.5"
                >
                  <Eye className="w-3.5 h-3.5" />
                  <span>Review what&apos;s shared</span>
                </Button>

                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={!adviceEnabled || !aiEnabled}
                  onClick={async () => {
                    await saveSetting({
                      aiAdviceConsentHost: null,
                      aiAdviceConsentAt: null,
                      aiAskConsentHost: null,
                      aiAskConsentAt: null,
                    });
                    setConsentHost(null);
                    setConsentResetMessage('Consent reset. You will be prompted on next use.');
                    setTimeout(() => setConsentResetMessage(null), 4000);
                  }}
                  className="text-xs h-8 text-muted-foreground hover:text-foreground flex items-center gap-1.5"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Reset consent</span>
                </Button>
              </div>

              {consentHost && (
                <span className="text-[11px] text-muted-foreground">
                  Consented host: <code className="font-mono text-foreground">{consentHost}</code>
                </span>
              )}
            </div>

            {consentResetMessage && (
              <p className="text-xs text-primary animate-in fade-in">{consentResetMessage}</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
