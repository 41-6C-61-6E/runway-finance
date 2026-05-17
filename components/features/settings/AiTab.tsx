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

type AiSettings = {
  aiEndpoint: string | null;
  aiModel: string | null;
  aiSystemPrompt: string | null;
  aiAutoAnalyze: boolean;
  aiAutoApproveThreshold: number;
  aiBatchSize: number;
};

export default function AiTab() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [saved, setSaved] = useState(false);
  const [settings, setSettings] = useState<AiSettings>({
    aiEndpoint: null,
    aiModel: null,
    aiSystemPrompt: null,
    aiAutoAnalyze: false,
    aiAutoApproveThreshold: 95,
    aiBatchSize: 25,
  });
  const [apiKey, setApiKey] = useState('');
  const [promptExpanded, setPromptExpanded] = useState(false);

  useEffect(() => {
    fetch('/api/user-settings', { credentials: 'include' })
      .then((r) => r.json())
      .then((data) => {
        setSettings({
          aiEndpoint: data.aiEndpoint ?? null,
          aiModel: data.aiModel ?? null,
          aiSystemPrompt: data.aiSystemPrompt ?? null,
          aiAutoAnalyze: data.aiAutoAnalyze ?? false,
          aiAutoApproveThreshold: data.aiAutoApproveThreshold ?? 95,
          aiBatchSize: data.aiBatchSize ?? 25,
        });
        setApiKey(data.apiKeys?.aiApiKey ?? '');
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleSave = async () => {
    setSaving(true);
    setSaved(false);
    try {
      await fetch('/api/user-settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          ...settings,
          apiKeys: { aiApiKey: apiKey },
        }),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch {}
    setSaving(false);
  };

  const handleTestConnection = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await fetch('/api/ai/test-connection', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
      });
      const data = await res.json();
      setTestResult({ ok: res.ok, message: data.message ?? (res.ok ? 'Connection successful' : 'Connection failed') });
    } catch {
      setTestResult({ ok: false, message: 'Failed to reach server' });
    }
    setTesting(false);
  };

  const handleResetPrompt = () => {
    setSettings((s) => ({ ...s, aiSystemPrompt: null }));
  };

  if (loading) {
    return <div className="text-muted-foreground py-4">Loading AI settings...</div>;
  }

  return (
    <div className="space-y-4">
      <div className="p-5 bg-card border border-border rounded-xl">
        <h2 className="text-base font-semibold text-foreground mb-1">AI Provider</h2>
        <p className="text-xs text-muted-foreground mb-4">
          Configure an OpenAI-compatible API endpoint for AI-powered transaction categorization. Compatible with Ollama, Open WebUI, and any OpenAI-compatible provider.
        </p>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">Endpoint URL</label>
            <input
              value={settings.aiEndpoint ?? ''}
              onChange={(e) => setSettings((s) => ({ ...s, aiEndpoint: e.target.value || null }))}
              className="w-full px-3 py-2 bg-background border border-input rounded-lg text-foreground text-sm font-mono focus:outline-none focus:ring-2 focus:ring-ring"
              placeholder="http://localhost:11434/v1"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-foreground mb-1">Model Name</label>
            <input
              value={settings.aiModel ?? ''}
              onChange={(e) => setSettings((s) => ({ ...s, aiModel: e.target.value || null }))}
              className="w-full px-3 py-2 bg-background border border-input rounded-lg text-foreground text-sm font-mono focus:outline-none focus:ring-2 focus:ring-ring"
              placeholder="llama3, gpt-4o, etc."
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-foreground mb-1">API Key</label>
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              className="w-full px-3 py-2 bg-background border border-input rounded-lg text-foreground text-sm font-mono focus:outline-none focus:ring-2 focus:ring-ring"
              placeholder="sk-... (leave blank if not required)"
            />
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={handleTestConnection}
              disabled={testing || !settings.aiEndpoint}
              className="px-4 py-2 text-sm font-medium text-foreground bg-muted hover:bg-accent border border-border rounded-lg transition-colors disabled:opacity-50"
            >
              {testing ? 'Testing...' : 'Test Connection'}
            </button>
            {testResult && (
              <span className={`text-xs px-2 py-1 rounded-lg ${testResult.ok ? 'bg-chart-2/20 text-chart-2' : 'bg-destructive/20 text-destructive'}`}>
                {testResult.message}
              </span>
            )}
          </div>
        </div>
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
              value={settings.aiSystemPrompt ?? DEFAULT_SYSTEM_PROMPT}
              onChange={(e) => setSettings((s) => ({ ...s, aiSystemPrompt: e.target.value }))}
              className="w-full h-80 px-3 py-2 bg-background border border-input rounded-lg text-foreground text-xs font-mono focus:outline-none focus:ring-2 focus:ring-ring resize-y"
              placeholder="Enter custom system prompt..."
            />
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-muted-foreground">
                {settings.aiSystemPrompt ? 'Custom prompt active' : 'Using default prompt'}
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
                checked={settings.aiAutoAnalyze}
                onChange={(e) => setSettings((s) => ({ ...s, aiAutoAnalyze: e.target.checked }))}
                className="sr-only peer"
              />
              <div className="w-9 h-5 bg-muted rounded-full peer peer-checked:bg-primary after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-card after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:after:translate-x-full"></div>
            </label>
          </div>

          <div>
            <label className="block text-sm font-medium text-foreground mb-1">
              Auto-approve confidence threshold: {settings.aiAutoApproveThreshold}%
            </label>
            <input
              type="range"
              min={0}
              max={100}
              value={settings.aiAutoApproveThreshold}
              onChange={(e) => setSettings((s) => ({ ...s, aiAutoApproveThreshold: parseInt(e.target.value) }))}
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
              value={settings.aiBatchSize}
              onChange={(e) => setSettings((s) => ({ ...s, aiBatchSize: parseInt(e.target.value) || 25 }))}
              className="w-24 px-3 py-2 bg-background border border-input rounded-lg text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
            <p className="text-xs text-muted-foreground mt-1">Number of transactions to analyze per API call</p>
          </div>
        </div>
      </div>

      <div className="flex justify-end">
        <button
          onClick={handleSave}
          disabled={saving}
          className="px-4 py-2 text-sm font-semibold text-primary-foreground bg-primary rounded-lg hover:opacity-90 transition-all disabled:opacity-50"
        >
          {saving ? 'Saving...' : saved ? 'Saved!' : 'Save Settings'}
        </button>
      </div>
    </div>
  );
}
