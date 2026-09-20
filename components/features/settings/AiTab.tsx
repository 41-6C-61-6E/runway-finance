'use client';

import { useState, useEffect, useCallback } from 'react';
import { DEFAULT_TEST_PROMPT, TEST_PROMPT_STORAGE_KEY } from '@/lib/ai/prompts';
import { DEFAULT_AI_SYSTEM_PROMPT as DEFAULT_SYSTEM_PROMPT } from '@/config/defaults';
import { Slider } from '@/components/ui/slider';
import { SectionHeading } from '@/components/ui/section-heading';
import { Select } from '@/components/ui/select';

type AutomationSettings = {
  aiSystemPrompt: string | null;
  aiAutoAnalyze: boolean;
  aiAutoApprove: boolean;
  aiAutoApproveThreshold: number;
  aiBatchSize: number;
  aiAnalysisTimeoutSeconds: number;
};

function endpointHint(endpoint: string): string | null {
  const trimmed = endpoint.trim().replace(/\/+$/, '');
  try {
    const url = new URL(trimmed);
    const path = url.pathname.replace(/\/+$/, '');
    if (/(^|\/)api\/v1$/.test(path)) {
      return `For Open WebUI use ${url.origin}${path.replace(/\/v1$/, '')} (remove the trailing /v1). Tests POST {endpoint}/chat/completions.`;
    }
    if (path === '/v1') {
      return 'For Open WebUI use https://your-host/api instead of a /v1-only path.';
    }
  } catch {
    /* not a valid URL yet */
  }
  return null;
}

