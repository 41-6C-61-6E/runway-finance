'use client';

import { useState, useEffect, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import { Settings, RotateCcw, Save, Check, X } from 'lucide-react';
import { DEFAULTS, SETTING_DEFINITIONS, API_KEY_FIELD_KEYS, API_KEY_DEFAULTS } from '@/config/defaults';
import { PageHeader } from '@/components/page-header';
import PageContent from '@/components/page-content';

type SettingsState = Record<string, unknown>;
type DirtyMap = Record<string, true>;

const STRING_OPTIONS: Record<string, string[]> = {
  theme: ['light', 'moonlight', 'dark'],
  cardStyle: ['rounded', 'default', 'square'],
  chartColorScheme: ['fauntleroy', 'kingston', 'seattle', 'vashon'],
  forecastMode: ['historical', 'budget', 'hybrid'],
  defaultChartTimeRange: ['1m', '3m', '6m', '1y', '5y', 'ytd', 'all'],
  defaultChartType: ['line', 'bar'],
};

function getDefaultForKey(key: string): unknown {
  const def = SETTING_DEFINITIONS.find((d) => d.key === key);
  return def ? def.defaultValue : undefined;
}

function flattenSettings(data: Record<string, unknown>): SettingsState {
  const flat: SettingsState = { ...data };
  if (data.apiKeys && typeof data.apiKeys === 'object') {
    for (const [k, v] of Object.entries(data.apiKeys as Record<string, string>)) {
      flat[k] = v;
    }
  }
  delete flat.apiKeys;
  return flat;
}

function packForSave(working: SettingsState): Record<string, unknown> {
  const body: Record<string, unknown> = { ...working };
  const apiKeys: Record<string, string> = {};
  let hasApiKeys = false;
  for (const k of API_KEY_FIELD_KEYS) {
    apiKeys[k] = (working[k] as string) ?? API_KEY_DEFAULTS[k] ?? '';
    hasApiKeys = true;
    delete body[k];
  }
  if (hasApiKeys) {
    body.apiKeys = apiKeys;
  }
  return body;
}

const SETTING_GROUPS = SETTING_DEFINITIONS.reduce(
  (acc, def) => {
    (acc[def.group] ??= []).push(def);
    return acc;
  },
  {} as Record<string, typeof SETTING_DEFINITIONS>,
);

export default function DevDefaultsPage() {
  const { data: session, status } = useSession();
  const [settings, setSettings] = useState<SettingsState | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [working, setWorking] = useState<SettingsState | null>(null);
  const [dirty, setDirty] = useState<DirtyMap>({});

  const loadSettings = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/user-settings', { credentials: 'include' });
      const data = await res.json();
      const flat = flattenSettings(data);
      setSettings(flat);
      setWorking({ ...flat });
      setDirty({});
    } catch {
      setError('Failed to load settings');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  const updateValue = useCallback(
    (key: string, value: unknown) => {
      setWorking((prev) => (prev ? { ...prev, [key]: value } : prev));
      if (settings && settings[key] !== value && JSON.stringify(settings[key]) !== JSON.stringify(value)) {
        setDirty((prev) => ({ ...prev, [key]: true }));
      } else {
        setDirty((prev) => {
          const next = { ...prev };
          delete next[key];
          return next;
        });
      }
    },
    [settings],
  );

  const resetToDefault = useCallback(
    (key: string) => {
      const defaultValue = getDefaultForKey(key);
      updateValue(key, defaultValue);
    },
    [updateValue],
  );

  const resetAll = useCallback(() => {
    if (!settings) return;
    setWorking({ ...settings });
    setDirty({});
  }, [settings]);

  const applyChanges = useCallback(async () => {
    if (!working) return;
    const dirtyKeys = Object.keys(dirty);
    if (dirtyKeys.length === 0) return;

    setSaving(true);
    setError(null);
    setSuccess(false);

    try {
      const body = packForSave(working);
      const res = await fetch('/api/user-settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || errData.message || `HTTP ${res.status}`);
      }
      const updated = await res.json();
      const flat = flattenSettings(updated);
      setSettings(flat);
      setWorking({ ...flat });
      setDirty({});
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save settings');
    } finally {
      setSaving(false);
    }
  }, [working, dirty]);

  const totalDirty = Object.keys(dirty).length;

  function renderControl(def: (typeof SETTING_DEFINITIONS)[number]) {
    const value = working?.[def.key];
    const defaultValue = def.defaultValue;

    if (def.type === 'boolean') {
      const isOn = value === true || value === 'true';
      return (
        <button
          type="button"
          onClick={() => updateValue(def.key, !isOn)}
          className={`relative inline-flex h-6 w-10 items-center rounded-full transition-colors ${
            isOn ? 'bg-primary' : 'bg-muted-foreground/30'
          }`}
        >
          <span
            className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
              isOn ? 'translate-x-5' : 'translate-x-1'
            }`}
          />
        </button>
      );
    }

    if (def.type === 'json') {
      return (
        <textarea
          value={typeof value === 'object' ? JSON.stringify(value ?? defaultValue, null, 2) : String(value ?? '')}
          onChange={(e) => {
            try {
              const parsed = JSON.parse(e.target.value);
              updateValue(def.key, parsed);
            } catch {
              updateValue(def.key, e.target.value);
            }
          }}
          rows={3}
          className="w-full bg-background border border-input rounded text-foreground text-xs font-mono focus:outline-none focus:ring-1 focus:ring-ring resize-y p-2"
        />
      );
    }

    if (def.type === 'number') {
      return (
        <input
          type="number"
          value={(value as number) ?? ''}
          onChange={(e) => updateValue(def.key, e.target.value ? Number(e.target.value) : '')}
          className="w-full bg-background border border-input rounded text-foreground text-xs font-mono focus:outline-none focus:ring-1 focus:ring-ring p-2"
        />
      );
    }

    if (def.type === 'password') {
      return (
        <input
          type="password"
          value={(value as string) ?? ''}
          onChange={(e) => updateValue(def.key, e.target.value)}
          className="w-full bg-background border border-input rounded text-foreground text-xs font-mono focus:outline-none focus:ring-1 focus:ring-ring p-2"
        />
      );
    }

    const options = STRING_OPTIONS[def.key];
    if (options) {
      return (
        <select
          value={(value as string) ?? ''}
          onChange={(e) => updateValue(def.key, e.target.value)}
          className="w-full bg-background border border-input rounded text-foreground text-xs font-mono focus:outline-none focus:ring-1 focus:ring-ring p-2"
        >
          {options.map((opt) => (
            <option key={opt} value={opt}>{opt}</option>
          ))}
        </select>
      );
    }

    return (
      <input
        type="text"
        value={(value as string) ?? ''}
        onChange={(e) => updateValue(def.key, e.target.value)}
        className="w-full bg-background border border-input rounded text-foreground text-xs font-mono focus:outline-none focus:ring-1 focus:ring-ring p-2"
      />
    );
  }

  if (status === 'loading') {
    return (
      <div className="min-h-screen">
        <PageHeader title="Defaults Viewer" icon={Settings} />
        <PageContent>
          <div className="text-muted-foreground text-sm py-8 text-center">Checking auth...</div>
        </PageContent>
      </div>
    );
  }

  if (status === 'unauthenticated') {
    return (
      <div className="min-h-screen">
        <PageHeader title="Defaults Viewer" icon={Settings} />
        <PageContent>
          <div className="text-muted-foreground text-sm py-8 text-center">You must be logged in to view this page.</div>
        </PageContent>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen">
        <PageHeader title="Defaults Viewer" icon={Settings} />
        <PageContent>
          <div className="text-muted-foreground text-sm py-8 text-center">Loading defaults...</div>
        </PageContent>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <PageHeader title="Defaults Viewer" icon={Settings} />
      <PageContent maxWidth="max-w-5xl">
        <div className="space-y-4">
          {/* Info banner */}
          <div className="p-4 bg-card border border-border rounded-lg flex items-start gap-3">
            <Settings className="w-5 h-5 text-muted-foreground shrink-0 mt-0.5" />
            <div>
              <h2 className="text-sm font-semibold text-foreground">All Defaults &mdash; System vs Current</h2>
              <p className="text-xs text-muted-foreground mt-1">
                Shows every setting from <code className="text-xs bg-muted px-1 rounded">config/defaults.ts</code>.
                <strong className="text-foreground"> System Default</strong> is the hardcoded default;
                <strong className="text-foreground"> Current Value</strong> is what&rsquo;s stored in your settings.
                Modified rows are highlighted. Changes are saved via the same <code className="text-xs bg-muted px-1 rounded">PATCH /api/user-settings</code> endpoint.
              </p>
            </div>
          </div>

          {/* Error / Success */}
          {error && (
            <div className="p-3 bg-destructive/20 border border-destructive/30 rounded-lg flex items-center gap-2">
              <X className="w-4 h-4 text-destructive" />
              <span className="text-xs text-destructive">{error}</span>
            </div>
          )}
          {success && (
            <div className="p-3 bg-chart-1/20 border border-chart-1/30 rounded-lg flex items-center gap-2">
              <Check className="w-4 h-4 text-chart-1" />
              <span className="text-xs text-chart-1">Settings saved successfully.</span>
            </div>
          )}

          {/* Per-group tables */}
          {Object.entries(SETTING_GROUPS).map(([group, defs]) => (
            <div key={group} className="bg-card border border-border rounded-lg overflow-hidden">
              <div className="px-4 py-3 border-b border-border bg-muted/20">
                <h2 className="text-sm font-semibold text-foreground">{group}</h2>
              </div>
              <div className="divide-y divide-border">
                {defs.map((def) => {
                  const currentValue = working?.[def.key];
                  const defaultValue = def.defaultValue;
                  const isDirty = !!dirty[def.key];
                  const isAtDefault =
                    currentValue === defaultValue ||
                    JSON.stringify(currentValue) === JSON.stringify(defaultValue);

                  return (
                    <div
                      key={def.key}
                      className={`px-4 py-3 ${
                        isDirty ? 'bg-primary/[0.03]' : ''
                      }`}
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium text-foreground">{def.label}</span>
                            <code className="text-[10px] text-muted-foreground/50 font-mono">{def.key}</code>
                            <span className="text-[10px] text-muted-foreground/30 font-mono">({def.type})</span>
                            {isDirty && (
                              <span className="text-[10px] font-medium text-primary px-1.5 py-0.5 bg-primary/10 rounded">Modified</span>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground mt-0.5">{def.description}</p>
                          <div className="mt-1.5 flex items-center gap-3 text-[10px] font-mono">
                            <span className="text-muted-foreground/70">
                              System default: <span className="text-foreground/80">{formatDefault(defaultValue)}</span>
                            </span>
                            <span className="text-muted-foreground/70">
                              Current: <span className="text-foreground/80">{formatDefault(currentValue)}</span>
                            </span>
                            {!isAtDefault && (
                              <button
                                type="button"
                                onClick={() => resetToDefault(def.key)}
                                disabled={saving}
                                className="inline-flex items-center gap-1 text-primary hover:text-primary/80 disabled:opacity-30"
                              >
                                <RotateCcw className="w-3 h-3" />
                                Reset
                              </button>
                            )}
                          </div>
                        </div>
                        <div className="w-48 shrink-0">
                          {renderControl(def)}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}

          {/* Action bar */}
          <div className="sticky bottom-0 p-3 bg-card border border-border rounded-lg flex items-center justify-between gap-3">
            <span className="text-xs text-muted-foreground">
              {totalDirty > 0
                ? `${totalDirty} setting${totalDirty !== 1 ? 's' : ''} modified`
                : 'All settings match system defaults'}
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={resetAll}
                disabled={saving || totalDirty === 0}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground bg-muted hover:bg-accent rounded-lg transition-colors disabled:opacity-30"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Discard
              </button>
              <button
                type="button"
                onClick={applyChanges}
                disabled={saving || totalDirty === 0}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-primary-foreground bg-primary rounded-lg hover:opacity-90 transition-all disabled:opacity-50"
              >
                {saving ? (
                  <>Saving...</>
                ) : (
                  <>
                    <Save className="w-3.5 h-3.5" />
                    Save Changes ({totalDirty})
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </PageContent>
    </div>
  );
}

function formatDefault(value: unknown): string {
  if (value === null || value === undefined) return 'null';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}
