'use client';

import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { addFrequencyInterval } from '@/lib/utils/paystub';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { SectionHeading } from '@/components/ui/section-heading';
import { Select } from '@/components/ui/select';
import { ActionButton } from '@/components/ui/action-button';
import { Plus } from 'lucide-react';
import type { AutoGenerateSettings, Category, FieldMapping, MappingTemplate, Paystub } from './payroll/types';
import { PAYSTUB_JSON_TEMPLATE, descriptionLabel, groupedMappingKeys, sectionLabel } from './payroll/utils';
import { MappingEditorDialog } from './payroll/mapping-editor-dialog';
import { AutoGenEditorDialog } from './payroll/auto-gen-editor-dialog';
import { ManualAddDialog } from './payroll/manual-add-dialog';
import { PaystubDetailDialog } from './payroll/paystub-detail-dialog';
import { toast } from 'sonner';

// ── Component ────────────────────────────────────────────────────────────────

export default function PayrollTab() {
  // ── Feature Toggle State ──
  const [paystubEnabled, setPaystubEnabled] = useState(false);

  // ── Data State ──
  const [paystubs, setPaystubs] = useState<Paystub[]>([]);
  const [paystubsLoading, setPaystubsLoading] = useState(true);
  const [mappings, setMappings] = useState<MappingTemplate[]>([]);
  const [mappingsLoading, setMappingsLoading] = useState(true);
  const [categories, setCategories] = useState<Category[]>([]);
  const [autoGenSettings, setAutoGenSettings] = useState<AutoGenerateSettings[]>([]);
  const [accounts, setAccounts] = useState<any[]>([]);
  const [tags, setTags] = useState<any[]>([]);

  // ── Import State ──
  const [importMode, setImportMode] = useState<'idle' | 'upload' | 'mapping' | 'importing' | 'done'>('idle');
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importData, setImportData] = useState<any[]>([]);
  const [importStartDate, setImportStartDate] = useState('');
  const [importEmployerName, setImportEmployerName] = useState('');
  const [selectedMappingId, setSelectedMappingId] = useState<string | null>(null);
  const [importResult, setImportResult] = useState<{ imported: number; skipped: number; total: number } | null>(null);
  const [importError, setImportError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Mapping Editor State ──
  const [editingMapping, setEditingMapping] = useState<MappingTemplate | null>(null);
  const [showMappingEditor, setShowMappingEditor] = useState(false);
  const [mappingEditorFields, setMappingEditorFields] = useState<Record<string, FieldMapping>>({});
  const [mappingEditorName, setMappingEditorName] = useState('');
  const [mappingEditorEmployer, setMappingEditorEmployer] = useState('');
  const [mappingEditorAccount, setMappingEditorAccount] = useState<string>('');
  const [mappingEditorTag, setMappingEditorTag] = useState<string>('');
  const [mappingSaving, setMappingSaving] = useState(false);

  // ── Auto-Generate Editor ──
  const [showAutoGenEditor, setShowAutoGenEditor] = useState(false);
  const [autoGenMappingId, setAutoGenMappingId] = useState('');
  const [autoGenFrequency, setAutoGenFrequency] = useState('weekly');
  const [autoGenBasePaystubId, setAutoGenBasePaystubId] = useState('');
  const [autoGenEnabled, setAutoGenEnabled] = useState(false);
  const [autoGenSaving, setAutoGenSaving] = useState(false);
  const [generatingNow, setGeneratingNow] = useState(false);
  const [genResult, setGenResult] = useState<string | null>(null);
  const [deleteAutoGenId, setDeleteAutoGenId] = useState<string | null>(null);
  const [deleteAutoGenLoading, setDeleteAutoGenLoading] = useState(false);

  // ── Manual Add State ──
  const [showManualAdd, setShowManualAdd] = useState(false);
  const [manualAddSaving, setManualAddSaving] = useState(false);
  const [manualAddError, setManualAddError] = useState('');
  const [manualAddForm, setManualAddForm] = useState({
    employerName: '',
    employeeName: '',
    payPeriodStart: '',
    payPeriodEnd: '',
    checkDate: '',
    grossCurrent: '',
    taxesCurrent: '',
    deductionsCurrent: '',
    netCurrent: '',
  });
  const [manualAddMappingId, setManualAddMappingId] = useState('');
  const [manualAddLineItems, setManualAddLineItems] = useState<Array<{
    section: string;
    description: string;
    amount: string;
    mappingAction: string;
    categoryId: string | null;
  }>>([]);

  // ── Paystub View ──
  const [viewingPaystub, setViewingPaystub] = useState<any>(null);
  const [editingPaystub, setEditingPaystub] = useState(false);
  const [editLineItems, setEditLineItems] = useState<Array<{ id: string; amount: string }>>([]);
  const [editSaving, setEditSaving] = useState(false);
  const [paystubFilter, setPaystubFilter] = useState<'all' | 'imported' | 'auto'>('all');

  // ── Delete State ──
  const [deletePaystub, setDeletePaystub] = useState<Paystub | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteMapping, setDeleteMapping] = useState<MappingTemplate | null>(null);
  const [deleteMappingLoading, setDeleteMappingLoading] = useState(false);
  const [showDeleteAllConfirm, setShowDeleteAllConfirm] = useState(false);
  const [deleteAllLoading, setDeleteAllLoading] = useState(false);

  const [showGuidance, setShowGuidance] = useState(false);
  const [copied, setCopied] = useState(false);

  // ── L-3 (TAX_PAYROLL_REVIEW.md): read-only suggestion of the plan's
  // state income-tax modifier from observed YTD state withholdings in the
  // most recent imported paystub ("copy to plan settings"). The plan value
  // is NEVER changed automatically.
  const [stateTaxSuggested, setStateTaxSuggested] = useState<{ pct: number; fromDate: string } | null>(null);
  const [suggestionDismissed, setSuggestionDismissed] = useState(false);
  const [suggestionCopying, setSuggestionCopying] = useState(false);
  const [suggestionMsg, setSuggestionMsg] = useState<string | null>(null);

  useEffect(() => {
    if (paystubsLoading || paystubs.length === 0 || suggestionDismissed) return undefined;
    let cancelled = false;
    (async () => {
      // Paystubs are fetched newest-first; use the latest imported one
      // (auto-generated stubs inherit the base stub's lines and would just
      // double-count the same lines).
      const latest = paystubs.find((p) => !p.isAutoGenerated);
      if (!latest) return;
      try {
        const res = await fetch(`/api/paystubs/${latest.id}`, { credentials: 'include' });
        if (!res.ok) return;
        const stub = await res.json();
        const items = Array.isArray(stub.lineItems) ? stub.lineItems : [];
        let stateYtd = 0;
        let found = false;
        for (const li of items) {
          const desc = String(li?.description || '').toLowerCase();
          if (desc.includes('state') && desc.includes('withhold')) {
            const ytd = Number(li?.ytdAmount);
            if (Number.isFinite(ytd) && ytd > 0) {
              stateYtd += ytd;
              found = true;
            }
          }
        }
        if (!found) return;
        const grossYtd = Number(stub.grossYtd ?? (latest as any).grossYtd ?? latest.grossCurrent);
        if (!Number.isFinite(grossYtd) || grossYtd <= 0) return;
        const pct = Math.round((stateYtd / grossYtd) * 1000) / 10;
        if (pct > 0 && pct < 50 && !cancelled) {
          setStateTaxSuggested({ pct, fromDate: latest.checkDate });
        }
      } catch {}
    })();
    return () => {
      cancelled = true;
    };
  }, [paystubs, paystubsLoading, suggestionDismissed]);

  const handleCopyStateTaxSuggestion = async () => {
    if (!stateTaxSuggested || suggestionCopying) return;
    setSuggestionCopying(true);
    setSuggestionMsg(null);
    try {
      const res = await fetch('/api/retirement/plans', { credentials: 'include' });
      if (!res.ok) throw new Error('unauthorized');
      const plans = await res.json();
      const target = Array.isArray(plans) ? plans.find((p: any) => p.isDefault) ?? plans[0] : null;
      if (!target) {
        setSuggestionMsg('No retirement plan found to copy into.');
        return;
      }
      const upd = await fetch('/api/retirement/plans', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ planId: target.id, settings: { incomeTaxModifier: String(stateTaxSuggested.pct) } }),
      });
      if (!upd.ok) throw new Error('update failed');
      setSuggestionMsg(`Copied ${stateTaxSuggested.pct}% into plan "${target.name}".`);
    } catch {
      setSuggestionMsg('Could not update plan settings.');
    } finally {
      setSuggestionCopying(false);
    }
  };

  const downloadTemplate = () => {
    const blob = new Blob([JSON.stringify(PAYSTUB_JSON_TEMPLATE, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'paystubs_template.json';
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleCopyTemplate = () => {
    navigator.clipboard.writeText(JSON.stringify(PAYSTUB_JSON_TEMPLATE, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // ── Fetch functions ──

  const fetchSettings = useCallback(async () => {
    try {
      const res = await fetch('/api/user-settings', { credentials: 'include' });
      const data = await res.json();
      setPaystubEnabled(data.paystubEnabled ?? false);
    } catch {}
  }, []);

  const fetchPaystubs = useCallback(async () => {
    setPaystubsLoading(true);
    try {
      const res = await fetch('/api/paystubs?limit=1000', { credentials: 'include' });
      const data = await res.json();
      setPaystubs(Array.isArray(data) ? data : []);
    } catch {
      setPaystubs([]);
    } finally {
      setPaystubsLoading(false);
    }
  }, []);

  const fetchMappings = useCallback(async () => {
    setMappingsLoading(true);
    try {
      const res = await fetch('/api/paystubs/mappings', { credentials: 'include' });
      const data = await res.json();
      setMappings(Array.isArray(data) ? data : []);
    } catch {
      setMappings([]);
    } finally {
      setMappingsLoading(false);
    }
  }, []);

  const fetchCategories = useCallback(async () => {
    try {
      const res = await fetch('/api/categories', { credentials: 'include' });
      const data = await res.json();
      setCategories(Array.isArray(data) ? data : []);
    } catch {
      setCategories([]);
    }
  }, []);

  const fetchAutoGenSettings = useCallback(async () => {
    try {
      const res = await fetch('/api/paystubs/auto-generate', { credentials: 'include' });
      const data = await res.json();
      setAutoGenSettings(Array.isArray(data) ? data : []);
    } catch {
      setAutoGenSettings([]);
    }
  }, []);

  const fetchAccounts = useCallback(async () => {
    try {
      const res = await fetch('/api/accounts', { credentials: 'include' });
      const data = await res.json();
      setAccounts(Array.isArray(data) ? data : []);
    } catch {
      setAccounts([]);
    }
  }, []);

  const fetchTags = useCallback(async () => {
    try {
      const res = await fetch('/api/tags', { credentials: 'include' });
      const data = await res.json();
      setTags(Array.isArray(data) ? data : []);
    } catch {
      setTags([]);
    }
  }, []);

  useEffect(() => {
    fetchSettings();
    fetchPaystubs();
    fetchMappings();
    fetchCategories();
    fetchAutoGenSettings();
    fetchAccounts();
    fetchTags();
  }, [fetchSettings, fetchPaystubs, fetchMappings, fetchCategories, fetchAutoGenSettings, fetchAccounts, fetchTags]);

  // ── Toggle handler ──

  const handleToggle = async (enabled: boolean) => {
    setPaystubEnabled(enabled);
    try {
      const res = await fetch('/api/user-settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ paystubEnabled: enabled }),
      });
      if (!res.ok) throw new Error('Failed to save paystub setting');
    } catch {
      setPaystubEnabled(!enabled);
    }
  };

  // ── Import flow ──

  const normalizeInput = (json: any): any[] => {
    if (!json) return [];

    // Check if this is the "paychecks" format
    if (json.paychecks && Array.isArray(json.paychecks)) {
      const employeeName = json.employee?.name || null;
      const employerName = json.employee?.company || '';
      if (employerName && !importEmployerName) {
        setImportEmployerName(employerName);
      }
      return json.paychecks.map((paycheck: any) => {
        // Find pay period dates
        let payPeriodStart = paycheck.checkDate || '';
        let payPeriodEnd = paycheck.checkDate || '';
        if (paycheck.earnings && paycheck.earnings.length > 0) {
          const firstEarning = paycheck.earnings[0];
          payPeriodStart = firstEarning.beginDate || firstEarning.payPeriodEndDate || paycheck.checkDate || '';
          payPeriodEnd = firstEarning.endDate || firstEarning.payPeriodEndDate || paycheck.checkDate || '';
        }

        const grossCurrent = paycheck.totals?.earningsAmount ?? 0;
        const taxesCurrent = paycheck.totals?.taxesAmount ?? 0;
        const deductionsCurrent = paycheck.totals?.deductionsAmount ?? 0;
        const afterTaxDeductionsList = (paycheck.afterTaxDeductions || []).map((d: any) => ({
          description: d.description,
          amount: d.amount,
        }));
        const afterTaxCurrent =
          paycheck.totals?.afterTaxDeductionsAmount ??
          afterTaxDeductionsList.reduce((s: number, d: any) => s + (Number(d.amount) || 0), 0);
        const netCurrent =
          Number(grossCurrent) -
          Number(taxesCurrent) -
          Number(deductionsCurrent) -
          Number(afterTaxCurrent);

        // Build earnings
        const hoursAndEarnings = (paycheck.earnings || []).map((e: any) => ({
          description: e.description,
          hours: e.hours,
          amount: e.amount,
        }));

        // Build taxes
        const taxes = (paycheck.taxes || []).map((t: any) => ({
          description: t.description,
          amount: t.amount,
        }));

        // Build deductions
        const beforeTaxDeductions = (paycheck.deductions || []).map((d: any) => ({
          description: d.description,
          amount: d.amount,
        }));

        return {
          employeeName,
          payPeriodStart,
          payPeriodEnd,
          checkDate: paycheck.checkDate,
          adviceNumber: paycheck.checkNumber,
          grossCurrent: String(grossCurrent),
          taxesCurrent: String(taxesCurrent),
          deductionsCurrent: String(deductionsCurrent),
          netCurrent: String(netCurrent),
          hoursAndEarnings,
          taxes,
          beforeTaxDeductions,
          afterTaxDeductions: afterTaxDeductionsList,
        };
      });
    }

    if (Array.isArray(json)) return json;
    return [json];
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportFile(file);
    setImportError('');

    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const json = JSON.parse(ev.target?.result as string);
        const arr = normalizeInput(json);
        setImportData(arr);
        setImportMode('upload');

        // Extract unique descriptions to build mapping if needed
        if (arr.length > 0 && mappings.length === 0) {
          const allDescs = extractDescriptions(arr);
          const newFields: Record<string, FieldMapping> = {};
          for (const desc of allDescs) {
            newFields[desc] = { action: 'import', categoryId: null, accountId: null, tagId: null };
          }
          setMappingEditorFields(newFields);
          setMappingEditorName('Default Mapping');
          setMappingEditorEmployer('');
        }
      } catch {
        setImportError('Invalid JSON file. Please upload a valid JSON array of paystubs.');
        setImportMode('idle');
      }
    };
    reader.readAsText(file);
  };

  const extractDescriptions = (data: any[]): string[] => {
    const descs = new Set<string>();
    for (const stub of data) {
      for (const item of stub.hoursAndEarnings ?? []) descs.add(`earnings:${item.description}`);
      for (const item of stub.taxes ?? []) descs.add(`taxes:${item.description}`);
      for (const item of stub.beforeTaxDeductions ?? []) descs.add(`before_tax_deductions:${item.description}`);
      for (const item of stub.afterTaxDeductions ?? []) descs.add(`after_tax_deductions:${item.description}`);
    }
    return Array.from(descs);
  };

  const handleImport = async () => {
    if (!selectedMappingId && mappings.length === 0) {
      setImportError('Please create a field mapping first.');
      return;
    }

    setImportMode('importing');
    setImportError('');

    try {
      const res = await fetch('/api/paystubs/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          paystubs: importData,
          mappingId: selectedMappingId || mappings[0]?.id,
          startDate: importStartDate || undefined,
          employerName: importEmployerName || 'Employer',
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Import failed');
      setImportResult(data);
      setImportMode('done');
      fetchPaystubs();
    } catch (err) {
      setImportError(err instanceof Error ? err.message : 'Import failed');
      setImportMode('upload');
    }
  };

  const resetImport = () => {
    setImportMode('idle');
    setImportFile(null);
    setImportData([]);
    setImportStartDate('');
    setImportEmployerName('');
    setImportResult(null);
    setImportError('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // ── Mapping CRUD ──

  const handleSaveMapping = async () => {
    setMappingSaving(true);
    try {
      // Convert the sectioned keys back to flat mappings
      const flatMappings: Record<string, FieldMapping> = {};
      for (const [key, value] of Object.entries(mappingEditorFields)) {
        flatMappings[key] = value;
      }

      if (editingMapping) {
        await fetch(`/api/paystubs/mappings/${editingMapping.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            name: mappingEditorName,
            employerName: mappingEditorEmployer,
            mappings: flatMappings,
            accountId: mappingEditorAccount || null,
            tagId: mappingEditorTag || null,
          }),
        });
      } else {
        await fetch('/api/paystubs/mappings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            name: mappingEditorName,
            employerName: mappingEditorEmployer,
            isDefault: mappings.length === 0,
            mappings: flatMappings,
            accountId: mappingEditorAccount || null,
            tagId: mappingEditorTag || null,
          }),
        });
      }
      setShowMappingEditor(false);
      setEditingMapping(null);
      fetchMappings();
    } catch {}
    setMappingSaving(false);
  };

  const openMappingEditor = (mapping?: MappingTemplate) => {
    if (mapping) {
      setEditingMapping(mapping);
      setMappingEditorName(mapping.name);
      setMappingEditorEmployer(mapping.employerName);
      setMappingEditorFields(mapping.mappings as Record<string, FieldMapping>);
      setMappingEditorAccount(mapping.accountId || '');
      setMappingEditorTag(mapping.tagId || '');
    } else {
      setEditingMapping(null);
      setMappingEditorName('');
      setMappingEditorEmployer('');
      setMappingEditorAccount('');
      setMappingEditorTag('');
      // If we have import data, pre-populate from it
      if (importData.length > 0) {
        const allDescs = extractDescriptions(importData);
        const newFields: Record<string, FieldMapping> = {};
        for (const desc of allDescs) {
          newFields[desc] = { action: 'import', categoryId: null, accountId: null, tagId: null };
        }
        setMappingEditorFields(newFields);
      } else {
        setMappingEditorFields({});
      }
    }
    setShowMappingEditor(true);
  };

  const handleDeleteMapping = async () => {
    if (!deleteMapping) return;
    setDeleteMappingLoading(true);
    try {
      await fetch(`/api/paystubs/mappings/${deleteMapping.id}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      setDeleteMapping(null);
      fetchMappings();
    } catch {}
    setDeleteMappingLoading(false);
  };

  // ── Auto-Generate ──

  const handleSaveAutoGen = async () => {
    setAutoGenSaving(true);
    try {
      await fetch('/api/paystubs/auto-generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          mappingId: autoGenMappingId,
          isEnabled: autoGenEnabled,
          frequency: autoGenFrequency,
          basePaystubId: autoGenBasePaystubId || null,
        }),
      });
      setShowAutoGenEditor(false);
      fetchAutoGenSettings();
    } catch {}
    setAutoGenSaving(false);
  };

  const handleGenerateNow = async () => {
    setGeneratingNow(true);
    setGenResult(null);
    try {
      const res = await fetch('/api/paystubs/auto-generate?force=true', {
        method: 'PATCH',
        credentials: 'include',
      });
      const data = await res.json();
      if (data.generated > 0) {
        setGenResult(`Generated ${data.generated} paystub${data.generated !== 1 ? 's' : ''}`);
      } else {
        setGenResult('No paystub to generate — check that a template paystub exists and the setting is enabled');
      }
      fetchPaystubs();
      fetchAutoGenSettings();
    } catch {
      setGenResult('Failed to generate. Check console for details.');
    }
    setGeneratingNow(false);
  };

  const handleDeleteAutoGen = async () => {
    if (!deleteAutoGenId) return;
    setDeleteAutoGenLoading(true);
    try {
      await fetch(`/api/paystubs/auto-generate?id=${deleteAutoGenId}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      setDeleteAutoGenId(null);
      fetchAutoGenSettings();
    } catch {}
    setDeleteAutoGenLoading(false);
  };

  // ── Manual Add ──

  const handleManualAdd = async () => {
    setManualAddSaving(true);
    setManualAddError('');
    try {
      const lineItems = manualAddLineItems
        .filter((li) => li.amount && parseFloat(li.amount) !== 0)
        .map((li) => ({
          ...li,
          amount: li.amount,
        }));

      const res = await fetch('/api/paystubs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          employerName: manualAddForm.employerName,
          employeeName: manualAddForm.employeeName || null,
          payPeriodStart: manualAddForm.payPeriodStart,
          payPeriodEnd: manualAddForm.payPeriodEnd,
          checkDate: manualAddForm.checkDate,
          grossCurrent: manualAddForm.grossCurrent || '0',
          taxesCurrent: manualAddForm.taxesCurrent || '0',
          deductionsCurrent: manualAddForm.deductionsCurrent || '0',
          netCurrent: manualAddForm.netCurrent || '0',
          mappingId: manualAddMappingId || null,
          lineItems,
        }),
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `Request failed (${res.status})`);
      }
      setShowManualAdd(false);
      setManualAddError('');
      setManualAddForm({
        employerName: '',
        employeeName: '',
        payPeriodStart: '',
        payPeriodEnd: '',
        checkDate: '',
        grossCurrent: '',
        taxesCurrent: '',
        deductionsCurrent: '',
        netCurrent: '',
      });
      setManualAddMappingId('');
      setManualAddLineItems([]);
      fetchPaystubs();
    } catch (err) {
      setManualAddError(err instanceof Error ? err.message : 'Failed to create paystub');
    }
    setManualAddSaving(false);
  };

  // ── Paystub View ──

  const handleViewPaystub = async (id: string) => {
    setEditingPaystub(false);
    setEditLineItems([]);
    try {
      const res = await fetch(`/api/paystubs/${id}`, { credentials: 'include' });
      const data = await res.json();
      setViewingPaystub(data);
    } catch {}
  };

  const handleEditPaystubFromList = async (id: string) => {
    setEditingPaystub(true);
    try {
      const res = await fetch(`/api/paystubs/${id}`, { credentials: 'include' });
      const data = await res.json();
      setViewingPaystub(data);
      if (data.lineItems) {
        setEditLineItems(data.lineItems.map((li: any) => ({ id: li.id, amount: li.amount })));
      }
    } catch {
      setEditingPaystub(false);
    }
  };

  const handleStartEdit = () => {
    if (!viewingPaystub?.lineItems) return;
    setEditLineItems(
      viewingPaystub.lineItems.map((li: any) => ({ id: li.id, amount: li.amount }))
    );
    setEditingPaystub(true);
  };

  const handleCancelEdit = () => {
    setEditingPaystub(false);
    setEditLineItems([]);
  };

  const handleEditLineItemAmount = (lineItemId: string, amount: string) => {
    setEditLineItems((prev) =>
      prev.map((item) => (item.id === lineItemId ? { ...item, amount } : item))
    );
  };

  const handleSaveEdit = async () => {
    if (!viewingPaystub) return;
    setEditSaving(true);
    try {
      const res = await fetch(`/api/paystubs/${viewingPaystub.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ lineItems: editLineItems }),
      });
      if (!res.ok) throw new Error('Failed to save');
      const updated = await res.json();
      setViewingPaystub(updated);
      setEditingPaystub(false);
      fetchPaystubs();
    } catch {}
    setEditSaving(false);
  };

  // ── Paystub Delete ──

  const handleDeletePaystub = async () => {
    if (!deletePaystub) return;
    setDeleteLoading(true);
    try {
      await fetch(`/api/paystubs/${deletePaystub.id}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      setDeletePaystub(null);
      fetchPaystubs();
    } catch {}
    setDeleteLoading(false);
  };

  const handleDeleteAllPaystubs = async () => {
    setDeleteAllLoading(true);
    try {
      await fetch(`/api/paystubs?filter=${paystubFilter}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      setShowDeleteAllConfirm(false);
      fetchPaystubs();
    } catch {}
    setDeleteAllLoading(false);
  };

  const handleDownloadPaystubJson = (paystub: any) => {
    if (!paystub?.sourceJson) return;
    try {
      const parsed = JSON.parse(paystub.sourceJson);
      const blob = new Blob([JSON.stringify(parsed, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `paystub_${paystub.checkDate}.json`;
      link.click();
      URL.revokeObjectURL(url);
    } catch {
      toast.error('Failed to parse or download the original paystub JSON.');
    }
  };

  // ── Helpers ──

  const formatCurrency = (val: string | number) => {
    const num = typeof val === 'string' ? parseFloat(val) : val;
    if (isNaN(num)) return '$0.00';
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(num);
  };

  const formatDate = (dateStr: string) => {
    if (!dateStr) return '';
    const d = new Date(dateStr + 'T00:00:00');
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  const sectionLabel = (key: string) => {
    const section = key.split(':')[0];
    switch (section) {
      case 'earnings': return 'Earnings';
      case 'taxes': return 'Taxes';
      case 'before_tax_deductions': return 'Pre-Tax Deductions';
      case 'after_tax_deductions': return 'Post-Tax Deductions';
      default: return section;
    }
  };

  const descriptionLabel = (key: string) => key.split(':').slice(1).join(':');

  const groupedMappingKeys = (fields: Record<string, FieldMapping>) => {
    const groups: Record<string, string[]> = {};
    for (const key of Object.keys(fields)) {
      const section = key.split(':')[0];
      if (!groups[section]) groups[section] = [];
      groups[section].push(key);
    }
    return groups;
  };

  const filteredPaystubs = paystubs.filter((p) => {
    if (paystubFilter === 'imported') return !p.isAutoGenerated;
    if (paystubFilter === 'auto') return p.isAutoGenerated;
    return true;
  });

  const getCategoryName = (id: string | null) => {
    if (!id) return '—';
    const cat = categories.find((c) => c.id === id);
    return cat?.name ?? '—';
  };

  // ── Upcoming Auto-Generate Schedule ──

  const upcomingSchedule = useMemo(() => {
    const today = new Date().toISOString().split('T')[0];

    return autoGenSettings
      .filter((s) => s.isEnabled)
      .map((ags) => {
        const mapping = mappings.find((m) => m.id === ags.mappingId);

        // Resolve the template paystub
        let templatePaystub: Paystub | undefined;
        if (ags.basePaystubId) {
          templatePaystub = paystubs.find((p) => p.id === ags.basePaystubId);
        }
        if (!templatePaystub) {
          templatePaystub = paystubs
            .filter((p) => !p.isAutoGenerated)
            .sort((a, b) => b.checkDate.localeCompare(a.checkDate))[0];
        }
        if (!templatePaystub) return null;

        // Resolve the reference date for computing the next expected date
        let refDate = ags.lastGeneratedDate || templatePaystub.checkDate;

        const entries: Array<{ date: string; gross: string; net: string; status: 'overdue' | 'today' | 'upcoming'; daysUntil: number }> = [];
        let cursor = addFrequencyInterval(refDate, ags.frequency);

        for (let i = 0; i < 4; i++) {
          const dateMs = new Date(cursor + 'T00:00:00Z').getTime();
          const todayMs = new Date(today + 'T00:00:00Z').getTime();
          const diffDays = Math.round((dateMs - todayMs) / 86400000);

          let status: 'overdue' | 'today' | 'upcoming';
          if (diffDays < 0) status = 'overdue';
          else if (diffDays === 0) status = 'today';
          else status = 'upcoming';

          entries.push({
            date: cursor,
            gross: templatePaystub.grossCurrent,
            net: templatePaystub.netCurrent,
            status,
            daysUntil: diffDays,
          });
          cursor = addFrequencyInterval(cursor, ags.frequency);
        }

        return {
          mappingId: ags.mappingId,
          mappingName: mapping?.name || 'Unknown Mapping',
          entries,
        };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null);
  }, [autoGenSettings, paystubs, mappings]);

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* Feature Toggle */}
      <div className="p-5 bg-card border border-border rounded-xl">
        <div className="flex items-center justify-between gap-4">
          <div className="flex-1 min-w-0">
            <SectionHeading>Paystub Integration</SectionHeading>
            <p className="text-xs text-muted-foreground mt-1">
              {paystubEnabled
                ? 'Paystub data is included in charts and calculations.'
                : 'When disabled, paystub data is hidden from all charts and calculations but remains stored.'}
            </p>
          </div>
          <Switch
            checked={paystubEnabled}
            onCheckedChange={handleToggle}
          />
        </div>
      </div>

      {/* Import Section */}
      <div className="p-5 bg-card border border-border rounded-xl">
        <SectionHeading className="mb-4">Import Paystubs</SectionHeading>

        {importMode === 'idle' && (
          <div className="space-y-3">
            <div className="flex gap-2">
              <button
                onClick={() => fileInputRef.current?.click()}
                className="px-4 py-2 text-sm font-medium text-primary-foreground bg-primary rounded-lg hover:opacity-90 transition-all"
              >
                📄 Import JSON
              </button>
              <button
                onClick={() => setShowGuidance(!showGuidance)}
                className="px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground border border-border hover:bg-muted rounded-lg transition-colors"
              >
                {showGuidance ? '🙈 Hide Guidance' : 'ℹ️ Format Help & Template'}
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".json"
                onChange={handleFileSelect}
                className="hidden"
              />
            </div>
            {importError && (
              <div className="p-3 bg-destructive/20 border border-destructive/30 rounded-lg">
                <p className="text-destructive text-sm">{importError}</p>
              </div>
            )}

            {showGuidance && (
              <div className="mt-4 p-5 bg-muted/50 border border-border rounded-xl space-y-4 text-sm animate-in fade-in slide-in-from-top-2 duration-200">
                <div className="space-y-1">
                  <h3 className="font-semibold text-foreground">Getting Started Guide</h3>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    To import your payroll history, prepare a JSON file formatted as an array of paystub objects.
                    The application maps your payroll descriptions (like "Regular Pay", "Fed Withholding") to account categories using field mappings.
                  </p>
                </div>

                <div className="space-y-2">
                  <h4 className="text-xs font-semibold text-foreground uppercase tracking-wider">Required Schema:</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs text-muted-foreground">
                    <div className="p-3 bg-background border border-border rounded-lg space-y-1">
                      <div className="font-medium text-foreground">Header Details</div>
                      <p><code className="text-primary font-mono font-bold">checkDate</code>: date paid (<code className="bg-muted px-1 rounded">MM/DD/YYYY</code>)</p>
                      <p><code className="text-primary font-mono font-bold">payPeriodStart</code> / <code className="text-primary font-mono font-bold">payPeriodEnd</code>: (<code className="bg-muted px-1 rounded">MM/DD/YYYY</code>)</p>
                      <p><code className="text-primary font-mono font-bold">grossCurrent</code> / <code className="text-primary font-mono font-bold">netCurrent</code>: total earnings / net pay</p>
                    </div>
                    <div className="p-3 bg-background border border-border rounded-lg space-y-1">
                      <div className="font-medium text-foreground">Line Item Sections</div>
                      <p><code className="text-primary font-mono font-bold">hoursAndEarnings</code>: base pay, bonuses, reimbursements</p>
                      <p><code className="text-primary font-mono font-bold">taxes</code>: federal, state, and local withholdings</p>
                      <p><code className="text-primary font-mono font-bold">beforeTaxDeductions</code>: pre-tax 401k, health premium</p>
                      <p><code className="text-primary font-mono font-bold">afterTaxDeductions</code>: post-tax Roth, life insurance</p>
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  <h4 className="text-xs font-semibold text-foreground uppercase tracking-wider">Target Accounts &amp; Duplicate Prevention:</h4>
                  <div className="p-4 bg-background border border-border rounded-lg space-y-3 text-xs text-muted-foreground leading-relaxed">
                    <p>
                      When importing paystubs, you can map transactions to either a real account or a virtual &quot;From Paystub&quot; account to suit your tracking workflow:
                    </p>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-2">
                      <div className="space-y-1">
                        <span className="font-semibold text-foreground">1. Virtual Account (From Paystub) — Recommended</span>
                        <p>
                          Maps transactions to a hidden account excluded from Net Worth. This records your gross earnings, taxes, and deduction line items for cash flow/spending charts, <span className="font-medium text-foreground">without double-counting</span> the net paycheck deposit already imported by your bank.
                        </p>
                      </div>
                      <div className="space-y-1">
                        <span className="font-semibold text-foreground">2. Real Account (e.g., Checking/Savings)</span>
                        <p>
                          Maps transactions directly to a real bank account. Use this if you manually manage your accounts and want paystub transactions to directly update that balance. To avoid double-counting, you will need to <span className="font-medium text-foreground">ignore or exclude the bank's imported net paycheck deposit transaction</span>.
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-semibold text-foreground uppercase tracking-wider">Template JSON Preview:</h4>
                    <div className="flex gap-2">
                      <button
                        onClick={downloadTemplate}
                        className="px-2.5 py-1 text-[11px] font-medium text-primary bg-primary/10 hover:bg-primary/20 rounded-md transition-colors"
                      >
                        📥 Download JSON Template
                      </button>
                      <button
                        onClick={handleCopyTemplate}
                        className="px-2.5 py-1 text-[11px] font-medium text-muted-foreground hover:text-foreground border border-border hover:bg-muted rounded-md transition-colors w-28"
                      >
                        {copied ? '✅ Copied!' : '📋 Copy JSON'}
                      </button>
                    </div>
                  </div>
                  <pre className="p-3 bg-background border border-border rounded-lg text-xs font-mono overflow-x-auto text-muted-foreground max-h-60">
                    {JSON.stringify(PAYSTUB_JSON_TEMPLATE, null, 2)}
                  </pre>
                </div>
              </div>
            )}
          </div>
        )}

        {importMode === 'upload' && importData.length > 0 && (
          <div className="space-y-4">
            <div className="p-3 bg-primary/5 border border-primary/20 rounded-lg">
              <p className="text-sm text-foreground">
                Found <strong>{importData.length}</strong> paystub{importData.length !== 1 ? 's' : ''} in{' '}
                <span className="font-mono text-xs">{importFile?.name}</span>
              </p>
              {importData.length > 0 && (
                <p className="text-xs text-muted-foreground mt-1">
                  Date range: {importData[importData.length - 1]?.checkDate} — {importData[0]?.checkDate}
                </p>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">Employer Name</label>
                <Input
                  value={importEmployerName}
                  onChange={(e) => setImportEmployerName(e.target.value)}
                  placeholder="e.g., Acme Corp"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">Import From (optional)</label>
                <Input
                  type="date"
                  value={importStartDate}
                  onChange={(e) => setImportStartDate(e.target.value)}
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-foreground mb-1">Field Mapping</label>
              {mappings.length > 0 ? (
                <div className="flex items-center gap-2">
                  <Select
                    wrapperClassName="flex-1"
                    value={selectedMappingId || ''}
                    onChange={(e) => setSelectedMappingId(e.target.value)}
                  >
                    {mappings.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name} {m.employerName ? `(${m.employerName})` : ''} {m.isDefault ? '★' : ''}
                      </option>
                    ))}
                  </Select>
                  <button
                    onClick={() => openMappingEditor(mappings.find((m) => m.id === selectedMappingId) || mappings[0])}
                    className="px-3 py-2 text-xs font-medium text-muted-foreground hover:text-foreground border border-border hover:bg-muted rounded-lg transition-colors"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => openMappingEditor()}
                    className="px-3 py-2 text-xs font-medium text-primary bg-primary/10 hover:bg-primary/20 rounded-lg transition-colors"
                  >
                    New
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => openMappingEditor()}
                  className="w-full px-4 py-2 text-sm font-medium text-primary bg-primary/10 hover:bg-primary/20 rounded-lg transition-colors border border-primary/20"
                >
                  + Create Field Mapping
                </button>
              )}
            </div>

            {importError && (
              <div className="p-3 bg-destructive/20 border border-destructive/30 rounded-lg">
                <p className="text-destructive text-sm">{importError}</p>
              </div>
            )}

            <div className="flex gap-2">
              <button
                onClick={handleImport}
                disabled={mappings.length === 0}
                className="px-4 py-2 text-sm font-medium text-primary-foreground bg-primary rounded-lg hover:opacity-90 transition-all disabled:opacity-50"
              >
                Import Paystubs
              </button>
              <button
                onClick={resetImport}
                className="px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground border border-border hover:bg-muted rounded-lg transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {importMode === 'importing' && (
          <div className="p-4 text-center">
            <div className="text-sm text-muted-foreground animate-pulse">Importing paystubs...</div>
          </div>
        )}

        {importMode === 'done' && importResult && (
          <div className="space-y-3">
            <div className="p-4 bg-chart-1/10 border border-chart-1/20 rounded-lg">
              <p className="text-sm text-chart-1 font-medium">Import Complete</p>
              <div className="text-xs text-chart-1/80 mt-1 space-y-0.5">
                <p>{importResult.imported} paystubs imported</p>
                {importResult.skipped > 0 && <p>{importResult.skipped} skipped (duplicates)</p>}
                <p>{importResult.total} total in file</p>
              </div>
            </div>
            <button
              onClick={resetImport}
              className="px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground border border-border hover:bg-muted rounded-lg transition-colors"
            >
              Done
            </button>
          </div>
        )}
      </div>

      {/* Field Mappings List */}
      <div className="p-5 bg-card border border-border rounded-xl">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-base font-semibold text-foreground">Field Mappings</h2>
            <p className="text-xs text-muted-foreground mt-1">
              Define how paystub line items map to categories. Supports multiple employers.
            </p>
          </div>
          <button
            onClick={() => openMappingEditor()}
            className="px-3 py-1.5 text-xs font-medium text-primary bg-primary/10 hover:bg-primary/20 rounded-lg transition-colors"
          >
            + New Mapping
          </button>
        </div>

        {mappingsLoading ? (
          <div className="text-muted-foreground text-sm">Loading...</div>
        ) : mappings.length === 0 ? (
          <p className="text-muted-foreground text-sm">No field mappings yet. Create one to start importing paystubs.</p>
        ) : (
          <div className="space-y-2">
            {mappings.map((m) => (
              <div
                key={m.id}
                className="p-3 bg-muted/50 border border-border rounded-lg flex items-center justify-between"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-foreground">{m.name}</span>
                    {m.isDefault && (
                      <span className="px-1.5 py-0.5 text-[10px] rounded bg-primary/20 text-primary font-medium">Default</span>
                    )}
                  </div>
                  {m.employerName && (
                    <p className="text-xs text-muted-foreground mt-0.5">{m.employerName}</p>
                  )}
                  <p className="text-xs text-muted-foreground">
                    {Object.keys(m.mappings).length} fields mapped
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => openMappingEditor(m)}
                    className="px-2.5 py-1 text-xs font-medium text-muted-foreground hover:text-foreground border border-border hover:bg-muted rounded-lg transition-colors"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => setDeleteMapping(m)}
                    className="px-2.5 py-1 text-xs font-medium text-destructive hover:bg-destructive/10 border border-destructive/30 rounded-lg transition-colors"
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Auto-Generate Section */}
      <div className="p-5 bg-card border border-border rounded-xl">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-base font-semibold text-foreground">Auto-Generate Paystubs</h2>
            <p className="text-xs text-muted-foreground mt-1">
              Automatically create paystubs on each pay date using a template from your most recent stub.
              Auto-generated stubs are clearly marked and separate from imported data.
            </p>
          </div>
          {autoGenSettings.some((s) => s.isEnabled) && upcomingSchedule.some((g) => g.entries.some((e) => e.status === 'overdue')) && (
            <button
              onClick={handleGenerateNow}
              disabled={generatingNow}
              className="px-3 py-1.5 text-xs font-medium text-primary-foreground bg-primary rounded-lg hover:opacity-90 disabled:opacity-50 transition-all flex items-center gap-1.5"
            >
              {generatingNow ? (
                <>Generating...</>
              ) : (
                <>Generate Overdue</>
              )}
            </button>
          )}
        </div>

        {genResult && (
          <div className={`mb-3 px-3 py-2 text-xs rounded-lg ${
            genResult.startsWith('Generated')
              ? 'bg-chart-1/20 text-chart-1'
              : 'bg-muted text-muted-foreground'
          }`}>
            {genResult}
          </div>
        )}

        {autoGenSettings.length > 0 ? (
          <div className="space-y-2">
            {autoGenSettings.map((ags) => {
              const mapping = mappings.find((m) => m.id === ags.mappingId);
              return (
                <div
                  key={ags.id}
                  className="p-3 bg-muted/50 border border-border rounded-lg flex items-center justify-between"
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-foreground">
                        {mapping?.name || 'Unknown Mapping'}
                      </span>
                      <span className={`px-1.5 py-0.5 text-[10px] rounded font-medium ${
                        ags.isEnabled ? 'bg-chart-1/20 text-chart-1' : 'bg-muted text-muted-foreground'
                      }`}>
                        {ags.isEnabled ? 'Active' : 'Paused'}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Frequency: {ags.frequency} · Last generated: {ags.lastGeneratedDate ? formatDate(ags.lastGeneratedDate) : 'Never'}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setDeleteAutoGenId(ags.id)}
                      className="px-2.5 py-1 text-xs font-medium text-destructive hover:bg-destructive/10 border border-destructive/30 rounded-lg transition-colors"
                    >
                      Delete
                    </button>
                    <button
                      onClick={() => {
                        setAutoGenMappingId(ags.mappingId);
                        setAutoGenFrequency(ags.frequency);
                        setAutoGenBasePaystubId(ags.basePaystubId || '');
                        setAutoGenEnabled(ags.isEnabled);
                        setShowAutoGenEditor(true);
                      }}
                      className="px-2.5 py-1 text-xs font-medium text-muted-foreground hover:text-foreground border border-border hover:bg-muted rounded-lg transition-colors"
                    >
                      Edit
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <button
            onClick={() => {
              setAutoGenMappingId(mappings[0]?.id || '');
              setAutoGenFrequency('weekly');
              setAutoGenBasePaystubId('');
              setAutoGenEnabled(false);
              setShowAutoGenEditor(true);
            }}
            disabled={mappings.length === 0}
            className="w-full px-4 py-2 text-sm font-medium text-primary bg-primary/10 hover:bg-primary/20 rounded-lg transition-colors border border-primary/20 disabled:opacity-50"
          >
            + Set Up Auto-Generate
          </button>
        )}

        {/* Upcoming Schedule */}
        {autoGenSettings.some((s) => s.isEnabled) && (
          <div className="mt-4 pt-4 border-t border-border">
            <h3 className="text-xs font-semibold text-foreground mb-2">Upcoming Schedule</h3>
            {upcomingSchedule.length > 0 ? (
              <div className="space-y-3">
                {upcomingSchedule.map((group) => (
                  <div key={group.mappingId}>
                    <p className="text-[11px] text-muted-foreground mb-1">{group.mappingName}</p>
                  <div className="grid grid-cols-[1fr_auto_auto_auto] gap-x-3 gap-y-1 text-xs">
                    <div className="text-muted-foreground font-medium">Date</div>
                    <div className="text-muted-foreground font-medium text-right">Gross</div>
                    <div className="text-muted-foreground font-medium text-right">Net</div>
                    <div className="text-muted-foreground font-medium text-right">Status</div>
                    {group.entries.map((e) => (
                      <React.Fragment key={e.date}>
                        <div className="text-foreground">{formatDate(e.date)}</div>
                        <div className="text-foreground text-right blur-number">{formatCurrency(e.gross)}</div>
                        <div className="text-foreground text-right blur-number">{formatCurrency(e.net)}</div>
                        <div className={`text-right font-medium ${e.status === 'overdue' ? 'text-destructive' : e.status === 'today' ? 'text-chart-1' : 'text-muted-foreground'}`}>
                          {e.status === 'overdue' ? 'Overdue' : e.status === 'today' ? 'Today' : e.daysUntil <= 1 ? 'Tomorrow' : `In ${e.daysUntil} days`}
                        </div>
                      </React.Fragment>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">No template paystub available. Import a paystub and ensure auto-generate is enabled with a base template.</p>
          )}
          </div>
        )}
      </div>

      {/* Paystub History */}
      <div className="p-5 bg-card border border-border rounded-xl">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-base font-semibold text-foreground">Paystub History</h2>
            <p className="text-xs text-muted-foreground mt-1">
              {paystubs.length} paystub{paystubs.length !== 1 ? 's' : ''} on file
            </p>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex rounded-lg bg-muted border border-border overflow-hidden">
              {(['all', 'imported', 'auto'] as const).map((filter) => (
                <button
                  key={filter}
                  onClick={() => setPaystubFilter(filter)}
                  className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                    paystubFilter === filter
                      ? 'bg-primary text-primary-foreground'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {filter === 'all' ? 'All' : filter === 'imported' ? 'Imported' : 'Auto'}
                </button>
              ))}
            </div>
            <ActionButton
              onClick={() => setShowManualAdd(true)}
              icon={Plus}
            >
              Add Paystub
            </ActionButton>
            {filteredPaystubs.length > 0 && (
              <button
                onClick={() => setShowDeleteAllConfirm(true)}
                className="px-3 py-1.5 text-xs font-medium text-destructive bg-destructive/10 hover:bg-destructive/20 border border-destructive/20 hover:border-destructive/30 rounded-lg transition-colors"
              >
                Delete All
              </button>
            )}
          </div>
        </div>

        {/* ── L-3 (TAX_PAYROLL_REVIEW.md): read-only state-tax modifier
            suggestion from observed YTD state withholdings. Nothing is
            changed automatically. */}
        {stateTaxSuggested && !suggestionDismissed && paystubs.length > 0 && (
          <div className="mb-3 flex flex-wrap items-center gap-2 rounded-lg border border-amber-300/50 bg-amber-50 dark:bg-amber-500/10 px-3 py-2">
            <span className="text-xs font-medium text-foreground">
              💡 Based on state withholding in your latest imported paystub ({stateTaxSuggested.fromDate}), a{" "}
              <span className="font-mono font-bold text-primary">{stateTaxSuggested.pct}%</span> state income-tax rate is suggested
              for your retirement plan's flat state/local rate.
            </span>
            <button
              onClick={handleCopyStateTaxSuggestion}
              disabled={suggestionCopying}
              className="px-2 py-1 text-[11px] font-medium text-primary bg-primary/10 hover:bg-primary/20 border border-primary/20 rounded transition-colors disabled:opacity-50"
            >
              {suggestionCopying ? 'Copying…' : 'Copy to plan settings'}
            </button>
            {suggestionMsg && <span className="text-[11px] text-muted-foreground">{suggestionMsg}</span>}
            <button
              aria-label="Dismiss state tax suggestion"
              onClick={() => setSuggestionDismissed(true)}
              className="ml-auto px-1.5 text-xs text-muted-foreground hover:text-foreground"
            >
              ✕
            </button>
          </div>
        )}

        {paystubsLoading ? (
          <div className="text-muted-foreground text-sm">Loading...</div>
        ) : filteredPaystubs.length === 0 ? (
          <p className="text-muted-foreground text-sm">No paystubs found.</p>
        ) : (
          <div className="space-y-1.5 max-h-[400px] overflow-y-auto">
            {filteredPaystubs.map((p) => (
              <div
                key={p.id}
                className="p-3 bg-muted/50 border border-border rounded-lg flex items-center justify-between hover:bg-muted/70 transition-colors cursor-pointer"
                onClick={() => handleViewPaystub(p.id)}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <span className="text-lg flex-shrink-0">{p.isAutoGenerated ? '🔄' : '📄'}</span>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-foreground">{formatDate(p.checkDate)}</span>
                      {p.isAutoGenerated && (
                        <span 
                          className="goal-pill px-1.5 py-0.5 text-[10px] rounded font-medium"
                          style={{ '--goal-color': 'var(--chart-3)' } as React.CSSProperties}
                        >
                          Auto
                        </span>
                      )}
                      {!p.isAutoGenerated && p.tiesOut === false && (
                        <span
                          title="This stub does not tie out against its YTD totals (gross − taxes − deductions ≠ net, or a YTD jump). Please review."
                          className="px-1.5 py-0.5 text-[10px] rounded font-medium text-amber-950 bg-amber-300 dark:bg-amber-500 dark:text-amber-950"
                        >
                          ⚠️ Does not tie out
                        </span>
                      )}
                      {p.employerName && (
                        <span className="text-xs text-muted-foreground">{p.employerName}</span>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      Gross: <span className="blur-number">{formatCurrency(p.grossCurrent)}</span>
                      {' · '}Net: <span className="blur-number">{formatCurrency(p.netCurrent)}</span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <button
                    onClick={(e) => { e.stopPropagation(); handleEditPaystubFromList(p.id); }}
                    className="px-2 py-1 text-xs font-medium text-muted-foreground hover:text-foreground border border-border hover:bg-muted rounded transition-colors"
                  >
                    Edit
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); setDeletePaystub(p); }}
                    className="px-2 py-1 text-xs font-medium text-destructive hover:bg-destructive/10 rounded transition-colors"
                  >
                    ✕
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <MappingEditorDialog
        open={showMappingEditor}
        onOpenChange={setShowMappingEditor}
        editingMapping={editingMapping}
        mappingEditorFields={mappingEditorFields}
        setMappingEditorFields={setMappingEditorFields}
        mappingEditorName={mappingEditorName}
        setMappingEditorName={setMappingEditorName}
        mappingEditorEmployer={mappingEditorEmployer}
        setMappingEditorEmployer={setMappingEditorEmployer}
        mappingEditorAccount={mappingEditorAccount}
        setMappingEditorAccount={setMappingEditorAccount}
        mappingEditorTag={mappingEditorTag}
        setMappingEditorTag={setMappingEditorTag}
        mappingSaving={mappingSaving}
        accounts={accounts}
        tags={tags}
        categories={categories}
        handleSaveMapping={handleSaveMapping}
      />

      <AutoGenEditorDialog
        open={showAutoGenEditor}
        onOpenChange={setShowAutoGenEditor}
        autoGenEnabled={autoGenEnabled}
        setAutoGenEnabled={setAutoGenEnabled}
        autoGenMappingId={autoGenMappingId}
        setAutoGenMappingId={setAutoGenMappingId}
        autoGenFrequency={autoGenFrequency}
        setAutoGenFrequency={setAutoGenFrequency}
        autoGenBasePaystubId={autoGenBasePaystubId}
        setAutoGenBasePaystubId={setAutoGenBasePaystubId}
        mappings={mappings}
        paystubs={paystubs}
        autoGenSaving={autoGenSaving}
        handleSaveAutoGen={handleSaveAutoGen}
      />

      {/* ── Delete Auto-Gen Setting Confirmation ── */}
      <AlertDialog open={!!deleteAutoGenId} onOpenChange={(open) => !open && setDeleteAutoGenId(null)}>
        <AlertDialogContent className="max-w-sm">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Auto-Generate Setting</AlertDialogTitle>
            <AlertDialogDescription>
              Delete this auto-generate configuration? Existing auto-generated paystubs will not be affected.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <button
              type="button"
              onClick={handleDeleteAutoGen}
              disabled={deleteAutoGenLoading}
              className="inline-flex h-9 items-center justify-center rounded-lg bg-destructive px-4 py-2 text-sm font-semibold text-destructive-foreground hover:opacity-90 transition-opacity disabled:opacity-50"
            >
              {deleteAutoGenLoading ? "Deleting..." : "Delete"}
            </button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <ManualAddDialog
        open={showManualAdd}
        onOpenChange={setShowManualAdd}
        manualAddForm={manualAddForm}
        setManualAddForm={setManualAddForm}
        manualAddMappingId={manualAddMappingId}
        setManualAddMappingId={setManualAddMappingId}
        mappings={mappings}
        manualAddLineItems={manualAddLineItems}
        setManualAddLineItems={setManualAddLineItems}
        manualAddError={manualAddError}
        manualAddSaving={manualAddSaving}
        getCategoryName={getCategoryName}
        handleManualAdd={handleManualAdd}
      />

      <PaystubDetailDialog
        viewingPaystub={viewingPaystub}
        onClose={() => {
          setViewingPaystub(null);
          setEditingPaystub(false);
          setEditLineItems([]);
        }}
        editingPaystub={editingPaystub}
        editLineItems={editLineItems}
        editSaving={editSaving}
        getCategoryName={getCategoryName}
        handleEditLineItemAmount={handleEditLineItemAmount}
        handleStartEdit={handleStartEdit}
        handleCancelEdit={handleCancelEdit}
        handleSaveEdit={handleSaveEdit}
        handleDownloadPaystubJson={handleDownloadPaystubJson}
      />

      {/* ── Delete Paystub Confirmation ── */}
      <AlertDialog open={!!deletePaystub} onOpenChange={(open) => !open && setDeletePaystub(null)}>
        <AlertDialogContent className="max-w-sm">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Paystub</AlertDialogTitle>
            <AlertDialogDescription>
              Delete the paystub from {deletePaystub ? formatDate(deletePaystub.checkDate) : ''}?
              This will also remove any transactions created from this paystub.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <button
              onClick={handleDeletePaystub}
              disabled={deleteLoading}
              className="inline-flex h-9 items-center justify-center rounded-lg bg-destructive px-4 py-2 text-sm font-semibold text-destructive-foreground hover:opacity-90 transition-opacity disabled:opacity-50"
            >
              {deleteLoading ? 'Deleting...' : 'Delete'}
            </button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── Delete Mapping Confirmation ── */}
      <AlertDialog open={!!deleteMapping} onOpenChange={(open) => !open && setDeleteMapping(null)}>
        <AlertDialogContent className="max-w-sm">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Mapping</AlertDialogTitle>
            <AlertDialogDescription>
              Delete the field mapping &quot;{deleteMapping?.name}&quot;?
              This will not delete any imported paystubs.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <button
              onClick={handleDeleteMapping}
              disabled={deleteMappingLoading}
              className="inline-flex h-9 items-center justify-center rounded-lg bg-destructive px-4 py-2 text-sm font-semibold text-destructive-foreground hover:opacity-90 transition-opacity disabled:opacity-50"
            >
              {deleteMappingLoading ? 'Deleting...' : 'Delete'}
            </button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── Delete All Paystubs Confirmation ── */}
      <AlertDialog open={showDeleteAllConfirm} onOpenChange={(open) => !open && setShowDeleteAllConfirm(false)}>
        <AlertDialogContent className="max-w-sm">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete All Paystubs</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete all {paystubFilter === 'all' ? '' : `${paystubFilter} `}paystubs on file?
              This will also permanently delete all transactions created from these paystubs. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <button
              onClick={handleDeleteAllPaystubs}
              disabled={deleteAllLoading}
              className="inline-flex h-9 items-center justify-center rounded-lg bg-destructive px-4 py-2 text-sm font-semibold text-destructive-foreground hover:opacity-90 transition-opacity disabled:opacity-50"
            >
              {deleteAllLoading ? 'Deleting...' : 'Delete All'}
            </button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
