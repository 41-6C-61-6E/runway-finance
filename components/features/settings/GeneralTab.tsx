'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Check } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import ModeToggle from '@/components/mode-toggle';
import AccentPicker from '@/components/features/settings/AccentPicker';
import { usePrivacyMode } from '@/components/privacy-mode-provider';
import { useAccountSubheadings } from '@/lib/hooks/use-account-subheadings';
import { useChartColorScheme } from '@/lib/hooks/use-chart-colors';
import { CHART_COLOR_SCHEMES, type ChartColorSchemeId } from '@/lib/utils/chart-color-schemes';
import { useHiddenPages, HIDDEN_PAGE_KEYS, DEV_MODE_PAGE_KEYS } from '@/lib/hooks/use-hidden-pages';

export default function GeneralTab() {
  const [accentColor, setAccentColor] = useState('violet');
  const [devMode, setDevMode] = useState<boolean | null>(null);
  const [devModeLoading, setDevModeLoading] = useState(false);
  const [birthYear, setBirthYear] = useState<string>('');

  const { privacyMode, togglePrivacyMode, loading: privacyModeLoading } = usePrivacyMode();
  const { hideSubheadings, updateHideSubheadings } = useAccountSubheadings();
  const { scheme: chartScheme, updateScheme: updateChartScheme } = useChartColorScheme();
  const { isHidden, updateHidden } = useHiddenPages();

  useEffect(() => {
    fetch('/api/dev-mode', { credentials: 'include' })
      .then((res) => res.json())
      .then((data) => setDevMode(data.devMode))
      .catch(() => setDevMode(null));

    fetch('/api/user-settings', { credentials: 'include' })
      .then((res) => res.json())
      .then((data) => {
        setAccentColor(data.accentColor ?? 'violet');
        setBirthYear(data.birthYear != null ? String(data.birthYear) : '');
      })
      .catch(() => setAccentColor('violet'));
  }, []);

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail) setAccentColor(detail);
    };
    window.addEventListener('accent-changed', handler);
    return () => window.removeEventListener('accent-changed', handler);
  }, []);

  const handleAccentColorChange = useCallback(async (color: string) => {
    setAccentColor(color);
    try {
      await fetch('/api/user-settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ accentColor: color }),
      });
    } catch {}
  }, []);

    const handleBirthYearChange = useCallback((value: string) => {
      setBirthYear(value);
      const trimmed = value.trim();
      if (trimmed === '') {
        fetch('/api/user-settings', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ birthYear: null }),
        }).catch(() => {});
        return;
      }
      const year = Number(trimmed);
      const currentYear = new Date().getFullYear();
      if (!Number.isInteger(year) || year < 1900 || year > currentYear) return;
      fetch('/api/user-settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ birthYear: year }),
      }).catch(() => {});
    }, []);

  const handleToggleDevMode = async () => {
    setDevModeLoading(true);
    try {
      const res = await fetch('/api/dev-mode', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ enabled: !devMode }),
      });
      const data = await res.json();
      setDevMode(data.devMode);
    } catch {}
    setDevModeLoading(false);
  };

  return (
    <>
      {/* Combined Appearance & Behavior Settings */}
      <div className="p-3 sm:p-5 bg-card border border-border rounded-xl">
        <div className="space-y-5 sm:space-y-6">
          {/* Theme */}
          <div className="flex items-center justify-between gap-4 pb-5 border-b border-border">
            <div className="flex-1 min-w-0">
              <h3 className="text-sm font-medium text-foreground">Theme</h3>
              <p className="text-xs text-muted-foreground mt-1">Select between Daylight, Moonlight, and Starlight themes</p>
            </div>
            <ModeToggle />
          </div>

          {/* Accent Color */}
          <div className="flex items-center justify-between gap-4 pb-5 border-b border-border">
            <div className="flex-1 min-w-0">
              <h3 className="text-sm font-medium text-foreground">Accent Color</h3>
              <p className="text-xs text-muted-foreground mt-1">Choose the accent color used throughout the app</p>
            </div>
            <AccentPicker
              value={accentColor}
              onChange={handleAccentColorChange}
            />
          </div>

          {/* Chart Color Scheme */}
          <div className="pb-5 border-b border-border">
            <div className="mb-3">
              <h3 className="text-sm font-medium text-foreground">Chart Color Scheme</h3>
              <p className="text-xs text-muted-foreground mt-1">Choose a color palette for all charts and graphs</p>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              {(Object.keys(CHART_COLOR_SCHEMES) as ChartColorSchemeId[]).map((id) => {
                const scheme = CHART_COLOR_SCHEMES[id];
                const isActive = chartScheme === id;
                return (
                  <button
                    key={id}
                    type="button"
                    title={scheme.description}
                    aria-label={`Select ${scheme.name} chart color scheme`}
                    onClick={() => updateChartScheme(id)}
                    className={`relative flex flex-col items-start gap-2 p-3 rounded-xl border transition-all ${
                      isActive
                        ? 'border-foreground bg-muted/50 shadow-sm'
                        : 'border-border hover:border-foreground/30 hover:bg-muted/20'
                    }`}
                  >
                    <div className="flex -space-x-1 mb-1">
                      {scheme.colors.map((c, i) => (
                        <div
                          key={i}
                          className="w-4 h-4 rounded-full border border-background"
                          style={{ background: c }}
                        />
                      ))}
                    </div>
                    <span className="text-xs font-semibold text-foreground">{scheme.name}</span>
                    {isActive && (
                      <Check className="w-3.5 h-3.5 text-foreground absolute top-2 right-2" />
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Birth Year */}
          <div className="flex items-center justify-between gap-4 pb-5 border-b border-border">
            <div className="flex-1 min-w-0">
              <h3 className="text-sm font-medium text-foreground">Birth Year</h3>
              <p className="text-xs text-muted-foreground mt-1">
                Used for age-based benchmark comparisons (savings rate &amp; net worth) on the Net Worth page. Optional.
              </p>
            </div>
            <input
              type="number"
              min={1900}
              max={new Date().getFullYear()}
              value={birthYear}
              onChange={(e) => handleBirthYearChange(e.target.value)}
              placeholder="1990"
              className="w-28 rounded-lg border border-border bg-background px-3 py-1.5 text-sm text-foreground font-mono focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>

          {/* Privacy Mode */}
          <div className="flex items-center justify-between gap-4 pb-5 border-b border-border">
            <div className="flex-1 min-w-0">
              <h3 className="text-sm font-medium text-foreground">Privacy Mode</h3>
              <p className="text-xs text-muted-foreground mt-1">Pixelate financial data when showing the app to others</p>
              <p className="text-xs text-muted-foreground mt-1">Visually hides amounts on this device only. It does not hide data from other household members.</p>
            </div>
            <Switch
              checked={privacyMode ?? false}
              onCheckedChange={togglePrivacyMode}
              disabled={privacyModeLoading}
            />
          </div>

          {/* Hide Account Subheadings */}
          <div className="flex items-center justify-between gap-4 pb-5 border-b border-border">
            <div className="flex-1 min-w-0">
              <h3 className="text-sm font-medium text-foreground">Hide Account Subheadings</h3>
              <p className="text-xs text-muted-foreground mt-1">Group accounts by major category only (e.g. Banking, Credit)</p>
            </div>
            <Switch
              checked={hideSubheadings}
              onCheckedChange={updateHideSubheadings}
            />
          </div>

          {/* Dev Mode */}
          <div className="flex items-center justify-between gap-4">
            <div className="flex-1 min-w-0">
              <h3 className="text-sm font-medium text-foreground">Developer Tools</h3>
              <p className="text-xs text-muted-foreground mt-1">Enable developer tools such as the Financial Logic and Data Explorer pages</p>
            </div>
            <Switch
              checked={devMode ?? false}
              onCheckedChange={handleToggleDevMode}
              disabled={devModeLoading}
            />
          </div>
          {devMode === true && (
            <p className="text-xs text-primary pt-1">Dev mode is active. Financial Logic and Data Explorer pages are visible in the nav.</p>
          )}
          {devMode === false && (
            <p className="text-xs text-muted-foreground pt-1">Dev mode is disabled. Developer tools are hidden from the nav.</p>
          )}
        </div>
      </div>

      {/* Navigation Visibility */}
      <div className="p-3 sm:p-5 bg-card border border-border rounded-xl">
        <div className="space-y-5 sm:space-y-6">
          <div>
            <h2 className="text-base font-semibold text-foreground">Navigation</h2>
            <p className="text-xs text-muted-foreground mt-1">
              Show or hide pages in the sidebar navigation. Hidden pages can still be accessed via direct URL.
            </p>
          </div>

          <div className="space-y-2">
            {HIDDEN_PAGE_KEYS.filter((pageKey) => {
              const isDevModePage = (DEV_MODE_PAGE_KEYS as readonly string[]).includes(pageKey);
              return !isDevModePage || devMode === true;
            }).map((pageKey) => {
              const pageLabel =
                pageKey === 'netWorth' ? 'Net Worth' :
                pageKey === 'transactions' ? 'Transactions' :
                pageKey === 'flows' ? 'Flows' :
                pageKey === 'budgets' ? 'Budgets' :
                pageKey === 'realEstate' ? 'Real Estate' :
                pageKey === 'investments' ? 'Investments' :
                pageKey === 'dataExplorer' ? 'Data Explorer' :
                pageKey === 'financialLogic' ? 'Financial Logic' :
                pageKey === 'goals' ? 'Goals' :
                pageKey === 'spending' ? 'Spending' :
                pageKey;

              return (
                <div key={pageKey} className="flex items-center justify-between p-3 bg-muted/30 border border-border rounded-lg">
                  <span className="text-sm text-foreground">{pageLabel}</span>
                  <Switch
                    checked={!isHidden(pageKey)}
                    onCheckedChange={(checked) => updateHidden(pageKey, !checked)}
                  />
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </>
  );
}