export default function AiTab() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveResult, setSaveResult] = useState<{ ok: boolean; message: string } | null>(null);

  // Single provider form state
  const [endpoint, setEndpoint] = useState('');
  const [model, setModel] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [hasApiKey, setHasApiKey] = useState(false);
  const [managed, setManaged] = useState(false);

  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string; response?: string } | null>(null);

  const [fetchedModels, setFetchedModels] = useState<string[]>([]);
  const [fetchingModels, setFetchingModels] = useState(false);
  const [modelsFetchError, setModelsFetchError] = useState<string | null>(null);
  const [isCustomModel, setIsCustomModel] = useState(false);

  // Manual analysis run state (mirrors GET /api/ai/status)
  const [analysisStatus, setAnalysisStatus] = useState<{
    status: string;
    processedCount?: number;
    totalCount?: number;
    error?: string | null;
  }>({ status: 'idle' });
  const [analysisBusy, setAnalysisBusy] = useState(false);

  const refreshAnalysisStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/ai/status', { credentials: 'include' });
      if (res.ok) {
        setAnalysisStatus(await res.json());
      }
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    refreshAnalysisStatus();
    const timer = setInterval(refreshAnalysisStatus, 5000);
    return () => clearInterval(timer);
  }, [refreshAnalysisStatus]);

  const handleRunAnalysis = async () => {
    if (analysisBusy) return;
    setAnalysisBusy(true);
    try {
      const res = await fetch('/api/ai/analyze', { method: 'POST', credentials: 'include' });
      if (res.status === 409) {
        await refreshAnalysisStatus();
      } else if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setAnalysisStatus({ status: 'error', error: data.error || 'Failed to start analysis' });
      } else {
        await refreshAnalysisStatus();
      }
    } catch {
      setAnalysisStatus({ status: 'error', error: 'Failed to reach server' });
    } finally {
      setAnalysisBusy(false);
    }
  };

  const handleCancelAnalysis = async () => {
    try {
      await fetch('/api/ai/cancel', { method: 'POST', credentials: 'include' });
    } catch { /* ignore */ }
    await refreshAnalysisStatus();
  };

  const [automation, setAutomation] = useState<AutomationSettings>({
    aiSystemPrompt: null,
    aiAutoAnalyze: false,
    aiAutoApprove: false,
    aiAutoApproveThreshold: 95,
    aiBatchSize: 25,
    aiAnalysisTimeoutSeconds: 3600,
  });
  const [promptExpanded, setPromptExpanded] = useState(false);
  const [testPromptExpanded, setTestPromptExpanded] = useState(false);
  const [testPrompt, setTestPrompt] = useState<string>('');

  useEffect(() => {
    try {
      const stored = localStorage.getItem(TEST_PROMPT_STORAGE_KEY);
      if (stored) {
        setTestPrompt(stored);
      }
    } catch { /* ignore */ }
  }, []);

  const loadData = async () => {
    try {
      const [provRes, settingsRes] = await Promise.all([
        fetch('/api/ai/provider', { credentials: 'include' }),
        fetch('/api/user-settings', { credentials: 'include' }),
      ]);
      if (provRes.ok) {
        const data = await provRes.json();
        // Support the legacy array shape just in case an old backend responds.
        const single = Array.isArray(data)
          ? (data.find((p: any) => p.isActive) ?? data[0] ?? null)
          : data;
        if (single) {
          setEndpoint(single.endpoint ?? '');
          setModel(single.model ?? '');
          setHasApiKey(!!single.hasApiKey);
          setManaged(!!single.managed);
          if (single.model) {
            setIsCustomModel(false);
          }
        } else if (data?.managed) {
          setManaged(true);
        }
      }
      if (settingsRes.ok) {
        const data = await settingsRes.json();
        setAutomation({
          aiSystemPrompt: data.aiSystemPrompt ?? null,
          aiAutoAnalyze: data.aiAutoAnalyze ?? false,
          aiAutoApprove: data.aiAutoApprove ?? false,
          aiAutoApproveThreshold: data.aiAutoApproveThreshold ?? 95,
          aiBatchSize: data.aiBatchSize ?? 25,
          aiAnalysisTimeoutSeconds: data.aiAnalysisTimeoutSeconds ?? 3600,
        });
      }
    } catch {
      console.error('Failed to load AI settings');
    }
    setLoading(false);
  };

  useEffect(() => {
    loadData();
  }, []);

  // Debounced model fetching — blank key falls back to the saved key server-side.
  useEffect(() => {
    if (!endpoint.trim() || !endpoint.startsWith('http')) {
      setFetchedModels([]);
      setModelsFetchError(null);
      return;
    }

    const timer = setTimeout(async () => {
      setFetchingModels(true);
      setModelsFetchError(null);
      try {
        const res = await fetch('/api/ai/models', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            endpoint: endpoint.trim(),
            ...(apiKey.trim() ? { apiKey: apiKey.trim() } : {}),
          }),
        });
        if (res.ok) {
          const data = await res.json();
          const list = data.models || [];
          setFetchedModels(list);
          if (model && list.length > 0 && !list.includes(model)) {
            setIsCustomModel(true);
          } else if (list.length > 0 && list.includes(model)) {
            setIsCustomModel(false);
          }
        } else {
          const data = await res.json().catch(() => ({}));
          setModelsFetchError(data.error || 'Failed to fetch models');
        }
      } catch {
        setModelsFetchError('Failed to connect to model endpoint');
      } finally {
        setFetchingModels(false);
      }
    }, 600);

    return () => clearTimeout(timer);
  }, [endpoint, apiKey]);

  const handleSave = async () => {
    if (!endpoint.trim() || !model.trim()) return;
    setSaving(true);
    setSaveResult(null);
    try {
      const res = await fetch('/api/ai/provider', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          endpoint: endpoint.trim(),
          model: model.trim(),
          ...(apiKey.trim() ? { apiKey: apiKey.trim() } : {}),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setHasApiKey(!!data.hasApiKey || (hasApiKey && !apiKey.trim()));
        setApiKey('');
        setSaveResult({ ok: true, message: 'AI provider saved.' });
      } else {
        setSaveResult({ ok: false, message: data.error || 'Failed to save provider' });
      }
    } catch {
      setSaveResult({ ok: false, message: 'Failed to save provider' });
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async () => {
    if (!endpoint.trim() || !model.trim() || testing) return;
    setTesting(true);
    setTestResult(null);
    try {
      let customPrompt: string | undefined;
      try { customPrompt = localStorage.getItem(TEST_PROMPT_STORAGE_KEY) ?? undefined; } catch { /* ignore */ }

      const res = await fetch('/api/ai/provider/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          endpoint: endpoint.trim(),
          model: model.trim(),
          ...(apiKey.trim() ? { apiKey: apiKey.trim() } : {}),
          ...(customPrompt ? { prompt: customPrompt } : {}),
        }),
        signal: AbortSignal.timeout(60_000),
      });
      const data = await res.json().catch(() => ({ ok: false, message: 'Failed to parse response' }));
      setTestResult({
        ok: !!data.ok,
        message: data.message || (data.ok ? 'Connection successful' : 'Connection failed'),
        response: data.response,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to reach server';
      setTestResult({
        ok: false,
        message: /abort|timeout/i.test(message)
          ? 'Request timed out. The model may still be loading — wait a moment and try again.'
          : 'Failed to reach server',
      });
    } finally {
      setTesting(false);
    }
  };

  const saveSetting = useCallback(async (partial: Record<string, unknown>) => {
    try {
      await fetch('/api/user-settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(partial),
      });
    } catch { /* silent */ }
  }, []);

  const handleResetPrompt = () => {
    setAutomation((s) => ({ ...s, aiSystemPrompt: null }));
    saveSetting({ aiSystemPrompt: null });
  };

  if (loading) {
    return <div className="text-muted-foreground py-4">Loading AI settings...</div>;
  }

  const hint = endpointHint(endpoint);
  const chatUrl = endpoint.trim() ? `${endpoint.trim().replace(/\/+$/, '')}/chat/completions` : null;

  return (
    <div className="space-y-4">
      {/* AI Provider (single) */}
      <div className="p-5 bg-card border border-border rounded-xl">
        <SectionHeading>AI Provider</SectionHeading>
        <p className="text-xs text-muted-foreground mb-4">
          Connect one OpenAI-compatible endpoint (OpenAI, Ollama, Open WebUI). For Open WebUI use the <span className="font-mono">…/api</span> base, not <span className="font-mono">…/api/v1</span>.
        </p>
          {managed && (
          <p className="text-[11px] font-medium text-amber-600 dark:text-amber-400 bg-amber-500/10 border border-amber-500/30 rounded-lg px-3 py-2 mb-4">
            Managed by the deployment: endpoint, model, and API key come from the server’s env vars and override any changes on save.
          </p>
        )}

        <div className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-foreground mb-1.5">Endpoint URL</label>
            <input
              value={endpoint}
              onChange={(e) => setEndpoint(e.target.value)}
              className="w-full px-3 py-2 bg-background border border-input rounded-lg text-foreground text-sm font-mono focus:outline-none focus:ring-2 focus:ring-ring"
              placeholder="https://antithropic.app/api"
            />
            {chatUrl && (
              <p className="text-[10px] text-muted-foreground mt-1 font-mono">
                Will test POST {chatUrl}
              </p>
            )}
            {hint && (
              <p className="text-[11px] text-amber-600 dark:text-amber-400 font-medium mt-1">
                {hint}
              </p>
            )}
          </div>

          <div>
            <label className="block text-xs font-medium text-foreground mb-1.5">API Key</label>
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              className="w-full px-3 py-2 bg-background border border-input rounded-lg text-foreground text-sm font-mono focus:outline-none focus:ring-2 focus:ring-ring"
              placeholder={hasApiKey ? '•••••••• (saved — leave blank to keep)' : 'sk-... (leave blank if not required)'}
            />
            {hasApiKey && !apiKey && (
              <p className="text-[10px] text-muted-foreground mt-1">A key is saved. Enter a new one only to replace it.</p>
            )}
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="block text-xs font-medium text-foreground">Model Name</label>
              {fetchingModels && (
                <span className="text-[10px] text-primary animate-pulse flex items-center gap-1">
                  <svg className="animate-spin h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Fetching models...
                </span>
              )}
              {!fetchingModels && fetchedModels.length > 0 && (
                <button
                  type="button"
                  onClick={() => setIsCustomModel(!isCustomModel)}
                  className="text-[10px] text-primary hover:underline font-medium"
                >
                  {isCustomModel ? 'Select from list' : '✏️ Enter custom name'}
                </button>
              )}
            </div>

            {(!isCustomModel && fetchedModels.length > 0) ? (
              <Select
                value={model}
                onChange={(e) => setModel(e.target.value)}
              >
                <option value="" disabled>Select a model...</option>
                {fetchedModels.map((modelName) => (
                  <option key={modelName} value={modelName}>
                    {modelName}
                  </option>
                ))}
              </Select>
            ) : (
              <div className="space-y-1">
                <input
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                  className="w-full px-3 py-2 bg-background border border-input rounded-lg text-foreground text-sm font-mono focus:outline-none focus:ring-2 focus:ring-ring"
                  placeholder="e.g. gpt-4o, llama3"
                />
                {modelsFetchError && (
                  <p className="text-[10px] text-destructive font-medium">
                    Could not fetch models: {modelsFetchError} (entering manually)
                  </p>
                )}
                {fetchedModels.length === 0 && !fetchingModels && !modelsFetchError && endpoint.trim() && (
                  <p className="text-[10px] text-muted-foreground">
                    No models found or endpoint not queried. Enter model manually.
                  </p>
                )}
              </div>
            )}
          </div>

          <p className="text-[10px] text-muted-foreground mt-0.5">
            The app automatically requests constrained JSON first and falls back to plain mode when the provider rejects it — no setting needed.
          </p>

          {saveResult && (
            <div className={`text-xs px-3 py-2 rounded-lg ${saveResult.ok ? 'bg-status-positive/20 text-status-positive' : 'bg-destructive/20 text-destructive'}`}>
              {saveResult.message}
            </div>
          )}

          {testResult && (
            <div className={`text-xs px-3 py-2 rounded-lg ${testResult.ok ? 'bg-status-positive/20 text-status-positive' : 'bg-destructive/20 text-destructive'}`}>
              <p className="font-medium">{testResult.message}</p>
              {testResult.ok && testResult.response && (
                <p className="mt-1 font-mono whitespace-pre-wrap opacity-80">{testResult.response}</p>
              )}
            </div>
          )}

          <div className="flex flex-col sm:flex-row gap-2 pt-1">
            <button
              type="button"
              onClick={handleTest}
              disabled={testing || !endpoint.trim() || !model.trim()}
              className="px-4 py-2 text-xs font-medium text-foreground bg-muted hover:bg-accent border border-border rounded-lg transition-colors disabled:opacity-50"
            >
              {testing ? 'Testing… (up to 60s)' : 'Test Connection'}
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving || !endpoint.trim() || !model.trim()}
              className="px-4 py-2 text-xs font-medium text-primary-foreground bg-primary rounded-lg hover:opacity-90 transition-all disabled:opacity-50"
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>
      </div>

      {/* Manual Analysis */}
      <div className="p-5 bg-card border border-border rounded-xl">
        <SectionHeading>AI Analysis</SectionHeading>
        <p className="text-xs text-muted-foreground mb-4">
          Run categorization on all uncategorized transactions now. Progress also appears on the Transactions page; results land in Transactions → AI Suggestions.
        </p>

        {analysisStatus.status === 'running' ? (
          <div className="space-y-3">
            <p className="text-xs font-medium text-foreground">
              Analyzing… {(analysisStatus.processedCount ?? 0)}{(analysisStatus.totalCount ?? 0) > 0 ? `/${analysisStatus.totalCount}` : ''} transactions
            </p>
            <div className="flex flex-col sm:flex-row gap-2">
              <a
                href="/transactions?aiSuggestions=true"
                className="px-4 py-2 text-xs font-medium text-center text-primary-foreground bg-primary rounded-lg hover:opacity-90 transition-all"
              >
                View Live Progress
              </a>
              <button
                type="button"
                onClick={handleCancelAnalysis}
                className="px-4 py-2 text-xs font-medium text-destructive bg-destructive/10 hover:bg-destructive/20 rounded-lg transition-colors"
              >
                Cancel Analysis
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            {analysisStatus.status === 'error' && analysisStatus.error && (
              <div className="text-xs px-3 py-2 rounded-lg bg-destructive/20 text-destructive">
                Last run failed: {analysisStatus.error}
              </div>
            )}
            <div className="flex flex-col sm:flex-row sm:items-center gap-2">
              <button
                type="button"
                onClick={handleRunAnalysis}
                disabled={analysisBusy || !endpoint.trim() || !model.trim()}
                className="px-4 py-2 text-xs font-medium text-primary-foreground bg-primary rounded-lg hover:opacity-90 transition-all disabled:opacity-50"
              >
                {analysisBusy ? 'Starting…' : 'Run Analysis Now'}
              </button>
              <span className="text-[11px] text-muted-foreground">
                {automation.aiAutoAnalyze
                  ? 'Auto-analyze after sync is on.'
                  : 'Tip: enable “Auto-analyze after sync” below to run this automatically.'}
              </span>
            </div>
          </div>
        )}
      </div>

      {/* System Prompt Editor */}
      <div className="p-5 bg-card border border-border rounded-xl">
        <div className="flex items-start justify-between gap-2 mb-1">
          <div className="flex-1 min-w-0">
            <SectionHeading>System Prompt</SectionHeading>
            <p className="text-xs text-muted-foreground">
              Customize the AI system prompt. Changes take effect on the next analysis run.
            </p>
          </div>
          <button
            onClick={() => setPromptExpanded(!promptExpanded)}
            className="px-3 py-1 text-xs font-medium text-muted-foreground hover:text-foreground bg-muted hover:bg-accent rounded-lg transition-colors shrink-0"
          >
            {promptExpanded ? 'Collapse' : 'Edit'}
          </button>
        </div>

        {promptExpanded && (
          <div className="mt-3 space-y-2">
            <textarea
              value={automation.aiSystemPrompt ?? DEFAULT_SYSTEM_PROMPT}
              onChange={(e) => setAutomation((s) => ({ ...s, aiSystemPrompt: e.target.value }))}
              onBlur={(e) => {
                const v = e.target.value;
                if (v !== DEFAULT_SYSTEM_PROMPT) {
                  saveSetting({ aiSystemPrompt: v === DEFAULT_SYSTEM_PROMPT ? null : v });
                }
              }}
              className="w-full h-80 px-3 py-2 bg-background border border-input rounded-lg text-foreground text-xs font-mono focus:outline-none focus:ring-2 focus:ring-ring resize-y"
              placeholder="Enter custom system prompt..."
            />
            <div className="flex items-center justify-between gap-2">
              <span className="text-[10px] text-muted-foreground flex-1 min-w-0">
                {automation.aiSystemPrompt ? 'Custom prompt active' : 'Using default prompt'}
              </span>
              <button
                onClick={handleResetPrompt}
                className="px-2.5 py-1 text-[11px] font-medium text-destructive bg-destructive/10 hover:bg-destructive/20 rounded-lg transition-colors shrink-0"
              >
                Reset to Default
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Test Prompt Editor */}
      <div className="p-5 bg-card border border-border rounded-xl">
        <div className="flex items-start justify-between gap-2 mb-1">
          <div className="flex-1 min-w-0">
            <SectionHeading>Test Prompt</SectionHeading>
            <p className="text-xs text-muted-foreground">
              Customize the message sent when testing the provider connection. A short prompt speeds up the test. The default prompt asks for a haiku in JSON, mimicking real categorization — the test passes only if the model returns valid JSON (custom prompts skip the JSON check).
            </p>
          </div>
          <button
            onClick={() => setTestPromptExpanded(!testPromptExpanded)}
            className="px-3 py-1 text-xs font-medium text-muted-foreground hover:text-foreground bg-muted hover:bg-accent rounded-lg transition-colors shrink-0"
          >
            {testPromptExpanded ? 'Collapse' : 'Edit'}
          </button>
        </div>

        {testPromptExpanded && (
          <div className="mt-3 space-y-2">
            <textarea
              value={testPrompt}
              onChange={(e) => {
                setTestPrompt(e.target.value);
                try { localStorage.setItem(TEST_PROMPT_STORAGE_KEY, e.target.value); } catch { /* ignore */ }
              }}
              className="w-full h-20 px-3 py-2 bg-background border border-input rounded-lg text-foreground text-xs font-mono focus:outline-none focus:ring-2 focus:ring-ring resize-y"
              placeholder={DEFAULT_TEST_PROMPT}
            />
            <div className="flex items-center justify-between gap-2">
              <span className="text-[10px] text-muted-foreground flex-1 min-w-0">
                {testPrompt ? 'Custom test prompt active' : 'Using default test prompt'}
              </span>
              <button
                onClick={() => {
                  setTestPrompt('');
                  try { localStorage.removeItem(TEST_PROMPT_STORAGE_KEY); } catch { /* ignore */ }
                }}
                className="px-2.5 py-1 text-[11px] font-medium text-destructive bg-destructive/10 hover:bg-destructive/20 rounded-lg transition-colors shrink-0"
              >
                Reset to Default
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="p-5 bg-card border border-border rounded-xl">
        <SectionHeading className="mb-1">Automation</SectionHeading>
        <p className="text-xs text-muted-foreground mb-4">
          Control how and when AI analysis runs.
        </p>

        <div className="space-y-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex-1 min-w-0">
              <span className="text-sm text-foreground">Auto-analyze after sync</span>
              <p className="text-xs text-muted-foreground">Run AI analysis automatically after each SimpleFIN sync</p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={automation.aiAutoAnalyze}
                onChange={(e) => {
                  const v = e.target.checked;
                  setAutomation((s) => ({ ...s, aiAutoAnalyze: v }));
                  saveSetting({ aiAutoAnalyze: v });
                }}
                className="sr-only peer"
              />
              <div className="w-9 h-5 bg-muted rounded-full peer peer-checked:bg-primary after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-card after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:after:translate-x-full"></div>
            </label>
          </div>

          <div className="flex items-center justify-between gap-3">
            <div className="flex-1 min-w-0">
              <span className="text-sm text-foreground">Auto-approve suggestions</span>
              <p className="text-xs text-muted-foreground">Automatically approve suggestions above the confidence threshold</p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={automation.aiAutoApprove}
                onChange={(e) => {
                  const v = e.target.checked;
                  setAutomation((s) => ({ ...s, aiAutoApprove: v }));
                  saveSetting({ aiAutoApprove: v });
                }}
                className="sr-only peer"
              />
              <div className="w-9 h-5 bg-muted rounded-full peer peer-checked:bg-primary after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-card after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:after:translate-x-full"></div>
            </label>
          </div>

          <div>
            <label className="block text-sm font-medium text-foreground mb-1">
              Auto-approve confidence threshold: {automation.aiAutoApproveThreshold}%
            </label>
            <Slider
              min={0}
              max={100}
              value={automation.aiAutoApproveThreshold}
              onChange={(val) => setAutomation((s) => ({ ...s, aiAutoApproveThreshold: Math.round(val) }))}
              onRelease={(val) => saveSetting({ aiAutoApproveThreshold: Math.round(val) })}
              ariaLabel="Auto-approve confidence threshold"
            />
            <div className="flex justify-between text-[10px] text-muted-foreground mt-0.5">
              <span>0% — All suggestions require review</span>
              <span>100% — Never auto-approve</span>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-foreground mb-1">Batch size</label>
            <input
              type="number"
              min={1}
              max={200}
              value={automation.aiBatchSize}
              onChange={(e) => setAutomation((s) => ({ ...s, aiBatchSize: parseInt(e.target.value) || 25 }))}
              onBlur={(e) => saveSetting({ aiBatchSize: parseInt(e.target.value) || 25 })}
              className="w-24 px-3 py-2 bg-background border border-input rounded-lg text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
            <p className="text-xs text-muted-foreground mt-1">Number of transactions to analyze per API call. Slow models (~20 tok/s) work best at 5–10 for frequent progress updates.</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-foreground mb-1">Analysis timeout</label>
            <input
              type="number"
              min={60}
              max={3600}
              step={60}
              value={automation.aiAnalysisTimeoutSeconds}
              onChange={(e) => setAutomation((s) => ({ ...s, aiAnalysisTimeoutSeconds: parseInt(e.target.value) || 3600 }))}
              onBlur={(e) => saveSetting({ aiAnalysisTimeoutSeconds: parseInt(e.target.value) || 3600 })}
              className="w-24 px-3 py-2 bg-background border border-input rounded-lg text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
            <p className="text-xs text-muted-foreground mt-1">Seconds before analysis auto-cancels (60–3600s). Slow models need 1500s+ for large backlogs.</p>
          </div>
        </div>
      </div>

      <p className="text-[10px] text-muted-foreground text-right">Settings are saved automatically.</p>
    </div>
  );
}
