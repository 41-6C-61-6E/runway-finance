'use client';

import { useState, useCallback, useEffect } from 'react';
import { Upload, FileText, Check, AlertTriangle, Trash2, ChevronLeft, ChevronRight, Download, Search } from 'lucide-react';
import { Spinner } from '@/components/ui/loading-spinner';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { SectionHeading } from '@/components/ui/section-heading';
import { AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { parseCsv, parseDateField } from '@/lib/utils/csv-parser';
import { Select } from '@/components/ui/select';
import { ClickOutsideBackdrop } from '@/components/ui/modal-overlay';
import { ImportHistoryTable } from './import/import-history-table';
import { CategoryMappingStep } from './import/category-mapping-step';
import { AccountMappingStep } from './import/account-mapping-step';
import { toast } from 'sonner';

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
  const [isDragging, setIsDragging] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<{ success: boolean; recordsImported: number; recordsSkipped: number; recordsErrored: number; status: string; warnings?: string[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  const [snapshotDayOfMonth, setSnapshotDayOfMonth] = useState<number | 'end'>('end');

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
      } else {
        const err = await res.json().catch(() => ({}));
        setError(err.message || 'Failed to fetch import history');
      }
    } catch (err: any) {
      setError(err.message || 'Failed to fetch import history');
    } finally {
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
  const processFile = async (file: File) => {
    if (file.size > 50 * 1024 * 1024) {
      setError('File too large. Maximum file size is 50MB.');
      return;
    }

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
      const sysFields = importType === 'transactions' ? SYSTEM_FIELDS_TRANSACTIONS : SYSTEM_FIELDS_SNAPSHOTS;

      for (const field of sysFields) {
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

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    processFile(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (!file) return;
    if (!file.name.toLowerCase().endsWith('.csv')) {
      setError('Only .csv files are supported.');
      return;
    }
    processFile(file);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
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
          snapshotDayOfMonth: importType === 'account_snapshots' ? snapshotDayOfMonth : undefined,
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
      snapshotDayOfMonth: importType === 'account_snapshots' ? snapshotDayOfMonth : undefined,
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
    setSnapshotDayOfMonth('end');
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
          const parsedRowDate = parseDateField(row[dateCol], importType === 'account_snapshots' ? snapshotDayOfMonth : undefined);
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
      const res = await db_delete_log(deleteConfirm);
      if (res) {
        setLogs((prev) => prev.filter((l) => l.id !== deleteConfirm));
      }
    } catch {} finally {
      setDeleting(false);
      setDeleteConfirm(null);
    }
  };

  const db_delete_log = async (id: string) => {
    const res = await fetch(`/api/import/logs/${id}`, {
      method: 'DELETE',
      credentials: 'include',
    });
    return res.ok;
  };

  // Download import file
  const handleDownloadImport = async (id: string, fileName: string) => {
    try {
      const res = await fetch(`/api/import/logs/${id}`, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to fetch import details');
      const data = await res.json();
      if (!data.fileContent) {
        toast.error('No original file content stored for this import.');
        return;
      }
      
      const blob = new Blob([data.fileContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', fileName || 'imported_file.csv');
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (err: any) {
      toast.error(err.message || 'Failed to download original file.');
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
    <div className="space-y-6 w-full min-w-0">
      {/* ═══════════════════════ Wizard ═══════════════════════ */}
      <div className="p-3 sm:p-5 bg-card border border-border rounded-xl">
        <div className="flex items-start sm:items-center justify-between gap-2 mb-4">
          <SectionHeading>Import Data</SectionHeading>
          {step > 1 && step < 7 && (
            <span className="text-xs text-muted-foreground shrink-0">
              Step {step - 1} of {importType === 'transactions' ? (uniqueCategoryNames.length > 0 ? 5 : 4) : 4}
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
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <button
                onClick={() => handleChooseType('transactions')}
                className="p-4 rounded-lg border border-input bg-muted/30 hover:bg-muted transition-colors text-left"
              >
                <FileText className="w-5 h-5 text-primary mb-2" />
                <div className="text-sm font-medium text-foreground">Transactions</div>
                <div className="text-xs text-muted-foreground mt-1">
                  Import income and expense transactions with dates, amounts, categories, and more.
                </div>
              </button>
              <button
                onClick={() => handleChooseType('account_snapshots')}
                className="p-4 rounded-lg border border-input bg-muted/30 hover:bg-muted transition-colors text-left"
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
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-input bg-muted/30 hover:bg-muted transition-colors text-xs text-foreground"
                >
                  <Download className="w-3.5 h-3.5" /> Transactions CSV
                </a>
                <a
                  href="/templates/snapshots-template.csv"
                  download
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-input bg-muted/30 hover:bg-muted transition-colors text-xs text-foreground"
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
            <label
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              className={`flex flex-col items-center justify-center p-8 rounded-lg border-2 border-dashed cursor-pointer transition-colors ${
                isDragging
                  ? 'border-primary bg-primary/5'
                  : 'border-border hover:border-primary/50 bg-muted/20'
              }`}
            >
              <Upload className={`w-8 h-8 mb-2 ${isDragging ? 'text-primary' : 'text-muted-foreground'}`} />
              <span className={`text-sm ${isDragging ? 'text-primary font-medium' : 'text-muted-foreground'}`}>
                {isDragging ? 'Drop your CSV file here' : 'Click or drag & drop to upload CSV'}
              </span>
              <span className="text-xs text-muted-foreground mt-1">.csv files up to 50MB</span>
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
                <Spinner size="sm" />
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
                <div key={field.key} className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-3 p-2 rounded-lg bg-muted/20">
                  <div className="w-full sm:w-32 text-sm font-medium text-foreground shrink-0">
                    {field.label}
                    {field.required && <span className="text-destructive ml-0.5">*</span>}
                  </div>
                  <Select
                    className="h-9 rounded-lg"
                    wrapperClassName="sm:flex-1"
                    value={columnMapping[field.key] || ''}
                    onChange={(e) => handleColumnMapChange(field.key, e.target.value)}
                  >
                    <option value="">— Select column —</option>
                    {csvPreview.headers.map((header) => (
                      <option key={header} value={header}>
                        {header}
                      </option>
                    ))}
                  </Select>
                </div>
              ))}
            </div>

            {importType === 'account_snapshots' && (
              <div className="p-3 rounded-lg border border-border bg-muted/20 space-y-2">
                <p className="text-xs font-medium text-foreground">
                  For month-only dates (e.g. &quot;April 2026&quot;), use day:
                </p>
                <div className="flex items-center gap-4">
                  <label className="flex items-center gap-2 text-sm cursor-pointer">
                    <input
                      type="radio"
                      name="snapshotDay"
                      checked={snapshotDayOfMonth === 'end'}
                      onChange={() => setSnapshotDayOfMonth('end')}
                      className="text-primary"
                    />
                    Last day of month
                  </label>
                  <label className="flex items-center gap-2 text-sm cursor-pointer">
                    <input
                      type="radio"
                      name="snapshotDay"
                      checked={typeof snapshotDayOfMonth === 'number'}
                      onChange={() => setSnapshotDayOfMonth(1)}
                      className="text-primary"
                    />
                    Specific day:
                  </label>
                  {typeof snapshotDayOfMonth === 'number' && (
                    <Select
                      className="h-7 rounded-lg"
                      wrapperClassName="w-16"
                      value={snapshotDayOfMonth}
                      onChange={(e) => setSnapshotDayOfMonth(parseInt(e.target.value, 10))}
                    >
                      {Array.from({ length: 28 }, (_, i) => i + 1).map((d) => (
                        <option key={d} value={d}>{d}</option>
                      ))}
                    </Select>
                  )}
                </div>
              </div>
            )}

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

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
          <AccountMappingStep
            uniqueAccountRefs={uniqueAccountRefs}
            accountMapping={accountMapping}
            allAccounts={allAccounts}
            newAccounts={newAccounts}
            EXCLUDED={EXCLUDED}
            handleAccountMappingChange={handleAccountMappingChange}
            handleNewAccountChange={handleNewAccountChange}
            handleAccountMappingNext={handleAccountMappingNext}
            setStep={setStep}
          />
        )}

        {/* Step 6: Category Mapping */}
        {step === 6 && (
          <CategoryMappingStep
            unmappedCategoriesWarnings={unmappedCategoriesWarnings}
            uniqueCategoryNames={uniqueCategoryNames}
            categoryFuzzyScores={categoryFuzzyScores}
            categoryMapping={categoryMapping}
            newCategories={newCategories}
            allCategories={allCategories}
            activeCategoryDropdown={activeCategoryDropdown}
            setActiveCategoryDropdown={setActiveCategoryDropdown}
            categorySearch={categorySearch}
            setCategorySearch={setCategorySearch}
            handleCategoryMappingChange={handleCategoryMappingChange}
            handleNewCategoryChange={handleNewCategoryChange}
            setStep={setStep}
          />
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
                  <SectionHeading className="mb-1">{importResult.status === 'completed' ? 'Import Complete' : 'Import Completed with Issues'}</SectionHeading>
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
                    <div className="flex items-start justify-between gap-2">
                      <span className="text-muted-foreground shrink-0">Type</span>
                      <span className="text-foreground text-right">{importType === 'transactions' ? 'Transactions' : 'Account Snapshots'}</span>
                    </div>
                    <div className="flex items-start justify-between gap-2">
                      <span className="text-muted-foreground shrink-0">File</span>
                      <span className="text-foreground text-right max-w-[60%] truncate">{csvPreview?.fileName}</span>
                    </div>
                    <div className="flex items-start justify-between gap-2">
                      <span className="text-muted-foreground shrink-0">Records to Import</span>
                      <span className="text-foreground text-right">
                        {getImportableRecordsCount()} {getImportableRecordsCount() !== csvPreview?.totalRows && `(filtered from ${csvPreview?.totalRows})`}
                      </span>
                    </div>
                    <div className="flex items-start justify-between gap-2">
                      <span className="text-muted-foreground shrink-0">Accounts matched</span>
                      <span className="text-foreground text-right">
                        {Object.values(accountMapping).filter((id) => id !== 'new').length} / {uniqueAccountRefs.length}
                      </span>
                    </div>
                    {uniqueCategoryNames.length > 0 && (
                      <div className="flex items-start justify-between gap-2">
                        <span className="text-muted-foreground shrink-0">Categories matched</span>
                        <span className="text-foreground text-right">
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
                      <><Spinner size="sm" className="mr-1" /> Importing...</>
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
      <ImportHistoryTable
        logs={logs}
        logsLoading={logsLoading}
        handleDownloadImport={handleDownloadImport}
        deleteConfirm={deleteConfirm}
        setDeleteConfirm={setDeleteConfirm}
        handleDeleteImport={handleDeleteImport}
        deleting={deleting}
      />
    </div>
  );
}
