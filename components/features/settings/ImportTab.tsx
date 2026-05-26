'use client';

import { useState, useCallback, useEffect } from 'react';
import { Upload, FileText, Check, AlertTriangle, Trash2, Loader2, ChevronLeft, ChevronRight, Download, Search } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { parseCsv, parseDateField } from '@/lib/utils/csv-parser';

type ImportType = 'transactions' | 'account_snapshots';
type WizardStep = 1 | 2 | 3 | 4 | 5 | 6 | 7;

type CsvPreview = {
  headers: string[];
  preview: Record<string, string>[];
  totalRows: number;
  delimiter: string;
  fileName: string;
};

type ColumnMapping = Record<string, string>;

type ImportLog = {
  id: string;
  fileName: string;
  importType: ImportType;
  status: 'completed' | 'failed' | 'partial';
  recordsImported: number;
  recordsSkipped: number;
  recordsErrored: number;
  startDate?: string | null;
  endDate?: string | null;
  dataStartDate?: string | null;
  dataEndDate?: string | null;
  createdAt: string;
};

const SYSTEM_FIELDS_TRANSACTIONS = [
  { key: 'date', label: 'Date', required: true },
  { key: 'amount', label: 'Amount', required: true },
  { key: 'description', label: 'Description', required: true },
  { key: 'account', label: 'Account', required: true },
  { key: 'payee', label: 'Payee', required: false },
  { key: 'category', label: 'Category', required: false },
  { key: 'memo', label: 'Memo', required: false },
  { key: 'notes', label: 'Notes', required: false },
  { key: 'type', label: 'Debit/Credit Indicator', required: false },
];

const SYSTEM_FIELDS_SNAPSHOTS = [
  { key: 'date', label: 'Date', required: true },
  { key: 'balance', label: 'Balance', required: true },
  { key: 'account', label: 'Account', required: true },
];

