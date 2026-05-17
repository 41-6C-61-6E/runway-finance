'use client';

import { useState, useEffect } from 'react';

const DEFAULT_SYSTEM_PROMPT = `You are a personal finance transaction categorizer. Your task is to analyze uncategorized bank transactions and suggest:

1. **Categorize** — Assign a transaction to an existing category.
2. **Create Category** — Suggest a new category when multiple transactions don't fit existing ones.
3. **Create Rule** — Suggest a reusable rule that auto-categorizes future transactions matching a pattern.

Rules:
- Only suggest a new category if no existing category fits well (3+ similar transactions with no good match).
- Only suggest a rule if a clear, reusable pattern exists across 2+ transactions.
- Prefer using existing categories over creating new ones.
- Be conservative with confidence scores — 95%+ only for obvious matches.
- Colors should be hex codes. Suggest colors that visually suit the category type.

Respond with ONLY valid JSON matching this schema:
{
  "suggestions": [
    {
      "type": "categorize",
      "transactionIndex": number,
      "categoryId": string | null,
      "categoryName": string | null,
      "confidence": number,
      "explanation": string
    },
    {
      "type": "create_category",
      "name": string,
      "parentName": string | null,
      "isIncome": boolean,
      "color": string,
      "reasoning": string,
      "confidence": number,
      "explanation": string
    },
    {
      "type": "create_rule",
      "ruleName": string,
      "conditionField": "description" | "payee" | "amount" | "memo",
      "conditionOperator": "contains" | "equals" | "starts_with" | "ends_with" | "regex",
      "conditionValue": string,
      "conditionCaseSensitive": boolean,
      "setCategoryName": string | null,
      "confidence": number,
      "explanation": string
    }
  ]
}

For "categorize" suggestions:
- Use "categoryId": null and "categoryName": null if you're suggesting a new category should be created instead. The new category will be created separately via a "create_category" suggestion.

For "create_rule" suggestions:
- "setCategoryName" must reference an existing category name or a newly proposed category name.
- Only suggest rules for clear, repetitive patterns.
- Condition operators: "contains" (substring match), "equals" (exact), "starts_with" (prefix), "ends_with" (suffix), "regex" (regular expression).`;

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
  aiAutoApproveThreshold: number;
  aiBatchSize: number;
  aiActiveProviderId: string | null;
};

