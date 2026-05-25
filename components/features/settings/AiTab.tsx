'use client';

import { useState, useEffect, useCallback } from 'react';
import AiTestProgress from '@/components/features/ai/AiTestProgress';
import { DEFAULT_TEST_PROMPT, TEST_PROMPT_STORAGE_KEY } from '@/lib/ai/prompts';
import { DEFAULT_AI_SYSTEM_PROMPT as DEFAULT_SYSTEM_PROMPT } from '@/config/defaults';

type Provider = {
  id: string;
  name: string;
  endpoint: string;
  model: string;
  apiKey: string;
  isActive: boolean;
};

type AutomationSettings = {
  aiSystemPrompt: string | null;
  aiAutoAnalyze: boolean;
  aiAutoApprove: boolean;
  aiAutoApproveThreshold: number;
  aiBatchSize: number;
  aiAnalysisTimeoutSeconds: number;
  aiActiveProviderId: string | null;
};

export default function AiTab() {
  const [loading, setLoading] = useState(true);
  const [providers, setProviders] = useState<Provider[]>([]);
  const [automation, setAutomation] = useState<AutomationSettings>({
    aiSystemPrompt: null,
    aiAutoAnalyze: false,
    aiAutoApprove: false,
    aiAutoApproveThreshold: 95,
    aiBatchSize: 25,
    aiAnalysisTimeoutSeconds: 600,
    aiActiveProviderId: null,
  });
  const [promptExpanded, setPromptExpanded] = useState(false);
  const [testPromptExpanded, setTestPromptExpanded] = useState(false);
  const [testPrompt, setTestPrompt] = useState<string>(() => {
    try { return localStorage.getItem(TEST_PROMPT_STORAGE_KEY) ?? ''; } catch { return ''; }
  });
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formName, setFormName] = useState('');
  const [formEndpoint, setFormEndpoint] = useState('');
  const [formModel, setFormModel] = useState('');
  const [formApiKey, setFormApiKey] = useState('');
  const [formSetActive, setFormSetActive] = useState(false);
  const [formTesting, setFormTesting] = useState(false);
  const [formTestResult, setFormTestResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [showTestProgress, setShowTestProgress] = useState<string | null>(null);
  const [testProgressFn, setTestProgressFn] = useState<((signal: AbortSignal) => Promise<{ ok: boolean; message: string; response?: string }>) | null>(null);
  const [fetchedModels, setFetchedModels] = useState<string[]>([]);
  const [fetchingModels, setFetchingModels] = useState(false);
  const [modelsFetchError, setModelsFetchError] = useState<string | null>(null);
  const [isCustomModel, setIsCustomModel] = useState(false);

  const loadData = async () => {
    try {
      const [provRes, settingsRes] = await Promise.all([
        fetch('/api/ai/providers', { credentials: 'include' }),
        fetch('/api/user-settings', { credentials: 'include' }),
      ]);
      if (provRes.ok) {
        const data: Provider[] = await provRes.json();
        setProviders(data);
      }
      if (settingsRes.ok) {
        const data = await settingsRes.json();
        setAutomation({
          aiSystemPrompt: data.aiSystemPrompt ?? null,
          aiAutoAnalyze: data.aiAutoAnalyze ?? false,
          aiAutoApprove: data.aiAutoApprove ?? false,
          aiAutoApproveThreshold: data.aiAutoApproveThreshold ?? 95,
          aiBatchSize: data.aiBatchSize ?? 25,
          aiAnalysisTimeoutSeconds: data.aiAnalysisTimeoutSeconds ?? 600,
          aiActiveProviderId: data.aiActiveProviderId ?? null,
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

  // Debounced model fetching
  useEffect(() => {
    if (!showForm || !formEndpoint.trim() || !formEndpoint.startsWith('http')) {
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
            endpoint: formEndpoint.trim(),
            apiKey: formApiKey.trim(),
          }),
        });
        if (res.ok) {
          const data = await res.json();
          const list = data.models || [];
          setFetchedModels(list);
          if (formModel && !list.includes(formModel)) {
            setIsCustomModel(true);
          }
        } else {
          const data = await res.json().catch(() => ({}));
          setModelsFetchError(data.error || 'Failed to fetch models');
        }
      } catch (err) {
        setModelsFetchError('Failed to connect to model endpoint');
      } finally {
        setFetchingModels(false);
      }
    }, 600);

    return () => clearTimeout(timer);
  }, [formEndpoint, formApiKey, showForm]);

  const openAddForm = () => {
    setEditingId(null);
    setFormName('');
    setFormEndpoint('');
    setFormModel('');
    setFormApiKey('');
    setFormSetActive(false);
    setShowForm(true);
    setFetchedModels([]);
    setIsCustomModel(false);
    setModelsFetchError(null);
  };

  const openEditForm = (p: Provider) => {
    setEditingId(p.id);
    setFormName(p.name);
    setFormEndpoint(p.endpoint);
    setFormModel(p.model);
    setFormApiKey(p.apiKey);
    setFormSetActive(false);
    setShowForm(true);
    setFetchedModels([]);
    setIsCustomModel(false);
    setModelsFetchError(null);
  };

  const handleSaveProvider = async () => {
    if (!formName.trim() || !formEndpoint.trim() || !formModel.trim()) return;

    const url = editingId ? `/api/ai/providers/${editingId}` : '/api/ai/providers';
    const method = editingId ? 'PATCH' : 'POST';

    const body: Record<string, unknown> = {
      name: formName.trim(),
      endpoint: formEndpoint.trim(),
      model: formModel.trim(),
      apiKey: formApiKey,
    };
    if (editingId) {
      body.isActive = formSetActive;
    } else {
      body.setActive = formSetActive;
    }

    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(body),
    });

    if (res.ok) {
      setShowForm(false);
      setFormTestResult(null);
      await loadData();
    } else {
      const data = await res.json().catch(() => ({}));
      setFormTestResult({ ok: false, message: data.error || data.message || 'Failed to save provider' });
    }
  };

  const handleFormTest = () => {
    if (!formEndpoint.trim()) return;
    setTestProgressFn(() => async (signal) => {
      setFormTesting(true);
      setFormTestResult(null);
      try {
        let customPrompt: string | undefined;
        try { customPrompt = localStorage.getItem(TEST_PROMPT_STORAGE_KEY) ?? undefined; } catch { /* ignore */ }
        const endpoint = formEndpoint.trim().replace(/\/$/, '');
        const model = formModel.trim();
        const apiKey = formApiKey;
        
        const headers: Record<string, string> = { 'Content-Type': 'application/json' };
        if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`;

        const startTime = Date.now();
        const res = await fetch(`${endpoint}/chat/completions`, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            model,
            messages: [
              { role: 'system', content: 'You are a helpful assistant. Respond directly and quickly. Do NOT output any thinking, reasoning, explanation, or <think> tags.' },
              { role: 'user', content: customPrompt || DEFAULT_TEST_PROMPT }
            ],
            max_tokens: 200,
            chat_id: 'test-connection',
          }),
          signal,
        });
        const elapsed = Date.now() - startTime;
        
        if (!res.ok) {
          const text = await res.text();
          let detail = text.slice(0, 300);
          try { const json = JSON.parse(text); detail = json.error?.message || json.error || json.message || detail; } catch {}
          const result = { ok: false, message: `API returned ${res.status} after ${elapsed}ms: ${detail}`, response: '' };
          setFormTestResult(result);
          return result;
        }

        const data = await res.json();
        const msg = data.choices?.[0]?.message;
        const responseContent = msg?.content || msg?.reasoning || msg?.reasoning_content || '(empty response)';
        const result = { ok: true, message: `Connected to ${model} (${elapsed}ms)`, response: responseContent };
        setFormTestResult(result);
        return result;
      } catch {
        const result = { ok: false, message: 'Failed to reach server' };
        setFormTestResult(result);
        return result;
      } finally {
        setFormTesting(false);
      }
    });
    setShowTestProgress('form');
  };

  const handleDeleteProvider = async (id: string) => {
    if (!confirm('Delete this provider?')) return;
    const res = await fetch(`/api/ai/providers/${id}`, {
      method: 'DELETE',
      credentials: 'include',
    });
    if (res.ok) {
      await loadData();
    } else {
      console.error('Failed to delete provider');
    }
  };

  const handleSetActive = async (id: string) => {
    const res = await fetch(`/api/ai/providers/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ isActive: true }),
    });
    if (res.ok) {
      await loadData();
    } else {
      console.error('Failed to set active provider');
    }
  };

  const handleTestProvider = (provider: Provider) => {
    setTestProgressFn(() => async (signal) => {
      try {
        let customPrompt: string | undefined;
        try { customPrompt = localStorage.getItem(TEST_PROMPT_STORAGE_KEY) ?? undefined; } catch { /* ignore */ }
        const res = await fetch(`/api/ai/providers/${provider.id}/test`, {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: customPrompt ? JSON.stringify({ prompt: customPrompt }) : undefined,
          signal,
        });
        const data = await res.json();
        return { ok: data.ok, message: data.message, response: data.response };
      } catch {
        return { ok: false, message: 'Failed to reach server' };
      }
    });
    setShowTestProgress(provider.id);
  };

  const saveSetting = useCallback(async (partial: Partial<AutomationSettings>) => {
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

  return (
    <div className="space-y-4">
      {/* AI Providers */}
      <div className="p-5 bg-card border border-border rounded-xl">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-base font-semibold text-foreground">AI Providers</h2>
            <p className="text-xs text-muted-foreground">
              Configure OpenAI-compatible API endpoints. Compatible with Ollama, Open WebUI, and any OpenAI-compatible provider.
            </p>
          </div>
          <button
            onClick={openAddForm}
            className="px-2 py-1.5 text-sm font-medium text-primary-foreground bg-primary rounded-lg hover:opacity-90 transition-all whitespace-nowrap"
          >
            + Add Provider
          </button>
        </div>

        {providers.length === 0 && (
          <div className="text-sm text-muted-foreground py-4 text-center border border-dashed border-border rounded-lg">
            No providers configured yet. Add one to get started.
          </div>
        )}

        <div className="space-y-3">
          {providers.map((p) => (
            <div key={p.id} className={`relative border rounded-xl p-4 transition-all ${p.isActive ? 'border-primary/40 bg-primary/[0.03]' : 'border-border'}`}>
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-sm font-semibold text-foreground">{p.name}</span>
                    {p.isActive && (
                      <span className="text-[10px] font-medium text-primary-foreground bg-primary px-1.5 py-0.5 rounded-full">Active</span>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground space-y-0.5">
                    <div><span className="font-mono">{p.endpoint}</span> / <span className="font-mono">{p.model}</span></div>
                    <div>API key: {p.apiKey ? '••••••••' : '(none)'}</div>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  {!p.isActive && (
                    <button
                      onClick={() => handleSetActive(p.id)}
                      className="px-2.5 py-1 text-[11px] font-medium text-foreground bg-muted hover:bg-accent border border-border rounded-lg transition-colors"
                      title="Set as active provider"
                    >
                      Activate
                    </button>
                  )}
                  <button
                    onClick={() => handleTestProvider(p)}
                    className="px-2.5 py-1 text-[11px] font-medium text-foreground bg-muted hover:bg-accent border border-border rounded-lg transition-colors"
                  >
                    Test
                  </button>
                  <button
                    onClick={() => openEditForm(p)}
                    className="px-2.5 py-1 text-[11px] font-medium text-foreground bg-muted hover:bg-accent border border-border rounded-lg transition-colors"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => handleDeleteProvider(p.id)}
                    className="px-2.5 py-1 text-[11px] font-medium text-destructive bg-destructive/10 hover:bg-destructive/20 rounded-lg transition-colors"
                  >
                    Delete
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Add/Edit Provider Form */}
        {showForm && (
          <div className="mt-4 p-4 border border-border rounded-xl bg-muted/30 space-y-3">
            <h3 className="text-sm font-semibold text-foreground">{editingId ? 'Edit Provider' : 'Add Provider'}</h3>
            <div>
              <label className="block text-xs font-medium text-foreground mb-1">Name</label>
              <input
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                className="w-full px-3 py-2 bg-background border border-input rounded-lg text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                placeholder="My Ollama"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-foreground mb-1">API Key</label>
              <input
                type="password"
                value={formApiKey}
                onChange={(e) => setFormApiKey(e.target.value)}
                className="w-full px-3 py-2 bg-background border border-input rounded-lg text-foreground text-sm font-mono focus:outline-none focus:ring-2 focus:ring-ring"
                placeholder="sk-... (leave blank if not required)"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-foreground mb-1">Endpoint URL</label>
              <input
                value={formEndpoint}
                onChange={(e) => setFormEndpoint(e.target.value)}
                className="w-full px-3 py-2 bg-background border border-input rounded-lg text-foreground text-sm font-mono focus:outline-none focus:ring-2 focus:ring-ring"
                placeholder="http://localhost:11434/v1"
              />
            </div>
            <div>
              <div className="flex items-center justify-between mb-1">
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
                <select
                  value={formModel}
                  onChange={(e) => setFormModel(e.target.value)}
                  className="w-full px-3 py-2 bg-background border border-input rounded-lg text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  <option value="" disabled>Select a model...</option>
                  {fetchedModels.map((modelName) => (
                    <option key={modelName} value={modelName}>
                      {modelName}
                    </option>
                  ))}
                </select>
              ) : (
                <div className="space-y-1">
                  <input
                    value={formModel}
                    onChange={(e) => setFormModel(e.target.value)}
                    className="w-full px-3 py-2 bg-background border border-input rounded-lg text-foreground text-sm font-mono focus:outline-none focus:ring-2 focus:ring-ring"
                    placeholder="e.g. gpt-4o, llama3"
                  />
                  {modelsFetchError && (
                    <p className="text-[10px] text-destructive font-medium">
                      Could not fetch models: {modelsFetchError} (entering manually)
                    </p>
                  )}
                  {fetchedModels.length === 0 && !fetchingModels && !modelsFetchError && formEndpoint.trim() && (
                    <p className="text-[10px] text-muted-foreground">
                      No models found or endpoint not queried. Enter model manually.
                    </p>
                  )}
                </div>
              )}
            </div>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={formSetActive}
                onChange={(e) => setFormSetActive(e.target.checked)}
                className="rounded border-border accent-primary"
              />
              <span className="text-xs text-foreground">Set as active provider</span>
            </label>
            <div className="flex items-center gap-2">
              <button
                onClick={handleFormTest}
                disabled={formTesting || !formEndpoint.trim()}
                className="px-3 py-1.5 text-xs font-medium text-foreground bg-muted hover:bg-accent border border-border rounded-lg transition-colors disabled:opacity-50"
              >
                {formTesting ? 'Testing...' : 'Test Connection'}
              </button>
              <button
                onClick={handleSaveProvider}
                disabled={!formName.trim() || !formEndpoint.trim() || !formModel.trim()}
                className="px-3 py-1.5 text-xs font-medium text-primary-foreground bg-primary rounded-lg hover:opacity-90 transition-all disabled:opacity-50"
              >
                {editingId ? 'Update' : 'Add'}
              </button>
              <button
                onClick={() => setShowForm(false)}
                className="px-3 py-1.5 text-xs font-medium text-foreground bg-muted hover:bg-accent rounded-lg transition-colors"
              >
                Cancel
              </button>
            </div>
            {formTestResult && (
              <div className={`text-xs px-2 py-1 rounded-lg ${formTestResult.ok ? 'bg-status-positive/20 text-status-positive' : 'bg-destructive/20 text-destructive'}`}>
                {formTestResult.message}
              </div>
            )}
          </div>
        )}
      </div>

      {/* System Prompt Editor */}
      <div className="p-5 bg-card border border-border rounded-xl">
        <div className="flex items-start justify-between mb-1">
          <div>
            <h2 className="text-base font-semibold text-foreground">System Prompt</h2>
            <p className="text-xs text-muted-foreground">
              Customize the AI system prompt. Changes take effect on the next analysis run.
            </p>
          </div>
          <button
            onClick={() => setPromptExpanded(!promptExpanded)}
            className="px-3 py-1 text-xs font-medium text-muted-foreground hover:text-foreground bg-muted hover:bg-accent rounded-lg transition-colors"
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
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-muted-foreground">
                {automation.aiSystemPrompt ? 'Custom prompt active' : 'Using default prompt'}
              </span>
              <button
                onClick={handleResetPrompt}
                className="px-2.5 py-1 text-[11px] font-medium text-destructive bg-destructive/10 hover:bg-destructive/20 rounded-lg transition-colors"
              >
                Reset to Default
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Test Prompt Editor */}
      <div className="p-5 bg-card border border-border rounded-xl">
        <div className="flex items-start justify-between mb-1">
          <div>
            <h2 className="text-base font-semibold text-foreground">Test Prompt</h2>
            <p className="text-xs text-muted-foreground">
              Customize the message sent when testing a provider connection. A short prompt speeds up the test.
            </p>
          </div>
          <button
            onClick={() => setTestPromptExpanded(!testPromptExpanded)}
            className="px-3 py-1 text-xs font-medium text-muted-foreground hover:text-foreground bg-muted hover:bg-accent rounded-lg transition-colors"
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
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-muted-foreground">
                {testPrompt ? 'Custom test prompt active' : 'Using default test prompt'}
              </span>
              <button
                onClick={() => {
                  setTestPrompt('');
                  try { localStorage.removeItem(TEST_PROMPT_STORAGE_KEY); } catch { /* ignore */ }
                }}
                className="px-2.5 py-1 text-[11px] font-medium text-destructive bg-destructive/10 hover:bg-destructive/20 rounded-lg transition-colors"
              >
                Reset to Default
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="p-5 bg-card border border-border rounded-xl">
        <h2 className="text-base font-semibold text-foreground mb-1">Automation</h2>
        <p className="text-xs text-muted-foreground mb-4">
          Control how and when AI analysis runs.
        </p>

        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
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

          <div className="flex items-center justify-between">
            <div>
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
            <input
              type="range"
              min={0}
              max={100}
              value={automation.aiAutoApproveThreshold}
              onChange={(e) => setAutomation((s) => ({ ...s, aiAutoApproveThreshold: parseInt(e.target.value) }))}
              onMouseUp={(e) => saveSetting({ aiAutoApproveThreshold: parseInt((e.target as HTMLInputElement).value) })}
              onTouchEnd={(e) => saveSetting({ aiAutoApproveThreshold: parseInt((e.target as HTMLInputElement).value) })}
              className="w-full accent-primary"
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
            <p className="text-xs text-muted-foreground mt-1">Number of transactions to analyze per API call</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-foreground mb-1">Analysis timeout</label>
            <input
              type="number"
              min={30}
              max={600}
              step={30}
              value={automation.aiAnalysisTimeoutSeconds}
              onChange={(e) => setAutomation((s) => ({ ...s, aiAnalysisTimeoutSeconds: parseInt(e.target.value) || 600 }))}
              onBlur={(e) => saveSetting({ aiAnalysisTimeoutSeconds: parseInt(e.target.value) || 600 })}
              className="w-24 px-3 py-2 bg-background border border-input rounded-lg text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
            <p className="text-xs text-muted-foreground mt-1">Seconds before analysis auto-cancels (30–600s)</p>
          </div>
        </div>
      </div>

      <p className="text-[10px] text-muted-foreground text-right">Settings are saved automatically.</p>

      {showTestProgress && testProgressFn && (
        <AiTestProgress
          title={showTestProgress === 'form' ? 'Test Connection' : `Test: ${providers.find(p => p.id === showTestProgress)?.name ?? 'Provider'}`}
          testFn={testProgressFn}
          onClose={() => {
            setShowTestProgress(null);
            setTestProgressFn(null);
          }}
        />
      )}
    </div>
  );
}