export default function ImportTab() {
  // Wizard state
  const [step, setStep] = useState<WizardStep>(1);
  const [importType, setImportType] = useState<ImportType>('transactions');
  const [csvPreview, setCsvPreview] = useState<CsvPreview | null>(null);
  const [csvRawText, setCsvRawText] = useState<string>('');
  const [columnMapping, setColumnMapping] = useState<ColumnMapping>({});
  const [accountMapping, setAccountMapping] = useState<Record<string, string>>({});
  const [categoryMapping, setCategoryMapping] = useState<Record<string, string>>({});
  const [newAccounts, setNewAccounts] = useState<Record<string, { name: string; type: string; currency: string; institution: string }>>({});
  const [newCategories, setNewCategories] = useState<Record<string, { name: string; color: string; isIncome: boolean; parentId?: string | null }>>({});
  const [uniqueAccountRefs, setUniqueAccountRefs] = useState<string[]>([]);
  const [uniqueCategoryNames, setUniqueCategoryNames] = useState<string[]>([]);
  const [availableAccounts, setAvailableAccounts] = useState<{ csvRef: string; existingAccount: { id: string; name: string } | null }[]>([]);
  const [availableCategories, setAvailableCategories] = useState<{ csvName: string; existingCategory: { id: string; name: string; fuzzyScore?: number } | null }[]>([]);
  // Stores the fuzzy confidence score (0–1) for each auto-mapped category; 1.0 = exact match.
  const [categoryFuzzyScores, setCategoryFuzzyScores] = useState<Record<string, number>>({});
  const [allAccounts, setAllAccounts] = useState<{ id: string; name: string; type: string }[]>([]);
  const [allCategories, setAllCategories] = useState<{
    id: string;
    name: string;
    parentId: string | null;
    color: string;
    isIncome: boolean;
  }[]>([]);
  const [activeCategoryDropdown, setActiveCategoryDropdown] = useState<string | null>(null);
  const [categorySearch, setCategorySearch] = useState('');
  const [uploading, setUploading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<{ success: boolean; recordsImported: number; recordsSkipped: number; recordsErrored: number; status: string; warnings?: string[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');

  // History state
  const [logs, setLogs] = useState<ImportLog[]>([]);
  const [logsLoading, setLogsLoading] = useState(true);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const fetchLogs = useCallback(async () => {
    setLogsLoading(true);
    try {
      const res = await fetch('/api/import/logs', { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        setLogs(data);
      }
    } catch {} finally {
      setLogsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  // Step 1: Choose import type
  const handleChooseType = (type: ImportType) => {
    setImportType(type);
    setStep(2);
  };

  // Step 2: Upload CSV
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append('file', file);

      const res = await fetch('/api/import/upload', {
        method: 'POST',
        credentials: 'include',
        body: formData,
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || err.message || 'Upload failed');
      }

      const data = await res.json();
      setCsvPreview(data);
      setCsvRawText(await file.text());

      // Initialize column mapping with auto-detection
      const mapping: ColumnMapping = {};
      const systemFields = importType === 'transactions' ? SYSTEM_FIELDS_TRANSACTIONS : SYSTEM_FIELDS_SNAPSHOTS;

      for (const field of systemFields) {
        const match = data.headers.find(
          (h: string) => h.toLowerCase().replace(/[\s_-]/g, '') === field.key.toLowerCase().replace(/[\s_-]/g, '')
        );
        if (match) {
          mapping[field.key] = match;
        }
      }
      setColumnMapping(mapping);
      setStep(3);
    } catch (err: any) {
      setError(err.message || 'Failed to upload file');
    } finally {
      setUploading(false);
    }
  };

  // Step 3: Column mapping
  const handleColumnMapChange = (systemField: string, csvColumn: string) => {
    setColumnMapping((prev) => ({ ...prev, [systemField]: csvColumn }));
  };

  const handleColumnMappingNext = async () => {
    setError(null);
    try {
      const res = await fetch('/api/import/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          csvText: csvRawText,
          importType,
          columnMapping,
          accountMapping: Object.keys(accountMapping).length > 0 ? accountMapping : undefined,
          categoryMapping: Object.keys(categoryMapping).length > 0 ? categoryMapping : undefined,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || err.message || 'Preview failed');
      }

      const data = await res.json();
      setUniqueAccountRefs(data.uniqueAccountRefs || []);
      setUniqueCategoryNames(data.uniqueCategoryNames || []);
      setAvailableAccounts(data.resolvedAccounts || []);
      setAvailableCategories(data.resolvedCategories || []);
      setAllAccounts(data.allAccounts || []);
      setAllCategories(data.allCategories || []);

      // Auto-map accounts
      const autoAccountMap: Record<string, string> = {};
      for (const ref of data.resolvedAccounts || []) {
        if (ref.existingAccount) {
          autoAccountMap[ref.csvRef] = ref.existingAccount.id;
        }
      }
      setAccountMapping(autoAccountMap);

      // Auto-map categories (exact and fuzzy matches)
      const autoCategoryMap: Record<string, string> = {};
      const autoFuzzyScores: Record<string, number> = {};
      for (const ref of data.resolvedCategories || []) {
        if (ref.existingCategory) {
          autoCategoryMap[ref.csvName] = ref.existingCategory.id;
          if (ref.existingCategory.fuzzyScore !== undefined) {
            autoFuzzyScores[ref.csvName] = ref.existingCategory.fuzzyScore;
          }
        }
      }
      setCategoryMapping(autoCategoryMap);
      setCategoryFuzzyScores(autoFuzzyScores);

      setStep(4);
    } catch (err: any) {
      setError(err.message || 'Preview failed');
    }
  };

  const EXCLUDED = '__excluded__';

  // Step 4: Account mapping
  const handleAccountMappingChange = (csvRef: string, accountId: string) => {
    setAccountMapping((prev) => ({ ...prev, [csvRef]: accountId }));
    if (accountId !== 'new') {
      setNewAccounts((prev) => {
        const next = { ...prev };
        delete next[csvRef];
        return next;
      });
    }
  };

  const handleNewAccountChange = (csvRef: string, field: string, value: string) => {
    setNewAccounts((prev) => ({
      ...prev,
      [csvRef]: { ...prev[csvRef] || { name: csvRef, type: 'checking', currency: 'USD', institution: '' }, [field]: value },
    }));
    if (!accountMapping[csvRef] || accountMapping[csvRef] !== 'new') {
      setAccountMapping((prev) => ({ ...prev, [csvRef]: 'new' }));
    }
  };

  const handleAccountMappingNext = () => {
    const systemFields = importType === 'transactions' ? SYSTEM_FIELDS_TRANSACTIONS : SYSTEM_FIELDS_SNAPSHOTS;
    if (importType === 'transactions' && uniqueCategoryNames.length > 0) {
      setStep(6);
    } else {
      setStep(7);
    }
  };

  // Step 5: Category mapping
  const handleCategoryMappingChange = (csvName: string, categoryId: string) => {
    setCategoryMapping((prev) => ({ ...prev, [csvName]: categoryId }));
    if (categoryId !== 'new') {
      setNewCategories((prev) => {
        const next = { ...prev };
        delete next[csvName];
        return next;
      });
    }
  };

  const handleNewCategoryChange = (csvName: string, field: string, value: string | boolean | null) => {
    setNewCategories((prev) => ({
      ...prev,
      [csvName]: { ...prev[csvName] || { name: csvName, color: '#6366f1', isIncome: false, parentId: null }, [field]: value },
    }));
    if (!categoryMapping[csvName] || categoryMapping[csvName] !== 'new') {
      setCategoryMapping((prev) => ({ ...prev, [csvName]: 'new' }));
    }
  };

  const handleDateRangeNext = () => {
    setStep(5);
  };

  // Step 6: Execute import
  const handleExecuteImport = async () => {
    setImporting(true);
    setError(null);

    const payload = {
      csvText: csvRawText,
      importType,
      columnMapping,
      accountMapping,
      categoryMapping,
      newAccounts: Object.keys(newAccounts).length > 0 ? newAccounts : undefined,
      newCategories: Object.keys(newCategories).length > 0 ? newCategories : undefined,
      fileName: csvPreview?.fileName || 'unknown.csv',
      startDate: startDate || undefined,
      endDate: endDate || undefined,
    };
    try {
      const res = await fetch('/api/import/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const err = await res.json();
        const detail = err.errorDetails || err.message || '';
        throw new Error(detail ? `Import failed: ${detail}` : 'Import failed');
      }

      const data = await res.json();
      setImportResult(data);
      fetchLogs();
    } catch (err: any) {
      setError(err.message || 'Import failed');
    } finally {
      setImporting(false);
    }
  };

  const handleReset = () => {
    setStep(1);
    setCsvPreview(null);
    setCsvRawText('');
    setColumnMapping({});
    setAccountMapping({});
    setCategoryMapping({});
    setCategoryFuzzyScores({});
    setNewAccounts({});
    setNewCategories({});
    setUniqueAccountRefs([]);
    setUniqueCategoryNames([]);
    setImportResult(null);
    setError(null);
    setStartDate('');
    setEndDate('');
  };

  const getImportableRecordsCount = useCallback(() => {
    if (!csvRawText) return 0;
    try {
      const parsed = parseCsv(csvRawText);
      const dateCol = columnMapping.date;
      const accountCol = columnMapping.account;

      let count = 0;
      for (const row of parsed.allRows) {
        if (dateCol && row[dateCol]) {
          const parsedRowDate = parseDateField(row[dateCol], importType === 'account_snapshots');
          if (startDate && parsedRowDate < startDate) continue;
          if (endDate && parsedRowDate > endDate) continue;
        }

        if (accountCol) {
          const accountRef = row[accountCol];
          if (!accountRef) continue;
          // Mirror the execute route: only count rows whose account is positively
          // mapped to a real ID. Unmapped, empty, 'new', or EXCLUDED all skip.
          const mappedId = accountMapping[accountRef];
          if (!mappedId || mappedId === EXCLUDED || mappedId === 'new') continue;
        }

        count++;

      }
      return count;
    } catch {
      return csvPreview?.totalRows || 0;
    }
  }, [csvRawText, csvPreview, columnMapping, accountMapping, startDate, endDate, EXCLUDED]);

  // Delete import
  const handleDeleteImport = async () => {
    if (!deleteConfirm) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/import/logs/${deleteConfirm}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      if (res.ok) {
        setLogs((prev) => prev.filter((l) => l.id !== deleteConfirm));
      }
    } catch {} finally {
      setDeleting(false);
      setDeleteConfirm(null);
    }
  };

  const systemFields = importType === 'transactions' ? SYSTEM_FIELDS_TRANSACTIONS : SYSTEM_FIELDS_SNAPSHOTS;
  const canProceedFromMapping = systemFields.filter((f) => f.required).every((f) => columnMapping[f.key]);

  const unmappedCategoriesWarnings = (() => {
    if (!columnMapping.category || uniqueCategoryNames.length === 0) return [];
    const unmapped = uniqueCategoryNames.filter((name) => !categoryMapping[name]);
    return unmapped.length > 0
      ? [`${unmapped.length} unmapped categor${unmapped.length === 1 ? 'y' : 'ies'} will be imported as uncategorized`]
      : [];
  })();

  const excludedAccountNames = Object.entries(accountMapping)
    .filter(([, id]) => !id || id === EXCLUDED)
    .map(([ref]) => ref);
  const excludedAccountsWarnings = excludedAccountNames.length > 0
    ? [`${excludedAccountNames.length} account(s) excluded or unmapped (${excludedAccountNames.join(', ')}) — rows will be skipped`]
    : [];

  const preImportWarnings = [...unmappedCategoriesWarnings, ...excludedAccountsWarnings];

  return (
    <div className="space-y-6">
      {/* ═══════════════════════ Wizard ═══════════════════════ */}
      <div className="p-5 bg-card border border-border rounded-xl">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-foreground">Import Data</h2>
          {step > 1 && step < 7 && (
            <span className="text-xs text-muted-foreground">
              Step {step - 1} of {importType === 'transactions' ? 6 : 5}
            </span>
          )}
        </div>

        {/* Error */}
        {error && (
          <div className="mb-4 p-3 rounded-lg border border-destructive/20 bg-destructive/10 text-sm text-destructive">
            {error}
          </div>
        )}

        {/* Step 1: Choose Type */}
        {step === 1 && (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">What type of data would you like to import?</p>
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => handleChooseType('transactions')}
                className="p-4 rounded-lg border border-border bg-muted/30 hover:bg-muted transition-colors text-left"
              >
                <FileText className="w-5 h-5 text-primary mb-2" />
                <div className="text-sm font-medium text-foreground">Transactions</div>
                <div className="text-xs text-muted-foreground mt-1">
                  Import income and expense transactions with dates, amounts, categories, and more.
                </div>
              </button>
              <button
                onClick={() => handleChooseType('account_snapshots')}
                className="p-4 rounded-lg border border-border bg-muted/30 hover:bg-muted transition-colors text-left"
              >
                <FileText className="w-5 h-5 text-primary mb-2" />
                <div className="text-sm font-medium text-foreground">Account Snapshots</div>
                <div className="text-xs text-muted-foreground mt-1">
                  Import historical account balances for net worth tracking.
                </div>
              </button>
            </div>
            <div className="pt-2 border-t border-border/50">
              <p className="text-xs text-muted-foreground mb-2">Need a starting point? Download a template:</p>
              <div className="flex gap-2">
                <a
                  href="/templates/transactions-template.csv"
                  download
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border bg-muted/30 hover:bg-muted transition-colors text-xs text-foreground"
                >
                  <Download className="w-3.5 h-3.5" /> Transactions CSV
                </a>
                <a
                  href="/templates/snapshots-template.csv"
                  download
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border bg-muted/30 hover:bg-muted transition-colors text-xs text-foreground"
                >
                  <Download className="w-3.5 h-3.5" /> Snapshots CSV
                </a>
              </div>
            </div>
          </div>
        )}

        {/* Step 2: Upload CSV */}
        {step === 2 && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Upload a CSV file containing your {importType === 'transactions' ? 'transactions' : 'account snapshots'}.
            </p>
            <label className="flex flex-col items-center justify-center p-8 rounded-lg border-2 border-dashed border-border hover:border-primary/50 cursor-pointer transition-colors bg-muted/20">
              <Upload className="w-8 h-8 text-muted-foreground mb-2" />
              <span className="text-sm text-muted-foreground">Click to upload CSV</span>
              <span className="text-xs text-muted-foreground mt-1">.csv files only</span>
              <input
                type="file"
                accept=".csv"
                onChange={handleFileUpload}
                className="hidden"
                disabled={uploading}
              />
            </label>
            {uploading && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="w-4 h-4 animate-spin" />
                Uploading and parsing...
              </div>
            )}
            <div className="flex gap-2">
              <Button variant="ghost" size="sm" onClick={handleReset}>Cancel</Button>
            </div>
          </div>
        )}

        {/* Step 3: Column Mapping */}
        {step === 3 && csvPreview && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Map your CSV columns to system fields.{' '}
              <span className="text-destructive">* Required</span>
            </p>

            <div className="space-y-2 max-h-64 overflow-y-auto">
              {systemFields.map((field) => (
                <div key={field.key} className="flex items-center gap-3 p-2 rounded-lg bg-muted/20">
                  <div className="w-32 text-sm font-medium text-foreground shrink-0">
                    {field.label}
                    {field.required && <span className="text-destructive ml-0.5">*</span>}
                  </div>
                  <select
                    value={columnMapping[field.key] || ''}
                    onChange={(e) => handleColumnMapChange(field.key, e.target.value)}
                    className="flex-1 h-9 rounded-lg border border-input bg-background px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <option value="">— Select column —</option>
                    {csvPreview.headers.map((header) => (
                      <option key={header} value={header}>
                        {header}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
            </div>

            {columnMapping.type && (
              <div className="p-3 rounded-lg border border-primary/20 bg-primary/5 text-xs text-foreground space-y-1">
                <div className="font-semibold text-primary flex items-center gap-1">
                  💡 Debit/Credit Sign Resolution Active
                </div>
                <p className="text-muted-foreground">
                  Amounts for rows with indicators like <code>debit</code>, <code>expense</code>, <code>withdrawal</code>, <code>wd</code>, <code>out</code>, <code>charge</code>, or <code>-</code> will be processed as **negative (expenses)**.
                  Indicators like <code>credit</code>, <code>income</code>, <code>deposit</code>, <code>refund</code>, <code>in</code>, or <code>+</code> will be processed as **positive (income/credits)**.
                </p>
              </div>
            )}

            {/* Preview of mapped data */}
            {csvPreview.preview.length > 0 && (
              <div>
                <p className="text-xs text-muted-foreground mb-2">Preview (first {Math.min(csvPreview.preview.length, 5)} rows):</p>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-border">
                        {systemFields.filter((f) => columnMapping[f.key]).map((f) => (
                          <th key={f.key} className="text-left p-1.5 text-muted-foreground font-medium">{f.label}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {csvPreview.preview.slice(0, 5).map((row, i) => (
                        <tr key={i} className="border-b border-border/50">
                          {systemFields.filter((f) => columnMapping[f.key]).map((f) => (
                            <td key={f.key} className="p-1.5 text-foreground">{row[columnMapping[f.key]] || '—'}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            <div className="flex gap-2">
              <Button variant="ghost" size="sm" onClick={() => setStep(2)}>
                <ChevronLeft className="w-4 h-4 mr-1" /> Back
              </Button>
              <Button
                size="sm"
                disabled={!canProceedFromMapping}
                onClick={handleColumnMappingNext}
              >
                Next <ChevronRight className="w-4 h-4 ml-1" />
              </Button>
            </div>
          </div>
        )}

        {/* Step 4: Date Range Selection */}
        {step === 4 && (
          <div className="space-y-4">
            <p className="text-sm font-semibold text-foreground">
              Filter Records by Date Range (Optional)
            </p>
            <p className="text-xs text-muted-foreground">
              Only records within the selected date range will be imported. Leave blank to import all records.
            </p>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-muted-foreground mb-1">
                  Start Date
                </label>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="w-full h-9 rounded-lg border border-input bg-background px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-muted-foreground mb-1">
                  End Date
                </label>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="w-full h-9 rounded-lg border border-input bg-background px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
              </div>
            </div>

            <div className="flex gap-2 pt-2">
              <Button variant="ghost" size="sm" onClick={() => setStep(3)}>
                <ChevronLeft className="w-4 h-4 mr-1" /> Back
              </Button>
              <Button size="sm" onClick={handleDateRangeNext}>
                Next <ChevronRight className="w-4 h-4 ml-1" />
              </Button>
            </div>
          </div>
        )}

        {/* Step 5: Account Mapping */}
        {step === 5 && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Map each account reference from your CSV to an existing account or create a new one.
              Accounts left unmapped will be skipped during import.
            </p>

            {uniqueAccountRefs.filter((ref) => !accountMapping[ref]).length > 0 && (
              <div className="p-3 rounded-lg border border-chart-3/20 bg-chart-3/10 text-sm text-chart-3">
                <div className="font-medium mb-1">⚠ Unmapped accounts</div>
                <p>{uniqueAccountRefs.filter((ref) => !accountMapping[ref]).length} account(s) left unmapped — corresponding rows will be skipped. You can map them or explicitly exclude them.</p>
              </div>
            )}

            <div className="space-y-3 max-h-80 overflow-y-auto">
              {uniqueAccountRefs.map((csvRef) => (
                <div key={csvRef} className="p-3 rounded-lg border border-border bg-muted/20">
                  <div className="text-sm font-medium text-foreground mb-2">CSV Account: {csvRef}</div>

                  <select
                    value={accountMapping[csvRef] || ''}
                    onChange={(e) => handleAccountMappingChange(csvRef, e.target.value)}
                    className={`w-full h-9 rounded-lg border border-input bg-background px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring mb-2 ${accountMapping[csvRef] === EXCLUDED || !accountMapping[csvRef] ? 'opacity-50' : ''}`}
                  >
                    <option value="">— Select account —</option>
                    <optgroup label="Existing accounts">
                      {allAccounts.map((acc) => (
                        <option key={acc.id} value={acc.id}>
                          {acc.name} ({acc.type})
                        </option>
                      ))}
                    </optgroup>
                    <option value="new">+ Create new account</option>
                    <option value={EXCLUDED}>— Exclude from import —</option>
                  </select>
                  {(accountMapping[csvRef] === EXCLUDED || !accountMapping[csvRef]) && (
                    <p className="text-xs text-chart-3 italic">Rows with this account will be skipped during import.</p>
                  )}

                  {accountMapping[csvRef] === 'new' && (
                    <div className="grid grid-cols-2 gap-2 mt-2 p-2 rounded bg-background border border-border">
                      <div>
                        <label className="text-xs text-muted-foreground">Name</label>
                        <Input
                          size={1}
                          value={newAccounts[csvRef]?.name || csvRef}
                          onChange={(e) => handleNewAccountChange(csvRef, 'name', e.target.value)}
                          className="h-8 text-sm"
                        />
                      </div>
                      <div>
                        <label className="text-xs text-muted-foreground">Type</label>
                        <select
                          value={newAccounts[csvRef]?.type || 'checking'}
                          onChange={(e) => handleNewAccountChange(csvRef, 'type', e.target.value)}
                          className="w-full h-8 rounded-lg border border-input bg-background px-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        >
                          <option value="checking">Checking</option>
                          <option value="savings">Savings</option>
                          <option value="credit">Credit Card</option>
                          <option value="investment">Investment</option>
                          <option value="retirement">Retirement</option>
                          <option value="mortgage">Mortgage</option>
                          <option value="loan">Loan</option>
                          <option value="realestate">Real Estate</option>
                          <option value="vehicle">Vehicle</option>
                          <option value="other">Other</option>
                        </select>
                      </div>
                      <div>
                        <label className="text-xs text-muted-foreground">Currency</label>
                        <Input
                          size={1}
                          value={newAccounts[csvRef]?.currency || 'USD'}
                          onChange={(e) => handleNewAccountChange(csvRef, 'currency', e.target.value)}
                          className="h-8 text-sm"
                        />
                      </div>
                      <div>
                        <label className="text-xs text-muted-foreground">Institution</label>
                        <Input
                          size={1}
                          value={newAccounts[csvRef]?.institution || ''}
                          onChange={(e) => handleNewAccountChange(csvRef, 'institution', e.target.value)}
                          className="h-8 text-sm"
                        />
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>

            <div className="flex gap-2">
              <Button variant="ghost" size="sm" onClick={() => setStep(4)}>
                <ChevronLeft className="w-4 h-4 mr-1" /> Back
              </Button>
              <Button size="sm" onClick={handleAccountMappingNext}>
                Next <ChevronRight className="w-4 h-4 ml-1" />
              </Button>
            </div>
          </div>
        )}

        {/* Step 6: Category Mapping */}
        {step === 6 && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Map each category from your CSV to an existing category or create a new one.
            </p>

            {unmappedCategoriesWarnings.length > 0 && (
              <div className="p-3 rounded-lg border border-chart-3/20 bg-chart-3/10 text-sm text-chart-3">
                <div className="font-medium mb-1">⚠ Unmapped categories</div>
                <p>{unmappedCategoriesWarnings[0]}. You can go back and map them, or leave them as-is.</p>
              </div>
            )}

            <div className="space-y-3 max-h-96 overflow-y-auto pb-56">
              {uniqueCategoryNames.map((csvName) => {
                const fuzzyScore = categoryFuzzyScores[csvName];
                const isFuzzyMatch = fuzzyScore !== undefined && fuzzyScore < 1.0;
                return (
                <div key={csvName} className="p-3 rounded-lg border border-border bg-muted/20">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-sm font-medium text-foreground">CSV Category: {csvName}</span>
                    {isFuzzyMatch && (
                      <span
                        title={`Fuzzy match — ${Math.round(fuzzyScore * 100)}% confidence. Click the dropdown to change.`}
                        className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30 cursor-default select-none"
                      >
                        ~{Math.round(fuzzyScore * 100)}% match
                      </span>
                    )}
                  </div>

                  <div className="relative mb-2">
                    <button
                      onClick={() => {
                        if (activeCategoryDropdown === csvName) {
                          setActiveCategoryDropdown(null);
                        } else {
                          setActiveCategoryDropdown(csvName);
                          setCategorySearch('');
                        }
                      }}
                      className="w-full flex items-center gap-2 px-3 py-2 bg-background border border-input rounded-lg text-sm text-foreground hover:bg-muted transition-colors text-left"
                    >
                      {(() => {
                        const mappedId = categoryMapping[csvName];
                        if (mappedId === 'new') {
                          return (
                            <>
                              <span className="text-primary font-medium">+ Create new category</span>
                            </>
                          );
                        }
                        const selectedCat = mappedId ? allCategories.find((c) => c.id === mappedId) : null;
                        return selectedCat ? (
                          <>
                            <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: selectedCat.color }} />
                            <span>{selectedCat.name}</span>
                          </>
                        ) : (
                          <span className="text-muted-foreground">Select category...</span>
                        );
                      })()}
                      <span className="ml-auto text-muted-foreground">▼</span>
                    </button>

                    {activeCategoryDropdown === csvName && (
                      <>
                        <div
                          className="fixed inset-0 z-40"
                          onClick={() => {
                            setActiveCategoryDropdown(null);
                            setCategorySearch('');
                          }}
                        />
                        <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-card border border-border rounded-lg shadow-xl max-h-80 flex flex-col">
                          <div className="relative p-2 border-b border-border">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
                            <input
                              value={categorySearch}
                              onChange={(e) => setCategorySearch(e.target.value)}
                              placeholder="Search categories..."
                              className="w-full pl-7 pr-2 py-1.5 text-xs bg-background border border-input rounded-md text-foreground placeholder-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                              autoFocus
                              onClick={(e) => e.stopPropagation()}
                            />
                          </div>
                          <div className="flex-1 overflow-y-auto max-h-56">
                            {(() => {
                              const filter = categorySearch.toLowerCase();
                              const parents = allCategories.filter((c) => !c.parentId);
                              const getChildren = (pId: string) => allCategories.filter((c) => c.parentId === pId);

                              const filteredParents = filter
                                ? parents.filter((p) =>
                                    p.name.toLowerCase().includes(filter) ||
                                    getChildren(p.id).some((c) => c.name.toLowerCase().includes(filter))
                                  )
                                : parents;

                              const noResults = filteredParents.length === 0;
                              const mappedId = categoryMapping[csvName];

                              return (
                                <>
                                  <button
                                    onClick={() => {
                                      handleCategoryMappingChange(csvName, '');
                                      setActiveCategoryDropdown(null);
                                      setCategorySearch('');
                                    }}
                                    className="w-full flex items-center gap-2 px-3 py-2 text-sm text-muted-foreground hover:bg-muted transition-colors text-left"
                                  >
                                    None (uncategorized)
                                  </button>
                                  <button
                                    onClick={() => {
                                      handleCategoryMappingChange(csvName, 'new');
                                      setActiveCategoryDropdown(null);
                                      setCategorySearch('');
                                    }}
                                    className="w-full flex items-center gap-2 px-3 py-2 text-sm text-primary hover:bg-muted font-medium transition-colors text-left"
                                  >
                                    + Create new category
                                  </button>
                                  {filteredParents.map((parent) => {
                                    const childList = filter
                                      ? getChildren(parent.id).filter((c) => c.name.toLowerCase().includes(filter))
                                      : getChildren(parent.id);
                                    if (filter && childList.length === 0 && !parent.name.toLowerCase().includes(filter)) return null;
                                    return (
                                      <div key={parent.id}>
                                        <div className="flex items-center gap-2 px-3 py-2 text-xs font-medium text-muted-foreground bg-muted/30">
                                          <div className="w-2 h-2 rounded-full" style={{ backgroundColor: parent.color }} />
                                          {parent.name}
                                        </div>
                                        <button
                                          onClick={() => {
                                            handleCategoryMappingChange(csvName, parent.id);
                                            setActiveCategoryDropdown(null);
                                            setCategorySearch('');
                                          }}
                                          className={`w-full flex items-center gap-2 px-6 py-2 text-sm transition-colors text-left ${
                                            mappedId === parent.id
                                              ? 'text-primary bg-primary/10'
                                              : 'text-foreground/80 hover:bg-muted'
                                          }`}
                                        >
                                          <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: parent.color }} />
                                          {parent.name}
                                        </button>
                                        {childList.map((child) => (
                                          <button
                                            key={child.id}
                                            onClick={() => {
                                              handleCategoryMappingChange(csvName, child.id);
                                              setActiveCategoryDropdown(null);
                                              setCategorySearch('');
                                            }}
                                            className={`w-full flex items-center gap-2 px-6 py-2 text-sm transition-colors text-left ${
                                              mappedId === child.id
                                                ? 'text-primary bg-primary/10'
                                                : 'text-foreground/80 hover:bg-muted'
                                            }`}
                                          >
                                            <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: child.color }} />
                                            {child.name}
                                          </button>
                                        ))}
                                      </div>
                                    );
                                  })}
                                  {noResults && (
                                    <div className="px-3 py-4 text-xs text-muted-foreground text-center">
                                      No categories found
                                    </div>
                                  )}
                                </>
                              );
                            })()}
                          </div>
                        </div>
                      </>
                    )}
                  </div>

                  {categoryMapping[csvName] === 'new' && (
                    <div className="grid grid-cols-2 gap-2 mt-2 p-2 rounded bg-background border border-border">
                      <div>
                        <label className="text-xs text-muted-foreground">Name</label>
                        <Input
                          size={1}
                          value={newCategories[csvName]?.name || csvName}
                          onChange={(e) => handleNewCategoryChange(csvName, 'name', e.target.value)}
                          className="h-8 text-sm"
                        />
                      </div>
                      <div>
                        <label className="text-xs text-muted-foreground">Parent Category</label>
                        <select
                          value={newCategories[csvName]?.parentId || ''}
                          onChange={(e) => handleNewCategoryChange(csvName, 'parentId', e.target.value || null)}
                          className="w-full h-8 rounded-lg border border-input bg-background px-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        >
                          <option value="">None (top-level)</option>
                          {allCategories.filter((c) => !c.parentId).map((p) => (
                            <option key={p.id} value={p.id}>{p.name}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="text-xs text-muted-foreground">Color</label>
                        <div className="flex items-center gap-2">
                          <input
                            type="color"
                            value={newCategories[csvName]?.color || '#6366f1'}
                            onChange={(e) => handleNewCategoryChange(csvName, 'color', e.target.value)}
                            className="w-8 h-8 rounded cursor-pointer"
                          />
                          <span className="text-xs text-muted-foreground">{newCategories[csvName]?.color || '#6366f1'}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          id={`income-${csvName}`}
                          checked={newCategories[csvName]?.isIncome || false}
                          onChange={(e) => handleNewCategoryChange(csvName, 'isIncome', e.target.checked)}
                          className="rounded border-border"
                        />
                        <label htmlFor={`income-${csvName}`} className="text-xs text-muted-foreground">Income category</label>
                      </div>
                    </div>
                  )}
                </div>
                );
              })}

            </div>

            <div className="flex gap-2">
              <Button variant="ghost" size="sm" onClick={() => setStep(5)}>
                <ChevronLeft className="w-4 h-4 mr-1" /> Back
              </Button>
              <Button size="sm" onClick={() => setStep(7)}>
                Next <ChevronRight className="w-4 h-4 ml-1" />
              </Button>
            </div>
          </div>
        )}

        {/* Step 7: Preview & Confirm / Result */}
        {step === 7 && (
          <div className="space-y-4">
            {importResult ? (
              <div className="py-6">
                <div className="text-center">
                  <div className="w-12 h-12 rounded-full bg-chart-1/20 flex items-center justify-center mx-auto mb-3">
                    {importResult.status === 'completed' ? (
                      <Check className="w-6 h-6 text-chart-1" />
                    ) : (
                      <AlertTriangle className="w-6 h-6 text-chart-3" />
                    )}
                  </div>
                  <h3 className="text-lg font-semibold text-foreground mb-1">
                    {importResult.status === 'completed' ? 'Import Complete' : 'Import Completed with Issues'}
                  </h3>
                  <div className="text-sm text-muted-foreground space-y-1">
                    <p>{importResult.recordsImported} records imported</p>
                    {importResult.recordsSkipped > 0 && <p>{importResult.recordsSkipped} records skipped</p>}
                    {importResult.recordsErrored > 0 && <p>{importResult.recordsErrored} records errored</p>}
                  </div>
                  {importResult.warnings && importResult.warnings.length > 0 && (
                    <div className="mt-3 text-left max-w-md mx-auto">
                      <div className="text-xs font-medium text-muted-foreground mb-1">Warnings:</div>
                      <ul className="space-y-0.5">
                        {importResult.warnings.map((w, i) => (
                          <li key={i} className="text-xs text-chart-3 list-disc list-inside">{w}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  <div className="flex gap-2 justify-center mt-4">
                    <Button size="sm" onClick={handleReset}>Import Another File</Button>
                  </div>
                </div>
              </div>
            ) : (
              <>
                <div className="p-4 rounded-lg bg-muted/30 border border-border">
                  <h3 className="text-sm font-semibold text-foreground mb-3">Import Summary</h3>
                  <div className="text-sm space-y-2">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Type</span>
                      <span className="text-foreground">{importType === 'transactions' ? 'Transactions' : 'Account Snapshots'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">File</span>
                      <span className="text-foreground">{csvPreview?.fileName}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Records to Import</span>
                      <span className="text-foreground">
                        {getImportableRecordsCount()} {getImportableRecordsCount() !== csvPreview?.totalRows && `(filtered from ${csvPreview?.totalRows})`}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Accounts matched</span>
                      <span className="text-foreground">
                        {Object.values(accountMapping).filter((id) => id !== 'new').length} / {uniqueAccountRefs.length}
                      </span>
                    </div>
                    {uniqueCategoryNames.length > 0 && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Categories matched</span>
                        <span className="text-foreground">
                          {Object.values(categoryMapping).filter((id) => id !== 'new').length} / {uniqueCategoryNames.length}
                        </span>
                      </div>
                    )}
                  </div>
                </div>

                {preImportWarnings.length > 0 && (
                  <div className="p-3 rounded-lg border border-chart-3/20 bg-chart-3/10 text-sm">
                    <div className="font-medium text-chart-3 mb-1">⚠ Things to note</div>
                    <ul className="space-y-1">
                      {preImportWarnings.map((w, i) => (
                        <li key={i} className="text-chart-3 list-disc list-inside">{w}</li>
                      ))}
                    </ul>
                  </div>
                )}

                <div className="flex gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      if (importType === 'transactions' && uniqueCategoryNames.length > 0) {
                        setStep(6);
                      } else {
                        setStep(5);
                      }
                    }}
                  >
                    <ChevronLeft className="w-4 h-4 mr-1" /> Back
                  </Button>
                  <Button
                    size="sm"
                    disabled={importing}
                    onClick={handleExecuteImport}
                  >
                    {importing ? (
                      <><Loader2 className="w-4 h-4 mr-1 animate-spin" /> Importing...</>
                    ) : (
                      <><Download className="w-4 h-4 mr-1" /> Import {getImportableRecordsCount()} Records</>
                    )}
                  </Button>
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {/* ═══════════════════════ Import History ═══════════════════════ */}
      <div className="p-5 bg-card border border-border rounded-xl">
        <h2 className="text-lg font-semibold text-foreground mb-4">Import History</h2>

        {logsLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
            <Loader2 className="w-4 h-4 animate-spin" /> Loading...
          </div>
        ) : logs.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4">No imports yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left p-2 text-muted-foreground font-medium">Date</th>
                  <th className="text-left p-2 text-muted-foreground font-medium">File</th>
                  <th className="text-left p-2 text-muted-foreground font-medium">Type</th>
                  <th className="text-right p-2 text-muted-foreground font-medium">Records</th>
                  <th className="text-center p-2 text-muted-foreground font-medium">Status</th>
                  <th className="text-right p-2 text-muted-foreground font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log) => (
                  <tr key={log.id} className="border-b border-border/50 hover:bg-muted/20 transition-colors">
                    <td className="p-2 text-foreground whitespace-nowrap">
                      {new Date(log.createdAt).toLocaleDateString()}
                    </td>
                    <td className="p-2 text-foreground max-w-[200px] truncate">
                      <div>{log.fileName}</div>
                      {log.startDate || log.endDate ? (
                        <div className="text-[10px] text-muted-foreground">
                          Filter: {log.startDate ? new Date(log.startDate + 'T00:00:00Z').toLocaleDateString() : 'Start'} - {log.endDate ? new Date(log.endDate + 'T00:00:00Z').toLocaleDateString() : 'End'}
                        </div>
                      ) : log.dataStartDate || log.dataEndDate ? (
                        <div className="text-[10px] text-muted-foreground">
                          All dates, covers: {log.dataStartDate ? new Date(log.dataStartDate + 'T00:00:00Z').toLocaleDateString() : 'Start'} - {log.dataEndDate ? new Date(log.dataEndDate + 'T00:00:00Z').toLocaleDateString() : 'End'}
                        </div>
                      ) : (
                        <div className="text-[10px] text-muted-foreground">All dates</div>
                      )}
                    </td>
                    <td className="p-2 text-foreground capitalize">{log.importType === 'account_snapshots' ? 'Snapshots' : 'Transactions'}</td>
                    <td className="p-2 text-foreground text-right">{log.recordsImported}</td>
                    <td className="p-2 text-center">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium ${
                        log.status === 'completed'
                          ? 'bg-chart-1/10 text-chart-1'
                          : log.status === 'partial'
                          ? 'bg-chart-3/10 text-chart-3'
                          : 'bg-destructive/10 text-destructive'
                      }`}>
                        {log.status}
                      </span>
                    </td>
                    <td className="p-2 text-right">
                      <button
                        onClick={() => setDeleteConfirm(log.id)}
                        className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-destructive transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" /> Remove
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteConfirm} onOpenChange={(open) => !open && setDeleteConfirm(null)}>
        <AlertDialogContent className="max-w-sm">
          <AlertDialogHeader>
            <AlertDialogTitle>Remove Imported Data?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete all transactions and account snapshots imported in this batch, as well as clear any synthetically generated balance history dependent on this data. All charts, summaries, and account balances will be recalculated. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <button
              type="button"
              onClick={handleDeleteImport}
              disabled={deleting}
              className="inline-flex h-9 items-center justify-center rounded-lg bg-destructive px-4 py-2 text-sm font-semibold text-destructive-foreground hover:opacity-90 transition-opacity focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none disabled:opacity-50"
            >
              {deleting ? 'Removing...' : 'Remove Data'}
            </button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
