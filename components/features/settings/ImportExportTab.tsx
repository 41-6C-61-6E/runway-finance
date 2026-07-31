'use client';

import { useState, useEffect, useCallback } from 'react';
import { UploadCloud, DownloadCloud, FileText, Table, Check, Loader2, Calendar, Filter, Archive, Layers, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import ImportTab from './ImportTab';

type SubTab = 'import' | 'export';

interface AccountOption {
  id: string;
  name: string;
  type: string;
}

interface CategoryOption {
  id: string;
  name: string;
}

interface PlanOption {
  id: string;
  name: string;
}

export default function ImportExportTab() {
  const [subTab, setSubTab] = useState<SubTab>('import');

  // Lookup options for Export Filters
  const [accounts, setAccounts] = useState<AccountOption[]>([]);
  const [categories, setCategories] = useState<CategoryOption[]>([]);
  const [plans, setPlans] = useState<PlanOption[]>([]);
  const [loadingLookups, setLoadingLookups] = useState(false);

  // Export 1: Transactions State
  const [txDateRange, setTxDateRange] = useState<'all' | 'ytd' | '30d' | '90d' | 'custom'>('all');
  const [txStartDate, setTxStartDate] = useState('');
  const [txEndDate, setTxEndDate] = useState('');
  const [txAccountId, setTxAccountId] = useState('all');
  const [txCategoryId, setTxCategoryId] = useState('all');
  const [exportingTx, setExportingTx] = useState(false);

  // Export 2: Snapshots State
  const [snapType, setSnapType] = useState<'net_worth' | 'account' | 'holding'>('net_worth');
  const [snapStartDate, setSnapStartDate] = useState('');
  const [snapEndDate, setSnapEndDate] = useState('');
  const [snapAccountId, setSnapAccountId] = useState('all');
  const [exportingSnap, setExportingSnap] = useState(false);

  // Export 3: FIRE Plans State
  const [planId, setPlanId] = useState('all');
  const [planFormat, setPlanFormat] = useState<'txt' | 'csv'>('txt');
  const [exportingPlan, setExportingPlan] = useState(false);

  // Export 4: Custom Package State
  const [selectedDatasets, setSelectedDatasets] = useState<string[]>([
    'transactions',
    'accounts',
    'categories',
    'snapshots',
    'fire_plans',
  ]);
  const [customStartDate, setCustomStartDate] = useState('');
  const [customEndDate, setCustomEndDate] = useState('');
  const [exportingCustom, setExportingCustom] = useState(false);

  // Feedback states
  const [exportError, setExportError] = useState<string | null>(null);
  const [exportSuccess, setExportSuccess] = useState<string | null>(null);

  // Load lookup data for filters when Export tab is selected
  const loadLookupData = useCallback(async () => {
    setLoadingLookups(true);
    try {
      const [accRes, catRes, planRes] = await Promise.all([
        fetch('/api/accounts', { credentials: 'include' }).catch(() => null),
        fetch('/api/categories', { credentials: 'include' }).catch(() => null),
        fetch('/api/retirement/plans', { credentials: 'include' }).catch(() => null),
      ]);

      if (accRes && accRes.ok) {
        const accData = await accRes.json();
        setAccounts(Array.isArray(accData) ? accData : accData.accounts || []);
      }
      if (catRes && catRes.ok) {
        const catData = await catRes.json();
        setCategories(Array.isArray(catData) ? catData : catData.categories || []);
      }
      if (planRes && planRes.ok) {
        const planData = await planRes.json();
        setPlans(Array.isArray(planData) ? planData : planData.plans || []);
      }
    } catch (err) {
      console.error('Failed to load lookup data for export filters:', err);
    } finally {
      setLoadingLookups(false);
    }
  }, []);

  useEffect(() => {
    if (subTab === 'export') {
      loadLookupData();
    }
  }, [subTab, loadLookupData]);

  // Download helper
  const triggerDownload = (blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // Helper for quick date calculation
  const getCalculatedDates = (preset: 'all' | 'ytd' | '30d' | '90d' | 'custom', customStart: string, customEnd: string) => {
    if (preset === 'custom') {
      return { start: customStart, end: customEnd };
    }
    if (preset === 'all') {
      return { start: '', end: '' };
    }

    const now = new Date();
    const end = now.toISOString().split('T')[0];
    let start = '';

    if (preset === 'ytd') {
      start = `${now.getFullYear()}-01-01`;
    } else if (preset === '30d') {
      const d = new Date(now);
      d.setDate(d.getDate() - 30);
      start = d.toISOString().split('T')[0];
    } else if (preset === '90d') {
      const d = new Date(now);
      d.setDate(d.getDate() - 90);
      start = d.toISOString().split('T')[0];
    }

    return { start, end };
  };

  // Export 1: Transactions Handler
  const handleExportTransactions = async () => {
    setExportingTx(true);
    setExportError(null);
    setExportSuccess(null);
    try {
      const { start, end } = getCalculatedDates(txDateRange, txStartDate, txEndDate);
      const params = new URLSearchParams();
      if (start) params.set('startDate', start);
      if (end) params.set('endDate', end);
      if (txAccountId && txAccountId !== 'all') params.set('accountId', txAccountId);
      if (txCategoryId && txCategoryId !== 'all') params.set('categoryId', txCategoryId);

      const res = await fetch(`/api/export/transactions?${params.toString()}`, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to export transactions');

      const blob = await res.blob();
      const dateStr = new Date().toISOString().split('T')[0];
      triggerDownload(blob, `transactions_export_${dateStr}.csv`);
      setExportSuccess('Transactions CSV downloaded successfully!');
    } catch (err) {
      setExportError(err instanceof Error ? err.message : 'Export failed');
    } finally {
      setExportingTx(false);
    }
  };

  // Export 2: Snapshots Handler
  const handleExportSnapshots = async () => {
    setExportingSnap(true);
    setExportError(null);
    setExportSuccess(null);
    try {
      const params = new URLSearchParams({ type: snapType });
      if (snapStartDate) params.set('startDate', snapStartDate);
      if (snapEndDate) params.set('endDate', snapEndDate);
      if (snapAccountId && snapAccountId !== 'all') params.set('accountId', snapAccountId);

      const res = await fetch(`/api/export/snapshots?${params.toString()}`, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to export snapshots');

      const blob = await res.blob();
      const dateStr = new Date().toISOString().split('T')[0];
      triggerDownload(blob, `${snapType}_snapshots_${dateStr}.csv`);
      setExportSuccess(`${snapType.replace('_', ' ')} snapshots exported successfully!`);
    } catch (err) {
      setExportError(err instanceof Error ? err.message : 'Export failed');
    } finally {
      setExportingSnap(false);
    }
  };

  // Export 3: FIRE Plans Handler
  const handleExportFirePlan = async () => {
    setExportingPlan(true);
    setExportError(null);
    setExportSuccess(null);
    try {
      const params = new URLSearchParams({ planId, format: planFormat });
      const res = await fetch(`/api/export/fire-plans?${params.toString()}`, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to export FIRE plan');

      const blob = await res.blob();
      const dateStr = new Date().toISOString().split('T')[0];
      const ext = planFormat === 'csv' ? 'csv' : 'txt';
      triggerDownload(blob, `fire_plan_export_${dateStr}.${ext}`);
      setExportSuccess(`FIRE plan exported as .${ext} successfully!`);
    } catch (err) {
      setExportError(err instanceof Error ? err.message : 'Export failed');
    } finally {
      setExportingPlan(false);
    }
  };

  // Export 4: Custom Package Handler
  const handleExportCustom = async () => {
    if (selectedDatasets.length === 0) {
      setExportError('Please select at least one dataset to export.');
      return;
    }

    setExportingCustom(true);
    setExportError(null);
    setExportSuccess(null);
    try {
      const res = await fetch('/api/export/custom', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          datasets: selectedDatasets,
          startDate: customStartDate || undefined,
          endDate: customEndDate || undefined,
        }),
      });

      if (!res.ok) throw new Error('Failed to create custom export archive');

      const blob = await res.blob();
      const dateStr = new Date().toISOString().split('T')[0];
      triggerDownload(blob, `custom_finance_export_${dateStr}.zip`);
      setExportSuccess('Custom dataset ZIP archive downloaded successfully!');
    } catch (err) {
      setExportError(err instanceof Error ? err.message : 'Export failed');
    } finally {
      setExportingCustom(false);
    }
  };

  const toggleDataset = (id: string) => {
    setSelectedDatasets((prev) =>
      prev.includes(id) ? prev.filter((d) => d !== id) : [...prev, id]
    );
  };

  return (
    <div className="space-y-6">
      {/* Top Header Navigation Tabs */}
      <div className="flex items-center justify-between border-b border-border pb-4">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-foreground">Import & Export Workspace</h2>
          <p className="text-sm text-muted-foreground">
            Seamlessly upload bank statements or generate customizable exports of your financial records.
          </p>
        </div>

        {/* Sub-tab segmented pill selector */}
        <div className="inline-flex items-center rounded-lg bg-muted p-1 text-muted-foreground">
          <button
            type="button"
            onClick={() => setSubTab('import')}
            className={`inline-flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-all ${
              subTab === 'import'
                ? 'bg-background text-foreground shadow-sm'
                : 'hover:text-foreground'
            }`}
          >
            <UploadCloud className="h-4 w-4" />
            Import Data
          </button>
          <button
            type="button"
            onClick={() => setSubTab('export')}
            className={`inline-flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-all ${
              subTab === 'export'
                ? 'bg-background text-foreground shadow-sm'
                : 'hover:text-foreground'
            }`}
          >
            <DownloadCloud className="h-4 w-4" />
            Export Data
          </button>
        </div>
      </div>

      {/* SUB-TAB 1: IMPORT DATA */}
      {subTab === 'import' && (
        <div>
          <ImportTab />
        </div>
      )}

      {/* SUB-TAB 2: EXPORT DATA */}
      {subTab === 'export' && (
        <div className="space-y-8">
          {/* Notification Messages */}
          {exportError && (
            <div className="rounded-lg border border-red-500/20 bg-red-500/10 p-4 text-sm text-red-600 dark:text-red-400">
              {exportError}
            </div>
          )}
          {exportSuccess && (
            <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/10 p-4 text-sm text-emerald-600 dark:text-emerald-400 flex items-center gap-2">
              <Check className="h-4 w-4" />
              {exportSuccess}
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* CARD 1: TRANSACTIONS EXPORT (CSV) */}
            <div className="rounded-xl border border-border bg-card p-6 shadow-sm flex flex-col justify-between space-y-4">
              <div>
                <div className="flex items-center gap-3 mb-2">
                  <div className="p-2.5 rounded-lg bg-primary/10 text-primary">
                    <Table className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-foreground">Transactions Export</h3>
                    <p className="text-xs text-muted-foreground">Download financial transactions in CSV format</p>
                  </div>
                </div>

                <div className="space-y-3 mt-4 text-sm">
                  <div>
                    <label className="block text-xs font-medium text-muted-foreground mb-1">Date Range</label>
                    <div className="grid grid-cols-5 gap-1 bg-muted p-1 rounded-md text-xs">
                      {(['all', 'ytd', '30d', '90d', 'custom'] as const).map((preset) => (
                        <button
                          key={preset}
                          type="button"
                          onClick={() => setTxDateRange(preset)}
                          className={`py-1 rounded text-center font-medium capitalize transition-all ${
                            txDateRange === preset
                              ? 'bg-background text-foreground shadow-sm'
                              : 'text-muted-foreground hover:text-foreground'
                          }`}
                        >
                          {preset === 'all' ? 'All Time' : preset.toUpperCase()}
                        </button>
                      ))}
                    </div>
                  </div>

                  {txDateRange === 'custom' && (
                    <div className="grid grid-cols-2 gap-2 pt-1">
                      <div>
                        <label className="text-[11px] text-muted-foreground">Start Date</label>
                        <Input
                          type="date"
                          value={txStartDate}
                          onChange={(e) => setTxStartDate(e.target.value)}
                          className="h-8 text-xs"
                        />
                      </div>
                      <div>
                        <label className="text-[11px] text-muted-foreground">End Date</label>
                        <Input
                          type="date"
                          value={txEndDate}
                          onChange={(e) => setTxEndDate(e.target.value)}
                          className="h-8 text-xs"
                        />
                      </div>
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-2 pt-1">
                    <div>
                      <label className="block text-xs font-medium text-muted-foreground mb-1">Account Filter</label>
                      <select
                        value={txAccountId}
                        onChange={(e) => setTxAccountId(e.target.value)}
                        className="w-full h-8 rounded-md border border-input bg-background px-2 py-1 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                      >
                        <option value="all">All Accounts</option>
                        {accounts.map((a) => (
                          <option key={a.id} value={a.id}>
                            {a.name}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-muted-foreground mb-1">Category Filter</label>
                      <select
                        value={txCategoryId}
                        onChange={(e) => setTxCategoryId(e.target.value)}
                        className="w-full h-8 rounded-md border border-input bg-background px-2 py-1 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                      >
                        <option value="all">All Categories</option>
                        {categories.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>
              </div>

              <Button
                onClick={handleExportTransactions}
                disabled={exportingTx}
                className="w-full flex items-center justify-center gap-2 mt-4"
              >
                {exportingTx ? <Loader2 className="h-4 w-4 animate-spin" /> : <DownloadCloud className="h-4 w-4" />}
                Export Transactions (CSV)
              </Button>
            </div>

            {/* CARD 2: SNAPSHOTS EXPORT (CSV) */}
            <div className="rounded-xl border border-border bg-card p-6 shadow-sm flex flex-col justify-between space-y-4">
              <div>
                <div className="flex items-center gap-3 mb-2">
                  <div className="p-2.5 rounded-lg bg-emerald-500/10 text-emerald-500">
                    <Layers className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-foreground">Snapshots Export</h3>
                    <p className="text-xs text-muted-foreground">Export Net Worth & Account balance history</p>
                  </div>
                </div>

                <div className="space-y-3 mt-4 text-sm">
                  <div>
                    <label className="block text-xs font-medium text-muted-foreground mb-1">Snapshot Type</label>
                    <select
                      value={snapType}
                      onChange={(e) => setSnapType(e.target.value as any)}
                      className="w-full h-8 rounded-md border border-input bg-background px-2 py-1 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                    >
                      <option value="net_worth">Net Worth History Snapshots</option>
                      <option value="account">Account Balance Snapshots</option>
                      <option value="holding">Investment Holding Snapshots</option>
                    </select>
                  </div>

                  <div className="grid grid-cols-2 gap-2 pt-1">
                    <div>
                      <label className="text-[11px] text-muted-foreground">Start Date (Optional)</label>
                      <Input
                        type="date"
                        value={snapStartDate}
                        onChange={(e) => setSnapStartDate(e.target.value)}
                        className="h-8 text-xs"
                      />
                    </div>
                    <div>
                      <label className="text-[11px] text-muted-foreground">End Date (Optional)</label>
                      <Input
                        type="date"
                        value={snapEndDate}
                        onChange={(e) => setSnapEndDate(e.target.value)}
                        className="h-8 text-xs"
                      />
                    </div>
                  </div>

                  {snapType === 'account' && (
                    <div className="pt-1">
                      <label className="block text-xs font-medium text-muted-foreground mb-1">Account Filter</label>
                      <select
                        value={snapAccountId}
                        onChange={(e) => setSnapAccountId(e.target.value)}
                        className="w-full h-8 rounded-md border border-input bg-background px-2 py-1 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                      >
                        <option value="all">All Accounts</option>
                        {accounts.map((a) => (
                          <option key={a.id} value={a.id}>
                            {a.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>
              </div>

              <Button
                onClick={handleExportSnapshots}
                disabled={exportingSnap}
                variant="outline"
                className="w-full flex items-center justify-center gap-2 mt-4"
              >
                {exportingSnap ? <Loader2 className="h-4 w-4 animate-spin" /> : <DownloadCloud className="h-4 w-4" />}
                Export Snapshots (CSV)
              </Button>
            </div>

            {/* CARD 3: FIRE PLANS EXPORT (TXT / CSV) */}
            <div className="rounded-xl border border-border bg-card p-6 shadow-sm flex flex-col justify-between space-y-4">
              <div>
                <div className="flex items-center gap-3 mb-2">
                  <div className="p-2.5 rounded-lg bg-purple-500/10 text-purple-500">
                    <FileText className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-foreground">FIRE Plans Export</h3>
                    <p className="text-xs text-muted-foreground">Export retirement plans, parameters & projection reports</p>
                  </div>
                </div>

                <div className="space-y-3 mt-4 text-sm">
                  <div>
                    <label className="block text-xs font-medium text-muted-foreground mb-1">Select FIRE Plan</label>
                    <select
                      value={planId}
                      onChange={(e) => setPlanId(e.target.value)}
                      className="w-full h-8 rounded-md border border-input bg-background px-2 py-1 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                    >
                      <option value="all">All FIRE Plans</option>
                      {plans.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-muted-foreground mb-1">Export Format</label>
                    <div className="grid grid-cols-2 gap-2 bg-muted p-1 rounded-md text-xs">
                      <button
                        type="button"
                        onClick={() => setPlanFormat('txt')}
                        className={`py-1.5 rounded font-medium flex items-center justify-center gap-1.5 transition-all ${
                          planFormat === 'txt'
                            ? 'bg-background text-foreground shadow-sm'
                            : 'text-muted-foreground hover:text-foreground'
                        }`}
                      >
                        <FileText className="h-3.5 w-3.5" />
                        Formatted Report (.txt)
                      </button>
                      <button
                        type="button"
                        onClick={() => setPlanFormat('csv')}
                        className={`py-1.5 rounded font-medium flex items-center justify-center gap-1.5 transition-all ${
                          planFormat === 'csv'
                            ? 'bg-background text-foreground shadow-sm'
                            : 'text-muted-foreground hover:text-foreground'
                        }`}
                      >
                        <Table className="h-3.5 w-3.5" />
                        Data Table (.csv)
                      </button>
                    </div>
                  </div>

                  <p className="text-[11px] text-muted-foreground italic pt-1">
                    {planFormat === 'txt'
                      ? 'Produces a clean, human-readable text document containing plan parameters, asset holdings, scheduled income/expense events, and retirement simulation results.'
                      : 'Exports raw plan accounts, balance structures, and return assumptions in tabular CSV format.'}
                  </p>
                </div>
              </div>

              <Button
                onClick={handleExportFirePlan}
                disabled={exportingPlan}
                variant="outline"
                className="w-full flex items-center justify-center gap-2 mt-4"
              >
                {exportingPlan ? <Loader2 className="h-4 w-4 animate-spin" /> : <DownloadCloud className="h-4 w-4" />}
                Export FIRE Plan ({planFormat.toUpperCase()})
              </Button>
            </div>

            {/* CARD 4: CUSTOM DATASET PACKAGE (ZIP ARCHIVE) */}
            <div className="rounded-xl border border-border bg-card p-6 shadow-sm flex flex-col justify-between space-y-4">
              <div>
                <div className="flex items-center gap-3 mb-2">
                  <div className="p-2.5 rounded-lg bg-amber-500/10 text-amber-500">
                    <Archive className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-foreground">Custom Multi-Dataset Export</h3>
                    <p className="text-xs text-muted-foreground">Select multiple datasets and download as a ZIP archive</p>
                  </div>
                </div>

                <div className="space-y-3 mt-4 text-sm">
                  <label className="block text-xs font-medium text-muted-foreground">Select Datasets to Include</label>

                  <div className="grid grid-cols-2 gap-2 bg-muted/40 p-2.5 rounded-lg border border-border/50 text-xs">
                    {[
                      { id: 'transactions', label: 'Transactions' },
                      { id: 'accounts', label: 'Accounts List' },
                      { id: 'categories', label: 'Categories' },
                      { id: 'snapshots', label: 'Snapshots' },
                      { id: 'budgets', label: 'Budgets' },
                      { id: 'fire_plans', label: 'FIRE Plans (.txt)' },
                      { id: 'paystubs', label: 'Paystubs' },
                    ].map((item) => (
                      <label
                        key={item.id}
                        className="flex items-center gap-2 cursor-pointer text-foreground hover:text-primary transition-colors py-0.5"
                      >
                        <input
                          type="checkbox"
                          checked={selectedDatasets.includes(item.id)}
                          onChange={() => toggleDataset(item.id)}
                          className="rounded border-input text-primary focus:ring-primary h-3.5 w-3.5"
                        />
                        <span>{item.label}</span>
                      </label>
                    ))}
                  </div>

                  <div className="grid grid-cols-2 gap-2 pt-1">
                    <div>
                      <label className="text-[11px] text-muted-foreground">Start Date (Optional)</label>
                      <Input
                        type="date"
                        value={customStartDate}
                        onChange={(e) => setCustomStartDate(e.target.value)}
                        className="h-8 text-xs"
                      />
                    </div>
                    <div>
                      <label className="text-[11px] text-muted-foreground">End Date (Optional)</label>
                      <Input
                        type="date"
                        value={customEndDate}
                        onChange={(e) => setCustomEndDate(e.target.value)}
                        className="h-8 text-xs"
                      />
                    </div>
                  </div>
                </div>
              </div>

              <Button
                onClick={handleExportCustom}
                disabled={exportingCustom || selectedDatasets.length === 0}
                variant="default"
                className="w-full flex items-center justify-center gap-2 mt-4 bg-amber-600 hover:bg-amber-700 text-white"
              >
                {exportingCustom ? <Loader2 className="h-4 w-4 animate-spin" /> : <Archive className="h-4 w-4" />}
                Download Custom Package (.zip)
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