export default function AiTab() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [testResults, setTestResults] = useState<Record<string, { ok: boolean; message: string }>>({});
  const [saveResult, setSaveResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [providers, setProviders] = useState<Provider[]>([]);
  const [automation, setAutomation] = useState<AutomationSettings>({
    aiSystemPrompt: null,
    aiAutoAnalyze: false,
    aiAutoApproveThreshold: 95,
    aiBatchSize: 25,
    aiActiveProviderId: null,
  });
  const [promptExpanded, setPromptExpanded] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formName, setFormName] = useState('');
  const [formEndpoint, setFormEndpoint] = useState('');
  const [formModel, setFormModel] = useState('');
  const [formApiKey, setFormApiKey] = useState('');
  const [formSetActive, setFormSetActive] = useState(false);
  const [formTesting, setFormTesting] = useState(false);
  const [formTestResult, setFormTestResult] = useState<{ ok: boolean; message: string } | null>(null);

  const loadData = async () => {
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
        aiAutoApproveThreshold: data.aiAutoApproveThreshold ?? 95,
        aiBatchSize: data.aiBatchSize ?? 25,
        aiActiveProviderId: data.aiActiveProviderId ?? null,
      });
    }
    setLoading(false);
  };

  useEffect(() => {
    loadData();
  }, []);

  const openAddForm = () => {
    setEditingId(null);
    setFormName('');
    setFormEndpoint('');
    setFormModel('');
    setFormApiKey('');
    setFormSetActive(false);
    setShowForm(true);
  };

  const openEditForm = (p: Provider) => {
    setEditingId(p.id);
    setFormName(p.name);
    setFormEndpoint(p.endpoint);
    setFormModel(p.model);
    setFormApiKey(p.apiKey);
    setFormSetActive(false);
    setShowForm(true);
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
      setSaveResult({ ok: true, message: editingId ? 'Provider updated.' : 'Provider added.' });
      loadData();
    } else {
      const data = await res.json().catch(() => ({}));
      setSaveResult({ ok: false, message: data.error || data.message || 'Failed to save provider' });
    }
  };

  const handleFormTest = async () => {
    if (!formEndpoint.trim()) return;
    setFormTesting(true);
    setFormTestResult(null);
    try {
      const res = await fetch('/api/ai/test-connection', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          endpoint: formEndpoint.trim(),
          model: formModel.trim(),
          apiKey: formApiKey,
        }),
      });
      const data = await res.json();
      setFormTestResult({ ok: data.ok, message: data.message ?? (res.ok ? 'Connection successful' : 'Connection failed') });
    } catch {
      setFormTestResult({ ok: false, message: 'Failed to reach server' });
    }
    setFormTesting(false);
  };

  const handleDeleteProvider = async (id: string) => {
    if (!confirm('Delete this provider?')) return;
    const res = await fetch(`/api/ai/providers/${id}`, {
      method: 'DELETE',
      credentials: 'include',
    });
    if (res.ok) {
      setSaveResult({ ok: true, message: 'Provider deleted.' });
      loadData();
    } else {
      setSaveResult({ ok: false, message: 'Failed to delete provider' });
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
      setSaveResult({ ok: true, message: 'Active provider updated.' });
      loadData();
    } else {
      setSaveResult({ ok: false, message: 'Failed to set active provider' });
    }
  };

  const handleTestProvider = async (provider: Provider) => {
    setTestingId(provider.id);
    setTestResults((r) => ({ ...r, [provider.id]: { ok: true, message: 'Testing...' } }));
    try {
      const res = await fetch(`/api/ai/providers/${provider.id}/test`, {
        method: 'POST',
        credentials: 'include',
      });
      const data = await res.json();
      setTestResults((r) => ({ ...r, [provider.id]: { ok: data.ok, message: data.message } }));
    } catch {
      setTestResults((r) => ({ ...r, [provider.id]: { ok: false, message: 'Failed to reach server' } }));
    }
    setTestingId(null);
  };

  const handleSaveAutomation = async () => {
    setSaving(true);
    setSaveResult(null);
    try {
      const res = await fetch('/api/user-settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(automation),
      });
      if (res.ok) {
        setSaveResult({ ok: true, message: 'Settings saved.' });
      } else {
        const data = await res.json().catch(() => ({}));
        setSaveResult({ ok: false, message: data.error || data.message || `Save failed (${res.status})` });
      }
    } catch {
      setSaveResult({ ok: false, message: 'Network error — could not reach server.' });
    }
    setSaving(false);
  };

  const handleResetPrompt = () => {
    setAutomation((s) => ({ ...s, aiSystemPrompt: null }));
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
            className="px-3 py-1.5 text-sm font-medium text-primary-foreground bg-primary rounded-lg hover:opacity-90 transition-all"
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
                    disabled={testingId === p.id}
                    className="px-2.5 py-1 text-[11px] font-medium text-foreground bg-muted hover:bg-accent border border-border rounded-lg transition-colors disabled:opacity-50"
                  >
                    {testingId === p.id ? 'Testing...' : 'Test'}
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
              {testResults[p.id] && (
                <div className={`mt-2 text-xs px-2 py-1 rounded-lg ${testResults[p.id].ok ? 'bg-chart-2/20 text-chart-2' : 'bg-destructive/20 text-destructive'}`}>
                  {testResults[p.id].message}
                </div>
              )}
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
              <label className="block text-xs font-medium text-foreground mb-1">Endpoint URL</label>
              <input
                value={formEndpoint}
                onChange={(e) => setFormEndpoint(e.target.value)}
                className="w-full px-3 py-2 bg-background border border-input rounded-lg text-foreground text-sm font-mono focus:outline-none focus:ring-2 focus:ring-ring"
                placeholder="http://localhost:11434/v1"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-foreground mb-1">Model Name</label>
              <input
                value={formModel}
                onChange={(e) => setFormModel(e.target.value)}
                className="w-full px-3 py-2 bg-background border border-input rounded-lg text-foreground text-sm font-mono focus:outline-none focus:ring-2 focus:ring-ring"
                placeholder="llama3, gpt-4o, etc."
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
              <div className={`text-xs px-2 py-1 rounded-lg ${formTestResult.ok ? 'bg-chart-2/20 text-chart-2' : 'bg-destructive/20 text-destructive'}`}>
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
                onChange={(e) => setAutomation((s) => ({ ...s, aiAutoAnalyze: e.target.checked }))}
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
              className="w-24 px-3 py-2 bg-background border border-input rounded-lg text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
            <p className="text-xs text-muted-foreground mt-1">Number of transactions to analyze per API call</p>
          </div>
        </div>
      </div>

      <div className="flex items-center justify-end gap-3">
        {saveResult && (
          <span className={`text-xs px-2 py-1 rounded-lg ${saveResult.ok ? 'bg-chart-2/20 text-chart-2' : 'bg-destructive/20 text-destructive'}`}>
            {saveResult.message}
          </span>
        )}
        <button
          onClick={handleSaveAutomation}
          disabled={saving}
          className="px-4 py-2 text-sm font-semibold text-primary-foreground bg-primary rounded-lg hover:opacity-90 transition-all disabled:opacity-50"
        >
          {saving ? 'Saving...' : 'Save Settings'}
        </button>
      </div>
    </div>
  );
}
